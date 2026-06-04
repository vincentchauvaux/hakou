# Hakou Site — Notes agent



## Navigation (`navigation.js`)



- **8 sections** (indices 0–7), scroll gating via molette / clavier / touch. `sectionCount` et `scaleSectionMax` dérivés de `panels.length` à l’init.

- **Modèle spatial** : section **0 = Intro / Neptune (loin)**, section **7 = Contact / Mercure (proche Soleil)**. Avancer = index++ = vers le Soleil. **Étapes intermédiaires intérieures** : §5 **RPG CR** (orbite 3D : Vénus), §6 Terre (avant Contact).

- **Entrées inversées pour le réalisme** :

  - Molette **vers le haut** (`deltaY < 0`) → section suivante (vers le Soleil).

  - Molette **vers le bas** → section précédente (s’éloigner).

  - Clavier : **Flèche haut / PageUp** = suivant ; **Flèche bas / PageDown / Espace** = précédent.

  - Touch : glisser le doigt **vers le haut** = suivant (comme la molette).

- **Menu latéral** (`index.html`) : ordre DOM **Contact → … → Intro** (desktop : colonne droite, proche Soleil en haut). Les `data-zone-link` restent 0–7 alignés sur les sections. **Desktop** : `.side-nav` en `width: fit-content`, `align-items: flex-start`, `padding` uniforme (10px ; 8px si `≤920px` ou laptop compact), `overflow-y: hidden` (pas de réserve scrollbar) ; `.nav-link` padding carré (8px desktop, 6px resserré) ; liens `width: auto` (évite le vide à droite des libellés courts). Scroll nav seulement en **laptop compact** (`overflow-y: auto`, `scrollbar-gutter: stable`). Grand desktop (`min-height: 821px`) : nav sans scroll. **`syncUI` / `syncNavLinks`** : état actif via `Number(link.dataset.zoneLink)`, **pas** l’index DOM ; **un seul** lien actif à la fois (y compris en transit). Panels : `getPanelZone(panel)` via `data-zone`. Entrée **Visuel** (`data-zone-link="3"`) entre Video et 3D ; **RPG CR** (5) et **Terre** (6) entre 3D et Contact.

- **Mobile (`≤680px`)** : échelle solaire **horizontale en haut** (Neptune à gauche, Soleil implicite au-delà de Mercure à droite ; marqueur `left: calc((1 - var(--scale-progress)) * 100%)`, **8×8 px**, ticks **1×6 px**, jauge `.solar-scale-gauge` en `width`/`left` pendant le glide uniquement). Menu **barre pleine largeur en bas** : pills égaux (`flex: 1`), ordre visuel **Intro → … → Contact** via `order` CSS sur `data-zone-link`. Gutter panels : `--mobile-solar-top` / `--mobile-chrome-top` (rail + safe-area) / `--mobile-chrome-bottom`. **Chrome viewport** : `body::before` (fixe, `z-index: 2`, dégradé opaque `--bg` **sans** `backdrop-filter` — évite le voile clair sous l’échelle au glide) et `body::after` (verre + blur pour la nav bas) masquent le `#overlay` qui translate ; `#solar-scale` (`z-index: 3`, **fond transparent**, pas de pilule verre) et `.side-nav` (`z-index: 4`) au-dessus. `--mobile-chrome-top` = `calc(var(--mobile-solar-top) + 22px)`.

- **Laptop compact (`min-width: 681px` et `max-height: 820px`)** : layout desktop conservé (échelle gauche, menu droite). **Chrome haut** : `body::before` fixe (`--compact-chrome-top`, dégradé opaque `--bg`) masque le débordement du `#overlay` en glide (évite l’aperçu d’une autre section / scène 3D en haut de l’écran). Panels : `justify-content: flex-start`, padding top/bottom resserrés, **scroll interne** sur `.panel.is-active` (comme mobile, désactivé pendant glide adjacent / long jump). Typo / embeds / cube 3D / grilles réduits ; SoundCloud `min(320px, 42vh)`. Variables composition : `--panel-content-max`, `--panel-section-gap`, `--panel-lead-gap`, `--panel-block-gap`. Bloc `.panel-lead` (titre + chapô) sur Intro, Video, Visuel, 3D, RPG CR, Terre ; Son / Contact gardent `.panel-copy`.

- **Échelle solaire** (`#solar-scale`, desktop gauche ~18px) : rail discret (`.solar-scale-rail`, neutre `rgba(255,255,255,~0.06)`) + **jauge de voyage** (`.solar-scale-gauge`, remplissage léger `color-mix` teinte planète cible / blanc 15 %, visible **uniquement** pendant `isAnimating`) + **8 graduations** fines (`.solar-scale-tick`, `data-stop` 0–7), sans libellés. Rendu **identique** au repos hors glide : pas de fond sur `#solar-scale`, pas de surcharge `body[data-theme="light"]` sur rail/ticks (seul `syncTheme` continue pour le menu). Marqueur **8×8 px** : couleur **par section** (planète d’ancre ou **destination** en transit) — variables CSS `--scale-marker-0`…`7` dans `styles.css`, appliquées via `--scale-marker-color` sur `#solar-scale-marker` ; `navigation.js` `SCALE_MARKER_COLORS` + `updateSolarScale` / `applySolarScaleProgress`. Intro (0) en bas, Contact (7) en haut — le Soleil n’est **pas** le pôle visuel UI (reste implicite au-delà de Mercure / horizon 3D). **Repos** : `--scale-progress` via `scaleProgressFromSection` (`1 - section/(N-1)`). **Pendant glide** (`is-scale-gliding` sur `#solar-scale`) : marqueur **fixe** au stop cible (`glideToIndex`, pas de lerp `displaySection` — évite saut arrière / pas crans par crans) ; jauge **se vide** vers la boule : à `glideT=0` elle couvre tout l’intervalle `[fromP, toP]` ; le bord opposé à la destination recule via `travelP = lerp(fromP, toP, glideT)` — ancrage `toP`, taille `|travelP − toP|` (`updateSolarScaleGauge(toP, travelP, …)`). À l’arrivée : jauge retirée (taille ~0), marqueur = section active. Gutter panels gauche : `--solar-scale-gutter`. **Interaction échelle** (`initSolarScaleInteraction`) : **drag** marqueur ou rail (`pointerdown` / `move` / `up`, `setPointerCapture`, `releaseSolarScalePointerCapture`) : progression libre + magnétisme (`snapSolarScaleProgressMagnetic`, seuil ~38 %). Au **relâchement** : `applySolarScaleProgress` sur le stop cible puis `goToSection` ; le marqueur **reste** à cette position pendant tout le glide. Clic **tick** → `goToSection` (même logique jauge/marqueur). **Axes** : desktop vertical — `clientY` haut → progress **0** (Contact), bas → **1** (Intro) ; jauge `top`/`height` en % ; mobile horizontal — marqueur `left: calc((1 - var(--scale-progress)) * 100%)`, jauge `left`/`width` miroir (même logique de vidage). Pendant drag : `solarScaleDragActive` bloque `updateSolarScale`. Classes `is-scale-dragging` / `is-dragging` / `is-scale-gliding` ; pas de transition `top`/`left` pendant drag ni glide (`::before` zone tactile élargie).

- **Gating scroll** : accumulation molette / clavier / touch (`feedGate`) sans indicateur visuel (ancienne jauge `#scroll-gate` retirée). Desktop : seuil unique `GATE_WHEEL_TOTAL` (140) / touch 72.

- **Scroll interne panel (`≤680px` ou laptop `min-width: 681px` + `max-height: 820px`)** : panel actif `.panel.is-active` avec `overflow-y: auto` entre gutters chrome (`styles.css` : `--mobile-chrome-*` mobile ; `--compact-chrome-*` laptop). `navigation.js` : `PANEL_INTERNAL_SCROLL_MQ` (alias `MOBILE_PANEL_SCROLL_MQ`). Tant que le contenu dépasse, molette / touch ne déclenchent `feedGate` / `goToSection` qu’aux bords : **bas** pour section suivante (vers Soleil, dir +1), **haut** pour section précédente (dir −1). Tampon bord : `getPanelScrollEdgeBuffer()` = `min(80px, 12vh)` ; sur panels à faible défilement, `getEffectivePanelScrollEdgeBuffer(panel)` = `min(tampon, floor(maxScroll/2))` pour que le « bas » reste atteignable (Visuel galerie conserve un tampon utile tant que `maxScroll` est grand). Gate vers section suivante aussi si `panelAtScrollEnd` (scroll natif au max) ou après **4** gestes touch vers le bas sans progression de `scrollTop` près du bas (`MOBILE_TOUCH_SCROLL_STALL_MAX`, embeds type SoundCloud). **Charge bord mobile** (`needsMobileEdgeCharge` / `accumulateMobileEdgeCharge`) : si le panel a un débordement vertical et que `canFeedSectionGate(dir)` est vrai, chaque geste « vers la section » (molette, touch, clavier) remplit d’abord une charge séparée — wheel **220**, touch **108** — avant un pulse `feedGate` de **~59** (`MOBILE_EDGE_GATE_PULSE` = 42 % de 140) ; il faut environ **2–3** charges complètes + pulses pour `gateProgress ≥ 1`. Reset charge si changement de direction, sortie du bord (`canFeedSectionGate` faux), `resetGate` / `touchstart`. Milieu de panel : scroll natif inchangé ; panel sans débordement : pas de charge bord (comportement direct). Détection débordement : 2 px (`PANEL_SCROLL_OVERFLOW_EPS`). Helpers `canFeedSectionGate`, `panelHasVerticalOverflow`, `getPanelByZone`, `resetPanelScrollTop` dans `navigation.js`. **`scrollTop`** : au départ du glide mobile, **uniquement** le panel **destination** (encore invisible en crossfade) ; le panel **sortant** garde sa position jusqu’à la fin du glide, puis `resetGlideDepartingPanelScroll()` ; panel actif aussi `resetActivePanelScroll()` en fin de glide (évite le saut visuel « depuis le haut » mid-transition). Desktop : tous les panels à 0 au `goToSection`. **Son / Video / Visuel** : `padding-bottom` mobile = chrome bas + tampon ; iframe SoundCloud mobile `pointer-events: none` (scroll panel ; lecture via lien ↗). Pendant glide adjacent / long jump : `overflow-y: hidden` sur le panel actif. Desktop inchangé.

- **Mobile chrome** (`styles.css`, `≤680px`) : échelle en barre fine en haut (`--mobile-solar-top`, sans verre) ; masque haut `body::before` opaque (pas de flash clair quand la scène 3D ou les panels passent derrière) ; masque bas `body::after` en verre pour la nav.

- **Transition adjacente** (`span ≤ 1`) : overlay défile verticalement, durée base **3200 ms**, crossfade séquentiel (départ puis arrivée) via `longJumpFadeWeights` + `data-adjacent-glide` (pas de transition CSS parasite).

- **Saut long** (`span > 1`, ex. Intro→Contact) :

  - Overlay **ancré sur la section d'arrivée** (`-glideToIndex × 100vh`) — pas de snap final.

  - Panel départ décalé par `--long-jump-offset` ; panel arrivée à opacité 0 jusqu'à `t > 0.5`.

  - Crossfade séquentiel : départ `1→0` (0–50 %), arrivée `0→1` (50–100 %).

  - Durée : `3200 + (span - 1) × 900 ms` (~8600 ms pour 0→7).

  - `getGlideState()` expose `{ from, to, t, animating }` pour la caméra 3D.

- `getDisplaySection()` exposé pour l’UI (échelle) et le rendu 3D.

- Courbe d'easing partagée : `spacecraftEase()` (easeInOutCubic) dans `scene3d.js`.

- **Thèmes panels** (`SECTION_THEMES`) : Intro dark, Son light, Video mid, Visuel mid, **3D mid (pas de chaleur soleil)**, RPG CR mid, Terre mid, Contact **mercury**. **`syncTheme`** : `body[data-theme]` via index UI actif ; **chaleur fond `--bg` uniquement §5→7** (`lerp` `#05070d` → `#100c08` sur `displaySection`, pas sur 3D/Visuel/Video). Contact reste `theme-mercury`, jamais crème plein écran.



## Scène 3D (`scene3d.js`)



- **Cadrage héro unifié (juin 2026, orbite basse ISS)** : au repos (et convergence glide ≥ `GLIDE_HERO_BLEND_START` **0,92**), toutes les sections partagent le même modèle visuel — satellite en orbite basse autour de la planète d’ancre : **horizon courbe ~40–55 % bas du cadre**, **Soleil petit à l’horizon** (jamais ~80 % écran sauf chaleur élevée Contact). `CAM_SURFACE_OFFSET` **1,48** ; `computeHeroLookAt` : limbe + ciel + `horizonSunBias` × `getHeroSunBiasScale` (**§0–3 ≈ 0,58**, **§4 = 0,52**, §5–6 progressif, §7 plein) + tangente ; **`getHeroLookSunLerp`** (lerp `lookAt` → `sunOrigin`, **§4 = 0,13**, §7 = **0,14**) ; **`orbitSunLift`** + **`sunFrameBias`** (décalage hors axe Soleil–planète) ; `SUN_FRAME_WORLD_BIAS` **0,48**. `enforceMinSunViewDistance` : plafond angulaire + **cap `orbitRadius + surfaceDist`** (évite de repousser la caméra hors orbite intérieure) ; `SUN_MAX_ANGULAR_BY_SECTION` **[0,042 … 0,072, 0,14, 0,18, 0,22]**. Rendu Soleil froid : `SUN_REST_CORE_EMISSIVE` **0,55**, `horizonBoost` **×1,22** si `sunHeat < 0,12`. Transit : `computeSmoothFocusLookAt` (×**0,06**). Drag repos : pivot = `lookAt` héro.

- **Proximité planète (juin 2026)** : `camDistMul` **×~0,85** sur les 8 planètes ; `distScale` **×~0,88** (`SECTION_FRAMING`) — sections intérieures **≤ Mars** subjectivement (Vénus/Terre `distScale` **0,90 / 0,86**). Ex. Neptune **2,40** / **1,53** ; Mars **1,21** / **1,07** ; Vénus **1,05** / **0,90** ; Terre **1,00** / **0,86** ; Mercure **0,87** / **0,81**.

- **Intro (section 0)** : repos = `computeSectionCamera(0)` uniquement. Focale **42 mm**. Neptune `camDistMul` **2,40**, `distScale` **1,53**, `orbitSunLift` **0,08**. `INTRO_SNAP_FRAMES` 5. Pas de dérive caméra au repos Intro.

- **Ordre planètes / caméra** : 0 Neptune → 1 Saturn → 2 Jupiter → **3 Uranus (Visuel)** → 4 Mars (3D) → **5 Vénus (panel RPG CR)** → **6 Terre** → 7 Mercure (Contact) ; le voyage caméra 0→7 reste « vers le Soleil ». **Corps décoratifs 3D** (pas de panel UI) : **Cérès** (orbite ~17×1,2) et **Lune** (orbite ~14×1,2) entre Mars et Vénus — étale l’approche visuelle sans passer à 10 sections.
- **Palette planètes 3D** (`PLANETS` / `DECORATIVE_PLANETS`, juin 2026) : teintes **distinctes** par corps (`color`, `emissive`, `accentColor`, `atmosphereColor`) — Neptune bleu profond ; Saturne beige/doré ; Jupiter orange/brun ; Uranus **cyan-vert** (évite le doublon bleu Neptune) ; Mars rouge ocre ; Vénus jaune chaud pâle ; Terre **vert-bleu** (continents + océan) ; Mercure gris pierre ; Cérès gris-vert ; Lune gris clair. Aligné marqueur échelle (`SCALE_MARKER_COLORS`).

- **Échelle orbitale** (`PLANETS`, juin 2026) : facteur global **`ORBIT_SCALE` 1,2** (~+20 %) — Neptune **69,6**, Saturne **50,4**, Jupiter **33,6**, Uranus **42**, Mars **24** (3D, §4), Vénus **12,2** (§5), Terre **9,1** (§6), Mercure **15,6** (Contact, §7). Caméra far **864**, lumière Soleil portée **480**, brouillard initial **0,005**.

- **Chaleur Soleil 3D** (`getSunHeat`, `SUN_HEAT_START` 4,85 / `SUN_HEAT_SPAN` 2,15) : échelle, halo, lumière et **couleur** (jaune → ocre/rouge via `SUN_PALETTE_OUTER` / `INNER`) **nuls avant §5**, progressifs §5→7. §4 (3D) : disque contenu, fond sombre — **pas** d’immersion crème. Focale repos Mars **42 mm** (§4), Contact **52 mm** (horizon, pas immersion UI).

- **Collision caméra ↔ corps** : sphères Soleil + planètes section (8). `pushPointOutsideSun` / `getSunPushExtraMargin` renforcent les legs vers sections **≥ 4** (Mars et intérieures), sauts **from ≤ 2 → to ≥ 4** et span **≥ 4**. **Ancre** = section repos arrondie ou `glideState.to` en transit. `rectilinearPointRaw` : bosse extérieure / Y / hélice amplifiées si `toIndex ≥ 4`, sauts profonds **from ≤ 2 → to ≥ 4** ; repousse Soleil sur chaque point. Objectif : éviter l'effet « plongée dans le Soleil » — obstruction géométrique par les orbites intérieures + corridor Soleil élargi.

- **Contact (section 7, Mercure)** : `camDistMul` **0,87**, `distScale` **0,81**, `horizonSunBias` **0,42**, `sunFrameBias` **0,46**, `orbitSunLift` **0,09** — horizon Mercure + Soleil **ocre** (`lookSunLift` + lerp lookAt). `nearSun` + clamp surface. `FOCAL_REST_MM[7]` = 52.

- **Vénus (§5)** : `camDistMul` **1,05**, `distScale` **0,90**, `horizonSunBias` **0,32**, focale **46 mm** — début `getSunHeat` / `--bg` chaud.

- **Terre (§6)** : `camDistMul` **1,00**, `distScale` **0,86**, `horizonSunBias` **0,30**, focale **50 mm**.

- **Visuel (§3, Uranus)** : `camDistMul` **1,09**, `distScale` **1,00**, `horizonSunBias` **0,38**, `sunFrameBias` **0,56**, `orbitSunLift` **0,10**, focale **36 mm**.

- **3D (section 4, Mars)** : `distScale` **1,07**, `camDistMul` **1,21**, `horizonSunBias` **0,30**, `sunFrameBias` **0,62**, `orbitSunLift` **0,12**, `SUN_MAX_ANGULAR` §4 **0,072 rad**. **`getSunHeat` = 0** — halos éteints, disque Soleil lisible (`SUN_REST_CORE_EMISSIVE`). **Priorité** : Mars proche + Soleil discret à l’horizon.

- Un seul leg direct `from`→`to` (pas d'étapes intermédiaires UI forcées en caméra — les sections Vénus/Terre sont des destinations glide à part entière).

- `pathT` / focale : **pas de double `spacecraftEase`** (l'easing vient déjà de `navigation.js` via `glideT`).

- **FOV / focale** : `computeGlideFocalMm` — interpolation linéaire `FOCAL_REST_MM[from]` → `FOCAL_REST_MM[to]` sur tout le leg (`legT=1` = focale repos destination). `FOCAL_REST_MM` : `[42, 22, 32, 36, 42, 46, 50, 52]`. Lissage exponentiel (`FOV_LERP_ALPHA`) **uniquement avant 90 % du leg** ; à partir de `GLIDE_FOV_DIRECT_START` (0,9) et en convergence héro : FOV appliqué **directement** (pas de rattrapage post-arrivée).

- **Cadrage Soleil / horizon** : regard au-dessus du limbe + biais Soleil + **`getHeroLookSunLerp`** ; caméra via `sunFrameBias`, **`orbitSunLift`** (hors axe radial), `planetSide`. §7 : blend `lookSunLift` + lerp Contact. Halos (`haloPresence = sunHeat²`) quasi éteints avant §5 ; tone-mapping `1,02 + sunHeat × 0,22`.

- **Convergence héro** (`GLIDE_HERO_BLEND_START` **0,92**) : derniers 8 % — position glide → cadrage héro destination (`computeSectionCamera`). `sampleRectilinearTransfer` force `p1` à `t=1`. Snap position (`posAlpha=1`) dès 92 % ; regard héro pur dès `GLIDE_LOOKAT_HERO_START` (0,95).

- **Glide radial** (`rectilinearPointRaw`) : interpolation **rayon depuis le Soleil** (slerp direction P0→P1), **up stable** (`GLIDE_TORUS_REVOLUTION` **0**, `GLIDE_RADIAL_Y_BREATHE` **0,004**). **+1 section** = rayon décroissant (vers Soleil) ; **−1** = rayon croissant. Pas de bosse / tore déroutants ; `enforceMinSunViewDistance` sur la trajectoire.

- **Anneaux d'orbite 3D** : `TorusGeometry` (tube **0,01**), `MeshBasicMaterial` **#5a7098**, opacité **0,22** max, blending additif — pas de `depthWrite` ni `renderOrder`. Halo atmosphère : sphère ×1,14, shader rim `depthWrite: false`. **Revert juin 2026** (fix « torus caché par atmosphère ») : retrait occluder profondeur invisible, `depthWrite`/`renderOrder` planètes-halo-torus et anneaux Saturne `depthWrite` — assombrissait toute la scène ; luminosité = état d'avant. Compromis connu : le tore peut à nouveau dessiner devant le halo atmosphère (comme avant le fix).

- **Système solaire (orbites indépendantes)** :

  - **Ambiance très calme (juin 2026)** : `PLANET_ORBIT_SPEED_MUL` **0,08** (orbites + `REST_ORBIT_DRIFT`), `PLANET_SPIN_MUL` **0,03** (rotation propre, anneaux, `uTime` shaders), `SCENE_AMBIENT_MOTION_MUL` **0,08** (pulse Soleil, étoiles, wobble cadrage, dérive caméra repos). Ratios relatifs planètes inchangés ; drag orbite manuel (`REST_ORBIT_AZ/EL_SENS`) et glide caméra inchangés.

  - **Toutes les planètes** : angle = `startAngle + elapsed × orbitSpeed × PLANET_ORBIT_SPEED_MUL` en permanence (glide inclus) — pas de capture d'angle, pas de lerp destination/origine pendant le transit caméra.

  - **Rotation propre** : `mesh.rotation.y = elapsed × spinSpeed × axialScale × PLANET_SPIN_SCALE × PLANET_SPIN_MUL` — facteur constant, jamais réinitialisé.

  - **Repos** (`!animating` et section active) : dérive lente de l'angle orbital courant vers `heroAngle` (chemin court, `REST_ORBIT_DRIFT` ≈ 0,005 rad/s) pour le cadrage héro — pas pendant le glide.

  - `getPlanetOrbitBlend` : proximité `displaySection` uniquement (plus de gel from/to en saut long).

- **Repos après glide** (`REST_SETTLE_MS` 280 ms) : **rampe dérive orbitale uniquement** — plus de re-cadrage position / FOV / settle héro séparé (suppression du bloc `settleT` dans `sampleCameraState`).

- Regard aux extrémités de leg : `lookAt` héro (`from`/`to`) ; milieu de leg : `computeSmoothFocusLookAt`.

- Arcs Bézier (`computeDynamicArcControls`) conservés en fichier mais non utilisés pour le sampling caméra.

- Dérive orbitale repos **~0,005 rad/s** (`0,06 × PLANET_ORBIT_SPEED_MUL`), lerp position doux.

- Pendant un saut long : orbites planètes continues ; accent / proximité visuelle via `getActiveSectionIndex` / `getSectionProximity` (from/to).

- **Orbit manuelle au repos** : clic-glisser (ou touch) sur `#three-canvas` quand `!glideState.animating` et `settleT ≥ 1`. Rotation azimut / élévation autour du **`lookAt` héro** (horizon + ciel, `sectionCameras[i].lookAt`) à **rayon constant** — préserve horizon et Soleil dans le cadre. Offsets par section (`sectionUserOrbit`) **réinitialisés** au début de chaque glide (`startGlide` → `resetRestOrbitOffsets()`, détection `wasGlideAnimating` dans `updateGlideSettle`) et à la fin du settle sur la section active. Pendant glide / settle : pas d’application des offsets utilisateur (cadrage héro / trajectoire glide uniquement). Drag interrompu : `releasePointerCapture` dans `endOrbitDrag`. Export `resetRestOrbitOffsets(sectionIndex?)` — sans arg : toutes sections ; avec arg : une section. `navigation.js` ignore le touch vertical si `isRestOrbitDragging()`. Molette inchangée (navigation). Curseur `grab` / `grabbing` (`styles.css`).



## Fichiers clés



| Fichier | Rôle |

|---------|------|

| `main.js` | Boucle RAF, lie navigation + rendu |

| `navigation.js` | Gating scroll, overlay, glide state, échelle solaire |

| `scene3d.js` | Three.js, caméra, planètes (8 sections) |

| `youtube-videos.js` | Zone Video : RSS chaîne au load + repli HTML, vignettes, modal lecture |

| `instagram-gallery.js` | Zone Visuel : JSON local + détection périmètre, grille 3×2, modales |

| `scripts/refresh-instagram-posts.mjs` | Aide rafraîchissement manuel `instagram-posts.json` |
| `scripts/verify-instagram-shortcodes.mjs` | Vérifie les shortcodes listés (endpoint `…/media/?size=l` → 404 = post retiré) |

| `styles.css` | Thèmes panels (dont `theme-mercury` Contact), crossfade, `#solar-scale` 8 ticks, menu latéral (desktop **fit-content** + liens non étirés ; mobile barre bas + échelle haut + masques chrome ; **laptop compact** masque haut + scroll panel / nav si besoin), composition `.panel-lead` / grilles, **`.video-grid`** : desktop / laptop **2 col.** `minmax(0,1fr)` ; **mobile `≤680px`** **1 col.** (`grid-template-columns: 1fr`) ; `column-gap` / `row-gap` **≥16px**, enfants `.youtube-thumb` / `[data-video-id]` en `min-width: 0` + `width: 100%` ; **↗ vignettes** (`.youtube-thumb-external`, `.instagram-thumb-external`) **`display: none`** — ouverture via clic vignette → modal (handlers JS inchangés) ; **`.instagram-grid`** : gaps alignés, **liens contenu** (`--panel-link` : `#fff` dark/mid/mercury ; texte panel sur `theme-light` Son — pas les `.panel-btn`), **CTA RPG CR** (`.panel-btn--primary` accent fond/bordure ; `--secondary` texte panel), cube CSS 3D preview |



## Structure 8 zones



| Index | Panel | Planète | Thème |

|-------|--------|---------|-------|

| 0 | Intro | Neptune | dark |

| 1 | Son | Saturne | light |

| 2 | Video | Jupiter | mid |

| 3 | Visuel | Uranus | mid |

| 4 | 3D | Mars | mid |

| 5 | RPG CR (`#venus`) | Vénus (3D) | mid |

| 6 | Terre | Terre | mid |

| 7 | Contact | Mercure | mercury |



## Vérification



```bash

node --check navigation.js

node --check scene3d.js

node --check main.js

node --check instagram-gallery.js

node --check youtube-videos.js

```



**Laptop 13" (composition + chrome haut)** : DevTools → mode responsive **1280×800** (ou 1366×768), largeur **> 680px**. Vérifier : pas d’autre section visible en haut pendant un glide ; contenu panel sous la zone masquée ; scroll interne sur Son / Video / Visuel avant changement de section ; menu droite + échelle gauche inchangés. **Échelle** : drag marqueur / rail + clic ticks → glide vers la section cible ; pas d’action si glide déjà actif. **Drag** : desktop — glisser vers le **haut** fait **monter** la boule (vers Contact) ; relâcher : boule **reste** au stop magnétique, jauge **pleine** sur `[départ, cible]` puis **se vide** vers la boule pendant le glide (pas de retour arrière ni disparition du marqueur) ; re-drag après repos cohérent. **Mobile** : 390×844 — barre bas 8 items + échelle haut 8 ticks, drag horizontal (gauche Intro → droite Contact), magnétisme + snap release identiques. **Grand desktop** : hauteur **> 820px** (ex. 1440×900) — pas de masque `body::before` laptop, panels centrés verticalement. **Glide Intro→Contact** : traverse RPG CR (§5) + Terre ; Contact ≠ fond soleil écrasant. **Repos 3D** : §3 Visuel, §4 Mars, §7 Contact — horizon planète **plus proche** (cam ×0,85) + **petit disque Soleil** dans le ciel (pas plein écran). **§4** : fond sombre, Soleil discret ; **§5→7** : chaleur progressive ; **Contact** : `theme-mercury` + lueur ocre horizon.



## Contenu externe intégré (`index.html`)



Site statique sans backend dédié : SoundCloud / modales Instagram en iframes ; **YouTube** et **liste Instagram** se synchronisent au **chargement** via `fetch` (voir ci-dessous).



| Zone | Source | Détail |

|------|--------|--------|

| **Son** (`#son`) | [soundcloud.com/hakou](https://soundcloud.com/hakou) | Lecteur iframe via oEmbed SoundCloud — user API `4170372`, hauteur 450 (mode visuel). |

| **Video** (`#video`) | [@MrEtibaliomecus](https://www.youtube.com/@MrEtibaliomecus) | `youtube-videos.js` : au load, **repli immédiat** des `[data-video-id]` / `[data-video-title]` dans `index.html`, puis sync **flux RSS** `https://www.youtube.com/feeds/videos.xml?channel_id=UCmm1lsi4IS7RzwFFhIax3ug` (2 dernières vidéos, ordre flux = récent d’abord, dédupliqué par ID). Si CORS bloque le RSS direct, proxy public `api.allorigins.win` ; si échec → HTML inchangé (pas de flash). Logs console `[Hakou YouTube]`. Vignettes `img.youtube.com/vi/…/hqdefault.jpg`, modal `#youtube-video-modal`. |

| **Visuel** (`#visuel`) | [@kat0gat0](https://www.instagram.com/kat0gat0/) | `instagram-gallery.js` : `fetch` **`content/instagram-posts.json`** (`cache: no-store`, max **6** posts, dédupliqué par shortcode). Miniatures **locales** `assets/instagram/thumb-*.jpg` ; oEmbed navigateur en secours (souvent CORS). **Pas de flux IG automatique** au load — détection périmètre : champ `updatedAt`, comparaison `sessionStorage`, logs `[Hakou Instagram]`. Rafraîchissement manuel : `node scripts/refresh-instagram-posts.mjs` (aide + `--touch-updated`). Grille **3×2**, modales post/profil inchangées. |

| **3D** (`#espace-3d`) | Preview locale | Carte `.card-3d` + cube CSS animé (`.mini-scene`, `.cube`, `.face`) — pas d’embed WebGL dans le panel. |

| **RPG CR** (`#venus`, `data-zone="5"`) | [LM Studio](https://lmstudio.ai/download) + [hakou.be/rpg-cr](https://hakou.be/rpg-cr) | JDR narratif univers Hakou, LLM local via LM Studio. CTA `.panel-btn` : primaire « Télécharger LM Studio » (`target="_blank"` `rel="noopener"`) ; secondaire « Découvrir RPG CR » → `https://hakou.be/rpg-cr`. Nav libellé **RPG CR**. Orbite 3D : planète Vénus inchangée (`SECTION_COUNT` = 8). |

| **Terre** (`#terre`) | Texte éditorial | Ancrage et territoires — placeholder sobre. |

| **Contact** (`#contact`) | Liens réseaux | Instagram `@kat0gat0`, YouTube `@MrEtibaliomecus`, SoundCloud `hakou`. Thème `theme-mercury` (surface rocheuse, Soleil visible en 3D à l'horizon uniquement). |



### Limitations



- **YouTube (dynamique)** : au chargement, RSS chaîne `UCmm1lsi4IS7RzwFFhIax3ug` ; repli HTML si fetch/proxy échoue. **CORS** : le flux direct peut être refusé par le navigateur → proxy `allorigins` (tiers, sans clé). Pas de quota API. Mettre à jour les `data-video-id` dans `index.html` si la chaîne change de handle mais garde la même chaîne — optionnel, le RSS prime quand il répond.

- **SoundCloud** : embed officiel ; couleur accent `%237f9dff` dans l’URL du player. Mobile : iframe non interactive (`pointer-events: none`) pour ne pas bloquer le scroll du panel — ouvrir le profil via le lien sous le lecteur.

- **Instagram (statique + détection)** : pas d’API Meta gratuite côté navigateur. **Liste** : éditer `content/instagram-posts.json` (`updatedAt` ISO + `posts[]`, max **6** vignettes). **Miniatures** : `curl -L -o assets/instagram/thumb-N.jpg "https://www.instagram.com/p/{SHORTCODE}/media/?size=l"` (reels : même shortcode, URL `/p/…/media/`). Après suppression d’un post sur IG : retirer l’entrée du JSON, supprimer le `thumb-N.jpg` orphelin, `node scripts/refresh-instagram-posts.mjs --touch-updated`. **Vérif shortcodes** : `node scripts/verify-instagram-shortcodes.mjs` — `media` en **404** (`text/html`) = publication indisponible (ex. juin 2026 : retrait de `CdodCb2oF46` / `thumb-5.jpg`). oEmbed live : **CORS** / login. Token optionnel : `.env.example` → scripts/cron **serveur** uniquement, jamais dans le repo. **Lecture sur site** : modales + iframe `/embed`. Tester avec `npx serve .` — `file://` bloque JSON/iframes. Script aide : `node scripts/refresh-instagram-posts.mjs`.

- **Clés secrètes** : `.env` gitignoré ; `.env.example` documente `INSTAGRAM_ACCESS_TOKEN`, `YOUTUBE_API_KEY`, `HAKOU_CORS_PROXY_PREFIX` (non lus par les JS du site aujourd’hui).

- **Interaction vidéo zone Video** : plus d’iframe embarquée dans la grille ; vignettes cliquables + modal (comme Instagram Visuel).

