import { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';
import { describe, expect, test } from 'vitest';

import * as volumeRendering from './volumeRendering';
import {
  getVolumeRenderingBlendMode,
  getVolumeRenderingLabel,
  getVolumeLightingConfig,
  getLabelLayerRenderOpacity,
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
    expect(getVolumeRenderingBlendMode('solid-labels')).toBe(BlendMode.COMPOSITE_BLEND);
  });

  test('exposes concise labels and shading defaults for the UI', () => {
    expect(VOLUME_RENDERING_OPTIONS.map((option) => option.value)).toEqual([
      'translucent',
      'mip',
      'minip',
      'average',
      'additive',
      'solid-labels',
    ]);
    expect(getVolumeRenderingLabel('mip')).toBe('MIP');
    expect(getVolumeRenderingLabel('solid-labels')).toBe('Solid Labels');
    expect(isShadedVolumeRendering('translucent')).toBe(true);
    expect(isShadedVolumeRendering('mip')).toBe(false);
    expect(isShadedVolumeRendering('solid-labels')).toBe(false);
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

  test('uses flat lighting for solid label rendering', () => {
    expect(getVolumeLightingConfig('translucent')).toEqual({
      shade: true,
      ambient: 0.42,
      diffuse: 0.7,
      specular: 0.18,
      specularPower: 8,
    });

    expect(getVolumeLightingConfig('solid-labels')).toEqual({
      shade: false,
      ambient: 1,
      diffuse: 0,
      specular: 0,
      specularPower: 1,
    });
  });

  test('renders visible solid labels as opaque while preserving volume opacity', () => {
    expect(
      getLabelLayerRenderOpacity({
        mode: 'translucent',
        layerVisible: true,
        layerOpacity: 0.38,
        volumeOpacity: 1,
      }),
    ).toBe(0.38);
    expect(
      getLabelLayerRenderOpacity({
        mode: 'solid-labels',
        layerVisible: true,
        layerOpacity: 0.38,
        volumeOpacity: 1,
      }),
    ).toBe(1);
    expect(
      getLabelLayerRenderOpacity({
        mode: 'solid-labels',
        layerVisible: true,
        layerOpacity: 0.38,
        volumeOpacity: 0.5,
      }),
    ).toBe(0.5);
    expect(
      getLabelLayerRenderOpacity({
        mode: 'solid-labels',
        layerVisible: false,
        layerOpacity: 1,
        volumeOpacity: 1,
      }),
    ).toBe(0);
  });

  test('configures discrete label volumes to sample exact voxel values', () => {
    const renderingPolicy = volumeRendering as unknown as {
      applyDiscreteLabelVolumeInterpolation?: (property: {
        setInterpolationTypeToNearest: () => void;
        setInterpolationTypeToFastLinear: () => void;
      }) => void;
    };
    expect(typeof renderingPolicy.applyDiscreteLabelVolumeInterpolation).toBe('function');

    let nearestCalls = 0;
    let fastLinearCalls = 0;

    renderingPolicy.applyDiscreteLabelVolumeInterpolation!({
      setInterpolationTypeToNearest: () => {
        nearestCalls += 1;
      },
      setInterpolationTypeToFastLinear: () => {
        fastLinearCalls += 1;
      },
    });

    expect(nearestCalls).toBe(1);
    expect(fastLinearCalls).toBe(0);
  });
});
