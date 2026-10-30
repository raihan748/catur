import { readStorage, writeStorage } from '../utils/storage.ts';

// Didefinisikan di sini (bukan di protocol.ts) agar beranda tidak ikut memuat Zod.
export const MAX_NAME_LENGTH = 24;

const NAME_KEY = 'catur:name';
const CLIENT_ID_KEY = 'catur:clientId';

export const loadName = () => readStorage('local', NAME_KEY) ?? '';

export const saveName = (name: string) =>
  writeStorage('local', NAME_KEY, name.trim().slice(0, MAX_NAME_LENGTH));

/**
 * ID pemain per tab. Disimpan di sessionStorage sehingga tetap sama saat halaman
 * dimuat ulang (host mengenali tamu yang sama), tetapi berbeda di tab lain.
 */
export function getClientId(): string {
  const existing = readStorage('session', CLIENT_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  writeStorage('session', CLIENT_ID_KEY, id);
  return id;
}
