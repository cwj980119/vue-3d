import { describe, expect, test } from 'vitest';

import { isPanelVisible } from './viewMode';

describe('isPanelVisible', () => {
  test('shows only the 3D panel in 3D mode', () => {
    expect(isPanelVisible('3d', '3d')).toBe(true);
    expect(isPanelVisible('3d', '2d')).toBe(false);
  });

  test('shows only the 2D panel in 2D mode', () => {
    expect(isPanelVisible('2d', '2d')).toBe(true);
    expect(isPanelVisible('2d', '3d')).toBe(false);
  });
});
