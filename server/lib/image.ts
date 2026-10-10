import { IMAGE_TYPES } from '../../shared/launch.js';

export type ImageMime = (typeof IMAGE_TYPES)[number];

/** Sniff real type from magic bytes — never trust the client's mime. */
export function sniffImage(b: Buffer): ImageMime | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

export const extFor = (m: ImageMime) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[m];
