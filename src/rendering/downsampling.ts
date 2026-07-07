export interface DownsampleOption {
  value: number;
  label: string;
}

export const DEFAULT_DOWNSAMPLE_FACTOR = 1;

export const DOWNSAMPLE_OPTIONS: DownsampleOption[] = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 4, label: '4x' },
  { value: 5, label: '5x' },
  { value: 10, label: '10x' },
];
