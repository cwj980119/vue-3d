import { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';
import { describe, expect, test } from 'vitest';

import {
  getVolumeRenderingBlendMode,
  getVolumeRenderingLabel,
  isShadedVolumeRendering,
  VOLUME_RENDERING_OPTIONS,
} from './volumeRendering';

describe('volume rendering presets', () => {
  test('maps napari-like rendering modes to vtk volume blend modes', () => {
    expect(getVolumeRenderingBlendMode('translucent')).toBe(BlendMode.COMPOSITE_BLEND);
    expect(getVolumeRenderingBlendMode('mip')).toBe(BlendMode.MAXIMUM_INTENSITY_BLEND);
    expect(getVolumeRenderingBlendMode('minip')).toBe(BlendMode.MINIMUM_INTENSITY_BLEND);
    expect(getVolumeRenderingBlendMode('average')).toBe(BlendMode.AVERAGE_INTENSITY_BLEND);
    expect(getVolumeRenderingBlendMode('additive')).toBe(BlendMode.ADDITIVE_INTENSITY_BLEND);
  });

  test('exposes concise labels and shading defaults for the UI', () => {
    expect(VOLUME_RENDERING_OPTIONS.map((option) => option.value)).toEqual([
      'translucent',
      'mip',
      'minip',
      'average',
      'additive',
    ]);
    expect(getVolumeRenderingLabel('mip')).toBe('MIP');
    expect(isShadedVolumeRendering('translucent')).toBe(true);
    expect(isShadedVolumeRendering('mip')).toBe(false);
  });

  test('includes compact help icons and descriptions for every mode', () => {
    VOLUME_RENDERING_OPTIONS.forEach((option) => {
      expect(option.icon.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(12);
    });
    expect(VOLUME_RENDERING_OPTIONS.find((option) => option.value === 'mip')).toMatchObject({
      icon: 'MAX',
      description: 'Shows the brightest voxel encountered along each view ray.',
    });
  });
});
