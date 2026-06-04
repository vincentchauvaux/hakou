#!/usr/bin/env node
/**
 * Vérifie si les shortcodes de instagram-posts.json répondent encore (heuristique HTML).
 * Usage: node scripts/verify-instagram-shortcodes.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "..", "content", "instagram-posts.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DELETED_MARKERS = [
  "Page isn't available",
  "page_not_found",
  "Sorry, this page",
  "Content Unavailable",
  "The link you followed may be broken",
];

function shortcodeFromUrl(url) {
  const m = String(url).match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

async function checkPost(code, kind = "p") {
  const pageUrl = `https://www.instagram.com/${kind}/${code}/`;
  const mediaUrl = `https://www.instagram.com/p/${code}/media/?size=l`;
  const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(pageUrl)}&omitscript=true`;

  const out = { code, kind, pageUrl, pageStatus: null, deletedHint: false, markers: [], ogTitle: null, oembedOk: false, mediaStatus: null, mediaType: null };

  try {
    const res = await fetch(pageUrl, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    out.pageStatus = res.status;
    const html = await res.text();
    out.markers = DELETED_MARKERS.filter((m) => html.includes(m));
    out.deletedHint = out.markers.length > 0;
    const og = html.match(/property="og:title" content="([^"]+)"/);
    out.ogTitle = og ? og[1].slice(0, 80) : null;
    if (/login/i.test(html) && html.length < 80000) out.loginWall = true;
  } catch (e) {
    out.pageError = e.message;
  }

  try {
    const res = await fetch(oembedUrl, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const data = await res.json();
      out.oembedOk = Boolean(data?.thumbnail_url);
    } else {
      out.oembedStatus = res.status;
    }
  } catch (e) {
    out.oembedError = e.message;
  }

  try {
    const res = await fetch(mediaUrl, {
      redirect: "follow",
      headers: { "User-Agent": UA },
    });
    out.mediaStatus = res.status;
    out.mediaType = res.headers.get("content-type");
  } catch (e) {
    out.mediaError = e.message;
  }

  return out;
}

async function main() {
  const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  const posts = Array.isArray(data.posts) ? data.posts : [];

  console.log(`Vérification de ${posts.length} post(s)…\n`);

  for (const post of posts) {
    const code = shortcodeFromUrl(post.url);
    const kind = /\/reel\//i.test(post.url) ? "reel" : "p";
    if (!code) {
      console.log("URL invalide:", post.url);
      continue;
    }
    const r = await checkPost(code, kind);
    const verdict =
      r.deletedHint
        ? "PROBABLEMENT SUPPRIMÉ"
        : r.oembedOk
          ? "OK (oembed)"
          : r.pageStatus === 404
            ? "404"
            : "incertain (login/CORS)";
    console.log(`${code} [${kind}] → ${verdict}`);
    if (r.ogTitle) console.log(`  og:title: ${r.ogTitle}`);
    if (r.markers.length) console.log(`  markers: ${r.markers.join(", ")}`);
    console.log(
      `  page=${r.pageStatus ?? r.pageError} oembed=${r.oembedOk ? "thumb" : r.oembedStatus ?? r.oembedError} media=${r.mediaStatus ?? r.mediaError} (${r.mediaType ?? ""})`
    );
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
