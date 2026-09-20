/**
 * Code spectateur — créé à l’ouverture du live, exigé pour HLS / WHEP.
 * Stocké en mémoire processus (un live = un code).
 */

import { randomInt } from "node:crypto";
import { safeEqualStr } from "./security.mjs";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;

function generateCode() {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

export function createListenCodeStore() {
  let active = null;

  function issue() {
    active = {
      code: generateCode(),
      t: Date.now(),
    };
    return active.code;
  }

  function clear() {
    active = null;
  }

  function current() {
    return active?.code || null;
  }

  function matches(input) {
    if (!active?.code) return false;
    const got = normalizeCode(input);
    if (got.length !== CODE_LEN) return false;
    return safeEqualStr(got, active.code);
  }

  return { issue, clear, current, matches };
}
