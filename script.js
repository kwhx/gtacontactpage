/* ================================================================
   script.js  —  GTA V-Style Character Switch · Contact Page
   Powered by MapLibre GL JS v4 with Native 3D WebGL Globe Projection.
   Plain ES2020, no build step.

   IMPORTANT: Serve via a static HTTP server, not file://
     python3 -m http.server 8080
   ================================================================ */

'use strict';

/* ── Destination & Fallbacks ([lng, lat] for MapLibre) ───────────── */
const JAIPUR = [75.7873, 26.9124];
const FALLBACK_LOC = [-118.2437, 34.0522]; // Los Santos / Los Angeles

/* ── Phase Enum ─────────────────────────────────────────────────── */
const PHASE = Object.freeze({
  GROUND:      0,   // street-level Los Santos
  OUT_1:       1,   // 12.5 → 8.0
  OUT_2:       2,   // 8.0 → 4.5
  OUT_3:       3,   // 4.5 → 3.0
  PAN_1:       4,   // waypoint 1 (~25%)
  PAN_2:       5,   // waypoint 2 (~55%)
  PAN_3:       6,   // waypoint 3 (~85%, over Jaipur region)
  IN_1:        7,   // 3.0 → 7.0
  IN_2:        8,   // 7.0 → 11.0
  IN_3:        9,   // 11.0 → 15.0
  LANDING:     10,  // touchdown & suspension recoil
  DOCK:        11,  // contact UI reveal
  SKIP:        99,
});

/* ── Authentic GTA V Color Grades ──────────────────────────────────
   - Ground level: Rich natural contrast, subtle filmic daylight
   - Ascending: Progressive cooling into desaturated surveillance tone
   - PAN WP 1: Cool green
   - PAN WP 2: Neutral grey-blue
   - PAN WP 3: Warm amber begins
   - IN Steps: Progressively warming golden hour into Jaipur street clarity
   - Landing: Crisp golden hour warmth & vibrant clarity
────────────────────────────────────────────────────────────────── */
const GRADES = {
  GROUND: {
    filter: 'contrast(1.36) brightness(1.05) saturate(1.85) sepia(0.55) hue-rotate(50deg)',
    wash: 'rgba(110, 175, 42, 0.50)',
    grain: 0.18,
  },
  OUT_1: {
    filter: 'contrast(1.30) brightness(1.00) saturate(1.35) sepia(0.28) hue-rotate(60deg)',
    wash: 'rgba(95, 155, 60, 0.28)',
    grain: 0.20,
  },
  OUT_2: {
    filter: 'contrast(1.28) brightness(0.93) saturate(0.75) hue-rotate(95deg)',
    wash: 'rgba(50, 100, 100, 0.20)',
    grain: 0.26,
  },
  OUT_3: {
    filter: 'contrast(1.32) brightness(0.87) saturate(0.38) hue-rotate(150deg)',
    wash: 'rgba(22, 68, 108, 0.24)',
    grain: 0.32,
  },
  PAN_1: {
    filter: 'contrast(1.30) brightness(0.92) saturate(0.95) hue-rotate(75deg)',
    wash: 'rgba(35, 105, 65, 0.24)',
    grain: 0.26,
  },
  PAN_2: {
    filter: 'contrast(1.28) brightness(0.90) saturate(0.45) hue-rotate(175deg)',
    wash: 'rgba(28, 62, 92, 0.26)',
    grain: 0.28,
  },
  PAN_3: {
    filter: 'contrast(1.26) brightness(0.94) saturate(0.90) hue-rotate(22deg)',
    wash: 'rgba(115, 78, 28, 0.20)',
    grain: 0.22,
  },
  IN_1: {
    filter: 'contrast(1.28) brightness(0.92) saturate(0.80) hue-rotate(18deg)',
    wash: 'rgba(95, 70, 30, 0.16)',
    grain: 0.20,
  },
  IN_2: {
    filter: 'contrast(1.22) brightness(0.96) saturate(0.95) hue-rotate(10deg)',
    wash: 'rgba(100, 72, 25, 0.12)',
    grain: 0.14,
  },
  IN_3: {
    filter: 'contrast(1.18) brightness(0.98) saturate(1.05) hue-rotate(5deg)',
    wash: 'rgba(90, 65, 30, 0.08)',
    grain: 0.08,
  },
  LANDING: {
    filter: 'contrast(1.15) brightness(1.02) saturate(1.12) hue-rotate(2deg)',
    wash: 'rgba(110, 75, 20, 0.06)',
    grain: 0.04,
  },
};

/* ── Module State ───────────────────────────────────────────────── */
let map = null;
let currentPhase = PHASE.GROUND;
let visitorCoords = [...FALLBACK_LOC]; // [lng, lat]
let visitorState = 'California';
let visitorCountry = 'United States';
let visitorCity = 'Los Angeles';
let selectedBudget = null;
let isMobile = false;
let soundEnabled = false; // explicit opt-in only
let jaipurMarker = null;

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
        coords: [roundCoord(d.longitude), roundCoord(d.latitude)],
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
          coords: [roundCoord(d.longitude), roundCoord(d.latitude)],
          state: d.region || d.region_code || d.city || 'California',
          country: d.country || 'United States',
          city: d.city || '',
        }
        : null
    );
  }

  return loc;
}

/* ── MapLibre GL Flat Overhead Engine ───────────────────────────── */
function initMap(center, zoom = 12.5, pitch = 0, bearing = 0) {
  return new Promise((resolve) => {
    map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {
          'esri-satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: ''
          }
        },
        layers: [
          {
            id: 'esri-satellite-layer',
            type: 'raster',
            source: 'esri-satellite'
          }
        ]
      },
      center: center,
      zoom: zoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      interactive: false,
      attributionControl: false
    });

    map.once('load', () => {
      resolve();
    });

    // Safety fallback
    setTimeout(resolve, 2000);
  });
}

/* ── Camera Motion (Discrete Steps & Instant Waypoint Cuts) ─────── */
function easeCamera({ center, zoom, duration = 180, easing = (t) => t }) {
  return new Promise((resolve) => {
    if (currentPhase === PHASE.SKIP) { resolve(); return; }

    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        map.off('moveend', finish);
        resolve();
      }
    };

    map.once('moveend', finish);

    map.easeTo({
      center,
      zoom,
      pitch: 0,
      bearing: 0,
      duration,
      easing,
      essential: true
    });

    setTimeout(finish, duration + 60);
  });
}

function jumpCamera(center, zoom = 3.0) {
  if (currentPhase === PHASE.SKIP || !map) return;
  map.jumpTo({
    center,
    zoom,
    pitch: 0,
    bearing: 0
  });
}

function flyCamera(opts) {
  return easeCamera(opts);
}

function triggerCameraPop() {
  const mapEl = $('map');
  if (!mapEl) return;
  mapEl.classList.remove('camera-shake', 'camera-shake-pop');
  void mapEl.offsetWidth; // force DOM reflow
  mapEl.classList.add('camera-shake-pop');
}

/* ── Tile Prefetching Safety Net ────────────────────────────────── */
function lngLatToTile(lng, lat, z) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  const maxTile = Math.floor(n - 1);
  return {
    x: Math.max(0, Math.min(maxTile, x)),
    y: Math.max(0, Math.min(maxTile, y))
  };
}

function prefetchTilesForPoint(coords, zoom, radius = 1) {
  const center = lngLatToTile(coords[0], coords[1], zoom);
  const maxTile = Math.pow(2, zoom) - 1;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = ((center.x + dx) % (maxTile + 1) + (maxTile + 1)) % (maxTile + 1);
      const y = center.y + dy;
      if (y >= 0 && y <= maxTile) {
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
        const img = new Image();
        img.src = url;
      }
    }
  }
}

function prefetchSequenceTiles(origin, dest, waypoints) {
  try {
    // Prefetch zoom 3 tiles covering global waypoints
    waypoints.forEach(wp => prefetchTilesForPoint(wp, 3, 2));
    prefetchTilesForPoint(dest, 3, 2);
    // Prefetch descent zoom steps into Jaipur
    prefetchTilesForPoint(dest, 7, 2);
    prefetchTilesForPoint(dest, 11, 2);
    prefetchTilesForPoint(dest, 15, 2);
  } catch (e) {
    console.warn('Tile prefetch error:', e);
  }
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

/* ── Flash Triggers (Short ~110ms Burst) ────────────────────────── */
function triggerFlash() {
  const flash = $('white-flash');
  if (!flash) return;
  flash.className = '';
  void flash.offsetWidth; // force DOM reflow
  flash.className = 'flash-burst';
}

/* ── Cloud Layer Controls (Postcard Accent During Holds) ────────── */
function setClouds(state) {
  const clouds = $('cloud-container');
  if (!clouds) return;
  if (state === 'active') {
    clouds.classList.add('clouds-active');
  } else {
    clouds.classList.remove('clouds-active');
  }
}

function showPostcardClouds() {
  setClouds('active');
}

function hideClouds() {
  setClouds('none');
}

/* ── Idle Camera Breathing ──────────────────────────────────────── */
function addBreathing() {
  const mapEl = $('map');
  if (mapEl) mapEl.classList.add('breathing');
}
function removeBreathing() {
  const mapEl = $('map');
  if (mapEl) mapEl.classList.remove('breathing');
}

/* ── Supersonic Speed Streaks ───────────────────────────────────── */
function triggerSpeedStreaks() {
  const el = $('speed-streaks');
  if (!el) return;
  el.classList.remove('active');
  void el.offsetWidth;
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

/* ── MapLibre Jaipur Radar Target Marker ────────────────────────── */
function addJaipurMarker() {
  if (jaipurMarker || !map) return;
  const el = document.createElement('div');
  el.className = 'jaipur-marker-element';
  el.innerHTML = `
    <div class="marker-ring" aria-hidden="true"></div>
    <div class="marker-dot" aria-hidden="true"></div>
  `;

  jaipurMarker = new maplibregl.Marker({ element: el })
    .setLngLat(JAIPUR)
    .addTo(map);
}

/* ── Origin State White Radar Highlight ─────────────────────────── */
function createGeoJSONCircle(center, radiusKm, points = 64) {
  const km = radiusKm;
  const ret = [];
  const distanceX = km / (111.320 * Math.cos(center[1] * Math.PI / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([center[0] + x, center[1] + y]);
  }
  ret.push(ret[0]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ret]
    },
    properties: {}
  };
}

async function renderStateHighlight(stateName, countryName, centerCoords) {
  if (!map) return;

  removeStateHighlight();

  const isSmallRegion = stateName && (stateName.toLowerCase() === 'delhi' || stateName.toLowerCase().includes('delhi'));
  const radiusKm = isSmallRegion ? 45 : 130;
  const initialGeoJSON = createGeoJSONCircle(centerCoords, radiusKm);

  try {
    if (!map.getSource('state-highlight')) {
      map.addSource('state-highlight', {
        type: 'geojson',
        data: initialGeoJSON
      });

      map.addLayer({
        id: 'state-fill',
        type: 'fill',
        source: 'state-highlight',
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': 0.20
        }
      });

      map.addLayer({
        id: 'state-line',
        type: 'line',
        source: 'state-highlight',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.95
        }
      });
    }
  } catch (e) {
    console.warn('MapLibre state highlight layer:', e);
  }

  // Refine asynchronously with exact state polygon if available
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
      if (currentPhase === PHASE.GROUND && map && map.getSource('state-highlight')) {
        map.getSource('state-highlight').setData(data[0].geojson);
      }
    }
  } catch (e) {
    // Retain circle geometry
  }
}

function removeStateHighlight() {
  if (!map) return;
  try {
    if (map.getLayer('state-fill')) map.removeLayer('state-fill');
    if (map.getLayer('state-line')) map.removeLayer('state-line');
    if (map.getSource('state-highlight')) map.removeSource('state-highlight');
  } catch (e) {}
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

/** 3. Atmospheric Cloud Wind: Continuous stereo rushing air */
function startCloudWind() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  if (windSource) return;

  const bufferSize = ctx.sampleRate * 2.0;
  const noiseBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
  const left = noiseBuffer.getChannelData(0);
  const right = noiseBuffer.getChannelData(1);

  let b0L = 0, b1L = 0, b2L = 0;
  let b0R = 0, b1R = 0, b2R = 0;
  for (let i = 0; i < bufferSize; i++) {
    const whiteL = Math.random() * 2 - 1;
    const whiteR = Math.random() * 2 - 1;
    b0L = 0.99886 * b0L + whiteL * 0.0555179;
    b1L = 0.99332 * b1L + whiteL * 0.0750759;
    b2L = 0.96900 * b2L + whiteL * 0.1538520;
    left[i] = (b0L + b1L + b2L) * 0.35;

    b0R = 0.99886 * b0R + whiteR * 0.0555179;
    b1R = 0.99332 * b1R + whiteR * 0.0750759;
    b2R = 0.96900 * b2R + whiteR * 0.1538520;
    right[i] = (b0R + b1R + b2R) * 0.35;
  }

  windSource = ctx.createBufferSource();
  windSource.buffer = noiseBuffer;
  windSource.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(580, ctx.currentTime);

  windGain = ctx.createGain();
  windGain.gain.setValueAtTime(0.001, ctx.currentTime);
  windGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.35);

  windSource.connect(lowpass);
  lowpass.connect(windGain);
  windGain.connect(getAudioDestination(ctx));
  windSource.start(0);
}

function stopCloudWind() {
  if (!windGain || !audioCtx) return;
  try {
    windGain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    setTimeout(() => {
      if (windSource) {
        try { windSource.stop(); } catch (e) { }
        windSource = null;
      }
    }, 320);
  } catch (e) { }
}

/** 4. Target Acquisition Pierce: High tech radar ping + supersonic punch */
function playCloudPierceSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const dest = getAudioDestination(ctx);
  const now = ctx.currentTime;

  const tone = ctx.createOscillator();
  const toneGain = ctx.createGain();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(1420, now);
  tone.frequency.exponentialRampToValueAtTime(320, now + 0.36);
  toneGain.gain.setValueAtTime(0.35, now);
  toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
  tone.connect(toneGain);
  toneGain.connect(dest);
  tone.start(now);
  tone.stop(now + 0.40);

  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(95, now);
  sub.frequency.exponentialRampToValueAtTime(35, now + 0.32);
  subGain.gain.setValueAtTime(0.48, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  sub.connect(subGain);
  subGain.connect(dest);
  sub.start(now);
  sub.stop(now + 0.36);
}

/** 5. Ground Impact Shockwave: Heavy seismic rumble */
function playLandingSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const dest = getAudioDestination(ctx);
  const now = ctx.currentTime;

  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(120, now);
  sub.frequency.exponentialRampToValueAtTime(24, now + 0.48);
  subGain.gain.setValueAtTime(0.95, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
  sub.connect(subGain);
  subGain.connect(dest);
  sub.start(now);
  sub.stop(now + 0.55);

  const snap = ctx.createOscillator();
  const snapGain = ctx.createGain();
  snap.type = 'triangle';
  snap.frequency.setValueAtTime(480, now);
  snap.frequency.exponentialRampToValueAtTime(65, now + 0.08);
  snapGain.gain.setValueAtTime(0.65, now);
  snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  snap.connect(snapGain);
  snapGain.connect(dest);
  snap.start(now);
  snap.stop(now + 0.10);
}

/** 6. Mechanical Panel Dock Sound */
function playMechanicalDockSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const dest = getAudioDestination(ctx);
  const now = ctx.currentTime;

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
   Flat overhead perspective: 3 out-steps → 3 waypoint hard cuts → 3 in-steps
   Total runtime ≈ 6.5–7s
   ════════════════════════════════════════════════════════════════ */
async function runGTASequence() {
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     GROUND (start)
     Zoom: 12.5 | Pitch: 0° | Duration: hold 1500ms
     State highlight visible, crosshair reticle active, camera breathing.
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.GROUND;
  applyGrade('GROUND');
  showCrosshair();
  hideClouds();

  renderStateHighlight(visitorState, visitorCountry, visitorCoords);

  // Discrete waypoints across the flat map (Los Santos → Jaipur)
  const WP1 = [
    visitorCoords[0] + 0.25 * (JAIPUR[0] - visitorCoords[0]),
    visitorCoords[1] + 0.25 * (JAIPUR[1] - visitorCoords[1])
  ]; // ~25% along path (Western Atlantic / US East)
  const WP2 = [
    visitorCoords[0] + 0.55 * (JAIPUR[0] - visitorCoords[0]),
    visitorCoords[1] + 0.55 * (JAIPUR[1] - visitorCoords[1])
  ]; // ~55% along path (Eastern Atlantic / North Africa)
  const WP3 = [62.0, 27.2]; // ~85% along path (over Jaipur approach region)

  // Warm up destination and waypoint tiles during ground hold
  prefetchSequenceTiles(visitorCoords, JAIPUR, [WP1, WP2, WP3]);

  addBreathing();
  await sleep(1500);
  removeBreathing();
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     OUT_1
     Zoom: 12.5 → 8.0 | Duration: 180ms | Hold after: 150ms | Pitch: 0°
     shutter-click + tiny shake pop
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.OUT_1;
  removeStateHighlight();
  triggerFlash();
  playShutterClackSound(true);
  triggerCameraPop();
  applyGrade('OUT_1');

  await easeCamera({
    center: visitorCoords,
    zoom: 8.0,
    duration: 180
  });
  if (currentPhase === PHASE.SKIP) return;
  await sleep(150);
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     OUT_2
     Zoom: 8.0 → 4.5 | Duration: 180ms | Hold after: 150ms | Pitch: 0°
     shutter-click + tiny shake pop
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.OUT_2;
  triggerFlash();
  playShutterClackSound(false);
  triggerCameraPop();
  applyGrade('OUT_2');

  await easeCamera({
    center: visitorCoords,
    zoom: 4.5,
    duration: 180
  });
  if (currentPhase === PHASE.SKIP) return;
  await sleep(150);
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     OUT_3
     Zoom: 4.5 → 3.0 (strictly z3, never below) | Duration: 200ms
     Hold after: 250ms | Pitch: 0°
     shutter-click + tiny shake pop
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.OUT_3;
  triggerFlash();
  playShutterClackSound(false);
  triggerCameraPop();
  applyGrade('OUT_3');

  await easeCamera({
    center: visitorCoords,
    zoom: 3.0,
    duration: 200
  });
  if (currentPhase === PHASE.SKIP) return;
  await sleep(250);
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     PAN waypoint 1 (~25% along path)
     Hold at 3.0 | hard cut, no interpolation | 350ms | Pitch: 0°
     grade: cool green | clouds visible during 350ms hold
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.PAN_1;
  jumpCamera(WP1, 3.0);
  triggerFlash();
  playShutterClackSound(false);
  triggerCameraPop();
  applyGrade('PAN_1');
  showPostcardClouds();

  await sleep(350);
  hideClouds();
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     PAN waypoint 2 (~55% along path)
     Hold at 3.0 | hard cut | 350ms | Pitch: 0°
     grade: neutral grey-blue | clouds visible during 350ms hold
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.PAN_2;
  jumpCamera(WP2, 3.0);
  triggerFlash();
  playShutterClackSound(false);
  triggerCameraPop();
  applyGrade('PAN_2');
  showPostcardClouds();

  await sleep(350);
  hideClouds();
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     PAN waypoint 3 (~85%, over Jaipur region)
     Hold at 3.0 | hard cut | 350ms | Pitch: 0°
     grade: warm amber begins | clouds visible during 350ms hold
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.PAN_3;
  jumpCamera(WP3, 3.0);
  triggerFlash();
  playShutterClackSound(false);
  triggerCameraPop();
  applyGrade('PAN_3');
  showPostcardClouds();

  await sleep(350);
  hideClouds();
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     IN_1
     Zoom: 3.0 → 7.0 | Duration: 180ms | Hold after: 150ms | Pitch: 0°
     shutter-click + tiny shake pop
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.IN_1;
  triggerFlash();
  playShutterClackSound(false);
  triggerCameraPop();
  applyGrade('IN_1');

  await easeCamera({
    center: JAIPUR,
    zoom: 7.0,
    duration: 180
  });
  if (currentPhase === PHASE.SKIP) return;
  await sleep(150);
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     IN_2
     Zoom: 7.0 → 11.0 | Duration: 180ms | Hold after: 150ms | Pitch: 0°
     shutter-click + tiny shake pop
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.IN_2;
  triggerFlash();
  playShutterClackSound(false);
  triggerCameraPop();
  applyGrade('IN_2');

  await easeCamera({
    center: JAIPUR,
    zoom: 11.0,
    duration: 180
  });
  if (currentPhase === PHASE.SKIP) return;
  await sleep(150);
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     IN_3 (landing)
     Zoom: 11.0 → 15.0 | Duration: 220ms | Hold after: 300ms | Pitch: 0°
     landing flash + thud sound, then dock
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.IN_3;
  await easeCamera({
    center: JAIPUR,
    zoom: 15.0,
    duration: 220
  });
  if (currentPhase === PHASE.SKIP) return;

  // Touchdown impact!
  currentPhase = PHASE.LANDING;
  triggerFlash();
  playLandingSound();
  applyGrade('LANDING');

  const mapEl = $('map');
  if (mapEl) {
    mapEl.classList.remove('camera-recoil-landing', 'camera-shake', 'camera-shake-pop');
    void mapEl.offsetWidth;
    mapEl.classList.add('camera-recoil-landing');
    setTimeout(() => mapEl && mapEl.classList.remove('camera-recoil-landing'), 370);
  }

  lockCrosshair();
  addJaipurMarker();

  await sleep(300);
  if (currentPhase === PHASE.SKIP) return;

  // Dock Transition
  hideCrosshair();
  await sleep(150);
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

  // Resize MapLibre canvas after slide completes
  setTimeout(() => {
    if (map) {
      try { map.resize(); } catch (e) { }
    }
  }, 750);
}

/* ── Skip Intro ─────────────────────────────────────────────────── */
function skipIntro() {
  if (currentPhase === PHASE.SKIP || currentPhase === PHASE.DOCK) return;
  currentPhase = PHASE.SKIP;

  removeStateHighlight();
  removeBreathing();

  const flash = $('white-flash');
  if (flash) flash.className = '';

  const clouds = $('cloud-container');
  if (clouds) clouds.style.display = 'none';

  stopCloudWind();
  hideCrosshair();

  if (map) {
    map.stop();
    map.jumpTo({
      center: JAIPUR,
      zoom: 15.0,
      pitch: 0,
      bearing: 0
    });
    addJaipurMarker();
  }

  applyGrade('LANDING');

  const card = $('pin-card');
  if (card) {
    card.classList.remove('pin-hidden');
    requestAnimationFrame(() => card.classList.add('pin-visible'));
  }

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

  removeStateHighlight();
  removeBreathing();

  const app = $('app');
  app.classList.add('no-anim');

  applyGrade('LANDING');
  hideCrosshair();
  setClouds('none');

  if (map) {
    map.jumpTo({
      center: JAIPUR,
      zoom: 15.0,
      pitch: 0,
      bearing: 0
    });
    addJaipurMarker();
  }

  const card = $('pin-card');
  if (card) {
    card.classList.remove('pin-hidden');
    card.classList.add('pin-visible');
  }

  const panel = $('form-panel');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  panel.classList.add('docked');
  $('cinematic').classList.add('docked');

  requestAnimationFrame(() => requestAnimationFrame(() => {
    app.classList.remove('no-anim');
  }));
}

/* ── Sound Toggle ───────────────────────────────────────────────── */
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

  // Reset docked classes
  $('form-panel').classList.remove('docked');
  $('cinematic').classList.remove('docked');
  const pinCard = $('pin-card');
  if (pinCard) {
    pinCard.classList.remove('pin-visible');
    pinCard.classList.add('pin-hidden');
  }

  // ── Canonical Route: Los Santos (California) → Jaipur ──────────────
  visitorCoords = [-118.2437, 34.0522]; // Los Santos [lng, lat]
  visitorState = 'California';
  visitorCountry = 'United States';
  visitorCity = 'Los Santos';

  if (forceSkip) {
    await initMap(JAIPUR, 15.0, 0, 0);
    showFinalState();
    return;
  }

  // Start at street-level zoom 12.5 — the overhead camera
  await initMap(visitorCoords, 12.5, 0, 0);
  applyGrade('GROUND');

  await runGTASequence();
}

document.addEventListener('DOMContentLoaded', main);