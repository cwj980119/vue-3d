import { describe, expect, test } from 'vitest';

import { getCameraViewPreset } from './cameraViews';

describe('camera view presets', () => {
  test('places the X view camera on the positive X side of the volume', () => {
    const preset = getCameraViewPreset('x', [500, 500, 1000]);

    expect(preset.focalPoint).toEqual([500, 250, 250]);
    expect(preset.position[0]).toBeGreaterThan(preset.focalPoint[0]);
    expect(preset.position[1]).toBe(preset.focalPoint[1]);
    expect(preset.position[2]).toBe(preset.focalPoint[2]);
    expect(preset.viewUp).toEqual([0, 0, 1]);
  });

  test('places the Z view camera above the stacked layers', () => {
    const preset = getCameraViewPreset('z', [500, 500, 1000]);

    expect(preset.focalPoint).toEqual([500, 250, 250]);
    expect(preset.position[0]).toBe(preset.focalPoint[0]);
    expect(preset.position[1]).toBe(preset.focalPoint[1]);
    expect(preset.position[2]).toBeGreaterThan(preset.focalPoint[2]);
    expect(preset.viewUp).toEqual([0, 1, 0]);
  });

  test('uses an oblique position for the isometric view', () => {
    const preset = getCameraViewPreset('iso', [500, 500, 1000]);

    expect(preset.position[0]).toBeGreaterThan(preset.focalPoint[0]);
    expect(preset.position[1]).toBeLessThan(preset.focalPoint[1]);
    expect(preset.position[2]).toBeGreaterThan(preset.focalPoint[2]);
  });
});
