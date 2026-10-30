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
    // Abaikan: preferensi hanya kenyamanan.
  }
}
