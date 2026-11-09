export const MB = 1_000_000;
export const GB = 1_000_000_000;
export const STORAGE_LIMIT = 5 * GB;

export function fileLimit(name: string, type: string) {
  if (type.startsWith('image/') || /\.(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i.test(name)) return 100 * MB;
  if (type.startsWith('video/') || /\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm|wmv)$/i.test(name)) return 500 * MB;
  return GB;
}

export function previewType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString())) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (bytes.subarray(4, 8).toString() === 'ftyp' && /^(isom|iso2|mp41|mp42|avc1)/.test(bytes.subarray(8, 12).toString())) return 'video/mp4';
  return null;
}

export function canDelete(authorId: string, userId: string, ownerId?: string) {
  return authorId === userId || ownerId === userId;
}
