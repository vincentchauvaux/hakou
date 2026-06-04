/**
 * Galerie Instagram @hakoulik — grille native 3×2 simple (shortcodes + media/?size=l),
 * JSON local prioritaire, découverte live multi-sources (3 s), repli iframe embed standard.
 */

(function () {
  const PROFILE = {
    username: "hakoulik",
    url: "https://www.instagram.com/hakoulik/",
    embedUrl: "https://www.instagram.com/hakoulik/embed",
  };

  const POSTS_URL = "./content/instagram-posts.json";
  const OEMBED_URL = "https://api.instagram.com/oembed";
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";
  const WEB_PROFILE_API = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${PROFILE.username}`;
  const IG_APP_ID = "936619743392459";
  const DISCOVERY_TIMEOUT_MS = 3000;
  const JSON_FRESH_DAYS = 7;
  const MAX_POSTS = 6;
  const STALE_DAYS_WARN = 90;
  const SESSION_FP_KEY = "hakou-ig-posts-fp";
  const LOG_PREFIX = "[Hakou Instagram]";

  function normalizePermalink(raw) {
    if (!raw || typeof raw !== "string") return null;
    const trimmed = raw.trim();
    const match = trimmed.match(
      /instagram\.com\/(?:[^/]+\/)?(?:p|reel)\/([A-Za-z0-9_-]+)/i
    );
    if (!match) return null;
    const kind = /\/reel\//i.test(trimmed) ? "reel" : "p";
    return `https://www.instagram.com/${kind}/${match[1]}/`;
  }

  function shortcodeFromPermalink(permalink) {
    const match = String(permalink).match(
      /instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/i
    );
    return match ? match[1] : null;
  }

  function postsFingerprint(posts) {
    return posts
      .map((p) => shortcodeFromPermalink(p.url))
      .filter(Boolean)
      .join(",");
  }

  function mergePostLists(...lists) {
    const seen = new Set();
    const out = [];
    for (const list of lists) {
      for (const post of list) {
        const normalized = normalizePostEntry(post);
        if (!normalized) continue;
        const code = shortcodeFromPermalink(normalized.url);
        if (!code || seen.has(code)) continue;
        seen.add(code);
        out.push(normalized);
        if (out.length >= MAX_POSTS) return out;
      }
    }
    return out;
  }

  function jsonUpdatedAt(data) {
    if (typeof data?.updatedAt === "string" && data.updatedAt) return data.updatedAt;
    if (typeof data?._updatedAt === "string" && data._updatedAt) return data._updatedAt;
    return null;
  }

  function jsonAgeDays(data) {
    const updatedAt = jsonUpdatedAt(data);
    if (!updatedAt) return Infinity;
    const age = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    return Number.isFinite(age) ? age : Infinity;
  }

  function isJsonFreshAndComplete(data, posts) {
    return posts.length >= MAX_POSTS && jsonAgeDays(data) <= JSON_FRESH_DAYS;
  }

  function reportStaleness(data, posts, source) {
    const fp = postsFingerprint(posts);
    const prevFp = sessionStorage.getItem(SESSION_FP_KEY);
    if (prevFp && prevFp === fp) {
      console.info(
        `${LOG_PREFIX} Mêmes publications qu'à la dernière visite — mettre à jour content/instagram-posts.json si @${PROFILE.username} a publié (voir agent.md).`
      );
    }
    sessionStorage.setItem(SESSION_FP_KEY, fp);

    if (source === "live") {
      console.info(
        `${LOG_PREFIX} ${posts.length} publication(s) via détection live (repli JSON si indisponible au prochain chargement).`
      );
      return;
    }

    const updatedAt = jsonUpdatedAt(data);
    if (!updatedAt) {
      console.info(
        `${LOG_PREFIX} Champ "updatedAt" absent dans instagram-posts.json — ajoutez une date ISO lors du prochain rafraîchissement.`
      );
      return;
    }

    const ageDays = jsonAgeDays(data);
    if (ageDays > STALE_DAYS_WARN) {
      console.warn(
        `${LOG_PREFIX} Liste datée du ${updatedAt.slice(0, 10)} (${Math.floor(ageDays)} j) — probablement périmée ; rafraîchir permaliens + assets/instagram/thumb-*.jpg.`
      );
    } else {
      console.info(
        `${LOG_PREFIX} ${posts.length} publication(s) depuis JSON local (MAJ ${updatedAt.slice(0, 10)}).`
      );
    }
  }

  function embedUrlFromPermalink(permalink) {
    const code = shortcodeFromPermalink(permalink);
    if (!code) return null;
    const kind = /\/reel\//i.test(permalink) ? "reel" : "p";
    return `https://www.instagram.com/${kind}/${code}/embed`;
  }

  function mediaPreviewUrl(permalink) {
    const code = shortcodeFromPermalink(permalink);
    if (!code) return null;
    return `https://www.instagram.com/p/${code}/media/?size=l`;
  }

  function isVideoPost(permalink, post, oembed) {
    if (post && typeof post.isVideo === "boolean") return post.isVideo;
    if (/\/reel\//i.test(permalink)) return true;
    if (oembed && (oembed.type === "video" || oembed.media_type === "video")) {
      return true;
    }
    return false;
  }

  function normalizePostEntry(entry) {
    if (!entry) return null;
    if (typeof entry === "string") {
      const url = normalizePermalink(entry);
      return url ? { url, thumbnail: null, isVideo: /\/reel\//i.test(url) } : null;
    }
    if (typeof entry !== "object") return null;
    const url = normalizePermalink(entry.url || entry.permalink || "");
    if (!url) return null;
    const thumbnail =
      typeof entry.thumbnail === "string" && entry.thumbnail.trim()
        ? entry.thumbnail.trim()
        : null;
    const isVideo =
      typeof entry.isVideo === "boolean"
        ? entry.isVideo
        : /\/reel\//i.test(url);
    return { url, thumbnail, isVideo };
  }

  function postsFromTimelineEdges(edges) {
    if (!Array.isArray(edges)) return [];
    const ordered = [];
    const seen = new Set();

    for (const edge of edges) {
      const node = edge?.node;
      const code = node?.shortcode;
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const isReel =
        node?.is_video === true ||
        node?.__typename === "GraphVideo" ||
        node?.product_type === "clips";
      const kind = isReel ? "reel" : "p";
      ordered.push({
        url: `https://www.instagram.com/${kind}/${code}/`,
        thumbnail: null,
        isVideo: isReel,
      });
      if (ordered.length >= MAX_POSTS) break;
    }
    return ordered;
  }

  function parseWebProfileJson(text) {
    if (!text || text.length < 50) return [];
    try {
      const data = JSON.parse(text);
      const edges =
        data?.data?.user?.edge_owner_to_timeline_media?.edges ||
        data?.user?.edge_owner_to_timeline_media?.edges;
      const posts = postsFromTimelineEdges(edges);
      if (posts.length) {
        console.info(
          `${LOG_PREFIX} web_profile_info : ${posts.length} shortcode(s).`
        );
      }
      return posts;
    } catch {
      return parseShortcodesFromHtml(text);
    }
  }

  function parseSharedDataFromHtml(html) {
    if (!html || html.length < 200) return [];

    const markers = [
      "window._sharedData = ",
      "window.__additionalDataLoaded(",
    ];

    for (const marker of markers) {
      const idx = html.indexOf(marker);
      if (idx < 0) continue;
      const start = html.indexOf("{", idx + marker.length);
      if (start < 0) continue;
      let depth = 0;
      let end = -1;
      for (let i = start; i < html.length && i < start + 2_500_000; i++) {
        const ch = html[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      if (end < 0) continue;
      try {
        const payload = JSON.parse(html.slice(start, end));
        const edges =
          payload?.entry_data?.ProfilePage?.[0]?.graphql?.user
            ?.edge_owner_to_timeline_media?.edges ||
          payload?.graphql?.user?.edge_owner_to_timeline_media?.edges;
        const posts = postsFromTimelineEdges(edges);
        if (posts.length) {
          console.info(
            `${LOG_PREFIX} _sharedData : ${posts.length} shortcode(s).`
          );
          return posts;
        }
      } catch {
        /* essai suivant */
      }
    }
    return [];
  }

  function parseShortcodesFromHtml(html) {
    if (!html || html.length < 200) return [];

    const ordered = [];
    const seen = new Set();

    function push(code, isReel) {
      if (!code || seen.has(code) || code.length < 5) return;
      seen.add(code);
      const kind = isReel ? "reel" : "p";
      ordered.push({
        url: `https://www.instagram.com/${kind}/${code}/`,
        thumbnail: null,
        isVideo: isReel,
      });
    }

    const reelRe = /instagram\.com\/reel\/([A-Za-z0-9_-]+)/gi;
    let m;
    while ((m = reelRe.exec(html)) !== null) push(m[1], true);

    const postRe = /instagram\.com\/p\/([A-Za-z0-9_-]+)/gi;
    while ((m = postRe.exec(html)) !== null) push(m[1], false);

    const shortcodeRe = /"shortcode":"([A-Za-z0-9_-]+)"/gi;
    while ((m = shortcodeRe.exec(html)) !== null) {
      const idx = m.index;
      const slice = html.slice(Math.max(0, idx - 80), idx + 120);
      push(m[1], /"is_video":true|"product_type":"clips"/i.test(slice));
    }

    return ordered.slice(0, MAX_POSTS);
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        ...options,
      });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchViaProxy(pageUrl) {
    const proxied = `${CORS_PROXY}${encodeURIComponent(pageUrl)}`;
    const text = await fetchWithTimeout(proxied);
    if (!text || text.length < 200 || /Request Timeout|error code/i.test(text)) {
      return null;
    }
    return text;
  }

  async function tryWebProfileInfo() {
    const headers = {
      "X-IG-App-ID": IG_APP_ID,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
    };

    const direct = await fetchWithTimeout(WEB_PROFILE_API, { headers });
    if (direct) {
      const posts = parseWebProfileJson(direct);
      if (posts.length) return posts;
    }

    const proxied = await fetchViaProxy(WEB_PROFILE_API);
    return proxied ? parseWebProfileJson(proxied) : [];
  }

  async function trySharedDataFromProfile() {
    const html = await fetchViaProxy(PROFILE.url);
    if (!html) return [];
    const fromShared = parseSharedDataFromHtml(html);
    if (fromShared.length) return fromShared;
    const fromRegex = parseShortcodesFromHtml(html);
    if (fromRegex.length) {
      console.info(
        `${LOG_PREFIX} Profil HTML (regex) : ${fromRegex.length} shortcode(s).`
      );
    }
    return fromRegex;
  }

  async function tryEmbedAndProfileHtml() {
    for (const pageUrl of [PROFILE.embedUrl, PROFILE.url]) {
      const html = await fetchViaProxy(pageUrl);
      const posts = html ? parseShortcodesFromHtml(html) : [];
      if (posts.length) {
        console.info(
          `${LOG_PREFIX} ${pageUrl.includes("/embed") ? "embed" : "profil"} proxy : ${posts.length} shortcode(s).`
        );
        return posts;
      }
    }
    return [];
  }

  async function discoverLivePosts() {
    const steps = [
      { label: "web_profile_info", run: tryWebProfileInfo },
      { label: "_sharedData", run: trySharedDataFromProfile },
      { label: "embed/profil", run: tryEmbedAndProfileHtml },
    ];

    for (const { label, run } of steps) {
      try {
        const posts = await run();
        if (posts.length) return posts;
      } catch (err) {
        console.info(`${LOG_PREFIX} ${label} :`, err?.message || err);
      }
    }

    console.info(
      `${LOG_PREFIX} Découverte live : aucun shortcode (CORS, 429 Meta ou mur login).`
    );
    return [];
  }

  async function filterPostsWithLiveMedia(posts) {
    const checks = await Promise.all(
      posts.map(async (post) => {
        const mediaUrl = mediaPreviewUrl(post.url);
        if (!mediaUrl) return { post, ok: false };
        try {
          const res = await fetch(mediaUrl, {
            method: "HEAD",
            mode: "no-cors",
            cache: "no-store",
          });
          if (res.type === "opaque") return { post, ok: true };
          const type = res.headers.get("content-type") || "";
          return { post, ok: res.ok && type.startsWith("image/") };
        } catch {
          return { post, ok: true };
        }
      })
    );

    const valid = checks.filter((c) => c.ok).map((c) => c.post);
    const removed = posts.length - valid.length;
    if (removed > 0) {
      console.info(
        `${LOG_PREFIX} ${removed} shortcode(s) ignoré(s) (media endpoint indisponible).`
      );
    }
    return valid.length ? valid : posts;
  }

  function createExternalLink(permalink) {
    const ext = document.createElement("a");
    ext.className = "instagram-thumb-external";
    ext.href = permalink;
    ext.target = "_blank";
    ext.rel = "noopener noreferrer";
    ext.setAttribute("aria-label", "Ouvrir sur Instagram");
    ext.textContent = "↗";
    return ext;
  }

  function bindPostThumb(wrap, permalink) {
    const activate = (event) => {
      if (event.target.closest(".instagram-thumb-external")) return;
      event.preventDefault();
      if (openPostModal) openPostModal(permalink);
    };
    wrap.addEventListener("click", activate);
    wrap.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest(".instagram-thumb-external")) return;
      event.preventDefault();
      if (openPostModal) openPostModal(permalink);
    });
  }

  function appendThumbImage(wrap, thumbSrc, alt) {
    if (thumbSrc) {
      const img = document.createElement("img");
      img.src = thumbSrc;
      img.alt = alt;
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 640;
      img.height = 640;
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        img.remove();
        if (!wrap.querySelector(".instagram-thumb-fallback-label")) {
          wrap.classList.add("instagram-thumb--fallback");
          const label = document.createElement("span");
          label.className = "instagram-thumb-fallback-label";
          label.textContent = alt;
          wrap.prepend(label);
        }
      });
      wrap.append(img);
    } else {
      wrap.classList.add("instagram-thumb--fallback");
      const label = document.createElement("span");
      label.className = "instagram-thumb-fallback-label";
      label.textContent = alt;
      wrap.append(label);
    }
  }

  function createInteractiveThumb(permalink, preview, options) {
    const { video = false } = options;
    const wrap = document.createElement("div");
    wrap.className = video
      ? "instagram-thumb instagram-thumb--video"
      : "instagram-thumb instagram-thumb--photo";
    wrap.setAttribute("role", "button");
    wrap.tabIndex = 0;
    wrap.setAttribute(
      "aria-label",
      video ? "Lire la vidéo Instagram" : "Voir la publication Instagram"
    );

    appendThumbImage(
      wrap,
      preview.thumbnail_url || preview.thumbnail,
      preview.title || preview.alt || (video ? "Vidéo Instagram" : "Publication Instagram")
    );

    if (video) {
      const play = document.createElement("span");
      play.className = "instagram-thumb-play";
      play.setAttribute("aria-hidden", "true");
      wrap.append(play);
    }

    wrap.append(createExternalLink(permalink));
    bindPostThumb(wrap, permalink);
    return wrap;
  }

  function createVideoThumb(permalink, preview) {
    return createInteractiveThumb(permalink, preview, { video: true });
  }

  function createPhotoThumb(permalink, preview) {
    return createInteractiveThumb(permalink, preview, { video: false });
  }

  function createThumb(permalink, post, preview) {
    const video = isVideoPost(permalink, post, preview);
    if (video) return createVideoThumb(permalink, preview);
    return createPhotoThumb(permalink, preview);
  }

  function createFallbackThumb(permalink, post) {
    const previewUrl =
      (post && post.thumbnail) || mediaPreviewUrl(permalink);
    if (previewUrl) {
      return createThumb(permalink, post, {
        thumbnail: previewUrl,
        title: "Publication Instagram",
      });
    }

    const video = isVideoPost(permalink, post, null);
    if (video) {
      return createVideoThumb(permalink, {
        thumbnail: previewUrl,
        title: "Vidéo Instagram",
      });
    }

    const wrap = document.createElement("div");
    wrap.className =
      "instagram-thumb instagram-thumb--photo instagram-thumb--fallback";
    wrap.setAttribute("role", "button");
    wrap.tabIndex = 0;
    wrap.setAttribute("aria-label", "Voir la publication Instagram");

    const label = document.createElement("span");
    label.className = "instagram-thumb-fallback-label";
    label.textContent = "Instagram";

    wrap.append(label, createExternalLink(permalink));
    bindPostThumb(wrap, permalink);
    return wrap;
  }

  let openPostModal = null;
  let openProfileModal = null;

  function initPostModal() {
    const modal = document.getElementById("instagram-post-modal");
    if (!modal) return;

    const backdrop = modal.querySelector("[data-close-modal]");
    const closeBtn = modal.querySelector(".instagram-modal__close");
    const frameWrap = modal.querySelector(".instagram-modal__frame-wrap");
    if (!frameWrap) return;

    let escapeHandler = null;

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("instagram-modal-open");
      frameWrap.replaceChildren();
      frameWrap.classList.remove(
        "instagram-modal__frame-wrap--reel",
        "instagram-modal__frame-wrap--post"
      );
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler);
        escapeHandler = null;
      }
    }

    escapeHandler = (event) => {
      if (event.key === "Escape") closeModal();
    };

    openPostModal = function open(permalink) {
      const src = embedUrlFromPermalink(permalink);
      if (!src) return;

      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.allow = "autoplay; encrypted-media";
      iframe.loading = "lazy";
      iframe.title = "Publication Instagram";
      frameWrap.replaceChildren(iframe);
      frameWrap.classList.toggle(
        "instagram-modal__frame-wrap--reel",
        /\/reel\//i.test(permalink)
      );
      frameWrap.classList.toggle(
        "instagram-modal__frame-wrap--post",
        !/\/reel\//i.test(permalink)
      );

      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("instagram-modal-open");
      document.addEventListener("keydown", escapeHandler);
      closeBtn?.focus();
    };

    backdrop?.addEventListener("click", closeModal);
    closeBtn?.addEventListener("click", closeModal);
  }

  function initProfileModal() {
    const modal = document.getElementById("instagram-profile-modal");
    if (!modal) return;

    const backdrop = modal.querySelector("[data-close-modal]");
    const closeBtn = modal.querySelector(".instagram-modal__close");
    const iframe = modal.querySelector(".instagram-profile-modal__scroll iframe");
    const fallback = modal.querySelector(".instagram-profile-modal__fallback");

    let escapeHandler = null;

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("instagram-modal-open");
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler);
        escapeHandler = null;
      }
    }

    escapeHandler = (event) => {
      if (event.key === "Escape") closeModal();
    };

    openProfileModal = function open() {
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("instagram-modal-open");
      document.addEventListener("keydown", escapeHandler);
      closeBtn?.focus();
    };

    if (iframe) {
      iframe.addEventListener("error", () => {
        iframe.hidden = true;
        if (fallback) fallback.hidden = false;
      });
    }

    backdrop?.addEventListener("click", closeModal);
    closeBtn?.addEventListener("click", closeModal);

    document.querySelectorAll(".instagram-profile-trigger").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        openProfileModal();
      });
    });
  }

  async function fetchOembed(permalink) {
    try {
      const url = `${OEMBED_URL}?url=${encodeURIComponent(permalink)}&omitscript=true`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.thumbnail_url) return null;
      return data;
    } catch {
      return null;
    }
  }

  async function createPostThumb(post) {
    const permalink = post.url;
    if (post.thumbnail) {
      return createThumb(permalink, post, {
        thumbnail: post.thumbnail,
        title: "Publication Instagram",
      });
    }

    const mediaUrl = mediaPreviewUrl(permalink);
    if (mediaUrl) {
      return createThumb(permalink, post, {
        thumbnail: mediaUrl,
        title: "Publication Instagram",
      });
    }

    const oembed = await fetchOembed(permalink);
    if (oembed) return createThumb(permalink, post, oembed);

    return createFallbackThumb(permalink, post);
  }

  function getGalleryShell() {
    return {
      root: document.getElementById("instagram-gallery"),
      embedPanel: document.getElementById("instagram-embed-panel"),
      grid: document.querySelector("#instagram-grid"),
    };
  }

  function setGalleryMode(mode) {
    const { root, embedPanel, grid } = getGalleryShell();
    if (!root) return;

    root.classList.remove(
      "instagram-gallery--embed-primary",
      "instagram-gallery--thumbs",
      "instagram-gallery--link-fallback"
    );

    if (mode === "embed") {
      root.classList.add("instagram-gallery--embed-primary");
      if (embedPanel) embedPanel.hidden = false;
      if (grid) {
        grid.replaceChildren();
        grid.classList.remove(
          "instagram-grid--has-posts",
          "instagram-grid--empty",
          "instagram-grid--loading"
        );
      }
      return;
    }

    if (mode === "link") {
      root.classList.add("instagram-gallery--link-fallback");
      if (embedPanel) embedPanel.hidden = true;
      return;
    }

    if (mode === "thumbs") {
      root.classList.add("instagram-gallery--thumbs");
      if (embedPanel) embedPanel.hidden = true;
    }
  }

  async function loadPostsPayload() {
    try {
      const res = await fetch(POSTS_URL, { cache: "no-store" });
      if (!res.ok) return { data: null, posts: [], source: "json" };
      const data = await res.json();
      const list = Array.isArray(data.posts) ? data.posts : [];
      return { data, posts: mergePostLists(list), source: "json" };
    } catch {
      return { data: null, posts: [], source: "json" };
    }
  }

  function renderLinkFallbackGallery(grid) {
    console.info(
      `${LOG_PREFIX} Grille native indisponible — lien discret vers @${PROFILE.username} (voir content/instagram-sources.txt).`
    );
    setGalleryMode("link");
    grid.classList.remove("instagram-grid--loading", "instagram-grid--has-posts");
    grid.classList.add("instagram-grid--empty");

    const note = document.createElement("p");
    note.className = "instagram-gallery-note";
    const link = document.createElement("a");
    link.href = PROFILE.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `@${PROFILE.username}`;
    note.append(
      document.createTextNode("Publications récentes sur "),
      link,
      document.createTextNode(
        " — pour la grille native, lancer node scripts/refresh-instagram-posts.mjs ou coller des permaliens dans content/instagram-sources.txt."
      )
    );
    grid.replaceChildren(note);
  }

  function renderEmbedPrimaryGallery(grid) {
    console.info(
      `${LOG_PREFIX} Repli iframe profil @${PROFILE.username} (embed officiel).`
    );
    setGalleryMode("embed");
    grid.classList.remove("instagram-grid--loading", "instagram-grid--has-posts");
    grid.classList.add("instagram-grid--empty");
  }

  async function renderPostsGallery(grid, payload) {
    const { data, posts, source } = payload;
    if (!posts.length) {
      renderEmbedPrimaryGallery(grid);
      return;
    }

    reportStaleness(data, posts, source);
    setGalleryMode("thumbs");
    grid.classList.add("instagram-grid--has-posts");
    grid.classList.remove("instagram-grid--empty", "instagram-grid--loading");

    const thumbs = await Promise.all(posts.map((post) => createPostThumb(post)));
    grid.replaceChildren(...thumbs);
  }

  async function discoverPostsWithinBudget(jsonPayload) {
    const deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
    const known = jsonPayload.posts.length ? jsonPayload.posts : [];
    let live = [];

    const livePromise = discoverLivePosts();
    const remaining = () => Math.max(0, deadline - Date.now());

    if (remaining() > 0) {
      live = await Promise.race([
        livePromise,
        new Promise((resolve) => {
          setTimeout(() => resolve([]), remaining());
        }),
      ]);
    }

    let merged = mergePostLists(known, live);
    if (merged.length) {
      merged = await filterPostsWithLiveMedia(merged);
    }
    return { posts: merged, liveDiscovered: live };
  }

  async function refreshFromLiveInBackground(grid, baselinePosts) {
    const livePosts = await discoverLivePosts();
    if (!livePosts.length) return;

    const baselineFp = postsFingerprint(baselinePosts);
    const liveFp = postsFingerprint(livePosts);
    if (baselineFp && baselineFp === liveFp) return;

    const merged = await filterPostsWithLiveMedia(
      mergePostLists(baselinePosts, livePosts)
    );
    if (!merged.length) return;

    console.info(
      `${LOG_PREFIX} Mise à jour depuis détection live (${merged.length} publication(s)).`
    );
    await renderPostsGallery(grid, {
      data: null,
      posts: merged,
      source: "live",
    });
  }

  async function init() {
    const { grid } = getGalleryShell();

    try {
      initPostModal();
      initProfileModal();
      if (!grid) return;

      grid.classList.add("instagram-grid--loading");

      const jsonPayload = await loadPostsPayload();

      if (isJsonFreshAndComplete(jsonPayload.data, jsonPayload.posts)) {
        console.info(
          `${LOG_PREFIX} JSON récent (${MAX_POSTS} posts) — grille immédiate.`
        );
        await renderPostsGallery(grid, jsonPayload);
        void refreshFromLiveInBackground(grid, jsonPayload.posts).catch(() => {});
        return;
      }

      const { posts: discovered } = await discoverPostsWithinBudget(jsonPayload);

      if (discovered.length >= 1) {
        const source =
          discovered.length > jsonPayload.posts.length ? "live" : jsonPayload.source;
        await renderPostsGallery(grid, {
          data: jsonPayload.data,
          posts: discovered,
          source,
        });
        if (discovered.length < MAX_POSTS) {
          void refreshFromLiveInBackground(grid, discovered).catch(() => {});
        }
        return;
      }

      if (jsonPayload.posts.length >= 1) {
        await renderPostsGallery(grid, jsonPayload);
        void refreshFromLiveInBackground(grid, jsonPayload.posts).catch(() => {});
        return;
      }

      renderEmbedPrimaryGallery(grid);
    } catch (err) {
      console.error(`${LOG_PREFIX} Échec init galerie — repli iframe.`, err);
      if (grid) renderEmbedPrimaryGallery(grid);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
