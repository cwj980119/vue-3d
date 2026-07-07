import { describe, expect, test } from 'vitest';

import { DEFAULT_SAMPLE_DISTANCE } from './renderingDefaults';

describe('rendering defaults', () => {
  test('uses a ray step large enough for the landscape 500x500x1000 sample', () => {
    expect(DEFAULT_SAMPLE_DISTANCE).toBeGreaterThanOrEqual(1.25);
  });
});
