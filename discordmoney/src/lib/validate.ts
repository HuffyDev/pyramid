export const LINK_RE = /(https?:\/\/|www\.|discord\.gg\/|\b[a-z0-9-]+\.(com|io|gg|xyz|net|org|app|co|site|me|fun|so|link)\b)/i;

export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export function validateSocial(kind: 'x' | 'discord' | 'website', v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!isHttpUrl(s)) return 'Enter a full URL starting with https://';
  const host = new URL(s).hostname.replace(/^www\./, '');
  if (kind === 'x' && !['x.com', 'twitter.com'].includes(host)) return 'Use an x.com or twitter.com URL';
  if (kind === 'discord' && !['discord.gg', 'discord.com'].includes(host)) return 'Use a discord.gg invite URL';
  if (kind === 'discord' && host === 'discord.com' && !new URL(s).pathname.startsWith('/invite/')) return 'Use a discord.gg or discord.com/invite URL';
  return null;
}

export const ACCEPTED_IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function validateImage(f: File): string | null {
  if (!ACCEPTED_IMAGES.includes(f.type)) return 'Use a PNG, JPG, GIF or WebP image.';
  if (f.size > MAX_IMAGE_BYTES) return `Image is ${(f.size / 1024 / 1024).toFixed(1)}MB — the maximum is 4MB.`;
  return null;
}

/** Downscale to a small square thumbnail so the demo fits in localStorage. */
export function toThumbnail(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/webp', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}
