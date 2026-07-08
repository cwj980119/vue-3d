import { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';

export type VolumeRenderingMode =
  | 'translucent'
  | 'mip'
  | 'minip'
  | 'average'
  | 'additive'
  | 'solid-labels';

export interface DiscreteLabelVolumeProperty {
  setInterpolationTypeToNearest: () => unknown;
}

export interface VolumeLightingConfig {
  shade: boolean;
  ambient: number;
  diffuse: number;
  specular: number;
  specularPower: number;
}

export interface LabelLayerRenderOpacityConfig {
  mode: VolumeRenderingMode;
  layerVisible: boolean;
  layerOpacity: number;
  volumeOpacity: number;
}

export interface VolumeRenderingOption {
  value: VolumeRenderingMode;
  label: string;
  icon: string;
  description: string;
}

export const VOLUME_RENDERING_OPTIONS: VolumeRenderingOption[] = [
  {
    value: 'translucent',
    label: 'Translucent',
    icon: 'A',
    description: 'Blends voxel colors and opacity along each view ray.',
  },
  {
    value: 'mip',
    label: 'MIP',
    icon: 'MAX',
    description: 'Shows the brightest voxel encountered along each view ray.',
  },
  {
    value: 'minip',
    label: 'MinIP',
    icon: 'MIN',
    description: 'Shows the darkest voxel encountered along each view ray.',
  },
  {
    value: 'average',
    label: 'Average',
    icon: 'AVG',
    description: 'Averages sampled voxel values along each view ray.',
  },
  {
    value: 'additive',
    label: 'Additive',
    icon: 'SUM',
    description: 'Adds sampled voxel values until the rendered color saturates.',
  },
  {
    value: 'solid-labels',
    label: 'Solid Labels',
    icon: 'LBL',
    description: 'Shows labels with flat colors and no lighting variation.',
  },
];

export function getVolumeRenderingBlendMode(mode: VolumeRenderingMode): BlendMode {
  switch (mode) {
    case 'mip':
      return BlendMode.MAXIMUM_INTENSITY_BLEND;
    case 'minip':
      return BlendMode.MINIMUM_INTENSITY_BLEND;
    case 'average':
      return BlendMode.AVERAGE_INTENSITY_BLEND;
    case 'additive':
      return BlendMode.ADDITIVE_INTENSITY_BLEND;
    case 'solid-labels':
    case 'translucent':
    default:
      return BlendMode.COMPOSITE_BLEND;
  }
}

export function getVolumeRenderingLabel(mode: VolumeRenderingMode): string {
  return VOLUME_RENDERING_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

export function isShadedVolumeRendering(mode: VolumeRenderingMode): boolean {
  return mode === 'translucent';
}

export function getVolumeLightingConfig(mode: VolumeRenderingMode): VolumeLightingConfig {
  if (mode === 'solid-labels') {
    return {
      shade: false,
      ambient: 1,
      diffuse: 0,
      specular: 0,
      specularPower: 1,
    };
  }

  return {
    shade: isShadedVolumeRendering(mode),
    ambient: 0.42,
    diffuse: 0.7,
    specular: 0.18,
    specularPower: 8,
  };
}

export function getLabelLayerRenderOpacity({
  mode,
  layerVisible,
  layerOpacity,
  volumeOpacity,
}: LabelLayerRenderOpacityConfig): number {
  if (!layerVisible) {
    return 0;
  }
  if (mode === 'solid-labels') {
    return volumeOpacity;
  }
  return layerOpacity * volumeOpacity;
}

export function applyDiscreteLabelVolumeInterpolation(
  property: DiscreteLabelVolumeProperty,
): void {
  property.setInterpolationTypeToNearest();
}
