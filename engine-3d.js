'use strict';

(function (window) {
  const PALETTE = {

    oceanDeep: 0x00788c,
    oceanTurquoise: 0x09a5b5,
    oceanShallow: 0x2ec6cb,
    oceanFoam: 0xffffff,
    beachSand: 0xe5cca0,
    coastalCliff: 0xb08856,
    coastalCliffDk: 0x8a663b,
    coastalScrub: 0x526b38,
    pchAsphalt: 0x2d3034,
    poolTurquoise: 0x1ec2d6,
    poolCoping: 0xf2efe9,
    roofRedTile: 0xb84a2d,
    roofSlateDark: 0x3e444c,
    roofModernSand: 0xeae5da,
    coastalLawn: 0x44782c,
    palmTrunk: 0x5c483b,
    palmFrond: 0x3a6030,
    eucalyptusGreen: 0x385e30,

    jaipurTerracotta: 0xC47A64,
    jaipurTerracottaDk: 0xA75C48,
    jaipurSandstone: 0xEAD5B8,
    jaipurSandstoneDk: 0xD4BA96,
    jaipurIvory: 0xF6EFEA,
    jaipurCream: 0xEDE5D8,
    jaipurMarble: 0xFFFDF9,
    jaipurMarigold: 0xDFA94D,
    jaipurBrick: 0x9E4C38,
    teakWood: 0x5D3A1E,
    wroughtIron: 0x242729,
    solarBlue: 0x1c3a5c,
    sintexBlack: 0x141414,
    sintexWhite: 0xe0e0e0,
    courtyardStone: 0xd8caa8,
    walledCityRoof: 0x988a78,

    walledCityTan: 0xCBB894,
    walledCityBeige: 0xDCCFAF,
    walledCityDark: 0x8F7F68,
    roadAsphalt: 0x2c2d30,

    parterreGrass: 0x386826,
    parterreGrassLit: 0x4c8236,
    palacePath: 0xd0be9a,
    banyanCanopy: 0x325c22,
    neemCanopy: 0x40742c,
    neemCanopyLight: 0x558d3c,
    treeWood: 0x463528,

    mountainRock: 0x756350,
    mountainRockDark: 0x58483a,
    mountainFort: 0xb29778,

    fogColor: 0x141a20,
    sunWarmth: 0xffecc8,
    californiaSun: 0xfffaee,
    hemiSky: 0xd2e0ed,
    hemiGround: 0x3a342c,
    markingYellow: 0xe8a928,
    markingWhite: 0xefede8
  };

  class OverhauledThreeSceneManager {
    constructor() {
      this.canvas = null;
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.sunLight = null;
      this.hemiLight = null;
      this.groundMesh = null;
      this.buildingGroup = null;
      this.instancedGroup = null;
      this.active = false;
      this.animId = null;
      this.startTime = 0;
      this.currentCity = null;

      this.waveMeshes = [];

      this.oceanDetailMesh = null;

      this.textures = {};
      this.materials = {};

      this.osmFootprints = { jaipur: null, visitor: null };
      this.osmFetchStatus = { jaipur: 'idle', visitor: 'idle' };
    }

    init() {
      if (typeof THREE === 'undefined') {
        console.warn('[Engine3D] Three.js not loaded');
        return false;
      }

      this.canvas = document.getElementById('three-canvas');
      if (!this.canvas) return false;

      const width = this.canvas.clientWidth || window.innerWidth;
      const height = this.canvas.clientHeight || window.innerHeight;

      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.18;
      } catch (e) {
        console.warn('[Engine3D] WebGL initialization failed:', e);
        return false;
      }

      this.scene = new THREE.Scene();
      this.scene.background = null;
      this.scene.fog = null;

      this.camera = new THREE.PerspectiveCamera(40, width / height, 1, 4000);
      this.camera.position.set(-15, 175, 195);
      this.camera.lookAt(12, 14, -20);

      this.createTextures();
      this.createMaterials();

      this.sunLight = new THREE.DirectionalLight(PALETTE.sunWarmth, 2.4);
      this.sunLight.position.set(-260, 200, 140);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 1200;
      this.sunLight.shadow.camera.left = -380;
      this.sunLight.shadow.camera.right = 380;
      this.sunLight.shadow.camera.top = 380;
      this.sunLight.shadow.camera.bottom = -380;
      this.sunLight.shadow.bias = -0.0004;
      this.sunLight.shadow.normalBias = 0.02;
      this.scene.add(this.sunLight);

      this.hemiLight = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.75);
      this.scene.add(this.hemiLight);

      this.createGround('visitor');

      this.buildingGroup = new THREE.Group();
      this.scene.add(this.buildingGroup);

      this.instancedGroup = new THREE.Group();
      this.scene.add(this.instancedGroup);

      window.addEventListener('resize', () => this.resize());
      console.log('[Engine3D] 1:1 High-Fidelity 3D Engine ready (rev 2 — aerial mosaic textures)');
      return true;
    }

    prefetchFootprints(cityKey, centerCoords, radiusMeters = 260, timeoutMs = 8000) {
      if (!cityKey || !Array.isArray(centerCoords) || centerCoords.length < 2) return;

      const cacheKey = `osmfp:${cityKey}:${centerCoords[0].toFixed(3)},${centerCoords[1].toFixed(3)}:v2`;
      try {
        if (typeof sessionStorage !== 'undefined') {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length >= 5) {
              this.osmFootprints[cityKey] = parsed;
              this.osmFetchStatus[cityKey] = 'ready';
              console.log(`[Engine3D] Loaded ${parsed.length} cached OSM footprints for ${cityKey} (sessionStorage)`);
              if (this.active && this.currentCity === cityKey) {
                this.buildCity(cityKey);
              }
              return Promise.resolve();
            }
          }
        }
      } catch (e) {

      }

      this.osmFetchStatus[cityKey] = 'loading';

      return (async () => {
        const [lng, lat] = centerCoords;
        const query = `[out:json][timeout:10];(way["building"](around:${radiusMeters},${lat.toFixed(5)},${lng.toFixed(5)}););out body;>;out skel qt;`;

        const fetchWithTimeout = async (url, budget) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), budget);
          try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            return res;
          } catch (err) {
            clearTimeout(timer);
            throw err;
          }
        };

        let json = null;
        const url1 = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        try {
          const res = await fetchWithTimeout(url1, timeoutMs);
          if (res.ok) json = await res.json();
        } catch (e1) {

          const url2 = `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`;
          try {
            const res = await fetchWithTimeout(url2, timeoutMs);
            if (res.ok) json = await res.json();
          } catch (e2) {

          }
        }

        try {
          if (!json) {
            this.osmFetchStatus[cityKey] = 'failed';
            console.log(`[Engine3D] Overpass fetch failed/timed out for ${cityKey}, using procedural fallback`);
            return;
          }

          const footprints = this.parseOverpassFootprints(json, centerCoords);
          if (!footprints || footprints.length < 5) {
            this.osmFetchStatus[cityKey] = 'failed';
            console.log(`[Engine3D] Overpass returned sparse data (${footprints ? footprints.length : 0} < 5) for ${cityKey}, using procedural fallback`);
            return;
          }

          this.osmFootprints[cityKey] = footprints;
          this.osmFetchStatus[cityKey] = 'ready';
          console.log(`[Engine3D] Loaded ${footprints.length} live OSM footprints for ${cityKey}`);

          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem(cacheKey, JSON.stringify(footprints));
            }
          } catch (e) {

          }

          if (this.active && this.currentCity === cityKey) {
            console.log(`[Engine3D] Live-updating active ${cityKey} scene with real OSM geometry...`);
            this.buildCity(cityKey);
          }
        } catch (err) {
          console.warn(`[Engine3D] Error parsing OSM footprints for ${cityKey}:`, err);
          this.osmFetchStatus[cityKey] = 'failed';
        }
      })();
    }

    parseOverpassFootprints(data, centerCoords) {
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
              height: this.parseBuildingHeight(el.tags),
              buildingType: (el.tags.building || 'yes').toLowerCase()
            });
          }
        }
      }
      return footprints;
    }

    parseBuildingHeight(tags = {}) {
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

    extrudeFootprints(footprints, options = {}) {
      const group = new THREE.Group();
      if (!Array.isArray(footprints) || footprints.length === 0) return group;

      const paletteMode = options.paletteMode || 'jaipur';
      const maxCount = typeof options.maxCount === 'number' ? options.maxCount : 900;
      const originOffset = options.originOffset || [0, 0];

      const withDistance = [];
      for (let i = 0; i < footprints.length; i++) {
        const fp = footprints[i];
        const pts = fp.points;
        if (!pts || pts.length < 3) continue;
        let cx = 0, cz = 0;
        for (let j = 0; j < pts.length; j++) {
          cx += pts[j][0];
          cz += pts[j][1];
        }
        cx /= pts.length;
        cz /= pts.length;
        const distSq = cx * cx + cz * cz;
        withDistance.push({ fp, cx, cz, distSq });
      }

      withDistance.sort((a, b) => a.distSq - b.distSq);

      if (withDistance.length > maxCount) {
        console.warn(`[Engine3D] Dropped ${withDistance.length - maxCount} OSM footprints exceeding maxCount=${maxCount}`);
      }
      const selected = withDistance.slice(0, maxCount);

      const jaipurPalette = [
        this.materials.walledTan,
        this.materials.walledBeige,
        this.materials.walledTan,
        this.materials.walledDark,
        this.materials.cream
      ];

      const californiaPalette = [
        this.materials.roofModernSand,
        this.materials.roofRedTile,
        this.materials.roofSlateDark
      ];

      for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        const fp = item.fp;
        const pts = fp.points;

        if (paletteMode === 'california' && (item.cx + originOffset[0]) > -8) {
          continue;
        }

        try {
          const shape = new THREE.Shape();
          const p0 = pts[0];
          shape.moveTo(p0[0] + originOffset[0], -(p0[1] + originOffset[1]));
          for (let j = 1; j < pts.length; j++) {
            const pj = pts[j];
            shape.lineTo(pj[0] + originOffset[0], -(pj[1] + originOffset[1]));
          }
          shape.closePath();

          const depth = Math.max(3.5, Math.min(100, fp.height || 12));
          const geo = new THREE.ExtrudeGeometry(shape, {
            depth: depth,
            bevelEnabled: false
          });

          let mat;
          if (paletteMode === 'jaipur') {
            if (Math.random() < 0.08) {
              mat = this.materials.jaipurSolid;
            } else {
              mat = jaipurPalette[i % jaipurPalette.length];
            }
          } else {
            mat = californiaPalette[i % californiaPalette.length];
          }

          const mesh = new THREE.Mesh(geo, mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          group.add(mesh);
        } catch (e) {

        }
      }

      return group;
    }

    createTextures() {

      const glassC = document.createElement('canvas');
      glassC.width = 512; glassC.height = 512;
      const gctx = glassC.getContext('2d');
      gctx.fillStyle = '#1b2a38'; gctx.fillRect(0, 0, 512, 512);
      gctx.strokeStyle = '#3e5062'; gctx.lineWidth = 2;
      for (let r = 0; r < 32; r++) {
        gctx.fillStyle = '#263646'; gctx.fillRect(0, r * 16, 512, 3);
        for (let c = 0; c < 16; c++) {
          gctx.fillStyle = (Math.sin(r * 2.3 + c * 1.7) > 0.3) ? '#283c4e' : '#1e2d3b';
          gctx.fillRect(c * 32 + 2, r * 16 + 3, 28, 12);
        }
      }
      this.textures.glass = new THREE.CanvasTexture(glassC);
      this.textures.glass.wrapS = THREE.RepeatWrapping;
      this.textures.glass.wrapT = THREE.RepeatWrapping;

      const jprC = document.createElement('canvas');
      jprC.width = 512; jprC.height = 512;
      const jctx = jprC.getContext('2d');
      jctx.fillStyle = '#C47A64'; jctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 12000; i++) {
        const x = Math.random() * 512; const y = Math.random() * 512;
        jctx.fillStyle = (Math.random() > 0.5) ? 'rgba(167, 92, 72, 0.3)' : 'rgba(216, 140, 118, 0.3)';
        jctx.fillRect(x, y, 2, 2);
      }
      jctx.strokeStyle = '#F6EFEA'; jctx.lineWidth = 3;
      for (let y = 0; y < 512; y += 64) {
        jctx.beginPath(); jctx.moveTo(0, y); jctx.lineTo(512, y); jctx.stroke();
        jctx.lineWidth = 1.5;
        for (let x = 0; x < 512; x += 16) {
          jctx.beginPath(); jctx.arc(x + 8, y + 5, 5, Math.PI, 0, false); jctx.stroke();
        }
        jctx.lineWidth = 3;
      }
      this.textures.jaipurTracery = new THREE.CanvasTexture(jprC);
      this.textures.jaipurTracery.wrapS = THREE.RepeatWrapping;
      this.textures.jaipurTracery.wrapT = THREE.RepeatWrapping;

      this.textures.californiaAerial = this.generateCaliforniaAerialTexture();
      this.textures.californiaAerial.wrapS = THREE.RepeatWrapping;
      this.textures.californiaAerial.wrapT = THREE.RepeatWrapping;

      this.textures.californiaOcean = this.generateCaliforniaOceanTexture();
      this.textures.californiaOcean.wrapS = THREE.RepeatWrapping;
      this.textures.californiaOcean.wrapT = THREE.RepeatWrapping;

      this.textures.jaipurAerial = this.generateJaipurAerialTexture();
      this.textures.jaipurAerial.wrapS = THREE.RepeatWrapping;
      this.textures.jaipurAerial.wrapT = THREE.RepeatWrapping;
    }

    generateCaliforniaAerialTexture() {
      const size = 1024;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');

      const baseGrad = ctx.createLinearGradient(0, 0, size, size);
      baseGrad.addColorStop(0, '#5c6a3f');
      baseGrad.addColorStop(0.5, '#6d7a48');
      baseGrad.addColorStop(1, '#5a6a3d');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, size, size);

      const grain = ctx.getImageData(0, 0, size, size);
      for (let i = 0; i < grain.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 14;
        grain.data[i] += n; grain.data[i + 1] += n; grain.data[i + 2] += n;
      }
      ctx.putImageData(grain, 0, 0);

      ctx.fillStyle = '#33363a';
      const streetW = size * 0.028;
      for (let sx = size * 0.12; sx < size; sx += size * 0.22) {
        ctx.fillRect(sx, 0, streetW, size);
      }
      for (let sz = size * 0.08; sz < size; sz += size * 0.19) {
        ctx.fillRect(0, sz, size, streetW * 0.8);
      }

      const roofPalette = ['#b3a48c', '#c9b79a', '#8f8a72', '#a8471f', '#37424c', '#d8d2c4', '#6d5a45'];
      for (let i = 0; i < 220; i++) {
        const rw = 14 + Math.random() * 34;
        const rh = 11 + Math.random() * 26;
        const rx = Math.random() * size;
        const ry = Math.random() * size;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate((Math.random() - 0.5) * 0.5);
        ctx.fillStyle = roofPalette[Math.floor(Math.random() * roofPalette.length)];
        ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-rw / 2, 0); ctx.lineTo(rw / 2, 0); ctx.stroke();
        ctx.restore();

        if (Math.random() < 0.2) {
          ctx.save();
          ctx.fillStyle = '#26c4d6';
          ctx.fillRect(rx + rw * 0.6, ry + rh * 0.3, 10, 18);
          ctx.restore();
        }
      }

      ctx.fillStyle = 'rgba(45, 66, 30, 0.85)';
      for (let i = 0; i < 140; i++) {
        const tx = Math.random() * size;
        const ty = Math.random() * size;
        const r = 5 + Math.random() * 10;
        ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
      }

      return new THREE.CanvasTexture(c);
    }

    generateCaliforniaOceanTexture() {
      const size = 1024;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, size, 0);
      grad.addColorStop(0, '#0c4f5c');
      grad.addColorStop(0.35, '#00788c');
      grad.addColorStop(0.62, '#09a5b5');
      grad.addColorStop(0.84, '#3fd2d0');
      grad.addColorStop(1, '#bdeee3');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      ctx.save();
      ctx.translate(size * 0.7, size * 0.5);
      ctx.rotate(-0.35);
      ctx.translate(-size * 0.7, -size * 0.5);
      for (let i = 0; i < 9; i++) {
        const bx = size * 0.5 + i * (size * 0.09);
        const grad2 = ctx.createLinearGradient(bx - 22, 0, bx + 22, 0);
        grad2.addColorStop(0, 'rgba(255,255,255,0)');
        grad2.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        grad2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad2;
        ctx.fillRect(bx - 22, -size, 44, size * 3);
      }
      ctx.restore();

      for (let i = 0; i < 2600; i++) {
        const fx = size * (0.5 + Math.random() * 0.4);
        const fy = Math.random() * size;
        ctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.5).toFixed(2)})`;
        ctx.fillRect(fx, fy, 2, 2);
      }

      return new THREE.CanvasTexture(c);
    }

    generateJaipurAerialTexture() {
      const size = 1024;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');

      const baseGrad = ctx.createLinearGradient(0, 0, size, size);
      baseGrad.addColorStop(0, '#c7b78f');
      baseGrad.addColorStop(0.5, '#d3c49c');
      baseGrad.addColorStop(1, '#bfae86');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, size, size);

      const grain = ctx.getImageData(0, 0, size, size);
      for (let i = 0; i < grain.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 12;
        grain.data[i] += n; grain.data[i + 1] += n; grain.data[i + 2] += n;
      }
      ctx.putImageData(grain, 0, 0);

      ctx.strokeStyle = 'rgba(50,42,30,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 90; i++) {
        ctx.beginPath();
        let x = Math.random() * size, y = Math.random() * size;
        ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          x += (Math.random() - 0.5) * size * 0.25;
          y += (Math.random() - 0.5) * size * 0.25;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const roofPalette = ['#cbb894', '#dccfaf', '#b7a179', '#8f7f68', '#c47a64', '#f6efea'];
      for (let i = 0; i < 260; i++) {
        const rw = 9 + Math.random() * 20;
        const rh = 9 + Math.random() * 20;
        const rx = Math.random() * size;
        const ry = Math.random() * size;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate((Math.random() - 0.5) * 0.25);
        ctx.fillStyle = roofPalette[Math.floor(Math.random() * roofPalette.length)];
        ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-rw / 2, -rh / 2, rw, rh);
        ctx.restore();

        if (Math.random() < 0.16) {
          ctx.fillStyle = Math.random() < 0.5 ? '#1c1c1c' : '#dfe0e0';
          ctx.beginPath();
          ctx.arc(rx + rw * 0.3, ry - rh * 0.3, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = 'rgba(50, 90, 35, 0.8)';
      for (let i = 0; i < 55; i++) {
        const tx = Math.random() * size;
        const ty = Math.random() * size;
        const r = 4 + Math.random() * 9;
        ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
      }

      return new THREE.CanvasTexture(c);
    }

    createMaterials() {

      this.materials.oceanDeep = new THREE.MeshStandardMaterial({
        color: PALETTE.oceanDeep,
        roughness: 0.22,
        metalness: 0.65
      });
      this.materials.oceanTurquoise = new THREE.MeshStandardMaterial({
        color: PALETTE.oceanTurquoise,
        roughness: 0.20,
        metalness: 0.60
      });
      this.materials.oceanShallow = new THREE.MeshStandardMaterial({
        color: PALETTE.oceanShallow,
        roughness: 0.25,
        metalness: 0.40,
        transparent: true,
        opacity: 0.88
      });
      this.materials.oceanFoam = new THREE.MeshBasicMaterial({
        color: PALETTE.oceanFoam,
        transparent: true,
        opacity: 0.95
      });
      this.materials.beachSand = new THREE.MeshStandardMaterial({
        color: PALETTE.beachSand,
        roughness: 0.96,
        metalness: 0.02
      });
      this.materials.coastalCliff = new THREE.MeshStandardMaterial({
        color: PALETTE.coastalCliff,
        roughness: 0.95,
        metalness: 0.02,
        flatShading: true
      });
      this.materials.coastalCliffDk = new THREE.MeshStandardMaterial({
        color: PALETTE.coastalCliffDk,
        roughness: 0.98,
        metalness: 0.02,
        flatShading: true
      });
      this.materials.coastalScrub = new THREE.MeshStandardMaterial({
        color: PALETTE.coastalScrub,
        roughness: 0.90,
        metalness: 0.02
      });
      this.materials.pchAsphalt = new THREE.MeshStandardMaterial({
        color: PALETTE.pchAsphalt,
        roughness: 0.92,
        metalness: 0.05
      });
      this.materials.poolWater = new THREE.MeshStandardMaterial({
        color: PALETTE.poolTurquoise,
        roughness: 0.15,
        metalness: 0.75
      });
      this.materials.poolCoping = new THREE.MeshStandardMaterial({
        color: PALETTE.poolCoping,
        roughness: 0.85,
        metalness: 0.05
      });
      this.materials.roofRedTile = new THREE.MeshStandardMaterial({
        color: PALETTE.roofRedTile,
        roughness: 0.82,
        metalness: 0.04
      });
      this.materials.roofSlateDark = new THREE.MeshStandardMaterial({
        color: PALETTE.roofSlateDark,
        roughness: 0.85,
        metalness: 0.08
      });
      this.materials.roofModernSand = new THREE.MeshStandardMaterial({
        color: PALETTE.roofModernSand,
        roughness: 0.88,
        metalness: 0.04
      });
      this.materials.coastalLawn = new THREE.MeshStandardMaterial({
        color: PALETTE.coastalLawn,
        roughness: 0.95,
        metalness: 0.01
      });
      this.materials.palmTrunk = new THREE.MeshStandardMaterial({
        color: PALETTE.palmTrunk,
        roughness: 0.94,
        metalness: 0.02
      });
      this.materials.palmFrond = new THREE.MeshStandardMaterial({
        color: PALETTE.palmFrond,
        roughness: 0.78,
        metalness: 0.04,
        side: THREE.DoubleSide
      });
      this.materials.eucalyptus = new THREE.MeshStandardMaterial({
        color: PALETTE.eucalyptusGreen,
        roughness: 0.88,
        metalness: 0.02
      });
      this.materials.markingYellow = new THREE.MeshBasicMaterial({ color: PALETTE.markingYellow });
      this.materials.markingWhite = new THREE.MeshBasicMaterial({ color: PALETTE.markingWhite });
      this.materials.lightPole = new THREE.MeshStandardMaterial({ color: 0x7c8288, roughness: 0.50, metalness: 0.60 });

      this.materials.jaipurFacade = new THREE.MeshStandardMaterial({
        map: this.textures.jaipurTracery,
        color: PALETTE.jaipurTerracotta,
        roughness: 0.90,
        metalness: 0.03
      });
      this.materials.jaipurSolid = new THREE.MeshStandardMaterial({
        color: PALETTE.jaipurTerracotta,
        roughness: 0.88,
        metalness: 0.03
      });
      this.materials.jaipurDark = new THREE.MeshStandardMaterial({
        color: PALETTE.jaipurTerracottaDk,
        roughness: 0.90,
        metalness: 0.04
      });
      this.materials.sandstone = new THREE.MeshStandardMaterial({
        color: PALETTE.jaipurSandstone,
        roughness: 0.88,
        metalness: 0.03
      });
      this.materials.sandstoneDark = new THREE.MeshStandardMaterial({
        color: PALETTE.jaipurSandstoneDk,
        roughness: 0.90,
        metalness: 0.04
      });
      this.materials.ivory = new THREE.MeshStandardMaterial({
        color: PALETTE.jaipurIvory,
        roughness: 0.82,
        metalness: 0.02
      });
      this.materials.cream = new THREE.MeshStandardMaterial({
        color: PALETTE.jaipurCream,
        roughness: 0.85,
        metalness: 0.02
      });
      this.materials.marble = new THREE.MeshStandardMaterial({
        color: PALETTE.jaipurMarble,
        roughness: 0.65,
        metalness: 0.08
      });
      this.materials.solarPanel = new THREE.MeshStandardMaterial({
        color: PALETTE.solarBlue,
        roughness: 0.20,
        metalness: 0.85
      });
      this.materials.teak = new THREE.MeshStandardMaterial({
        color: PALETTE.teakWood,
        roughness: 0.75,
        metalness: 0.10
      });
      this.materials.wroughtIron = new THREE.MeshStandardMaterial({
        color: PALETTE.wroughtIron,
        roughness: 0.65,
        metalness: 0.70
      });
      this.materials.courtyardPaving = new THREE.MeshStandardMaterial({
        color: PALETTE.courtyardStone,
        roughness: 0.94,
        metalness: 0.02
      });
      this.materials.cityRooftop = new THREE.MeshStandardMaterial({
        color: PALETTE.walledCityRoof,
        roughness: 0.95,
        metalness: 0.02
      });

      this.materials.walledTan = new THREE.MeshStandardMaterial({
        color: PALETTE.walledCityTan,
        roughness: 0.92,
        metalness: 0.02
      });
      this.materials.walledBeige = new THREE.MeshStandardMaterial({
        color: PALETTE.walledCityBeige,
        roughness: 0.92,
        metalness: 0.02
      });
      this.materials.walledDark = new THREE.MeshStandardMaterial({
        color: PALETTE.walledCityDark,
        roughness: 0.94,
        metalness: 0.02
      });
      this.materials.roadAsphalt = new THREE.MeshStandardMaterial({
        color: PALETTE.roadAsphalt,
        roughness: 0.92,
        metalness: 0.05
      });
      this.materials.sintex = new THREE.MeshStandardMaterial({
        color: PALETTE.sintexBlack,
        roughness: 0.60,
        metalness: 0.15
      });
      this.materials.sintexWhite = new THREE.MeshStandardMaterial({
        color: PALETTE.sintexWhite,
        roughness: 0.65,
        metalness: 0.10
      });
      this.materials.parterreGrass = new THREE.MeshStandardMaterial({
        color: PALETTE.parterreGrass,
        roughness: 0.95,
        metalness: 0.01
      });
      this.materials.banyanCanopy = new THREE.MeshStandardMaterial({
        color: PALETTE.banyanCanopy,
        roughness: 0.88,
        metalness: 0.02
      });
      this.materials.neem = new THREE.MeshStandardMaterial({
        color: PALETTE.neemCanopy,
        roughness: 0.88,
        metalness: 0.02
      });
      this.materials.neemLight = new THREE.MeshStandardMaterial({
        color: PALETTE.neemCanopyLight,
        roughness: 0.85,
        metalness: 0.02
      });
      this.materials.treeTrunk = new THREE.MeshStandardMaterial({
        color: PALETTE.treeWood,
        roughness: 0.95,
        metalness: 0.02
      });
      this.materials.mountainRock = new THREE.MeshStandardMaterial({
        color: PALETTE.mountainRock,
        roughness: 0.95,
        metalness: 0.02,
        flatShading: true
      });
      this.materials.mountainRockDark = new THREE.MeshStandardMaterial({
        color: PALETTE.mountainRockDark,
        roughness: 0.98,
        metalness: 0.02,
        flatShading: true
      });
    }

    createGround(cityType = 'visitor') {
      if (this.groundMesh) {
        this.scene.remove(this.groundMesh);
        if (this.groundMesh.geometry) this.groundMesh.geometry.dispose();
      }

      const groundGeo = new THREE.PlaneGeometry(4000, 4000);
      const groundMat = new THREE.ShadowMaterial({
        opacity: 0.35
      });

      this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
      this.groundMesh.rotation.x = -Math.PI / 2;
      this.groundMesh.position.y = 0;
      this.groundMesh.receiveShadow = true;
      this.scene.add(this.groundMesh);
    }

    buildCaliforniaCoast(group) {
      this.waveMeshes = [];
      this.oceanDetailMesh = null;

      const waveConfigs = [
        { x: 22, z: -80, w: 28, l: 110, rot: -0.22 },
        { x: 34, z: -10, w: 32, l: 140, rot: -0.26 },
        { x: 48, z: 70, w: 36, l: 160, rot: -0.24 },
        { x: 62, z: 150, w: 42, l: 180, rot: -0.28 },
        { x: 18, z: -140, w: 24, l: 90, rot: -0.18 }
      ];

      for (let i = 0; i < waveConfigs.length; i++) {
        const wc = waveConfigs[i];
        const waveG = new THREE.Group();
        waveG.position.set(wc.x, 0.04 + i * 0.005, wc.z);
        waveG.rotation.y = wc.rot;

        const foamGeo = new THREE.PlaneGeometry(wc.w, wc.l);
        const foam = new THREE.Mesh(foamGeo, this.materials.oceanFoam);
        foam.rotation.x = -Math.PI / 2;
        waveG.add(foam);

        const faceGeo = new THREE.PlaneGeometry(wc.w * 0.4, wc.l);
        const face = new THREE.Mesh(faceGeo, this.materials.oceanTurquoise);
        face.rotation.x = -Math.PI / 2;
        face.position.x = -wc.w * 0.3;
        waveG.add(face);

        group.add(waveG);
        this.waveMeshes.push({ group: waveG, baseZ: wc.z, baseX: wc.x, speed: 0.4 + i * 0.1 });
      }

      group.add(this.createCaliforniaCar({ x: 0.6, y: 0.05, z: -35, color: 0xc82a24, rotY: 0 }));
      group.add(this.createCaliforniaCar({ x: 2.4, y: 0.05, z: 20, color: 0x225588, rotY: Math.PI }));
      group.add(this.createCaliforniaCar({ x: 0.6, y: 0.05, z: 85, color: 0xf4f6f8, rotY: 0 }));
      group.add(this.createCaliforniaCar({ x: 2.4, y: 0.05, z: -110, color: 0x22262a, rotY: Math.PI }));

      this.buildCaliforniaNeighborhood(group);
    }

    buildCaliforniaNeighborhood(group) {
      const baseY = 0;

      const useReal = this.osmFetchStatus.visitor === 'ready' &&
        this.osmFootprints.visitor &&
        this.osmFootprints.visitor.length >= 5;

      if (useReal) {
        const realGroup = this.extrudeFootprints(this.osmFootprints.visitor, {
          paletteMode: 'california',
          maxCount: 700,
          originOffset: [-45, 0]
        });
        realGroup.position.y = baseY;
        group.add(realGroup);
      } else {

        const motelW = 28;
        const motelD = 42;
        const motelH = 6.8;
        const motel = new THREE.Mesh(new THREE.BoxGeometry(motelW, motelH, motelD), this.materials.roofModernSand);
        motel.position.set(-65, baseY + motelH / 2, -100);
        motel.castShadow = true;
        group.add(motel);

        const lotGeo = new THREE.PlaneGeometry(24, 46);
        const lot = new THREE.Mesh(lotGeo, this.materials.pchAsphalt);
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(-42, baseY + 0.04, -100);
        group.add(lot);

        for (let pz = -118; pz <= -82; pz += 12) {
          group.add(this.createCaliforniaCar({ x: -42, y: baseY + 0.05, z: pz, color: 0xffffff, rotY: Math.PI / 2 }));
        }

        const row1Z = [-110, -75, -25, 10, 50, 90, 130, 170];
        for (let i = 0; i < row1Z.length; i++) {
          const hz = row1Z[i];
          const houseType = i % 3;
          this.buildCaliforniaBeachHouse(group, -12, hz, houseType, (i % 2 === 0));
        }

        const row2Z = [-35, 5, 45, 85, 125, 165];
        for (let i = 0; i < row2Z.length; i++) {
          const hz = row2Z[i];
          const houseType = (i + 1) % 3;
          this.buildCaliforniaBeachHouse(group, -40, hz, houseType, (i % 3 === 1));
        }
      }

      for (let pz = -180; pz <= 180; pz += 22) {

        group.add(this.createCaliforniaPalm({ x: -22, y: baseY, z: pz }));
        group.add(this.createCaliforniaPalm({ x: -30, y: baseY, z: pz + 8 }));

        group.add(this.createEucalyptusTree({ x: -55, y: baseY, z: pz + 4 }));
      }
    }

    buildCaliforniaBeachHouse(group, x, z, type, hasPool) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);

      const hW = 12.5;
      const hD = 15.0;
      const hH = (type === 1) ? 5.8 : 4.4;

      let roofMat = this.materials.roofRedTile;
      if (type === 1) roofMat = this.materials.roofModernSand;
      if (type === 2) roofMat = this.materials.roofSlateDark;

      const body = new THREE.Mesh(new THREE.BoxGeometry(hW, hH, hD), this.materials.roofModernSand);
      body.position.set(0, hH / 2, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      if (type === 0) {

        const roofGeo = new THREE.ConeGeometry(hW * 0.72, 3.4, 4);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(0, hH + 1.7, 0);
        roof.scale.set(1.0, 1.0, hD / hW);
        roof.castShadow = true;
        g.add(roof);
      } else if (type === 1) {

        const parapet = new THREE.Mesh(new THREE.BoxGeometry(hW + 0.3, 0.7, hD + 0.3), roofMat);
        parapet.position.set(0, hH + 0.35, 0);
        g.add(parapet);

        const pBlock = new THREE.Mesh(new THREE.BoxGeometry(hW * 0.6, 2.8, hD * 0.5), roofMat);
        pBlock.position.set(-hW * 0.1, hH + 1.4, -hD * 0.1);
        pBlock.castShadow = true;
        g.add(pBlock);
      } else {

        const gableGeo = new THREE.ConeGeometry(hW * 0.68, 3.8, 4);
        const gRoof = new THREE.Mesh(gableGeo, roofMat);
        gRoof.rotation.y = Math.PI / 4;
        gRoof.position.set(0, hH + 1.9, 0);
        gRoof.scale.set(1.0, 1.0, hD / hW);
        gRoof.castShadow = true;
        g.add(gRoof);

        const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.2, 1.2), this.materials.roofRedTile);
        chimney.position.set(hW * 0.3, hH + 2.1, -hD * 0.2);
        chimney.castShadow = true;
        g.add(chimney);
      }

      if (hasPool) {
        const poolW = 5.2;
        const poolD = 8.5;
        const poolZ = hD / 2 + poolD / 2 + 1.8;

        const coping = new THREE.Mesh(new THREE.BoxGeometry(poolW + 1.2, 0.25, poolD + 1.2), this.materials.poolCoping);
        coping.position.set(0, 0.12, poolZ);
        coping.receiveShadow = true;
        g.add(coping);

        const water = new THREE.Mesh(new THREE.PlaneGeometry(poolW, poolD), this.materials.poolWater);
        water.rotation.x = -Math.PI / 2;
        water.position.set(0, 0.15, poolZ);
        g.add(water);

        const lounger = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 1.8), this.materials.poolCoping);
        lounger.position.set(poolW / 2 + 1.2, 0.15, poolZ);
        g.add(lounger);
      }

      group.add(this.createCaliforniaCar({ x: x - hW / 2 - 2, y: 0.05, z: z - 3, color: 0x334455, rotY: 0 }));

      group.add(g);
    }

    createCaliforniaPalm({ x, y = 0, z }) {
      const g = new THREE.Group();
      g.position.set(x, y, z);

      const trunkH = 14.0;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, trunkH, 6), this.materials.palmTrunk);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      g.add(trunk);

      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const frond = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.6, 5), this.materials.palmFrond);
        frond.rotation.z = Math.PI * 0.38;
        frond.rotation.y = a;
        frond.position.set(Math.cos(a) * 1.5, trunkH + 0.4, Math.sin(a) * 1.5);
        frond.castShadow = true;
        g.add(frond);
      }

      return g;
    }

    createEucalyptusTree({ x, y = 0, z }) {
      const g = new THREE.Group();
      g.position.set(x, y, z);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 5.2, 7), this.materials.treeTrunk);
      trunk.position.y = 2.6;
      trunk.castShadow = true;
      g.add(trunk);

      const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(4.2, 1), this.materials.eucalyptus);
      c1.position.set(0, 6.8, 0);
      c1.castShadow = true;
      g.add(c1);

      return g;
    }

    createCaliforniaCar({ x, y = 0, z, color = 0xf0f2f5, rotY = 0 }) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rotY;

      const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.25, metalness: 0.75 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 3.8), bodyMat);
      body.position.y = 0.45;
      body.castShadow = true;
      g.add(body);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 2.0), this.materials.roofSlateDark);
      cabin.position.set(0, 0.95, -0.2);
      cabin.castShadow = true;
      g.add(cabin);

      return g;
    }

    buildMubarakMahal({ x = 0, y = 0, z = 0 }) {
      const g = new THREE.Group();
      g.position.set(x, y, z);

      const plinthW = 28;
      const plinthD = 28;
      const plinthH = 1.4;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(plinthW, plinthH, plinthD), this.materials.sandstoneDark);
      plinth.position.y = plinthH / 2;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      g.add(plinth);

      const gfW = 22;
      const gfD = 22;
      const gfH = 4.8;
      const gfCore = new THREE.Mesh(new THREE.BoxGeometry(gfW, gfH, gfD), this.materials.ivory);
      gfCore.position.y = plinthH + gfH / 2;
      gfCore.castShadow = true;
      gfCore.receiveShadow = true;
      g.add(gfCore);

      const colGeo = new THREE.CylinderGeometry(0.35, 0.42, gfH, 8);
      const archSpans = [-gfW / 2 + 1.2, -gfW / 6, gfW / 6, gfW / 2 - 1.2];
      for (const cx of archSpans) {
        for (const cz of [-gfD / 2 - 0.4, gfD / 2 + 0.4]) {
          const col = new THREE.Mesh(colGeo, this.materials.sandstone);
          col.position.set(cx, plinthH + gfH / 2, cz);
          col.castShadow = true;
          g.add(col);
        }
      }

      const cornice1 = new THREE.Mesh(new THREE.BoxGeometry(gfW + 2.4, 0.6, gfD + 2.4), this.materials.sandstoneDark);
      cornice1.position.y = plinthH + gfH + 0.3;
      cornice1.castShadow = true;
      g.add(cornice1);

      const ffW = 19;
      const ffD = 19;
      const ffH = 4.4;
      const ffCore = new THREE.Mesh(new THREE.BoxGeometry(ffW, ffH, ffD), this.materials.ivory);
      ffCore.position.y = plinthH + gfH + 0.6 + ffH / 2;
      ffCore.castShadow = true;
      ffCore.receiveShadow = true;
      g.add(ffCore);

      const jhW = 5.2;
      const jhH = 3.6;
      const jhD = 1.8;
      const jhOffsets = [
        [0, -ffD / 2 - jhD / 2, 0],
        [0, ffD / 2 + jhD / 2, 0],
        [-ffW / 2 - jhD / 2, 0, Math.PI / 2],
        [ffW / 2 + jhD / 2, 0, Math.PI / 2]
      ];

      for (const [jx, jz, rot] of jhOffsets) {
        const jharokha = new THREE.Mesh(new THREE.BoxGeometry(jhW, jhH, jhD), this.materials.sandstone);
        jharokha.position.set(jx, plinthH + gfH + 0.6 + ffH / 2, jz);
        jharokha.rotation.y = rot;
        jharokha.castShadow = true;
        g.add(jharokha);

        const dome = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.2, 8), this.materials.sandstoneDark);
        dome.position.set(jx, plinthH + gfH + 0.6 + ffH + 0.6, jz);
        dome.castShadow = true;
        g.add(dome);
      }

      const roofY = plinthH + gfH + 0.6 + ffH;
      const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(ffW + 1.8, 0.5, ffD + 1.8), this.materials.sandstoneDark);
      roofSlab.position.y = roofY + 0.25;
      roofSlab.castShadow = true;
      g.add(roofSlab);

      const parapet = new THREE.Mesh(new THREE.BoxGeometry(ffW + 1.6, 0.9, ffD + 1.6), this.materials.ivory);
      parapet.position.y = roofY + 0.5 + 0.45;
      g.add(parapet);

      const chCorners = [
        [-ffW / 2 + 1.2, -ffD / 2 + 1.2], [ffW / 2 - 1.2, -ffD / 2 + 1.2],
        [-ffW / 2 + 1.2, ffD / 2 - 1.2], [ffW / 2 - 1.2, ffD / 2 - 1.2]
      ];
      for (const [cx, cz] of chCorners) {
        const cPil = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.6, 6), this.materials.sandstone);
        cPil.position.set(cx, roofY + 1.6, cz);
        g.add(cPil);

        const cDome = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.materials.sandstone);
        cDome.position.set(cx, roofY + 2.5, cz);
        cDome.castShadow = true;
        g.add(cDome);
      }

      return g;
    }

    buildPalaceCourtyard(group) {
      const cW = 145;
      const cD = 125;
      const cX = -5;
      const cZ = 5;

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(cW, cD), this.materials.courtyardPaving);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cX, 0.06, cZ);
      floor.receiveShadow = true;
      group.add(floor);

      const parterres = [
        [cX - 38, cZ - 28, 36, 32],
        [cX - 38, cZ + 28, 36, 32],
        [cX + 38, cZ - 28, 32, 32],
        [cX + 38, cZ + 28, 32, 32]
      ];

      for (const [px, pz, pw, pd] of parterres) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), this.materials.parterreGrass);
        p.rotation.x = -Math.PI / 2;
        p.position.set(px, 0.12, pz);
        p.receiveShadow = true;
        group.add(p);

        const edge = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.8, 0.25, pd + 0.8), this.materials.sandstoneDark);
        edge.position.set(px, 0.12, pz);
        group.add(edge);
      }
    }

    buildChandraMahal({ x = -10, y = 0, z = -95 }) {
      const g = new THREE.Group();
      g.position.set(x, y, z);

      const tiers = [
        { w: 46, d: 34, h: 7.0, mat: this.materials.cream, trim: this.materials.sandstoneDark },
        { w: 42, d: 30, h: 5.2, mat: this.materials.cream, trim: this.materials.sandstoneDark },
        { w: 38, d: 26, h: 4.8, mat: this.materials.cream, trim: this.materials.jaipurSolid },
        { w: 32, d: 22, h: 4.5, mat: this.materials.cream, trim: this.materials.sandstoneDark },
        { w: 26, d: 18, h: 4.2, mat: this.materials.ivory, trim: this.materials.jaipurSolid },
        { w: 20, d: 14, h: 3.8, mat: this.materials.ivory, trim: this.materials.sandstoneDark },
        { w: 14, d: 10, h: 3.5, mat: this.materials.ivory, trim: this.materials.sandstoneDark }
      ];

      let currentY = 0;
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i];
        const block = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), t.mat);
        block.position.set(0, currentY + t.h / 2, 0);
        block.castShadow = true;
        block.receiveShadow = true;
        g.add(block);

        const cornice = new THREE.Mesh(new THREE.BoxGeometry(t.w + 1.6, 0.45, t.d + 1.6), t.trim);
        cornice.position.set(0, currentY + t.h, 0);
        cornice.castShadow = true;
        g.add(cornice);

        const winBand = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.9, t.h * 0.5, t.d + 0.1), this.materials.wroughtIron);
        winBand.position.set(0, currentY + t.h * 0.55, 0);
        g.add(winBand);

        currentY += t.h + 0.45;
      }

      const domeGeo = new THREE.SphereGeometry(4.2, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      const crownDome = new THREE.Mesh(domeGeo, this.materials.sandstone);
      crownDome.position.set(0, currentY, 0);
      crownDome.scale.set(1.4, 0.9, 1.0);
      crownDome.castShadow = true;
      g.add(crownDome);

      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6.5, 6), this.materials.lightPole);
      staff.position.set(0, currentY + 5.5, 0);
      g.add(staff);

      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), this.materials.jaipurSolid);
      flag.position.set(1.2, currentY + 7.2, 0);
      g.add(flag);

      return g;
    }

    buildDiwanIKhas({ x = 45, y = 0, z = -25 }) {
      const g = new THREE.Group();
      g.position.set(x, y, z);

      const cW = 58;
      const cD = 58;
      const wallH = 6.8;
      const wallThick = 2.2;
      const wallMat = this.materials.jaipurSolid;

      const wN = new THREE.Mesh(new THREE.BoxGeometry(cW, wallH, wallThick), wallMat);
      wN.position.set(0, wallH / 2, -cD / 2); g.add(wN);

      const wS = new THREE.Mesh(new THREE.BoxGeometry(cW, wallH, wallThick), wallMat);
      wS.position.set(0, wallH / 2, cD / 2); g.add(wS);

      const wE = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, cD), wallMat);
      wE.position.set(cW / 2, wallH / 2, 0); g.add(wE);

      const cFloor = new THREE.Mesh(new THREE.PlaneGeometry(cW - 2, cD - 2), this.materials.jaipurDark);
      cFloor.rotation.x = -Math.PI / 2;
      cFloor.position.y = 0.08;
      cFloor.receiveShadow = true;
      g.add(cFloor);

      const pavW = 20;
      const pavD = 20;
      const pavH = 5.2;

      const plinth = new THREE.Mesh(new THREE.BoxGeometry(pavW + 2.5, 1.2, pavD + 2.5), this.materials.sandstoneDark);
      plinth.position.y = 0.6;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      g.add(plinth);

      const pilGeo = new THREE.CylinderGeometry(0.38, 0.44, pavH, 8);
      const pilPositions = [
        [-pavW / 2 + 1, -pavD / 2 + 1], [0, -pavD / 2 + 1], [pavW / 2 - 1, -pavD / 2 + 1],
        [-pavW / 2 + 1, pavD / 2 - 1], [0, pavD / 2 - 1], [pavW / 2 - 1, pavD / 2 - 1],
        [-pavW / 2 + 1, 0], [pavW / 2 - 1, 0]
      ];
      for (const [px, pz] of pilPositions) {
        const pil = new THREE.Mesh(pilGeo, this.materials.marble);
        pil.position.set(px, 1.2 + pavH / 2, pz);
        pil.castShadow = true;
        g.add(pil);
      }

      const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(pavW + 3.2, 0.65, pavD + 3.2), this.materials.marble);
      roofSlab.position.y = 1.2 + pavH + 0.32;
      roofSlab.castShadow = true;
      g.add(roofSlab);

      for (const [cx, cz] of [
        [-pavW / 2, -pavD / 2], [pavW / 2, -pavD / 2],
        [-pavW / 2, pavD / 2], [pavW / 2, pavD / 2]
      ]) {
        const chDome = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.materials.sandstone);
        chDome.position.set(cx, 1.2 + pavH + 1.4, cz);
        g.add(chDome);
      }

      return g;
    }

    buildPalaceWings(group) {
      const wingH = 9.5;
      const wingW = 14.0;

      const southL = 175;
      const southWing = new THREE.Mesh(new THREE.BoxGeometry(southL, wingH, wingW), this.materials.sandstone);
      southWing.position.set(8, wingH / 2, 68);
      southWing.castShadow = true;
      southWing.receiveShadow = true;
      group.add(southWing);

      const sGate = new THREE.Mesh(new THREE.BoxGeometry(20, wingH + 4.5, wingW + 2.5), this.materials.sandstoneDark);
      sGate.position.set(-5, (wingH + 4.5) / 2, 68);
      sGate.castShadow = true;
      group.add(sGate);

      const sGateArch = new THREE.Mesh(new THREE.BoxGeometry(8, 7.5, wingW + 3.0), this.materials.wroughtIron);
      sGateArch.position.set(-5, 3.75, 68);
      group.add(sGateArch);

      const westL = 150;
      const westWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, westL), this.materials.sandstone);
      westWing.position.set(-78, wingH / 2, 0);
      westWing.castShadow = true;
      westWing.receiveShadow = true;
      group.add(westWing);

      for (let r = 0; r < 16; r++) {
        const sz = -westL / 2 + 10 + r * 8.2;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(wingW * 0.78, 0.25, 6.2), this.materials.solarPanel);
        panel.rotation.x = 0.15;
        panel.position.set(-78, wingH + 0.45, sz);
        panel.castShadow = true;
        group.add(panel);
      }

      const eastL = 140;
      const eastWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, eastL), this.materials.cream);
      eastWing.position.set(88, wingH / 2, -10);
      eastWing.castShadow = true;
      eastWing.receiveShadow = true;
      group.add(eastWing);

      const towerW = 16;
      const towerH = 22;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerW), this.materials.ivory);
      tower.position.set(78, towerH / 2, -32);
      tower.castShadow = true;
      group.add(tower);

      const towerDome = new THREE.Mesh(new THREE.SphereGeometry(5.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.materials.sandstone);
      towerDome.position.set(78, towerH + 0.5, -32);
      towerDome.castShadow = true;
      group.add(towerDome);

      const nGate = new THREE.Mesh(new THREE.BoxGeometry(32, wingH + 3.2, wingW), this.materials.sandstoneDark);
      nGate.position.set(-10, (wingH + 3.2) / 2, -56);
      nGate.castShadow = true;
      group.add(nGate);
    }

    buildDenseWalledCity(group) {
      const useReal = this.osmFetchStatus.jaipur === 'ready' &&
        this.osmFootprints.jaipur &&
        this.osmFootprints.jaipur.length >= 5;

      if (useReal) {
        const realGroup = this.extrudeFootprints(this.osmFootprints.jaipur, {
          paletteMode: 'jaipur',
          maxCount: 900
        });
        group.add(realGroup);
      }

      const cityBlocks = [
        { xMin: -380, xMax: -90, zMin: -240, zMax: 180 },
        { xMin: -350, xMax: 350, zMin: 78, zMax: 260 },
        { xMin: 98, xMax: 380, zMin: -240, zMax: 180 },
        { xMin: -380, xMax: 380, zMin: -480, zMax: -140 }
      ];

      const haveliColors = [
        this.materials.walledTan,
        this.materials.walledBeige,
        this.materials.walledTan,
        this.materials.walledDark,
        this.materials.cream,
        this.materials.jaipurSolid
      ];

      if (!useReal) {
        for (const sector of cityBlocks) {
          const stepX = 32;
          const stepZ = 30;

          for (let bx = sector.xMin; bx <= sector.xMax; bx += stepX) {
            for (let bz = sector.zMin; bz <= sector.zMax; bz += stepZ) {
              const seed = Math.abs(Math.floor(bx * 13 + bz * 7));
              const bH = 8.5 + (seed % 10);
              const bW = stepX - 3.5;
              const bD = stepZ - 3.5;
              const mat = haveliColors[seed % haveliColors.length];

              const bMesh = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), mat);
              bMesh.position.set(bx + (seed % 4) - 2, bH / 2, bz + ((seed >> 2) % 4) - 2);
              bMesh.castShadow = true;
              bMesh.receiveShadow = true;
              group.add(bMesh);

              const parapet = new THREE.Mesh(new THREE.BoxGeometry(bW + 0.4, 0.8, bD + 0.4), this.materials.cityRooftop);
              parapet.position.set(bx + (seed % 4) - 2, bH + 0.4, bz + ((seed >> 2) % 4) - 2);
              group.add(parapet);

              const mumty = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 3.2), this.materials.ivory);
              mumty.position.set(bx - 3, bH + 1.2, bz - 2);
              group.add(mumty);

              const tankMat = (seed % 3 === 0) ? this.materials.sintexWhite : this.materials.sintex;
              const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 8), tankMat);
              tank.position.set(bx + 3, bH + 0.9, bz + 2);
              group.add(tank);
            }
          }
        }

        const roadGeo = new THREE.PlaneGeometry(750, 16);
        const road1 = new THREE.Mesh(roadGeo, this.materials.roadAsphalt);
        road1.rotation.x = -Math.PI / 2;
        road1.position.set(0, 0.05, 80);
        road1.receiveShadow = true;
        group.add(road1);
      }
    }

    buildPalaceTrees(group) {
      const treePositions = [
        [-85, 78, 1.3, 'banyan'], [-72, 78, 1.2, 'banyan'], [-58, 80, 1.1, 'neem'],
        [48, 80, 1.2, 'banyan'], [62, 82, 1.3, 'banyan'], [76, 80, 1.1, 'neem'],
        [-65, 48, 1.15, 'neem'], [-68, -38, 1.2, 'banyan'],
        [68, 45, 1.1, 'neem'], [72, -45, 1.25, 'banyan'],
        [-45, -75, 1.35, 'banyan'], [-65, -85, 1.25, 'banyan'],
        [38, -85, 1.2, 'neem'], [55, -95, 1.3, 'banyan'],
        [110, -55, 1.4, 'banyan'], [125, -45, 1.2, 'neem'],
        [115, 25, 1.3, 'banyan'], [125, 45, 1.1, 'neem']
      ];

      for (const [tx, tz, sc, type] of treePositions) {
        if (type === 'banyan') {
          group.add(this.createBanyanTree({ x: tx, y: 0.1, z: tz, scale: sc }));
        } else {
          group.add(this.createNeemTree({ x: tx, y: 0.1, z: tz, scale: sc }));
        }
      }
    }

    createBanyanTree({ x, y = 0, z, scale = 1 }) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.scale.set(scale, scale, scale);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.4, 4.5, 8), this.materials.treeTrunk);
      trunk.position.y = 2.25;
      trunk.castShadow = true;
      g.add(trunk);

      const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(5.2, 1), this.materials.banyanCanopy);
      c1.position.set(0, 6.5, 0);
      c1.castShadow = true;
      c1.receiveShadow = true;
      g.add(c1);

      const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(3.8, 1), this.materials.neem);
      c2.position.set(2.2, 7.2, -1.5);
      c2.castShadow = true;
      g.add(c2);

      const c3 = new THREE.Mesh(new THREE.DodecahedronGeometry(3.6, 1), this.materials.neemLight);
      c3.position.set(-2.0, 6.8, 1.6);
      c3.castShadow = true;
      g.add(c3);

      return g;
    }

    createNeemTree({ x, y = 0, z, scale = 1 }) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.scale.set(scale, scale, scale);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 4.0, 7), this.materials.treeTrunk);
      trunk.position.y = 2.0;
      trunk.castShadow = true;
      g.add(trunk);

      const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(4.0, 1), this.materials.neem);
      c1.position.set(0, 5.8, 0);
      c1.castShadow = true;
      c1.receiveShadow = true;
      g.add(c1);

      const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(3.0, 1), this.materials.neemLight);
      c2.position.set(1.4, 6.6, -1.0);
      c2.castShadow = true;
      g.add(c2);

      return g;
    }

    buildAravalliHills(group) {
      const hillGroup = new THREE.Group();

      const r1Geo = new THREE.PlaneGeometry(1600, 180, 40, 12);
      const pos1 = r1Geo.attributes.position;
      for (let i = 0; i < pos1.count; i++) {
        const u = (pos1.getX(i) + 800) / 1600;
        const v = (pos1.getY(i) + 90) / 180;
        if (v > 0.1) {
          const bump = Math.sin(u * 14.0) * 18 + Math.cos(u * 7.5 + 1.2) * 26 + Math.sin(u * 22.0) * 8;
          pos1.setZ(i, Math.max(0, bump * v));
        }
      }
      r1Geo.computeVertexNormals();

      const ridge1 = new THREE.Mesh(r1Geo, this.materials.mountainRock);
      ridge1.rotation.x = -Math.PI * 0.42;
      ridge1.position.set(0, 20, -680);
      hillGroup.add(ridge1);

      const r2Geo = new THREE.PlaneGeometry(1800, 260, 48, 16);
      const pos2 = r2Geo.attributes.position;
      for (let i = 0; i < pos2.count; i++) {
        const u = (pos2.getX(i) + 900) / 1800;
        const v = (pos2.getY(i) + 130) / 260;
        if (v > 0.1) {
          const bump = Math.sin(u * 9.0) * 36 + Math.cos(u * 5.0) * 44 + Math.sin(u * 18.0) * 14;
          pos2.setZ(i, Math.max(0, bump * v));
        }
      }
      r2Geo.computeVertexNormals();

      const ridge2 = new THREE.Mesh(r2Geo, this.materials.mountainRockDark);
      ridge2.rotation.x = -Math.PI * 0.42;
      ridge2.position.set(0, 35, -880);
      hillGroup.add(ridge2);

      group.add(hillGroup);
    }

    buildCity(cityType = 'visitor') {
      if (!this.buildingGroup || !this.instancedGroup) return;

      this.createGround(cityType);

      while (this.buildingGroup.children.length > 0) {
        const child = this.buildingGroup.children[0];
        if (child.traverse) {
          child.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
        } else if (child.geometry) {
          child.geometry.dispose();
        }
        this.buildingGroup.remove(child);
      }
      while (this.instancedGroup.children.length > 0) {
        const child = this.instancedGroup.children[0];
        if (child.traverse) {
          child.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
        } else if (child.geometry) {
          child.geometry.dispose();
        }
        this.instancedGroup.remove(child);
      }
      this.oceanDetailMesh = null;

      const isJaipur = cityType === 'jaipur';

      this.scene.background = null;
      this.scene.fog = null;

      this.camera.fov = isJaipur ? 38 : 32;
      this.camera.updateProjectionMatrix();

      if (isJaipur) {

        console.log('[Engine3D] Generating 1:1 The City Palace, Jaipur & Walled Pink City...');

        this.camera.position.set(-15, 175, 195);
        this.camera.lookAt(12, 14, -20);

        this.sunLight.position.set(-260, 200, 140);
        this.sunLight.color.setHex(PALETTE.sunWarmth);
        this.sunLight.intensity = 2.4;

        this.buildingGroup.add(this.buildMubarakMahal({ x: -5, y: 0, z: 5 }));

        this.buildPalaceCourtyard(this.buildingGroup);

        this.buildingGroup.add(this.buildChandraMahal({ x: -10, y: 0, z: -95 }));

        this.buildingGroup.add(this.buildDiwanIKhas({ x: 45, y: 0, z: -25 }));

        this.buildPalaceWings(this.buildingGroup);

        this.buildPalaceTrees(this.buildingGroup);

        this.buildDenseWalledCity(this.buildingGroup);

        this.buildAravalliHills(this.buildingGroup);

        console.log('[Engine3D] The City Palace, Jaipur successfully generated 1:1');

      } else {

        console.log('[Engine3D] Generating 1:1 California Pacific Coast Highway & Ocean Waves...');

        this.camera.position.set(-8, 220, 0);
        this.camera.up.set(0, 0, -1);
        this.camera.lookAt(-8, 0, 0);

        this.sunLight.position.set(120, 260, -100);
        this.sunLight.color.setHex(PALETTE.californiaSun);
        this.sunLight.intensity = 2.4;

        this.buildCaliforniaCoast(this.buildingGroup);

        console.log('[Engine3D] California Pacific Coastline successfully generated 1:1');
      }
    }

    show(cityKey = 'visitor') {
      if (!this.renderer) return false;
      this.currentCity = cityKey;
      this.buildCity(cityKey);
      this.active = true;
      this.startTime = Date.now();

      if (this.canvas) {
        this.canvas.classList.add('active');
        this.canvas.style.filter = 'none';
        this.canvas.style.setProperty('--grade-filter', 'none');
      }
      const washEl = document.getElementById('color-wash');
      if (washEl) washEl.style.background = 'transparent';

      const mapEl = document.getElementById('map');
      if (mapEl) mapEl.style.opacity = '1';

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
      const mapEl = document.getElementById('map');
      if (mapEl) mapEl.style.opacity = '1';
    }

    startLoop() {
      this.stopLoop();
      const isJaipur = this.currentCity === 'jaipur';
      const render = () => {
        if (!this.active) return;
        const elapsed = (Date.now() - this.startTime) * 0.001;

        if (isJaipur) {

          this.camera.up.set(0, 1, 0);
          this.camera.position.x = -15 + Math.sin(elapsed * 0.28) * 4;
          this.camera.position.y = 175 + Math.sin(elapsed * 0.38) * 2.2;
          this.camera.position.z = 195 + Math.cos(elapsed * 0.22) * 4.5;
          this.camera.lookAt(12, 14, -20);
        } else {

          this.camera.up.set(0, 0, -1);
          this.camera.position.x = -8 + Math.sin(elapsed * 0.22) * 1.5;
          this.camera.position.y = 220 + Math.sin(elapsed * 0.30) * 1.0;
          this.camera.position.z = Math.cos(elapsed * 0.18) * 1.5;
          this.camera.lookAt(-8, 0, 0);

          for (let i = 0; i < this.waveMeshes.length; i++) {
            const wm = this.waveMeshes[i];
            const waveOffset = ((elapsed * wm.speed) % 1.0);
            wm.group.position.x = wm.baseX - waveOffset * 6.5;
            wm.group.position.z = wm.baseZ + waveOffset * 2.0;
          }

          if (this.oceanDetailMesh && this.oceanDetailMesh.material.map) {
            this.oceanDetailMesh.material.map.offset.y = (elapsed * 0.045) % 1;
          }
        }

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

  window.OverhauledThreeSceneManager = OverhauledThreeSceneManager;
})(window);
