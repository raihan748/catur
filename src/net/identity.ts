import { readStorage, writeStorage } from '../utils/storage.ts';

// Didefinisikan di sini (bukan di protocol.ts) agar beranda tidak ikut memuat Zod.
export const MAX_NAME_LENGTH = 24;

const NAME_KEY = 'catur:name';

// ID pemain (clientId) disimpan per ruangan bersama permainannya; lihat store/savedRooms.ts.

export const loadName = () => readStorage('local', NAME_KEY) ?? '';

export const saveName = (name: string) =>
  writeStorage('local', NAME_KEY, name.trim().slice(0, MAX_NAME_LENGTH));
