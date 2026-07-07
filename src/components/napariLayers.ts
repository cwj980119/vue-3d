export const VOLUME_LAYER_ID = 'volume';
export const LABEL_VALUE_MAX = 2;
const FALLBACK_LABEL_COLORS = [
  '#8a9ebf',
  '#ffeb7a',
  '#67e8f9',
  '#fb7185',
  '#34d399',
  '#c084fc',
  '#f59e0b',
  '#60a5fa',
];
const KNOWN_LABEL_COLORS: Record<number, string> = {
  0: '#000000',
  1: '#8a9ebf',
  2: '#ffeb7a',
};
const KNOWN_LABEL_IDS: Record<number, string> = {
  1: 'large-particle',
  2: 'small-particle',
};

export type NapariLayerId = string;
export type NapariLayerType = 'image' | 'labels';
export type NapariBlendingMode = 'additive' | 'translucent' | 'opaque';
export type IntensityRange = [number, number];

export interface NapariLayerSettings {
  name: string;
  color: string;
  intensityRange: IntensityRange | null;
}

export interface IntensityMetadata {
  value: number;
  range?: IntensityRange;
  label: string;
  defaultOpacity: number;
}

export type NapariLayerSettingsMap = Record<string, NapariLayerSettings>;

export interface NapariLayerRow {
  id: NapariLayerId;
  name: string;
  type: NapariLayerType;
  visible: boolean;
  opacity: number;
  blending: NapariBlendingMode;
  color: string;
  intensityRange: IntensityRange | null;
  locked: boolean;
}

function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampIntensity(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function normalizeIntensityRange(min: number, max: number): IntensityRange {
  const first = clampIntensity(min);
  const second = clampIntensity(max);
  return first <= second ? [first, second] : [second, first];
}

export function formatIntensityRange(
  range: IntensityRange | null,
  fallbackMax = LABEL_VALUE_MAX,
): string {
  if (!range) {
    return `0-${fallbackMax}`;
  }
  if (range[0] === range[1]) {
    return String(range[0]);
  }
  return `${range[0]}-${range[1]}`;
}

export function formatLayerOpacity(value: number): string {
  return `${Math.round(clampOpacity(value) * 100)}%`;
}

export function getVisibleLayerCount(layers: NapariLayerRow[]): number {
  return layers.filter((layer) => layer.visible).length;
}

export function getLabelColor(value: number): string {
  if (KNOWN_LABEL_COLORS[value]) {
    return KNOWN_LABEL_COLORS[value];
  }
  return FALLBACK_LABEL_COLORS[Math.abs(value - 1) % FALLBACK_LABEL_COLORS.length]!;
}

function createLabelLayer(intensity: IntensityMetadata): NapariLayerRow {
  const value = Math.round(intensity.value);
  const range = intensity.range ?? [value, value];
  return {
    id: KNOWN_LABEL_IDS[value] ?? `label-${value}`,
    name: intensity.label || `label ${value}`,
    type: 'labels',
    visible: intensity.defaultOpacity > 0,
    opacity: clampOpacity(intensity.defaultOpacity),
    blending: 'translucent',
    color: getLabelColor(value),
    intensityRange: normalizeIntensityRange(range[0], range[1]),
    locked: false,
  };
}

export function createDefaultLayerSettings(): NapariLayerSettingsMap {
  return Object.fromEntries(
    createDefaultNapariLayers().map((layer) => [
      layer.id,
      {
        name: layer.name,
        color: layer.color,
        intensityRange: layer.intensityRange,
      },
    ]),
  );
}

export function createNapariLayersFromIntensities(
  intensities: IntensityMetadata[],
): NapariLayerRow[] {
  const labelLayers = intensities
    .filter((intensity) => Number.isFinite(intensity.value))
    .sort((left, right) => left.value - right.value)
    .map(createLabelLayer);

  return [createVolumeLayer(), ...labelLayers];
}

export function createVolumeLayer(): NapariLayerRow {
  return {
    id: VOLUME_LAYER_ID,
    name: 'volume',
    type: 'image',
    visible: true,
    opacity: 1,
    blending: 'additive',
    color: '#c8d6ef',
    intensityRange: null,
    locked: true,
  };
}

export function createDefaultIntensityLayer(index: number): NapariLayerRow {
  return {
    id: `intensity-${index}`,
    name: `intensity layer ${index}`,
    type: 'labels',
    visible: true,
    opacity: 0.7,
    blending: 'translucent',
    color: '#67e8f9',
    intensityRange: [1, 1],
    locked: false,
  };
}

export function createDefaultNapariLayers(): NapariLayerRow[] {
  return createNapariLayersFromIntensities([
    { value: 0, range: [0, 0], label: 'pore / substrate', defaultOpacity: 0 },
    { value: 1, range: [1, 1], label: 'large particle', defaultOpacity: 0.38 },
    { value: 2, range: [2, 2], label: 'small particle', defaultOpacity: 0.82 },
  ]);
}

export function canRemoveLayer(layer: NapariLayerRow): boolean {
  return layer.id !== VOLUME_LAYER_ID && !layer.locked;
}

export function getLayerDeleteConfirmationMessage(layer: NapariLayerRow): string {
  return `Delete layer "${layer.name}"?`;
}

export function removeNapariLayer(
  layers: NapariLayerRow[],
  layerId: NapariLayerId,
): NapariLayerRow[] {
  return layers.filter((layer) => layer.id === VOLUME_LAYER_ID || layer.id !== layerId);
}

export function getNextIntensityLayerIndex(layers: NapariLayerRow[]): number {
  const indices = layers
    .map((layer) => /^intensity-(\d+)$/.exec(layer.id)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));

  return indices.length ? Math.max(...indices) + 1 : 1;
}
