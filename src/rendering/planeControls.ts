import type { VolumeAxis } from '@/api/volumeApi';
import type { Vector3, VolumeShapeZYX } from './cameraViews';

export type PlaneRenderMode = 'stack' | 'plane';

export interface PlaneClipPlaneConfig {
  origin: Vector3;
  normal: Vector3;
}

export function isPlaneOnlyControlEnabled(mode: PlaneRenderMode): boolean {
  return mode === 'plane';
}

export function getRenderAxis(_mode: PlaneRenderMode, planeAxis: VolumeAxis): VolumeAxis {
  return planeAxis;
}

export function getPlaneNormal(axis: VolumeAxis): Vector3 {
  if (axis === 'x') {
    return [-1, 0, 0];
  }
  if (axis === 'y') {
    return [0, -1, 0];
  }
  return [0, 0, -1];
}

export function getPlaneAxisMax(shape: VolumeShapeZYX, axis: VolumeAxis): number {
  const [zSize, ySize, xSize] = shape;
  if (axis === 'x') {
    return Math.max(0, xSize - 1);
  }
  if (axis === 'y') {
    return Math.max(0, ySize - 1);
  }
  return Math.max(0, zSize - 1);
}

export function clampPlanePosition(
  position: number,
  shape: VolumeShapeZYX,
  axis: VolumeAxis,
): number {
  return Math.min(Math.max(Math.round(position), 0), getPlaneAxisMax(shape, axis));
}

export function formatPlanePosition(axis: VolumeAxis, position: number, maxPosition: number): string {
  return `${axis.toUpperCase()} ${position} / ${maxPosition}`;
}

export function getPlaneClipPlaneConfig(
  axis: VolumeAxis,
  position: number,
  downsampleFactor: number,
): PlaneClipPlaneConfig {
  const halfVoxelPadding = Math.max(1, downsampleFactor) * 0.5;
  const origin: Vector3 = [0, 0, 0];

  if (axis === 'x') {
    origin[0] = position + halfVoxelPadding;
  } else if (axis === 'y') {
    origin[1] = position + halfVoxelPadding;
  } else {
    origin[2] = position + halfVoxelPadding;
  }

  return {
    origin,
    normal: getPlaneNormal(axis),
  };
}

function getPositivePlaneNormal(axis: VolumeAxis): Vector3 {
  if (axis === 'x') {
    return [1, 0, 0];
  }
  if (axis === 'y') {
    return [0, 1, 0];
  }
  return [0, 0, 1];
}

function setAxisCoordinate(origin: Vector3, axis: VolumeAxis, value: number): Vector3 {
  if (axis === 'x') {
    origin[0] = value;
  } else if (axis === 'y') {
    origin[1] = value;
  } else {
    origin[2] = value;
  }
  return origin;
}

export function getPlaneSlabClipPlaneConfigs(
  axis: VolumeAxis,
  position: number,
  thickness: number,
  downsampleFactor: number,
): [PlaneClipPlaneConfig, PlaneClipPlaneConfig] {
  const halfVoxelPadding = Math.max(1, downsampleFactor) * 0.5;
  const halfThickness = Math.max(1, Math.round(thickness)) / 2;
  const upperOrigin = setAxisCoordinate(
    [0, 0, 0],
    axis,
    Math.round(position + halfThickness + halfVoxelPadding),
  );
  const lowerOrigin = setAxisCoordinate(
    [0, 0, 0],
    axis,
    Math.round(Math.max(0, position - halfThickness)),
  );

  return [
    {
      origin: upperOrigin,
      normal: getPlaneNormal(axis),
    },
    {
      origin: lowerOrigin,
      normal: getPositivePlaneNormal(axis),
    },
  ];
}
