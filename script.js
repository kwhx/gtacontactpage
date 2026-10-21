'use strict';

const JAIPUR = [75.7873, 26.9124];
const RAJASTHAN_CENTER = [73.85, 26.60];
const INDIA_CENTER = [78.9629, 22.5937];
const FALLBACK_LOC = [-118.2437, 34.0522];
const INTRO_VIDEO_WEBM = 'assets/intro/gtav-switch-intro.webm';
const INTRO_VIDEO_MP4 = 'assets/intro/gtav-switch-intro.mp4';
const INTRO_MIN_PLAY_MS = 9000;

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
        console.log('%cACTIVE TIMELINE LOADED FROM timeline.json:', 'background: #0c151b; color: #38bdf8; font-size: 13px; font-weight: bold; padding: 4px;', timelineConfig);
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
        { id: "view_1_street", index: 1, name: "Street (visitor)", target: "visitor", zoom: 15.0, approxAltitudeKm: 1.2, holdMs: 3000, colorGrade: "GROUND", breathing: true, crosshair: false, use3D: true, highlight: { enabled: false }, transitionMs: 0 },
        { id: "view_2_out1", index: 2, name: "Out 1 (visitor)", target: "visitor", zoom: 11.0, approxAltitudeKm: 18, holdMs: 500, colorGrade: "OUT_1", shutterSound: true, shutterFirst: true, cameraPop: true, flash: true, highlight: { enabled: false }, transitionMs: 140 },
        { id: "view_3_out2", index: 3, name: "Out 2 (visitor)", target: "visitor", zoom: 8.0, approxAltitudeKm: 120, holdMs: 500, colorGrade: "OUT_1", shutterSound: true, shutterFirst: false, cameraPop: true, flash: true, highlight: { enabled: false }, transitionMs: 140 },
        { id: "view_4_out3", index: 4, name: "Out 3 (max out — visitor)", target: "visitor", zoom: 6.5, approxAltitudeKm: 350, holdMs: 2500, colorGrade: "OUT_2", shutterSound: true, shutterFirst: false, cameraPop: true, flash: true, highlight: { enabled: true, type: "visitor_state", defaultName: "California", defaultCountry: "United States", radiusKm: 280, fadeOutMs: 260 }, transitionMs: 160 },
        { id: "disguised_pan_cut", index: null, type: "disguised_pan_cut", name: "Disguised Pan & Pacific Jump", panOffsetDeg: [0.15, -0.04], panDurationMs: 400, cloudSweepInMs: 220, flashPopMs: 120, cloudHoldMs: 220, cloudSweepOutMs: 280, destinationTarget: "jaipur", destinationZoom: 6.5, colorGrade: "IN_1", transitionMs: 0 },
        { id: "view_5_in1", index: 5, name: "In 1 (Jaipur)", target: "jaipur", zoom: 10.0, approxAltitudeKm: 30, holdMs: 500, colorGrade: "IN_2", shutterSound: true, shutterFirst: false, cameraPop: true, flash: true, highlight: { enabled: false }, transitionMs: 140 },
        { id: "view_6_in2", index: 6, name: "In 2 (Jaipur)", target: "jaipur", zoom: 13.0, approxAltitudeKm: 5, holdMs: 500, colorGrade: "IN_3", shutterSound: true, shutterFirst: false, cameraPop: true, flash: true, highlight: { enabled: false }, transitionMs: 150 },
        { id: "view_7_final", index: 7, name: "Final — Landing (Jaipur)", target: "jaipur", zoom: 15.0, approxAltitudeKm: 1.2, holdMs: 1500, colorGrade: "LANDING", isLanding: true, landingSound: true, landingImpact: true, use3D: true, marker: false, crosshairLock: false, flash: true, highlight: { enabled: false }, transitionMs: 180 }
      ]
    };
    window.TIMELINE = timelineConfig;
  }

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

    const z = Math.round((Math.log2(35800 / dist)) * 2) / 2;
    return Math.max(0, Math.min(19, z));
  }
  return 10.0;
}

const PHASE = Object.freeze({
  VIEW_1_STREET: 1,
  VIEW_2_OUT1: 2,
  VIEW_3_OUT2: 3,
  VIEW_4_OUT3: 4,
  CLOUD_CUT: 5,
  VIEW_5_IN1: 6,
  VIEW_6_IN2: 7,
  VIEW_7_FINAL: 8,
  SETTLE: 9,
  DOCK: 10,
  SKIP: 99,
});

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

let map = null;
let threeSceneManager = null;
let currentPhase = PHASE.VIEW_1_STREET;
let visitorCoords = [...FALLBACK_LOC];
let visitorState = 'California';
let visitorCountry = 'United States';
let visitorCity = 'Los Angeles';
let selectedBudget = null;
let isMobile = false;
let soundEnabled = (function () {
  try {
    return sessionStorage.getItem('gta_sound_muted') !== '1';
  } catch (_) {
    return true;
  }
})();
let jaipurMarker = null;
let finalStateShown = false;

const $ = id => document.getElementById(id);

function roundCoord(v) { return Math.round(v * 2) / 2; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchWithTimeout(url, ms = 3000, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function hasQueryFlag(flag) {
  return location.search.includes(flag);
}

function getQueryParam(name) {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch (e) {
    return null;
  }
}

async function pickIntroVideoSource() {
  const forceLive = hasQueryFlag('live') || hasQueryFlag('noVideoIntro=1');
  const forceVideo = hasQueryFlag('videoIntro=1');
  if (forceLive) return null;

  const candidates = [INTRO_VIDEO_MP4, INTRO_VIDEO_WEBM];
  for (const src of candidates) {
    try {
      const res = await fetchWithTimeout(`${src}?v=${Date.now()}`, 1800, { cache: 'no-store', method: 'HEAD' });
      if (res.ok) return src;
    } catch (e) {

    }
  }

  return forceVideo ? INTRO_VIDEO_WEBM : null;
}

function hideVideoIntroLayer() {
  const layer = $('video-intro-layer');
  const video = $('video-intro');
  if (!layer) return;
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  layer.classList.remove('active');
  layer.classList.add('hidden');
  layer.setAttribute('aria-hidden', 'true');
}

async function playVideoIntroAndWait(source) {
  const layer = $('video-intro-layer');
  const video = $('video-intro');
  if (!layer || !video || !source) return false;

  layer.classList.remove('hidden');
  layer.classList.add('active');
  layer.setAttribute('aria-hidden', 'false');
  video.muted = true;
  video.playsInline = true;

  const sourceOrder = [source, INTRO_VIDEO_MP4, INTRO_VIDEO_WEBM]
    .filter((value, index, array) => array.indexOf(value) === index);

  const tryPlaySource = (src) => new Promise((resolve) => {
    let finished = false;
    const startedAt = performance.now();
    const done = (ok) => {
      if (finished) return;
      finished = true;
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      resolve(ok);
    };
    const onEnded = () => {
      const elapsedMs = performance.now() - startedAt;

      done(elapsedMs >= INTRO_MIN_PLAY_MS);
    };
    const onError = () => done(false);

    video.src = `${src}?v=${Date.now()}`;
    video.load();
    video.addEventListener('ended', onEnded, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.play().catch(() => done(false));
  });

  try {
    for (const src of sourceOrder) {
      const ok = await tryPlaySource(src);
      if (ok) return true;
    }
    return false;
  } finally { }
}

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

const VECTOR_STYLE = {
  version: 8,
  sources: {
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet'
    }
  },
  layers: [

    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#9C9080'
      }
    },

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

    {
      id: 'road_minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 9,
      filter: ['match', ['get', 'class'], ['tertiary', 'minor', 'service', 'track', 'path', 'residential'], true, false],
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

    {
      id: 'road_secondary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 8,
      filter: ['match', ['get', 'class'], ['secondary'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#E8E4DA',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 10, 1.2, 15, 2.0]
      }
    },

    {
      id: 'road_primary',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 6,
      filter: ['match', ['get', 'class'], ['primary'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#E8E4DA',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 10, 1.4, 15, 2.2]
      }
    },

    {
      id: 'road_major',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 3,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk'], true, false],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#E8E4DA',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 6, 1.2, 10, 1.6, 15, 2.5]
      }
    },

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

  ]
};

function waitForMapIdle(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!map || currentPhase === PHASE.SKIP) { resolve(); return; }

    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        if (map) {
          map.off('idle', finish);
          map.off('render', finish);
        }
        resolve();
      }
    };

    const checkLoaded = () => {
      if (map && map.isStyleLoaded && map.isStyleLoaded() && map.loaded && map.loaded()) {
        finish();
        return true;
      }
      return false;
    };

    if (checkLoaded()) return;

    if (map) {
      map.once('idle', finish);
      map.on('render', () => {
        if (!settled && checkLoaded()) finish();
      });
    }

    if (timeoutMs > 0) {
      setTimeout(finish, timeoutMs);
    }
  });
}

function waitForCaptureReadiness(stageId, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    if (!map) {
      reject(new Error(`${stageId}: map was not created`));
      return;
    }
    const started = performance.now();
    const errors = [];
    let stableFrames = 0;
    let settled = false;
    const cleanup = () => {
      map.off('error', onError);
      map.off('render', onRender);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ stableFrames, errors });
    };
    const fail = (reason) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`${stageId}: ${reason}; errors=${errors.join(' | ') || 'none'}; stableFrames=${stableFrames}`));
    };
    const onError = (event) => {
      const message = event && event.error && event.error.message ? event.error.message : 'MapLibre error';
      errors.push(message);
    };
    const check = () => {
      const styleReady = map.isStyleLoaded && map.isStyleLoaded();

      const tilesReady = !map.areTilesLoaded || map.areTilesLoaded();
      if (styleReady && tilesReady && errors.length === 0) {
        stableFrames += 1;
        if (stableFrames >= 10) finish();
      } else {
        stableFrames = 0;
      }
      if (performance.now() - started > timeoutMs) fail('capture readiness timed out');
    };
    const onRender = check;
    const poll = () => {
      if (settled) return;
      check();
      if (!settled) requestAnimationFrame(poll);
    };
    map.on('error', onError);
    map.on('render', onRender);
    map.triggerRepaint();
    requestAnimationFrame(poll);
    setTimeout(() => fail('capture readiness timed out'), timeoutMs + 50);
  });
}

function cameraProfile(name, t) {
  switch (name) {
    case 'zoom-out-fast':
      return t < 0.38
        ? 1.15 * Math.pow(t / 0.38, 2.7)
        : 1 - Math.pow((1 - t) / 0.62, 1.7);
    case 'zoom-out-mid':
      return t < 0.46
        ? 1.1 * Math.pow(t / 0.46, 2.35)
        : 1 - Math.pow((1 - t) / 0.54, 1.9);
    case 'zoom-out-slow':
      return t < 0.52
        ? Math.pow(t / 0.52, 1.9)
        : 1 - Math.pow((1 - t) / 0.48, 2.6);
    case 'zoom-in-fast':
      return t < 0.58
        ? 1.2 * Math.pow(t / 0.58, 1.7)
        : 1 - Math.pow((1 - t) / 0.42, 2.7);
    case 'zoom-in-mid':
      return t < 0.62
        ? 1.18 * Math.pow(t / 0.62, 1.85)
        : 1 - Math.pow((1 - t) / 0.38, 3.2);
    case 'zoom-in-slow':
      return t < 0.66
        ? 1.1 * Math.pow(t / 0.66, 1.65)
        : 1 - Math.pow((1 - t) / 0.34, 3.6);
    case 'global-travel':
      return t < 0.5
        ? 1.12 * Math.pow(t / 0.5, 1.55)
        : 1 - Math.pow((1 - t) / 0.5, 2.15);
    case 'pan':
      return 1 - Math.pow(1 - t, 3);
    case 'city-close':
      return t * t * (3 - 2 * t);
    default:
      return t * t * (3 - 2 * t);
  }
}

function sampleArcPoint(start, end, t) {
  const arcBias = Math.sin(Math.PI * t) * 8.5;
  const lat = start[1] + (end[1] - start[1]) * t + arcBias * 0.12;
  const lng = start[0] + (end[0] - start[0]) * t;
  return [lng, lat];
}

function animateArcTravel({ start, end, startZoom, endZoom, peakZoom = null, duration, profile = 'global-travel' }) {
  return new Promise((resolve) => {
    if (!map || currentPhase === PHASE.SKIP) {
      resolve();
      return;
    }

    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = (now - startTime) / duration;
      const t = Math.min(Math.max(elapsed, 0), 1);
      if (t >= 1) {
        map.jumpTo({ center: end, zoom: endZoom, pitch: 0, bearing: 0, essential: true });
        resolve();
        return;
      }

      const eased = cameraProfile(profile, t);
      const center = sampleArcPoint(start, end, eased);
      const zoom = peakZoom === null
        ? startZoom + (endZoom - startZoom) * eased
        : (eased < 0.5
          ? startZoom + (peakZoom - startZoom) * (eased * 2)
          : peakZoom + (endZoom - peakZoom) * ((eased - 0.5) * 2));
      map.jumpTo({ center, zoom, pitch: 0, bearing: 0, essential: true });
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

async function preloadMapRegion(center, zoom, label = 'warmup', timeoutMs = 15000) {
  if (!map) return;
  map.jumpTo({ center, zoom, pitch: 0, bearing: 0, essential: true });
  await waitForMapIdle(timeoutMs);
  console.log(`[Map preload] ${label} ready at ${zoom}z / ${center.join(',')}`);
}

async function preloadWorldAndRegionTiles() {
  if (!map) return;

  const westCoast = [-118.2437, 34.0522];
  const jaipur = JAIPUR;
  const indiaHub = [76.5, 22.5];

  await preloadMapRegion(westCoast, 10.5, 'visitor region', 16000);
  await preloadMapRegion(jaipur, 10.5, 'jaipur region', 16000);
  await preloadMapRegion(indiaHub, 4.75, 'india overview', 18000);
  await preloadMapRegion(westCoast, 15.0, 'visitor street', 12000);
  await preloadMapRegion(jaipur, 15.0, 'jaipur street', 12000);
}

async function renderCaptureStage(stageId, threeReady) {
  if (!timelineConfig || !Array.isArray(timelineConfig.views)) return false;
  const capture = (timelineConfig.captureStages || []).find(v => v && v.id === stageId);
  const sourceId = capture && capture.sourceView ? capture.sourceView : stageId;
  const sourceStep = timelineConfig.views.find(v => v && v.id === sourceId);
  const step = capture ? { ...sourceStep, ...capture } : sourceStep;
  if (!step || step.type) return false;

  const targetCoords = step.center || resolveTargetCoords(step.target, step.coords);
  const zoomLevel = resolveZoom(step);
  await initMap(targetCoords, zoomLevel, 0, 0);
  await preloadMapRegion(targetCoords, zoomLevel, `capture ${stageId}`, 20000);
  const readiness = await waitForCaptureReadiness(stageId, 25000);

  if (step.colorGrade) applyGrade(step.colorGrade, zoomLevel);

  if (threeSceneManager && threeReady && step.use3D) {
    const locKey = (step.target === 'jaipur' || step.isLanding) ? 'jaipur' : 'visitor';
    threeSceneManager.show(locKey);
  } else if (threeSceneManager && threeSceneManager.active) {
    threeSceneManager.hide();
  }

  removeBreathing();
  hideClouds();
  setMotionBlur(false);

  window.__CAPTURE_STAGE_READY = {
    id: stageId,
    zoom: zoomLevel,
    center: targetCoords,
    readiness,
    readyAt: Date.now()
  };
  console.log(`[Capture] stage ready: ${stageId} @ z${zoomLevel}`);
  return true;
}

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

    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        map.off('idle', done);
        resolve();
      }
    };

    map.once('idle', done);

    setTimeout(done, 10000);
  });
}

const PALETTE_3D = {
  building: 0xB7B0A0,
  ground: 0x9C9080,
  road: '#E8E4DA',
  sun: 0xffecd0,
  hemiSky: 0xffffff,
  hemiGnd: 0x5a544d,
};

const BUNDLED_BUILDINGS = {
  visitor: [

    { points: [[-32, -32], [32, -32], [32, 32], [-32, 32]], height: 55, name: "Tower Alpha" },
    { points: [[48, 12], [96, 12], [96, 56], [48, 56]], height: 42 },
    { points: [[-104, 16], [-48, 16], [-48, 64], [-104, 64]], height: 36 },
    { points: [[-92, -80], [-44, -80], [-44, -36], [-92, -36]], height: 26 },
    { points: [[44, -84], [94, -84], [94, -38], [44, -38]], height: 32 },
    { points: [[-32, 44], [32, 44], [32, 90], [-32, 90]], height: 22 },
    { points: [[-32, -90], [32, -90], [32, -44], [-32, -44]], height: 20 },
    { points: [[-136, -116], [-92, -116], [-92, -74], [-136, -74]], height: 16 },
    { points: [[98, -126], [146, -126], [146, -72], [98, -72]], height: 28 },
    { points: [[-142, 10], [-108, 10], [-108, 68], [-142, 68]], height: 18 },
    { points: [[106, 14], [144, 14], [144, 70], [106, 70]], height: 24 },
    { points: [[-86, 96], [-36, 96], [-36, 134], [-86, 134]], height: 19 },
    { points: [[40, 96], [88, 96], [88, 134], [40, 134]], height: 21 },
    { points: [[-140, -42], [-104, -42], [-104, 2], [-140, 2]], height: 15 },
    { points: [[104, -42], [142, -42], [142, 2], [104, 2]], height: 20 }
  ],
  jaipur: [

    { points: [[-46, -46], [46, -46], [46, 46], [-46, 46]], height: 18, name: "Haveli Central" },
    { points: [[-18, -18], [18, -18], [18, 18], [-18, 18]], height: 12, name: "Inner Pavilion" },

    { points: [[-112, 60], [-62, 60], [-62, 88], [-112, 88]], height: 14 },
    { points: [[-52, 60], [-6, 60], [-6, 88], [-52, 88]], height: 15 },
    { points: [[8, 60], [56, 60], [56, 88], [8, 88]], height: 13 },
    { points: [[66, 60], [116, 60], [116, 88], [66, 88]], height: 16 },

    { points: [[-112, -88], [-62, -88], [-62, -60], [-112, -60]], height: 13 },
    { points: [[-52, -88], [-6, -88], [-6, -60], [-52, -60]], height: 14 },
    { points: [[8, -88], [56, -88], [56, -60], [8, -60]], height: 15 },
    { points: [[66, -88], [116, -88], [116, -60], [66, -60]], height: 12 },

    { points: [[-126, -46], [-62, -46], [-62, 46], [-126, 46]], height: 14 },

    { points: [[62, -46], [128, -46], [128, 46], [62, 46]], height: 22 },

    { points: [[-132, 98], [-42, 98], [-42, 132], [-132, 132]], height: 11 },
    { points: [[32, 98], [122, 98], [122, 132], [32, 132]], height: 12 },
    { points: [[-132, -132], [-42, -132], [-42, -98], [-132, -98]], height: 10 },
    { points: [[32, -132], [122, -132], [122, -98], [32, -98]], height: 13 }
  ]
};

function parseBuildingHeight(tags = {}) {
  if (tags.height) {
    const num = parseFloat(String(tags.height).replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 1) return Math.min(num, 120);
  }
  if (tags['building:levels']) {
    const lvl = parseFloat(String(tags['building:levels']).replace(/[^0-9.]/g, ''));
    if (!isNaN(lvl) && lvl > 0) return Math.min(lvl * 3.5, 120);
  }
  const type = (tags.building || '').toLowerCase();
  if (['commercial', 'office', 'hotel', 'retail'].includes(type)) return 22;
  if (['apartments', 'residential'].includes(type)) return 14;
  if (['house', 'detached', 'terrace'].includes(type)) return 8;
  return 12;
}

function parseOverpassToFootprints(data, centerCoords) {
  if (!data || !Array.isArray(data.elements)) return null;
  const [centerLng, centerLat] = centerCoords;
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  const nodeMap = new Map();

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, [el.lon, el.lat]);
    }
  }

  const footprints = [];
  for (const el of data.elements) {
    if (el.type === 'way' && el.tags && (el.tags.building || el.tags['building:part'])) {
      if (!Array.isArray(el.nodes) || el.nodes.length < 3) continue;
      const pts = [];
      for (const nid of el.nodes) {
        const coord = nodeMap.get(nid);
        if (coord) {
          const dx = (coord[0] - centerLng) * 111320 * cosLat;
          const dz = -(coord[1] - centerLat) * 111320;
          pts.push([dx, dz]);
        }
      }
      if (pts.length >= 3) {
        footprints.push({
          points: pts,
          height: parseBuildingHeight(el.tags)
        });
      }
    }
  }
  return footprints.length >= 4 ? footprints : null;
}

async function fetchOverpassBuildings(centerCoords, radius = 220, timeoutMs = 2600) {
  try {
    const [lng, lat] = centerCoords;
    const query = `[out:json][timeout:3];(way["building"](around:${radius},${lat.toFixed(5)},${lng.toFixed(5)}););out body;>;out skel qt;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) return null;
    const json = await res.json();
    return parseOverpassToFootprints(json, centerCoords);
  } catch (e) {
    console.log('Overpass live fetch skipped/failed, using bundled 3D footprints:', e.message || e);
    return null;
  }
}

async function prefetchBuildingData(coords, locationKey) {
  if (!threeSceneManager) return;
  const liveData = await fetchOverpassBuildings(coords, 220, 2600);
  if (liveData && liveData.length >= 4) {
    threeSceneManager.cachedFootprints[locationKey] = liveData;
    console.log(`Loaded ${liveData.length} live 3D building footprints from Overpass for ${locationKey}`);
    if (threeSceneManager.active && threeSceneManager.currentLocation === locationKey) {
      threeSceneManager.buildFootprints(liveData);
    }
  }
}

class ThreeSceneManager {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.sunLight = null;
    this.hemiLight = null;
    this.groundMesh = null;
    this.buildingGroup = null;
    this.active = false;
    this.animId = null;
    this.startTime = 0;
    this.currentLocation = null;
    this.cachedFootprints = {
      jaipur: BUNDLED_BUILDINGS.jaipur,
      visitor: BUNDLED_BUILDINGS.visitor
    };
    this.buildingMaterial = null;
  }

  init() {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js not found, 3D scenes disabled');
      return false;
    }

    this.canvas = $('three-canvas');
    if (!this.canvas) return false;

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(width, height, false);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    } catch (e) {
      console.warn('WebGL initialization failed:', e);
      return false;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c151b);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 1, 3000);
    this.camera.position.set(0, 220, 220);
    this.camera.lookAt(0, 0, -20);

    this.sunLight = new THREE.DirectionalLight(PALETTE_3D.sun, 1.85);
    this.sunLight.position.set(160, 120, -140);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 650;
    this.sunLight.shadow.camera.left = -220;
    this.sunLight.shadow.camera.right = 220;
    this.sunLight.shadow.camera.top = 220;
    this.sunLight.shadow.camera.bottom = -220;
    this.sunLight.shadow.bias = -0.0006;
    this.scene.add(this.sunLight);

    this.hemiLight = new THREE.HemisphereLight(PALETTE_3D.hemiSky, PALETTE_3D.hemiGnd, 0.65);
    this.scene.add(this.hemiLight);

    const groundGeo = new THREE.PlaneGeometry(600, 600);
    const groundTex = this.createGroundTexture();
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.95,
      metalness: 0.0
    });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    this.buildingMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE_3D.building,
      roughness: 0.85,
      metalness: 0.05
    });

    this.buildingGroup = new THREE.Group();
    this.scene.add(this.buildingGroup);

    window.addEventListener('resize', () => this.resize());
    return true;
  }

  createGroundTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#9C9080';
    ctx.fillRect(0, 0, 1024, 1024);

    ctx.fillStyle = PALETTE_3D.road;

    ctx.fillRect(484, 0, 56, 1024);

    ctx.fillRect(0, 484, 1024, 56);

    ctx.fillRect(200, 0, 28, 1024);
    ctx.fillRect(796, 0, 28, 1024);
    ctx.fillRect(0, 200, 1024, 28);
    ctx.fillRect(0, 796, 1024, 28);

    const texture = new THREE.CanvasTexture(c);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  buildFootprints(footprints) {
    if (!this.buildingGroup) return;

    while (this.buildingGroup.children.length > 0) {
      const child = this.buildingGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      this.buildingGroup.remove(child);
    }

    if (!Array.isArray(footprints)) return;

    for (const b of footprints) {
      const pts = b.points;
      if (!pts || pts.length < 3) continue;

      try {
        const shape = new THREE.Shape();
        const p0 = Array.isArray(pts[0]) ? { x: pts[0][0], z: pts[0][1] } : pts[0];
        shape.moveTo(p0.x, -p0.z);

        for (let i = 1; i < pts.length; i++) {
          const pi = Array.isArray(pts[i]) ? { x: pts[i][0], z: pts[i][1] } : pts[i];
          shape.lineTo(pi.x, -pi.z);
        }
        shape.closePath();

        const depth = Math.max(4, Math.min(100, b.height || 14));
        const geom = new THREE.ExtrudeGeometry(shape, {
          depth: depth,
          bevelEnabled: false
        });

        const mesh = new THREE.Mesh(geom, this.buildingMaterial);
        mesh.rotation.x = -Math.PI / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.buildingGroup.add(mesh);
      } catch (e) {

      }
    }
  }

  loadLocation(locationKey = 'visitor') {
    const data = this.cachedFootprints[locationKey] || this.cachedFootprints.visitor;
    this.currentLocation = locationKey;
    this.buildFootprints(data);
  }

  show(locationKey = 'visitor') {
    if (!this.renderer) return false;
    this.loadLocation(locationKey);
    this.active = true;
    this.startTime = Date.now();

    if (this.canvas) {
      this.canvas.classList.add('active');
    }
    const mapEl = $('map');
    if (mapEl) mapEl.style.opacity = '0';

    this.resize();
    this.startLoop();
    return true;
  }

  hide() {
    this.active = false;
    this.stopLoop();
    if (this.canvas) {
      this.canvas.classList.remove('active');
    }
    const mapEl = $('map');
    if (mapEl) mapEl.style.opacity = '1';
  }

  startLoop() {
    this.stopLoop();
    const render = () => {
      if (!this.active) return;
      const elapsed = (Date.now() - this.startTime) * 0.001;

      this.camera.position.x = Math.sin(elapsed * 0.4) * 6;
      this.camera.position.y = 220 + Math.sin(elapsed * 0.55) * 3;
      this.camera.position.z = 220 + Math.cos(elapsed * 0.35) * 5;
      this.camera.lookAt(0, 0, -20);

      this.renderer.render(this.scene, this.camera);
      this.animId = requestAnimationFrame(render);
    };
    this.animId = requestAnimationFrame(render);
  }

  stopLoop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  resize() {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    if (width > 0 && height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }
  }
}

function easeCamera({ center, zoom, duration = 180, easing = (t) => t, profile = 'default', pitch = 0, bearing = 0 }) {
  return new Promise((resolve) => {
    if (currentPhase === PHASE.SKIP || !map) { resolve(); return; }

    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        map.off('moveend', finish);
        map.off('idle', finish);
        resolve();
      }
    };

    map.once('moveend', finish);
    map.once('idle', finish);

    const normalizedEasing = (t) => {
      const base = typeof easing === 'function' ? easing(t) : t;
      return cameraProfile(profile, base);
    };

    map.easeTo({
      center,
      zoom,
      pitch,
      bearing,
      duration,
      easing: normalizedEasing,
      essential: true
    });

    setTimeout(finish, duration + 120);
  });
}

function jumpCamera(center, zoom = 5.0) {
  if (currentPhase === PHASE.SKIP || !map) return;
  map.jumpTo({
    center,
    zoom,
    pitch: 0,
    bearing: 0,
    essential: true
  });
}

function flyCamera(opts) {
  return easeCamera(opts);
}

function setMotionBlur(active, direction = 'out') {

  active = false;
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

}

const ALTITUDE_BLUR = {
  high: 'saturate(0.55) contrast(1.3)',
  low: 'saturate(0.85) contrast(1.15)'
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

  const threeEl = $('three-canvas');
  if (threeEl) {
    threeEl.style.setProperty('--grade-filter', combinedFilter);
    threeEl.style.filter = combinedFilter;
  }

  const washEl = $('color-wash');
  if (washEl) washEl.style.background = g.wash;

  const grainEl = $('grain');
  if (grainEl) grainEl.style.opacity = String(g.grain);
}

function triggerFlash() {

  return;
}

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

function addBreathing() {

}
function removeBreathing() {
  const mapEl = $('map');
  if (mapEl) mapEl.classList.remove('breathing');
  const threeEl = $('three-canvas');
  if (threeEl) threeEl.classList.remove('breathing');
}

function triggerSpeedStreaks() {
  const el = $('speed-streaks');
  if (!el) return;
  el.classList.remove('active');
  void el.offsetWidth;
  el.classList.add('active');
}

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

function addJaipurMarker() {
  removeJaipurMarker();
}

function removeJaipurMarker() {
  if (jaipurMarker) {
    try {
      jaipurMarker.remove();
    } catch (e) { }
    jaipurMarker = null;
  }
}

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

  try {
    const q = encodeURIComponent(`${stateName}, ${countryName || ''}`);
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${q}&polygon_geojson=1&format=json&limit=1`,
      1600
    );
    if (!res.ok) return;
    const data = await res.json();
    if (thisId !== currentHighlightId) return;
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

  }
}

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
  } catch (e) { }
}

let audioCtx = null;
let masterComp = null;
let masterGain = null;

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
    masterComp.threshold.setValueAtTime(-10, ctx.currentTime);
    masterComp.knee.setValueAtTime(4, ctx.currentTime);
    masterComp.ratio.setValueAtTime(6, ctx.currentTime);
    masterComp.attack.setValueAtTime(0.001, ctx.currentTime);
    masterComp.release.setValueAtTime(0.08, ctx.currentTime);

    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.92, ctx.currentTime);

    masterComp.connect(masterGain);
    masterGain.connect(ctx.destination);
  }
  return masterComp;
}

function unlockAudioContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => { });
  }
}

window.unlockGtaAudio = unlockAudioContext;

function initAudioUnlock() {
  const events = ['click', 'pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
  events.forEach(type => {
    window.addEventListener(type, unlockAudioContext, { passive: true });
    document.addEventListener(type, unlockAudioContext, { passive: true });
  });
  unlockAudioContext();
}

let _satCurve = null;
function getSaturationCurve() {
  if (!_satCurve) {
    const n = 256;
    _satCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      _satCurve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
    }
  }
  return _satCurve;
}

function playGtaThumpSound() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const dest = getAudioDestination(ctx);
  const now = ctx.currentTime;

  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(190, now);
  sub.frequency.exponentialRampToValueAtTime(36, now + 0.11);

  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.linearRampToValueAtTime(1.0, now + 0.002);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  const shaper = ctx.createWaveShaper();
  shaper.curve = getSaturationCurve();
  shaper.oversample = '2x';

  sub.connect(shaper);
  shaper.connect(subGain);
  subGain.connect(dest);
  sub.start(now);
  sub.stop(now + 0.17);

  const noiseDuration = 0.018;
  const bufSize = Math.floor(ctx.sampleRate * noiseDuration);
  const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    nd[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(1800, now);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(3000, now);
  bp.Q.setValueAtTime(2.2, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.18, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDuration);

  noise.connect(hp);
  hp.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(dest);
  noise.start(now);
  noise.stop(now + noiseDuration + 0.005);
}

window.playGtaThumpSound = playGtaThumpSound;
window.playGtaSwitchImpact = playGtaThumpSound;
window.playShutterClackSound = playGtaThumpSound;


async function runGTASequence() {
  if (currentPhase === PHASE.SKIP) return;
  if (!timelineConfig) await loadTimelineConfig();

  const views = timelineConfig.views || [];

  const v1 = (timelineConfig && timelineConfig.views && timelineConfig.views[0]) || { zoom: 15.0, colorGrade: 'GROUND', use3D: true };
  let currentZoom = resolveZoom(v1);
  let currentCoords = resolveTargetCoords(v1.target, v1.coords);

  const stageTimings = {
    'view_1_street': { duration: 0, profile: 'city-close' },
    'view_2_out1': { duration: 820, profile: 'zoom-out-fast' },
    'view_3_out2': { duration: 1180, profile: 'zoom-out-mid' },
    'view_4_out3': { duration: 1660, profile: 'zoom-out-slow' },
    'disguised_pan_cut': { duration: 720, profile: 'pan' },
    'view_5_in1': { duration: 980, profile: 'zoom-in-fast' },
    'view_6_in2': { duration: 1280, profile: 'zoom-in-mid' },
    'view_7_final': { duration: 1500, profile: 'zoom-in-slow' }
  };

  for (let i = 0; i < views.length; i++) {
    if (currentPhase === PHASE.SKIP) return;
    const step = views[i];

    if (step.type === 'disguised_pan_cut') {
      currentPhase = PHASE.CLOUD_CUT;
      console.log('[Disguised Pan] Starting invisible long-haul transfer into Jaipur...');

      const panOffset = step.panOffsetDeg || [0.15, -0.04];
      const panDuration = step.panDurationMs || 400;
      const destTarget = resolveTargetCoords(step.destinationTarget);
      const destZoom = step.destinationZoom || 6.5;

      const worldCenter = [-21.2, 42.0];
      const worldZoom = 2.1;

      setMotionBlur(true, 'out');
      await easeCamera({
        center: [currentCoords[0] + panOffset[0], currentCoords[1] + panOffset[1]],
        zoom: currentZoom,
        duration: panDuration,
        easing: (t) => t,
        profile: 'pan'
      });

      startCloudWind();
      sweepCloudsIn();
      triggerFlash();
      playShutterClackSound(false);

      const jaipurApproach = [destTarget[0] - panOffset[0], destTarget[1] - panOffset[1]];
      await animateArcTravel({
        start: currentCoords,
        end: jaipurApproach,
        startZoom: currentZoom,
        endZoom: destZoom,
        peakZoom: worldZoom,
        duration: Math.max(1400, step.travelMs || 1800),
        profile: 'global-travel'
      });
      if (step.colorGrade) applyGrade(step.colorGrade, destZoom);

      await sleep(step.flashPopMs || 120);
      await waitForMapIdle(900);
      await sleep(step.cloudHoldMs || 220);

      setMotionBlur(true, 'in');
      await easeCamera({
        center: destTarget,
        zoom: destZoom,
        duration: Math.max(500, panDuration + 250),
        easing: (t) => t,
        profile: 'pan'
      });
      setMotionBlur(false);

      sweepCloudsOut();
      stopCloudWind();
      await sleep(step.cloudSweepOutMs || 280);

      currentZoom = destZoom;
      currentCoords = destTarget;
      continue;
    }

    const targetCoords = resolveTargetCoords(step.target, step.coords);
    const zoomLevel = resolveZoom(step);
    const transitionMs = (typeof step.transitionMs === 'number') ? Math.max(140, step.transitionMs) : 180;
    const stageProfile = stageTimings[step.id] ? stageTimings[step.id].profile : (zoomLevel < currentZoom ? 'zoom-out-fast' : 'zoom-in-fast');
    const stageDuration = typeof step.motionMs === 'number'
      ? step.motionMs
      : (stageTimings[step.id] ? stageTimings[step.id].duration : transitionMs);

    if (step.use3D && threeSceneManager) {
      const locKey = (step.target === 'jaipur' || step.isLanding) ? 'jaipur' : 'visitor';
      if (!threeSceneManager.active) {
        if (i > 0 && step.flash) triggerFlash();
        if (step.shutterSound) playShutterClackSound(step.shutterFirst || false);
        threeSceneManager.show(locKey);
      }
    } else if (threeSceneManager && threeSceneManager.active) {
      if (step.flash) triggerFlash();
      if (step.shutterSound) playShutterClackSound(step.shutterFirst || false);
      threeSceneManager.hide();
    }

    const travelDuration = Math.max(stageDuration, transitionMs);

    if (i > 0 && (!threeSceneManager || !threeSceneManager.active)) {
      const isZoomOut = zoomLevel < currentZoom;
      const direction = isZoomOut ? 'out' : 'in';

      if (step.flash) triggerFlash();
      if (step.shutterSound) playShutterClackSound(step.shutterFirst || false);

      setMotionBlur(true, direction);
      if (Math.abs(zoomLevel - currentZoom) > 2.4 || Math.abs(targetCoords[0] - currentCoords[0]) > 15 || Math.abs(targetCoords[1] - currentCoords[1]) > 15) {
        await animateArcTravel({
          start: currentCoords,
          end: targetCoords,
          startZoom: currentZoom,
          endZoom: zoomLevel,
          duration: travelDuration,
          profile: stageProfile
        });
      } else {
        await easeCamera({
          center: targetCoords,
          zoom: zoomLevel,
          duration: travelDuration,
          easing: (t) => t,
          profile: stageProfile
        });
      }
      setMotionBlur(false);
    } else if (i > 0 && transitionMs === 0 && (!threeSceneManager || !threeSceneManager.active)) {
      if (step.flash) triggerFlash();
      if (step.shutterSound) playShutterClackSound(step.shutterFirst || false);
      jumpCamera(targetCoords, zoomLevel);
    }

    currentPhase = step.index || currentPhase;

    if (step.colorGrade) applyGrade(step.colorGrade, zoomLevel);
    if (step.crosshair) showCrosshair();
    if (step.breathing) addBreathing(); else removeBreathing();

    if (step.highlight && step.highlight.enabled) {
      const isVisitor = step.highlight.type === 'visitor_state';
      const hName = isVisitor ? (visitorState || step.highlight.defaultName || 'California') : (step.highlight.name || 'Jaipur');
      const hCountry = isVisitor ? (visitorCountry || step.highlight.defaultCountry || 'United States') : (step.highlight.country || 'India');
      renderHighlight(hName, hCountry, targetCoords, step.highlight.radiusKm || 150);
    } else {
      removeStateHighlight();
    }

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
        const threeEl = $('three-canvas');
        if (threeEl) {
          threeEl.classList.remove('camera-recoil-landing');
          void threeEl.offsetWidth;
          threeEl.classList.add('camera-recoil-landing');
          setTimeout(() => threeEl && threeEl.classList.remove('camera-recoil-landing'), 370);
        }
      }
      if (step.crosshairLock) lockCrosshair();
      if (step.marker) addJaipurMarker();
    }

    if (!threeSceneManager || !threeSceneManager.active) {
      await waitForMapIdle(8000);
      if (currentPhase === PHASE.SKIP) return;
    }

    const holdMs = (typeof step.holdMs === 'number') ? step.holdMs : 3000;
    console.log(`[View ${step.index || (i + 1)}] "${step.name || step.id}": zoom=${zoomLevel}, travel=${travelDuration || transitionMs}ms, hold=${holdMs}ms, target=`, targetCoords);

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

  currentPhase = PHASE.SETTLE;
  hideCrosshair();
  await sleep(timelineConfig.settleMs || 600);
  if (currentPhase === PHASE.SKIP) return;

  await runDock();
}

async function runDock() {
  if (currentPhase === PHASE.SKIP) return;
  currentPhase = PHASE.DOCK;
  applyGrade('LANDING');

  playMechanicalDockSound();

  const panel = $('form-panel');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    panel.classList.add('docked');
    $('cinematic').classList.add('docked');
  });

  const dockMs = (timelineConfig && timelineConfig.dockTransitionMs) || 2200;

  await sleep(Math.floor(dockMs / 2));
  const card = $('pin-card');
  if (card) {
    card.classList.remove('pin-hidden');
    void card.offsetWidth;
    card.classList.add('pin-visible');
  }

  setTimeout(() => {
    if (map) {
      try { map.resize(); } catch (e) { }
    }
    if (threeSceneManager) {
      threeSceneManager.resize();
    }
  }, dockMs + 50);
}

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

  const landingView = timelineConfig && timelineConfig.views && timelineConfig.views.find(v => v.isLanding);
  if (landingView && landingView.use3D && threeSceneManager) {
    threeSceneManager.show('jaipur');
  } else if (threeSceneManager) {
    threeSceneManager.hide();
  }

  showFinalState();
}

function showFinalState({ offline = false } = {}) {
  if (finalStateShown) return;
  finalStateShown = true;
  currentPhase = PHASE.SKIP;

  if (window.EngineSatellite) {
    window.EngineSatellite.skip();
  }

  removeStateHighlight();
  removeBreathing();

  const app = $('app');
  app.classList.add('no-anim');

  applyGrade('LANDING');
  hideCrosshair();
  hideClouds();
  setMotionBlur(false);

  const offlineLanding = $('offline-landing');
  if (offline) {
    if (threeSceneManager) threeSceneManager.hide();
    const mapEl = $('map');
    if (mapEl) mapEl.style.display = 'none';
    if (offlineLanding) offlineLanding.classList.add('active');
  } else {
    if (offlineLanding) offlineLanding.classList.remove('active');
    if (threeSceneManager) threeSceneManager.hide();
  }

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
    if (threeSceneManager) threeSceneManager.resize();
    if (map) try { map.resize(); } catch (e) { }
  }));
}


function initBudgetPills() {
  const pills = document.querySelectorAll('.budget-pills .pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      const wasSelected = pill.classList.contains('selected');
      pills.forEach(p => p.classList.remove('selected'));
      if (!wasSelected) {
        pill.classList.add('selected');
        selectedBudget = pill.dataset.value;
      } else {
        selectedBudget = null;
      }
    });
  });
}

function initContactForm() {
  const form = $('contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = $('f-name')?.value?.trim();
    const email = $('f-email')?.value?.trim();
    const project = $('f-project')?.value?.trim();

    if (!name || !email || !project) {
      form.classList.add('shake');
      setTimeout(() => form.classList.remove('shake'), 500);
      return;
    }

    const sendBtn = $('send-btn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span>SENT</span>';
      sendBtn.classList.add('sent');
    }
  });
}

async function main() {
  const forceSkip = location.search.includes('skip') || location.search.includes('static');
  const captureStage = getQueryParam('captureStage');

  initAudioUnlock();
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
    }
  } catch (e) { }

  initBudgetPills();
  initContactForm();

  $('form-panel').inert = true;

  const skipBtnEl = $('skip-btn');
  if (skipBtnEl) skipBtnEl.addEventListener('click', skipIntro);

  isMobile = window.matchMedia('(max-width: 768px)').matches;

  $('form-panel').classList.remove('docked');
  $('cinematic').classList.remove('docked');
  const pinCard = $('pin-card');
  if (pinCard) {
    pinCard.classList.remove('pin-visible');
    pinCard.classList.add('pin-hidden');
  }

  visitorCoords = [-118.2437, 34.0522];
  visitorState = 'California';
  visitorCountry = 'United States';
  visitorCity = 'Los Santos';

  await loadTimelineConfig();

  const forceLive = hasQueryFlag('live') || hasQueryFlag('noVideoIntro=1');
  const forceVideo = hasQueryFlag('videoIntro=1') || hasQueryFlag('video=1');

  if (!forceLive && !forceVideo && window.EngineSatellite) {
    await window.EngineSatellite.preload();
    await window.EngineSatellite.run();
    return;
  }

  const captureStageParam = getQueryParam('captureStage');
  const videoIntroSource = forceSkip ? null : await pickIntroVideoSource();

  threeSceneManager = new ThreeSceneManager();
  const threeReady = threeSceneManager.init();

  if (!videoIntroSource || captureStageParam) {
    prefetchBuildingData(visitorCoords, 'visitor');
    prefetchBuildingData(JAIPUR, 'jaipur');
  }

  if (forceSkip) {
    const landingZoom = (timelineConfig && timelineConfig.views && timelineConfig.views.find(v => v.isLanding)?.zoom) || 15.0;
    await initMap(JAIPUR, landingZoom, 0, 0);
    showFinalState();
    return;
  }

  if (captureStageParam) {
    const ok = await renderCaptureStage(captureStageParam, threeReady);
    if (!ok) {
      console.error(`[Capture] unknown or unsupported stage: ${captureStageParam}`);
      window.__CAPTURE_STAGE_READY = { id: captureStageParam, error: 'unknown-stage' };
    }
    return;
  }

  if (forceVideo && videoIntroSource) {
    const played = await playVideoIntroAndWait(videoIntroSource);
    if (played) {
      showFinalState({ offline: true });
      hideVideoIntroLayer();
      return;
    }
    if (map) {
      try { map.remove(); } catch (e) { }
      map = null;
    }
    hideVideoIntroLayer();
  }

  prefetchBuildingData(visitorCoords, 'visitor');
  prefetchBuildingData(JAIPUR, 'jaipur');

  const v1 = (timelineConfig && timelineConfig.views && timelineConfig.views[0]) || { zoom: 15.0, colorGrade: 'GROUND', use3D: true };
  const v1Coords = resolveTargetCoords(v1.target, v1.coords);
  const v1Zoom = resolveZoom(v1);

  if (v1.use3D && threeReady) {
    threeSceneManager.show('visitor');
    applyGrade(v1.colorGrade || 'GROUND', v1Zoom);

    map = await initMap(v1Coords, v1Zoom, 0, 0);
    await preloadWorldAndRegionTiles();
  } else {
    await initMap(v1Coords, v1Zoom, 0, 0);
    await preloadWorldAndRegionTiles();
    applyGrade(v1.colorGrade || 'GROUND', v1Zoom);
  }

  await runGTASequence();
}

document.addEventListener('DOMContentLoaded', main);
