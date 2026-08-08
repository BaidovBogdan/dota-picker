export const portraitFeatureWidth = 24;
export const portraitFeatureHeight = 10;
export const portraitFeatureLength = portraitFeatureWidth * portraitFeatureHeight;
export const portraitSlotWidth = 116;
export const portraitSlotHeight = 75;
export const portraitQueryWidth = 78;
export const portraitQueryHeight = 32;
export const portraitCoarseTemplatesPerHero = 18;
export const portraitDetailedHeroPoolSize = 16;

const gaussianKernel = new Float32Array([
  0.001285,
  0.014609,
  0.082907,
  0.234954,
  0.33249,
  0.234954,
  0.082907,
  0.014609,
  0.001285,
]);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function grayAt(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
  x: number,
  y: number,
) {
  const boundedX = clamp(x, 0, width - 1);
  const boundedY = clamp(y, 0, height - 1);
  const offset = (boundedY * width + boundedX) * channels;
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? red;
  const blue = data[offset + 2] ?? red;
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

export function resizeImageRegionToGray(
  data: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  channels: number,
  left: number,
  top: number,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
) {
  const output = new Float32Array(targetWidth * targetHeight);
  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = top + (targetY + 0.5) * scaleY - 0.5;
    const y0 = Math.floor(sourceY);
    const y1 = y0 + 1;
    const weightY = sourceY - y0;
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = left + (targetX + 0.5) * scaleX - 0.5;
      const x0 = Math.floor(sourceX);
      const x1 = x0 + 1;
      const weightX = sourceX - x0;
      const topValue = grayAt(data, sourceWidth, sourceHeight, channels, x0, y0)
        * (1 - weightX)
        + grayAt(data, sourceWidth, sourceHeight, channels, x1, y0) * weightX;
      const bottomValue = grayAt(data, sourceWidth, sourceHeight, channels, x0, y1)
        * (1 - weightX)
        + grayAt(data, sourceWidth, sourceHeight, channels, x1, y1) * weightX;
      output[targetY * targetWidth + targetX] = topValue * (1 - weightY)
        + bottomValue * weightY;
    }
  }

  return output;
}

function blurGray(data: Float32Array, width: number, height: number) {
  const radius = Math.floor(gaussianKernel.length / 2);
  const horizontal = new Float32Array(data.length);
  const output = new Float32Array(data.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        value += (data[y * width + clamp(x + offset, 0, width - 1)] ?? 0)
          * (gaussianKernel[offset + radius] ?? 0);
      }
      horizontal[y * width + x] = value;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        value += (horizontal[clamp(y + offset, 0, height - 1) * width + x] ?? 0)
          * (gaussianKernel[offset + radius] ?? 0);
      }
      output[y * width + x] = value;
    }
  }

  return output;
}

function resizeGray(
  data: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const output = new Float32Array(targetWidth * targetHeight);
  const scaleX = sourceWidth / targetWidth;
  const scaleY = sourceHeight / targetHeight;

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = (targetY + 0.5) * scaleY - 0.5;
    const y0 = clamp(Math.floor(sourceY), 0, sourceHeight - 1);
    const y1 = clamp(y0 + 1, 0, sourceHeight - 1);
    const weightY = clamp(sourceY - Math.floor(sourceY), 0, 1);
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = (targetX + 0.5) * scaleX - 0.5;
      const x0 = clamp(Math.floor(sourceX), 0, sourceWidth - 1);
      const x1 = clamp(x0 + 1, 0, sourceWidth - 1);
      const weightX = clamp(sourceX - Math.floor(sourceX), 0, 1);
      const topValue = (data[y0 * sourceWidth + x0] ?? 0) * (1 - weightX)
        + (data[y0 * sourceWidth + x1] ?? 0) * weightX;
      const bottomValue = (data[y1 * sourceWidth + x0] ?? 0) * (1 - weightX)
        + (data[y1 * sourceWidth + x1] ?? 0) * weightX;
      output[targetY * targetWidth + targetX] = topValue * (1 - weightY)
        + bottomValue * weightY;
    }
  }

  return output;
}

export function normalizedPortraitFeature(
  data: Float32Array,
  width: number,
  height: number,
) {
  const blurred = blurGray(data, width, height);
  const resized = resizeGray(
    blurred,
    width,
    height,
    portraitFeatureWidth,
    portraitFeatureHeight,
  );
  let mean = 0;
  for (const value of resized) mean += value;
  mean /= resized.length;
  let normSquared = 0;
  for (const value of resized) {
    const centered = value - mean;
    normSquared += centered * centered;
  }
  const norm = Math.sqrt(normSquared);
  const output = new Int8Array(portraitFeatureLength);
  if (norm <= 1e-6) return output;
  for (let index = 0; index < resized.length; index += 1) {
    output[index] = Math.round(((resized[index] ?? mean) - mean) / norm * 127);
  }
  return output;
}

export function extractGrayRegion(
  data: Float32Array,
  sourceWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const output = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = (top + y) * sourceWidth + left;
    output.set(data.subarray(sourceStart, sourceStart + width), y * width);
  }
  return output;
}

export function grayStandardDeviation(
  data: Float32Array,
  width: number,
  left: number,
  top: number,
  regionWidth: number,
  regionHeight: number,
) {
  let sum = 0;
  let count = 0;
  for (let y = top; y < top + regionHeight; y += 1) {
    for (let x = left; x < left + regionWidth; x += 1) {
      sum += data[y * width + x] ?? 0;
      count += 1;
    }
  }
  const mean = sum / Math.max(1, count);
  let variance = 0;
  for (let y = top; y < top + regionHeight; y += 1) {
    for (let x = left; x < left + regionWidth; x += 1) {
      const difference = (data[y * width + x] ?? mean) - mean;
      variance += difference * difference;
    }
  }
  return Math.sqrt(variance / Math.max(1, count));
}

export function featureNorm(feature: Int8Array) {
  let normSquared = 0;
  for (const value of feature) normSquared += value * value;
  return Math.sqrt(normSquared);
}
