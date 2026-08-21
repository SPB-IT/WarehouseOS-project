export function displayStorageLocation(location: string | null | undefined) {
  return location
    ? location.replace(/\s*\/\s*(?:ช่องย่อย|พาเลต)\s*\d+\s*$/i, '').trim()
    : '';
}

export function displayItemDetail(detail: string | null | undefined) {
  return detail
    ? detail.replace(/\s*[·/]\s*(?:ช่องย่อย|พาเลต)\s*\d+/gi, '').trim()
    : '';
}
