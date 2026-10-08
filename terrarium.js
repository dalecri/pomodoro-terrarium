// Voxel terrarium scene — Three.js
// Exposes window.Terrarium. Plants are data-driven (kind + seed) so the garden
// can be rebuilt identically from localStorage on every visit.

(function () {
  const BOX_W = 9;        // voxels wide (x)
  const BOX_D = 5;        // voxels deep (z)
  const BOX_H = 10;       // voxels tall (y)
  const VOX = 1;
  const SOIL_TOP = -BOX_H / 2 + VOX;
  const LEDGE_Y = -BOX_H / 2 + 0.11;   // top of the wooden base lip
  const LEDGE_Z = BOX_D / 2 + 0.32;    // front strip of wood outside the glass

  const COL = {
    soil:     0x5a3a24,
    soilDark: 0x46301e,
    pebble:   0x7a6a58,
    soilSpeck: 0x6b4a2e,
    moss:     [0x5fa85a, 0x7bc06a, 0x4a8f4a, 0x8dd57a, 0x6fc8a8, 0x98d460],
    stem:     0x3f7f44,
    leaf:     [0x4aa055, 0x5fbe6a, 0x3b8a48, 0x7ecf6a, 0x82b84a],
    flower:   [0xff6fa8, 0xffcf6b, 0xff9acb, 0xf7f3ea, 0xb88cff, 0xff8a5a, 0xffd94a, 0x8fd6ff, 0xffb0d0],
    mushroomCap:  [0xd8452a, 0xe67a3a, 0xc28adf, 0xf0c248, 0xeee6d0],
    mushroomStem: 0xf2ead0,
    stalk:    [0x6a9cff, 0x9bb8ff, 0x7fd0c0],
    daisy:    { petal: 0xffffff, centre: 0xf5c842, stem: 0x3d7a3a },
    allium:   [0xc084fc, 0xa855f7, 0x9333ea, 0xd8b4fe],
    tulip:    [0xff5f7e, 0xffa04a, 0xff8fb1, 0xfff4e0, 0xc77dff, 0xffd84a],
    sunflower:{ petal: [0xffc93c, 0xffb627], centre: 0x6b3e1f, stem: 0x4f8a3c },
    blossom:  [0xffc4d6, 0xffb0c8, 0xffe1ea, 0xff9ebb, 0xffd3e0],
    trunk:    0x7a5236,
    // shop flowers
    rose:     [0xd8283c, 0xe8455a, 0xf06a8a, 0xfff0e8],
    lavender: [0x9b7be0, 0xb595f0, 0x8565d0, 0xa98ae8],
    cactus:   [0x4f9a5a, 0x5fae68, 0x6aa86a],
    bonsaiLeaf: [0x3f7a45, 0x4a8a50, 0x356b3b],
    rainbow:  [0xff5f6d, 0xffa94d, 0xffe066, 0x69db7c, 0x4dabf7, 0xb197fc],
    fireflyCore: 0xffe8a0,
    fireflyGlow: 0xfff2c2,
  };

  // ---- Mood lighting presets (lerped every frame) ----
  const MOODS = {
    day: {
      key: [0xffe4b0, 1.9], front: [0xe0ecff, 0.95], fill: [0x9fb4ff, 0.45],
      amb: [0xc8c8d8, 1.15], hemi: [0xd8e4ff, 0x8a7050, 0.8], interior: [0xffe8c0, 0.9],
      rim: [0xffd8a8, 0.5], fog: 0xe6e8d6, exposure: 1.18, stars: 0, glow: 0.2,
    },
    dusk: {
      key: [0xffa070, 1.45], front: [0xffd0c8, 0.7], fill: [0xb090ff, 0.6],
      amb: [0xd0a8c0, 0.95], hemi: [0xffc0d0, 0x704060, 0.7], interior: [0xffc890, 1.4],
      rim: [0xff9080, 0.8], fog: 0xe0a8a4, exposure: 1.22, stars: 0.15, glow: 0.55,
    },
    night: {
      key: [0x8090ff, 0.35], front: [0x6070c0, 0.35], fill: [0x5060c0, 0.35],
      amb: [0x5050a0, 0.75], hemi: [0x6070c0, 0x302040, 0.35], interior: [0xffc878, 2.1],
      rim: [0x7080ff, 0.5], fog: 0x1a1d40, exposure: 1.4, stars: 1, glow: 1,
    },
  };

  let scene, camera, renderer, clock, container;
  let terrariumGroup, plantsGroup, fxGroup, critterGroup;
  const L = {};            // lights by name
  let starField;
  let moodName = 'day';
  const moodCur = { exposure: 1.18, stars: 0, glow: 0.2 };
  let postMat;             // brass frame (the golden-frame accent recolors it)

  const plants = [];       // live plant records (data + meshes)
  const particles = [];    // dust
  const fireflies = [];
  const butterflies = [];
  const sparkles = [];
  const petals = [];
  let rain = { on: false, amt: 0, cloud: null, drops: [], mat: null, cloudMat: null };
  let critters = { snail: null, ladybug: null, frog: null };
  let marker = null, markerId = null;
  let fireflyTarget = 0;

  // drag-to-turn
  let rotY = 0, rotTarget = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr, r) { return arr[((r ? r() : Math.random()) * arr.length) | 0]; }
  function R(r, a, b) { return a + r() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // one deterministic stream per (plant, level) so rebuilds look identical
  function rngFor(seed, k) { return mulberry32(seed * 131 + k * 7919 + 1); }

  // ---- Geometry / material caches ----
  const geoCache = {};
  function geo(w, h, d) {
    const k = w + '|' + h + '|' + d;
    return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d));
  }
  const matCache = {};
  function mat(hex) {
    return matCache[hex] || (matCache[hex] = new THREE.MeshLambertMaterial({ color: hex }));
  }
  const WILT = new THREE.Color(0x9a7a4e);
  const wiltCache = {};
  function wiltHex(hex) {
    if (wiltCache[hex] == null) {
      const c = new THREE.Color(hex); c.lerp(WILT, 0.72); c.multiplyScalar(0.9);
      wiltCache[hex] = c.getHex();
    }
    return wiltCache[hex];
  }

  // ---- Init scene ----
  function init(el) {
    container = el;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(MOODS.day.fog, 0.014);

    const w = container.clientWidth, h = container.clientHeight;
    camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 200);
    positionCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // --- Lighting --- (colors/intensities driven by mood)
    L.key = new THREE.DirectionalLight(0xffffff, 1);
    L.key.position.set(8, 10, 6);
    L.key.castShadow = true;
    L.key.shadow.mapSize.set(2048, 2048);
    Object.assign(L.key.shadow.camera, { near: 1, far: 50, left: -12, right: 12, top: 12, bottom: -12 });
    L.key.shadow.bias = -0.001;
    L.front = new THREE.DirectionalLight(0xffffff, 1); L.front.position.set(0, 4, 18);
    L.fill = new THREE.DirectionalLight(0xffffff, 1);  L.fill.position.set(-8, 8, 4);
    L.amb = new THREE.AmbientLight(0xffffff, 1);
    L.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    L.interior = new THREE.PointLight(0xffffff, 1, 14, 1.5); L.interior.position.set(0, 2.2 - BOX_H / 2 + 3, 0);
    L.rim = new THREE.DirectionalLight(0xffffff, 1); L.rim.position.set(0, 6, -14);
    Object.values(L).forEach(l => scene.add(l));
    applyMoodInstant('day');

    terrariumGroup = new THREE.Group();
    terrariumGroup.position.y = 2.2;
    scene.add(terrariumGroup);

    buildBase();
    buildGlass();
    buildSoil();

    plantsGroup = new THREE.Group();
    fxGroup = new THREE.Group();
    critterGroup = new THREE.Group();
    terrariumGroup.add(plantsGroup, fxGroup, critterGroup);

    buildDust();
    buildStars();
    buildRain();

    window.addEventListener('resize', onResize);
    bindPointer();
    animate();
  }

  // Fit the jar into the open space between the side panels and above the timer card.
  function positionCamera() {
    const W = container.clientWidth, H = container.clientHeight;
    const wide = W > 980;
    const timerH = wide ? 300 : 290;                       // timer card + gap, px
    const top = wide ? 64 : 70;
    const availH = Math.max(0.3, (H - timerH - top) / H);
    const availW = wide ? Math.max(0.36, (W - 2 * 340) / W) : 0.9;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const jarH = 13.4, jarW = 11.6;          // includes critters on the lid
    const dist = Math.max(jarH / (2 * tanH * availH), jarW / (2 * tanH * camera.aspect * availW));
    const viewH = 2 * tanH * dist;
    const jarCenterY = 2.2 + 0.3;
    const centerFrac = (top + availH * H / 2) / H;            // where the jar's middle should sit
    const lookY = jarCenterY - (0.5 - centerFrac) * viewH;
    camera.position.set(0, lookY + dist * 0.16, dist);
    camera.lookAt(0, lookY, 0);
    if (scene) scene.fog.density = 0.012 * 26 / dist;
  }

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    positionCamera();
    renderer.setSize(w, h);
  }

  // --- Wooden base ---
  function buildBase() {
    const baseH = 0.55, baseW = BOX_W + 1.2, baseD = BOX_D + 1.2;
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.9 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x6a4228, roughness: 0.95 });

    const top = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseD), wood);
    top.position.y = -BOX_H / 2 - baseH / 2 + 0.01;
    top.receiveShadow = true;
    terrariumGroup.add(top);

    const lip = new THREE.Mesh(new THREE.BoxGeometry(baseW - 0.15, 0.1, baseD - 0.15), woodDark);
    lip.position.y = top.position.y + baseH / 2 + 0.05;
    lip.receiveShadow = true;
    terrariumGroup.add(lip);

    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.35), woodDark);
      foot.position.set(sx * (baseW / 2 - 0.4), top.position.y - baseH / 2 - 0.12, sz * (baseD / 2 - 0.4));
      terrariumGroup.add(foot);
    });
  }

  // --- Glass box with brass frame ---
  function buildGlass() {
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd0e8f0, transparent: true, opacity: 0.1, roughness: 0.05,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D), glassMat);
    box.renderOrder = 10;
    terrariumGroup.add(box);

    postMat = new THREE.MeshStandardMaterial({ color: 0xc8975a, roughness: 0.35, metalness: 0.65 });
    const postGeo = new THREE.BoxGeometry(0.2, BOX_H + 0.05, 0.2);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(sx * BOX_W / 2, 0, sz * BOX_D / 2);
      terrariumGroup.add(p);
    });
    const hGeoX = new THREE.BoxGeometry(BOX_W + 0.05, 0.2, 0.2);
    const hGeoZ = new THREE.BoxGeometry(0.2, 0.2, BOX_D + 0.05);
    [BOX_H / 2, -BOX_H / 2].forEach(y => {
      [BOX_D / 2, -BOX_D / 2].forEach(z => {
        const b = new THREE.Mesh(hGeoX, postMat); b.position.set(0, y, z); terrariumGroup.add(b);
      });
      [BOX_W / 2, -BOX_W / 2].forEach(x => {
        const b = new THREE.Mesh(hGeoZ, postMat); b.position.set(x, y, 0); terrariumGroup.add(b);
      });
    });
    // little brass handle on the lid
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), postMat);
    knob.position.set(0, BOX_H / 2 + 0.2, 0);
    terrariumGroup.add(knob);
    const knob2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), postMat);
    knob2.position.set(0, BOX_H / 2 + 0.42, 0);
    terrariumGroup.add(knob2);
  }

  // --- Voxel soil ---
  function buildSoil() {
    const r = mulberry32(42);
    const soilY = -BOX_H / 2 + VOX / 2;
    for (let ix = 0; ix < BOX_W; ix++) {
      for (let iz = 0; iz < BOX_D; iz++) {
        const hex = r() < 0.18 ? COL.soilDark : (r() < 0.1 ? COL.soilSpeck : COL.soil);
        const v = new THREE.Mesh(geo(VOX, VOX, VOX), mat(hex));
        v.position.set(cellX(ix), soilY, cellZ(iz));
        v.receiveShadow = true;
        terrariumGroup.add(v);
      }
    }
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(geo(0.45, 0.25, 0.4), mat(COL.pebble));
      p.position.set(R(r, -BOX_W / 2 + 0.4, BOX_W / 2 - 0.4), soilY + 0.6, R(r, -BOX_D / 2 + 0.4, BOX_D / 2 - 0.4));
      p.rotation.y = R(r, 0, Math.PI);
      p.castShadow = true;
      terrariumGroup.add(p);
    }
  }
  function cellX(ix) { return -BOX_W / 2 + VOX / 2 + ix; }
  function cellZ(iz) { return -BOX_D / 2 + VOX / 2 + iz; }

  function buildDust() {
    const m = new THREE.MeshBasicMaterial({ color: 0xffeecc, transparent: true, opacity: 0.4 });
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Mesh(geo(0.04, 0.04, 0.04), m);
      s.position.set(rand(-BOX_W / 2 + 0.5, BOX_W / 2 - 0.5), rand(-BOX_H / 2 + 1.5, BOX_H / 2 - 1), rand(-BOX_D / 2 + 0.5, BOX_D / 2 - 0.5));
      fxGroup.add(s);
      particles.push({ mesh: s, base: s.position.clone(), phase: Math.random() * 6.28, speed: rand(0.2, 0.5) });
    }
  }

  function buildStars() {
    const n = 380, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-70, 70);
      pos[i * 3 + 1] = rand(-12, 40);
      pos[i * 3 + 2] = rand(-60, -25);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starField = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xfff6e0, size: 0.32, transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    scene.add(starField);
  }

  // --- Rain cloud (short breaks) ---
  function buildRain() {
    rain.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    rain.mat = new THREE.MeshBasicMaterial({ color: 0x9cc8ff, transparent: true, opacity: 0, depthWrite: false });
    const cloud = new THREE.Group();
    [[0, 0, 0, 1.2], [0.95, -0.1, 0.1, 0.95], [-0.95, -0.05, -0.1, 1.0], [0.45, 0.5, 0, 0.85],
     [-0.45, 0.45, 0.1, 0.8], [1.7, -0.2, 0, 0.6], [-1.75, -0.2, 0.05, 0.62], [0, -0.3, 0.45, 0.8]]
      .forEach(([x, y, z, s]) => {
        const c = new THREE.Mesh(geo(s, s * 0.8, s), rain.cloudMat);
        c.position.set(x, y, z);
        cloud.add(c);
      });
    cloud.position.set(0, BOX_H / 2 - 1.4, 0);
    cloud.visible = false;
    fxGroup.add(cloud);
    rain.cloud = cloud;
    for (let i = 0; i < 70; i++) {
      const d = new THREE.Mesh(geo(0.05, 0.32, 0.05), rain.mat);
      d.visible = false;
      fxGroup.add(d);
      rain.drops.push({ mesh: d, v: rand(5, 7) });
      resetDrop(rain.drops[i], true);
    }
  }
  function resetDrop(d, scatter) {
    const cx = rain.cloud ? rain.cloud.position.x : 0;
    d.mesh.position.set(cx + rand(-1.9, 1.9), scatter ? rand(SOIL_TOP, BOX_H / 2 - 2) : BOX_H / 2 - 1.9, rand(-0.8, 0.8));
  }

  // =========================================================
  // Plants
  // =========================================================
  function add(p, hex, w, h, d, x, y, z, ry, rz, rx) {
    const mesh = new THREE.Mesh(geo(w, h, d), mat(p.state === 'wilted' ? wiltHex(hex) : hex));
    mesh.position.set(x || 0, y, z || 0);
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    if (rx) mesh.rotation.x = rx;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.hex = hex;
    mesh.scale.setScalar(0.001);
    p.group.add(mesh);
    p.blocks.push({ mesh, age: 0, delay: p.popDelay || 0 });
    return mesh;
  }
  const yAt = lv => VOX / 2 + lv * VOX;

  // self-lit blocks (moonflower, lantern) that brighten as the sky darkens
  const glowMats = {};
  function glowMat(hex) {
    return glowMats[hex] || (glowMats[hex] = new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.2 }));
  }
  function addGlow(p, hex, w, h, d, x, y, z, ry) {
    const m = add(p, hex, w, h, d, x, y, z, ry);
    m.material = glowMat(hex);
    m.userData.glow = true;
    return m;
  }
  function halo(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(size);
    return s;
  }
  // flytrap jaws: two plates hinged at the back, opening toward the viewer
  function trap(p, x, y, z, s) {
    [[1, -0.5], [-1, 0.5]].forEach(([dir, rx]) => {
      add(p, 0x6fbf4a, 0.44 * s, 0.06, 0.34 * s, x, y + dir * 0.1 * s, z + 0.12 * s, 0, 0, rx);
      add(p, 0xd8434a, 0.36 * s, 0.03, 0.28 * s, x, y + dir * 0.065 * s, z + 0.12 * s, 0, 0, rx);
      for (let i = 0; i < 4; i++) add(p, 0xe8f5c8, 0.04, 0.08, 0.04, x - 0.15 * s + i * 0.1 * s, y + dir * 0.24 * s, z + 0.27 * s);
    });
  }

  // two little seed leaves on the first level of stemmed plants
  function sproutLeaves(p, r, hex) {
    const a = R(r, 0, Math.PI);
    add(p, hex, 0.5, 0.1, 0.22, 0, 0.62, 0, a, 0.25);
    add(p, hex, 0.5, 0.1, 0.22, 0, 0.62, 0, a + Math.PI, 0.25);
  }

  // Each species: level(p, lv, rng) builds one voxel layer, crown(p, rng) the bloom.
  const SPECIES = {
    moss: {
      label: 'Moss tuft',
      level(p, lv, r) {
        add(p, pick(COL.moss, r), 0.95, 0.8, 0.95, 0, 0.4 + lv * 0.8, 0);
        if (r() < 0.7) add(p, pick(COL.moss, r), 0.5, 0.4, 0.5, R(r, -0.3, 0.3), 0.85 + lv * 0.8, R(r, -0.3, 0.3));
      },
      crown(p, r) {
        const top = 0.8 * p.h + 0.15;
        for (let i = 0; i < 2; i++) add(p, pick(COL.flower, r), 0.22, 0.22, 0.22, R(r, -0.3, 0.3), top, R(r, -0.3, 0.3));
      },
    },
    mushroom: {
      label: 'Mushroom',
      level(p) { add(p, COL.mushroomStem, 0.35, 0.5, 0.35, 0, 0.25, 0); },
      crown(p, r) {
        add(p, p.tint, 0.85, 0.35, 0.85, 0, 0.62, 0);
        add(p, p.tint, 0.5, 0.2, 0.5, 0, 0.86, 0);
        for (let i = 0; i < 3; i++) add(p, 0xffffff, 0.16, 0.08, 0.16, R(r, -0.3, 0.3), 0.81, R(r, -0.3, 0.3));
        // a baby mushroom beside it
        const bx = r() < 0.5 ? 0.38 : -0.38;
        add(p, COL.mushroomStem, 0.16, 0.24, 0.16, bx, 0.12, 0.3);
        add(p, p.tint, 0.36, 0.16, 0.36, bx, 0.3, 0.3);
      },
    },
    fern: {
      label: 'Fern',
      level(p, lv, r) {
        add(p, COL.stem, 0.22, 1, 0.22, 0, yAt(lv), 0);
        if (lv === 0) sproutLeaves(p, r, p.tint);
        else add(p, p.tint, 1.3, 0.18, 0.4, 0, yAt(lv) + R(r, -0.05, 0.05), 0, R(r, 0, Math.PI));
      },
      crown(p, r) {
        const y = yAt(p.h - 1) + 0.35;
        add(p, p.tint, 1.2, 0.18, 0.36, 0, y, 0, R(r, -0.3, 0.3));
        add(p, p.tint, 1.2, 0.18, 0.36, 0, y, 0, Math.PI / 2 + R(r, -0.3, 0.3));
        add(p, p.tint, 0.3, 0.3, 0.3, 0, y + 0.35, 0);
      },
    },
    flower: {
      label: 'Wildflower',
      level(p, lv, r) {
        add(p, COL.stem, 0.2, 1, 0.2, 0, yAt(lv), 0);
        if (lv === 0) sproutLeaves(p, r, 0x5fbe6a);
        if (lv === 1 || lv === 2) add(p, 0x5fbe6a, 0.8, 0.18, 0.26, 0, yAt(lv), 0, R(r, 0, Math.PI));
      },
      crown(p) {
        const y = yAt(p.h - 1) + 0.6;
        add(p, p.tint, 0.95, 0.2, 0.32, 0, y, 0);
        add(p, p.tint, 0.95, 0.2, 0.32, 0, y, 0, Math.PI / 2);
        add(p, 0xffe27a, 0.36, 0.3, 0.36, 0, y + 0.08, 0);
      },
    },
    stalk: {
      label: 'Bluebell stalk',
      level(p, lv, r) {
        add(p, p.tint, 0.3, 1, 0.3, 0, yAt(lv), 0);
        if (lv === 0) sproutLeaves(p, r, 0x5fbe6a);
        else if (lv % 2 === 1) add(p, p.tint, 0.9, 0.16, 0.3, 0, yAt(lv), 0, R(r, 0, Math.PI));
      },
      crown(p) {
        const y = yAt(p.h - 1) + 0.75;
        add(p, p.tint2, 0.6, 0.6, 0.6, 0, y, 0);
        add(p, p.tint2, 0.3, 0.3, 0.3, 0, y + 0.45, 0);
      },
    },
    daisy: {
      label: 'Daisy',
      level(p, lv, r) {
        add(p, COL.daisy.stem, 0.18, 1, 0.18, 0, yAt(lv), 0);
        if (lv === 0) sproutLeaves(p, r, 0x6fbf5a);
      },
      crown(p) {
        const y = yAt(p.h - 1) + 0.56;
        add(p, COL.daisy.centre, 0.38, 0.34, 0.38, 0, y + 0.04, 0);
        for (let i = 0; i < 4; i++) add(p, COL.daisy.petal, 0.8, 0.13, 0.22, 0, y, 0, (Math.PI / 4) * i);
      },
    },
    allium: {
      label: 'Allium',
      level(p, lv, r) {
        add(p, 0x4a7c4e, 0.16, 1, 0.16, 0, yAt(lv), 0);
        if (lv === 0) sproutLeaves(p, r, 0x5a9c5e);
      },
      crown(p, r) {
        const y = yAt(p.h - 1) + 0.8;
        const offs = [[0, 0, 0], [0.26, 0, 0], [-0.26, 0, 0], [0, 0, 0.26], [0, 0, -0.26], [0, 0.26, 0],
          [0.18, 0.16, 0.18], [-0.18, 0.16, 0.18], [0.18, 0.16, -0.18], [-0.18, 0.16, -0.18],
          [0.18, -0.16, 0.18], [-0.18, -0.16, -0.18], [0, -0.24, 0]];
        offs.forEach(([x, oy, z]) => add(p, pick(COL.allium, r), 0.24, 0.24, 0.24, x, y + oy, z));
      },
    },
    tulip: {
      label: 'Tulip',
      level(p, lv, r) {
        add(p, 0x4f9a4a, 0.18, 1, 0.18, 0, yAt(lv), 0);
        if (lv === 0) {
          const a = R(r, 0, Math.PI);
          const l1 = add(p, 0x5aac55, 0.16, 0.9, 0.36, 0.16, 0.45, 0, a, -0.3);
          const l2 = add(p, 0x5aac55, 0.16, 0.8, 0.36, -0.16, 0.42, 0, a, 0.3);
          l1.position.x = Math.cos(a) * 0.16; l1.position.z = -Math.sin(a) * 0.16;
          l2.position.x = -Math.cos(a) * 0.16; l2.position.z = Math.sin(a) * 0.16;
        }
      },
      crown(p) {
        const y = yAt(p.h - 1) + 0.75;
        add(p, p.tint, 0.46, 0.16, 0.46, 0, y - 0.22, 0);
        add(p, p.tint, 0.14, 0.56, 0.46, 0.2, y, 0);
        add(p, p.tint, 0.14, 0.56, 0.46, -0.2, y, 0);
        add(p, p.tint, 0.46, 0.5, 0.14, 0, y - 0.03, 0.2);
        add(p, p.tint, 0.46, 0.5, 0.14, 0, y - 0.03, -0.2);
      },
    },
    sunflower: {
      label: 'Sunflower',
      level(p, lv, r) {
        add(p, COL.sunflower.stem, 0.26, 1, 0.26, 0, yAt(lv), 0);
        if (lv === 0) sproutLeaves(p, r, 0x6aac4a);
        else if (lv % 2 === 0) add(p, 0x5f9e45, 1.0, 0.15, 0.42, 0, yAt(lv), 0, R(r, 0, Math.PI));
      },
      crown(p, r) {
        const y = yAt(p.h - 1) + 0.9;
        add(p, COL.sunflower.centre, 0.66, 0.66, 0.22, 0, y, 0.12);
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i;
          add(p, pick(COL.sunflower.petal, r), 0.3, 0.3, 0.12, Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, 0.08);
        }
      },
    },
    tree: {
      label: 'Cherry blossom',
      level(p, lv, r) {
        add(p, COL.trunk, 0.42, 1, 0.42, 0, yAt(lv), 0);
        if (lv === 0) sproutLeaves(p, r, 0x6fbf73);
        if (lv >= 2 && r() < 0.6) {
          const a = R(r, 0, Math.PI * 2);
          add(p, COL.trunk, 0.6, 0.16, 0.16, Math.cos(a) * 0.32, yAt(lv) + 0.2, -Math.sin(a) * 0.32, a, 0.4);
        }
      },
      crown(p, r) {
        const y = yAt(p.h - 1) + 0.7;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          if (Math.abs(dx) + Math.abs(dz) === 2 && r() < 0.35) continue;
          add(p, r() < 0.12 ? 0x7cc47a : pick(COL.blossom, r), 0.88, 0.8, 0.88, dx * 0.82, y + R(r, -0.1, 0.1), dz * 0.82);
        }
        [[0, 0], [0.75, 0], [-0.75, 0], [0, 0.75], [0, -0.75]].forEach(([x, z]) =>
          add(p, pick(COL.blossom, r), 0.82, 0.72, 0.82, x, y + 0.72, z));
        add(p, pick(COL.blossom, r), 0.7, 0.55, 0.7, 0, y + 1.32, 0);
        p.petalTimer = rand(1, 3);
      },
    },

    // ---- shop-only species ----
    rose: {
      label: 'Velvet rose',
      level(p, lv, r) {
        add(p, 0x2f6b38, 0.18, 1, 0.18, 0, yAt(lv), 0);
        if (lv === 0) sproutLeaves(p, r, 0x4a8f4a);
        if (lv === 1) add(p, 0x3f8a48, 0.7, 0.14, 0.3, 0, yAt(lv), 0, R(r, 0, Math.PI));
        if (lv >= 1) add(p, 0x7a4a3a, 0.12, 0.07, 0.07, 0.12, yAt(lv) + R(r, -0.3, 0.3), 0);   // thorn
      },
      crown(p) {
        const y = yAt(p.h - 1) + 0.62;
        add(p, 0x3f8a48, 0.5, 0.1, 0.5, 0, y - 0.3, 0, Math.PI / 4);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + 0.4;
          add(p, p.tint, 0.3, 0.36, 0.3, Math.cos(a) * 0.2, y - 0.04, Math.sin(a) * 0.2, a);
        }
        add(p, p.tint2 || p.tint, 0.34, 0.44, 0.34, 0, y + 0.04, 0, 0.35);
        add(p, p.tint, 0.2, 0.16, 0.2, 0, y + 0.3, 0, 0.8);
      },
    },
    lavender: {
      label: 'Lavender',
      level(p, lv, r) {
        [[-0.22, 0.05], [0.2, -0.12], [0.02, 0.22]].forEach(([x, z], i) => {
          if (lv < p.h - (i === 0 ? 1 : 0)) add(p, 0x6f9a6a, 0.08, 1, 0.08, x, yAt(lv), z);
        });
        if (lv === 0) {
          add(p, 0x7fae78, 0.6, 0.1, 0.14, 0, 0.3, 0, R(r, 0, 3));
          add(p, 0x7fae78, 0.6, 0.1, 0.14, 0, 0.36, 0, R(r, 0, 3));
        }
      },
      crown(p, r) {
        [[-0.22, 0.05, -1], [0.2, -0.12, 0], [0.02, 0.22, 0]].forEach(([x, z, d]) => {
          const top = yAt(p.h - 1 + d) + 0.5;
          for (let k = 0; k < 4; k++) {
            const s = 0.2 - k * 0.03;
            add(p, pick(COL.lavender, r), s, 0.18, s, x, top + 0.08 + k * 0.17, z);
          }
        });
      },
    },
    cactus: {
      label: 'Blooming cactus',
      level(p, lv, r) {
        const w = lv === 0 ? 0.62 : 0.54;
        add(p, p.tint, w, 1, w, 0, yAt(lv), 0);
        add(p, 0x3d7f48, 0.12, 0.92, w + 0.03, 0, yAt(lv), 0);
        if (lv === 1) {
          const s = r() < 0.5 ? 1 : -1;
          add(p, p.tint, 0.36, 0.28, 0.3, s * 0.42, yAt(lv) - 0.1, 0);
          add(p, p.tint, 0.28, 0.55, 0.28, s * 0.58, yAt(lv) + 0.22, 0);
        }
        for (let i = 0; i < 3; i++) add(p, 0xf4f0d8, 0.05, 0.05, 0.05, R(r, -0.25, 0.25), yAt(lv) + R(r, -0.4, 0.4), w / 2 + 0.02);
      },
      crown(p) {
        const y = yAt(p.h - 1) + 0.58;
        for (let i = 0; i < 4; i++) add(p, 0xffa8cc, 0.38, 0.1, 0.14, 0, y - 0.02, 0, i * Math.PI / 4);
        add(p, 0xff7fb0, 0.2, 0.16, 0.2, 0, y + 0.03, 0);
        add(p, 0xffe27a, 0.09, 0.09, 0.09, 0, y + 0.13, 0);
      },
    },
    lily: {
      label: 'Lily of the valley',
      level(p, lv) {
        add(p, 0x4f8f4a, 0.12, 1, 0.12, 0, yAt(lv), 0);
        if (lv === 0) {
          add(p, 0x5fae5a, 0.34, 0.9, 0.12, -0.2, 0.45, 0.05, 0, 0.25);
          add(p, 0x4f9e4f, 0.34, 1.1, 0.12, 0.2, 0.55, -0.05, 0, -0.2);
        }
      },
      crown(p) {
        const y = yAt(p.h - 1) + 0.5;
        add(p, 0x4f8f4a, 0.9, 0.1, 0.1, 0.4, y, 0);
        [0.15, 0.45, 0.75].forEach((x, i) => {
          add(p, 0x4f8f4a, 0.04, 0.14, 0.04, x, y - 0.1, 0);
          add(p, 0xfdfdf5, 0.18, 0.18, 0.18, x, y - 0.24 - i * 0.04, 0);
          add(p, 0xfdfdf5, 0.24, 0.05, 0.24, x, y - 0.34 - i * 0.04, 0);
        });
      },
    },
    moonflower: {
      label: 'Moonflower',
      level(p, lv, r) {
        add(p, 0x3f6f5a, 0.16, 1, 0.16, 0, yAt(lv), 0);
        if (lv === 0) sproutLeaves(p, r, 0x5a8f7a);
        else add(p, 0x4f8f72, 0.7, 0.12, 0.3, 0, yAt(lv), 0, R(r, 0, Math.PI));
      },
      crown(p) {
        const y = yAt(p.h - 1) + 0.62;
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5;
          addGlow(p, 0xdde8ff, 0.34, 0.1, 0.34, Math.cos(a) * 0.28, y, Math.sin(a) * 0.28, a);
        }
        addGlow(p, 0xfff4c0, 0.22, 0.2, 0.22, 0, y + 0.05, 0);
        p.halo = halo(0xcfe0ff, 2.4);
        p.halo.position.set(0, y + 0.1, 0);
        p.group.add(p.halo);
      },
    },
    bonsai: {
      label: 'Bonsai pine',
      level(p, lv, r) {
        add(p, 0x6a4a32, 0.32, 1, 0.32, [0, 0.12, -0.05][lv] || 0, yAt(lv), 0, 0, lv === 1 ? -0.15 : lv === 2 ? 0.12 : 0);
        if (lv === 1) {
          add(p, 0x6a4a32, 0.5, 0.14, 0.14, -0.3, yAt(lv) + 0.2, 0, 0, 0.3);
          add(p, pick(COL.bonsaiLeaf, r), 0.6, 0.25, 0.5, -0.6, yAt(lv) + 0.42, 0);
        }
      },
      crown(p, r) {
        const y = yAt(p.h - 1) + 0.55;
        [[0.1, 0, 0, 1.2, 0.3, 0.9], [0.45, 0.22, 0.1, 0.7, 0.26, 0.6], [-0.2, 0.32, -0.1, 0.7, 0.24, 0.6], [0.05, 0.52, 0, 0.5, 0.22, 0.45]]
          .forEach(([x, dy, z, w, h, d]) => add(p, pick(COL.bonsaiLeaf, r), w, h, d, x, y + dy, z));
      },
    },
    flytrap: {
      label: 'Venus flytrap',
      level(p, lv, r) {
        if (lv === 0) {
          for (let i = 0; i < 5; i++) {
            const a = i * Math.PI * 2 / 5 + R(r, 0, 0.3);
            add(p, 0x5fae4a, 0.5, 0.08, 0.18, Math.cos(a) * 0.22, 0.05, -Math.sin(a) * 0.22, a);
          }
          add(p, 0x5f9e45, 0.1, 0.6, 0.1, 0, 0.3, 0);
        } else add(p, 0x5f9e45, 0.1, 1, 0.1, 0, yAt(lv) - 0.2, 0);
      },
      crown(p) {
        const y = yAt(p.h - 1) + 0.4;
        trap(p, 0, y, 0, 1);
        add(p, 0x5f9e45, 0.36, 0.08, 0.08, 0.2, 0.5, 0, 0, 0.6);
        trap(p, 0.4, 0.68, 0, 0.65);
      },
    },
    rainbow: {
      label: 'Rainbow tulip',
      level(p, lv, r) { SPECIES.tulip.level(p, lv, r); },
      crown(p) {
        // stacked color bands, red at the base up to violet tips
        const y0 = yAt(p.h - 1) + 0.45, c = COL.rainbow;
        add(p, c[0], 0.42, 0.12, 0.42, 0, y0, 0);
        for (let k = 1; k < 6; k++) {
          const y = y0 + k * 0.11, w = 0.46 + Math.sin(k / 5 * Math.PI) * 0.06;
          add(p, c[k], 0.13, 0.12, w, w / 2 - 0.06, y, 0);
          add(p, c[k], 0.13, 0.12, w, -w / 2 + 0.06, y, 0);
          add(p, c[k], w, 0.12, 0.13, 0, y, w / 2 - 0.06);
          add(p, c[k], w, 0.12, 0.13, 0, y, -w / 2 + 0.06);
        }
      },
    },
  };

  const FOCUS_KINDS = ['fern', 'flower', 'stalk', 'daisy', 'allium', 'tulip', 'sunflower'];
  const TASK_KINDS = ['mushroom', 'moss', 'daisy', 'tulip', 'mushroom', 'flower'];

  function heightFor(kind, r) {
    switch (kind) {
      case 'moss': return 1 + ((r() * 2) | 0);
      case 'mushroom': return 1;
      case 'fern': return 4 + ((r() * 3) | 0);
      case 'flower': return 3 + ((r() * 3) | 0);
      case 'stalk': return 5 + ((r() * 3) | 0);
      case 'daisy': return 2 + ((r() * 3) | 0);
      case 'allium': return 5 + ((r() * 2) | 0);
      case 'tulip': return 2 + ((r() * 2) | 0);
      case 'sunflower': return 6 + ((r() * 2) | 0);
      case 'tree': return 5;
      case 'rose': return 3 + ((r() * 2) | 0);
      case 'cactus': return 2 + ((r() * 2) | 0);
      case 'moonflower': return 4;
      case 'flytrap': return 2;
    }
    return 3;
  }
  function tintsFor(kind, r) {
    switch (kind) {
      case 'mushroom': return [pick(COL.mushroomCap, r)];
      case 'fern': return [pick(COL.leaf, r)];
      case 'flower': return [pick(COL.flower, r)];
      case 'stalk': return [pick(COL.stalk, r), pick(COL.flower, r)];
      case 'tulip': return [pick(COL.tulip, r)];
      case 'rose': { const c = pick(COL.rose, r); return [c, c === 0xd8283c ? 0xa01828 : c]; }
      case 'cactus': return [pick(COL.cactus, r)];
    }
    return [0];
  }

  function occupied() {
    const s = new Set();
    plants.forEach(p => s.add(p.gx + ',' + p.gz));
    return s;
  }
  function freeCells() {
    const occ = occupied(), out = [];
    for (let x = 0; x < BOX_W; x++) for (let z = 0; z < BOX_D; z++) if (!occ.has(x + ',' + z)) out.push({ x, z });
    return out;
  }

  // tall things go to the back, small things to the front, trees away from the glass
  function chooseCell(kind, h) {
    let cells = freeCells();
    if (kind === 'tree') cells = cells.filter(c => c.x >= 1 && c.x <= BOX_W - 2 && c.z >= 1 && c.z <= 2);
    if (!cells.length) return null;
    const weights = cells.map(c => {
      const back = 1 - c.z / (BOX_D - 1);
      return h >= 4 ? 0.25 + back * back * 2 : 0.25 + (1 - back) * 1.5;
    });
    let t = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cells.length; i++) { t -= weights[i]; if (t <= 0) return cells[i]; }
    return cells[cells.length - 1];
  }

  let nextId = 1;
  function makePlant(data) {
    const group = new THREE.Group();
    group.position.set(cellX(data.gx), SOIL_TOP, cellZ(data.gz));
    group.userData.plantId = data.id;
    plantsGroup.add(group);
    const p = Object.assign({
      levels: 0, bloomed: false, state: 'alive', meta: {},
    }, data, {
      group, blocks: [], built: 0, crownBuilt: false,
      sway: Math.random() * 6.28, droop: data.state === 'wilted' ? 1 : 0,
      droopDir: (data.seed % 2) ? 1 : -1, popDelay: 0,
    });
    nextId = Math.max(nextId, data.id + 1);
    plants.push(p);
    return p;
  }
  function buildTo(p, levels, crown) {
    const sp = SPECIES[p.kind];
    while (p.built < Math.min(levels, p.h)) { sp.level(p, p.built, rngFor(p.seed, p.built)); p.built++; }
    if (crown && !p.crownBuilt) { sp.crown(p, rngFor(p.seed, 99)); p.crownBuilt = true; }
    p.levels = p.built;
    p.bloomed = p.crownBuilt;
  }
  function find(id) { return plants.find(p => p.id === id); }
  function topY(p) { return p.kind === 'moss' ? 0.8 * p.built : p.built * VOX; }

  // --- Public plant API ---
  function load(list) {
    clearPlants();
    (list || []).forEach((d, i) => {
      const p = makePlant(d);
      p.popDelay = 0.25 + i * 0.06;   // garden "wakes up" plant by plant
      buildTo(p, d.levels, d.bloomed);
      p.popDelay = 0;
    });
  }

  // kind may be 'focus' | 'task' | 'tree' | explicit species
  function plantSeed(kind, meta, opts) {
    opts = opts || {};
    if (kind === 'focus') kind = opts.long && Math.random() < 0.5 ? 'sunflower' : pick(FOCUS_KINDS);
    else if (kind === 'task') kind = pick(TASK_KINDS);
    const seed = (Math.random() * 1e9) | 0;
    const r = mulberry32(seed);
    const h = heightFor(kind, r);
    let cell = chooseCell(kind, h);
    if (!cell && kind === 'tree') { kind = 'sunflower'; cell = chooseCell(kind, 7); }
    if (!cell) return null;
    const [tint, tint2] = tintsFor(kind, r);
    const p = makePlant({
      id: nextId++, gx: cell.x, gz: cell.z, kind, h: kind === 'sunflower' ? Math.max(h, 6) : h,
      seed, tint, tint2, state: opts.instant ? 'alive' : 'growing', meta: meta || {},
    });
    if (opts.instant) { buildTo(p, p.h, true); burst(p, 14); }
    else buildTo(p, 1, false);
    return serializeOne(p);
  }

  // grow a focus plant to match the timer's progress (0..1). Returns true if a level was added.
  function setGrowth(id, progress) {
    const p = find(id);
    if (!p || p.state !== 'growing') return false;
    const want = clamp(1 + Math.floor(progress * (p.h - 1) + 0.0001), 1, p.h);
    if (want > p.built) { buildTo(p, want, false); return true; }
    return false;
  }

  function bloom(id) {
    const p = find(id);
    if (!p) return null;
    p.state = 'alive';
    buildTo(p, p.h, true);
    burst(p, 26);
    if (moodName === 'day') spawnButterfly(p);
    return serializeOne(p);
  }

  function wilt(id) {
    const p = find(id);
    if (!p) return;
    p.state = 'wilted';
    p.blocks.forEach(b => { b.mesh.material = mat(wiltHex(b.mesh.userData.hex)); });
  }

  function revive(id) {
    const p = find(id);
    if (!p) return null;
    p.state = 'alive';
    p.blocks.forEach(b => { b.mesh.material = b.mesh.userData.glow ? glowMat(b.mesh.userData.hex) : mat(b.mesh.userData.hex); });
    buildTo(p, p.h, true);
    burst(p, 22, 0x9fd8ff);
    return serializeOne(p);
  }

  function remove(id) {
    const p = find(id);
    if (!p) return;
    plantsGroup.remove(p.group);
    plants.splice(plants.indexOf(p), 1);
    if (markerId === id) setMarker(null);
  }

  function clearPlants() {
    plants.forEach(p => plantsGroup.remove(p.group));
    plants.length = 0;
    setMarker(null);
  }

  function serializeOne(p) {
    return {
      id: p.id, gx: p.gx, gz: p.gz, kind: p.kind, h: p.h, seed: p.seed,
      tint: p.tint, tint2: p.tint2, levels: p.built, bloomed: p.crownBuilt,
      state: p.state, meta: p.meta,
    };
  }
  function serialize() { return plants.map(serializeOne); }
  function speciesLabel(kind) { return SPECIES[kind] ? SPECIES[kind].label : kind; }

  // --- Glowing seed marker above the plant you're growing ---
  function setMarker(id) {
    markerId = id;
    if (!marker) {
      marker = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xd8ffb0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      marker.scale.setScalar(0.8);
      const core = new THREE.Mesh(geo(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0xf4ffd8 }));
      marker.add(core);
      fxGroup.add(marker);
    }
    marker.visible = id != null;
  }

  // --- Sparkle burst ---
  function burst(p, n, color) {
    burstAt(new THREE.Vector3(cellX(p.gx), SOIL_TOP + topY(p) * 0.6 + 0.4, cellZ(p.gz)), n, color, topY(p) * 0.5);
  }
  function burstAt(base, n, color, rise) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial({
        color: color || pick([0xfff2a8, 0xffffff, 0xffc8e0, 0xc8ffb0]), transparent: true,
      }));
      m.position.copy(base).add(new THREE.Vector3(rand(-0.3, 0.3), rand(0, rise || 0.3), rand(-0.3, 0.3)));
      fxGroup.add(m);
      sparkles.push({ mesh: m, v: new THREE.Vector3(rand(-1.2, 1.2), rand(1.2, 3.2), rand(-1.2, 1.2)), life: 0, max: rand(0.9, 1.6) });
    }
  }

  // =========================================================
  // Critters
  // =========================================================
  function part(g, hex, w, h, d, x, y, z) {
    const m = new THREE.Mesh(geo(w, h, d), mat(hex));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }

  function makeSnail() {
    const g = new THREE.Group();
    part(g, 0xc8bf98, 0.9, 0.2, 0.3, 0, 0.1, 0);
    part(g, 0xc8bf98, 0.24, 0.26, 0.28, 0.42, 0.2, 0);
    part(g, 0xb0a880, 0.05, 0.28, 0.05, 0.48, 0.44, 0.08);
    part(g, 0xb0a880, 0.05, 0.28, 0.05, 0.48, 0.44, -0.08);
    part(g, 0x3a2a20, 0.09, 0.09, 0.09, 0.48, 0.6, 0.08);
    part(g, 0x3a2a20, 0.09, 0.09, 0.09, 0.48, 0.6, -0.08);
    part(g, 0xd08a48, 0.56, 0.5, 0.34, -0.1, 0.44, 0);
    part(g, 0xa8652e, 0.36, 0.32, 0.36, -0.1, 0.46, 0);
    part(g, 0xf0c47a, 0.14, 0.14, 0.37, -0.1, 0.46, 0);
    g.scale.setScalar(0.8);
    g.position.set(1, LEDGE_Y, LEDGE_Z);
    return { g, dir: 1, speed: 0.12, pause: 0 };
  }

  function makeLadybug() {
    const g = new THREE.Group();
    part(g, 0xe03a2e, 0.28, 0.14, 0.24, 0, 0.07, 0);
    part(g, 0x1c1c22, 0.1, 0.1, 0.16, 0.18, 0.06, 0);
    part(g, 0x1c1c22, 0.07, 0.03, 0.07, -0.05, 0.15, 0.06);
    part(g, 0x1c1c22, 0.07, 0.03, 0.07, 0.06, 0.15, -0.06);
    part(g, 0x1c1c22, 0.02, 0.03, 0.24, 0, 0.15, 0);
    g.position.set(-2, BOX_H / 2 + 0.1, BOX_D / 2);
    return { g, dir: 1, speed: 0.35, pause: 2, t: 0 };
  }

  function makeFrog() {
    const g = new THREE.Group();
    part(g, 0x6cbf5a, 0.62, 0.36, 0.5, 0, 0.18, 0);
    part(g, 0x5aa84a, 0.2, 0.14, 0.34, 0.33, 0.07, -0.04);
    part(g, 0x5aa84a, 0.2, 0.14, 0.34, -0.33, 0.07, -0.04);
    part(g, 0xe8f0c0, 0.4, 0.14, 0.06, 0, 0.12, 0.26);
    const throat = part(g, 0xd8e8b0, 0.26, 0.12, 0.08, 0, 0.06, 0.24);
    const eyes = new THREE.Group();
    [-0.17, 0.17].forEach(x => {
      part(eyes, 0x6cbf5a, 0.2, 0.18, 0.2, x, 0, 0);
      part(eyes, 0xffffff, 0.14, 0.12, 0.04, x, 0.02, 0.1);
      part(eyes, 0x1c1c22, 0.07, 0.08, 0.03, x, 0.02, 0.125);
    });
    eyes.position.set(0, 0.42, 0.1);
    g.add(eyes);
    // blush
    part(g, 0xff9aa8, 0.08, 0.05, 0.02, 0.2, 0.26, 0.26);
    part(g, 0xff9aa8, 0.08, 0.05, 0.02, -0.2, 0.26, 0.26);
    g.scale.setScalar(0.9);
    g.position.set(-BOX_W / 2 - 0.05, LEDGE_Y, LEDGE_Z);
    g.rotation.y = 0.5;
    return { g, eyes, throat, blinkIn: 3, hopIn: 9, hop: -1, croak: 0 };
  }

  function setCritters(on) {
    [['snail', makeSnail], ['ladybug', makeLadybug], ['frog', makeFrog]].forEach(([k, mk]) => {
      if (on[k] && !critters[k]) { critters[k] = mk(); critterGroup.add(critters[k].g); }
      else if (!on[k] && critters[k]) { critterGroup.remove(critters[k].g); critters[k] = null; }
    });
  }

  // =========================================================
  // Shop extras: fauna + accents. build() makes a group at the origin
  // (also used for shop thumbnails); place() puts it in the jar.
  // =========================================================
  function plantTop(p) {
    return new THREE.Vector3(cellX(p.gx), SOIL_TOP + topY(p) + 0.7, cellZ(p.gz));
  }

  const EXTRAS = {
    bee: {
      build() {
        const g = new THREE.Group();
        part(g, 0xffcf3a, 0.2, 0.18, 0.28, 0, 0, 0);
        part(g, 0x2a2420, 0.21, 0.19, 0.06, 0, 0, 0.03);
        part(g, 0x2a2420, 0.21, 0.19, 0.06, 0, 0, -0.08);
        part(g, 0x2a2420, 0.14, 0.14, 0.09, 0, 0.01, 0.17);
        const wingMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
        const wings = [-1, 1].map(s => {
          const pv = new THREE.Group();
          const w = new THREE.Mesh(geo(0.2, 0.02, 0.14), wingMat);
          w.position.set(s * 0.1, 0, 0);
          pv.add(w); pv.position.set(s * 0.04, 0.1, 0);
          g.add(pv);
          return { pv, s };
        });
        return { g, wings };
      },
      place(e) {
        e.g.position.set(0, 0, 0.5);
        e.target = new THREE.Vector3(0, 0, 0.5); e.retarget = 0; e.vis = 1;
      },
      update(e, dt, t) {
        e.vis += ((moodName === 'night' ? 0 : 1) - e.vis) * (1 - Math.exp(-dt * 2));
        e.g.scale.setScalar(Math.max(0.001, e.vis));
        e.retarget -= dt;
        if (e.retarget <= 0) {
          const blooms = plants.filter(p => p.crownBuilt && p.state === 'alive');
          if (blooms.length && Math.random() < 0.8) e.target.copy(plantTop(pick(blooms))).add(new THREE.Vector3(0.15, 0.25, 0.2));
          else e.target.set(rand(-3.5, 3.5), rand(-2, 3.5), rand(-1.5, 1.5));
          e.retarget = rand(2.5, 5);
        }
        const prev = e.g.position.clone();
        e.g.position.lerp(e.target, 1 - Math.exp(-dt * 1.4));
        e.g.position.y += Math.sin(t * 9) * 0.004;
        const dx = e.g.position.x - prev.x, dz = e.g.position.z - prev.z;
        if (Math.abs(dx) + Math.abs(dz) > 1e-3) e.g.rotation.y = Math.atan2(dx, dz);
        e.wings.forEach(w => { w.pv.rotation.z = w.s * Math.sin(t * 60) * 0.6; });
      },
    },

    bunny: {
      build() {
        const g = new THREE.Group();
        const fur = 0xf4ede2;
        part(g, fur, 0.5, 0.38, 0.56, 0, 0.19, 0);
        part(g, fur, 0.14, 0.08, 0.2, 0.13, 0.04, 0.24);
        part(g, fur, 0.14, 0.08, 0.2, -0.13, 0.04, 0.24);
        part(g, 0xffffff, 0.18, 0.18, 0.12, 0, 0.26, -0.32);
        const head = new THREE.Group();
        part(head, fur, 0.38, 0.34, 0.34, 0, 0, 0);
        part(head, 0x1c1c22, 0.06, 0.07, 0.02, 0.1, 0.04, 0.17);
        part(head, 0x1c1c22, 0.06, 0.07, 0.02, -0.1, 0.04, 0.17);
        part(head, 0xffb3c1, 0.06, 0.05, 0.02, 0.15, -0.05, 0.17);
        part(head, 0xffb3c1, 0.06, 0.05, 0.02, -0.15, -0.05, 0.17);
        const nose = part(head, 0xff8fa8, 0.07, 0.05, 0.03, 0, -0.03, 0.18);
        const ears = [-1, 1].map(s => {
          const pv = new THREE.Group();
          part(pv, fur, 0.1, 0.42, 0.08, 0, 0.21, 0);
          part(pv, 0xffc2cf, 0.05, 0.3, 0.02, 0, 0.21, 0.045);
          pv.position.set(s * 0.1, 0.16, -0.02);
          head.add(pv);
          return { pv, s };
        });
        head.position.set(0, 0.48, 0.2);
        g.add(head);
        g.scale.setScalar(0.85);
        return { g, nose, ears };
      },
      place(e) {
        e.g.position.set(3.25, LEDGE_Y, LEDGE_Z);
        e.g.rotation.y = -0.35;
        e.flopIn = rand(3, 8); e.flop = 0; e.hopIn = rand(6, 12); e.hop = -1;
      },
      update(e, dt, t) {
        e.nose.scale.y = 1 + Math.max(0, Math.sin(t * 14)) * 0.5 * (Math.sin(t * 0.7) > 0 ? 1 : 0);
        e.flopIn -= dt;
        if (e.flopIn <= 0) { e.flop = 2.5; e.flopIn = rand(6, 12); e.flopSide = Math.random() < 0.5 ? 0 : 1; }
        e.flop = Math.max(0, e.flop - dt);
        e.ears.forEach((ear, i) => {
          const want = e.flop > 0 && i === e.flopSide ? ear.s * 0.9 : ear.s * 0.08;
          ear.pv.rotation.z += (want - ear.pv.rotation.z) * (1 - Math.exp(-dt * 8));
        });
        e.hopIn -= dt;
        if (e.hopIn <= 0 && e.hop < 0) { e.hop = 0; e.hopIn = rand(7, 14); }
        if (e.hop >= 0) {
          e.hop += dt * 2.6;
          e.g.position.y = LEDGE_Y + Math.sin(Math.min(1, e.hop) * Math.PI) * 0.35;
          if (e.hop >= 1) { e.hop = -1; e.g.position.y = LEDGE_Y; }
        }
      },
    },

    cat: {
      build() {
        const g = new THREE.Group();
        const body = new THREE.Group();
        part(body, 0xf0a050, 1.1, 0.42, 0.7, 0, 0.21, 0);
        [-0.3, 0, 0.3].forEach(x => part(body, 0xd07a30, 0.1, 0.44, 0.72, x, 0.21, 0));
        part(body, 0xfff2e0, 0.4, 0.2, 0.06, 0.2, 0.12, 0.34);
        g.add(body);
        const head = new THREE.Group();
        part(head, 0xf0a050, 0.48, 0.4, 0.44, 0, 0, 0);
        part(head, 0xd07a30, 0.1, 0.06, 0.45, 0, 0.18, 0);
        part(head, 0xf0a050, 0.13, 0.14, 0.1, -0.14, 0.26, 0);
        part(head, 0xf0a050, 0.13, 0.14, 0.1, 0.14, 0.26, 0);
        part(head, 0xffb3c1, 0.07, 0.07, 0.02, -0.14, 0.26, 0.05);
        part(head, 0xffb3c1, 0.07, 0.07, 0.02, 0.14, 0.26, 0.05);
        part(head, 0x3a2a20, 0.12, 0.025, 0.02, -0.11, 0.02, 0.225);   // closed eyes
        part(head, 0x3a2a20, 0.12, 0.025, 0.02, 0.11, 0.02, 0.225);
        part(head, 0xff8fa8, 0.06, 0.04, 0.02, 0, -0.06, 0.225);
        part(head, 0xfff2e0, 0.22, 0.1, 0.04, 0, -0.13, 0.22);
        head.position.set(0.6, 0.22, 0.14);
        head.rotation.z = -0.12;
        g.add(head);
        part(g, 0xf0a050, 0.9, 0.14, 0.14, -0.05, 0.08, 0.42);   // tail wrapped in front
        const tip = part(g, 0xfff2e0, 0.2, 0.15, 0.15, -0.55, 0.1, 0.42);
        return { g, body, head, tip };
      },
      place(e) {
        e.g.position.set(2.3, BOX_H / 2 + 0.01, 0.3);
        e.g.rotation.y = -0.2;
        e.zIn = 1; e.zz = [];
      },
      update(e, dt, t) {
        e.body.scale.y = 1 + Math.sin(t * 1.6) * 0.04;
        e.tip.position.y = 0.1 + Math.max(0, Math.sin(t * 0.9)) * 0.08;
        e.zIn -= dt;
        if (e.zIn <= 0) {
          e.zIn = 2.2;
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture(), transparent: true, depthWrite: false }));
          s.scale.setScalar(0.35);
          s.position.set(0.7, 0.6, 0.2);
          e.g.add(s);
          e.zz.push({ s, life: 0 });
        }
        for (let i = e.zz.length - 1; i >= 0; i--) {
          const z = e.zz[i];
          z.life += dt;
          z.s.position.y += dt * 0.2;
          z.s.position.x += Math.sin(z.life * 3) * dt * 0.15;
          z.s.material.opacity = Math.min(1, z.life * 2) * Math.max(0, 1 - z.life / 3);
          z.s.scale.setScalar(0.25 + z.life * 0.08);
          if (z.life > 3) { e.g.remove(z.s); z.s.material.dispose(); e.zz.splice(i, 1); }
        }
      },
    },

    owl: {
      build() {
        const g = new THREE.Group();
        part(g, 0x8a6a4a, 0.5, 0.55, 0.42, 0, 0.28, 0);
        part(g, 0x6e5238, 0.08, 0.38, 0.32, 0.27, 0.26, -0.02);
        part(g, 0x6e5238, 0.08, 0.38, 0.32, -0.27, 0.26, -0.02);
        part(g, 0xe8d8b8, 0.32, 0.3, 0.04, 0, 0.2, 0.21);
        part(g, 0xd8c0a0, 0.44, 0.22, 0.04, 0, 0.44, 0.215);
        part(g, 0x6e5238, 0.08, 0.14, 0.08, 0.18, 0.6, 0.02);
        part(g, 0x6e5238, 0.08, 0.14, 0.08, -0.18, 0.6, 0.02);
        part(g, 0xe8a040, 0.06, 0.08, 0.04, 0, 0.37, 0.25);
        part(g, 0xe8a040, 0.08, 0.05, 0.1, 0.1, 0.02, 0.14);
        part(g, 0xe8a040, 0.08, 0.05, 0.1, -0.1, 0.02, 0.14);
        const lids = [];
        [-0.1, 0.1].forEach(x => {
          part(g, 0xffd84a, 0.14, 0.14, 0.03, x, 0.45, 0.235);
          part(g, 0x1c1c22, 0.07, 0.07, 0.02, x, 0.45, 0.255);
          const lid = part(g, 0x8a6a4a, 0.16, 0.16, 0.02, x, 0.45, 0.27);
          lids.push(lid);
        });
        g.scale.setScalar(0.9);
        return { g, lids };
      },
      place(e) {
        e.g.position.set(-BOX_W / 2, BOX_H / 2 + 0.11, BOX_D / 2);
        e.g.rotation.y = 0.35;
        e.blinkIn = 2;
      },
      update(e, dt, t) {
        const awake = moodName !== 'day';
        e.blinkIn -= dt;
        if (e.blinkIn <= 0) e.blinkIn = rand(2, 5);
        const open = awake && e.blinkIn > 0.15;
        e.lids.forEach(l => { l.scale.y += ((open ? 0.01 : 1) - l.scale.y) * (1 - Math.exp(-dt * 14)); });
        e.g.rotation.y = 0.35 + (awake ? Math.sin(t * 0.4) * 0.6 : 0);
      },
    },

    fairyLights: {
      build(preview) {
        const span = preview ? 1.4 : 4.35;
        const g = new THREE.Group();
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const x = -span + (2 * span) * i / 40;
          const u = ((x + span) % span) / span;              // two swags
          pts.push(new THREE.Vector3(x, -0.15 - Math.sin(u * Math.PI) * 0.55, 0));
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
          const w = new THREE.Mesh(geo(len, 0.025, 0.025), mat(0x3a4a3a));
          w.position.copy(a).lerp(b, 0.5);
          w.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
          g.add(w);
        }
        const cols = [0xfff1c8, 0xffb3c8, 0xffd27a, 0xb8f0d0, 0xa8d0ff];
        const bulbs = [];
        for (let i = 2; i < pts.length - 1; i += 3) {
          const col = cols[bulbs.length % cols.length];
          const b = new THREE.Mesh(geo(0.12, 0.15, 0.12), new THREE.MeshBasicMaterial({ color: col }));
          b.position.copy(pts[i]).add(new THREE.Vector3(0, -0.09, 0));
          const h = halo(col, 0.9);
          b.add(h);
          g.add(b);
          bulbs.push({ b, h, ph: Math.random() * 6 });
        }
        return { g, bulbs };
      },
      place(e) { e.g.position.set(0, BOX_H / 2, BOX_D / 2 - 0.15); },
      update(e, dt, t) {
        e.bulbs.forEach(b => {
          const tw = 0.6 + 0.4 * Math.sin(t * 2.2 + b.ph);
          b.h.material.opacity = (0.15 + moodCur.glow * 0.75) * tw;
        });
      },
    },

    lantern: {
      build() {
        const g = new THREE.Group();
        const iron = 0x3a3530;
        part(g, iron, 0.04, 0.9, 0.04, 0, -0.45, 0);
        part(g, iron, 0.3, 0.08, 0.3, 0, -0.9, 0);
        part(g, iron, 0.42, 0.06, 0.42, 0, -0.96, 0);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => part(g, iron, 0.05, 0.42, 0.05, sx * 0.17, -1.2, sz * 0.17));
        part(g, iron, 0.42, 0.06, 0.42, 0, -1.44, 0);
        const core = new THREE.Mesh(geo(0.26, 0.3, 0.26), glowMat(0xffd27a));
        core.position.y = -1.2;
        g.add(core);
        const light = new THREE.PointLight(0xffc070, 0.5, 7, 1.6);
        light.position.y = -1.2;
        g.add(light);
        const h = halo(0xffd890, 2);
        h.position.y = -1.2;
        g.add(h);
        return { g, light, h };
      },
      place(e) { e.g.position.set(2.8, BOX_H / 2, -1.5); },
      update(e, dt, t) {
        e.g.rotation.z = Math.sin(t * 0.8) * 0.04;
        e.light.intensity = 0.25 + moodCur.glow * 1.6;
        e.h.material.opacity = 0.1 + moodCur.glow * 0.6;
      },
    },

    gnome: {
      build() {
        const g = new THREE.Group();
        part(g, 0x3a2a20, 0.14, 0.08, 0.2, 0.08, 0.04, 0.02);
        part(g, 0x3a2a20, 0.14, 0.08, 0.2, -0.08, 0.04, 0.02);
        part(g, 0x4a6fc0, 0.34, 0.3, 0.28, 0, 0.23, 0);
        part(g, 0x3a2a20, 0.35, 0.05, 0.29, 0, 0.18, 0);
        part(g, 0xf2c8a0, 0.08, 0.08, 0.08, 0.21, 0.24, 0.04);
        part(g, 0xf2c8a0, 0.08, 0.08, 0.08, -0.21, 0.24, 0.04);
        part(g, 0xf2c8a0, 0.26, 0.2, 0.22, 0, 0.48, 0);
        part(g, 0x1c1c22, 0.04, 0.04, 0.02, 0.06, 0.5, 0.115);
        part(g, 0x1c1c22, 0.04, 0.04, 0.02, -0.06, 0.5, 0.115);
        part(g, 0xf0a090, 0.08, 0.08, 0.06, 0, 0.45, 0.13);
        part(g, 0xffffff, 0.3, 0.2, 0.08, 0, 0.37, 0.12);
        part(g, 0xffffff, 0.18, 0.12, 0.08, 0, 0.23, 0.15);
        [[0.32, 0.12, 0.3, 0.62], [0.24, 0.12, 0.22, 0.74], [0.16, 0.12, 0.14, 0.86], [0.08, 0.12, 0.08, 0.98]]
          .forEach(([w, h, d, y], i) => part(g, 0xd8383a, w, h, d, i * 0.02, y, -i * 0.01));
        g.scale.setScalar(0.95);
        return { g };
      },
      place(e) {
        e.g.position.set(4.55, LEDGE_Y, LEDGE_Z);
        e.g.rotation.y = -0.4;
        e.wobIn = rand(5, 10); e.wob = 0;
      },
      update(e, dt, t) {
        e.wobIn -= dt;
        if (e.wobIn <= 0) { e.wob = 1; e.wobIn = rand(8, 16); }
        e.wob = Math.max(0, e.wob - dt);
        e.g.rotation.z = Math.sin(e.wob * 20) * 0.08 * e.wob;
      },
    },

    mossyFrame: {
      build(preview) {
        const g = new THREE.Group();
        const r = mulberry32(77);
        const hw = BOX_W / 2, hd = BOX_D / 2, by = -BOX_H / 2, ty = BOX_H / 2;
        const bars = preview
          ? [[[-1.2, 0, 0], [1.2, 0, 0]], [[-1.2, 0, 0], [-1.2, 1.6, 0]]]
          : [[[-hw, by, hd], [hw, by, hd]], [[-hw, by, -hd], [hw, by, -hd]], [[-hw, by, -hd], [-hw, by, hd]], [[hw, by, -hd], [hw, by, hd]],
             [[-hw, by, hd], [-hw, by + 3.2, hd]], [[hw, by, hd], [hw, by + 2.2, hd]], [[-hw, by, -hd], [-hw, by + 1.6, -hd]], [[hw, by, -hd], [hw, by + 2.6, -hd]],
             [[-hw, ty, hd], [-hw + 2.4, ty, hd]], [[hw - 1.6, ty, -hd], [hw, ty, -hd]]];
        if (preview) {
          part(g, 0xc8975a, 2.45, 0.2, 0.2, 0, 0, 0);
          part(g, 0xc8975a, 0.2, 1.7, 0.2, -1.2, 0.85, 0);
        }
        bars.forEach(([a, b]) => {
          const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
          const n = Math.ceil(A.distanceTo(B) / 0.22);
          for (let i = 0; i <= n; i++) {
            const vertical = Math.abs(B.y - A.y) > 0.01;
            if (vertical && r() < (i / n) * 0.9) continue;   // thins out as it climbs
            const s = R(r, 0.16, 0.32);
            const m = part(g, pick(COL.moss, r), s, s * R(r, 0.6, 1), s, 0, 0, 0);
            m.position.copy(A).lerp(B, i / n).add(new THREE.Vector3(R(r, -0.1, 0.1), R(r, 0.02, 0.14), R(r, -0.1, 0.1)));
            if (r() < 0.08) part(g, pick([0xffffff, 0xffd94a, 0xff9acb], r), 0.08, 0.08, 0.08, m.position.x, m.position.y + s * 0.5, m.position.z);
          }
        });
        return { g };
      },
      place() {},
    },

    goldenFrame: {
      build(preview) {
        if (!preview) return { g: null };
        const g = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({ color: 0xffd257, roughness: 0.3, metalness: 0.45 });
        [[1.8, 0.2, 0.2, 0, 0, 0], [0.2, 1.8, 0.2, -0.9, 0.9, 0], [0.2, 0.2, 1.4, -0.9, 0, -0.7]].forEach(([w, h, d, x, y, z]) => {
          const m = new THREE.Mesh(geo(w, h, d), gold); m.position.set(x, y, z); g.add(m);
        });
        return { g };
      },
      place() { postMat.color.setHex(0xffd257); postMat.roughness = 0.3; postMat.metalness = 0.45; },
      off() { postMat.color.setHex(0xc8975a); postMat.roughness = 0.35; postMat.metalness = 0.65; },
    },
  };

  let _zTex = null;
  function zTexture() {
    if (_zTex) return _zTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(60,50,90,0.55)'; g.lineWidth = 6;
    g.strokeText('z', 32, 34); g.fillText('z', 32, 34);
    _zTex = new THREE.CanvasTexture(c);
    return _zTex;
  }

  const extras = {};
  function setExtras(on) {
    Object.keys(EXTRAS).forEach(k => {
      const def = EXTRAS[k];
      if (on[k] && !extras[k]) {
        const e = def.build();
        extras[k] = e;
        if (e.g) critterGroup.add(e.g);
        def.place(e);
        if (on._fanfare === k) {
          const at = e.g ? e.g.position.clone() : new THREE.Vector3(0, BOX_H / 2, BOX_D / 2);
          if (k === 'lantern') at.y -= 1.2;
          if (k === 'fairyLights') at.y -= 0.5;
          burstAt(at, 24, null, 0.6);
        }
      } else if (!on[k] && extras[k]) {
        if (extras[k].g) critterGroup.remove(extras[k].g);
        if (def.off) def.off();
        delete extras[k];
      }
    });
  }
  function stepExtras(dt, t) {
    Object.keys(extras).forEach(k => { if (EXTRAS[k].update) EXTRAS[k].update(extras[k], dt, t); });
  }

  // =========================================================
  // Shop thumbnails: a tiny offscreen renderer
  // =========================================================
  let pv = null;
  function previewRig() {
    if (pv) return pv;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(220, 220);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.25;
    const s = new THREE.Scene();
    s.add(new THREE.AmbientLight(0xd8d8e8, 1.3));
    s.add(new THREE.HemisphereLight(0xe0ecff, 0x8a7050, 0.8));
    const key = new THREE.DirectionalLight(0xffe8c0, 1.9); key.position.set(4, 8, 6); s.add(key);
    const fill = new THREE.DirectionalLight(0xb0c0ff, 0.5); fill.position.set(-6, 3, 2); s.add(fill);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const holder = new THREE.Group();
    s.add(holder);
    pv = { r, s, cam, holder };
    return pv;
  }
  function fitBox(obj) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    obj.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    return box;
  }
  // item: { plant: kind } or { extra: key }
  function preview(item) {
    const { r, s, cam, holder } = previewRig();
    holder.clear();
    if (item.plant) {
      const kind = item.plant, rr = mulberry32(11);
      const [tint, tint2] = tintsFor(kind, rr);
      const p = { kind, h: heightFor(kind, mulberry32(3)), tint, tint2, seed: 5, state: 'alive', group: new THREE.Group(), blocks: [] };
      if (kind === 'rose') { p.tint = 0xd8283c; p.tint2 = 0xa01828; }
      const sp = SPECIES[kind];
      for (let lv = 0; lv < p.h; lv++) sp.level(p, lv, rngFor(p.seed, lv));
      sp.crown(p, rngFor(p.seed, 99));
      p.blocks.forEach(b => b.mesh.scale.setScalar(1));
      Object.values(glowMats).forEach(m => { m.emissiveIntensity = 0.6; });
      if (p.halo) p.group.remove(p.halo);
      holder.add(p.group);
      const soil = new THREE.Mesh(geo(1.3, 0.3, 1.3), mat(COL.soil));
      soil.position.y = -0.15;
      holder.add(soil);
    } else {
      const e = EXTRAS[item.extra].build(true);
      holder.add(e.g);
      if (item.extra === 'fairyLights') e.bulbs.forEach(b => { b.h.material.opacity = 0.5; });
      if (item.extra === 'lantern') e.h.material.opacity = 0.4;
    }
    const box = fitBox(holder), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const rad = Math.max(size.x, size.y, size.z * 0.8) * 0.5;
    const dist = rad / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.25;
    cam.position.copy(c).add(new THREE.Vector3(0.4, 0.42, 1).normalize().multiplyScalar(dist));
    cam.lookAt(c);
    r.render(s, cam);
    const url = r.domElement.toDataURL('image/png');
    holder.clear();
    return url;
  }

  // --- Butterflies (spawn when a focus plant blooms in daylight) ---
  function spawnButterfly(p) {
    if (butterflies.length >= 4) return;
    const col = pick([0xffd94a, 0xff9acb, 0x8fd6ff, 0xffffff, 0xffa64a, 0xc8a0ff]);
    const g = new THREE.Group();
    part(g, 0x3a2a30, 0.06, 0.06, 0.28, 0, 0, 0);
    const wings = [];
    [-1, 1].forEach(s => {
      const pivot = new THREE.Group();
      const w1 = new THREE.Mesh(geo(0.3, 0.02, 0.22), mat(col)); w1.position.set(s * 0.16, 0, 0.05);
      const w2 = new THREE.Mesh(geo(0.2, 0.02, 0.16), mat(col)); w2.position.set(s * 0.12, 0, -0.12);
      pivot.add(w1, w2);
      g.add(pivot);
      wings.push({ pivot, s });
    });
    const start = p ? new THREE.Vector3(cellX(p.gx), SOIL_TOP + topY(p) + 0.5, cellZ(p.gz)) : new THREE.Vector3(0, 0, 0);
    g.position.copy(start);
    g.scale.setScalar(0.01);
    fxGroup.add(g);
    butterflies.push({ g, wings, target: start.clone(), retarget: 0, life: 0, max: 50, phase: Math.random() * 6 });
  }

  // --- Fireflies (night) ---
  let _glowTex = null;
  function glowTexture() {
    if (_glowTex) return _glowTex;
    const size = 128, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,240,180,1)');
    grd.addColorStop(0.3, 'rgba(255,220,140,0.6)');
    grd.addColorStop(1, 'rgba(255,210,120,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    _glowTex = new THREE.CanvasTexture(c);
    return _glowTex;
  }
  function addFirefly() {
    const core = new THREE.Mesh(geo(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: COL.fireflyCore, transparent: true }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: COL.fireflyGlow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(0.9);
    core.add(halo);
    const light = new THREE.PointLight(0xffd880, 0.5, 3, 2);
    core.add(light);
    core.position.set(rand(-3.5, 3.5), rand(-3, 3), rand(-1.8, 1.8));
    fxGroup.add(core);
    fireflies.push({ mesh: core, halo, light, fade: 0, dying: false,
      speed: rand(0.4, 0.8), target: core.position.clone(), retarget: 0, flick: Math.random() * 6.28 });
  }
  function setFireflies(n) { fireflyTarget = clamp(n | 0, 0, 16); }

  // =========================================================
  // Mood / weather
  // =========================================================
  function applyMoodInstant(name) {
    moodName = name;
    const m = MOODS[name];
    ['key', 'front', 'fill', 'amb', 'interior', 'rim'].forEach(k => {
      L[k].color.setHex(m[k][0]); L[k].intensity = m[k][1];
    });
    L.hemi.color.setHex(m.hemi[0]); L.hemi.groundColor.setHex(m.hemi[1]); L.hemi.intensity = m.hemi[2];
    moodCur.exposure = m.exposure; moodCur.stars = m.stars;
  }
  function setMood(name) { if (MOODS[name]) moodName = name; }
  function setRain(on) { rain.on = !!on; }

  const _c = new THREE.Color();
  function stepMood(dt) {
    const m = MOODS[moodName], k = 1 - Math.exp(-dt * 1.2);
    ['key', 'front', 'fill', 'amb', 'interior', 'rim'].forEach(n => {
      L[n].color.lerp(_c.setHex(m[n][0]), k);
      L[n].intensity += (m[n][1] - L[n].intensity) * k;
    });
    L.hemi.color.lerp(_c.setHex(m.hemi[0]), k);
    L.hemi.groundColor.lerp(_c.setHex(m.hemi[1]), k);
    L.hemi.intensity += (m.hemi[2] - L.hemi.intensity) * k;
    scene.fog.color.lerp(_c.setHex(m.fog), k);
    moodCur.exposure += (m.exposure - moodCur.exposure) * k;
    moodCur.stars += (m.stars - moodCur.stars) * k;
    moodCur.glow += (m.glow - moodCur.glow) * k;
    renderer.toneMappingExposure = moodCur.exposure;
    Object.values(glowMats).forEach(gm => { gm.emissiveIntensity = 0.15 + moodCur.glow * 0.95; });
  }

  // =========================================================
  // Pointer: drag to turn the jar, hover plants for their story
  // =========================================================
  let hoverCb = null;
  function onHover(fn) { hoverCb = fn; }
  function bindPointer() {
    const el = renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down = null, dragging = false, lastHover = 0;

    el.addEventListener('pointerdown', e => { down = { x: e.clientX, r: rotTarget }; dragging = false; });
    window.addEventListener('pointerup', () => { down = null; setTimeout(() => { dragging = false; }, 0); el.style.cursor = ''; });
    el.addEventListener('pointerleave', () => { if (hoverCb) hoverCb(null); });
    el.addEventListener('dblclick', () => { rotTarget = 0; });
    el.addEventListener('pointermove', e => {
      if (down) {
        const dx = e.clientX - down.x;
        if (Math.abs(dx) > 4) dragging = true;
        if (dragging) {
          rotTarget = clamp(down.r + dx * 0.006, -0.9, 0.9);
          el.style.cursor = 'grabbing';
          if (hoverCb) hoverCb(null);
          return;
        }
      }
      const now = performance.now();
      if (now - lastHover < 50 || !hoverCb) return;
      lastHover = now;
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(plantsGroup.children, true)[0];
      let id = null;
      if (hit) { let o = hit.object; while (o && o.userData.plantId == null) o = o.parent; if (o) id = o.userData.plantId; }
      const p = id != null ? find(id) : null;
      el.style.cursor = p ? 'pointer' : 'grab';
      hoverCb(p ? serializeOne(p) : null, e.clientX, e.clientY);
    });
  }

  // =========================================================
  // Snapshot for the jar shelf
  // =========================================================
  function capture(bg) {
    renderer.render(scene, camera);
    const src = renderer.domElement;
    // project the jar's bounds to find a tight crop
    const pts = [];
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => [-BOX_H / 2 - 0.9, BOX_H / 2 + 0.6].forEach(y => {
      const v = new THREE.Vector3(sx * (BOX_W / 2 + 0.6), y, sz * (BOX_D / 2 + 0.6));
      terrariumGroup.localToWorld(v); v.project(camera); pts.push(v);
    })));
    const xs = pts.map(v => (v.x + 1) / 2 * src.width), ys = pts.map(v => (1 - v.y) / 2 * src.height);
    let x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(src.width, Math.max(...xs));
    let y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(src.height, Math.max(...ys));
    const pad = (x1 - x0) * 0.06;
    x0 = Math.max(0, x0 - pad); x1 = Math.min(src.width, x1 + pad); y0 = Math.max(0, y0 - pad); y1 = Math.min(src.height, y1 + pad);
    const W = 200, H = Math.round(W * (y1 - y0) / (x1 - x0));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = bg || '#ece8d8'; g.fillRect(0, 0, W, H);
    g.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, W, H);
    return c.toDataURL('image/jpeg', 0.82);
  }

  // =========================================================
  // Animation loop
  // =========================================================
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.getElapsedTime();

    stepMood(dt);
    rotY += (rotTarget - rotY) * (1 - Math.exp(-dt * 6));
    terrariumGroup.rotation.y = rotY;

    // plants: pop-in, sway, droop, petals
    plants.forEach(p => {
      p.blocks.forEach(b => {
        if (b.delay > 0) { b.delay -= dt; return; }
        if (b.age < 1) {
          b.age = Math.min(1, b.age + dt * 3.5);
          b.mesh.scale.setScalar(Math.max(0.001, easeOutBack(b.age)));
        }
      });
      const target = p.state === 'wilted' ? 1 : 0;
      p.droop += (target - p.droop) * (1 - Math.exp(-dt * 2));
      const breeze = rain.amt * 0.03;
      p.group.rotation.z = Math.sin(t * 1.3 + p.sway) * (0.015 + breeze) + p.droop * 0.32 * p.droopDir;
      p.group.rotation.x = p.droop * 0.12;
      p.group.scale.y = 1 - p.droop * 0.18;
      if (p.halo) p.halo.material.opacity = Math.max(0, moodCur.glow - 0.15) * 0.85;
      if (p.kind === 'tree' && p.crownBuilt && p.state !== 'wilted') {
        p.petalTimer -= dt;
        if (p.petalTimer <= 0) { p.petalTimer = rand(1.5, 4); dropPetal(p); }
      }
    });

    // growing-seed marker
    if (marker && marker.visible) {
      const p = find(markerId);
      if (p) {
        marker.position.set(cellX(p.gx), SOIL_TOP + topY(p) + 0.9 + Math.sin(t * 2.2) * 0.15, cellZ(p.gz));
        marker.material.opacity = 0.7 + Math.sin(t * 3) * 0.3;
      }
    }

    // sparkles
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.life += dt;
      s.v.y -= 3.2 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.rotation.x += dt * 4; s.mesh.rotation.y += dt * 3;
      s.mesh.material.opacity = 1 - s.life / s.max;
      if (s.life > s.max) { fxGroup.remove(s.mesh); s.mesh.material.dispose(); sparkles.splice(i, 1); }
    }

    // falling blossom petals
    for (let i = petals.length - 1; i >= 0; i--) {
      const pt = petals[i];
      pt.life += dt;
      if (pt.mesh.position.y > SOIL_TOP + 0.03) {
        pt.mesh.position.y -= dt * 0.55;
        pt.mesh.position.x += Math.sin(t * 2 + pt.phase) * dt * 0.4;
        pt.mesh.rotation.z = Math.sin(t * 3 + pt.phase) * 0.6;
      } else if (pt.life > pt.landAt + 4 || pt.life > 30) {
        fxGroup.remove(pt.mesh); petals.splice(i, 1);
      } else if (!pt.landAt) pt.landAt = pt.life;
    }

    // dust
    particles.forEach(pt => {
      pt.mesh.position.y = pt.base.y + Math.sin(t * pt.speed + pt.phase) * 0.15;
      pt.mesh.position.x = pt.base.x + Math.cos(t * pt.speed * 0.5 + pt.phase) * 0.08;
    });

    // stars
    starField.material.opacity = moodCur.stars * (0.75 + Math.sin(t * 0.8) * 0.15);
    starField.visible = moodCur.stars > 0.01;

    stepRain(dt, t);
    stepFireflies(dt, t);
    stepButterflies(dt, t);
    stepCritters(dt, t);
    stepExtras(dt, t);

    renderer.render(scene, camera);
  }

  function dropPetal(p) {
    if (petals.length > 40) return;
    const m = new THREE.Mesh(geo(0.13, 0.04, 0.13), mat(pick(COL.blossom)));
    m.position.set(cellX(p.gx) + rand(-1, 1), SOIL_TOP + topY(p) + 0.5, cellZ(p.gz) + rand(-0.9, 0.9));
    fxGroup.add(m);
    petals.push({ mesh: m, life: 0, phase: Math.random() * 6, landAt: 0 });
  }

  function stepRain(dt, t) {
    rain.amt += ((rain.on ? 1 : 0) - rain.amt) * (1 - Math.exp(-dt * 1.5));
    const vis = rain.amt > 0.01;
    rain.cloud.visible = vis;
    rain.cloudMat.opacity = rain.amt * 0.95;
    rain.mat.opacity = rain.amt * 0.7;
    rain.cloud.position.x = Math.sin(t * 0.25) * 1.6;
    rain.cloud.position.y = BOX_H / 2 - 1.4 + Math.sin(t * 0.7) * 0.08;
    rain.drops.forEach(d => {
      d.mesh.visible = vis;
      if (!vis) return;
      d.mesh.position.y -= d.v * dt;
      if (d.mesh.position.y < SOIL_TOP + 0.15) resetDrop(d, false);
    });
  }

  function stepFireflies(dt, t) {
    const alive = fireflies.filter(f => !f.dying).length;
    if (alive < fireflyTarget) addFirefly();
    else if (alive > fireflyTarget) { const f = fireflies.find(f => !f.dying); if (f) f.dying = true; }
    for (let i = fireflies.length - 1; i >= 0; i--) {
      const f = fireflies[i];
      f.fade = clamp(f.fade + (f.dying ? -dt : dt) * 0.8, 0, 1);
      if (f.dying && f.fade <= 0) { fxGroup.remove(f.mesh); fireflies.splice(i, 1); continue; }
      f.retarget -= dt;
      if (f.retarget <= 0) {
        f.target.set(rand(-BOX_W / 2 + 0.7, BOX_W / 2 - 0.7), rand(-BOX_H / 2 + 2, BOX_H / 2 - 1), rand(-BOX_D / 2 + 0.4, BOX_D / 2 - 0.4));
        f.retarget = rand(1.8, 3.5);
      }
      f.mesh.position.lerp(f.target, 0.015 * f.speed);
      const fl = 0.6 + 0.4 * (Math.sin(t * 5 + f.flick) * 0.5 + 0.5);
      f.light.intensity = 0.55 * fl * f.fade;
      f.halo.material.opacity = 0.85 * fl * f.fade;
      f.mesh.material.opacity = f.fade;
      f.halo.scale.setScalar(0.85 + 0.18 * fl);
    }
  }

  function stepButterflies(dt, t) {
    for (let i = butterflies.length - 1; i >= 0; i--) {
      const b = butterflies[i];
      b.life += dt;
      const leaving = b.life > b.max || moodName !== 'day';
      if (leaving && b.life < b.max) b.life = b.max;
      const s = leaving ? Math.max(0, 1 - (b.life - b.max) / 1.5) : Math.min(1, b.life * 2);
      b.g.scale.setScalar(Math.max(0.001, s));
      if (leaving && s <= 0) { fxGroup.remove(b.g); butterflies.splice(i, 1); continue; }
      b.retarget -= dt;
      if (b.retarget <= 0) {
        b.target.set(rand(-3.6, 3.6), rand(-2.5, 3.8), rand(-1.6, 1.6));
        b.retarget = rand(1.5, 3);
      }
      const prev = b.g.position.clone();
      b.g.position.lerp(b.target, 0.012);
      b.g.position.y += Math.sin(t * 6 + b.phase) * 0.006;
      const dx = b.g.position.x - prev.x, dz = b.g.position.z - prev.z;
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) b.g.rotation.y = Math.atan2(dx, dz);
      const flap = Math.sin(t * 18 + b.phase) * 0.9;
      b.wings.forEach(w => { w.pivot.rotation.z = w.s * flap; });
    }
  }

  function stepCritters(dt, t) {
    const sn = critters.snail;
    if (sn) {
      if (sn.pause > 0) sn.pause -= dt;
      else {
        sn.g.position.x += sn.dir * sn.speed * dt;
        if (sn.g.position.x > 2.4 || sn.g.position.x < -BOX_W / 2 + 1.4) {
          sn.dir *= -1; sn.pause = rand(2, 6);
          sn.g.position.x = clamp(sn.g.position.x, -BOX_W / 2 + 1.4, 2.4);
        }
      }
      sn.g.rotation.y += ((sn.dir > 0 ? 0 : Math.PI) - sn.g.rotation.y) * (1 - Math.exp(-dt * 2));
      sn.g.scale.x = 0.8 * (1 + Math.sin(t * 2) * 0.04);
    }
    const lb = critters.ladybug;
    if (lb) {
      if (lb.pause > 0) lb.pause -= dt;
      else {
        lb.g.position.x += lb.dir * lb.speed * dt;
        lb.t -= dt;
        if (lb.t <= 0) { lb.pause = rand(1, 4); lb.t = rand(2, 6); if (Math.random() < 0.4) lb.dir *= -1; }
        if (Math.abs(lb.g.position.x) > BOX_W / 2 - 0.3) { lb.dir *= -1; lb.g.position.x = clamp(lb.g.position.x, -BOX_W / 2 + 0.3, BOX_W / 2 - 0.3); }
      }
      lb.g.rotation.y += ((lb.dir > 0 ? 0 : Math.PI) - lb.g.rotation.y) * (1 - Math.exp(-dt * 5));
    }
    const fr = critters.frog;
    if (fr) {
      fr.blinkIn -= dt;
      fr.eyes.scale.y = fr.blinkIn < 0.12 ? 0.15 : 1;
      if (fr.blinkIn <= 0) fr.blinkIn = rand(2.5, 6);
      fr.hopIn -= dt;
      if (fr.hopIn <= 0 && fr.hop < 0) { fr.hop = 0; fr.hopIn = rand(8, 16); }
      if (fr.hop >= 0) {
        fr.hop += dt * 2.2;
        fr.g.position.y = LEDGE_Y + Math.sin(Math.min(1, fr.hop) * Math.PI) * 0.45;
        if (fr.hop >= 1) { fr.hop = -1; fr.g.position.y = LEDGE_Y; fr.croak = 1.2; }
      }
      if (fr.croak > 0) {
        fr.croak -= dt;
        fr.throat.scale.set(1 + Math.max(0, Math.sin(fr.croak * 12)) * 0.6, 1 + Math.max(0, Math.sin(fr.croak * 12)) * 0.8, 1);
      }
    }
  }

  function easeOutBack(x) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  window.Terrarium = {
    init, load, plantSeed, setGrowth, bloom, wilt, revive, remove, clearPlants,
    serialize, speciesLabel, setMarker, setMood, setRain, setFireflies, setCritters, setExtras, preview,
    spawnButterfly, onHover, capture, freeCount: () => freeCells().length,
    CAPACITY: BOX_W * BOX_D,
  };
})();
