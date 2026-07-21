import { createApp } from 'vue';
import { afterEach, describe, expect, test, vi } from 'vitest';

import App from './App.vue';

vi.mock('./components/VolumeViewer.vue', () => ({
  default: {
    template: '<div />',
  },
}));

describe('App upload toolbar', () => {
  let root: HTMLDivElement | null = null;

  afterEach(() => {
    root?.remove();
    root = null;
  });

  test('pins the toolbar width so upload status text cannot move the button off screen', () => {
    root = document.createElement('div');
    document.body.appendChild(root);
    const app = createApp(App);

    app.mount(root);

    const uploadInput = root.querySelector<HTMLInputElement>('input[type="file"]');
    const toolbar = uploadInput?.closest('div');

    expect(toolbar?.classList.contains('inset-x-3')).toBe(true);
    expect(toolbar?.classList.contains('overflow-hidden')).toBe(true);

    app.unmount();
  });
});
