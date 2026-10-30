// Akses storage bisa melempar (mode privat, data situs diblokir), jadi selalu dibungkus
// try/catch dan aplikasi tetap jalan tanpa storage.

type StorageKind = 'local' | 'session';

const storage = (kind: StorageKind) => (kind === 'local' ? localStorage : sessionStorage);

export function readStorage(kind: StorageKind, key: string): string | null {
  try {
    return storage(kind).getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(kind: StorageKind, key: string, value: string): void {
  try {
    storage(kind).setItem(key, value);
  } catch {
    // Abaikan: storage hanya kenyamanan (preferensi, permainan yang bisa dilanjutkan).
  }
}

export function removeStorage(kind: StorageKind, key: string): void {
  try {
    storage(kind).removeItem(key);
  } catch {
    // Abaikan, sama seperti writeStorage.
  }
}

/** Semua kunci yang diawali `prefix`. */
export function storageKeys(kind: StorageKind, prefix: string): string[] {
  try {
    const s = storage(kind);
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}
