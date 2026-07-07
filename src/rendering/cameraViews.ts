export type CameraViewAxis = 'x' | 'y' | 'z' | 'iso';
export type VolumeShapeZYX = [number, number, number];
export type Vector3 = [number, number, number];

export interface CameraViewPreset {
  focalPoint: Vector3;
  position: Vector3;
  viewUp: Vector3;
}

const VIEW_DIRECTIONS: Record<CameraViewAxis, Vector3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
  iso: [1, -1, 0.8],
};

const VIEW_UPS: Record<CameraViewAxis, Vector3> = {
  x: [0, 0, 1],
  y: [0, 0, 1],
  z: [0, 1, 0],
  iso: [0, 0, 1],
};

function normalize([x, y, z]: Vector3): Vector3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

export function getCameraViewPreset(
  view: CameraViewAxis,
  shape: VolumeShapeZYX,
): CameraViewPreset {
  const [zSize, ySize, xSize] = shape;
  const focalPoint: Vector3 = [xSize / 2, ySize / 2, zSize / 2];
  const distance = Math.max(xSize, ySize, zSize) * 2.2;
  const direction = normalize(VIEW_DIRECTIONS[view]);

  return {
    focalPoint,
    position: [
      focalPoint[0] + direction[0] * distance,
      focalPoint[1] + direction[1] * distance,
      focalPoint[2] + direction[2] * distance,
    ],
    viewUp: VIEW_UPS[view],
  };
}
