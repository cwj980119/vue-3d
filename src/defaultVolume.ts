export const DEFAULT_VOLUME_UUID = 'output';

export function resolveVolumeUuid(searchParams: URLSearchParams): string {
  return searchParams.get('volumeUuid') ?? DEFAULT_VOLUME_UUID;
}
