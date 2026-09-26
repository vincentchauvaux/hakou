/**
 * Code spectateur — validé dans le cockpit (saisi ou généré), exigé pour HLS / WHEP.
 * Stocké en mémoire processus (un live = un code). 4–8 caractères.
 */

import { randomInt } from "node:crypto";
import { safeEqualStr } from "./security.mjs";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;

const CODE_MIN = 4;
const CODE_MAX = 8;

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
    .slice(0, CODE_MAX);
}

export function createListenCodeStore() {
  let active = null;

  function issue(preferred) {
    const raw = preferred == null ? "" : String(preferred).trim();
    const custom = normalizeCode(raw);
    if (raw && custom.length < CODE_MIN) {
      const err = new Error("Code trop court (4–8 lettres ou chiffres).");
      err.status = 400;
      throw err;
    }
    const code = custom.length >= CODE_MIN ? custom : generateCode();
    active = {
      code,
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
    if (got.length < CODE_MIN || got.length !== active.code.length) return false;
    return safeEqualStr(got, active.code);
  }

  return { issue, clear, current, matches };
}
