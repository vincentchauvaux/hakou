/**
 * Galerie Instagram statique — pas d’API Meta.
 * Posts : content/instagram-posts.json (permaliens /p/…).
 */
(function () {
  const PROFILE = {
    username: "kat0gat0",
    url: "https://www.instagram.com/kat0gat0/",
    image: "./assets/instagram-profile.jpg",
    label: "Gato",
    initials: "KG",
  };

  const POSTS_URL = "./content/instagram-posts.json";

  function normalizePermalink(raw) {
    if (!raw || typeof raw !== "string") return null;
    const trimmed = raw.trim();
    const match = trimmed.match(
      /instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/i
    );
    if (!match) return null;
    const kind = /\/reel\//i.test(trimmed) ? "reel" : "p";
    return `https://www.instagram.com/${kind}/${match[1]}/`;
  }

  function processEmbeds() {
    if (window.instgrm && window.instgrm.Embeds) {
      window.instgrm.Embeds.process();
    }
  }

  function createProfileSlot() {
    const a = document.createElement("a");
    a.className = "instagram-slot instagram-slot--profile";
    a.href = PROFILE.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", `Profil Instagram @${PROFILE.username}`);

    const fallback = document.createElement("span");
    fallback.className = "instagram-avatar-fallback";
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = PROFILE.initials;

    const img = document.createElement("img");
    img.src = PROFILE.image;
    img.alt = `Photo de profil @${PROFILE.username}`;
    img.loading = "lazy";
    img.width = 320;
    img.height = 320;
    img.addEventListener("error", () => {
      a.classList.add("is-avatar-fallback");
      img.remove();
    });

    const label = document.createElement("span");
    label.className = "instagram-slot-label";
    label.textContent = PROFILE.label;

    a.append(fallback, img, label);
    return a;
  }

  function createCtaSlot(kind) {
    const isReel = kind === "reels";
    const a = document.createElement("a");
    a.className = "instagram-slot instagram-slot--cta";
    a.href = isReel ? `${PROFILE.url}reels/` : PROFILE.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute(
      "aria-label",
      isReel
        ? "Voir les reels sur Instagram"
        : "Voir les publications sur Instagram"
    );

    const icon = document.createElement("span");
    icon.className = "instagram-slot-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = isReel ? "▶" : "IG";

    const label = document.createElement("span");
    label.className = "instagram-slot-label";
    label.textContent = isReel ? "Reels" : "Publications";

    const hint = document.createElement("span");
    hint.className = "instagram-slot-hint";
    hint.textContent = "Ouvrir sur Instagram";

    a.append(icon, label, hint);
    return a;
  }

  function createEmbedSlot(permalink) {
    const wrap = document.createElement("div");
    wrap.className = "instagram-slot instagram-slot--embed";

    const link = document.createElement("a");
    link.href = permalink;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "instagram-embed-link";
    link.setAttribute("aria-label", "Voir la publication sur Instagram");

    const blockquote = document.createElement("blockquote");
    blockquote.className = "instagram-media";
    blockquote.setAttribute("data-instgrm-permalink", permalink);
    blockquote.setAttribute("data-instgrm-version", "14");
    blockquote.style.cssText =
      "background:#FFF;border:0;border-radius:12px;margin:0;max-width:100%;min-width:0;width:100%;";

    link.append(blockquote);
    wrap.append(link);
    return wrap;
  }

  function setGalleryNote(grid, hasEmbeds) {
    const card = grid.closest(".panel-card");
    if (!card) return;
    let note = card.querySelector(".instagram-gallery-note");
    if (!note) {
      note = document.createElement("p");
      note.className = "instagram-gallery-note";
      card.insertBefore(note, grid);
    }
    note.textContent = hasEmbeds
      ? "Aperçus officiels Instagram — ouvrez une publication pour la voir en grand."
      : "Les publications s’ouvrent sur Instagram. Ajoutez des permaliens dans content/instagram-posts.json pour afficher des aperçus ici.";
  }

  async function loadPosts() {
    try {
      const res = await fetch(POSTS_URL);
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data.posts) ? data.posts : [];
      return list.map(normalizePermalink).filter(Boolean).slice(0, 6);
    } catch {
      return [];
    }
  }

  async function init() {
    const grid = document.querySelector("#instagram-grid");
    if (!grid) return;

    const posts = await loadPosts();
    grid.replaceChildren(createProfileSlot());

    if (posts.length) {
      grid.classList.add("instagram-grid--embeds");
      for (const permalink of posts.slice(0, 2)) {
        grid.append(createEmbedSlot(permalink));
      }
      setGalleryNote(grid, true);
      processEmbeds();
      if (!window.instgrm) {
        window.addEventListener("load", processEmbeds, { once: true });
      }
    } else {
      grid.append(createCtaSlot("posts"), createCtaSlot("reels"));
      setGalleryNote(grid, false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
