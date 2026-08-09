type WorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const overlayMargin = 22;
const overlayTopOffset = 142;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function overlayWindowPosition(
  workArea: WorkArea,
  windowSize: { width: number; height: number },
): { x: number; y: number } {
  const rightmostX = workArea.x + Math.max(0, workArea.width - windowSize.width);
  const bottommostY = workArea.y + Math.max(0, workArea.height - windowSize.height);
  return {
    x: clamp(rightmostX - overlayMargin, workArea.x, rightmostX),
    y: clamp(workArea.y + overlayTopOffset, workArea.y, bottommostY),
  };
}
