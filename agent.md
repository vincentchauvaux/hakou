# Hakou Site — Notes agent

## Navigation (`navigation.js`)

- **6 sections** (indices 0–5), scroll gating via molette / clavier / touch. `sectionCount` et `scaleSectionMax` dérivés de `panels.length` à l’init.
- **Modèle spatial** : section **0 = Intro / Neptune (loin)**, section **5 = Contact / proche Soleil**. Avancer = index++ = vers le Soleil.
- **Entrées inversées pour le réalisme** :
  - Molette **vers le haut** (`deltaY < 0`) → section suivante (vers le Soleil).
  - Molette **vers le bas** → section précédente (s’éloigner).
  - Clavier : **Flèche haut / PageUp** = suivant ; **Flèche bas / PageDown / Espace** = précédent.
  - Touch : glisser le doigt **vers le haut** = suivant (comme la molette).
- **Menu latéral** (`index.html`) : ordre visuel **Contact → … → Intro** (proche Soleil en haut, Neptune en bas). Les `data-zone-link` restent 0–5 alignés sur les sections. **`syncUI` / `syncNavLinks`** : état actif via `Number(link.dataset.zoneLink)`, **pas** l’index DOM du nœud (ordre nav inversé). Panels : `getPanelZone(panel)` via `data-zone`. Entrée **Visuel** (`data-zone-link="3"`) entre Video et 3D.
- **Échelle solaire** (`#solar-scale`, gauche ~18px) : rail vertical + **6 graduations** (`.solar-scale-tick`, `data-stop` 0–5), sans libellés texte. Intro (0) en bas, Contact (5) en haut. Marqueur via `updateSolarScale(displaySection)` : `progress = 1 - section/(sectionCount-1)` (scroll ↑ vers le Soleil = marqueur monte). `scaleSectionMax` dérivé des panels, variable CSS `--scale-progress` sur `#solar-scale-marker`. Gutter panels gauche : `--solar-scale-gutter`.
- **Gating scroll** : accumulation molette / clavier / touch (`feedGate`) sans indicateur visuel (ancienne jauge `#scroll-gate` retirée).
- **Transition adjacente** (`span ≤ 1`) : overlay défile verticalement, durée base **3200 ms**, crossfade séquentiel (départ puis arrivée) via `longJumpFadeWeights` + `data-adjacent-glide` (pas de transition CSS parasite).
- **Saut long** (`span > 1`, ex. Intro→Contact) :
  - Overlay **ancré sur la section d'arrivée** (`-glideToIndex × 100vh`) — pas de snap final.
  - Panel départ décalé par `--long-jump-offset` ; panel arrivée à opacité 0 jusqu'à `t > 0.5`.
  - Crossfade séquentiel : départ `1→0` (0–50 %), arrivée `0→1` (50–100 %).
  - Durée : `3200 + (span - 1) × 900 ms` (~6800 ms pour 0→5).
  - `getGlideState()` expose `{ from, to, t, animating }` pour la caméra 3D.
- `getDisplaySection()` exposé pour l’UI (échelle) et le rendu 3D.
- Courbe d'easing partagée : `spacecraftEase()` (easeInOutCubic) dans `scene3d.js`.
- **Thèmes panels** (`SECTION_THEMES`) : Intro dark, Son light, Video mid, Visuel mid, 3D mid, Contact light.

## Scène 3D (`scene3d.js`)

- **Intro (section 0)** : repos = `computeSectionCamera(0)` uniquement (`sampleCameraState` snap section entière hors glide). Focale repos **42 mm** (~31° FOV). Neptune `size` 1,4, `camDistMul` 2,62, `distScale` 1,68 — limbe droit ~30–40 % cadre, Soleil à l'horizon gauche. `INTRO_SNAP_FRAMES` 5 + re-snap à l'arrivée sur Intro. Pas de dérive caméra au repos Intro ; `resolveSunOcclusion` Intro doux (tangente réduite, recul extérieur).
- **Ordre planètes / caméra** : 0 = Neptune → 1 Saturn → 2 Jupiter → **3 Uranus (Visuel)** → 4 Mars (3D) → 5 Mercure (Contact) ; le voyage caméra 0→5 reste « vers le Soleil ».
- Caméra : **trajectoire rectiligne** (`sampleRectilinearTransfer`) — `lerp` P0→P1, léger décalage vers l'extérieur au milieu (`sin π·pathT`) + **hélice toroïdale** (tangente extérieure + Y) pour dégager le Soleil et suggérer la révolution vers le centre.
- Un seul leg direct `from`→`to` (pas d'étapes intermédiaires UI).
- `pathT` / focale : **pas de double `spacecraftEase`** (l'easing vient déjà de `navigation.js` via `glideT`).
- **FOV / focale** : `computeGlideFocalMm` — interpolation linéaire `FOCAL_REST_MM[from]` → `FOCAL_REST_MM[to]` sur tout le leg (`legT=1` = focale repos destination). `FOCAL_REST_MM` : `[42, 22, 32, 36, 40, 50]`. Lissage exponentiel (`FOV_LERP_ALPHA`) **uniquement avant 90 % du leg** ; à partir de `GLIDE_FOV_DIRECT_START` (0,9) et en convergence héro : FOV appliqué **directement** (pas de rattrapage post-arrivée).
- **Convergence héro** (`GLIDE_HERO_BLEND_START` 0,92) : derniers 8 % du leg — position interpolée de la ligne rectiligne vers le cadrage héro destination (`computeSectionCamera`, incl. `resolveSunOcclusion`). `sampleRectilinearTransfer` force `p1` exact à `t=1`. Position caméra snap (`posAlpha=1`) dès 92 % ; regard héro pur dès `GLIDE_LOOKAT_HERO_START` (0,95).
- **Trajectoire toroïdale caméra** (`GLIDE_TORUS_REVOLUTION` 0,038) : dans `sampleRectilinearTransfer`, sinus sur la tangente extérieure + léger Y (`sin/cos 2π·pathT`) — sensation de révolution vers le Soleil le long du tore, en plus du bulge extérieur existant.
- **Orbites planètes sans téléportation** :
  - Au début de chaque glide : `captureGlideStartAngles` fige l'angle visuel de chaque planète (`getRestOrbitAngle`).
  - **Destination** (`glide.to`) : `lerpShortestAngle(start, hero+drift, ease(legT))` sur **tout le leg** 0→1 — arrive en douceur au `heroAngle` + dérive repos (pas de snap fin de glide).
  - **Origine** (`glide.from`) : dérive lente depuis l'angle capturé (`GLIDE_ORIGIN_DRIFT_MUL` × `REST_ORBIT_DRIFT`).
  - **Planètes de fond** : `startAngle + Δelapsed × orbitSpeed` — orbite continue sans reset au départ du glide.
  - Repos : `getRestOrbitAngle` — `heroAngle` + `REST_ORBIT_DRIFT` sur la section active uniquement.
  - `getPlanetOrbitBlend` : rampe easeInOutCubic continue sur from/to pendant tout glide (plus de seuils durs à t=0,12 / t×1,6).
- **Repos après glide** (`REST_SETTLE_MS` 280 ms) : **rampe dérive orbitale uniquement** — plus de re-cadrage position / FOV / settle héro séparé (suppression du bloc `settleT` dans `sampleCameraState`).
- Regard aux extrémités de leg : `lookAt` héro (`from`/`to`) ; milieu de leg : `computeSmoothFocusLookAt`.
- Arcs Bézier (`computeDynamicArcControls`) conservés en fichier mais non utilisés pour le sampling caméra.
- Dérive orbitale repos **0.06 rad/s**, lerp position doux.
- Pendant un saut long : planètes / anneaux / accent light ne s'activent que sur `from` et `to`.
- **Orbit manuelle au repos** : clic-glisser (ou touch) sur `#three-canvas` quand `!glideState.animating` et `settleT ≥ 1`. Rotation azimut / élévation autour du `lookAt` Soleil à **rayon constant** (position héro capturée au premier drag). Offsets **conservés par section** en mémoire pendant les glides. Désactivé pendant glide / settle / intro snap. `navigation.js` ignore le touch vertical si `isRestOrbitDragging()`. Molette inchangée (navigation). Curseur `grab` / `grabbing` (`styles.css`).

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `main.js` | Boucle RAF, lie navigation + rendu |
| `navigation.js` | Gating scroll, overlay, glide state, échelle solaire |
| `scene3d.js` | Three.js, caméra, planètes (6 sections) |
| `styles.css` | Thèmes panels, crossfade, `#solar-scale`, menu latéral (`max-height`, marge droite), cube CSS 3D preview |

## Vérification

```bash
node --check navigation.js
node --check scene3d.js
node --check main.js
node --check instagram-gallery.js
```

## Contenu externe intégré (`index.html`)

Site statique sans backend : les médias sont des iframes / liens embarqués, pas de chargement dynamique au runtime.

| Zone | Source | Détail |
|------|--------|--------|
| **Son** (`#son`) | [soundcloud.com/hakou](https://soundcloud.com/hakou) | Lecteur iframe via oEmbed SoundCloud — user API `4170372`, hauteur 450 (mode visuel). |
| **Video** (`#video`) | [@MrEtibaliomecus](https://www.youtube.com/@MrEtibaliomecus) | 2 derniers uploads via flux RSS (`channel_id=UCmm1lsi4IS7RzwFFhIax3ug`) : `AKtcrYIKgkU` (*Bon repas*), `M836C1DIto4` (*Open Grink*). Mise à jour manuelle ou script si besoin de fraîcheur. |
| **Visuel** (`#visuel`) | [@kat0gat0](https://www.instagram.com/kat0gat0/) | `instagram-gallery.js` + `#instagram-grid` : profil local (`assets/instagram-profile.jpg`, repli initiales **KG**), tuiles CTA ou embeds officiels selon `content/instagram-posts.json`. Script `//www.instagram.com/embed.js`. |
| **3D** (`#espace-3d`) | Preview locale | Carte `.card-3d` + cube CSS animé (`.mini-scene`, `.cube`, `.face`) — pas d’embed WebGL dans le panel. |
| **Contact** (`#contact`) | Liens réseaux | Instagram `@kat0gat0`, YouTube `@MrEtibaliomecus`, SoundCloud `hakou`. Pas d’e-mail fourni — à compléter si besoin. |

### Limitations

- **YouTube** : IDs figés dans le HTML ; le RSS public permet de les rafraîchir hors site (curl sur `feeds/videos.xml?channel_id=…`).
- **SoundCloud** : embed officiel ; couleur accent `%237f9dff` dans l’URL du player.
- **Instagram** : Meta ne fournit pas d’API publique sans app + token (Graph / Basic Display). Le scrape du profil (`curl` sur `/kat0gat0/`) ne renvoie plus de shortcodes `/p/` dans le HTML (contenu chargé en JS) — pas d’extraction automatique fiable des posts. La photo de profil via CDN (`og:image`) expire et le hotlink casse l’image ; le site utilise `assets/instagram-profile.jpg` (téléchargée une fois) + repli CSS initiales. **Ajouter des posts** : copier 2–6 permaliens publics dans `content/instagram-posts.json` → `"posts": ["https://www.instagram.com/p/SHORTCODE/", …]` ; `instagram-gallery.js` affiche des `<blockquote class="instagram-media">` traités par `embed.js`. Sans entrées JSON : tuiles « Publications » / « Reels » + texte « Les publications s’ouvrent sur Instagram ».
- **Interaction iframes vidéo** : `.video-grid iframe { pointer-events: none }` conservé pour le scroll gating — lecture au clic peut nécessiter d’activer la section d’abord.
