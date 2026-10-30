// Tanpa impor lain agar bisa dipakai skema protokol maupun UI.

export const MAX_CHAT_LENGTH = 200;

/** Kendali (\p{Cc}) dan pembalik arah teks yang bisa dipakai mengacaukan tampilan. */
const UNSAFE_CHARS = /[\p{Cc}‪-‮⁦-⁩]/gu;

/**
 * Bersihkan teks chat: tanpa karakter kendali, spasi dirapikan, paling banyak
 * MAX_CHAT_LENGTH unit UTF-16 (sama dengan batas skema & maxLength input).
 * Teks selalu ditampilkan sebagai teks biasa oleh React, tidak pernah sebagai HTML.
 */
export function cleanChatText(text: string): string {
  let clean = text.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();
  clean = clean.slice(0, MAX_CHAT_LENGTH);
  // Jangan memotong emoji di tengah pasangan surrogate.
  if (/[\uD800-\uDBFF]$/.test(clean)) clean = clean.slice(0, -1);
  return clean;
}
