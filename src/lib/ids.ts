import { customAlphabet } from 'nanoid';

/**
 * Lowercase letters and digits with the look-alike characters removed
 * (0/O, 1/l/I). Slugs end up printed next to a QR code and read aloud, so
 * ambiguity costs more here than the handful of bits of entropy it saves.
 */
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';

const SLUG_LENGTH = 10;

/**
 * ~50 bits of entropy: not enumerable, which matters because the slug is the
 * only thing protecting a share. These links are unguessable, not private —
 * anyone holding the link can view the content, by design.
 */
export const newSlug = customAlphabet(ALPHABET, SLUG_LENGTH);

/** Cheap shape check so a junk path segment never reaches the database. */
export function looksLikeSlug(value: string): boolean {
  if (value.length !== SLUG_LENGTH) return false;
  for (const char of value) {
    if (!ALPHABET.includes(char)) return false;
  }
  return true;
}
