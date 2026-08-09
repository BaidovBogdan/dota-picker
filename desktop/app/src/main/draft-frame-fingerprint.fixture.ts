import type { NativeImage } from 'electron';

const groupStarts = [0.108, 0.568] as const;
const groupWidth = 0.324;

function sampleImage(token: number, width = 9, height = 8): NativeImage {
  const image = {
    getSize: () => ({ width, height }),
    crop: () => image,
    resize: (options: { width: number; height: number }) => (
      sampleImage(token, options.width, options.height)
    ),
    toBitmap: () => {
      const pixels = Buffer.alloc(width * height * 4);
      let value = token * 2_654_435_761;
      for (let index = 0; index < width * height; index += 1) {
        value = (value * 1_664_525 + 1_013_904_223) >>> 0;
        const offset = index * 4;
        const empty = token === 0;
        pixels[offset] = empty ? 18 : (value >>> 16) & 255;
        pixels[offset + 1] = empty ? 18 : (value >>> 8) & 255;
        pixels[offset + 2] = empty ? 18 : value & 255;
        pixels[offset + 3] = 255;
      }
      return pixels;
    },
    toPNG: () => Buffer.from(`slot-${token}`),
    isEmpty: () => false,
  };
  return image as unknown as NativeImage;
}

export function draftImage(slots: readonly number[]): NativeImage {
  const size = { width: 1_000, height: 600 };
  const image = {
    getSize: () => size,
    crop: (rectangle: { x: number; width: number }) => {
      const center = (rectangle.x + rectangle.width / 2) / size.width;
      let matchedSlot = -1;
      for (const [groupIndex, start] of groupStarts.entries()) {
        if (center < start || center >= start + groupWidth) continue;
        matchedSlot = groupIndex * 5 + Math.min(
          4,
          Math.floor(((center - start) / groupWidth) * 5),
        );
      }
      return sampleImage(slots[matchedSlot] ?? 0);
    },
    resize: () => image,
    toBitmap: () => Buffer.alloc(9 * 8 * 4, 18),
    toPNG: () => Buffer.from(`draft-${slots.join('-')}`),
    isEmpty: () => false,
  };
  return image as unknown as NativeImage;
}
