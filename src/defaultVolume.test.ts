import { describe, expect, test } from 'vitest';

import { DEFAULT_VOLUME_UUID, resolveVolumeUuid } from './defaultVolume';

describe('default volume selection', () => {
  test('uses output as the default local TIFF volume uuid', () => {
    expect(DEFAULT_VOLUME_UUID).toBe('output');
    expect(resolveVolumeUuid(new URLSearchParams())).toBe('output');
  });

  test('keeps query string volume uuid overrides', () => {
    expect(resolveVolumeUuid(new URLSearchParams({ volumeUuid: 'custom-volume' }))).toBe(
      'custom-volume',
    );
  });
});
