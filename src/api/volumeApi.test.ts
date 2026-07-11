import { describe, expect, test, vi } from 'vitest';

import {
  createSliceImageData,
  fetchBinaryPayload,
  fetchDownsampledVolumeLayers,
  fetchVolumeMeta,
  joinApiPath,
  parseShapeHeader,
  volumeEndpointPath,
} from './volumeApi';

describe('volumeApi helpers', () => {
  test('joinApiPath creates stable absolute endpoint urls', () => {
    expect(joinApiPath('http://localhost:8000/', '/api/volume/meta')).toBe(
      'http://localhost:8000/api/volume/meta',
    );
    expect(joinApiPath('', '/api/volume/meta')).toBe('/api/volume/meta');
  });

  test('volumeEndpointPath switches between synthetic and uuid tiff endpoints', () => {
    expect(volumeEndpointPath('/meta')).toBe('/api/volume/meta');
    expect(volumeEndpointPath('/downsampled', {
      volumeUuid: '11111111-1111-1111-1111-111111111111',
    })).toBe('/api/volumes/11111111-1111-1111-1111-111111111111/downsampled');
  });

  test('parseShapeHeader parses comma separated dimensions', () => {
    expect(parseShapeHeader('125,125,125')).toEqual([125, 125, 125]);
  });

  test('fetchBinaryPayload reads shape header and uint8 body', async () => {
    const body = new Uint8Array([0, 1, 2]).buffer;
    const fetchMock = vi.fn(async () => {
      return new Response(body, {
        headers: { 'X-Volume-Shape': '1,1,3' },
      });
    });
    vi.stubGlobal(
      'fetch',
      fetchMock,
    );

    const payload = await fetchBinaryPayload('http://localhost:8000/api/test');

    expect(payload.shape).toEqual([1, 1, 3]);
    expect([...payload.data]).toEqual([0, 1, 2]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/test', {
      cache: 'no-store',
    });
  });

  test('fetchDownsampledVolumeLayers reports progress on layer boundaries', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6, 7, 8]));
        controller.close();
      },
    });
    const fetchMock = vi.fn(async () => {
      return new Response(body, {
        headers: {
          'X-Volume-Shape': '2,2,2',
          'X-Volume-Layer-Size': '4',
          'X-Volume-Layer-Count': '2',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const starts: number[] = [];
    const progress: Array<{ layerIndex: number; layersLoaded: number; data: number[] }> = [];
    const payload = await fetchDownsampledVolumeLayers(
      'http://localhost:8000',
      2,
      {},
      {
        onStart: (stream) => {
          starts.push(stream.totalLayers);
        },
        onLayer: (layer) => {
          progress.push({
            layerIndex: layer.layerIndex,
            layersLoaded: layer.layersLoaded,
            data: [...layer.data],
          });
        },
      },
    );

    expect(payload.shape).toEqual([2, 2, 2]);
    expect([...payload.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(starts).toEqual([2]);
    expect(progress).toEqual([
      { layerIndex: 0, layersLoaded: 1, data: [1, 2, 3, 4, 0, 0, 0, 0] },
      { layerIndex: 1, layersLoaded: 2, data: [1, 2, 3, 4, 5, 6, 7, 8] },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/volume/downsampled-layers?factor=2',
      { cache: 'no-store', signal: undefined },
    );
  });

  test('fetchVolumeMeta keeps intensity ranges from backend metadata', async () => {
    const fetchMock = vi.fn(async () => {
      return Response.json({
        shape: [500, 500, 1000],
        dtype: 'uint8',
        voxelSpacing: [1, 1, 1],
        axisOrder: ['z', 'y', 'x'],
        intensities: [
          { value: 0, range: [0, 0], label: 'pore / substrate', defaultOpacity: 0 },
          { value: 1, range: [1, 1], label: 'large particle', defaultOpacity: 0.38 },
          { value: 2, range: [2, 2], label: 'small particle', defaultOpacity: 0.82 },
        ],
        recommendedDownsampleFactors: [1, 2, 4, 5, 10],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const meta = await fetchVolumeMeta('http://localhost:8000');

    expect(meta.intensities.map((intensity) => intensity.range)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  test('createSliceImageData maps label voxels into visible rgba pixels', () => {
    const image = createSliceImageData(new Uint8Array([0, 1, 2, 3]), 4, 1);

    expect([...image.data]).toEqual([
      0, 0, 0, 255,
      138, 158, 191, 255,
      255, 235, 122, 255,
      103, 232, 249, 255,
    ]);
  });
});
