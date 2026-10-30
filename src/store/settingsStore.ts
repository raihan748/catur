import { create } from 'zustand';
import { readStorage, writeStorage } from '../utils/storage.ts';

const MUTED_KEY = 'catur:muted';

type Settings = {
  muted: boolean;
  toggleMuted: () => void;
};

/** Preferensi pengguna yang disimpan di browser. */
export const useSettings = create<Settings>((set, get) => ({
  muted: readStorage('local', MUTED_KEY) === '1',
  toggleMuted: () => {
    const muted = !get().muted;
    writeStorage('local', MUTED_KEY, muted ? '1' : '0');
    set({ muted });
  },
}));
