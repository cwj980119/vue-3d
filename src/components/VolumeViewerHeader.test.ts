import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

describe('VolumeViewer header', () => {
  test('does not render the napari-web title in the top bar', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/VolumeViewer.vue'), 'utf8');

    expect(source).not.toContain('napari-web');
  });
});
