export function resolveVolumeUuid(searchParams: URLSearchParams): string | null {
  const volumeUuid = searchParams.get('volumeUuid')?.trim();
  return volumeUuid ? volumeUuid : null;
}
