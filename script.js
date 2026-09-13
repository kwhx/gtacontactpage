/* ================================================================
   script.js  —  GTA V-Style Character Switch · Contact Page
   Powered by MapLibre GL JS v4 with Native 3D WebGL Globe Projection.
   Plain ES2020, no build step.

   IMPORTANT: Serve via a static HTTP server, not file://
     python3 -m http.server 8080
   ================================================================ */

'use strict';

/* ── Destination & Waypoints ([lng, lat] for MapLibre) ───────────── */
const JAIPUR = [75.7873, 26.9124];
const RAJASTHAN_CENTER = [73.85, 26.60];
const INDIA_CENTER = [78.9629, 22.5937];
const FALLBACK_LOC = [-118.2437, 34.0522]; // Los Santos / Los Angeles

/* ── Runtime Timeline Configuration (Managed via timeline.json) ── */
let timelineConfig = null;

async function loadTimelineConfig() {
  try {
    const res = await fetchWithTimeout('timeline.json?v=' + Date.now(), 4000, {
      cache: 'no-store'
    });
    if (res.ok) {
      const parsed = await res.json();
      if (parsed && Array.isArray(parsed.views) && parsed.views.length > 0) {
        timelineConfig = parsed;
        window.TIMELINE = timelineConfig;
        console.log('%c🎬 ACTIVE TIMELINE LOADED FROM timeline.json:', 'background: #0c151b; color: #38bdf8; font-size: 13px; font-weight: bold; padding: 4px;', timelineConfig);
      } else {
        console.warn('timeline.json loaded but views array missing/empty:', parsed);
      }
    } else {
      console.warn('timeline.json HTTP error status:', res.status);
    }
  } catch (e) {
    console.warn('Could not load timeline.json, using built-in fallback:', e);
  }

  if (!timelineConfig) {
    timelineConfig = {
      settleMs: 600,
      dockTransitionMs: 2200,
      locations: {
        jaipur: JAIPUR,
        rajasthan: RAJASTHAN_CENTER,
        india: INDIA_CENTER,
        fallback_visitor: FALLBACK_LOC
      },
      views: [
        { id: "view_1_street", index: 1, name: "Street (visitor)", target: "visitor", zoom: 15.0, approxAltitudeKm: 1.2, holdMs: 3000, colorGrade: "GROUND", breathing: true, crosshair: false, highlight: { enabled: false }, transitionMs: 0 },
        { id: "view_2_area", index: 2, name: "Area (visitor)", target: "visitor", zoom: 11.0, approxAltitudeKm: 18, holdMs: 1200, colorGrade: "OUT_1", shutterSound: true, shutterFirst: true, cameraPop: true, flash: true, highlight: { enabled: false }, transitionMs: 180 },
        { id: "view_3_state", index: 3, name: "State — California", target: "visitor", zoom: 6.5, approxAltitudeKm: 350, holdMs: 3000, colorGrade: "OUT_2", shutterSound: true, cameraPop: true, flash: true, highlight: { enabled: true, type: "visitor_state", defaultName: "California", defaultCountry: "United States", radiusKm: 280, fadeOutMs: 260 }, transitionMs: 200 },
        { id: "hidden_cut", index: null, type: "hidden_cut", name: "Continent Jump", cloudSweepInMs: 200, flashPopMs: 120, cloudHoldMs: 200, cloudSweepOutMs: 250, destinationTarget: "india", destinationZoom: 5.0, colorGrade: "IN_1", transitionMs: 0 },
        { id: "view_4_india", index: 4, name: "India", target: "india", zoom: 5.0, approxAltitudeKm: 1100, holdMs: 3000, colorGrade: "IN_1", shutterSound: false, cameraPop: false, flash: false, highlight: { enabled: false }, transitionMs: 0 },
        { id: "view_5_rajasthan", index: 5, name: "Rajasthan", target: "rajasthan", zoom: 6.5, approxAltitudeKm: 350, holdMs: 3000, colorGrade: "IN_2", shutterSound: true, shutterFirst: false, cameraPop: true, flash: true, highlight: { enabled: false }, transitionMs: 200 },
        { id: "view_6_jaipur", index: 6, name: "Jaipur", target: "jaipur", zoom: 10.5, approxAltitudeKm: 25, holdMs: 3000, colorGrade: "IN_3", shutterSound: true, cameraPop: true, flash: true, highlight: { enabled: false, type: "fixed", name: "Jaipur", country: "India", radiusKm: 28, fadeOutMs: 260 }, transitionMs: 220 },
        { id: "view_7_final", index: 7, name: "Final — inside Jaipur (street)", target: "jaipur", zoom: 15.0, approxAltitudeKm: 1.2, holdMs: 1200, colorGrade: "LANDING", isLanding: true, landingSound: true, landingImpact: true, marker: false, crosshairLock: false, flash: true, highlight: { enabled: false }, transitionMs: 240 }
      ]
    };
    window.TIMELINE = timelineConfig;
  }

  // Synchronize CSS custom property --dock-duration with timeline.json
  if (timelineConfig.dockTransitionMs) {
    document.documentElement.style.setProperty('--dock-duration', `${timelineConfig.dockTransitionMs}ms`);
  }

  return timelineConfig;
}

function resolveTargetCoords(target, stepCoords) {
  if (stepCoords && Array.isArray(stepCoords) && stepCoords.length === 2) return stepCoords;
  if (!target) return visitorCoords;
  if (Array.isArray(target) && target.length === 2) return target;
  if (target === 'visitor') return visitorCoords;
  if (timelineConfig && timelineConfig.locations && timelineConfig.locations[target]) {
    return timelineConfig.locations[target];
  }
  if (target === 'jaipur') return JAIPUR;
  if (target === 'rajasthan') return RAJASTHAN_CENTER;
  if (target === 'india') return INDIA_CENTER;
  return visitorCoords;
}

function resolveZoom(step) {
  if (typeof step.zoom === 'number') return step.zoom;
  const dist = step.distanceKm || step.approxAltitudeKm || step.altitudeKm || step.distance || step.altitude;
  if (typeof dist === 'number' && dist > 0) {
    // Altitude in km to zoom level conversion (approx Mercator scale)
    const z = Math.round((Math.log2(35800 / dist)) * 2) / 2;
    return Math.max(0, Math.min(19, z));
  }
  return 10.0;
}


/* ── Phase Enum (7-View Instant-Cut Sequence) ────────────────────── */
const PHASE = Object.freeze({
  VIEW_1_STREET:    1,   // Street (visitor, z15)
  VIEW_2_AREA:      2,   // Area (visitor, z11)
  VIEW_3_STATE:     3,   // State — California (z6.5)
  CLOUD_CUT:        4,   // Hidden cut: cloud sweep + flash + silent jump
  VIEW_4_INDIA:     5,   // India (z5.0)
  VIEW_5_RAJASTHAN: 6,   // Rajasthan (z6.5)
  VIEW_6_JAIPUR:    7,   // Jaipur district (z10.5)
  VIEW_7_FINAL:     8,   // Final inside Jaipur street (z15)
  SETTLE:           9,   // Settle before dock
  DOCK:             10,  // Dock transition
  SKIP:             99,
});

/* ── Authentic GTA V Color Grades ──────────────────────────────────
   - Ground level: Rich natural contrast, subtle filmic daylight
   - Ascending: Progressive cooling into desaturated surveillance tone
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
let currentPhase = PHASE.VIEW_1_STREET;
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

function fetchWithTimeout(url, ms = 3000, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
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

/* ── OpenFreeMap Stylized Vector Map Engine ──────────────────────── */
const VECTOR_STYLE = {
  version: 8,
  sources: {
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet'
    }
  },
  layers: [
    // 1. Land / background: #9C9080 (muted khaki, not green)
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#9C9080'
      }
    },
    // 2. Parks / vegetation: #7C8B6E (slightly darker than land, still muted)
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: {
        'fill-color': '#7C8B6E'
      }
    },
    {
      id: 'landcover_wood',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['wood', 'forest', 'grass', 'scrub'], true, false],
      paint: {
        'fill-color': '#7C8B6E'
      }
    },
    // 3. Water: #37474F (flat dark slate, no texture/gradient)
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: {
        'fill-color': '#37474F',
        'fill-antialias': true
      }
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      paint: {
        'line-color': '#37474F',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3]
      }
    },
    // Subtle administrative boundaries
    {
      id: 'boundary_country',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['==', ['get', 'admin_level'], 2],
      paint: {
        'line-color': 'rgba(232, 228, 218, 0.40)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 6, 1.5],
        'line-dasharray': [3, 2]
      }
    },
    {
      id: 'boundary_state',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      minzoom: 4,
      filter: ['==', ['get', 'admin_level'], 4],
      paint: {
        'line-color': 'rgba(232, 228, 218, 0.30)',
        'line-width': 1,
        'line-dasharray': [2, 2]
      }
    },
    // 4. Minor roads: #E8E4DA, thinner, hidden above ~zoom 9 (visible only at zoom >= 9)
    {
      id: 'road_minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 9,
      filter: ['match', ['get', 'class'], ['minor', 'service', 'track', 'path', 'residential'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#E8E4DA',
        'line-opacity': 0.85,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.2, 17, 2]
      }
    },
    // 5. Major roads: #E8E4DA, thin, 1-1.5px
    {
      id: 'road_major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#E8E4DA',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 10, 1.4, 15, 2.5]
      }
    },
    // 6. Buildings: #B7B0A0 fill, hidden above ~zoom 11 (visible only at zoom >= 11)
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 11,
      paint: {
        'fill-color': '#B7B0A0',
        'fill-antialias': true
      }
    }
    // 7. Labels / POI icons / road shields: all hidden, every zoom (omitted)
  ]
};

function initMap(center, zoom = 15.0, pitch = 0, bearing = 0) {
  return new Promise((resolve) => {
    map = new maplibregl.Map({
      container: 'map',
      style: VECTOR_STYLE,
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

function jumpCamera(center, zoom = 5.0) {
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

/* ── Continuous Directional Motion Blur During Active Travel ────── */
function setMotionBlur(active, direction = 'out') {
  const mapEl = $('map');
  if (!mapEl) return;
  if (active) {
    mapEl.classList.remove('blur-zoom-out', 'blur-zoom-in');
    mapEl.classList.add('camera-motion-blur', direction === 'out' ? 'blur-zoom-out' : 'blur-zoom-in');
  } else {
    mapEl.classList.remove('camera-motion-blur', 'blur-zoom-out', 'blur-zoom-in');
  }
}

function triggerCameraPop() {
  // Replaced with continuous motion blur during active camera travel
}

/* ── Altitude-Scaled Blur & Color Grade Stacking ─────────────────── */
const ALTITUDE_BLUR = {
  high: 'blur(2.5px) saturate(0.55) contrast(1.3)',
  low: 'blur(0.5px) saturate(0.85) contrast(1.15)'
};

function applyGrade(gradeKey, zoomLevel) {
  const g = GRADES[gradeKey];
  if (!g) return;

  const isLowAltitude = (typeof zoomLevel === 'number')
    ? zoomLevel >= 10.0
    : (gradeKey === 'GROUND' || gradeKey === 'IN_3' || gradeKey === 'LANDING');

  const altitudeAddition = isLowAltitude ? ALTITUDE_BLUR.low : ALTITUDE_BLUR.high;
  const combinedFilter = `${g.filter} ${altitudeAddition}`;

  const mapEl = $('map');
  if (mapEl) {
    mapEl.style.setProperty('--grade-filter', combinedFilter);
    mapEl.style.filter = combinedFilter;
  }

  const washEl = $('color-wash');
  if (washEl) washEl.style.background = g.wash;

  const grainEl = $('grain');
  if (grainEl) grainEl.style.opacity = String(g.grain);
}

/* ── Flash Triggers (Short ~120ms Burst) ────────────────────────── */
function triggerFlash() {
  const flash = $('white-flash');
  if (!flash) return;
  flash.className = '';
  void flash.offsetWidth; // force DOM reflow
  flash.className = 'flash-burst';
}

/* ── Cloud Layer Controls (Hidden Cut Sweep Beat) ───────────────── */
function sweepCloudsIn() {
  const clouds = $('cloud-container');
  if (!clouds) return;
  clouds.classList.remove('clouds-sweep-out');
  void clouds.offsetWidth;
  clouds.classList.add('clouds-cover');
}

function sweepCloudsOut() {
  const clouds = $('cloud-container');
  if (!clouds) return;
  clouds.classList.remove('clouds-cover');
  void clouds.offsetWidth;
  clouds.classList.add('clouds-sweep-out');
}

function hideClouds() {
  const clouds = $('cloud-container');
  if (!clouds) return;
  clouds.classList.remove('clouds-cover', 'clouds-sweep-out');
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

/* ── Crosshair Reticle Controls (Disabled) ──────────────────────── */
function showCrosshair() {
  const ch = $('crosshair');
  if (ch) ch.style.display = 'none';
}

function lockCrosshair() {
  const ch = $('crosshair');
  if (ch) ch.style.display = 'none';
}

function hideCrosshair() {
  const ch = $('crosshair');
  if (ch) ch.style.display = 'none';
}

/* ── MapLibre Jaipur Radar Target Marker (Removed) ─────────────── */
function addJaipurMarker() {
  removeJaipurMarker();
}

function removeJaipurMarker() {
  if (jaipurMarker) {
    try {
      jaipurMarker.remove();
    } catch (e) {}
    jaipurMarker = null;
  }
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

let currentHighlightId = 0;

async function renderHighlight(stateName, countryName, centerCoords, radiusKm = 150) {
  if (!map) return;
  const thisId = ++currentHighlightId;

  removeStateHighlight();

  const isSmallRegion = stateName && (stateName.toLowerCase() === 'delhi' || stateName.toLowerCase().includes('delhi'));
  const effectiveRadius = isSmallRegion ? 45 : radiusKm;
  const initialGeoJSON = createGeoJSONCircle(centerCoords, effectiveRadius);

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
          'fill-opacity-transition': { duration: 180, delay: 0 },
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
          'line-opacity-transition': { duration: 180, delay: 0 },
          'line-opacity': 0.95
        }
      });
    } else {
      map.getSource('state-highlight').setData(initialGeoJSON);
      map.setPaintProperty('state-fill', 'fill-opacity-transition', { duration: 180, delay: 0 });
      map.setPaintProperty('state-fill', 'fill-opacity', 0.20);
      map.setPaintProperty('state-line', 'line-opacity-transition', { duration: 180, delay: 0 });
      map.setPaintProperty('state-line', 'line-opacity', 0.95);
    }
  } catch (e) {
    console.warn('MapLibre highlight layer:', e);
  }

  // Refine asynchronously with exact polygon if available
  try {
    const q = encodeURIComponent(`${stateName}, ${countryName || ''}`);
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${q}&polygon_geojson=1&format=json&limit=1`,
      1600
    );
    if (!res.ok) return;
    const data = await res.json();
    if (thisId !== currentHighlightId) return; // stale request
    if (
      data &&
      data[0] &&
      data[0].geojson &&
      (data[0].geojson.type === 'Polygon' || data[0].geojson.type === 'MultiPolygon')
    ) {
      if (map && map.getSource('state-highlight')) {
        map.getSource('state-highlight').setData(data[0].geojson);
      }
    }
  } catch (e) {
    // Retain circle geometry
  }
}

// Alias for backwards compatibility
const renderStateHighlight = renderHighlight;

async function fadeHighlight(duration = 260) {
  if (!map) return;
  try {
    if (map.getLayer('state-fill')) {
      map.setPaintProperty('state-fill', 'fill-opacity-transition', { duration, delay: 0 });
      map.setPaintProperty('state-fill', 'fill-opacity', 0);
    }
    if (map.getLayer('state-line')) {
      map.setPaintProperty('state-line', 'line-opacity-transition', { duration, delay: 0 });
      map.setPaintProperty('state-line', 'line-opacity', 0);
    }
    await sleep(duration);
    removeStateHighlight();
  } catch (e) {
    removeStateHighlight();
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
  if (!timelineConfig) await loadTimelineConfig();

  const views = timelineConfig.views || [];

  const v1 = (timelineConfig && timelineConfig.views && timelineConfig.views[0]) || { zoom: 15.0, colorGrade: 'GROUND' };
  let currentZoom = resolveZoom(v1);
  let currentCoords = resolveTargetCoords(v1.target, v1.coords);

  for (let i = 0; i < views.length; i++) {
    if (currentPhase === PHASE.SKIP) return;
    const step = views[i];

    if (step.type === 'hidden_cut') {
      currentPhase = PHASE.CLOUD_CUT;
      startCloudWind();
      sweepCloudsIn();
      await sleep(step.cloudSweepInMs || 200);
      if (currentPhase === PHASE.SKIP) return;

      // Mid-flash silent camera jump under cloud cover (instant cut)
      triggerFlash();
      playShutterClackSound(false);
      const destCoords = resolveTargetCoords(step.destinationTarget);
      const destZoom = step.destinationZoom || 5.0;
      jumpCamera(destCoords, destZoom);
      if (step.colorGrade) applyGrade(step.colorGrade, destZoom);

      await sleep(step.flashPopMs || 120);
      if (currentPhase === PHASE.SKIP) return;

      // Hold under full cloud cover
      await sleep(step.cloudHoldMs || 200);
      if (currentPhase === PHASE.SKIP) return;

      // Cloud sweep out revealing next territory
      sweepCloudsOut();
      stopCloudWind();
      await sleep(step.cloudSweepOutMs || 250);
      if (currentPhase === PHASE.SKIP) return;

      currentZoom = destZoom;
      currentCoords = destCoords;
      continue;
    }

    // Regular view step
    const targetCoords = resolveTargetCoords(step.target, step.coords);
    const zoomLevel = resolveZoom(step);
    const transitionMs = (typeof step.transitionMs === 'number') ? step.transitionMs : 200;

    // Fast zoom travel with synchronized motion blur for steps after View 1
    if (i > 0 && transitionMs > 0) {
      const isZoomOut = zoomLevel < currentZoom;
      const direction = isZoomOut ? 'out' : 'in';

      // Accents trigger at start of fast zoom motion
      if (step.flash) triggerFlash();
      if (step.shutterSound) playShutterClackSound(step.shutterFirst || false);

      setMotionBlur(true, direction);
      await easeCamera({
        center: targetCoords,
        zoom: zoomLevel,
        duration: transitionMs,
        easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      });
      setMotionBlur(false);
    } else if (i > 0 && transitionMs === 0) {
      if (step.flash) triggerFlash();
      if (step.shutterSound) playShutterClackSound(step.shutterFirst || false);
      jumpCamera(targetCoords, zoomLevel);
    }

    // Map view index to PHASE enum upon arrival
    currentPhase = step.index || currentPhase;

    // Apply color grade and altitude blur tier
    if (step.colorGrade) applyGrade(step.colorGrade, zoomLevel);

    // Crosshair & breathing
    if (step.crosshair) showCrosshair();
    if (step.breathing) addBreathing(); else removeBreathing();

    // Highlights
    if (step.highlight && step.highlight.enabled) {
      const isVisitor = step.highlight.type === 'visitor_state';
      const hName = isVisitor ? (visitorState || step.highlight.defaultName || 'California') : (step.highlight.name || 'Jaipur');
      const hCountry = isVisitor ? (visitorCountry || step.highlight.defaultCountry || 'United States') : (step.highlight.country || 'India');
      renderHighlight(hName, hCountry, targetCoords, step.highlight.radiusKm || 150);
    } else {
      removeStateHighlight();
    }

    // Landing touchdown impact
    if (step.isLanding) {
      currentPhase = PHASE.VIEW_7_FINAL;
      if (step.landingSound) playLandingSound();
      if (step.landingImpact) {
        const mapEl = $('map');
        if (mapEl) {
          mapEl.classList.remove('camera-recoil-landing');
          void mapEl.offsetWidth;
          mapEl.classList.add('camera-recoil-landing');
          setTimeout(() => mapEl && mapEl.classList.remove('camera-recoil-landing'), 370);
        }
      }
      if (step.crosshairLock) lockCrosshair();
      if (step.marker) addJaipurMarker();
    }

    // Hold duration & highlight fade handling
    const holdMs = (typeof step.holdMs === 'number') ? step.holdMs : 3000;
    console.log(`🎬 [View ${step.index || (i + 1)}] "${step.name || step.id}": zoom=${zoomLevel}, travel=${transitionMs}ms, hold=${holdMs}ms, target=`, targetCoords);

    if (step.highlight && step.highlight.enabled) {
      const fadeMs = Math.min((typeof step.highlight.fadeOutMs === 'number') ? step.highlight.fadeOutMs : 260, holdMs);
      await sleep(holdMs - fadeMs);
      if (currentPhase === PHASE.SKIP) return;
      await fadeHighlight(fadeMs);
      if (currentPhase === PHASE.SKIP) return;
    } else {
      await sleep(holdMs);
      if (currentPhase === PHASE.SKIP) return;
    }

    currentZoom = zoomLevel;
    currentCoords = targetCoords;
  }

  /* ──────────────────────────────────────────────────────────────
     SETTLE before dock
  ────────────────────────────────────────────────────────────── */
  currentPhase = PHASE.SETTLE;
  hideCrosshair();
  await sleep(timelineConfig.settleMs || 600);
  if (currentPhase === PHASE.SKIP) return;

  /* ──────────────────────────────────────────────────────────────
     DOCK: Dynamic transition duration from timeline.json
  ────────────────────────────────────────────────────────────── */
  await runDock();
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

  const dockMs = (timelineConfig && timelineConfig.dockTransitionMs) || 2200;

  // Pin card appears mid-way through the slide
  await sleep(Math.floor(dockMs / 2));
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
  }, dockMs + 50);
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
  setMotionBlur(false);

  if (map) {
    map.stop();
    map.jumpTo({
      center: JAIPUR,
      zoom: 15.0,
      pitch: 0,
      bearing: 0
    });
    removeJaipurMarker();
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
  hideClouds();
  setMotionBlur(false);

  if (map) {
    map.jumpTo({
      center: JAIPUR,
      zoom: 15.0,
      pitch: 0,
      bearing: 0
    });
    removeJaipurMarker();
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

  await loadTimelineConfig();

  if (forceSkip) {
    const landingZoom = (timelineConfig && timelineConfig.views && timelineConfig.views.find(v => v.isLanding)?.zoom) || 15.0;
    await initMap(JAIPUR, landingZoom, 0, 0);
    showFinalState();
    return;
  }

  // Start at View 1's configured zoom & color grade
  const v1 = (timelineConfig && timelineConfig.views && timelineConfig.views[0]) || { zoom: 15.0, colorGrade: 'GROUND' };
  const v1Coords = resolveTargetCoords(v1.target, v1.coords);
  const v1Zoom = resolveZoom(v1);
  await initMap(v1Coords, v1Zoom, 0, 0);
  applyGrade(v1.colorGrade || 'GROUND', v1Zoom);

  await runGTASequence();
}

document.addEventListener('DOMContentLoaded', main);