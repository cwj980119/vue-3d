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

export interface VolumeStreamStart extends BinaryPayload {
  layerSize: number;
  totalLayers: number;
}

export interface VolumeStreamLayer extends VolumeStreamStart {
  bytesLoaded: number;
  layerIndex: number;
  layersLoaded: number;
}

export interface VolumeStreamCallbacks {
  onStart?: (payload: VolumeStreamStart) => void;
  onLayer?: (payload: VolumeStreamLayer) => void;
}

export interface VolumeRequestOptions {
  volumeUuid?: string;
}

export interface VolumeUploadResponse {
  uuid: string;
  meta: VolumeMeta;
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

function parsePositiveIntegerHeader(value: string | null, fallback: number, headerName: string): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${headerName} response header: ${value}`);
  }
  return parsed;
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

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') {
      return body.detail;
    }
  } catch {
    // Fall back to the status code when the backend does not return JSON.
  }
  return response.statusText || String(response.status);
}

export async function uploadVolume(apiBaseUrl: string, file: File): Promise<VolumeUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(joinApiPath(apiBaseUrl, '/api/volumes'), {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`Failed to upload TIFF volume: ${detail}`);
  }

  return (await response.json()) as VolumeUploadResponse;
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

export async function fetchDownsampledVolumeLayers(
  apiBaseUrl: string,
  factor: number,
  options: VolumeRequestOptions = {},
  callbacks: VolumeStreamCallbacks = {},
  signal?: AbortSignal,
): Promise<BinaryPayload> {
  const params = new URLSearchParams({ factor: String(factor) });
  const response = await fetch(
    joinApiPath(apiBaseUrl, `${volumeEndpointPath('/downsampled-layers', options)}?${params.toString()}`),
    { cache: 'no-store', signal },
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch volume layer stream: ${response.status}`);
  }

  const shape = parseShapeHeader(response.headers.get('X-Volume-Shape'));
  if (shape.length !== 3) {
    throw new Error(`Invalid X-Volume-Shape response header: ${shape.join(',')}`);
  }

  const inferredLayerSize = shape[1]! * shape[2]!;
  const inferredTotalLayers = shape[0]!;
  const layerSize = parsePositiveIntegerHeader(
    response.headers.get('X-Volume-Layer-Size'),
    inferredLayerSize,
    'X-Volume-Layer-Size',
  );
  const totalLayers = parsePositiveIntegerHeader(
    response.headers.get('X-Volume-Layer-Count'),
    inferredTotalLayers,
    'X-Volume-Layer-Count',
  );
  const totalBytes = layerSize * totalLayers;
  const data = new Uint8Array(totalBytes);
  callbacks.onStart?.({ shape, data, layerSize, totalLayers });

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    const values = new Uint8Array(buffer);
    if (values.length !== totalBytes) {
      throw new Error(`Volume stream has ${values.length} bytes but expected ${totalBytes}`);
    }
    data.set(values);
    for (let layerIndex = 0; layerIndex < totalLayers; layerIndex += 1) {
      callbacks.onLayer?.({
        shape,
        data,
        layerSize,
        totalLayers,
        bytesLoaded: (layerIndex + 1) * layerSize,
        layerIndex,
        layersLoaded: layerIndex + 1,
      });
    }
    return { shape, data };
  }

  const reader = response.body.getReader();
  let bytesLoaded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      let chunkOffset = 0;
      while (chunkOffset < value.length) {
        const bytesRemaining = totalBytes - bytesLoaded;
        if (bytesRemaining <= 0) {
          throw new Error(`Volume stream exceeded expected ${totalBytes} bytes`);
        }

        const layerBytesLoaded = bytesLoaded % layerSize;
        const bytesUntilLayerBoundary =
          layerBytesLoaded === 0 ? layerSize : layerSize - layerBytesLoaded;
        const bytesToCopy = Math.min(
          value.length - chunkOffset,
          bytesRemaining,
          bytesUntilLayerBoundary,
        );
        data.set(value.subarray(chunkOffset, chunkOffset + bytesToCopy), bytesLoaded);
        bytesLoaded += bytesToCopy;
        chunkOffset += bytesToCopy;

        if (bytesLoaded % layerSize === 0) {
          const layerIndex = bytesLoaded / layerSize - 1;
          callbacks.onLayer?.({
            shape,
            data,
            layerSize,
            totalLayers,
            bytesLoaded: (layerIndex + 1) * layerSize,
            layerIndex,
            layersLoaded: layerIndex + 1,
          });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (bytesLoaded !== totalBytes) {
    throw new Error(`Volume stream has ${bytesLoaded} bytes but expected ${totalBytes}`);
  }

  return { shape, data };
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
