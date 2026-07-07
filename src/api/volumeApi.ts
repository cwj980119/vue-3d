export type VolumeAxis = 'x' | 'y' | 'z';

export interface IntensityConfig {
  value: number;
  range?: [number, number];
  label: string;
  defaultOpacity: number;
}

export interface VolumeMeta {
  shape: [number, number, number];
  dtype: 'uint8';
  voxelSpacing: [number, number, number];
  axisOrder: VolumeAxis[];
  source?: {
    kind: 'synthetic' | 'tiff';
    uuid?: string;
  };
  intensities: IntensityConfig[];
  recommendedDownsampleFactors: number[];
}

export interface BinaryPayload {
  shape: number[];
  data: Uint8Array;
}

export interface VolumeRequestOptions {
  volumeUuid?: string;
}

export function joinApiPath(apiBaseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!apiBaseUrl) {
    return normalizedPath;
  }
  return `${apiBaseUrl.replace(/\/$/, '')}${normalizedPath}`;
}

export function volumeEndpointPath(path: string, options: VolumeRequestOptions = {}): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!options.volumeUuid) {
    return `/api/volume${normalizedPath}`;
  }
  return `/api/volumes/${encodeURIComponent(options.volumeUuid)}${normalizedPath}`;
}

export function parseShapeHeader(value: string | null): number[] {
  if (!value) {
    throw new Error('Missing X-Volume-Shape response header');
  }

  const shape = value.split(',').map((part) => Number.parseInt(part.trim(), 10));
  if (shape.some((dimension) => !Number.isFinite(dimension) || dimension <= 0)) {
    throw new Error(`Invalid X-Volume-Shape response header: ${value}`);
  }
  return shape;
}

export async function fetchVolumeMeta(
  apiBaseUrl = '',
  options: VolumeRequestOptions = {},
): Promise<VolumeMeta> {
  const response = await fetch(joinApiPath(apiBaseUrl, volumeEndpointPath('/meta', options)));
  if (!response.ok) {
    throw new Error(`Failed to fetch volume metadata: ${response.status}`);
  }
  return (await response.json()) as VolumeMeta;
}

export async function fetchBinaryPayload(url: string): Promise<BinaryPayload> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch binary payload: ${response.status}`);
  }

  const shape = parseShapeHeader(response.headers.get('X-Volume-Shape'));
  const buffer = await response.arrayBuffer();
  return {
    shape,
    data: new Uint8Array(buffer),
  };
}

export function fetchSlicePayload(
  apiBaseUrl: string,
  axis: VolumeAxis,
  index: number,
  options: VolumeRequestOptions = {},
): Promise<BinaryPayload> {
  const params = new URLSearchParams({ axis, index: String(index) });
  return fetchBinaryPayload(
    joinApiPath(apiBaseUrl, `${volumeEndpointPath('/slice', options)}?${params.toString()}`),
  );
}

export function fetchDownsampledVolume(
  apiBaseUrl: string,
  factor: number,
  options: VolumeRequestOptions = {},
): Promise<BinaryPayload> {
  const params = new URLSearchParams({ factor: String(factor) });
  return fetchBinaryPayload(
    joinApiPath(apiBaseUrl, `${volumeEndpointPath('/downsampled', options)}?${params.toString()}`),
  );
}

export function createSliceImageData(values: Uint8Array, width: number, height: number): ImageData {
  if (values.length !== width * height) {
    throw new Error(`Slice has ${values.length} voxels but expected ${width * height}`);
  }

  const labelPalette: Record<number, [number, number, number]> = {
    0: [0, 0, 0],
    1: [138, 158, 191],
    2: [255, 235, 122],
  };
  const fallbackPalette: Array<[number, number, number]> = [
    [103, 232, 249],
    [251, 113, 133],
    [52, 211, 153],
    [192, 132, 252],
    [245, 158, 11],
    [96, 165, 250],
  ];
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    const color =
      labelPalette[value] ?? fallbackPalette[Math.abs(value - 3) % fallbackPalette.length]!;
    const offset = index * 4;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
    rgba[offset + 3] = 255;
  }
  if (typeof ImageData !== 'undefined') {
    return new ImageData(rgba, width, height);
  }

  return { data: rgba, width, height, colorSpace: 'srgb' } as ImageData;
}
