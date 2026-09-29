'use strict';

(function (W) {

  const STAGES = [
    {
      n: 1,
      bin: 'assets/data/feed-01.bin',
      fallbackWebp: 'generated/phase-shots/stage-01-view_1_street.webp',
      fallbackPng: 'generated/phase-shots/stage-01-view_1_street.png',
      filter: 'contrast(1.06) saturate(0.95) brightness(1.03) hue-rotate(8deg)',
      wash: 'rgba(140,210,180,0.16)',
      holdMs: 2600,
      bitmap: null
    },
    {
      n: 2,
      bin: 'assets/data/feed-02.bin',
      fallbackWebp: 'generated/phase-shots/stage-02-view_2_out1.webp',
      fallbackPng: 'generated/phase-shots/stage-02-view_2_out1.png',
      filter: 'contrast(1.10) saturate(0.85) brightness(1.00) hue-rotate(12deg)',
      wash: 'rgba(120,190,165,0.20)',
      holdMs: 700,
      bitmap: null
    },
    {
      n: 3,
      bin: 'assets/data/feed-03.bin',
      fallbackWebp: 'generated/phase-shots/stage-03-view_3_out2.webp',
      fallbackPng: 'generated/phase-shots/stage-03-view_3_out2.png',
      filter: 'contrast(1.16) saturate(0.65) brightness(0.94) hue-rotate(18deg)',
      wash: 'rgba(90,150,150,0.24)',
      holdMs: 1800,
      bitmap: null
    },
    {
      n: 4,
      bin: 'assets/data/feed-04.bin',
      fallbackWebp: 'generated/phase-shots/stage-04-view_5_in1.webp',
      fallbackPng: 'generated/phase-shots/stage-04-view_5_in1.png',
      filter: 'contrast(1.14) saturate(0.78) brightness(1.00) hue-rotate(-8deg)',
      wash: 'rgba(220,150,90,0.22)',
      holdMs: 1800,
      bitmap: null
    },
    {
      n: 5,
      bin: 'assets/data/feed-05.bin',
      fallbackWebp: 'generated/phase-shots/stage-05-view_6_in2.webp',
      fallbackPng: 'generated/phase-shots/stage-05-view_6_in2.png',
      filter: 'contrast(1.10) saturate(0.92) brightness(1.02) hue-rotate(-4deg)',
      wash: 'rgba(225,165,100,0.16)',
      holdMs: 700,
      bitmap: null
    },
    {
      n: 6,
      bin: 'assets/data/feed-06.bin',
      fallbackWebp: 'generated/phase-shots/stage-06-view_7_final.webp',
      fallbackPng: 'generated/phase-shots/stage-06-view_7_final.png',
      filter: 'contrast(1.06) saturate(1.05) brightness(1.04) hue-rotate(-2deg)',
      wash: 'rgba(230,180,110,0.10)',
      holdMs: 1500,
      bitmap: null
    }
  ];

  let _running     = false;
  let _canceled    = false;
  let _timers      = [];
  let _anims       = [];
  let _canvas      = null;
  let _ctx         = null;
  let _isHovering  = false;

  function qs(id) { return document.getElementById(id); }

  function sleep(ms) {
    return new Promise(resolve => {
      const t = setTimeout(() => {
        _timers = _timers.filter(x => x !== t);
        resolve();
      }, ms);
      _timers.push(t);
    });
  }

  function cancelAll() {
    _canceled = true;
    _timers.forEach(t => clearTimeout(t));
    _timers = [];
    _anims.forEach(a => { try { a.cancel(); } catch (_) {} });
    _anims = [];
  }

  function track(anim) {
    if (anim) _anims.push(anim);
    return anim;
  }

  function getCanvas() {
    if (!_canvas) {
      _canvas = qs('surveillance-engine') || qs('surveillance-canvas');
      if (_canvas) {
        _ctx = _canvas.getContext('2d', { alpha: false, desynchronized: true });
        _canvas.oncontextmenu = (e) => e.preventDefault();
      }
    }
    return _canvas;
  }

  function drawStage(stage) {
    getCanvas();
    if (!_ctx || !stage || !stage.bitmap) return;
    _ctx.drawImage(stage.bitmap, 0, 0, 1920, 1080);
    if (_canvas) {
      _canvas.style.filter = stage.filter || 'none';
    }
  }

  function flash() {
    const f = qs('gta-flash');
    if (!f) return;
    _anims = _anims.filter(a => {
      if (a._isFlash) { try { a.cancel(); } catch (_) {} return false; }
      return true;
    });
    const a = f.animate([
      { opacity: 0,    offset: 0 },
      { opacity: 0.92, offset: 0.14 },
      { opacity: 0,    offset: 1 }
    ], { duration: 120, easing: 'linear', fill: 'none' });
    a._isFlash = true;
    _anims.push(a);
  }

  function thump() {
    if (typeof W.playGtaThumpSound === 'function') {
      try { W.playGtaThumpSound(); } catch (_) {}
    }
  }

  function setWash(rgba, ms = 300) {
    const w = qs('gta-wash');
    if (!w) return;
    w.style.transition = `background-color ${ms}ms ease`;
    w.style.backgroundColor = rgba;
  }

  async function crashZoomCut(from, to) {
    flash();
    thump();
    setWash(to.wash, 250);

    await sleep(17);
    if (_canceled) return;

    drawStage(to);

    await sleep(110);
    if (_canceled) return;
  }

  let _cloudCanvas = null;

  function buildCloudCanvas() {
    if (_cloudCanvas) return _cloudCanvas;

    const W = window.innerWidth  || 1920;
    const H = window.innerHeight || 1080;
    const CW = W * 3;
    const CH = H;

    const c = document.createElement('canvas');
    c.width  = CW;
    c.height = CH;
    const ctx = c.getContext('2d');

    const baseGrad = ctx.createLinearGradient(0, 0, CW, 0);
    baseGrad.addColorStop(0,    'rgba(255,255,255,0)');
    baseGrad.addColorStop(0.12, 'rgba(255,255,255,0.97)');
    baseGrad.addColorStop(0.88, 'rgba(255,255,255,0.97)');
    baseGrad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, CW, CH);

    const rng = seededRng(42);
    for (let i = 0; i < 140; i++) {
      const cx   = rng() * CW;
      const cy   = rng() * CH;
      const rx   = 60 + rng() * 320;
      const ry   = 30 + rng() * 180;
      const dark = 0.04 + rng() * 0.11;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      g.addColorStop(0,   `rgba(180,190,205,${dark})`);
      g.addColorStop(0.5, `rgba(210,220,230,${dark * 0.5})`);
      g.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < 60; i++) {
      const cx = rng() * CW;
      const cy = rng() * CH;
      const r  = 20 + rng() * 100;
      const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(255,255,255,${0.3 + rng() * 0.3})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    _cloudCanvas = c;
    return c;
  }

  function seededRng(seed) {
    let s = seed;
    return function () {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  function mountCloudSweep() {
    let el = document.getElementById('gta-cloud-sweep');
    if (el) return el;

    const canvas = buildCloudCanvas();
    el = document.createElement('div');
    el.id = 'gta-cloud-sweep';

    const W = window.innerWidth  || 1920;
    const H = window.innerHeight || 1080;
    const CW = W * 3;

    Object.assign(el.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      width:         `${CW}px`,
      height:        `${H}px`,
      zIndex:        '480',
      pointerEvents: 'none',
      willChange:    'transform',
      transform:     `translateX(${-CW}px)`
    });

    canvas.style.width  = '100%';
    canvas.style.height = '100%';
    el.appendChild(canvas);

    const cinematic = document.getElementById('cinematic');
    if (cinematic) cinematic.appendChild(el);
    return el;
  }

  async function cloudTransition(from, to) {
    const W  = window.innerWidth || 1920;
    const CW = W * 3;

    const sweep = mountCloudSweep();
    sweep.style.transition = 'none';
    sweep.style.transform  = `translateX(${-CW}px)`;
    void sweep.offsetWidth;

    const coverX = -(CW / 2 - W / 2);
    const SWEEP_IN_MS  = 420;
    const HOLD_MS      = 80;
    const SWEEP_OUT_MS = 380;

    const sweepIn = track(sweep.animate([
      { transform: `translateX(${-CW}px)` },
      { transform: `translateX(${coverX}px)` }
    ], {
      duration: SWEEP_IN_MS,
      easing:   'cubic-bezier(0.55, 0, 0.75, 0.05)',
      fill:     'forwards'
    }));

    await sweepIn.finished;
    if (_canceled) return;

    await sleep(HOLD_MS);
    if (_canceled) return;

    flash();
    setWash(to.wash, 600);
    drawStage(to);

    await sleep(17);
    if (_canceled) return;

    const exitX = W;
    const sweepOut = track(sweep.animate([
      { transform: `translateX(${coverX}px)` },
      { transform: `translateX(${exitX}px)` }
    ], {
      duration: SWEEP_OUT_MS,
      easing:   'cubic-bezier(0.25, 0.95, 0.45, 1)',
      fill:     'forwards'
    }));

    await sweepOut.finished;
    if (_canceled) return;

    sweep.style.transform = `translateX(${-CW}px)`;
  }

  async function loadTexture(stage) {

    const candidates = [stage.bin, stage.fallbackWebp, stage.fallbackPng].filter(Boolean);
    for (const url of candidates) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const rawBlob = await resp.blob();
        const imageBlob = rawBlob.type.startsWith('image/')
          ? rawBlob
          : rawBlob.slice(0, rawBlob.size, 'image/webp');
        stage.bitmap = await createImageBitmap(imageBlob);
        return stage.bitmap;
      } catch (_) {

      }
    }

    return new Promise(resolve => {
      const img = new Image();
      img.onload = async () => {
        try {
          stage.bitmap = await createImageBitmap(img);
        } catch (_) {
          stage.bitmap = img;
        }
        resolve(stage.bitmap);
      };
      img.onerror = () => {
        console.warn('[GTA] Binary data stream failed for stage', stage.n);
        resolve(null);
      };
      img.src = stage.fallbackWebp || stage.fallbackPng || stage.bin;
    });
  }

  async function preload() {
    getCanvas();
    const start = performance.now();
    await loadTexture(STAGES[0]);

    const stageView = qs('satellite-stage-view');
    if (stageView) stageView.style.display = 'block';
    ['map', 'three-canvas', 'offline-landing', 'video-intro-layer'].forEach(id => {
      const e = qs(id);
      if (e) e.style.display = 'none';
    });
    drawStage(STAGES[0]);
    setWash(STAGES[0].wash, 0);
    triggerDroneHover();

    await Promise.all(STAGES.slice(1).map(stage => loadTexture(stage)));
    const elapsed = Math.round(performance.now() - start);
    console.log(`[GTA] All 6 binary feed streams decoded into GPU memory in ${elapsed}ms`);
  }

  function triggerDroneHover() {
    const canvas = getCanvas();
    if (!canvas) return;
    _isHovering = true;
    canvas.classList.add('drone-hover');
    console.log('[GTA] Continuous cinematic drone hover / orbital drift active');
  }

  function stopDroneHover() {
    const canvas = getCanvas();
    if (!canvas) return;
    _isHovering = false;
    canvas.classList.remove('drone-hover');
  }

  function dockNow() {
    const cinematic = qs('cinematic');
    const formPanel = qs('form-panel');
    const pinCard   = qs('pin-card');

    if (pinCard) {
      pinCard.classList.remove('pin-hidden');
      pinCard.classList.add('pin-visible');
      pinCard.setAttribute('aria-hidden', 'false');
    }
    if (cinematic) cinematic.classList.add('docked');
    if (formPanel) {
      formPanel.classList.add('docked');
      formPanel.setAttribute('aria-hidden', 'false');
      formPanel.inert = false;
    }

    triggerDroneHover();
  }

  async function run() {
    if (_running) return;
    _running  = true;
    _canceled = false;

    const stageView = qs('satellite-stage-view');
    if (stageView) stageView.style.display = 'block';

    ['map', 'three-canvas', 'offline-landing', 'video-intro-layer'].forEach(id => {
      const e = qs(id);
      if (e) e.style.display = 'none';
    });

    const s = STAGES;

    drawStage(s[0]);
    setWash(s[0].wash, 0);
    triggerDroneHover();
    await sleep(s[0].holdMs);
    if (_canceled) return;

    stopDroneHover();
    await crashZoomCut(s[0], s[1]);
    if (_canceled) return;

    await sleep(s[1].holdMs);
    if (_canceled) return;

    await crashZoomCut(s[1], s[2]);
    if (_canceled) return;

    await sleep(s[2].holdMs);
    if (_canceled) return;

    await cloudTransition(s[2], s[3]);
    if (_canceled) return;

    await sleep(s[3].holdMs);
    if (_canceled) return;

    await crashZoomCut(s[3], s[4]);
    if (_canceled) return;

    await sleep(s[4].holdMs);
    if (_canceled) return;

    await crashZoomCut(s[4], s[5]);
    if (_canceled) return;

    triggerDroneHover();

    await sleep(s[5].holdMs);
    if (_canceled) return;

    dockNow();
    _running = false;
    console.log('[GTA] Sequence complete');
  }

  function skip() {
    cancelAll();
    _running = false;

    const stageView = qs('satellite-stage-view');
    if (stageView) stageView.style.display = 'block';

    const last = STAGES[STAGES.length - 1];
    drawStage(last);
    setWash(last.wash, 0);

    const sweep = qs('gta-cloud-sweep');
    if (sweep) {
      sweep.style.transform = `translateX(-9999px)`;
    }

    dockNow();
  }

  W.EngineSatellite = {
    preload,
    run,
    skip,
    triggerDroneHover,
    stopDroneHover
  };

})(window);
