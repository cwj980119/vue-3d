export type ViewerMode = '2d' | '3d';
export type ViewerPanel = '2d' | '3d';

export function isPanelVisible(mode: ViewerMode, panel: ViewerPanel): boolean {
  return mode === panel;
}
