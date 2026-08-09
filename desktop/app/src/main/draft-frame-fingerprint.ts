import type { NativeImage } from 'electron';

const groupStarts = [0.108, 0.568] as const;
const groupWidth = 0.324;
const slotCount = 5;
const portraitTop = 0;
const portraitHeight = 0.09;
const sampleWidth = 9;
const sampleHeight = 8;

type SlotFingerprint = {
  pixels: Buffer;
  structure: bigint;
};

export type DraftFrameFingerprint = {
  slots: readonly SlotFingerprint[];
};

function luminance(pixels: Buffer, pixelIndex: number): number {
  const offset = pixelIndex * 4;
  return (
    (pixels[offset] ?? 0) * 0.0722
    + (pixels[offset + 1] ?? 0) * 0.7152
    + (pixels[offset + 2] ?? 0) * 0.2126
  );
}

function structureHash(pixels: Buffer): bigint {
  let hash = 0n;
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth - 1; x += 1) {
      const left = luminance(pixels, y * sampleWidth + x);
      const right = luminance(pixels, y * sampleWidth + x + 1);
      hash = (hash << 1n) | (left >= right ? 1n : 0n);
    }
  }
  return hash;
}

function slotFingerprint(
  image: NativeImage,
  groupStart: number,
  slot: number,
): SlotFingerprint {
  const size = image.getSize();
  const normalizedSlotWidth = groupWidth / slotCount;
  const horizontalInset = normalizedSlotWidth * 0.08;
  const x = Math.max(0, Math.round(size.width * (
    groupStart + slot * normalizedSlotWidth + horizontalInset
  )));
  const y = Math.max(0, Math.round(size.height * portraitTop));
  const width = Math.max(1, Math.min(
    size.width - x,
    Math.round(size.width * (normalizedSlotWidth - horizontalInset * 2)),
  ));
  const height = Math.max(1, Math.min(
    size.height - y,
    Math.round(size.height * portraitHeight),
  ));
  const pixels = image.crop({ x, y, width, height }).resize({
    width: sampleWidth,
    height: sampleHeight,
    quality: 'good',
  }).toBitmap();
  return {
    pixels,
    structure: structureHash(pixels),
  };
}

function bitDistance(left: bigint, right: bigint): number {
  let value = left ^ right;
  let distance = 0;
  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

function meanColorDistance(left: Buffer, right: Buffer): number {
  const length = Math.min(left.length, right.length);
  if (length < 4) return left.length === right.length ? 0 : 255;
  let difference = 0;
  let channelCount = 0;
  for (let offset = 0; offset + 2 < length; offset += 4) {
    difference += Math.abs(left[offset] - right[offset]);
    difference += Math.abs(left[offset + 1] - right[offset + 1]);
    difference += Math.abs(left[offset + 2] - right[offset + 2]);
    channelCount += 3;
  }
  return difference / channelCount;
}

function slotChanged(left: SlotFingerprint, right: SlotFingerprint): boolean {
  if (left.pixels.length !== right.pixels.length) return true;
  const colorDistance = meanColorDistance(left.pixels, right.pixels);
  const structuralDistance = bitDistance(left.structure, right.structure);
  return colorDistance >= 22
    || (colorDistance >= 12 && structuralDistance >= 6);
}

export function createDraftFrameFingerprint(image: NativeImage): DraftFrameFingerprint {
  return {
    slots: groupStarts.flatMap((groupStart) => (
      Array.from({ length: slotCount }, (_, slot) => slotFingerprint(image, groupStart, slot))
    )),
  };
}

export function draftFramesMatch(
  left: DraftFrameFingerprint,
  right: DraftFrameFingerprint,
): boolean {
  return left.slots.length === right.slots.length
    && left.slots.every((slot, index) => !slotChanged(slot, right.slots[index]!));
}

export function draftFrameDistance(
  left: DraftFrameFingerprint,
  right: DraftFrameFingerprint,
): number {
  const sharedSlots = Math.min(left.slots.length, right.slots.length);
  let distance = Math.abs(left.slots.length - right.slots.length);
  for (let index = 0; index < sharedSlots; index += 1) {
    if (slotChanged(left.slots[index]!, right.slots[index]!)) distance += 1;
  }
  return distance;
}
