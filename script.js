/* ================================================================
   script.js  —  GTA V-Style Character Switch · Contact Page
   Plain ES2020, no build step.

   IMPORTANT: Serve via a static HTTP server, not file://
     python3 -m http.server 8080
   Cross-origin fetch to ipapi.co / ipwho.is fails on null origin.
   ================================================================ */

'use strict';

/* ── Destination & Fallbacks ────────────────────────────────────── */
const JAIPUR = [26.9124, 75.7873];
const FALLBACK_LOC = [34.0522, -118.2437]; // Los Angeles (Los Santos — GTA V homage)

const TILE_FAIL_THRESHOLD = 3;

/* ── Phase Enum ─────────────────────────────────────────────────── */
const PHASE = Object.freeze({
  GROUND: 0,
  OUT_STEP_1: 1,
  OUT_STEP_2: 2,
  OUT_STEP_3: 3,
  ORBIT: 4,
  TRAVERSE: 5,
  PIERCE: 6,
  IN_STEP_1: 7,
  IN_STEP_2: 8,
  IN_STEP_3: 9,
  LANDING: 10,
  DOCK: 11,
  SKIP: 99,
});

/* ── Authentic GTA V Color Grades ──────────────────────────────────
   - Ground level: Rich natural contrast, subtle filmic daylight
   - Ascending: Progressive cooling into desaturated surveillance tone
   - High Orbit: Iconic GTA V slate/teal monochrome satellite look
   - Cloud break & Descent: Warming up rapidly
   - Landing Jaipur: Golden hour Rajasthan warmth & vibrant clarity
────────────────────────────────────────────────────────────────── */
const GRADES = {
  GROUND: {
    filter: 'contrast(1.36) brightness(1.05) saturate(1.85) sepia(0.55) hue-rotate(50deg)',
    wash: 'rgba(110, 175, 42, 0.50)',
    grain: 0.18,
  },
  OUT_1: {
    filter: 'contrast(1.28) brightness(0.98) saturate(1.20) sepia(0.32) hue-rotate(68deg)',
    wash: 'rgba(85, 145, 65, 0.30)',
    grain: 0.22,
  },
  OUT_2: {
    filter: 'contrast(1.28) brightness(0.90) saturate(0.50) hue-rotate(120deg)',
    wash: 'rgba(25, 75, 115, 0.18)',
    grain: 0.28,
  },
  OUT_3: {
    filter: 'contrast(1.36) brightness(0.84) saturate(0.24) hue-rotate(175deg)',
    wash: 'rgba(20, 60, 100, 0.25)',
    grain: 0.35,
  },
  ORBIT: {
    filter: 'contrast(1.48) brightness(0.80) saturate(0.12) hue-rotate(195deg)',
    wash: 'rgba(18, 52, 90, 0.32)',
    grain: 0.40,
  },
  IN_1: {
    filter: 'contrast(1.32) brightness(0.86) saturate(0.45) hue-rotate(120deg)',
    wash: 'rgba(45, 95, 110, 0.18)',
    grain: 0.25,
  },
  IN_2: {
    filter: 'contrast(1.24) brightness(0.95) saturate(0.85)',
    wash: 'rgba(50, 70, 90, 0.10)',
    grain: 0.16,
  },
  IN_3: {
    filter: 'contrast(1.18) brightness(0.98) saturate(0.95)',
    wash: 'rgba(60, 75, 90, 0.08)',
    grain: 0.08,
  },
  LANDING: {
    filter: 'contrast(1.15) brightness(1.02) saturate(1.02)',
    wash: 'rgba(255, 255, 255, 0.04)',
    grain: 0.04,
  },
};

/* ── Module State ───────────────────────────────────────────────── */
let map = null;
let currentPhase = PHASE.GROUND;
let tileFailCount = 0;
let markerAdded = false;
let visitorCoords = [...FALLBACK_LOC];
let visitorState = 'California';
let visitorCountry = 'United States';
let visitorCity = 'Los Angeles';
let stateGeoLayer = null;
let selectedBudget = null;
let isMobile = false;
let soundEnabled = false; // explicit opt-in only — never plays until the user turns it on

/* ── DOM Helper ─────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Utilities ──────────────────────────────────────────────────── */
function roundCoord(v) { return Math.round(v * 2) / 2; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/* ── IP Geolocation ─────────────────────────────────────────────── */
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

  let loc = await tryProvider('https://ipapi.co/json/', d =>
    (d.latitude && d.longitude)
      ? {
        lat: roundCoord(d.latitude),
        lng: roundCoord(d.longitude),
        state: d.region || d.region_code || d.city || 'California',
        country: d.country_name || d.country || 'United States',
        city: d.city || '',
      }
      : null
  );

  if (!loc) {
    loc = await tryProvider('https://ipwho.is/', d =>
      (d.latitude && d.longitude)
        ? {
          lat: roundCoord(d.latitude),
          lng: roundCoord(d.longitude),
          state: d.region || d.region_code || d.city || 'California',
          country: d.country || 'United States',
          city: d.city || '',
        }
        : null
    );
  }

  return loc;
}

/* ── Tile Math & Preloader Engine ───────────────────────────────── */
function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n
  );
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), z: zoom };
}

function getTileUrlsForLocation(lat, lng, zoom, radius = 2) {
  const center = latLngToTile(lat, lng, zoom);
  const maxTile = Math.pow(2, zoom) - 1;
  const urls = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = (center.x + dx + (maxTile + 1)) % (maxTile + 1);
      const y = center.y + dy;
      if (y >= 0 && y <= maxTile) {
        urls.push(`assets/tiles/${zoom}/${y}/${x}.jpg`);
      }
    }
  }
  return urls;
}

const preloadedTileSet = new Set();

function preloadTile(url) {
  if (preloadedTileSet.has(url)) return Promise.resolve(true);
  preloadedTileSet.add(url);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function preloadBatch(urls, maxConcurrent = 6) {
  return new Promise(resolve => {
    if (!urls.length) { resolve(); return; }
    let index = 0;
    let active = 0;
    let finished = 0;

    const next = () => {
      if (finished >= urls.length) {
        resolve();
        return;
      }
      while (active < maxConcurrent && index < urls.length) {
        const url = urls[index++];
        active++;
        preloadTile(url).then(() => {
          active--;
          finished++;
          next();
        });
      }
    };
    next();
  });
}

/**
 * Preloads all critical map tiles into browser HTTP cache.
 * Exported to window so parent portfolio pages can call this
 * early in the background (e.g. when landing on Hero section).
 */
async function preloadGTAMap(originCoords = null) {
  const origin = originCoords || visitorCoords || FALLBACK_LOC;

  // 1. Critical Priority: Initial state view at visitor origin (zoom 7 & 6)
  const initialUrls = [
    ...getTileUrlsForLocation(origin[0], origin[1], 7, 2),
    ...getTileUrlsForLocation(origin[0], origin[1], 6, 2),
  ];

  // 2. High Priority: Final destination Jaipur landing (zoom 15 & 12)
  const jaipurFinalUrls = [
    ...getTileUrlsForLocation(JAIPUR[0], JAIPUR[1], 15, 2),
    ...getTileUrlsForLocation(JAIPUR[0], JAIPUR[1], 12, 2),
  ];

  // 3. Medium Priority: Intermediate zoom steps & orbital flight
  const intermediateUrls = [
    ...getTileUrlsForLocation(origin[0], origin[1], 5, 1),
    ...getTileUrlsForLocation(origin[0], origin[1], 4, 1),
    ...getTileUrlsForLocation(origin[0], origin[1], 3, 1),
    ...getTileUrlsForLocation(JAIPUR[0], JAIPUR[1], 3, 1),
    ...getTileUrlsForLocation(JAIPUR[0], JAIPUR[1], 6, 2),
    ...getTileUrlsForLocation(JAIPUR[0], JAIPUR[1], 9, 2),
  ];

  // Warm origin and final landing tiles first
  await preloadBatch([...initialUrls, ...jaipurFinalUrls], 6);

  // Warm intermediate steps in the background
  preloadBatch(intermediateUrls, 6);
}

// Export for parent portfolio page integration
window.preloadGTAMap = preloadGTAMap;

/* ── Leaflet Map Init ───────────────────────────────────────────── */
function initMap(center, zoom) {
  map = L.map('map', {
    center,
    zoom,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    keyboard: false,
    fadeAnimation: true,
    zoomAnimation: true,
    markerZoomAnimation: true,
  });

  // Custom TileLayer that loads pre-cached local tiles with transparent online fallback
  const LocalTileLayer = L.TileLayer.extend({
    createTile: function (coords, done) {
      const tile = document.createElement('img');
      tile.setAttribute('role', 'presentation');

      L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));

      let triedOnline = false;
      tile.onerror = () => {
        if (!triedOnline) {
          triedOnline = true;
          tile.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${coords.z}/${coords.y}/${coords.x}`;
        } else {
          this._tileOnError(done, tile, new Error('Tile load error'));
        }
      };

      tile.src = this.getTileUrl(coords);
      return tile;
    }
  });

  const tiles = new LocalTileLayer(
    'assets/tiles/{z}/{y}/{x}.jpg',
    {
      maxZoom: 18,
      maxNativeZoom: 18,
      updateWhenIdle: false,
      updateInterval: 50,
      keepBuffer: 14,
    }
  );

  tiles.on('tileerror', () => {
    tileFailCount++;
    if (tileFailCount >= TILE_FAIL_THRESHOLD) {
      $('map').classList.add('tile-fallback');
    }
  });

  tiles.addTo(map);
}

/* ── Color Grade ────────────────────────────────────────────────── */
function applyGrade(gradeKey) {
  const g = GRADES[gradeKey];
  if (!g) return;

  const mapEl = $('map');
  if (mapEl) mapEl.style.filter = g.filter;

  const washEl = $('color-wash');
  if (washEl) washEl.style.background = g.wash;

  const grainEl = $('grain');
  if (grainEl) grainEl.style.opacity = String(g.grain);
}

/* ── Flash Triggers (Blinding White Photoflash) ─────────────────── */
function triggerFlash(type = 'burst') {
  const flash = $('white-flash');
  if (!flash) return;
  flash.className = '';
  void flash.offsetWidth; // force DOM reflow
  flash.className = (type === 'pierce') ? 'flash-pierce' : 'flash-burst';
}

/* ── Cloud Layer Controls ──────────────────────────────────────── */
function setClouds(state) {
  const clouds = $('cloud-container');
  if (!clouds) return;
  clouds.className = '';
  if (state === 'active') {
    clouds.classList.add('clouds-active');
  } else if (state === 'traveling') {
    clouds.classList.add('clouds-active', 'clouds-traveling');
  } else if (state === 'part') {
    clouds.classList.add('clouds-part');
  }
}

/* ── Idle Camera Breathing (prevents frozen-slideshow feel on holds) ─ */
function addBreathing() {
  const mapEl = $('map');
  if (mapEl) mapEl.classList.add('breathing');
}
function removeBreathing() {
  const mapEl = $('map');
  if (mapEl) mapEl.classList.remove('breathing');
}

/* ── Supersonic Speed Streaks (radial motion blur during the whip) ── */
function triggerSpeedStreaks() {
  const el = $('speed-streaks');
  if (!el) return;
  el.classList.remove('active');
  void el.offsetWidth; // force reflow so the animation replays
  el.classList.add('active');
}

/* ── Crosshair Reticle Controls ────────────────────────────────── */
function showCrosshair() {
  const ch = $('crosshair');
  if (ch) {
    ch.classList.remove('locked');
    ch.classList.add('visible');
  }
}

function lockCrosshair() {
  const ch = $('crosshair');
  if (ch) {
    ch.classList.add('visible', 'locked');
  }
}

function hideCrosshair() {
  const ch = $('crosshair');
  if (ch) {
    ch.classList.remove('visible', 'locked');
  }
}

/* ── Jaipur Marker ──────────────────────────────────────────────── */
function addJaipurMarker() {
  // Clean satellite view — no marker dot
}

/* ── Origin State White Highlight ───────────────────────────────── */
async function renderStateHighlight(stateName, countryName, centerCoords) {
  if (!map) return;

  // Clear any existing state highlight
  if (stateGeoLayer) {
    try { map.removeLayer(stateGeoLayer); } catch (e) { }
    stateGeoLayer = null;
  }

  // 1. Instant glowing white geometric radar perimeter over the state
  const isSmallRegion = stateName && (stateName.toLowerCase() === 'delhi' || stateName.toLowerCase().includes('delhi'));
  const radiusMeters = isSmallRegion ? 45000 : 130000;

  stateGeoLayer = L.circle(centerCoords, {
    radius: radiusMeters,
    color: '#ffffff',
    weight: 2.5,
    opacity: 0.95,
    fillColor: '#ffffff',
    fillOpacity: 0.20,
    dashArray: '6, 6',
    className: 'state-highlight-shape',
  }).addTo(map);

  // 2. Concurrently attempt to query exact polygon GeoJSON for the state
  try {
    const q = encodeURIComponent(`${stateName}, ${countryName || ''}`);
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${q}&polygon_geojson=1&format=json&limit=1`,
      1600
    );
    if (!res.ok) return;
    const data = await res.json();
    if (
      data &&
      data[0] &&
      data[0].geojson &&
      (data[0].geojson.type === 'Polygon' || data[0].geojson.type === 'MultiPolygon')
    ) {
      if (currentPhase === PHASE.GROUND && stateGeoLayer && map) {
        map.removeLayer(stateGeoLayer);
        stateGeoLayer = L.geoJSON(data[0].geojson, {
          style: {
            color: '#ffffff',
            weight: 2.8,
            opacity: 0.95,
            fillColor: '#ffffff',
            fillOpacity: 0.22,
            dashArray: '6, 6',
            className: 'state-highlight-shape',
          },
        }).addTo(map);
      }
    }
  } catch (e) {
    // Instant geometric shape remains active
  }
}

/* ── 3D Camera Controls (Pitch & Banking) ───────────────────────── */
function setCamera3D(pitch = 0, bank = 0, transitionMs = 150) {
  const mapEl = $('map');
  if (mapEl) {
    mapEl.style.transition = `transform ${transitionMs}ms cubic-bezier(0.16, 1, 0.3, 1), filter 140ms ease`;
    mapEl.style.setProperty('--cam-pitch', `${pitch}deg`);
    mapEl.style.setProperty('--cam-bank', `${bank}deg`);
    mapEl.style.transform = `rotateX(${pitch}deg) rotateZ(${bank}deg) scale(var(--cam-scale, 1.08))`;
  }
}

/* ── Step-Zoom Motor (Kinetic GTA V Snaps & Supersonic Traverse) ──── */
function stepZoom(targetCenter, targetZoom, durationSec = 0.14, easeLinearity = 0.96, isLanding = false) {
  return new Promise(resolve => {
    if (currentPhase === PHASE.SKIP) { resolve(); return; }

    const mapEl = $('map');
    if (mapEl) {
      mapEl.classList.remove('camera-shake', 'camera-recoil');
      void mapEl.offsetWidth; // force reflow for fresh animation
      mapEl.classList.add(isLanding ? 'camera-recoil' : 'camera-shake');

      setTimeout(() => {
        if (mapEl) mapEl.classList.remove('camera-shake', 'camera-recoil');
      }, isLanding ? 260 : 140);
    }

    // 1. If at same zoom level (Supersonic Orbital Traverse at Zoom 3): smooth lateral flight
    if (map.getZoom() === targetZoom) {
      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          map.off('moveend', onMoveEnd);
          resolve();
        }
      };
      const onMoveEnd = () => finish();

      map.once('moveend', onMoveEnd);
      map.flyTo(targetCenter, targetZoom, {
        duration: durationSec,
        easeLinearity: easeLinearity,
        noMoveStart: true,
      });

      setTimeout(finish, Math.round(durationSec * 1000) + 80);
    } else {
      // 2. Discrete Altitude Cuts: Instant snap under the photoflash burst.
      // Eliminates Leaflet fractional zoom lag & gives 60fps mechanical cuts.
      map.setView(targetCenter, targetZoom, { animate: false });
      setTimeout(resolve, Math.round(durationSec * 1000));
    }
  });
}

/* ── GTA V Web Audio Engine ─────────────────────────────────────── */
let audioCtx = null;
let masterComp = null;
let masterGain = null;
let windGain = null;
let windSource = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => { });
  }
  return audioCtx;
}

function getAudioDestination(ctx) {
  if (!masterComp) {
    masterComp = ctx.createDynamicsCompressor();
    masterComp.threshold.setValueAtTime(-14, ctx.currentTime);
    masterComp.knee.setValueAtTime(10, ctx.currentTime);
    masterComp.ratio.setValueAtTime(4, ctx.currentTime);
    masterComp.attack.setValueAtTime(0.003, ctx.currentTime);
    masterComp.release.setValueAtTime(0.12, ctx.currentTime);

    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.85, ctx.currentTime);

    masterComp.connect(masterGain);
    masterGain.connect(ctx.destination);
  }
  return masterComp;
}

function initAudioUnlock() {
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
    }
  };
  ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(type => {
    window.addEventListener(type, unlock, { passive: true });
  });
}

/** 1. Mechanical Shutter Clack: Dual-curtain mechanical snap + sub punch + metallic click */
function playShutterClackSound(isFirst = false) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const dest = getAudioDestination(ctx);
  const now = ctx.currentTime;

  // Kinetic sub punch
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(isFirst ? 115 : 135, now);
  sub.frequency.exponentialRampToValueAtTime(28, now + 0.11);
  subGain.gain.setValueAtTime(isFirst ? 0.85 : 0.68, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  sub.connect(subGain);
  subGain.connect(dest);
  sub.start(now);
  sub.stop(now + 0.14);

  // Dual-curtain mechanical shutter transient ("cl-clack!")
  const makeCurtainClick = (delaySec, gainVal, freq) => {
    const t = now + delaySec;
    const bufSize = Math.floor(ctx.sampleRate * 0.022);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
    }
    const click = ctx.createBufferSource();
    click.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 3.5;

    const cg = ctx.createGain();
    cg.gain.setValueAtTime(gainVal, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    click.connect(filter);
    filter.connect(cg);
    cg.connect(dest);
    click.start(t);
    click.stop(t + 0.028);
  };

  makeCurtainClick(0.0, 0.48, 3400);    // Curtain 1 release
  makeCurtainClick(0.020, 0.60, 2650);  // Curtain 2 snap ("clack!")

  // High-frequency electric flash whip
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) {
    nd[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const nfilter = ctx.createBiquadFilter();
  nfilter.type = 'bandpass';
  nfilter.frequency.setValueAtTime(2600, now);
  nfilter.frequency.exponentialRampToValueAtTime(350, now + 0.10);
  nfilter.Q.value = 1.9;

  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.42, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

  noise.connect(nfilter);
  nfilter.connect(ng);
  ng.connect(dest);
  noise.start(now);
}

// Aliases for backwards compatibility
function playFlashSound() { playShutterClackSound(true); }
function playStepSnapSound() { playShutterClackSound(false); }

/** 3. Atmospheric Cloud Wind: Continuous stereo rushing air */
function startCloudWind() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  if (windSource) return;

  const dest = getAudioDestination(ctx);
  const bufferSize = ctx.sampleRate * 2.5;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }
  }

  windSource = ctx.createBufferSource();
  windSource.buffer = buffer;
  windSource.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(450, ctx.currentTime);
  filter.Q.value = 1.4;

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.6;
  lfoGain.gain.value = 180;
  lfo.connect(filter.frequency);
  lfo.start();

  windGain = ctx.createGain();
  windGain.gain.setValueAtTime(0.001, ctx.currentTime);
  windGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.4);

  windSource.connect(filter);
  filter.connect(windGain);
  windGain.connect(dest);
  windSource.start();
}

function stopCloudWind() {
  if (windGain && audioCtx) {
    const now = audioCtx.currentTime;
    windGain.gain.setValueAtTime(windGain.gain.value, now);
    windGain.gain.linearRampToValueAtTime(0.001, now + 0.3);
    setTimeout(() => {
      if (windSource) {
        try { windSource.stop(); } catch (e) { }
        windSource.disconnect();
        windSource = null;
      }
      windGain = null;
    }, 320);
  }
}

/** 4. Cloud-Piercing Flash: Electric beam surge + atmospheric thunder */
function playCloudPierceSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const dest = getAudioDestination(ctx);
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(1450, now + 0.18);
  oscGain.gain.setValueAtTime(0.22, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2500;

  osc.connect(lowpass);
  lowpass.connect(oscGain);
  oscGain.connect(dest);
  osc.start(now);
  osc.stop(now + 0.24);

  const boom = ctx.createOscillator();
  const boomGain = ctx.createGain();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(80, now + 0.05);
  boom.frequency.exponentialRampToValueAtTime(22, now + 0.55);
  boomGain.gain.setValueAtTime(0.65, now + 0.05);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  boom.connect(boomGain);
  boomGain.connect(dest);
  boom.start(now + 0.05);
  boom.stop(now + 0.65);
}

/** 5. Landing Impact: Heavy sub-bass thud + GTA target-lock double electronic beep */
function playLandingSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const dest = getAudioDestination(ctx);
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(105, now);
  osc.frequency.exponentialRampToValueAtTime(24, now + 0.45);
  oscGain.gain.setValueAtTime(0.8, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(oscGain);
  oscGain.connect(dest);
  osc.start(now);
  osc.stop(now + 0.5);

  const playBeep = (freq, startTime, dur) => {
    const beep = ctx.createOscillator();
    const bGain = ctx.createGain();
    beep.type = 'sine';
    beep.frequency.value = freq;
    bGain.gain.setValueAtTime(0.35, startTime);
    bGain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    beep.connect(bGain);
    bGain.connect(dest);
    beep.start(startTime);
    beep.stop(startTime + dur + 0.01);
  };

  playBeep(1200, now + 0.28, 0.04);
  playBeep(1600, now + 0.35, 0.06);
}

/** 6. Mechanical Window Dock: Subtle hydraulic servo slide + crisp latch click */
function playMechanicalDockSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const dest = getAudioDestination(ctx);
  const now = ctx.currentTime;

  // Crisp mechanical latch release
  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = 'triangle';
  click.frequency.setValueAtTime(850, now);
  click.frequency.exponentialRampToValueAtTime(110, now + 0.035);
  clickGain.gain.setValueAtTime(0.24, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  click.connect(clickGain);
  clickGain.connect(dest);
  click.start(now);
  click.stop(now + 0.045);

  // Soft pneumatic servo slide hum
  const hum = ctx.createOscillator();
  const humGain = ctx.createGain();
  hum.type = 'sine';
  hum.frequency.setValueAtTime(130, now);
  hum.frequency.exponentialRampToValueAtTime(75, now + 0.42);
  humGain.gain.setValueAtTime(0.16, now);
  humGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
  hum.connect(humGain);
  humGain.connect(dest);
  hum.start(now);
  hum.stop(now + 0.50);
}

/* ════════════════════════════════════════════════════════════════
   THE GTA V CHARACTER SWITCH SEQUENCE
   ════════════════════════════════════════════════════════════════ */
async function runGTASequence() {
  if (currentPhase === PHASE.SKIP) return;

  // 1. Initial State: Stay over user's actual state highlighted in white (0° pitch, 0° bank)
  currentPhase = PHASE.GROUND;
  setCamera3D(0, 0, 0);
  map.setView(visitorCoords, 7, { animate: false });
  applyGrade('GROUND');
  showCrosshair();

  // Highlight the state in white on the map
  renderStateHighlight(visitorState, visitorCountry, visitorCoords);

  // Stay over the user's actual state briefly so it reads clearly, with a faint idle
  // drift so the hold doesn't look like a frozen screenshot.
  addBreathing();
  await sleep(1500);
  removeBreathing();
  if (currentPhase === PHASE.SKIP) return;

  // 2. Multi-Step Discrete Zoom-Out (4 discrete steps with 0.2s gaps)

  // Step 1: State -> Region (7 -> 6) - Pitch begins (10°)
  currentPhase = PHASE.OUT_STEP_1;
  setCamera3D(10, 0, 140);
  triggerFlash('burst');
  playShutterClackSound(true);
  applyGrade('OUT_1');
  await stepZoom(visitorCoords, 6, 0.14, 0.96);
  await sleep(200); // 0.2s gap between steps
  if (currentPhase === PHASE.SKIP) return;

  // Step 2: Region -> Subcontinent Overview (6 -> 5) - Pitch increases (20°), subtle bank (-3°)
  currentPhase = PHASE.OUT_STEP_2;
  setCamera3D(20, -3, 140);
  triggerFlash('burst');
  playShutterClackSound(false);
  applyGrade('OUT_2');
  await stepZoom(visitorCoords, 5, 0.14, 0.96);
  await sleep(200); // 0.2s gap
  if (currentPhase === PHASE.SKIP) return;

  // Step 3: Subcontinent -> Continental & Cloud Entry (5 -> 4) - Pitch reaches 28°, clouds active
  currentPhase = PHASE.OUT_STEP_3;
  setCamera3D(28, -6, 150);
  triggerFlash('burst');
  playShutterClackSound(false);
  setClouds('active'); // clouds start drifting in
  applyGrade('OUT_3');
  await stepZoom(visitorCoords, 4, 0.15, 0.96);
  await sleep(200); // 0.2s gap
  if (currentPhase === PHASE.SKIP) return;

  // Step 4: Continental -> High Orbit / Max Altitude (4 -> 3) - Full 30° perspective pitch
  currentPhase = PHASE.ORBIT;
  setCamera3D(30, -7, 150);
  triggerFlash('burst');
  playShutterClackSound(false);
  applyGrade('ORBIT');

  // Fade (don't pop) the state highlight once reaching orbit
  if (stateGeoLayer && map) {
    const layerToRemove = stateGeoLayer;
    try {
      const el = layerToRemove._path || (layerToRemove.getElement && layerToRemove.getElement());
      if (el) {
        el.classList.add('fading-out');
        setTimeout(() => { try { map.removeLayer(layerToRemove); } catch (e) { } }, 260);
      } else {
        map.removeLayer(layerToRemove);
      }
    } catch (e) { }
    stateGeoLayer = null;
  }

  await stepZoom(visitorCoords, 3, 0.16, 0.96);
  await sleep(200); // 0.2s gap before supersonic whip
  if (currentPhase === PHASE.SKIP) return;

  // 3. Supersonic Orbital Whip across the terrain (Fast, aggressive tear across the globe)
  currentPhase = PHASE.TRAVERSE;
  setClouds('traveling');
  startCloudWind();
  triggerSpeedStreaks(); // radial motion-blur burst — the "we just crossed the map" beat

  // Dynamic 3D banking into supersonic lateral flight
  const dLng = JAIPUR[1] - visitorCoords[1];
  const bankAngle = dLng >= 0 ? -16 : 16;
  setCamera3D(30, bankAngle, 450);

  await stepZoom(JAIPUR, 3, 0.48, 0.88);
  if (currentPhase === PHASE.SKIP) { stopCloudWind(); return; }

  // Level banking out as camera reaches destination orbit
  setCamera3D(30, 0, 250);

  // 4. Destination Max Zoomout Hover: 1.0 second hover above Jaipur over clouds
  addBreathing();
  await sleep(1000);
  removeBreathing();
  if (currentPhase === PHASE.SKIP) { stopCloudWind(); return; }

  // Clouds part & atmospheric wind dissolves before descent
  stopCloudWind();
  setClouds('part');
  playCloudPierceSound();

  // 5. Multi-Step Discrete Zoom-In (Descending into Jaipur with 0.2s gaps - pitch levels back down!)

  // Step 1: Cloud Break -> Rajasthan Subcontinent (3 -> 6) - Pitch levels to 22°
  currentPhase = PHASE.IN_STEP_1;
  setCamera3D(22, 0, 140);
  triggerFlash('burst');
  playShutterClackSound(false);
  applyGrade('IN_1');
  await stepZoom(JAIPUR, 6, 0.14, 0.96);
  await sleep(200); // 0.2s gap
  if (currentPhase === PHASE.SKIP) return;

  // Step 2: Rajasthan -> Jaipur Metro (6 -> 9) - Pitch levels to 14°
  currentPhase = PHASE.IN_STEP_2;
  setCamera3D(14, 0, 140);
  triggerFlash('burst');
  playShutterClackSound(false);
  applyGrade('IN_2');
  await stepZoom(JAIPUR, 9, 0.14, 0.96);
  await sleep(200); // 0.2s gap
  if (currentPhase === PHASE.SKIP) return;

  // Step 3: Jaipur Metro -> Urban District Grid (9 -> 12) - Pitch levels to 6°
  currentPhase = PHASE.IN_STEP_3;
  setCamera3D(6, 0, 140);
  triggerFlash('burst');
  playShutterClackSound(false);
  applyGrade('IN_3');
  await stepZoom(JAIPUR, 12, 0.15, 0.96);
  await sleep(200); // 0.2s gap
  if (currentPhase === PHASE.SKIP) return;

  // Step 4: Final Street Punch-In & Recoil (12 -> 15) - Pitch levels to 0° (ground view!)
  currentPhase = PHASE.LANDING;
  setCamera3D(0, 0, 200);
  triggerFlash('burst');
  playLandingSound();
  applyGrade('LANDING');
  await stepZoom(JAIPUR, 15, 0.22, 0.96, true); // true triggers camera landing recoil!
  lockCrosshair();
  addJaipurMarker();
  if (currentPhase === PHASE.SKIP) return;

  // 6. Ground Arrival Settle & Mechanical Hold
  // Stay stationary on the target street view for a deliberate beat so the arrival registers
  const hudStatus = $('hud-status');
  if (hudStatus) hudStatus.textContent = 'SIGNAL LOCKED';
  const hudRegion = $('hud-region');
  if (hudRegion) hudRegion.textContent = 'JAIPUR, RJ';

  await sleep(950);
  hideCrosshair();
  await sleep(250); // micro-pause right before mechanical resize begins
  if (currentPhase !== PHASE.SKIP) await runDock();
}

/* ── Dock Transition ────────────────────────────────────────────── */
async function runDock() {
  if (currentPhase === PHASE.SKIP) return;
  currentPhase = PHASE.DOCK;
  applyGrade('LANDING');

  playMechanicalDockSound();

  const panel = $('form-panel');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    panel.classList.add('docked');          // form unveils on the left
    $('cinematic').classList.add('docked'); // map gracefully slides to the right
  });

  // Pin card appears as the map settles into the right half
  await sleep(650);
  const card = $('pin-card');
  if (card) {
    card.classList.remove('pin-hidden');
    void card.offsetWidth; // force reflow for opacity transition
    card.classList.add('pin-visible');
  }

  // Invalidate map size after window slide completes so tile layout stays crisp
  setTimeout(() => {
    if (map) {
      try { map.invalidateSize({ pan: false }); } catch (e) { }
    }
  }, 1150);
}

/* ── Skip Intro ─────────────────────────────────────────────────── */
function skipIntro() {
  if (currentPhase === PHASE.SKIP) return;
  currentPhase = PHASE.SKIP;

  if (stateGeoLayer && map) {
    try { map.removeLayer(stateGeoLayer); } catch (e) { }
    stateGeoLayer = null;
  }

  setCamera3D(0, 0, 0);
  removeBreathing();

  if (map) {
    map.stop();
    requestAnimationFrame(() => map.setView(JAIPUR, 15, { animate: false }));
  }

  applyGrade('LANDING');
  hideCrosshair();
  setClouds('none');
  stopCloudWind();
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
}

/* ── Show Final State (Instant when ?skip or ?static is used)  ─── */
function showFinalState() {
  currentPhase = PHASE.SKIP;

  if (stateGeoLayer && map) {
    try { map.removeLayer(stateGeoLayer); } catch (e) { }
    stateGeoLayer = null;
  }

  const app = $('app');
  app.classList.add('no-anim');

  setCamera3D(0, 0, 0);
  removeBreathing();
  applyGrade('LANDING');
  hideCrosshair();
  setClouds('none');
  addJaipurMarker();

  const card = $('pin-card');
  card.classList.remove('pin-hidden');
  card.classList.add('pin-visible');

  const panel = $('form-panel');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('docked');
  $('cinematic').classList.add('docked');

  requestAnimationFrame(() => requestAnimationFrame(() => {
    app.classList.remove('no-anim');
  }));
}

/* ── Sound Toggle (explicit opt-in — nothing plays until this is clicked) ── */
function initSoundToggle() {
  const btn = $('sound-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    btn.setAttribute('aria-pressed', String(soundEnabled));
    btn.setAttribute('aria-label', soundEnabled ? 'Mute sound' : 'Enable sound');

    const muted = $('icon-muted');
    const sound = $('icon-sound');
    if (muted) muted.style.display = soundEnabled ? 'none' : '';
    if (sound) sound.style.display = soundEnabled ? '' : 'none';

    if (soundEnabled) {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { });
    } else {
      stopCloudWind();
    }
  });
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

  form.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => input.classList.remove('invalid'));
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    const checks = [
      { el: $('f-name'), test: v => v.length > 0 },
      { el: $('f-email'), test: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
      { el: $('f-project'), test: v => v.length > 0 },
    ];

    let valid = true;
    checks.forEach(({ el, test }) => {
      const ok = test(el.value.trim());
      el.classList.toggle('invalid', !ok);
      if (!ok) valid = false;
    });

    if (!valid) return;

    console.log('📬 Contact submission:', {
      name: $('f-name').value.trim(),
      email: $('f-email').value.trim(),
      project: $('f-project').value.trim(),
      budget: selectedBudget,
    });

    const sendBtn = $('send-btn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span>SENT</span>';
      sendBtn.classList.add('sent');
    }
  });
}

/* ════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
   ════════════════════════════════════════════════════════════════ */
async function main() {
  const forceSkip = location.search.includes('skip') || location.search.includes('static');

  initAudioUnlock();
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
    }
  } catch (e) { }

  initBudgetPills();
  initContactForm();
  initSoundToggle();

  $('form-panel').inert = true;
  $('skip-btn').addEventListener('click', skipIntro);

  isMobile = window.matchMedia('(max-width: 768px)').matches;

  // ── Fast path: skip straight to final state ONLY if explicitly requested via ?skip or ?static ──
  if (forceSkip) {
    initMap(JAIPUR, 15);
    showFinalState();
    return;
  }

  // ── Reset any docked classes to guarantee starting in fullscreen cinematic mode ──
  $('form-panel').classList.remove('docked');
  $('cinematic').classList.remove('docked');
  const pinCard = $('pin-card');
  if (pinCard) {
    pinCard.classList.remove('pin-visible');
    pinCard.classList.add('pin-hidden');
  }

  // ── Canonical Offline Route: Los Santos (California) → Jaipur ───────
  visitorCoords = [34.0522, -118.2437]; // Los Santos / Los Angeles
  visitorState = 'California';
  visitorCountry = 'United States';
  visitorCity = 'Los Santos';

  initMap(visitorCoords, 7);
  applyGrade('GROUND');

  // Trigger background preloader across all transition phases
  preloadGTAMap(visitorCoords);

  // Pre-flight check: ensure starting viewport state tiles are loaded before revealing
  const startTiles = getTileUrlsForLocation(visitorCoords[0], visitorCoords[1], 7, 2);
  await Promise.race([
    Promise.all(startTiles.slice(0, 9).map(preloadTile)),
    sleep(350),
  ]);

  await runGTASequence();
}

document.addEventListener('DOMContentLoaded', main);