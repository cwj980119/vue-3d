import { describe, expect, test } from 'vitest';

import {
  clampPlanePosition,
  formatPlanePosition,
  getPlaneAxisMax,
  getPlaneClipPlaneConfig,
  getPlaneNormal,
  getPlaneSlabClipPlaneConfigs,
  getRenderAxis,
  isPlaneOnlyControlEnabled,
} from './planeControls';

describe('plane control helpers', () => {
  test('maps napari plane axes to VTK clip plane normals', () => {
    expect(getPlaneNormal('x')).toEqual([-1, 0, 0]);
    expect(getPlaneNormal('y')).toEqual([0, -1, 0]);
    expect(getPlaneNormal('z')).toEqual([0, 0, -1]);
  });

  test('finds plane axis extents from z-y-x volume shape', () => {
    expect(getPlaneAxisMax([500, 600, 1000], 'x')).toBe(999);
    expect(getPlaneAxisMax([500, 600, 1000], 'y')).toBe(599);
    expect(getPlaneAxisMax([500, 600, 1000], 'z')).toBe(499);
  });

  test('clamps and formats plane positions', () => {
    expect(clampPlanePosition(-8, [500, 600, 1000], 'x')).toBe(0);
    expect(clampPlanePosition(1200, [500, 600, 1000], 'x')).toBe(999);
    expect(formatPlanePosition('z', 128, 499)).toBe('Z 128 / 499');
  });

  test('creates a clip plane in VTK x-y-z coordinates for the selected data axis', () => {
    expect(getPlaneClipPlaneConfig('x', 100, 4)).toEqual({
      origin: [102, 0, 0],
      normal: [-1, 0, 0],
    });
    expect(getPlaneClipPlaneConfig('z', 80, 4)).toEqual({
      origin: [0, 0, 82],
      normal: [0, 0, -1],
    });
  });

  test('creates paired clip planes for a thick napari-like plane slab', () => {
    expect(getPlaneSlabClipPlaneConfigs('z', 80, 10, 4)).toEqual([
      {
        origin: [0, 0, 87],
        normal: [0, 0, -1],
      },
      {
        origin: [0, 0, 75],
        normal: [0, 0, 1],
      },
    ]);
  });

  test('enables plane-only controls only for plane rendering mode', () => {
    expect(isPlaneOnlyControlEnabled('plane')).toBe(true);
    expect(isPlaneOnlyControlEnabled('stack')).toBe(false);
  });

  test('uses z as the fixed stack axis and selected axis for plane rendering', () => {
    expect(getRenderAxis('stack', 'x')).toBe('z');
    expect(getRenderAxis('stack', 'y')).toBe('z');
    expect(getRenderAxis('plane', 'x')).toBe('x');
  });
});
