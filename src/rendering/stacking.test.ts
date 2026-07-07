import { describe, expect, test } from 'vitest';

import {
  clampStackIndex,
  getNextSlicePlaybackIndex,
  getNextPlaybackStackIndex,
  getStackClipPlaneConfig,
} from './stacking';

describe('stacking helpers', () => {
  test('clamps stack index into the available z range', () => {
    expect(clampStackIndex(-12, 999)).toBe(0);
    expect(clampStackIndex(440, 999)).toBe(440);
    expect(clampStackIndex(1400, 999)).toBe(999);
  });

  test('creates a clipping plane that hides voxels above the selected z layer', () => {
    expect(getStackClipPlaneConfig(80, 4)).toEqual({
      origin: [0, 0, 82],
      normal: [0, 0, -1],
    });
  });

  test('advances playback and reports when the full stack has been reached', () => {
    expect(getNextPlaybackStackIndex(10, 40, 12)).toEqual({
      index: 22,
      reachedEnd: false,
    });
    expect(getNextPlaybackStackIndex(34, 40, 12)).toEqual({
      index: 40,
      reachedEnd: true,
    });
  });

  test('advances 2D slice playback one layer at a time', () => {
    expect(getNextSlicePlaybackIndex(8, 10)).toEqual({
      index: 9,
      reachedEnd: false,
    });
    expect(getNextSlicePlaybackIndex(10, 10)).toEqual({
      index: 10,
      reachedEnd: true,
    });
  });
});
