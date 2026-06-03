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

- **Intro (section 0)** : repos = `computeSectionCamera(0)` uniquement (`sampleCameraState` snap section entière hors glide). Focale repos **42 mm** (~31° FOV). Neptune orbite **58**, `size` 1,4, `camDistMul` 2,75, `distScale` 1,68 — limbe droit ~30–40 % cadre, Soleil à l'horizon gauche. `INTRO_SNAP_FRAMES` 5 + re-snap à l'arrivée sur Intro. Pas de dérive caméra au repos Intro ; `resolveSunOcclusion` Intro doux (tangente réduite, recul extérieur).
- **Ordre planètes / caméra** : 0 = Neptune → 1 Saturn → 2 Jupiter → **3 Uranus (Visuel)** → 4 Mars (3D) → 5 Mercure (Contact) ; le voyage caméra 0→5 reste « vers le Soleil ».
- Caméra : **trajectoire rectiligne** (`sampleRectilinearTransfer` / `rectilinearPointRaw`) — `lerp` P0→P1, léger décalage vers l'extérieur au milieu (`sin π·pathT`) + **hélice toroïdale** (tangente extérieure + Y) pour dégager le Soleil et suggérer la révolution vers le centre.
- **Échelle orbitale** (`PLANETS` / `DECORATIVE_PLANETS`, juin 2026) : Neptune **58**, Saturne **42**, Jupiter **28**, Uranus **35**, Mars **20** (3D, §4), Mercure **13** (Contact, §5) ; Vénus décorative **9,5**. Sens de grandeur accru — planètes intérieures plus loin du Soleil qu'avant (Mars ~11→20, Mercure ~5,8→13). Caméra far **620**, lumière Soleil portée **340**, brouillard initial **0,005**.
- **Collision caméra ↔ corps** : sphères Soleil (`SUN_COLLISION_RADIUS` ×2,05, `SUN_INNER_TRANSIT_EXTRA`, corridor `SUN_CORRIDOR_PAD` +2) + planètes section + **Vénus décorative** (`DECORATIVE_PLANETS`, `section: null`, orbite 9,5). `pushPointOutsideSun` / `getSunPushExtraMargin` renforcent les legs vers sections **4–5** (Mars, Mercure). **Ancre** = section repos arrondie ou `glideState.to` en transit ; planète d'ancrage (+ planète `from` quittée en glide) : clearance `CAMERA_BODY_CLEARANCE` (0,8) et rayon `getPlanetCollisionRadius`. **Planètes passives** (dont décoratives) : clearance × `PASSIVE_PLANET_CLEARANCE_MUL` (2,5) + rayon × `PASSIVE_PLANET_RADIUS_MUL` (1,45). `rectilinearPointRaw` : bosse extérieure / Y / hélice amplifiées si `toIndex ≥ 4` ; repousse Soleil sur chaque point. `enforcePathBodyClearance` : test segment `closestPointOnSegmentToSun` + 16 échantillons ; `pushPointOutsideBodies` sur repos, glide, blend héro, dérive / orbit manuelle.
- **Contact (section 5, Mercure)** : `camDistMul` 1,02, `distScale` 0,88, élévation basse — caméra quasi à la surface, regard `computeSunLookAt` (Soleil à l'horizon). `resolveSunOcclusion` doux (`nearSun`, faible recul extérieur) + clamp distance surface pour ne pas être repoussée à travers la planète. `FOCAL_REST_MM[5]` = 50.
- **3D (section 4, Mars)** : orbite 20 ; `distScale` 1,1. Trajectoire glide légèrement plus extérieure (`toIndex === 4`, bulge ×1,18) pour éviter de frôler le Soleil.
- Un seul leg direct `from`→`to` (pas d'étapes intermédiaires UI).
- `pathT` / focale : **pas de double `spacecraftEase`** (l'easing vient déjà de `navigation.js` via `glideT`).
- **FOV / focale** : `computeGlideFocalMm` — interpolation linéaire `FOCAL_REST_MM[from]` → `FOCAL_REST_MM[to]` sur tout le leg (`legT=1` = focale repos destination). `FOCAL_REST_MM` : `[42, 22, 32, 36, 40, 50]`. Lissage exponentiel (`FOV_LERP_ALPHA`) **uniquement avant 90 % du leg** ; à partir de `GLIDE_FOV_DIRECT_START` (0,9) et en convergence héro : FOV appliqué **directement** (pas de rattrapage post-arrivée).
- **Convergence héro** (`GLIDE_HERO_BLEND_START` 0,92) : derniers 8 % du leg — position interpolée de la ligne rectiligne vers le cadrage héro destination (`computeSectionCamera`, incl. `resolveSunOcclusion`). `sampleRectilinearTransfer` force `p1` exact à `t=1`. Position caméra snap (`posAlpha=1`) dès 92 % ; regard héro pur dès `GLIDE_LOOKAT_HERO_START` (0,95).
- **Trajectoire toroïdale caméra** (`GLIDE_TORUS_REVOLUTION` 0,038) : dans `sampleRectilinearTransfer`, sinus sur la tangente extérieure + léger Y (`sin/cos 2π·pathT`) — sensation de révolution vers le Soleil le long du tore, en plus du bulge extérieur existant.
- **Système solaire (orbites indépendantes)** :
  - **Toutes les planètes** : angle = `startAngle + elapsed × orbitSpeed` en permanence (glide inclus) — pas de capture d'angle, pas de lerp destination/origine pendant le transit caméra.
  - **Rotation propre** : `mesh.rotation.y = elapsed × spinSpeed × axialScale × PLANET_SPIN_SCALE` — facteur constant, jamais réinitialisé.
  - **Repos** (`!animating` et section active) : dérive lente de l'angle orbital courant vers `heroAngle` (chemin court, `REST_ORBIT_DRIFT` rad/s) pour le cadrage héro — pas pendant le glide.
  - `getPlanetOrbitBlend` : proximité `displaySection` uniquement (plus de gel from/to en saut long).
- **Repos après glide** (`REST_SETTLE_MS` 280 ms) : **rampe dérive orbitale uniquement** — plus de re-cadrage position / FOV / settle héro séparé (suppression du bloc `settleT` dans `sampleCameraState`).
- Regard aux extrémités de leg : `lookAt` héro (`from`/`to`) ; milieu de leg : `computeSmoothFocusLookAt`.
- Arcs Bézier (`computeDynamicArcControls`) conservés en fichier mais non utilisés pour le sampling caméra.
- Dérive orbitale repos **0.06 rad/s**, lerp position doux.
- Pendant un saut long : orbites planètes continues ; accent / proximité visuelle via `getActiveSectionIndex` / `getSectionProximity` (from/to).
- **Orbit manuelle au repos** : clic-glisser (ou touch) sur `#three-canvas` quand `!glideState.animating` et `settleT ≥ 1`. Rotation azimut / élévation autour du `lookAt` Soleil à **rayon constant** (position héro capturée au premier drag). Offsets par section (`sectionUserOrbit`) **réinitialisés** au début de chaque glide (`startGlide` → `resetRestOrbitOffsets()`, détection `wasGlideAnimating` dans `updateGlideSettle`) et à la fin du settle sur la section active. Pendant glide / settle : pas d’application des offsets utilisateur (cadrage héro / trajectoire glide uniquement). Drag interrompu : `releasePointerCapture` dans `endOrbitDrag`. Export `resetRestOrbitOffsets(sectionIndex?)` — sans arg : toutes sections ; avec arg : une section. `navigation.js` ignore le touch vertical si `isRestOrbitDragging()`. Molette inchangée (navigation). Curseur `grab` / `grabbing` (`styles.css`).

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `main.js` | Boucle RAF, lie navigation + rendu |
| `navigation.js` | Gating scroll, overlay, glide state, échelle solaire |
| `scene3d.js` | Three.js, caméra, planètes (6 sections) |
| `youtube-videos.js` | Zone Video : vignettes YouTube, modal lecture |
| `instagram-gallery.js` | Zone Visuel : grille Instagram 3×2, modales publication + profil |
| `styles.css` | Thèmes panels, crossfade, `#solar-scale`, menu latéral (`max-height`, marge droite), cube CSS 3D preview |

## Vérification

```bash
node --check navigation.js
node --check scene3d.js
node --check main.js
node --check instagram-gallery.js
node --check youtube-videos.js
```

## Contenu externe intégré (`index.html`)

Site statique sans backend : les médias sont des iframes / liens embarqués, pas de chargement dynamique au runtime.

| Zone | Source | Détail |
|------|--------|--------|
| **Son** (`#son`) | [soundcloud.com/hakou](https://soundcloud.com/hakou) | Lecteur iframe via oEmbed SoundCloud — user API `4170372`, hauteur 450 (mode visuel). |
| **Video** (`#video`) | [@MrEtibaliomecus](https://www.youtube.com/@MrEtibaliomecus) | `youtube-videos.js` + `.video-grid` : emplacements `[data-video-id]` / `[data-video-title]` (RSS `channel_id=UCmm1lsi4IS7RzwFFhIax3ug` : `AKtcrYIKgkU`, `M836C1DIto4`). Vignettes `img.youtube.com/vi/…/hqdefault.jpg`, overlay lecture. Clic → modal `#youtube-video-modal` (embed `?autoplay=1`). Lien ↗ = YouTube nouvel onglet. |
| **Visuel** (`#visuel`) | [@kat0gat0](https://www.instagram.com/kat0gat0/) | `instagram-gallery.js` + `#instagram-grid` : grille **3×2** pleine largeur (6 vignettes, pas de tuile profil). Miniatures **locales** (`content/instagram-posts.json` → `assets/instagram/thumb-*.jpg`). Clic vignette (photo ou vidéo/reel) → modal `#instagram-post-modal` : corps scrollable (`.instagram-modal__body`, max ~85vh) + iframe `…/p/{code}/embed` ou `…/reel/{code}/embed`. Lien ↗ = Instagram nouvel onglet. `@kat0gat0` et « Voir sur Instagram » → modal `#instagram-profile-modal` (iframe `kat0gat0/embed`, repli lien si blocage). Sans JSON : placeholders + CTA Reels. |
| **3D** (`#espace-3d`) | Preview locale | Carte `.card-3d` + cube CSS animé (`.mini-scene`, `.cube`, `.face`) — pas d’embed WebGL dans le panel. |
| **Contact** (`#contact`) | Liens réseaux | Instagram `@kat0gat0`, YouTube `@MrEtibaliomecus`, SoundCloud `hakou`. Pas d’e-mail fourni — à compléter si besoin. |

### Limitations

- **YouTube** : IDs dans `data-video-id` sur `#video` ; RSS public pour les rafraîchir hors site (`feeds/videos.xml?channel_id=…`). Lecture sur site via modal (pas d’iframe dans la grille — évite `pointer-events: none` du scroll gating).
- **SoundCloud** : embed officiel ; couleur accent `%237f9dff` dans l’URL du player.
- **Instagram** : pas d’API Meta sans token. oEmbed : souvent **CORS** / login. **Miniatures** : `curl -L -o assets/instagram/thumb-N.jpg "https://www.instagram.com/p/{SHORTCODE}/media/?size=l"` (reels : shortcode identique, URL `/p/…/media/`). JSON : `{ url, thumbnail, isVideo }`. **Lecture sur site** : modales scrollables + iframe `/embed` (posts/reels et profil `…/kat0gat0/embed`). Tester via serveur HTTP local (`npx serve .` ou équivalent) — `file://` peut bloquer l’iframe. Fermeture : fond, ×, Échap. Pas d’`embed.js` dans la grille.
- **Interaction vidéo zone Video** : plus d’iframe embarquée dans la grille ; vignettes cliquables + modal (comme Instagram Visuel).
