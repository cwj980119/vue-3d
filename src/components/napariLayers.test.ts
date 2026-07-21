import { describe, expect, test } from 'vitest';

import {
  canRemoveLayer,
  createDefaultIntensityLayer,
  createDefaultLayerSettings,
  createDefaultNapariLayers,
  createNapariLayersFromIntensities,
  formatIntensityRange,
  formatLayerOpacity,
  getLayerDeleteConfirmationMessage,
  getVisibleLayerCount,
  keepOnlyVolumeLayer,
  normalizeIntensityRange,
  removeNapariLayer,
} from './napariLayers';

describe('napari layer helpers', () => {
  test('creates editable napari-like layer rows for the electrode sample', () => {
    const layers = createDefaultNapariLayers();

    expect(layers.map((layer) => layer.id)).toEqual([
      'volume',
      'label-0',
      'large-particle',
      'small-particle',
    ]);
    expect(layers[0]!).toMatchObject({
      id: 'volume',
      name: 'volume',
      type: 'image',
      blending: 'additive',
      visible: true,
      opacity: 1,
      intensityRange: null,
    });
    expect(layers[1]!).toMatchObject({
      id: 'label-0',
      name: 'pore / substrate',
      color: '#000000',
      intensityRange: [0, 0],
      visible: false,
      opacity: 0,
    });
    expect(layers[2]!).toMatchObject({
      id: 'large-particle',
      name: 'large particle',
      color: '#8a9ebf',
      intensityRange: [1, 1],
    });
    expect(layers[3]!).toMatchObject({
      id: 'small-particle',
      name: 'small particle',
      color: '#ffeb7a',
      intensityRange: [2, 2],
    });
  });

  test('creates removable intensity layers after the fixed volume layer', () => {
    const layer = createDefaultIntensityLayer(3);

    expect(layer).toMatchObject({
      id: 'intensity-3',
      name: 'intensity layer 3',
      type: 'labels',
      visible: true,
      opacity: 0.7,
      blending: 'translucent',
      intensityRange: [1, 1],
    });
    expect(canRemoveLayer(layer)).toBe(true);
    expect(canRemoveLayer(createDefaultNapariLayers()[0]!)).toBe(false);
  });

  test('creates label layers from backend metadata values', () => {
    const layers = createNapariLayersFromIntensities([
      { value: 0, range: [0, 0], label: 'pore / substrate', defaultOpacity: 0 },
      { value: 3, range: [3, 3], label: 'binder', defaultOpacity: 0.44 },
      { value: 7, range: [7, 7], label: 'label 7', defaultOpacity: 0.7 },
    ]);

    expect(layers.map((layer) => layer.id)).toEqual(['volume', 'label-0', 'label-3', 'label-7']);
    expect(layers[2]!).toMatchObject({
      name: 'binder',
      opacity: 0.44,
      intensityRange: [3, 3],
    });
    expect(layers[3]!).toMatchObject({
      name: 'label 7',
      intensityRange: [7, 7],
    });
  });

  test('removes intensity layers but keeps the fixed volume layer', () => {
    const layers = createDefaultNapariLayers();

    expect(removeNapariLayer(layers, 'large-particle').map((layer) => layer.id)).toEqual([
      'volume',
      'label-0',
      'small-particle',
    ]);
    expect(removeNapariLayer(layers, 'volume').map((layer) => layer.id)).toEqual([
      'volume',
      'label-0',
      'large-particle',
      'small-particle',
    ]);
  });

  test('removes every layer except the existing volume layer', () => {
    const layers = createDefaultNapariLayers();
    layers[0]!.opacity = 0.45;

    const remainingLayers = keepOnlyVolumeLayer(layers);

    expect(remainingLayers).toHaveLength(1);
    expect(remainingLayers[0]).toBe(layers[0]);
    expect(remainingLayers[0]).toMatchObject({ id: 'volume', opacity: 0.45 });
  });

  test('formats a delete confirmation message for removable layers', () => {
    expect(getLayerDeleteConfirmationMessage(createDefaultNapariLayers()[2]!)).toBe(
      'Delete layer "large particle"?',
    );
  });

  test('counts visible layers and formats opacity as napari-style percentages', () => {
    const layers = createDefaultNapariLayers();
    layers[2]!.opacity = 0;
    layers[3]!.opacity = 0.823;
    layers[2]!.visible = false;

    expect(getVisibleLayerCount(layers)).toBe(2);
    expect(formatLayerOpacity(0.823)).toBe('82%');
    expect(formatLayerOpacity(2)).toBe('100%');
    expect(formatLayerOpacity(-1)).toBe('0%');
  });

  test('normalizes and formats editable intensity ranges', () => {
    expect(normalizeIntensityRange(-10, 300)).toEqual([0, 255]);
    expect(normalizeIntensityRange(180, 90)).toEqual([90, 180]);
    expect(formatIntensityRange([1, 1])).toBe('1');
    expect(formatIntensityRange(null)).toBe('0-2');
  });
});
