export const sanitizeText = (value: string) =>
  value
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const nowIso = () => new Date().toISOString();

export const hashSecret = async (value: string) => {
  const normalized = `nexus-pos-v1:${value.trim()}`;
  const encoded = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const verifySecret = async (value: string, hash?: string) => {
  if (!hash) return false;
  return (await hashSecret(value)) === hash;
};
