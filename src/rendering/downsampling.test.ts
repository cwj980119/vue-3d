import { describe, expect, test } from 'vitest';

import { DEFAULT_DOWNSAMPLE_FACTOR, DOWNSAMPLE_OPTIONS } from './downsampling';

describe('downsampling options', () => {
  test('defaults to no downsampling and keeps existing reduced options', () => {
    expect(DEFAULT_DOWNSAMPLE_FACTOR).toBe(1);
    expect(DOWNSAMPLE_OPTIONS.map((option) => option.value)).toEqual([1, 2, 4, 5, 10]);
    expect(DOWNSAMPLE_OPTIONS[0]).toEqual({ value: 1, label: '1x' });
  });
});
