# Journal agent

## 2026-06-03 — Soleil fixe, composition par caméra uniquement

### Contexte

Retour utilisateur : le Soleil **se balade** à l'écran (décalage `sunVisualBias` / `updateSunVisual`) — ce n'est pas le Soleil qui doit bouger, c'est la **caméra** qui doit trouver une orbite de surface avec le Soleil **derrière l'horizon planétaire** mais **visible** (contre-jour au limbe).

### Scène 3D (`scene3d.js`)

- **Supprimé** : `computeSunVisualPos`, `updateSunVisual`, `sunVisualBias` / `sunVisualLift` — mesh, glow, corona, haze et `sunLight` **fixes** à `sunOrigin` `(0, 0.15, 0)`.
- **`computeSunLookAt`** : cible de regard = `sunOrigin` + offset Y monde constant par section (`lookSunLift`) — pas de translation du Soleil.
- **`computeSectionCamera`** : composition uniquement par position caméra — normale extérieure, `COMPOSITION_SLIDE`, `limbElevation` (surélévation au-dessus du plan orbital pour frôler le limbe), `resolveSunOcclusion` teste `sunOrigin` réel.
- **`computeSmoothFocusLookAt`** : blend Soleil fixe ↔ planète destination en transit (plus de lerp entre positions visuelles Soleil).
- **`SECTION_FRAMING`** retuné (5 sections) : `compositionSlide`, `elevation`, `limbElevation`, `lookSunLift` ; Saturne `distScale` 1.26, tangente renforcée.
- **Inchangés** : arc Bézier extérieur, focale dynamique (`FOCAL_REST_MM` / transit), glide menu direct, Intro lointain / Contact proche, `REST_ORBIT_DRIFT`, rotation axiale lente.

### Test manuel

```bash
node --check scene3d.js
npx serve .
```

1. Sur chaque section au repos : Soleil **immobile** dans le ciel pendant `REST_ORBIT_DRIFT` — seule la planète et la caméra dérivent.
2. Planète sur un tiers, Soleil visible au-delà du limbe (pas masqué par le centre du disque).
3. Transit menu : Soleil ne « voyage » pas ; focale et arc Bézier inchangés.

---

## 2026-06-03 — Soleil dégagé derrière la planète (5 sections)

### Contexte

Retour utilisateur (capture Son/Saturne) : sur **chaque** section planète, le Soleil reste masqué **derrière** le disque au repos — la caméra est sur la normale extérieure mais le regard traverse le centre de la planète.

### Scène 3D (`scene3d.js`)

- **`COMPOSITION_SLIDE`** (2.6 × taille planète) + **`compositionSlide`** par section : glissement latéral caméra le long de la tangente orbitale (règle des tiers renforcée).
- **`sunClearanceAngle` / `resolveSunOcclusion`** : boucle tangentielle + léger recul extérieur jusqu'à marge angulaire **`SUN_VISIBLE_MARGIN`** (0.14 rad) ; rayon occlusion inclut anneaux Saturne (×1.62).
- **`SECTION_FRAMING`** : `tangentMul` / `sunVisualBias` / `compositionSlide` remontés ; Son **`distScale` 1.26** (~+10 % recul) ; **`lookLimbDrop`** pour abaisser légèrement le `lookAt` (lueur au-delà du limbe).
- **`PLANETS`** : `camTangent` et **`heroAngle`** ajustés (Neptune 0.78, Saturne 2.14, etc.) pour ouvrir le côté Soleil opposé au panneau UI.
- **Inchangés** : arc Bézier extérieur, `computeSmoothFocusLookAt`, glide menu, `FOCAL_REST_MM` / transit, Intro lointain / Contact proche (`distScale` 1.22 / 0.86).

### Test manuel

```bash
node --check scene3d.js
npx serve .
```

1. Son : Saturne à droite, Soleil pleinement lisible à gauche (pas d'éclipse centrale).
2. Intro / Video / 3D / Contact : courbe planétaire sur un tiers, Soleil dans le tiers opposé.
3. Menu entre sections : transit et focale inchangés.

---

## 2026-06-03 — Soleil dans le ciel libre + focale dynamique

### Contexte

Retour utilisateur (capture Son/Saturne) : le Soleil au centre du monde reste masqué par la planète (anneaux ~70 % du cadre) ; souhait de **décaler le Soleil** vers la zone de ciel libre pour une belle perspective, et de jouer la **focale** — très courte (8–16 mm) loin / en voyage, normale (50 mm) au contact planète.

### Scène 3D (`scene3d.js`)

- **`computeSunVisualPos`** : décalage rendu du Soleil (mesh + glow/corona/haze) le long de la tangente **opposée** à `planetSide` ; `sunOrigin` et `sunLight` inchangés au centre.
- **`SECTION_FRAMING`** : `sunVisualBias` / `sunVisualLift` par section ; Son (Saturne) : `distScale` 1.14, `tangentMul` 0.9, bias **16** ; cadrage anneaux reculé (`+0.08` normale extérieure, tangente renforcée).
- **`computeSectionCamera` / `computeSmoothFocusLookAt`** : `lookAt` vers position visuelle Soleil (blend transit).
- **`updateSunVisual`** : position meshes Soleil chaque frame.
- **Focale** : `focalMmToFov` (capteur 24 mm) ; repos `FOCAL_REST_MM` [12, 22, 32, 40, 50] ; transit `computeTransitFocalMm` (16 mm au milieu du leg, arrive à la focale section).
- **Inchangés** : arc extérieur Bézier, glide menu direct, `distScale` Intro/Contact, rotation axiale.

### Test manuel

```bash
node --check scene3d.js
npx serve .
```

1. Son : Saturne à droite, Soleil lisible dans le ciel gauche (pas derrière les anneaux).
2. Intro : grand angle ~12 mm, planète lointaine + Soleil décalé.
3. Contact : ~50 mm, horizon serré.
4. Menu entre sections : focale s'élargit en milieu de trajet, se resserre à l'atterrissage.

---

## 2026-06-03 — Rotation axiale ralentie (géantes surtout)

### Contexte

Retour utilisateur : rotation sur elle-même / axiale **encore trop rapide**, surtout pour les **grandes** planètes (Neptune bleue en Intro, Saturne, Jupiter). Distinct de la dérive orbitale autour du Soleil.

### Scène 3D (`scene3d.js`)

- **`PLANET_SPIN_SCALE`** : 0.05 → **0.025** (ralentissement global ÷2).
- **`axialScale`** par planète dans `PLANETS` :
  - Neptune **0.42** (la plus lente),
  - Saturne **0.58**, Jupiter **0.55**,
  - Mars **0.9**, Mercure **0.95**.
- **`updatePlanets`** : `rotation.y = elapsed × spinSpeed × PLANET_SPIN_SCALE × axialScale × (actif ? 0.45 : 1)`.
- **Anneaux Saturne** : même facteur `PLANET_SPIN_SCALE × axialScale` (coefficients 0.4 / 0.28, vitesses effectives ~0.006 / ~0.004 rad/s).
- **Inchangés** : `REST_ORBIT_DRIFT`, `orbitSpeed`, `spinSpeed` relatifs, cadrage caméra.

### Test manuel

```bash
node --check scene3d.js
npx serve .
```

1. Intro Neptune : rotation axiale très lente, effet monumental.
2. Son / Video : Saturne et Jupiter plus lents que Mars / Mercure.
3. Dérive orbitale autour du Soleil : inchangée.

---

## 2026-06-03 — Cadrage caméra Intro lointain / Contact proche

### Contexte

Retour utilisateur : **Intro** (Neptune) doit être très décollée (plan grand vide, Soleil sur un côté) ; **Contact** (Mercure) plus proche (horizon intime) ; toutes sections un peu plus reculées pour respirer, avec le Soleil visible sur un tiers opposé à la courbe planétaire.

### Scène 3D (`scene3d.js`)

- **`CAM_SURFACE_OFFSET`** : 1.38 → **1.52** (recul global).
- **`SECTION_FRAMING`** : nouveau **`distScale`** par section (Intro 1.22, milieu ~1.04–1.06, Contact **0.86**) ; `tangentMul` / `elevation` ajustés (Intro + tangente pour ciel/Soleil, Contact resserré).
- **`camDistMul`** planètes : Neptune **2.05**, Saturne/Jupiter/Mars **1.38 / 1.32 / 1.26**, Mercure **1.02**.
- **`computeSectionCamera`** : `surfaceDist` × `framing.distScale` ; regard repos inchangé (`lookAt` Soleil).
- **FOV** : **`fovIntro` 62°** en blend sur section 0 (plan large).
- **Inchangés** : arc extérieur Bézier, `computeSmoothFocusLookAt`, glide direct menu (`getGlideState`), positions héro recalculées via `refreshSectionCameras` / `heroAngle`.

### Test manuel

```bash
node --check scene3d.js
npx serve .
```

1. Intro : Neptune petit dans le vide, Soleil lisible à gauche/droite selon `planetSide`.
2. Contact : Mercure plus proche, arc d'horizon dominant, Soleil toujours au tiers opposé.
3. Menu Intro ↔ Contact : un seul arc, cadrages extrêmes cohérents aux extrémités.

---

## 2026-06-03 — Rotation planètes + nav verre sombre universel

### Contexte

Retour utilisateur : rotation axiale / textures encore trop rapides ; menu en thème `light` (Son / Contact) illisible ou disgracieux (panneau beige, pilule grise sur SON, texte embossé) sur fond marron 3D.

### Scène 3D (`scene3d.js`)

- **`PLANET_SPIN_SCALE`** : 0.09 → **0.05** (cible ~0,04–0,05).
- **Anneaux Saturne** : 0.036 / 0.025 → **0.02 / 0.014** (même ratio que le facteur global).
- **`spinSpeed`**, **`REST_ORBIT_DRIFT`**, **`orbitSpeed`** : inchangés.

### Navigation (`styles.css`)

- **Verre sombre unique** pour `.side-nav` sur tous les `body[data-theme]` — plus de panneau clair / liens sombres en `light`.
- `:root` : `--nav-glass-bg` `rgba(5,8,18,0.75)`, ombre texte légère, `--nav-link-stroke: 0`.
- Lien actif : pilule bleue + glow (règles `.nav-link.is-active` de base).
- `body[data-theme="light"|mid|dark"]` : ne stylent plus la nav, seulement la **jauge** `.scroll-gate` où pertinent.
- `prefers-reduced-motion` : fond nav opaque sombre pour tous les thèmes.
- Inchangé : `navigation.js` (`SECTION_THEMES` pour les panels uniquement).

### Test manuel

```bash
node --check scene3d.js
npx serve .
```

1. Section Son : rotation très lente, anneaux Saturne proportionnels.
2. Thème clair body : nav sombre floutée, texte blanc, actif bleu (pas de beige/gris).
3. Section Video / Intro : nav toujours lisible sur fond variable.

---

## 2026-06-03 — Saut menu direct (caméra A → E)

### Contexte

Clic menu entre sections non adjacentes (ex. Intro → Contact) : la caméra traversait **toutes** les planètes intermédiaires car `sampleCameraState` dérivait `fromIndex` / `toIndex` via `floor` / `ceil` de `displaySection` (0→1→2→3→4 pendant le lerp).

### Navigation (`navigation.js`)

- **`glideFromIndex` / `glideToIndex`** figés au `startGlide` (section logique avant mise à jour → cible).
- **`getGlideState()`** exporte `{ from, to, t, animating }` pour la scène.
- **`glideDurationMs`** : 2500 ms pour un pas ; +22 % par section d'écart supplémentaire (ex. 0→4 ≈ 4150 ms).
- Roue / clavier : inchangé (un pas, leg adjacent).
- Même section : `goToSection` no-op si `target === currentSection`.

### Scène 3D (`scene3d.js`) + `main.js`

- Pendant `animating` et `from !== to` : caméra sur **un seul leg** `fromIndex`→`toIndex`, `legT = glideState.t` (déjà `spacecraftEase`).
- Repos / pas d'anim : ancienne logique `floor`/`ceil` sur `displaySection`.
- **`computeSmoothFocusLookAt`** : focus planète destination aussi en sens inverse (`from > to`).
- `renderScene(displaySection, glideState)` branché depuis `main.js`.

### Test manuel

```bash
node --check navigation.js; node --check scene3d.js; node --check main.js
npx serve .
```

1. Menu Intro → Contact : **un arc** extérieur Neptune → Mercure, sans passage Saturne/Jupiter/Mars.
2. Menu Contact → Intro : arc inverse, regard vers Neptune en transit.
3. Clic sur la section déjà active : pas d'animation.
4. Molette : toujours une section à la fois, arc court.

---

## 2026-06-03 — Rotation propre planètes encore ralentie

### Contexte

Retour utilisateur : les planètes **pivotent sur elles-mêmes trop vite** — besoin de plus de lenteur pour un sentiment de grandeur. Distinct de la dérive orbitale (`REST_ORBIT_DRIFT`).

### Scène 3D (`scene3d.js`)

- **`PLANET_SPIN_SCALE`** : 0.25 → **0.09** (rotation propre ÷~2,8).
- **Anneaux Saturne** : vitesses Z proportionnelles (0.036 / 0.025 au lieu de 0.1 / 0.07).
- **`spinSpeed`**, **`REST_ORBIT_DRIFT`**, **`orbitSpeed`** : inchangés.

### Test manuel

```bash
node --check scene3d.js
npx serve .
```

1. Repos sur chaque section : rotation axiale très lente, effet monumental.
2. Dérive orbitale autour du Soleil : inchangée.

---

## 2026-06-03 — Menu latéral lisible sur fond 3D variable

### Contexte

Le menu vertical (INTRO, SON, VIDEO, 3D, CONTACT) était illisible : le fond solaire/planétaire change fortement **dans** chaque section et derrière la nav ; `body[data-theme]` seul ne suffisait pas.

### Approche (CSS pur, sans échantillonnage pixel)

Inspiré des pratiques glassmorphism + contrast stacking (PixCode / Josh Comeau / WCAG sur fonds imprévisibles) :

1. **Panneau verre** sur `.side-nav` : `backdrop-filter: blur(12px) saturate(165%)`, fond semi-opaque, bordure légère, ombre portée ; fallback opaque si `prefers-reduced-motion: reduce` ou pas de `backdrop-filter`.
2. **Ombres texte empilées** + `-webkit-text-stroke` léger sur `.nav-link` (lisible sur zones claires et sombres).
3. **Pilule** au survol / lien actif (`background` + `box-shadow` inset).
4. **Variables par thème** `body[data-theme="dark|mid|light"]` : opacité du verre, stack d’ombres et couleurs de liens (Intro sombre, Son/Contact clair, Video/3D mid).

### Fichiers

- `styles.css` : `.side-nav`, `.nav-link`, règles `body[data-theme]`, mobile ≤ 920 / 680 px (blur réduit, nav horizontale avec coins arrondis complets).
- Inchangés : `index.html`, `navigation.js` (`SECTION_THEMES` inchangé).

### Test manuel

```bash
npx serve .
```

1. Desktop : parcourir les 5 sections — menu toujours lisible (halo Soleil, espace noir, Mars, etc.).
2. Vérifier Son / Contact (thème light) et Video / 3D (mid) — contrastes nav distincts.
3. ≤ 680 px : nav en bas à droite, même traitement verre + ombres.
4. Panneaux `frame-right` : `--side-nav-gutter` inchangé.

---

## 2026-06-03 — Trajet extérieur, arc courbé, focus continu

### Contexte

Retour utilisateur : la caméra doit passer **à l'extérieur** du système (planète entre caméra et Soleil), le voyage doit être **courbé**, et le regard ne doit plus **basculer** brutalement entre Soleil et planète — un **pourcentage de focus** doit évoluer en douceur sur tout le leg.

### Scène 3D (`scene3d.js`)

- **`computeSectionCamera`** : normale extérieure renforcée (planète → opposé au Soleil) ; garde `CAM_SURFACE_OFFSET`, tangente, `SECTION_FRAMING`.
- **`computeDynamicArcControls`** : Bézier cubique ; P1/P2 poussés le long de la normale **extérieure** (milieu des positions planètes du leg, loin du Soleil) ; lift vertical réduit pour éviter de couper par l'intérieur du système.
- **`computeSmoothFocusLookAt`** (remplace `computePhasedLookAt`) : `planetFocus = f(legT)` via enveloppe `sin(π·t)` + double `easeInOutSine` ; pic ~0,78 au milieu du leg, ~0,10 au départ, → 0 à l'arrivée ; `lookAt = lerp(sunOrigin, destPlanetPos, planetFocus)` avec position planète destination interpolée sur l'orbite (`getPlanetPosition`).
- **`sampleCameraState`** : arc extérieur + focus continu ; repos → Soleil seul.
- **Inchangés** : `spacecraftEase`, `TRANSITION_MS` 2500, `INTRO_SNAP_FRAMES`, Neptune héro, `REST_ORBIT_DRIFT`, `PLANET_SPIN_SCALE`, pas de banking, panneaux / gouttière.

### Test manuel

```bash
node --check scene3d.js; node --check navigation.js
npx serve .
```

1. Intro Neptune : Soleil à l'horizon, planète visible, caméra hors orbite.
2. Transit (ex. Neptune → Saturne) : arc qui **bosse vers l'extérieur**, pas de passage derrière le Soleil ; regard glisse vers Saturne au milieu puis revient au Soleil en fin d'approche **sans snap**.
3. Repos chaque section : Soleil seul, dérive orbitale lente.
4. Panneaux gauche/droite — pas de régression.

---

## 2026-06-03 — Regard caméra par phases en transit

### Contexte

Retour utilisateur : regarder **toujours le Soleil** pendant les transitions réduit la sensation de déplacement. Objectif : cap vers la **planète de destination** en vol, puis retour au **Soleil à l'horizon** à l'atterrissage (cadrage héro existant).

### Scène 3D (`scene3d.js`)

- **`computePhasedLookAt`** : par leg (`legT` déjà eased via `navigation.js` + `spacecraftEase`) :
  - **0–15 %** : `lookAt` Soleil (sortie cadrage héro section départ).
  - **15–55 %** : blend Soleil → centre planète **destination** (`easeInOutSine`).
  - **55–85 %** : cap planète destination.
  - **85–100 %** : blend planète → Soleil (horizon à l'arrivée).
- **`computeDynamicArcControls`** : Bézier cubique inchangée en forme ; `lift` / `side` de `JOURNEY_ARC` × `distScale` (∝ distance entre keyframes héro, clamp 0.72–1.55).
- **`sampleCameraState`** : position Bézier dynamique + `lookAt` phasé ; repos (`fromIndex === toIndex`) → Soleil seul.
- **`updateCamera`** : `camera.lookAt(cam.lookAt)` au lieu de `sunOrigin` fixe ; intro 3 frames snap inchangée ; **pas de banking**.
- **Inchangés** : `computeSectionCamera`, `SECTION_FRAMING`, panneaux / gouttière, `PLANET_SPIN_SCALE`, `INTRO_SNAP_FRAMES`, Neptune intro.

### Test manuel

```bash
node --check scene3d.js; node --check navigation.js
npx serve .
```

1. Intro Neptune : Soleil à l'horizon, planète visible.
2. Transit Neptune → Saturne : regard bascule vers Saturne au milieu du vol, puis Soleil en fin d'approche.
3. Repos chaque section : Soleil seul, arc d'horizon planète.
4. Panneaux gauche/droite — pas de régression.

---

## 2026-06-02 — Rotation propre planètes ralentie

### Contexte

Retour utilisateur : la **rotation sur elle-même** des planètes était trop rapide au repos (à côté de la planète). Distinct de la dérive orbitale autour du Soleil (`REST_ORBIT_DRIFT`).

### Scène 3D (`scene3d.js`)

- **`PLANET_SPIN_SCALE`** (0.25) : facteur global sur `spinSpeed` dans `updatePlanets` — rotation ÷4, relative entre planètes conservée.
- **`REST_ORBIT_DRIFT`**, `orbitSpeed`, anneaux Saturne : inchangés.

### Test manuel

```bash
node --check scene3d.js
npx serve .
```

1. Repos sur chaque section : planète tourne lentement sur son axe, effet cinématique subtil.
2. Dérive orbitale autour du Soleil : inchangée.

---

## 2026-06-02 — Caméra calme : focus Soleil unique

### Contexte

Retour utilisateur : mouvements caméra **trop chaotiques** — banking, roll, changements de regard en vol vers la planète, easings concurrents. Objectif : **focus unique sur le Soleil**, trajectoires naturelles entre keyframes héro, planète visible en périphérie via la **position** caméra uniquement.

### Scène 3D (`scene3d.js`)

- **Regard** : `camera.lookAt(sunOrigin)` à chaque frame — repos **et** transit. Suppression de `computeTransitLookAt`, `lookOffset`, décalage `sunLift` sur le lookAt, lissage look/position concurrent.
- **`computeSectionCamera`** : composition par offset tangent (planète sur un tiers) ; `out.lookAt = sunOrigin` constant.
- **`SECTION_FRAMING`** : retrait de `lookOffset` (plus utilisé pour le regard).
- **Transit position** : Bézier cubique simplifiée (`computeArcControls` sans double easing depart/arrive) ; **`JOURNEY_ARC`** abaissé (~×0.35 lift/side).
- **`updateCamera`** : lissage **position seule** (`posAlpha` 0.16 transit / ~0.8 repos) ; **banking désactivé** ; dutch léger au repos seulement (`activeBlend > 0.5`).
- **`spacecraftEase`** : simplifié en **`easeInOutSine` pur** — une seule courbe UI + caméra, synchronisée avec `pathT = legT`.
- Intro : 3 frames snap, Neptune au tiers, **regard Soleil immédiat**.

### Navigation (`navigation.js`)

- Inchangé structurellement — utilise le `spacecraftEase` simplifié importé depuis `scene3d.js`.

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro : Neptune à droite, **Soleil centré / à l'horizon**, pas de balayage regard planète.
2. Glide : arc doux, regard **fixe sur le Soleil** pendant tout le vol.
3. Repos : dérive orbitale lente, Soleil reste l'ancre visuelle.
4. Panneaux / gouttière nav — inchangés.

---

## 2026-06-02 — Gouttière nav droite (panneaux `frame-right`)

### Contexte

Sur desktop, les panneaux alignés à droite (sections **Son** index 1, **3D** index 3 — `panelOffset: "right"` dans `SECTION_FRAMING`) chevauchaient le menu vertical fixe (INTRO, SON, VIDEO, 3D, CONTACT).

### CSS (`styles.css`)

- Variable **`--side-nav-gutter`** : `clamp(100px, 12vw, 160px)` — marge droite + contrainte `max-width` des `.panel.panel--frame-right`.
- **`.panel.panel--frame-left`** : marge gauche min. `28px` et `width` via `calc(100vw - …)` pour éviter le chevauchement avec la jauge `.scroll-gate` à gauche.
- **`.side-nav`** : `z-index: 4` ; depuis 2026-06-03 aussi panneau verre + ombres texte (voir entrée journal du jour).
- **`body[data-theme]`** : thèmes nav renforcés (dark / mid / light).
- **Mobile ≤ 680px** : `--side-nav-gutter: 0` + règles existantes (panneaux centrés, nav en bas à droite) — pas de gouttière desktop.

### Fichiers inchangés

- `index.html` : structure OK (`side-nav` hors `#overlay`, sections Son / 3D avec `panel-copy` + cartes).
- `navigation.js` / `scene3d.js` : framing inchangé.

### Test manuel

```bash
npx serve .
```

1. Desktop : section Son et 3D — texte et cartes restent à gauche du menu vertical.
2. Desktop : Intro / Video / Contact — panneaux gauche, pas de conflit avec la jauge scroll.
3. ≤ 680px : mise en page centrée inchangée.

---

## 2026-06-02 — Caméra fluide : intro fixée + regard naturel en transit

### Contexte

Retours utilisateur :
1. Mouvement caméra plus **souple et linéaire** (pas de phases saccadées).
2. **Bug intro** : au chargement, la caméra regardait d'abord le Soleil puis basculait vers Neptune — il fallait démarrer **directement** sur le cadrage héro (Neptune au tiers, Soleil à l'horizon).
3. **Regard naturel** en vol : position et direction doivent évoluer ensemble, sans pivot brusque Soleil → planète en fin de trajet.

### Causes identifiées

- **Double easing** : `navigation.js` appliquait déjà `spacecraftEase` sur `displaySection`, puis `sampleCameraState` ré-appliquait `spacecraftEase(legT)` → vitesse perçue irrégulière.
- **LookAt Bézier** entre deux points « Soleil à l'horizon » : en milieu de trajet, le regard partait vers le vide / le Soleil seul, sans planète ni cap de vol.
- **Lissage variable** (`arrivalDamp`, facteurs différents position/look) accentuait les snaps en fin d'arrivée.

### Scène 3D (`scene3d.js`)

- **Intro** : `cameraTargetLook` / `cameraCurrentLook` initialisés sur le keyframe Neptune ; **3 frames de snap dur** (`INTRO_SNAP_FRAMES`) sans lerp ni dérive — pas de fly-in depuis `(0,0,0)` ou vue Soleil seule.
- **`sampleCameraState`** : `pathT = legT` (easing unique via navigation) ; position sur Bézier cubique ; **`computeTransitLookAt`** :
  - 0–20 % : sortie douce depuis le cadrage héro précédent (planète + Soleil visibles).
  - 20–70 % : cap **aligné vitesse courbe** + légère attraction planète intermédiaire.
  - 70–100 % : blend progressif vers cadrage héro destination (Soleil à l'horizon).
- **`spacecraftEase`** : `easeInOutSine` + `easeOutQuint` (plus de `easeOutExpo` agressif).
- **`updateCamera`** : alpha **constant** position/look en transit (`0.20` / `0.22`) ; banking réduit (`0.11` → `0.055`).
- **`CAM_SURFACE_OFFSET`**, **`REST_ORBIT_DRIFT`**, **`TRANSITION_MS`** (2500 ms) inchangés.

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro : Neptune immédiatement cadrée, **aucun** balayage Soleil → planète.
2. Glide : trajectoire plus uniforme, regard suit le vol sans snap Soleil.
3. Départ section : planète reste visible en s'éloignant ; arrivée : Soleil à l'horizon progressif.
4. Repos : dérive orbitale lente inchangée.

---

## 2026-06-02 — Atterrissage caméra plus souple

### Contexte

Retour utilisateur : l'**approche vers la planète** en fin de transit était **trop brusque / rapide**. Objectif : décélération longue et progressive à l'arrivée, sans toucher au décollage ni aux autres systèmes (Neptune intro, `CAM_SURFACE_OFFSET`, `REST_ORBIT_DRIFT`).

### Navigation (`navigation.js`)

- **`TRANSITION_MS`** : 1800 → **2500** ms (plus de temps pour l'atterrissage).

### Scène 3D (`scene3d.js`)

- **`spacecraftEase`** : zone arrivée **25 % → 42 %** du temps UI ; les **40 %** finaux du chemin (`pathT` 0.6→1) passent par `easeOutQuint` puis `easeOutExpo` (freinage très long).
- **`computeArcControls`** : `arriveEase` en `easeOutQuint` (×2.6), point de contrôle **P2** plus proche de la destination (`p2Along` 0.035–0.155) → tangente d'approche plus plate ; départ inchangé.
- **`updateCamera`** : si `pathT > 0.65`, lissage position/lookAt renforcé (facteur ×0.38–1) pour éviter le snap des dernières frames.

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro Neptune : inchangée.
2. Glide : ~2,5 s, décélération visible **bien avant** la planète cible.
3. Arrêt : orbite lente + Soleil à l'horizon — inchangés.

---

## 2026-06-02 — Caméra reculée : arc d'horizon + espace vide

### Contexte

À chaque arrêt sur une planète, la vue était **trop au ras** : la planète remplissait presque tout le cadre sans laisser voir la **courbure de l'horizon**. Il fallait reculer la caméra pour créer un **espace de vide** entre la surface et le cadre, tout en gardant le Soleil à l'horizon et l'échelle épique.

### Scène 3D (`scene3d.js`)

- **`CAM_SURFACE_OFFSET`** (1.38) : multiplicateur global sur `surfaceDist` dans `computeSectionCamera` — distance effective ≈ **1.59× à 1.88×** le rayon selon la planète (Neptune → Mercure).
- **`camTangent`** légèrement augmenté par planète pour conserver la règle des tiers malgré le recul.
- **`SECTION_FRAMING`** : `tangentMul`, `lookOffset` et `elevation` remontés pour garder planète sur un tiers + Soleil/ciel sur l'autre.
- **FOV** : 56° / 52° / 46° (transit / surface / proche Soleil) au lieu de 54° / 48° / 42° — champ plus large pour lire la courbe planétaire.
- Transitions Bézier, **`REST_ORBIT_DRIFT`**, intro Neptune et **`spacecraftEase`** inchangés (keyframes recalculées via `refreshSectionCameras`).

| Section | Planète | Distance caméra (× rayon, effectif) |
|---------|---------|-------------------------------------|
| 0 Intro | Neptune | ~1.88 |
| 1 Son | Saturne | ~1.82 |
| 2 Video | Jupiter | ~1.74 |
| 3 3D | Mars | ~1.66 |
| 4 Contact | Mercure | ~1.59 |

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro : Neptune à droite avec **arc d'horizon visible**, espace vide au-dessus/à gauche, Soleil lointain.
2. Glide : transitions intactes, planète suivante ne domine plus 90 % du cadre.
3. Contact : Mercure plus petite dans le cadre, courbe planétaire + Soleil lisibles.

---

## 2026-06-02 — Transit plus souple + orbite au repos (Soleil visible)

### Contexte

Retour utilisateur : le glide 850 ms et l'easing caméra étaient **à peine perceptibles** ; à l'arrêt sur une planète, il fallait une **orbite lente** gardant le **Soleil à l'horizon** (focus narratif).

### Navigation (`navigation.js`)

- **`TRANSITION_MS`** : 850 → **1800** ms (décollage / atterrissage ressentis).
- Glide UI + overlay : **`spacecraftEase`** importé depuis `scene3d.js` (même courbe que la caméra Bézier).
- Suppression de `easeInOutCubic` sur `displaySection` (évite double easing incohérent).

### Scène 3D (`scene3d.js`)

- **`spacecraftEase`** exporté : zones **25 %** départ / **50 %** croisière / **25 %** arrivée (12 % / 58 % / 30 % du chemin).
- **`JOURNEY_ARC`** + offsets Bézier : arcs nettement plus hauts / latéraux.
- **`REST_ORBIT_DRIFT`** (0.08 rad/s) + **`getOrbitAngleForSection`** : à l'arrêt (`restBlend → 1`), planète et keyframes caméra dérivent sur l'orbite ; en transit, retour progressif sur `heroAngle`.
- **`refreshSectionCameras`** : positions héro dynamiques (plus figées sur `heroAngle` seul).
- Lissage caméra : facteur **0.48** en transit (moins « mou »), **~1** à l'arrêt.
- **Banking** transit : 0.055 → **0.11**.

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro Neptune : grande à droite, Soleil à l'horizon — inchangé.
2. Glide : ~1,8 s, arc visible, décélération nette en fin de trajet.
3. Arrêt sur chaque section : dérive orbitale lente, Soleil reste dans le cadre.
4. Panneaux gauche/droite et pas de scrim plein écran — inchangés.

---

## 2026-06-02 — Trajectoires caméra type vaisseau spatial

### Contexte

L'utilisateur voulait que le déplacement de la caméra entre planètes évoque un **vol spatial** : courbes prononcées en milieu de trajet, **décollage lent** au départ, **atterrissage marqué** à l'arrivée, avec des fonctions d'easing dédiées — sans casser le fix Intro Neptune.

### Scène 3D (`scene3d.js`)

- **`spacecraftEase(t)`** : remap du paramètre de trajet (16 % décollage `easeInQuad`, 56 % croisière `easeInOutCubic`, 28 % atterrissage `easeOutQuart`).
- **`computeArcControls(..., pathT)`** : amplitude d'arc via `sin(π·pathT)` (plat aux extrémités, max au centre) ; points de contrôle Bézier collés aux keyframes en départ/arrivée pour tangentes douces.
- **`JOURNEY_ARC`** : amplitudes relevées (compensées par le scale sin) pour arcs plus visibles en transit.
- **`sampleCameraState`** : échantillonne position/lookAt sur la courbe avec `pathT = spacecraftEase(legT)` (pas de paramètre linéaire sur la Bézier).
- **`updateCamera`** : **banking** (roll Z) proportionnel à `sin(π·legT)` et au côté d'arc ; **lissage position/lookAt** (`lerp`) en transit pour sensation d'inertie ; à l'arrêt (`activeBlend → 1`), snap net sur le cadrage héro.
- Easing auxiliaires : `easeInQuad`, `easeInOutCubic`, `easeOutCubic`, `easeOutQuart`.

### Sync navigation

- `navigation.js` inchangé : glide 850 ms, `displaySection` avec `easeInOutCubic` pour l'UI.
- La caméra applique **`spacecraftEase`** en plus sur la fraction de segment (`legT`) pour un ressenti vol distinct du scroll overlay.

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro : Neptune toujours au tiers droit, Soleil à l'horizon (fix hero intact).
2. Glide : arc visible en milieu de trajet, décélération nette à l'approche de la planète suivante.
3. Banking subtil pendant le transit, nul à l'arrêt sur chaque section.

---

## 2026-06-02 — Fix caméra Intro Neptune (section 0)

### Contexte

Bug rapporté : en section Intro (`displaySection = 0`), la caméra montrait **tout le système solaire centré sur le Soleil** (orbites visibles, Neptune absente) au lieu d’être **au ras de Neptune** avec la planète remplissant le tiers droit et le Soleil petit à l’horizon.

### Causes identifiées

1. **Position initiale caméra** `(14, 7, 16)` — vue d’ensemble du système (~22 u du centre), Neptune (r=44) invisible (point ~1°).
2. **Keyframes caméra sur orbite animée** — `refreshSectionCameras` utilisait `elapsed * orbitSpeed`, décalant parfois la planète hors du champ entre caméra et Soleil.
3. **Désync caméra / mesh** — `orbitMul` différent entre `refreshSectionCameras` et `updatePlanets`.
4. **Neptune trop petite** (rayon 0.62) pour un cadrage héro à orbite 44.

### Corrections (`scene3d.js`)

- **`heroAngle`** par planète + **`getHeroPlanetPosition()`** : keyframes caméra toujours sur angle canonique (planète à côté de la caméra au repos).
- **`getPlanetOrbitBlend()`** : à l’arrêt sur une section, orbite figée sur `heroAngle` ; animation légère uniquement pendant les transitions.
- **`refreshSectionCameras`** : utilise uniquement les positions héros (Bézier stable entre sections).
- **Init caméra** : position Intro Neptune dès `initScene` (plus de fallback vue système).
- **Tailles visuelles** : Neptune 1.48 (×2.4), Saturne 1.28 ; orbites inchangées.
- **`updateOrbitRings()`** : atténuation des orbites intérieures et de l’orbite active en vue surface (opacité ~0.05).

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro : Neptune grande à droite, Soleil lointain à l’horizon, pas de vue « diagramme solaire ».
2. Glide : transitions Bézier intactes, planètes visibles à chaque arrêt.
3. Orbites intérieures quasi invisibles en Intro, plus visibles en approchant le Soleil.

---

## 2026-06-02 — Cadrage caméra + mise en page par section

### Contexte

L'utilisateur voulait des **beaux cadrages** à l'arrivée sur chaque planète (composition type règle des tiers, Soleil à l'horizon opposé) et **réutiliser la même logique pour la mise en page** : le texte UI se place du côté « libre » de l'écran, sans recouvrir la planète.

### Scène 3D (`scene3d.js`)

- **`SECTION_FRAMING`** : paramètres par section (`planetSide`, `tangentMul`, `elevation`, `dutch`, `lookOffset`) + hints layout (`textAlign`, `panelOffset`, `safeSide`).
- **`computeSectionCamera`** : offset tangent signé pour pousser la planète sur un tiers ; décalage du `lookAt` pour garder le Soleil à l'horizon opposé ; légère élévation et dutch par planète.
- **`updateCamera`** : à l'arrêt sur une section (`activeBlend`), réduction du wobble, **derive tangentielle** subtile, roll `dutch` appliqué après `lookAt`.
- **Export** : `getSectionFraming(sectionIndex)` → `{ textAlign, panelOffset, safeSide }`.

| Section | Planète | Texte UI | Planète à l'écran |
|---------|---------|----------|-------------------|
| 0 Intro | Neptune | gauche | droite |
| 1 Son | Saturne | droite | gauche |
| 2 Video | Jupiter | gauche | droite |
| 3 3D | Mars | droite | gauche |
| 4 Contact | Mercure | gauche | droite |

### Navigation + CSS

- **`navigation.js`** : `syncFraming()` ( `body[data-framing]` ), `applyPanelFraming()` pose `panel--frame-left` / `panel--frame-right` sur chaque panneau au init ; appelé depuis `syncUI`.
- **`styles.css`** : panneaux décalés (`margin-left` / `margin-right`), `max-width` réduit, alignement contenu ; transition fade + slide depuis le côté framing à l'activation ; reset centré en mobile (< 680px).
- Pas de scrim plein panneau — `panel-copy` local conservé sur Son / Contact.

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro : Neptune à droite, texte hero à gauche.
2. Glide : alternance gauche/droite section par section, caméra avec légère inclinaison.
3. Contact : Mercure + Soleil à droite, copy à gauche, lisible sans overlay global.

---

## 2026-06-02 — Caméra au ras des planètes (échelle quasi réelle)

### Contexte

Voyage caméra **loin du Soleil (Neptune)** vers **Mercure** : à chaque section, la vue reste **au ras de la planète active**, avec le Soleil **à l'horizon** (contre-jour), et des transitions **Bézier** synchronisées sur `displaySection` (glide 850 ms).

### Scène 3D (`scene3d.js`)

| Section | Planète | Orbite | Distance caméra (× rayon) |
|---------|---------|--------|-----------------------------|
| 0 Intro | Neptune | 44 | 1.38 |
| 1 Son | Saturne | 30 | 1.32 |
| 2 Video | Jupiter | 20 | 1.26 |
| 3 3D | Mars | 11 | 1.20 |
| 4 Contact | Mercure | 5.8 | 1.15 |

- **Placement** : normale **vers l'extérieur** (planète → opposé au Soleil), pas côté jour ; offset tangent réduit pour coller à la surface.
- **Arcs** : `JOURNEY_ARC` abaissés (lift 0.08–0.2) pour éviter les vols trop hauts entre planètes.
- **FOV** : 54° → 48° au ras → 42° près du Soleil ; `far` 480, étoiles 90–160, lumière Soleil portée 220.
- Pas de scrim plein panneau ni `data-sun-dominant`.

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro : Neptune immense à l'écran, Soleil petit au loin.
2. Glide : caméra suit les arcs bas, planète suivante plus proche du centre.
3. Contact : Mercure au ras, Soleil domine le ciel.

---

## 2026-06-02 — Système solaire restauré + panneaux sans scrim

### Contexte

L'utilisateur voulait **revenir au système solaire** (planètes, Soleil, orbites) avec la **caméra à côté de chaque planète** qu'il appréciait, tout en **supprimant les dégradés plein panneau** (`theme-light::before`, `theme-mid::before`) jugés laids — notamment en section Contact.

Pas de `data-sun-dominant` ni détection dynamique du Soleil : thèmes CSS statiques uniquement.

### Scène 3D (`scene3d.js`)

| Section | Planète | Caméra |
|---------|---------|--------|
| 0 Intro | Neptune | au ras, regard vers le Soleil |
| 1 Son | Saturne | anneaux, contre-jour |
| 2 Video | Jupiter | surface stylisée |
| 3 3D | Mars | atmosphère rim |
| 4 Contact | Mercure | proche Soleil |

- Soleil au centre (corona, haze, lumière), 5 orbites, matériaux procéduraux FBM, atmosphères rim, anneaux Saturne.
- **Caméra** : `computeSectionCamera` place la vue **à côté** de la planète active ; transition **Bézier cubique** entre sections (`JOURNEY_ARC`), liée à `displaySection` pendant le glide 850 ms (sans double easing).
- 2800 étoiles, `FogExp2`, FOV dynamique (50° → 44° → 40° près du Soleil).

### Contraste typographique (`styles.css`)

- Suppression des `::before` en dégradé sur `theme-light` et `theme-mid`.
- `theme-light` : texte foncé + `text-shadow` léger.
- `theme-mid` : texte clair + `text-shadow` sombre.
- Sections Son / Contact : bloc `.panel-copy` avec fond blanc semi-opaque **local** (pas overlay plein écran).

### Hero (`index.html`)

Texte voyage solaire : Neptune → centre du système.

### Fichiers touchés

| Fichier | Changement |
|---------|------------|
| `scene3d.js` | Système solaire complet (remplace couloir) |
| `styles.css` | Sans scrims ; `panel-copy` ; text-shadow |
| `index.html` | Hero solaire ; `panel-copy` Son + Contact |
| `main.js` | Inchangé |
| `navigation.js` | Inchangé (`SECTION_THEMES` statiques) |

### Test manuel

```bash
node --check scene3d.js; node --check main.js; node --check navigation.js
npx serve .
```

1. Intro : Neptune visible, caméra à côté.
2. Glide section par section : arcs caméra, planètes successives.
3. Contact : texte foncé lisible **sans** grand rectangle blanc-gris sur tout le panneau.
4. Menu + jauge synchronisés après glide.

---

## Historique

- **2026-06-02** — Rollback couloir 3D (prompt utilisateur « avant solaire ») — **remplacé** par cette restauration solaire ciblée.
- **2026-06-02** — Contraste typographique simplifié (CSS statique).
- **2026-06-02** — Three.js premium + modules (`navigation.js`, `scene3d.js`, `main.js`).
- Initialisation base vitrine Three.js + couloir 3D.
