/**
 * SMS length and segment counting (GSM 03.38 / UCS-2).
 *
 * Carriers bill per segment, not per message, so a single stray character — a smart
 * quote, an emoji, an en dash — silently drops the limit from 160 to 70 and can double
 * the cost of a send. The composer surfaces that before the user commits.
 */

// GSM 7-bit default alphabet.
const gsmCharset =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

// These exist in GSM only via an escape sequence, so each one costs two characters.
const gsmExtendedCharset = "^{}\\[~]|€";

export type SmsEncoding = "GSM-7" | "UCS-2";

export type SmsLength = {
  encoding: SmsEncoding;
  /** Billable character count: GSM extended characters count as two. */
  characters: number;
  segments: number;
  /** Characters still available before another segment is added. */
  remaining: number;
};

export function measureSms(text: string): SmsLength {
  const isGsm = Array.from(text).every(
    (character) => gsmCharset.includes(character) || gsmExtendedCharset.includes(character)
  );

  if (!isGsm) {
    const characters = Array.from(text).length;
    const single = 70;
    const concatenated = 67;
    const segments = characters === 0 ? 0 : characters <= single ? 1 : Math.ceil(characters / concatenated);
    const capacity = segments <= 1 ? single : segments * concatenated;
    return { encoding: "UCS-2", characters, segments, remaining: Math.max(0, capacity - characters) };
  }

  const characters = Array.from(text).reduce(
    (total, character) => total + (gsmExtendedCharset.includes(character) ? 2 : 1),
    0
  );
  const single = 160;
  const concatenated = 153;
  const segments = characters === 0 ? 0 : characters <= single ? 1 : Math.ceil(characters / concatenated);
  const capacity = segments <= 1 ? single : segments * concatenated;
  return { encoding: "GSM-7", characters, segments, remaining: Math.max(0, capacity - characters) };
}
