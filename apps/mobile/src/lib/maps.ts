export interface MapsTarget {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type MapsPlatform = 'ios' | 'android' | 'web' | (string & {});

/**
 * Link that opens the store in the platform's maps app:
 * Apple Maps on iOS, the geo: intent on Android, Google Maps on the web.
 */
export function mapsUrl(target: MapsTarget, platform: MapsPlatform): string {
  const hasCoords = target.latitude != null && target.longitude != null;
  const coords = hasCoords ? `${target.latitude},${target.longitude}` : null;
  const label = [target.name, target.address].filter(Boolean).join(', ');
  const q = encodeURIComponent(label);

  if (platform === 'ios') {
    return coords
      ? `https://maps.apple.com/?ll=${coords}&q=${encodeURIComponent(target.name)}`
      : `https://maps.apple.com/?q=${q}`;
  }
  if (platform === 'android') {
    return coords ? `geo:${coords}?q=${coords}(${encodeURIComponent(target.name)})` : `geo:0,0?q=${q}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${coords ? coords : q}`;
}
