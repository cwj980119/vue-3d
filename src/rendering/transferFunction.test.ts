import { describe, expect, test } from 'vitest';

import { buildTransferControlPoints, hexToRgbUnit } from './transferFunction';

describe('buildTransferControlPoints', () => {
  test('maps fixed label intensities without duplicate opacity points', () => {
    const points = buildTransferControlPoints({
      backgroundOpacity: 0,
      layers: [
        {
          color: '#8a9ebf',
          opacity: 0.38,
          range: [1, 1],
        },
        {
          color: '#ffeb7a',
          opacity: 0.82,
          range: [2, 2],
        },
      ],
    });

    expect(points.opacity).toEqual([
      [0, 0],
      [0.5, 0.02],
      [1, 0.38],
      [1.5, 0.02],
      [2, 0.82],
      [2.5, 0.02],
    ]);
    expect(points.colors).toEqual([
      [0, 0, 0, 0],
      [1, 0.5412, 0.6196, 0.749],
      [2, 1, 0.9216, 0.4784],
    ]);
  });

  test('maps editable intensity ranges and colors into transfer function points', () => {
    const points = buildTransferControlPoints({
      backgroundOpacity: 0,
      layers: [
        {
          color: '#8a9ebf',
          opacity: 0.25,
          range: [72, 156],
        },
        {
          color: '#ffeb7a',
          opacity: 0.9,
          range: [178, 255],
        },
      ],
    });

    expect(points.opacity).toEqual([
      [0, 0],
      [71, 0.02],
      [72, 0.075],
      [114, 0.25],
      [156, 0.1625],
      [157, 0.02],
      [177, 0.02],
      [178, 0.27],
      [217, 0.9],
      [255, 0.585],
    ]);
    expect(points.colors).toEqual([
      [0, 0, 0, 0],
      [72, 0.5412, 0.6196, 0.749],
      [114, 0.5412, 0.6196, 0.749],
      [156, 0.5412, 0.6196, 0.749],
      [178, 1, 0.9216, 0.4784],
      [217, 1, 0.9216, 0.4784],
      [255, 1, 0.9216, 0.4784],
    ]);
  });

  test('parses hex colors into vtk rgb unit values', () => {
    expect(hexToRgbUnit('#ffeb7a')).toEqual([1, 0.9216, 0.4784]);
    expect(hexToRgbUnit('bad')).toEqual([1, 1, 1]);
  });
});
