/**
 * Orchestration « Passer en direct » vers YouTube / Twitch (RTMP).
 */

import {
  completeYoutubeBroadcast,
  createYoutubeBroadcast,
  ensureYoutubeAccess,
} from "./youtube-live.mjs";
import { twitchRtmpUrl } from "./twitch-live.mjs";

export function createLivePublish({
  accounts,
  restream,
  youtubeConfig,
  twitchConfig,
}) {
  /** @type {null | { destination: string, youtubeBroadcastId: string | null }} */
  let session = null;

  function status() {
    return {
      ...restream.status(),
      session: session ? { ...session } : null,
    };
  }

  async function start(requestedDest) {
    const snap = accounts.snapshot();
    const dest = String(requestedDest || snap.destination || "hakou")
      .trim()
      .toLowerCase();

    if (dest === "hakou") {
      session = { destination: "hakou", youtubeBroadcastId: null };
      return { ok: true, destination: "hakou", restream: false };
    }

    if (dest === "youtube") {
      if (!snap.youtube.connected) {
        throw new Error("Connecte YouTube avant de diffuser.");
      }
      if (!youtubeConfig?.clientId || !youtubeConfig?.clientSecret) {
        throw new Error("OAuth YouTube non configuré sur le VPS.");
      }
      const stored = accounts.youtubeTokens();
      const accessToken = await ensureYoutubeAccess({
        clientId: youtubeConfig.clientId,
        clientSecret: youtubeConfig.clientSecret,
        stored,
        save: (fields) => accounts.setYoutube(fields),
      });
      const created = await createYoutubeBroadcast({
        accessToken,
        title: youtubeConfig.title,
        privacy: youtubeConfig.privacy,
        existingStreamId: stored?.streamId || null,
      });
      if (created.streamId) {
        accounts.setYoutube({ streamId: created.streamId });
      }
      try {
        await restream.start({
          destination: "youtube",
          rtmpUrl: created.rtmpUrl,
        });
      } catch (err) {
        await completeYoutubeBroadcast(accessToken, created.broadcastId);
        throw err;
      }
      session = {
        destination: "youtube",
        youtubeBroadcastId: created.broadcastId,
      };
      return {
        ok: true,
        destination: "youtube",
        restream: true,
        broadcastId: created.broadcastId,
      };
    }

    if (dest === "twitch") {
      const stored = accounts.twitchTokens();
      if (!stored?.streamKey) {
        throw new Error(
          "Ajoute la clé de stream Twitch (Dashboard → Paramètres → Stream)."
        );
      }
      const rtmpUrl = await twitchRtmpUrl(stored.streamKey);
      await restream.start({ destination: "twitch", rtmpUrl });
      session = { destination: "twitch", youtubeBroadcastId: null };
      return { ok: true, destination: "twitch", restream: true };
    }

    throw new Error("destination inconnue");
  }

  async function stop() {
    restream.stop();
    const current = session;
    session = null;
    if (current?.destination === "youtube" && current.youtubeBroadcastId) {
      try {
        if (youtubeConfig?.clientId && youtubeConfig?.clientSecret) {
          const stored = accounts.youtubeTokens();
          const accessToken = await ensureYoutubeAccess({
            clientId: youtubeConfig.clientId,
            clientSecret: youtubeConfig.clientSecret,
            stored,
            save: (fields) => accounts.setYoutube(fields),
          });
          await completeYoutubeBroadcast(
            accessToken,
            current.youtubeBroadcastId
          );
        }
      } catch (err) {
        console.warn("[Hakou Live] stop YouTube", err.message || err);
      }
    }
    return { ok: true, ...restream.status() };
  }

  return { start, stop, status };
}
