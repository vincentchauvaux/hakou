# Hakou Site — Notes agent



## Stream + Twitch (août 2026)

- UI : zone **Stream** (`#stream`, nav « Stream ») — ex-Radio.
- **Accès restreint** (4 août 2026) : player + chat uniquement si session Google allowlist. Gate [`stream-gate.js`](stream-gate.js) + login Google ; API `GET /api/stream/status` et WebSocket chat exigent le cookie studio. Contenu masqué (`#stream-lock` / `#stream-content`) tant que non connecté. **Noms des comptes** : plus affichés dans l’UI publique (lock, messages « Connecté », aria-label e-mail) — allowlist reste `ALLOWED_EMAILS` côté VPS. Mentions légales / responsable RGPD conservent l’identité éditeur (obligation BE/UE).
- **Enregistrement VPS** (31 août 2026) : **indépendant du live**. Studio : **Enregistrer** + barre **chrono / timeline / Pause / Stop**. Chunks MediaRecorder **pipés** dans ffmpeg (plus de concat WebM) → MP4 AAC **320 kb/s**. Badge **son d’onglet** vs **micro (qualité limitée)**. **Lecture / suppression** : galerie `#stream` + studio « Enregistrements VPS » (auth allowlist, `<video>`, télécharger, supprimer). Fichiers `hakou-YYYYMMDD-HHMMSS.mp4` dans `RECORD_DIR`.
- **Destination live** (31 août 2026) : studio — Hakou seulement / YouTube Live / Twitch (un réseau à la fois). Hakou HLS continue toujours. YouTube = OAuth Live. **URI Google exacte** : `https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/studio/youtube/callback` (sinon `redirect_uri_mismatch`). Twitch = **clé de stream collée** (OAuth Helix optionnel, pas encore `TWITCH_CLIENT_*` sur le VPS). Après save : champ vide **exprès** ; bandeau vert dans la carte (`#studio-tw-result`) + aperçu `live_…xxxx` (`streamKeyHint`, jamais la clé complète) + destination Twitch auto-sélectionnée. Relais ffmpeg RTSP local `:8554` → RTMP. Comptes chiffrés `studio/data/live-accounts.bin`.
- Priorité live : **studio MediaMTX** → **Twitch** → **YouTube** ; hors antenne → **logo Hakou** (plus de playlist YouTube).
- **Logo hors antenne** (4 août 2026) : `assets/logo-hakou.svg` avec `viewBox` calé sur les bounds du path (plus de crop) ; CSS `object-fit: contain`, animation opacité seule (pas de `scale` qui coupait dans le frame `overflow: hidden`).
- API : `GET /hakou-studio/api/stream/status` (alias `/api/radio/status`) — **auth requise**.
- Config Twitch (VPS `/opt/hakou-studio/.env`) :
  - `TWITCH_LOGIN=` login chaîne sans `@` (repli si pas d’OAuth studio)
  - `TWITCH_CLIENT_ID=` / `TWITCH_CLIENT_SECRET=` (app [dev.twitch.tv](https://dev.twitch.tv/console) → Client Credentials + redirect OAuth user)
  - Redirect : `https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/studio/twitch/callback`
  - Miroir optionnel : `twitchLogin` dans [`content/radio.json`](content/radio.json) (lien UI hors live)
- Embed : `https://player.twitch.tv/?channel=…&parent=hakou.be` (consentement médias tiers).
- Note : le chemin HLS MediaMTX `/hakou-live/` peut rester joignable si l’URL est connue — le verrou porte sur l’UI Stream + statut + chat.


## Sécurité (août 2026)

- **HLS / WHEP** : nginx `auth_request` → `GET /api/media/gate` ; cookie HttpOnly `hakou_media` (Path=`/`, TTL 4 h) posé au login / status / studio. Client [`radio.js`](radio.js) : `xhr.withCredentials = true` + WHEP `credentials: "include"`.
- **Captcha contact** : jeton v2 sans `a`/`b` exposés ; preuve HMAC serveur ; secret = `CONTACT_CAPTCHA_SECRET` || `SESSION_SECRET` (refus boot si faible + `HAKOU_STUDIO_PROD=1`).
- **Origin contact** : obligatoire (`CONTACT_REQUIRE_ORIGIN=0` pour désactiver en debug).
- **IP** : `X-Real-IP` / `X-Forwarded-For $remote_addr` (nginx snippets) ; rate-limits auth / status / ingest / contact / chat.
- **Headers** : nosniff, DENY frame, Referrer-Policy, Permissions-Policy, CSP studio ; `/api/health` minimal (`{ ok: true }`).
- **Ingest** : plus de champ `bearer` en clair dupliqué ; `Cache-Control: no-store`.
- **Inbox** : plafond `CONTACT_INBOX_MAX_BYTES` (défaut 5 Mo) + rétention.
- Snippets : [`studio/deploy/nginx-hakou-live.conf.example`](studio/deploy/nginx-hakou-live.conf.example), [`studio/deploy/nginx-hakou-studio.conf.example`](studio/deploy/nginx-hakou-studio.conf.example).
- Helpers : [`studio/security.mjs`](studio/security.mjs).


## Revue juridique (août 2026)

- **Compte rendu** : canvas Cursor [`revue-juridique-hakou.canvas.tsx`](/Users/hakou/.cursor/projects/Users-hakou-hakou/canvases/revue-juridique-hakou.canvas.tsx) — **mise à jour 4 août 2026** (post plan d’action + Stream/Twitch ; pas un avis d’avocat).
- **Verdict actualisé** : documentation légale de base **en place** (mentions / privacy / cookies / CGU / CMP / rétention / licence). Résiduel : **droits musicaux** des lives (SABAM/SACEM) ; Twitch opérationnel seulement après `TWITCH_*` sur le VPS ; modération chat limitée aux CGU + Contact.
- **Juridiction probable** : BE/UE (domaine `.be`, VPS OVH) + sous-traitants US (GitHub Pages, Google, Meta, Twitch si embeds acceptés).

### Mise en conformité (plan d’action — août 2026)

| Priorité | Livrable | Fichiers |
|----------|----------|----------|
| **P0** | Pages légales | [`legal/mentions.html`](legal/mentions.html), [`legal/confidentialite.html`](legal/confidentialite.html), [`legal/cookies.html`](legal/cookies.html), [`legal/cgu.html`](legal/cgu.html), [`legal/legal.css`](legal/legal.css) |
| **P0** | Bannière cookies + médias différés | [`consent.js`](consent.js) ; SoundCloud / IG `data-consent-src` ; gates YouTube / Radio YT / Instagram dans `youtube-videos.js`, `radio.js`, `instagram-gallery.js` ; liens Contact + « Gérer les cookies » |
| **P1** | Chat / Contact informés | Notice chat (pseudo ↔ IP) + liens CGU ; notice RGPD avant submit Contact |
| **P1** | Durcissement données | `allowedEmails` retiré de [`content/auth-config.json`](content/auth-config.json) (allowlist = `ALLOWED_EMAILS` serveur uniquement) ; plus de `allowedHint` / `to: CONTACT_TO` dans les JSON API ; purge inbox `CONTACT_RETENTION_DAYS` (défaut 365) dans [`studio/contact.mjs`](studio/contact.mjs) |
| **P2** | Licence & notices | [`LICENSE`](LICENSE) (MIT), [`NOTICE`](NOTICE) (Three.js MIT, hls.js Apache-2.0) |

- **Consentement** : `localStorage` clé `hakou-consent-v1` = `accepted` \| `essential`. Live studio HLS/WHEP = 1ʳᵉ partie (pas bloqué). YouTube / SoundCloud / Instagram = après acceptation.
- **Déploiement VPS** : redémarrer `hakou-studio` après pull pour appliquer `server.mjs` / `contact.mjs` ; optionnel `CONTACT_RETENTION_DAYS=365` dans `/opt/hakou-studio/.env`.
- **Dernier redéploiement** : 31 août 2026 — feedback clé Twitch (bandeau vert + hint) ; rsync `studio/` ; `pm2 restart hakou-studio`.



## Navigation (`navigation.js`)



- **9 sections** (indices 0–8), scroll gating via molette / clavier / touch. `sectionCount` et `scaleSectionMax` dérivés de `panels.length` à l’init.

- **Modèle spatial** : section **0 = Intro / Pluton (loin)**, section **8 = Contact / Mercure (proche Soleil)**. Avancer = index++ = vers le Soleil. **Ordre réel** : Pluton → Neptune → Uranus → Saturne → Jupiter → Mars → Terre → Vénus → Mercure. **Sites** = §6 Terre ; **Plugin** = §7 Vénus.

- **Entrées scroll (alignées page / overlay)** :

  - Molette / trackpad **vers le bas** (`deltaY > 0`) → section suivante (vers le Soleil).

  - Molette / trackpad **vers le haut** → section précédente.

  - Clavier : **Flèche bas / PageDown / Espace** = suivant ; **Flèche haut / PageUp** = précédent.

  - Touch : glisser le doigt **vers le haut** = suivant (même sens que faire défiler le contenu vers le bas).

  - **Contenu d’abord** : si le panel actif déborde, molette / clavier / touch font défiler le contenu tant que `panelCanScrollBy` ; changement de section **uniquement au bord strict** (bas réel → suivant, haut réel → précédent) + charge bord anti-zap.

- **Menu latéral** (`index.html`) : ordre DOM **Contact → … → Intro** (desktop : colonne droite, proche Soleil en haut). Les `data-zone-link` restent 0–8 alignés sur les sections. **Desktop** : `.side-nav` en `width: fit-content`, `align-items: flex-start`, `padding` uniforme (10px ; 8px si `≤920px` ou laptop compact), `overflow-y: hidden` (pas de réserve scrollbar) ; `.nav-link` padding carré (8px desktop, 6px resserré) ; liens `width: auto` (évite le vide à droite des libellés courts). Scroll nav seulement en **laptop compact** (`overflow-y: auto`, `scrollbar-gutter: stable`). Grand desktop (`min-height: 821px`) : nav sans scroll. **`syncUI` / `syncNavLinks`** : état actif via `Number(link.dataset.zoneLink)`, **pas** l’index DOM ; **un seul** lien actif à la fois (y compris en transit). Panels : `getPanelZone(panel)` via `data-zone`. Entrée **Radio** (`data-zone-link="2"`) entre Son et Video ; **Visuel** (`data-zone-link="4"`) ; **Sites** (6) et **Plugin** (7) entre 3D et Contact.

- **Mobile (`≤680px`)** : échelle solaire **horizontale en haut** (Neptune à gauche, Soleil implicite au-delà de Mercure à droite ; marqueur `left: calc((1 - var(--scale-progress)) * 100%)`, **8×8 px**, ticks **1×6 px**, jauge `.solar-scale-gauge` en `width`/`left` pendant le glide uniquement). Menu **barre pleine largeur en bas** : **scroll horizontal** (`overflow-x: auto`, `touch-action: pan-x`, pills `flex: 0 0 auto` **48×40**, icônes **22 px** — plus de `flex: 1` compressé) ; ordre visuel **Intro → … → Contact** via `order` CSS sur `data-zone-link` (0–8). Touch sur `.side-nav` **exclu** du gating section (`onTouchStart` / `onTouchMove`) pour ne pas bloquer le swipe latéral. **`syncNavLinks`** : `scrollIntoView({ inline: "center" })` de l’item actif si la barre déborde. **Nav icônes** (`index.html`) : chaque `.nav-link` contient `.nav-icon` (SVG stroke `currentColor`, `aria-hidden`) + `.nav-label` (texte masqué visuellement en mobile via clip sr-only, lu par lecteurs d’écran) ; desktop garde le libellé texte, `.nav-icon` en `display: none`. Pictos : Intro maison + planète, Son casque, **Radio ondes**, Video cadre + play, Visuel grille 2×2, 3D cube, **Sites** globe, Plugin prise, Contact enveloppe. Gutter panels : `--mobile-solar-top` / `--mobile-chrome-top` (rail + safe-area) / `--mobile-chrome-bottom`. **Chrome viewport** : `body::before` (fixe, `z-index: var(--chrome-mask-z)` = 2, dégradé opaque `--bg` **sans** `backdrop-filter` — évite le voile clair sous l’échelle au glide) et `body::after` (verre + blur pour la nav bas) masquent le `#overlay` qui translate ; `#solar-scale` et `.side-nav` en `z-index: var(--chrome-z)` = **20** (`isolation: isolate` sur la nav) — **au-dessus** des masques et du canvas/overlay. `--mobile-chrome-top` = `calc(var(--mobile-solar-top) + 22px)`. **`#three-canvas`** (tous viewports) : `pointer-events: none` par défaut ; `pointer-events: auto` seulement en `.orbit-grabbing` (évite que le canvas plein écran masque ou bloque la nav). **`main.js`** : si WebGL échoue (`initScene` → `false`), `body[data-webgl="unavailable"]` et boucle RAF sans `renderScene`. Scripts defer : `youtube-videos.js` / `radio.js` / `instagram-gallery.js` en try/catch (RSS / radio / galerie ne bloquent pas la page).

- **Laptop compact (`min-width: 681px` et `max-height: 820px`)** : layout desktop conservé (échelle gauche, menu droite). **Chrome haut** : `body::before` fixe (`--compact-chrome-top`, dégradé opaque `--bg`) masque le débordement du `#overlay` en glide (évite l’aperçu d’une autre section / scène 3D en haut de l’écran). Panels : `justify-content: safe center` (centré dans la zone visible si le contenu tient, sinon départ en haut pour le scroll), padding top/bottom **symétriques** (chrome + air), **scroll interne** sur `.panel.is-active` (comme mobile, désactivé pendant glide adjacent / long jump). Typo / embeds / cube 3D / grilles réduits ; SoundCloud `min(320px, 42vh)`. Variables composition : `--panel-content-max`, `--panel-section-gap`, `--panel-lead-gap`, `--panel-block-gap`. Bloc `.panel-lead` (titre + chapô) sur Intro, **Radio**, Video, Visuel, 3D, Sites, Plugin ; Son / Contact gardent `.panel-copy`.

- **Échelle solaire** (`#solar-scale`, desktop gauche ~18px) : rail discret (`.solar-scale-rail`, neutre `rgba(255,255,255,~0.06)`) + **jauge de voyage** (`.solar-scale-gauge`, remplissage léger `color-mix` teinte planète cible / blanc 15 %, visible **uniquement** pendant `isAnimating`) + **9 graduations** fines (`.solar-scale-tick`, `data-stop` 0–8), sans libellés. Rendu **identique** au repos hors glide : pas de fond sur `#solar-scale`, pas de surcharge `body[data-theme="light"]` sur rail/ticks (seul `syncTheme` continue pour le menu). Marqueur **8×8 px** : couleur **par section** (planète d’ancre ou **destination** en transit) — variables CSS `--scale-marker-0`…`8` dans `styles.css`, appliquées via `--scale-marker-color` sur `#solar-scale-marker` ; `navigation.js` `SCALE_MARKER_COLORS` + `updateSolarScale` / `applySolarScaleProgress`. Intro (0) en bas, Contact (8) en haut — le Soleil n’est **pas** le pôle visuel UI (reste implicite au-delà de Mercure / horizon 3D). **Repos** : `--scale-progress` via `scaleProgressFromSection` (`1 - section/(N-1)`). **Pendant glide** (`is-scale-gliding` sur `#solar-scale`) : marqueur **fixe** au stop cible (`glideToIndex`, pas de lerp `displaySection` — évite saut arrière / pas crans par crans) ; jauge **se vide** vers la boule : à `glideT=0` elle couvre tout l’intervalle `[fromP, toP]` ; le bord opposé à la destination recule via `travelP = lerp(fromP, toP, glideT)` — ancrage `toP`, taille `|travelP − toP|` (`updateSolarScaleGauge(toP, travelP, …)`). À l’arrivée : jauge retirée (taille ~0), marqueur = section active. Gutter panels gauche : `--solar-scale-gutter`. **Interaction échelle** (`initSolarScaleInteraction`) : **drag** marqueur ou rail (`pointerdown` / `move` / `up`, `setPointerCapture`, `releaseSolarScalePointerCapture`) : progression libre + magnétisme (`snapSolarScaleProgressMagnetic`, seuil ~38 %). Pendant le drag : `solarScaleDragTargetSection` = stop le plus proche (`nearestScaleSectionFromProgress`) ; molette / touch / clavier ignorés si `solarScaleDragActive` (évite `feedGate` ±1 sur tablette). Au **relâchement** : `goToSection(releaseSection)` — **saut long direct** (`span > 1`, comme menu/tick). Clic **tick** → `goToSection(idx)`. **Axes** : desktop vertical — `clientY` haut → progress **0** (Contact), bas → **1** (Intro) ; jauge `top`/`height` en % ; mobile horizontal — marqueur `left: calc((1 - var(--scale-progress)) * 100%)`, jauge `left`/`width` miroir (même logique de vidage). Pendant drag : `solarScaleDragActive` bloque `updateSolarScale`. Classes `is-scale-dragging` / `is-dragging` / `is-scale-gliding` ; pas de transition `top`/`left` pendant drag ni glide (`::before` zone tactile élargie).

- **Gating scroll** : accumulation molette / clavier / touch (`feedGate`) + **indicateur `#scroll-gate`** (anneau + chevron haut/bas). Remplissage = `gateProgress` ; si panel avec overflow, première moitié = charge bord (`mobileEdgeCharge`), seconde = gate. Direction `data-dir` ±1 (bas écran = suivant, haut = précédent). Reset ~220–280 ms sans input. Masqué pendant intro, glide, et mode focus planète. Desktop : seuil `GATE_WHEEL_TOTAL` (140) / touch 72.

- **Scroll interne panel (tous viewports)** : `.panel.is-active` en `overflow-y: auto` (scrollbar masquée) ; désactivé pendant glide adjacent / long jump. `navigation.js` : `isPanelScrollMode()` toujours actif pour le gating ; `PANEL_INTERNAL_SCROLL_MQ` / `isCompactPanelChrome()` réservés aux couches tactile embeds + chrome mobile/laptop. **Priorité contenu** : `panelCanScrollBy(panel, deltaY)` → pas de `feedGate`. Au bord strict uniquement : `panelAtScrollEnd` pour section suivante (dir +1), `scrollTop ≤ 2px` pour précédente (dir −1) — **plus de tampon soft 80px** qui zappait avant la fin du contenu. Stall touch : 4 gestes bloqués près du bas. **Charge bord** : wheel **260**, touch **120**, puis pulses `MOBILE_EDGE_GATE_PULSE`. Direction unifiée `sectionDirFromContentDelta` (bas→suivant) — alignée sur `translateY` de l’overlay (fini le modèle spatial molette-inversé qui contredisait le scroll contenu). Helpers : `canFeedSectionGate`, `panelHasVerticalOverflow`, `getPanelByZone`, `resetPanelScrollTop`. **`scrollTop`** : destination remise à 0 au `goToSection` ; panel sortant reset en fin de glide. **Embeds** (MQ compact uniquement) : `.embed-touch-layer` sur SoundCloud / Radio / Instagram. Padding-bottom Son/Radio/Video/Visuel/Plugin + Sites renforcés : inchangés (mobile / laptop compact).

- **Mobile chrome** (`styles.css`, `≤680px`) : échelle en barre fine en haut (`--mobile-solar-top`, sans verre) ; masque haut `body::before` opaque (pas de flash clair quand la scène 3D ou les panels passent derrière) ; masque bas `body::after` en verre pour la nav. Panels : `justify-content: safe center` dans la zone entre chrome haut/bas.

- **Transition adjacente** (`span ≤ 1`) : overlay défile verticalement, durée base **3200 ms**, crossfade séquentiel (départ puis arrivée) via `longJumpFadeWeights` + `data-adjacent-glide` (pas de transition CSS parasite).

- **Saut long** (`span > 1`, ex. Intro→Contact) :

  - Overlay **ancré sur la section d'arrivée** (`-glideToIndex × 100vh`) — pas de snap final.

  - Panel départ décalé par `--long-jump-offset` ; panel arrivée à opacité 0 jusqu'à `t > 0.5`.

  - Crossfade séquentiel : départ `1→0` (0–50 %), arrivée `0→1` (50–100 %).

  - Durée : `3200 + (span - 1) × 900 ms` (~8600 ms pour 0→7 ; ~9500 ms pour 0→8).

  - `getGlideState()` expose `{ from, to, t, animating }` pour la caméra 3D.

- `getDisplaySection()` exposé pour l’UI (échelle) et le rendu 3D.

- Courbe d'easing partagée : `spacecraftEase()` (easeInOutCubic) dans `scene3d.js`.

- **Thèmes panels** (`SECTION_THEMES`) : Intro dark, Son light, Radio mid, Video mid, Visuel mid, **3D mid (pas de chaleur soleil)**, Sites mid, Plugin mid, Contact **mercury**. **`syncTheme`** : `body[data-theme]` via index UI actif ; **chaleur fond `--bg` uniquement §6→8** (`lerp` `#05070d` → `#100c08` sur `displaySection`, pas sur 3D/Visuel/Video/Radio). Contact reste `theme-mercury`, jamais crème plein écran.



## Scène 3D (`scene3d.js`)



- **Cadrage Contact / Sites (août 2026)** : Mercure §8 — caméra collée (`camDistMul` 1,25 / `distScale` 1,35 / focale 58 / taille min 0,34) ; clamp `nearSun` aligné sur `camDistMul`. Terre §6 Sites — recul (`distScale` 1,22 / `camDistMul` 1,18 / focale 42) pour laisser de l’espace autour du globe.

- **Proximité planète (juin 2026)** : `camDistMul` **×~0,85** sur les 9 planètes ; `distScale` **×~0,88** (`SECTION_FRAMING`) — sections intérieures **≤ Mars** subjectivement (Vénus/Terre `distScale` **0,90 / 0,86**). Ex. Neptune **2,40** / **1,53** ; Mars **1,21** / **1,07** ; Vénus **1,05** / **0,90** ; Terre **1,00** / **0,86** ; Mercure **0,87** / **0,81**.

- **Intro (section 0)** : repos = `computeSectionCamera(0)` uniquement. Focale **42 mm**. Neptune `camDistMul` **2,40**, `distScale` **1,53**, `orbitSunLift` **0,08**. `INTRO_SNAP_FRAMES` 5. Pas de dérive caméra au repos Intro.

- **Ordre planètes / caméra** : 0 **Pluton GLB** → 1 Neptune GLB → 2 Uranus GLB → 3 Saturne GLB (+ anneaux) → 4 Jupiter GLB → 5 Mars GLB → **6 Terre GLB + Lune (Sites)** → **7 Vénus GLB (Plugin)** → 8 Mercure GLB ; Soleil au centre. Voyage 0→8 « vers le Soleil ». **Décoratifs** : Cérès (ceinture) + Lune. Terre : texture **N–S inversée**. Mode **Voir** : vue libre après grab ; retour héro seulement au Retour (blend). Cache-bust `pluto40`.

- **Échelles / spins / ombres (août 2026)** : rayons relatifs ancrés sur Terre ; géants compressés `^0,48`. Inclinaisons / spins sidéraux. **Soleil** `sunKeyLight` sur planète active.

- **Échelle orbitale** (`PLANETS`, juin 2026) : facteur global **`ORBIT_SCALE` 1,2** (~+20 %) — Neptune **69,6**, Saturne **50,4**, Pluton **43,2**, Jupiter **33,6**, Uranus **42**, Mars **24** (3D, §5), Vénus **12,2** (§6), Terre **9,1** (§7), Mercure **15,6** (Contact, §8). Caméra far **864**, lumière Soleil portée **480**, brouillard initial **0,005**.

- **Chaleur Soleil 3D** (`getSunHeat`, `SUN_HEAT_START` 5,85 / `SUN_HEAT_SPAN` 2,15) : échelle, halo, lumière et **couleur** (jaune → ocre/rouge via `SUN_PALETTE_OUTER` / `INNER`) **nuls avant §6**, progressifs §6→8. §5 (3D) : disque contenu, fond sombre — **pas** d’immersion crème. Focale repos Mars **42 mm** (§5), Contact **52 mm** (horizon, pas immersion UI).

- **Collision caméra ↔ corps** : sphères Soleil + planètes section (9). `pushPointOutsideSun` / `getSunPushExtraMargin` renforcent les legs vers sections **≥ 5** (Mars et intérieures), sauts **from ≤ 2 → to ≥ 5** et span **≥ 4**. **Ancre** = section repos arrondie ou `glideState.to` en transit. `rectilinearPointRaw` : bosse extérieure / Y / hélice amplifiées si `toIndex ≥ 5`, sauts profonds **from ≤ 2 → to ≥ 5** ; repousse Soleil sur chaque point. Objectif : éviter l'effet « plongée dans le Soleil » — obstruction géométrique par les orbites intérieures + corridor Soleil élargi.

- **Contact (section 8, Mercure)** : `camDistMul` **0,87**, `distScale` **0,81**, `horizonSunBias` **0,42**, `sunFrameBias` **0,46**, `orbitSunLift` **0,09** — horizon Mercure + Soleil **ocre** (`lookSunLift` + lerp lookAt). `nearSun` + clamp surface. `FOCAL_REST_MM[8]` = 52.

- **Vénus (§6)** : `camDistMul` **1,05**, `distScale` **0,90**, `horizonSunBias` **0,32**, focale **46 mm** — début `getSunHeat` / `--bg` chaud.

- **Plugin (§7, orbite Terre GLB)** : `camDistMul` **1,00**, `distScale` **0,86**, `horizonSunBias` **0,30**, focale **50 mm**.

- **Visuel (§4, Uranus)** : `camDistMul` **1,09**, `distScale` **1,00**, `horizonSunBias` **0,38**, `sunFrameBias` **0,56**, `orbitSunLift` **0,10**, focale **36 mm**.

- **Radio (§2, Pluton)** : `camDistMul` **1,18**, `distScale` **1,04**, focale **28 mm**, teinte mauve.

- **3D (section 5, Mars)** : `distScale` **1,07**, `camDistMul` **1,21**, `horizonSunBias` **0,30**, `sunFrameBias` **0,62**, `orbitSunLift` **0,12**, `SUN_MAX_ANGULAR` §5 **0,072 rad**. **`getSunHeat` = 0** — halos éteints, disque Soleil lisible (`SUN_REST_CORE_EMISSIVE`). **Priorité** : Mars proche + Soleil discret à l’horizon.

- Un seul leg direct `from`→`to` (pas d'étapes intermédiaires UI forcées en caméra — les sections Vénus/Plugin (Terre 3D) sont des destinations glide à part entière).

- `pathT` / focale : **pas de double `spacecraftEase`** (l'easing vient déjà de `navigation.js` via `glideT`).

- **FOV / focale** : `computeGlideFocalMm` — interpolation linéaire `FOCAL_REST_MM[from]` → `FOCAL_REST_MM[to]` sur tout le leg (`legT=1` = focale repos destination). `FOCAL_REST_MM` : `[42, 22, 28, 32, 36, 42, 46, 50, 52]`. Lissage exponentiel (`FOV_LERP_ALPHA`) **uniquement avant 90 % du leg** ; à partir de `GLIDE_FOV_DIRECT_START` (0,9) et en convergence héro : FOV appliqué **directement** (pas de rattrapage post-arrivée).

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

- **Orbit manuelle au repos** : hors mode focus, le canvas reste en `pointer-events: none` (nav / panels prioritaires). **Mode observation planète** (`#planet-focus`) : clic **Voir** → blend `FOCUS_ENTER_MS` 900 ms du cadrage héro (planète en bord, regard horizon) vers une **vue face au globe** (lookAt centre, rayon ~`FOCUS_OBSERVE_RADIUS_MUL` × taille, élévation adoucie) — plus de téléport au premier drag ; **Retour** → blend `FOCUS_EXIT_MS` 680 ms vers héro. Spin gelé pendant grab. Exports `setPlanetFocusMode` / `isPlanetFocusMode` ; `setPlanetFocus` / `isPlanetFocusActive`.

- **Orbit manuelle (détail technique)** : free-orbit si `sectionUserOrbit.modified` via `focusOrbitToPos`. Entrée : branche caméra dédiée `focusEnterActive` (pas de héro parasite) → `commitFocusEnterOrbit` ; sortie : `beginFocusExitBlend` + clear `modified`. Spins : `spinSpeedFromPeriodHours` × `PLANET_SPIN_MUL` ; Uranus / Vénus rétrogrades.



## Fichiers clés



| Fichier | Rôle |

|---------|------|

| `main.js` | Boucle RAF, lie navigation + rendu + intro gate ; repli sans WebGL si `initScene` échoue |

| `intro-gate.js` | Intro : `sessionStorage` skip, gate 3D, clic logo → zoom §0 ; login Google → vol Soleil (§8) puis studio |

| `auth-client.js` | GIS Google + `POST` auth VPS (`content/auth-config.json`) |

| `studio/` | Service Node VPS : auth allowlist + page studio (capture test) |

| `navigation.js` | Gating scroll, overlay, glide state, échelle solaire ; `setNavigationLocked` pendant intro |

| `scene3d.js` | Three.js, caméra, planètes (9 sections) ; mode **intro gate** (logo SVG vectoriel + zoom, sans nébuleuses) |

| `youtube-videos.js` | Zone Video : RSS (pool ~12) → **2 aléatoires** / visite + repli HTML, modal |

| `stream-gate.js` | Auth allowlist pour `#stream` : session `/api/auth/me`, login Google, déverrouille `radio.js` / `radio-chat.js` |
| `radio.js` | Zone **Stream** (`#stream`) : démarre **après** auth ; priorité **studio** → **Twitch live** → live YouTube ; **hors antenne** = logo `assets/logo-hakou.svg` (plus de playlist YouTube) ; poll ~20 s ; status API `credentials: include` |
| `stream-recordings.js` | Galerie MP4 VPS dans `#stream` après auth : `GET /api/studio/recordings` |
| `studio/record.mjs` | Enregistrement VPS : chunks MediaRecorder **stdin ffmpeg** → MP4 AAC 320k — **pas** le live MediaMTX |
| `studio/live-accounts.mjs` | Comptes YouTube/Twitch chiffrés (VPS, hors git) |
| `studio/live-publish.mjs` | Orchestration restream RTMP au « Passer en direct » |
| `studio/restream.mjs` | ffmpeg RTSP local → RTMP YouTube / Twitch |
| `studio/youtube-live.mjs` | OAuth + API YouTube Live (broadcast / stream key) |
| `studio/twitch-live.mjs` | OAuth Helix + ingest RTMP (clé collée) |
| `radio-chat.js` | Chat public Stream (WebSocket VPS) : pseudo `Visiteur-xxxx` dérivé IP (éditable), messages texte/emoji, présence. **Téléphone (≤680px)** : composer 1 ligne (champ + Envoyer), chat plus court, padding bas Stream renforcé, bouton INTRO masqué sur Stream |

| `contact.js` | Zone Contact : formulaire + honeypot / filtres ; e-mail révélé depuis `content/contact-config.json` ; `POST` API VPS `/api/contact` |
| `consent.js` | Bannière cookies (`hakou-consent-v1`) ; monte `data-consent-src` ; callbacks `HakouConsent.onMediaReady` |
| `legal/` | Mentions, confidentialité, cookies, CGU (pages statiques) |

| `content/contact-config.json` | `contactApi`, parties e-mail (`emailUser` / `emailDomain`) |

| `studio/contact.mjs` | Validation serveur, rate-limit, inbox JSONL, envoi SMTP (nodemailer) |

| `instagram-gallery.js` | Zone Visuel : au load, **JSON &lt; 7 j + 6 posts** → grille native immédiate ; sinon découverte client **3 s** (`web_profile_info`, `_sharedData` via allorigins, embed/profil HTML) ; **≥ 1 shortcode** → grille native **3×2 simple** (`…/p/{code}/media/?size=l`, modales post) ; **`.instagram-embed-panel` masqué** dès qu’une grille native s’affiche ; échec → iframe embed **standard** `hakoulik/embed` (~**480–520px**, sans recadrage agressif) ; modale profil via chapô **@hakoulik** ; sync live arrière-plan si grille partielle |

| `scripts/refresh-instagram-posts.mjs` | Pipeline `--refresh` (Graph API / scrape / sources → JSON + thumbs) ; `--playwright` (dev local, Chromium) ; `--touch-updated`, `--download-thumbs` |
| `scripts/refresh-radio-status.mjs` | YouTube Data API (`YOUTUBE_API_KEY`) → `content/radio.json` (live + archives) |
| `content/radio.json` | Config Stream (statusApi, chatWsUrl, Twitch / YouTube ids) |
| `content/instagram-sources.txt` | Permaliens manuels (1/ligne) si Meta bloque le scrape |
| `scripts/verify-instagram-shortcodes.mjs` | Vérifie les shortcodes listés (endpoint `…/media/?size=l` → 404 = post retiré) |

| `styles.css` | Thèmes panels (dont `theme-mercury` Contact), crossfade, `#solar-scale` 9 ticks, `#scroll-gate` (anneau de charge section), `.chrome-actions` (Intro + **Voir** focus planète), `body[data-planet-focus="on"]` (hub fade), menu latéral (desktop **fit-content** + liens non étirés ; mobile barre bas 9 items + échelle haut + masques chrome ; **laptop compact** masque haut + scroll panel / nav si besoin) ; chrome UI `--chrome-z` 20 / masques `--chrome-mask-z` 2 ; `#three-canvas` `pointer-events: none` global (`auto` en focus / `.orbit-grabbing`), **panels `justify-content: safe center`** (centrage vertical écran ; overflow → départ haut), composition `.panel-lead` / grilles, **`.radio-*`** (player 16:9, badge LIVE, archives), **`.video-grid`** : desktop / laptop **2 col.** `minmax(0,1fr)` ; **mobile `≤680px`** **1 col.** ; **↗ vignettes** masquées — clic → modal ; **`.instagram-grid--has-posts`** : grille **3×2** carrée uniforme (`aspect-ratio: 1`, gap uniforme, `min-height: auto`) ; embed repli iframe **~480–520px** desktop (**400–480** laptop, **360–420** mobile), sans offset négatif ni scale ; liens contenu `--panel-link`, **`.sites-grid` masonry** (`columns: 2` / mobile `1`, `.site-card` `break-inside: avoid`) + StreamTV / RPG / Hirakana / Canopée / Abel, cube 3D preview |



## Structure 9 zones



| Index | Panel | Planète | Thème |

|-------|--------|---------|-------|

| 0 | Intro | Pluton (GLB) | dark |

| 1 | Son | Neptune (GLB) | light |

| 2 | Stream (`#stream`) | Uranus (GLB) | mid |

| 3 | Video | Saturne (GLB + anneaux) | mid |

| 4 | Visuel | Jupiter (GLB) | mid |

| 5 | 3D | Mars (GLB) | mid |

| 6 | Sites (`#venus`) | Terre (GLB + Lune) | mid |

| 7 | Plugin (`#plugin`) | Vénus (GLB + nuages) | mid |

| 8 | Contact | Mercure (GLB) | mercury |



## Vérification



```bash

node --check radio.js

node --check contact.js

node --check youtube-videos.js

node --check instagram-gallery.js

node --check studio/public/studio.js

node --check scripts/refresh-radio-status.mjs

node --input-type=module --check < intro-gate.js

# modules ES (navigation / scene3d / main / studio) :
node --input-type=module --check < navigation.js
node --input-type=module --check < scene3d.js
node --input-type=module --check < main.js
node --input-type=module --check < studio/server.mjs
node --input-type=module --check < studio/record.mjs
node --input-type=module --check < studio/live-accounts.mjs
node --input-type=module --check < studio/live-publish.mjs
node --input-type=module --check < studio/restream.mjs
node --input-type=module --check < studio/youtube-live.mjs
node --input-type=module --check < studio/twitch-live.mjs

```



**Laptop 13" (composition + chrome haut)** : DevTools → mode responsive **1280×800** (ou 1366×768), largeur **> 680px**. Vérifier : pas d’autre section visible en haut pendant un glide ; contenu panel sous la zone masquée ; **Intro** (texte seul) centré verticalement dans la zone visible ; sections longues (Son / Stream / Video) scrollent depuis le haut (`safe center`) ; menu droite + échelle gauche inchangés. **Échelle** : drag marqueur / rail + clic ticks → glide vers la section cible ; pas d’action si glide déjà actif. **Drag** : desktop — glisser vers le **haut** fait **monter** la boule (vers Contact) ; relâcher : boule **reste** au stop magnétique, jauge **pleine** sur `[départ, cible]` puis **se vide** vers la boule pendant le glide (pas de retour arrière ni disparition du marqueur) ; re-drag après repos cohérent. **Mobile** : 390×844 — barre bas **9** items + échelle haut **9** ticks, drag horizontal (gauche Intro → droite Contact), magnétisme + snap release identiques ; panels `safe center` (Intro centré, contenu long scrollable). **Grand desktop** : hauteur **> 820px** (ex. 1440×900) — pas de masque `body::before` laptop, panels centrés verticalement (padding hero/outro **symétrique**, plus de biais haut). **Glide Intro→Contact** : traverse Radio (§2), Sites (§6) + Plugin (§7) ; Contact ≠ fond soleil écrasant. **Repos 3D** : §4 Visuel, §5 Mars, §8 Contact — horizon planète **plus proche** (cam ×0,85) + **petit disque Soleil** dans le ciel (pas plein écran). **§5** : fond sombre, Soleil discret ; **§6→8** : chaleur progressive ; **Contact** : `theme-mercury` + lueur ocre horizon.



## Contenu externe intégré (`index.html`)



Site statique sans backend dédié : SoundCloud / modales Instagram / Radio YouTube en iframes ; **YouTube Video**, **Radio** (`content/radio.json`) et **liste Instagram** se synchronisent au **chargement** via `fetch` (voir ci-dessous).



| Zone | Source | Détail |

|------|--------|--------|

| **Son** (`#son`) | [soundcloud.com/hakou](https://soundcloud.com/hakou) | Lecteur iframe via oEmbed SoundCloud — user API `4170372`, hauteur 450 (mode visuel). |

| **Stream** (`#stream`, `data-zone="2"`) | Twitch + [@MrEtibaliomecus](https://www.youtube.com/@MrEtibaliomecus) | `radio.js` : badge **LIVE** / Hors antenne ; player 16:9. Priorité : **studio** → **Twitch** → live YouTube ; hors antenne → **logo Hakou**. Accès allowlist. Chat (`radio-chat.js`). API `…/api/stream/status`. Orbite 3D : **Pluton**. |

| **Video** (`#video`, `data-zone="3"`) | [@MrEtibaliomecus](https://www.youtube.com/@MrEtibaliomecus) | `youtube-videos.js` : au load, **repli immédiat** des `[data-video-id]` dans `index.html`, puis sync **flux RSS** `…/feeds/videos.xml?channel_id=UCmm1lsi4IS7RzwFFhIax3ug` — parse **12** entrées récentes, **shuffle → 2** affichées (chaque visite peut différer). CORS : proxy `api.allorigins.win` ; échec → HTML inchangé (`.video-grid--syncing`, opacité ~0,97, pas de flash). Logs `[Hakou YouTube]`. Vignettes `img.youtube.com/vi/…/hqdefault.jpg`, modal `#youtube-video-modal`. |

| **Visuel** (`#visuel`, `data-zone="4"`) | [@hakoulik](https://www.instagram.com/hakoulik/) | **Build / MAJ** : `node scripts/refresh-instagram-posts.mjs` — Graph API (`.env`), scrape Node, `content/instagram-sources.txt`, thumbs `assets/instagram/thumb-*.jpg` → `content/instagram-posts.json`. **UI** : grille native **3×2 simple** (carrés uniformes, 3 colonnes) — miniatures `media/?size=l` ou `assets/instagram/` ; iframe **masquée** si grille native. **Navigateur** : JSON frais → grille immédiate ; sinon **3 s** découverte ; **≥ 1 shortcode** ; sinon repli iframe embed standard (~**480–520px** desktop, **400–480** laptop, **360–420** mobile). Modales post inchangées. Logs `[Hakou Instagram]`. Voir **Pourquoi pas 6 images auto**. |

| **3D** (`#espace-3d`, `data-zone="5"`) | Preview locale | Carte `.card-3d` + cube CSS animé (`.mini-scene`, `.cube`, `.face`) — pas d’embed WebGL dans le panel. |

| **Sites** (`#venus`, `data-zone="6"`) | [StreamTV](https://vps-e09ed6db.vps.ovh.net/) + [RPG CR](https://vps-e09ed6db.vps.ovh.net/rpg-cr/) + [Hirakana](https://vps-e09ed6db.vps.ovh.net/hirakana/) + [Canopée](https://xn--canope-fva.be/) + [Abel](https://vincentchauvaux.github.io/abel/) + [LM Studio](https://lmstudio.ai/download) | Nav libellé **Sites**. Galerie **masonry** (`.sites-grid` : `columns: 2` desktop / laptop, `1` mobile ; `break-inside: avoid` sur `.site-card`). Cartes : StreamTV (accueil VPS), Hirakana, RPG CR, Canopée (`.site-card--feature`, kicker « Pour ma maman »), **Abel** (suivi bébé, GitHub Pages `vincentchauvaux.github.io/abel/`, kicker « Famille »). Orbite 3D : Vénus. |

| **Plugin** (`#plugin`, `data-zone="7"`) | GitHub | Quatre boutons `.panel-btn` (`target="_blank"`, `rel="noopener"`) : **Hakou Dark Mode** (`#plugin-1`) → `https://github.com/vincentchauvaux/og-elementor-dark-mode/tree/cursor/wporg-publication-prep` ; **OG Time Tab** (`#plugin-2`) → `https://github.com/vincentchauvaux/og-time-tab/archive/refs/heads/master.zip` (`href` + `data-github-zip`, `download`) ; **Hakou Lighthouse** (`#plugin-3`) → `https://github.com/vincentchauvaux/Lighthouse` ; **Space H** (`#plugin-4`) → `https://github.com/vincentchauvaux/spaceh`. Nav **Plugin** ; icône mobile prise. Orbite 3D : Terre GLB (`section: 7`, `earth.glb`). |

| **Contact** (`#contact`, `data-zone="8"`) | Liens + formulaire | Icônes Instagram / YouTube / SoundCloud / e-mail (`.contact-links`, stroke SVG) ; e-mail assemblé en JS (`content/contact-config.json`). Formulaire `contact.js` → `POST /hakou-studio/api/contact` : challenge arithmétique HMAC (`GET /api/contact/challenge`), honeypot, filtres, rate-limit, `Origin`. Inbox JSONL + SMTP optionnel. Thème `theme-mercury`. |



### Pourquoi pas 6 images auto depuis la galerie Instagram



Le site **ne peut pas** ouvrir `instagram.com/@hakoulik`, lire le DOM de la grille et copier les 6 premières images dans la zone Visuel — pour des raisons techniques et légales, pas par choix produit arbitraire.

| Obstacle | Effet |
|----------|--------|
| **CORS / same-origin** | Depuis `hakou.be` (ou `localhost`), `fetch("https://www.instagram.com/…")` est bloqué ou renvoie du HTML inutilisable (mur login), pas un JSON liste de posts. |
| **Iframe embed profil** | `instagram.com/hakoulik/embed` affiche le fil **dans** Instagram ; le parent Hakou **n’a pas accès** au DOM interne (`contentDocument` interdit — origine croisée). Impossible de « prendre les 6 premières images » depuis l’iframe. |
| **Mur login / scrape** | Node (`fetch` profil/embed) et proxy navigateur (allorigins) obtiennent souvent ~700 ko HTML **sans** shortcodes — Meta exige une session. |
| **Pas d’API publique grille** | Pas d’endpoint documenté « 6 derniers posts @user » sans **Instagram Graph API** (token + compte Business/Creator) ou **permaliens manuels** (`instagram-sources.txt`). |
| **Hotlink / ToS** | Même avec shortcodes, les JPG servis par Meta ne sont pas une CDN libre ; le pipeline légitime = permaliens + miniatures **téléchargées au build** (`refresh-instagram-posts.mjs`) ou embed officiel. |

**Alternative UX (implémentée, juin 2026)** :

1. **Grille native Hakou** dès qu’au moins **1 shortcode** est connu : vignettes via `https://www.instagram.com/p/{code}/media/?size=l` (cross-origin affichage OK, pas besoin de lire le DOM Instagram).
2. **JSON + thumbs locales** (`content/instagram-posts.json` &lt; **7 j**, 6 posts) → grille **immédiate** au load ; pipeline Node `refresh-instagram-posts.mjs` pour remplir JSON + `assets/instagram/thumb-*.jpg`.
3. **Découverte client (3 s)** : `web_profile_info` (souvent bloqué CORS/429), `_sharedData` / regex sur HTML profil via **allorigins**, embed/profil — rarement des shortcodes sans session Meta.
4. **Iframe embed** uniquement si **0 shortcode** après 3 s — panel masqué dès qu’une grille native s’affiche (`.instagram-gallery--thumbs`).
5. **Lien chapô `@hakoulik`** → modale `#instagram-profile-modal` ; fonction `renderLinkFallbackGallery` (note + lien) disponible mais **non utilisée** par défaut (repli = iframe).
6. **Sync live** en arrière-plan si grille partielle (&lt; 6 posts).

**Présentation grille native (juin 2026, revert simple)** : retour à une grille **3×2** classique — `.instagram-grid--has-posts` = **3 colonnes**, vignettes **carrées** (`aspect-ratio: 1`), gap uniforme, **`min-height: auto`** (plus de bento `dense` / spans `instagram-grid--count-*`). Mobile **≤680px** : **3 colonnes** conservées. Embed repli : iframe **standard** `hakoulik/embed`, hauteur modérée **~480–520px** (desktop), sans `margin-top` négatif ni `--grid-only`. Clic vignette → modales post inchangées.

**Dev local (optionnel)** : `node scripts/refresh-instagram-posts.mjs --playwright` tente Chromium headless ; souvent bloqué sans login — ne remplace pas Graph API / `instagram-sources.txt`.

### Limitations



- **YouTube (dynamique)** : RSS chaîne `UCmm1lsi4IS7RzwFFhIax3ug`, pool **12** récentes, **2 aléatoires** par chargement (Fisher-Yates). Repli HTML si fetch/proxy échoue. **CORS** : flux direct souvent OK ; sinon proxy `api.allorigins.win` (tiers, sans clé, timeouts possibles). Pas de quota API YouTube Data. `data-video-id` dans `index.html` = filet de sécurité hors-ligne.

- **Stream** : sync live via VPS `…/api/stream/status` (auth). Priorité studio → Twitch → YouTube ; hors antenne → logo Hakou. Chat WebSocket `chatWsUrl`. Studio : **HLS** / **WHEP**. Mobile / laptop : `.embed-touch-layer` sur `.radio-player__frame`.

- **SoundCloud** : embed officiel ; couleur accent `%237f9dff` dans l’URL du player. Mobile / laptop compact : `.embed-touch-layer` sur `.soundcloud-embed` — swipe vertical scroll le panel ; tap court tente play via click synthétique sur l’iframe ; repli lien profil sous le lecteur.

- **Instagram (client poussé + JSON + iframe)** : **Faisable en prod** pour la **grille native** si des **shortcodes** sont connus (JSON, `instagram-sources.txt`, refresh Node) — miniatures `media/?size=l` et modales embed. **Liste auto des 6 derniers posts** : **non fiable** (Meta 429, mur login, CORS sur `web_profile_info` ; allorigins renvoie du HTML sans shortcodes). Navigateur tente quand même 3 s (`web_profile_info`, `_sharedData`, embed/profil). **Source de vérité** liste : `content/instagram-posts.json` + script Node ; iframe `#instagram-embed-panel` si échec total.
- **Instagram — procédure rafraîchissement (juin 2026)** :
  1. `node scripts/refresh-instagram-posts.mjs` — pipeline complet (défaut `--refresh`).
  2. Si **0 shortcode** scrapé : coller jusqu’à **6** permaliens dans `content/instagram-sources.txt`, relancer.
  3. **Token Meta** (optionnel) : `INSTAGRAM_ACCESS_TOKEN` dans `.env` → `graph.instagram.com/me/media`.
  4. **Dev** : `--playwright` si `playwright` installé (souvent mur login sans session).
  5. **Vérif** : `node scripts/verify-instagram-shortcodes.mjs`.
  6. Servir : `npx serve .` (pas `file://`).
- **Instagram — état actuel (juin 2026)** : profil **@hakoulik**. `instagram-posts.json` souvent **vide** (scrape Node : 0 shortcode, `web_profile_info` HTTP 429). **Navigateur** : priorité grille native **3×2 simple** (carrés uniformes, 3 col.) ; iframe masquée si shortcodes ; sinon repli iframe embed standard (~**480–520px** desktop / **400–480** laptop / **360–420** mobile). **Pour remplir la grille** : **6 permaliens** dans `content/instagram-sources.txt` + `node scripts/refresh-instagram-posts.mjs` — ou token `INSTAGRAM_ACCESS_TOKEN`. **Prod** : thumbs `media/?size=l` + modales si shortcodes connus ; auto-liste @hakoulik non fiable.

- **Clés secrètes** : `.env` gitignoré ; `.env.example` documente `INSTAGRAM_ACCESS_TOKEN`, `YOUTUBE_API_KEY` (refresh Radio), `HAKOU_CORS_PROXY_PREFIX` (non lus par les JS du site au runtime).

- **Interaction vidéo zone Video** : plus d’iframe embarquée dans la grille ; vignettes cliquables + modal (comme Instagram Visuel).

## Intro gate (juil. 2026 — Étape 1 + 2)

Au chargement, le site affiche une **porte d’entrée 3D** avant l’accueil Pluton (§0).

- **Assets** : [`assets/logo-hakou.svg`](assets/logo-hakou.svg) chargé via **`SVGLoader`** → formes `ShapeGeometry` (vrai vectoriel 3D, pas une texture bitmap) ; PNG `logo-hakou.png` conservé en secours. **Favicon** : [`assets/favicon.svg`](assets/favicon.svg) (logo blanc, fond transparent) dans l’onglet navigateur. **Icône d’app** (écran d’accueil / PWA) : même logo en PNG opaque [`assets/apple-touch-icon.png`](assets/apple-touch-icon.png) 180×180 + [`assets/icon-192.png`](assets/icon-192.png) / [`assets/icon-512.png`](assets/icon-512.png) via [`site.webmanifest`](site.webmanifest) (iOS n’accepte pas le SVG en `apple-touch-icon`). Branché dans `index.html` ; pages `legal/` et studio : SVG + PNG 180. Anciennes nébuleuses `assets/nebula/*.png` non utilisées (retirées de l’intro).
- **Scène** (`scene3d.js`) : groupe `introGate` — logo SVG vectoriel (stable, **sans bounce**). Au repos : fond `#000` + **univers masqué** (pas de plan-voile). Pendant `startIntroGateZoom` (~3,4 s) : univers réaffiché ; **destination caméra = cadrage §0 live** chaque frame ; fond **reste noir** (pas de lerp couleur / wash) ; brouillard qui s’éclaircit ; logo fondu ; **pas de nébuleuses** ; à la fin `finishIntroZoomToLive` aligne caméra / FOV / `introSnapFrames` sans reset brutal.
- **Import ES unique** : `main.js` / `navigation.js` / `intro-gate.js` importent **`./scene3d.js` sans query string**. Un `?v=` sur l’import crée une **2ᵉ instance** du module (état `introGateActive` / `scene` désynchronisés → logo intro invisible, univers visible pendant le gate). Cache-bust = uniquement l’entrée `index.html` → `main.js?v=…`.
- **UI** (`#intro-gate`) : hit-area `#intro-enter` centrée sur le logo 3D (~52 % viewport haut, sans halo / outline / tap-highlight au clic) ; copy `.intro-copy` **sous le bord bas du logo** (`top: 50% + 28vh`, clampé pour rester à l’écran) : wordmark **hakou.be** (`.intro-brand`, police Italiana) au-dessus du hint « Cliquer sur le logo » (`#intro-hint`). Bouton `#intro-login` haut-droite. **`.chrome-actions`** bas-gauche (visible si `data-intro="done"`) : `#intro-replay` → `replayIntroGate()` ; `#planet-focus` → mode observation planète (voir Navigation / Scène 3D).
- **État** : `body[data-intro="pending"|"playing"|"done"]` masque nav / échelle / overlay pendant pending+playing. `sessionStorage` clé `hakou-intro-done` : skip au refresh de session. `setNavigationLocked(true)` bloque molette / clavier / touch / menu. **Menu latéral** : scrollbar masquée aussi en laptop compact (`scrollbar-width: none` / `::-webkit-scrollbar`).
- **Auth Google (Étape 2)** :
  - Client : [`auth-client.js`](auth-client.js) + GIS ; config publique [`content/auth-config.json`](content/auth-config.json) — **Client ID** renseigné (`245439358451-…apps.googleusercontent.com`), `authApiBase` / `studioUrl` → `https://vps-e09ed6db.vps.ovh.net/hakou-studio` (**pas** d’e-mails allowlist dans le JSON public ; allowlist = `ALLOWED_EMAILS` sur le VPS uniquement).
  - Serveur VPS : `/opt/hakou-studio` (code + `pm2` `hakou-studio` :8787). `POST /api/auth/google` vérifie l’ID token GIS, cookie HttpOnly `SameSite=None; Secure` path `/hakou-studio` + cookie média `hakou_media` Path=`/`. Chat Stream : [`studio/radio-chat.mjs`](studio/radio-chat.mjs) WebSocket `/api/radio/chat` — **auth session** + CORS, rate-limit, sanitisation, plafond IP/clients.
  - **Secrets** : `GOOGLE_CLIENT_SECRET` + `SESSION_SECRET` uniquement dans `/opt/hakou-studio/.env` (`chmod 600`, hors git). Le JSON `client_secret_*.json` Google ne doit **jamais** être committer (`.gitignore`).
  - Nginx : snippet `/etc/nginx/snippets/hakou-studio.conf` (`location /hakou-studio/` → `127.0.0.1:8787`), `include` dans le vhost HTTPS `streamtv` (`vps-e09ed6db.vps.ovh.net`). Exemple repo : [`studio/deploy/nginx-hakou-studio.conf.example`](studio/deploy/nginx-hakou-studio.conf.example).
  - Après login OK : zoom intro (§0) puis **saut long** jusqu’au Soleil (§8 Contact, même glide que le menu) ; overlay masqué (`data-studio-arrive`) ; à l’arrivée **redirect** studio. Sans session → 401 sur `/hakou-studio/`.
  - Setup détaillé : [`studio/README.md`](studio/README.md).
- **Live studio (Étape 3)** :
  - **MediaMTX** `/opt/mediamtx` (systemd `mediamtx`) : WHIP publish path `hakou` (:8889) + HLS (:8888) + ICE UDP **8189** + API :9997.
  - Nginx : `/hakou-live/whip/` → WHIP/WHEP, `/hakou-live/hls/` → HLS ([`studio/deploy/nginx-hakou-live.conf.example`](studio/deploy/nginx-hakou-live.conf.example)). **cookieCheck** : ne **pas** injecter `Cookie: cookieCheck=1` (sinon playlists sans `?session=` + 401 enfants si `Set-Cookie` masqué). Client : `?cookieCheck=1` → `?session=` dans les m3u8. CORS HLS `*` sans credentials (`hls.js` `withCredentials: false`).
  - Studio (auth) : `GET /api/studio/ingest` → URL WHIP + Basic auth publisher ; [`studio/public/studio.js`](studio/public/studio.js) `getDisplayMedia` → WHIP **H264** (`setCodecPreferences`). **Son** : Chrome onglet + « Partager l’audio » (`systemAudio: include`) ; sinon **micro obligatoire** (Safari / fenêtre macOS) — badge **son d’onglet** vs **micro**. **Enregistrement VPS** : bouton séparé, MediaRecorder → pipe ffmpeg `/api/studio/record/*` (pas MediaMTX). **Destination** : Hakou / YouTube / Twitch ; restream RTMP via RTSP local. Spectateurs Radio : autoplay **muet** + bouton **Activer le son** ; piste audio HLS sélectionnée explicitement.
  - Spectateurs : [`radio.js`](radio.js) si auth Stream + `studioLive` / Twitch / YouTube. Hors antenne : **logo Hakou**. Priorité studio > Twitch live > YouTube live.
  - Nginx WHIP/WHEP : CORS origines hakou.be (+ localhost / VPS), headers `Content-Type` / `Accept` pour SDP ; ICE UDP **8189** ouvert (média WebRTC hors nginx).
  - Install : [`studio/deploy/install-mediamtx.sh`](studio/deploy/install-mediamtx.sh) + secrets `MEDIAMTX_PUBLISH_PASS` / `MEDIAMTX_API_PASS` dans `/opt/hakou-studio/.env` et `mediamtx.yml`.

## Déploiement (juillet 2026)

- **Prod** : [hakou.be](https://hakou.be) est servi par **GitHub Pages** (`CNAME` → `hakou.be`, DNS `185.199.x.x`). Pas de déploiement VPS pour ce site statique.
- **Publish** : `git push git@github.com:vincentchauvaux/hakou.git main` (SSH ; le remote HTTPS `origin` peut échouer sans token). Déploiement Pages automatique après push sur `main` (délai cache ~1–10 min).
- **Build optionnel** : `node scripts/refresh-instagram-posts.mjs --refresh` — met à jour `content/instagram-posts.json` + `assets/instagram/thumb-*.jpg` ; `node scripts/refresh-radio-status.mjs` — live + archives Radio. Pas de bundler / compile JS.
- **Dev local** : `npx serve .` (pas `file://`).
- **VPS OVH Hakou** : `vps-e09ed6db.vps.ovh.net` → `51.178.44.114` (SSH `root`, nginx + pm2). Services sous préfixe : `/hirakana/`, `/rpg-cr/`, **`/hakou-studio/`**. Enregistrements capture : `RECORD_DIR=/var/lib/hakou-recordings` + `ffmpeg` (indépendant de MediaMTX). Restream YouTube/Twitch : RTSP MediaMTX `127.0.0.1:8554` + comptes `data/live-accounts.bin`. Ne pas confondre avec **djgoons / nexroof** (`54.76.151.62`, autres projets ; SSH parfois timeout depuis l’agent).

