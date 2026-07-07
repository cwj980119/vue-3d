import { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';

export type VolumeRenderingMode = 'translucent' | 'mip' | 'minip' | 'average' | 'additive';

export interface DiscreteLabelVolumeProperty {
  setInterpolationTypeToNearest: () => unknown;
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

export function applyDiscreteLabelVolumeInterpolation(
  property: DiscreteLabelVolumeProperty,
): void {
  property.setInterpolationTypeToNearest();
}
