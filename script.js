/* ================================================================
   script.js  —  GTA V-Style Character Switch · Contact Page
   Plain ES2020, no build step.

   IMPORTANT: Serve via a static HTTP server, not file://
     python3 -m http.server 8080
   Cross-origin fetch to ipapi.co / ipwho.is fails on null origin.
   ================================================================ */

'use strict';

/* ── Destination ────────────────────────────────────────────────── */
const JAIPUR       = [26.9124, 75.7873];
const FALLBACK_LOC = [20, 0]; // Atlantic ocean — neutral world center

const SESSION_KEY = 'gta-intro-played';
const TILE_FAIL_THRESHOLD = 3;

/* ── Phase Enum ─────────────────────────────────────────────────── */
const PHASE = Object.freeze({
  SNAP:    0,
  HOVER:   1,
  FLY:     2,
  DESCENT: 3,
  LANDING: 4,
  DOCK:    5,
  SKIP:    99, // sentinel — abort all in-flight phase runners
});

/* ── Per-phase Color Grades ─────────────────────────────────────────
   filter  → applied directly to #map via style.filter
             CSS transition: filter 620ms ease handles interpolation
   wash    → background of #color-wash overlay (mix-blend-mode: color)
   grain   → opacity of #grain noise overlay
   scanline→ % width of the progress bar fill                         */
const GRADES = {
  [PHASE.SNAP]: {
    filter:   'brightness(0.05) saturate(0)',
    wash:     'rgba(0,0,0,0)',
    grain:    0.00,
    scanline: 0,
  },
  [PHASE.HOVER]: {
    filter:   'hue-rotate(170deg) saturate(0.55) brightness(0.78) contrast(0.9)',
    wash:     'rgba(0,180,140,0.18)',
    grain:    0.40,
    scanline: 20,
  },
  [PHASE.FLY]: {
    filter:   'hue-rotate(0deg) saturate(0.35) brightness(0.72) contrast(0.85)',
    wash:     'rgba(100,100,100,0.15)',
    grain:    0.26,
    scanline: 55,
  },
  [PHASE.DESCENT]: {
    filter:   'hue-rotate(-18deg) saturate(1.05) brightness(0.88) contrast(0.95)',
    wash:     'rgba(200,140,40,0.16)',
    grain:    0.12,
    scanline: 80,
  },
  [PHASE.LANDING]: {
    filter:   'hue-rotate(-25deg) saturate(1.2) brightness(1.0)',
    wash:     'rgba(210,150,50,0.12)',
    grain:    0.00,
    scanline: 95,
  },
  [PHASE.DOCK]: {
    filter:   'hue-rotate(-25deg) saturate(1.2) brightness(1.0)',
    wash:     'rgba(210,150,50,0.12)',
    grain:    0.00,
    scanline: 100,
  },
  [PHASE.SKIP]: {
    filter:   'hue-rotate(-25deg) saturate(1.2) brightness(1.0)',
    wash:     'rgba(210,150,50,0.12)',
    grain:    0.00,
    scanline: 100,
  },
};

/* ── Module State ───────────────────────────────────────────────── */
let map            = null;
let currentPhase   = PHASE.SNAP;
let tileFailCount  = 0;
let markerAdded    = false;
let soundEnabled   = false;
let visitorCoords  = [...FALLBACK_LOC];
let visitorRegion  = null;
let selectedBudget = null;

// Detected once in main() before animation starts
let isMobile = false;

/* ── DOM Helper ─────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Utilities ──────────────────────────────────────────────────── */

/** Round coordinate to nearest 0.5° — blurs precision to state level */
function roundCoord(v) { return Math.round(v * 2) / 2; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchWithTimeout(url, ms) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/* ── IP Geolocation ─────────────────────────────────────────────────
   No navigator.geolocation — silent IP lookup only.
   Coordinates are rounded to ±0.5° (≈55 km) before use.
   Nothing is stored or transmitted further.                         */
async function fetchLocation() {
  const tryProvider = async (url, extract) => {
    try {
      const res = await fetchWithTimeout(url, 2000);
      if (!res.ok) return null;
      const d = await res.json();
      return extract(d);
    } catch {
      return null;
    }
  };

  // Primary: ipapi.co
  let loc = await tryProvider('https://ipapi.co/json/', d =>
    (d.latitude && d.longitude)
      ? { lat: roundCoord(d.latitude), lng: roundCoord(d.longitude), region: d.region || null }
      : null
  );

  // Fallback: ipwho.is
  if (!loc) {
    loc = await tryProvider('https://ipwho.is/', d =>
      (d.latitude && d.longitude)
        ? { lat: roundCoord(d.latitude), lng: roundCoord(d.longitude), region: d.region || null }
        : null
    );
  }

  return loc; // null = both failed → caller uses FALLBACK_LOC
}

/* ── Leaflet Map Init ───────────────────────────────────────────── */
function initMap(center, zoom) {
  map = L.map('map', {
    center,
    zoom,
    zoomControl:       false,
    attributionControl: false,
    dragging:          false,
    touchZoom:         false,
    scrollWheelZoom:   false,
    doubleClickZoom:   false,
    keyboard:          false,
    fadeAnimation:     true,
    zoomAnimation:     true,
    markerZoomAnimation: true,
  });

  const tiles = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 18 }
  );

  // Degrade gracefully on tile failures — CSS class applies fallback gradient
  tiles.on('tileerror', () => {
    tileFailCount++;
    if (tileFailCount >= TILE_FAIL_THRESHOLD) {
      $('map').classList.add('tile-fallback');
    }
  });

  tiles.addTo(map);
}

/* ── Color Grade ────────────────────────────────────────────────────
   Per feedback: filter goes on #map directly, not the overlay.
   CSS `transition: filter 620ms ease` on #map handles interpolation.  */
function applyGrade(phase) {
  const g = GRADES[phase];
  if (!g) return;

  // CSS filter on the map container — this is what grades the satellite imagery
  $('map').style.filter = g.filter;

  // Blend-mode color wash (secondary richness on top of filter)
  $('color-wash').style.background = g.wash;

  // Film grain opacity
  $('grain').style.opacity = String(g.grain);

  // Scanline progress bar
  $('scanline-fill').style.width = g.scanline + '%';
  $('scanline-bar').setAttribute('aria-valuenow', String(g.scanline));
}

/* ── HUD Helpers ────────────────────────────────────────────────── */
function setHud(region, status) {
  if (region !== undefined) $('hud-region').textContent = region;
  if (status !== undefined) $('hud-status').textContent = status;
  $('location-hud').classList.add('visible');
}

function showCrosshair() { $('crosshair').classList.add('visible');  }
function hideCrosshair() { $('crosshair').classList.remove('visible'); }
function showScanline()  { $('scanline-bar').classList.add('visible'); }
function hideScanline()  { $('scanline-bar').classList.remove('visible'); }

/* ── Jaipur Marker ──────────────────────────────────────────────── */
function addJaipurMarker() {
  if (markerAdded || !map) return;
  markerAdded = true;

  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:14px; height:14px; border-radius:50%;
      background:#d4952a;
      border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 0 0 5px rgba(212,149,42,0.22), 0 0 22px #d4952a;
    "></div>`,
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
  });

  L.marker(JAIPUR, { icon }).addTo(map);
}

/* ── Sound ──────────────────────────────────────────────────────── */
function tryPlaySound() {
  if (!soundEnabled) return;
  const audio = $('whoosh-audio');
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {}); // swallow autoplay-policy errors
}

/* ════════════════════════════════════════════════════════════════
   PHASE RUNNERS
   Each runner checks the SKIP sentinel immediately on entry.
   map.once('moveend', …) is used throughout (not map.on) to
   guarantee a single trigger per flyTo call.
   ════════════════════════════════════════════════════════════════ */

async function runPhase0() {
  currentPhase = PHASE.SNAP;
  applyGrade(PHASE.SNAP);

  // Inject a short full-black flash overlay — mimics GTA's whip-pan
  const snap = document.createElement('div');
  snap.id = 'snap-overlay';
  document.body.appendChild(snap);
  await sleep(320); // matches animation duration in CSS
  snap.remove();

  await runPhase1();
}

async function runPhase1() {
  if (currentPhase === PHASE.SKIP) return;
  currentPhase = PHASE.HOVER;
  applyGrade(PHASE.HOVER);

  // Snap to visitor's location instantly
  map.setView(visitorCoords, 4, { animate: false });

  // Show crosshair briefly for the GTA target-lock feel
  showCrosshair();

  if (isMobile) {
    await sleep(180);
    if (currentPhase === PHASE.SKIP) return;
    currentPhase = PHASE.FLY;
    applyGrade(PHASE.FLY);
    map.setView(JAIPUR, 5, { animate: false });
    await runPhase3();
  } else {
    await sleep(350); // brief origin lock-on before the whip starts
    await runPhase2();
  }
}

async function runPhase2() {
  if (currentPhase === PHASE.SKIP) return;
  currentPhase = PHASE.FLY;
  applyGrade(PHASE.FLY);

  // Midpoint roughly between origin and Jaipur
  const mid = [
    (visitorCoords[0] + JAIPUR[0]) / 2,
    (visitorCoords[1] + JAIPUR[1]) / 2,
  ];

  // Three-leg GTA-style whip:
  //   1. Hard zoom-out  (snappy, near-linear easing)
  //   2. Fast lateral rip across the map
  //   3. Sharp zoom-in on Jaipur
  await new Promise(resolve => {

    map.flyTo(visitorCoords, 3, { duration: 0.35, easeLinearity: 0.85 });
    map.once('moveend', () => {
      if (currentPhase === PHASE.SKIP) { resolve(); return; }

      map.flyTo(mid, 2, { duration: 0.40, easeLinearity: 0.85 });
      map.once('moveend', () => {
        if (currentPhase === PHASE.SKIP) { resolve(); return; }

        map.flyTo(JAIPUR, 5, { duration: 0.35, easeLinearity: 0.85 });
        map.once('moveend', () => resolve());
      });
    });
  });

  if (currentPhase !== PHASE.SKIP) await runPhase3();
}

async function runPhase3() {
  if (currentPhase === PHASE.SKIP) return;
  currentPhase = PHASE.DESCENT;
  applyGrade(PHASE.DESCENT);

  // Two rapid step-zooms: approach → city → neighbourhood
  await new Promise(resolve => {
    map.flyTo(JAIPUR, 9, { duration: 0.28, easeLinearity: 0.88 });
    map.once('moveend', () => {
      if (currentPhase === PHASE.SKIP) { resolve(); return; }
      map.flyTo(JAIPUR, 13, { duration: 0.32, easeLinearity: 0.88 });
      map.once('moveend', () => resolve());
    });
  });

  if (currentPhase !== PHASE.SKIP) await runPhase4();
}

async function runPhase4() {
  if (currentPhase === PHASE.SKIP) return;
  currentPhase = PHASE.LANDING;
  applyGrade(PHASE.LANDING);
  hideCrosshair();
  addJaipurMarker();

  await sleep(350);
  if (currentPhase !== PHASE.SKIP) await runPhase5();
}

async function runPhase5() {
  if (currentPhase === PHASE.SKIP) return;
  currentPhase = PHASE.DOCK;
  applyGrade(PHASE.DOCK);

  // Unlock form panel for interaction
  const panel = $('form-panel');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');

  // Slide both panels simultaneously — one rAF ensures the browser hasn't
  // batched these with the inert/aria changes before painting
  requestAnimationFrame(() => {
    panel.classList.add('docked');       // form slides in from left
    $('cinematic').classList.add('docked'); // cinematic slides to right half
  });

  // Pin card appears mid-way through the slide
  await sleep(600);
  const card = $('pin-card');
  card.classList.remove('pin-hidden');
  card.getBoundingClientRect(); // force reflow so opacity transition fires
  card.classList.add('pin-visible');

  sessionStorage.setItem(SESSION_KEY, '1');
}

/* ── Skip Intro ─────────────────────────────────────────────────────
   Sets the SKIP sentinel so any in-flight phase runners bail out.
   map.stop() cancels active flyTo and fires moveend, which the
   pending map.once listener catches — it sees SKIP, calls resolve(),
   and the chained phase function returns immediately.               */
function skipIntro() {
  if (currentPhase === PHASE.SKIP) return;
  currentPhase = PHASE.SKIP;

  if (map) {
    map.stop();
    requestAnimationFrame(() => map.setView(JAIPUR, 13, { animate: false }));
  }

  applyGrade(PHASE.SKIP);
  hideCrosshair();
  addJaipurMarker();

  const card = $('pin-card');
  card.classList.remove('pin-hidden');
  requestAnimationFrame(() => card.classList.add('pin-visible'));

  const panel = $('form-panel');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    panel.classList.add('docked');
    $('cinematic').classList.add('docked');
  });

  sessionStorage.setItem(SESSION_KEY, '1');
}

/* ── Show Final State (reduced-motion / already-played) ─────────────
   Applies docked layout instantly with no transitions.              */
function showFinalState() {
  currentPhase = PHASE.SKIP;

  const app = $('app');
  app.classList.add('no-anim');

  applyGrade(PHASE.SKIP);
  addJaipurMarker();

  const card = $('pin-card');
  card.classList.remove('pin-hidden');
  card.classList.add('pin-visible');

  const panel = $('form-panel');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('docked');
  $('cinematic').classList.add('docked');

  sessionStorage.setItem(SESSION_KEY, '1');

  requestAnimationFrame(() => requestAnimationFrame(() => {
    app.classList.remove('no-anim');
  }));
}

/* ── Budget Pills ───────────────────────────────────────────────── */
function initBudgetPills() {
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
      selectedBudget = pill.dataset.value;
    });
  });
}

/* ── Contact Form ───────────────────────────────────────────────── */
function initContactForm() {
  const form = $('contact-form');

  // Clear invalid state on typing
  form.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => input.classList.remove('invalid'));
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    // Validate each required field
    const checks = [
      { el: $('f-name'),    test: v => v.length > 0 },
      { el: $('f-email'),   test: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
      { el: $('f-project'), test: v => v.length > 0 },
    ];

    let valid = true;
    checks.forEach(({ el, test }) => {
      const ok = test(el.value.trim());
      el.classList.toggle('invalid', !ok);
      if (!ok) valid = false;
    });

    if (!valid) return;

    // Stub submission — swap to a real endpoint / mailto in a later step
    console.log('📬 Contact submission:', {
      name:    $('f-name').value.trim(),
      email:   $('f-email').value.trim(),
      project: $('f-project').value.trim(),
      budget:  selectedBudget,
    });

    // Fade out form, show success
    form.style.transition = 'opacity 280ms ease';
    form.style.opacity    = '0';
    setTimeout(() => {
      form.hidden = true;
      $('form-success').hidden = false;
    }, 280);
  });
}

/* ── Sound Toggle ───────────────────────────────────────────────── */
function initSoundToggle() {
  $('sound-toggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    const btn = $('sound-toggle');
    btn.setAttribute('aria-pressed', String(soundEnabled));
    btn.setAttribute('aria-label', soundEnabled ? 'Disable sound' : 'Enable sound');
    $('icon-muted').style.display = soundEnabled ? 'none' : '';
    $('icon-sound').style.display = soundEnabled ? '' : 'none';
  });
}

/* ════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
   ════════════════════════════════════════════════════════════════ */
async function main() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ?reset in the URL clears the session flag AND forces animation
  // regardless of prefers-reduced-motion — use this to replay the intro:
  //   http://localhost:8080/?reset
  const forcePlay = location.search.includes('reset');
  if (forcePlay) {
    sessionStorage.removeItem(SESSION_KEY);
  }

  const alreadyPlayed = sessionStorage.getItem(SESSION_KEY) === '1';

  // Always initialise interactive UI
  initSoundToggle();
  initBudgetPills();
  initContactForm();

  // Form panel starts inert (keyboard/mouse inaccessible while hidden)
  $('form-panel').inert = true;

  $('skip-btn').addEventListener('click', skipIntro);

  isMobile = window.matchMedia('(max-width: 768px)').matches;

  // ── Fast path: skip straight to final state ──────────────────
  // Bypassed when ?reset is in the URL, even on reduced-motion systems.
  if (!forcePlay && (reducedMotion || alreadyPlayed)) {
    initMap(JAIPUR, 13);
    showFinalState();
    return;
  }

  // ── Animation path ───────────────────────────────────────────
  //
  // CRITICAL: Do NOT await the network before starting the animation.
  // Brave/Firefox shields, VPNs, or slow networks can block ipapi.co
  // and ipwho.is for several seconds, leaving the screen frozen black.
  //
  // Strategy:
  //   1. Fire IP fetch immediately (non-blocking)
  //   2. Init map right now with fallback coords
  //   3. Phase 0 snap-flash (320ms) — covers early tile-load delay
  //   4. Give the fetch 180ms grace after snap = 500ms total window
  //   5. Use result if ready; otherwise use FALLBACK_LOC and continue

  const locPromise = fetchLocation();           // 1 — fire, don't await

  initMap(FALLBACK_LOC, 3);                     // 2 — map up immediately

  // 3 — Phase 0 snap-flash
  currentPhase = PHASE.SNAP;
  applyGrade(PHASE.SNAP);

  const snap = document.createElement('div');
  snap.id = 'snap-overlay';
  document.body.appendChild(snap);

  await sleep(320);     // snap animation plays; IP fetch runs concurrently
  snap.remove();

  // 4 — Give fetch up to 180ms more (500ms total budget)
  const loc = await Promise.race([
    locPromise,
    sleep(180).then(() => null),
  ]);

  // 5 — Apply location or keep fallback
  if (loc) {
    visitorCoords = [loc.lat, loc.lng];
    visitorRegion = loc.region;
  }

  await runPhase1();
}

document.addEventListener('DOMContentLoaded', main);
