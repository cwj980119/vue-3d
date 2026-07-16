import { describe, expect, test } from 'vitest';

import { resolveVolumeUuid } from './defaultVolume';

describe('default volume selection', () => {
  test('does not select a volume when the URL has no volume uuid', () => {
    expect(resolveVolumeUuid(new URLSearchParams())).toBeNull();
  });

  test('keeps query string volume uuid overrides', () => {
    expect(resolveVolumeUuid(new URLSearchParams({ volumeUuid: 'custom-volume' }))).toBe(
      'custom-volume',
    );
  });

  test('ignores blank query string volume uuid values', () => {
    expect(resolveVolumeUuid(new URLSearchParams({ volumeUuid: '   ' }))).toBeNull();
  });
});
