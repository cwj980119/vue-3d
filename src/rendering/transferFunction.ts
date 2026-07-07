import { normalizeIntensityRange, type IntensityRange } from '@/components/napariLayers';

export type IntensityOpacityMap = Record<0 | 1 | 2, number>;

export interface IntensityRangeTransferLayer {
  color: string;
  opacity: number;
  range: IntensityRange;
}

export interface TransferFunctionConfig {
  backgroundOpacity: number;
  layers: IntensityRangeTransferLayer[];
}

export interface TransferControlPoints {
  colors: Array<[number, number, number, number]>;
  opacity: Array<[number, number]>;
}

function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundUnit(value: number): number {
  return Number(value.toFixed(4));
}

function roundOpacity(value: number): number {
  return Number(value.toFixed(4));
}

export function hexToRgbUnit(color: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) {
    return [1, 1, 1];
  }

  const hex = match[1]!;
  return [
    roundUnit(Number.parseInt(hex.slice(0, 2), 16) / 255),
    roundUnit(Number.parseInt(hex.slice(2, 4), 16) / 255),
    roundUnit(Number.parseInt(hex.slice(4, 6), 16) / 255),
  ];
}

export function buildTransferControlPoints(
  config: TransferFunctionConfig,
): TransferControlPoints {
  const backgroundOpacity = clampOpacity(config.backgroundOpacity);
  const layers = config.layers
    .map((layer) => ({
      ...layer,
      opacity: clampOpacity(layer.opacity),
      range: normalizeIntensityRange(layer.range[0], layer.range[1]),
    }))
    .sort((left, right) => left.range[0] - right.range[0]);
  const valleyOpacity = Math.min(0.02, ...layers.map((layer) => layer.opacity));

  const colors: TransferControlPoints['colors'] = [[0, 0, 0, 0]];
  const opacity: TransferControlPoints['opacity'] = [[0, backgroundOpacity]];

  layers.forEach((layer) => {
    const [min, max] = layer.range;
    const mid = Math.round((min + max) / 2);
    const [red, green, blue] = hexToRgbUnit(layer.color);

    if (min > 0) {
      opacity.push([min - 1, valleyOpacity]);
    }
    if (min === max) {
      if (min > 0) {
        opacity.pop();
        opacity.push([min - 0.5, valleyOpacity]);
      } else if (opacity[opacity.length - 1]?.[0] === 0) {
        opacity.pop();
      }
      opacity.push([min, layer.opacity]);
      opacity.push([max + 0.5, valleyOpacity]);
      colors.push([min, red, green, blue]);
      return;
    }

    opacity.push([min, roundOpacity(layer.opacity * 0.3)]);
    opacity.push([mid, layer.opacity]);
    opacity.push([max, roundOpacity(layer.opacity * 0.65)]);
    if (max < 255) {
      opacity.push([max + 1, valleyOpacity]);
    }

    colors.push([min, red, green, blue]);
    colors.push([mid, red, green, blue]);
    colors.push([max, red, green, blue]);
  });

  return {
    colors,
    opacity: opacity.filter((point, index, points) => {
      const previous = points[index - 1];
      return !previous || previous[0] !== point[0] || previous[1] !== point[1];
    }),
  };
}
