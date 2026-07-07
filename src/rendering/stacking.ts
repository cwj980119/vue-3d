export interface StackClipPlaneConfig {
  origin: [number, number, number];
  normal: [number, number, number];
}

export interface PlaybackStepResult {
  index: number;
  reachedEnd: boolean;
}

export function clampStackIndex(index: number, maxIndex: number): number {
  return Math.min(Math.max(Math.round(index), 0), Math.max(0, maxIndex));
}

export function getStackClipPlaneConfig(
  stackEndIndex: number,
  downsampleFactor: number,
): StackClipPlaneConfig {
  const halfVoxelPadding = Math.max(1, downsampleFactor) * 0.5;
  return {
    origin: [0, 0, stackEndIndex + halfVoxelPadding],
    normal: [0, 0, -1],
  };
}

export function getNextPlaybackStackIndex(
  currentIndex: number,
  maxIndex: number,
  step: number,
): PlaybackStepResult {
  const index = clampStackIndex(currentIndex + Math.max(1, Math.round(step)), maxIndex);
  return {
    index,
    reachedEnd: index >= maxIndex,
  };
}

export function getNextSlicePlaybackIndex(
  currentIndex: number,
  maxIndex: number,
): PlaybackStepResult {
  const index = clampStackIndex(currentIndex + 1, maxIndex);
  return {
    index,
    reachedEnd: index >= maxIndex,
  };
}
