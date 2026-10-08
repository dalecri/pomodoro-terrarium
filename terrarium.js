// Isometric voxel garden island — Three.js
// Exposes window.Terrarium. Plants are data-driven (kind + seed) so the garden
// can be rebuilt identically from localStorage on every visit.

(function () {
  // The island is GRID x GRID grass cells; plants sit on the grass at y = 0.
  const GRID = 11;
  const BOX_W = GRID, BOX_D = GRID;
  const HALF = GRID / 2;
  const VOX = 1;
  const SOIL_TOP = 0;
  const SKY = 8;                          // ceiling for weather + fireflies
  // ---- Island presets: layout, home, trees, accents and a resident pond critter ----
  const SCENES = {
    hollow: {
      name: 'Blossom Hollow', tag: 'Wood cabin, magenta blossoms, olive pond',
      grass: [0x4a4a82, 0x4e4e8a, 0x46467c, 0x52528e, 0x4a4a86], tuft: [0x60609c, 0x5a5a98, 0x6a6aa8],
      blossom: [0xc24a9c, 0xd462b0, 0xa83c8a, 0xe27cc4, 0xb84898], trunk: 0x9a7a58,
      glow: [0x6a8cff, 0x7fa0ff, 0x5a7aee], flowers: [0x9a6ae0, 0xb084f0, 0x8a5ad0, 0xc0a0ff],
      pond: { x0: 3, z0: 5, water: 0x8c9a48, opacity: 0.88, bed: 0x3e4a2c, reeds: [0xb04a8a, 0xc060a0, 0x9a3a7a], swimmer: null },
      home: { type: 'cabin', x: 7, z: 1 },
      trees: [[1, 1, 4, 1234], [1, 9, 4, 777]],
      fence: { axis: 'z', at: -HALF + 0.14, from: -3.5, to: 3.5 },
      props: [['barrel', 9, 0], ['crate', 10, 1]],
      path: [[7, 3], [6, 4]],
      spots: { gnome: [8, 3], lamp: [5, 4], bunny: [10, 10], rocks: [0, 10] },
    },
    mill: {
      name: 'Amber Mill', tag: 'Stone windmill, autumn maples, ducklings',
      grass: [0x485080, 0x4c5488, 0x444c7a, 0x50588c, 0x485084], tuft: [0x5e6a9c, 0x58649a, 0x6874a8],
      blossom: [0xe8853a, 0xf0a04a, 0xd06a2a, 0xf5c062, 0xe07a34], trunk: 0x8a6a4a,
      glow: [0xffb04a, 0xffc66a, 0xf09a3a], flowers: [0xffd04a, 0xffe07a, 0xf0b030, 0xffffff],
      pond: { x0: 6, z0: 6, water: 0x5aa8a0, opacity: 0.85, bed: 0x2e4a4a, reeds: [0xc89a4a, 0xa87a3a, 0xd8b060], swimmer: 'ducks' },
      home: { type: 'windmill', x: 2, z: 2 },
      trees: [[9, 1, 4, 4321], [2, 8, 3, 99]],
      fence: { axis: 'x', at: -HALF + 0.14, from: -1.5, to: 4.5 },
      props: [['hay', 5, 1], ['pumpkins', 0, 4]],
      path: [[2, 4], [3, 5]],
      spots: { gnome: [1, 4], lamp: [4, 5], bunny: [10, 10], rocks: [10, 3] },
    },
    grove: {
      name: 'Moonlit Greenhouse', tag: 'Glass greenhouse, frost blossoms, koi',
      grass: [0x544a88, 0x584e90, 0x504684, 0x5c5294, 0x544c8c], tuft: [0x6a609e, 0x645aa0, 0x7468ae],
      blossom: [0x9fb4ff, 0xb8c6ff, 0xdfe5ff, 0x8aa0f0, 0xc8d2ff], trunk: 0xa89a8a,
      glow: [0xff7ac8, 0xff9ad8, 0xf06ab8], flowers: [0xffffff, 0xe0e6ff, 0xb8c6ff, 0xf0d8ff],
      pond: { x0: 1, z0: 4, water: 0x9a8ac8, opacity: 0.5, bed: 0x2a2450, reeds: [0x8a9ad0, 0xa0b0e0, 0x7a8ac0], swimmer: 'koi' },
      home: { type: 'greenhouse', x: 5, z: 1 },
      trees: [[9, 2, 4, 2468], [10, 7, 3, 1357]],
      fence: { axis: 'z', at: -HALF + 0.14, from: -5.0, to: -1.5 },
      props: [['well', 8, 1], ['bench', 4, 7]],
      path: [[5, 3], [4, 4]],
      spots: { gnome: [6, 3], lamp: [3, 3], bunny: [10, 10], rocks: [10, 6] },
    },
  };
  let sceneId = 'hollow', SC = SCENES.hollow;
  // cells holding scenery instead of garden plots
  const RESERVED = new Set();
  function computeReserved() {
    RESERVED.clear();
    const add = (x, z) => RESERVED.add(x + ',' + z);
    for (let x = SC.pond.x0; x < SC.pond.x0 + 3; x++) for (let z = SC.pond.z0; z < SC.pond.z0 + 3; z++) add(x, z);
    for (let x = SC.home.x - 1; x <= SC.home.x + 1; x++) for (let z = SC.home.z - 1; z <= SC.home.z + 1; z++) add(x, z);
    SC.props.forEach(([, x, z]) => add(x, z));
    SC.path.forEach(([x, z]) => add(x, z));
    SC.trees.forEach(([x, z]) => add(x, z));
    Object.values(SC.spots).forEach(([x, z]) => add(x, z));
  }
  computeReserved();

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
    blossom:  [0xc24a9c, 0xd462b0, 0xa83c8a, 0xe27cc4, 0xb84898],
    trunk:    0x9a7a58,
    // island
    grass:    [0x4a4a82, 0x4e4e8a, 0x46467c, 0x52528e, 0x4a4a86],
    tuft:     [0x60609c, 0x5a5a98, 0x6a6aa8],
    dirt:     [0x7a5a44, 0x72543f, 0x7e5e48],
    deep:     [0x5a4334, 0x54402f, 0x5e4636],
    stone:    [0x8a86a0, 0x7a7690, 0x9692ac],
    mushBlue: [0x6a8cff, 0x7fa0ff, 0x5a7aee],
    purple:   [0x9a6ae0, 0xb084f0, 0x8a5ad0, 0xc0a0ff],
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
    day: {     // focus: the dusky-mauve diorama look
      key: [0xffe6d0, 1.75], front: [0xf0d8ff, 0.55], fill: [0xb8a0ff, 0.45],
      amb: [0xd8c0e0, 1.0], hemi: [0xf0d0f0, 0x4a3a70, 0.8], interior: [0xffc890, 0.5],
      rim: [0xffc0e0, 0.55], exposure: 1.15, stars: 0, glow: 0.2,
    },
    dusk: {    // short break: rainy periwinkle
      key: [0xc8c8ff, 1.0], front: [0xd0d8ff, 0.5], fill: [0x9fb0ff, 0.5],
      amb: [0xb0b0d8, 1.05], hemi: [0xc8d0ff, 0x404070, 0.7], interior: [0xffc080, 1.6],
      rim: [0xa0b0ff, 0.5], exposure: 1.2, stars: 0.1, glow: 0.6,
    },
    night: {   // long break: starry indigo, glowing mushrooms
      key: [0x8a9aff, 0.45], front: [0x6070c0, 0.3], fill: [0x5060c0, 0.3],
      amb: [0x4a4a98, 0.85], hemi: [0x6070c0, 0x201838, 0.4], interior: [0xffb860, 3.0],
      rim: [0x7080ff, 0.5], exposure: 1.35, stars: 1, glow: 1,
    },
  };

  let scene, camera, renderer, clock, container;
  let terrariumGroup, plantsGroup, fxGroup, critterGroup;
  const L = {};            // lights by name
  let starField;
  let moodName = 'day';
  const moodCur = { exposure: 1.18, stars: 0, glow: 0.2 };
  let home = null;         // the island's house: { g, cat, eave, light, smokeAt?, update? }
  let sceneGroup = null;
  const smoke = [];
  const decorTrees = [];
  const sceneAnims = [];   // per-scene ambient motion (sails, ducks, koi)

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
  const ISO_DIR = new THREE.Vector3(1, 0.86, 1).normalize();
  function init(el, opts) {
    container = el;
    sceneId = SCENES[(opts || {}).scene] ? opts.scene : 'hollow';
    scene = new THREE.Scene();

    const w = container.clientWidth, h = container.clientHeight;
    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
    camera.position.copy(ISO_DIR).multiplyScalar(60);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // --- Lighting --- (colors/intensities driven by mood)
    L.key = new THREE.DirectionalLight(0xffffff, 1);
    L.key.position.set(9, 16, 3);
    L.key.castShadow = true;
    L.key.shadow.mapSize.set(2048, 2048);
    Object.assign(L.key.shadow.camera, { near: 1, far: 60, left: -11, right: 11, top: 11, bottom: -11 });
    L.key.shadow.bias = -0.0006;
    L.key.shadow.normalBias = 0.02;
    L.front = new THREE.DirectionalLight(0xffffff, 1); L.front.position.set(14, 9, 14);
    L.fill = new THREE.DirectionalLight(0xffffff, 1);  L.fill.position.set(-10, 8, 6);
    L.amb = new THREE.AmbientLight(0xffffff, 1);
    L.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    L.interior = new THREE.PointLight(0xffffff, 1, 7, 1.4);   // window glow of the island's home
    L.rim = new THREE.DirectionalLight(0xffffff, 1); L.rim.position.set(-8, 6, -12);
    Object.values(L).forEach(l => scene.add(l));
    applyMoodInstant('day');

    terrariumGroup = new THREE.Group();
    scene.add(terrariumGroup);
    terrariumGroup.add(L.interior);

    plantsGroup = new THREE.Group();
    fxGroup = new THREE.Group();
    critterGroup = new THREE.Group();
    terrariumGroup.add(plantsGroup, fxGroup, critterGroup);

    setScene(sceneId);
    buildDust();
    buildStars();
    buildRain();
    positionCamera();

    window.addEventListener('resize', onResize);
    bindPointer();
    animate();
  }

  // Orthographic fit: frame the island in the open space between the side
  // panels and above the timer card.
  const FIT_PTS = [];
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
    FIT_PTS.push(new THREE.Vector3(sx * HALF, -2.7, sz * HALF), new THREE.Vector3(sx * HALF, 6.2, sz * HALF));
  }));
  function positionCamera() {
    const W = container.clientWidth, H = container.clientHeight;
    const wide = W > 980;
    const css = getComputedStyle(document.documentElement);
    const sat = parseFloat(css.getPropertyValue('--sat')) || 0, sab = parseFloat(css.getPropertyValue('--sab')) || 0;
    const top = (wide ? 50 : 60) + sat, bottom = (wide ? 290 : 280) + sab, side = wide ? 330 : 10;
    const aw = Math.max(W * 0.36, W - 2 * side), ah = Math.max(H * 0.3, H - top - bottom);
    camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    FIT_PTS.forEach(pt => {
      const v = pt.clone().applyMatrix4(camera.matrixWorldInverse);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    });
    const s = Math.max((x1 - x0) / aw, (y1 - y0) / ah);     // world units per pixel
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    camera.left = cx - (W / 2) * s; camera.right = camera.left + W * s;
    camera.top = cy + (top + ah / 2) * s; camera.bottom = camera.top - H * s;
    camera.updateProjectionMatrix();
  }

  function onResize() {
    renderer.setSize(container.clientWidth, container.clientHeight);
    positionCamera();
  }

  function cellX(ix) { return -HALF + 0.5 + ix; }
  function cellZ(iz) { return -HALF + 0.5 + iz; }
  function inPond(x, z) { return x >= SC.pond.x0 && x < SC.pond.x0 + 3 && z >= SC.pond.z0 && z < SC.pond.z0 + 3; }

  // many same-shaped boxes in one draw call
  function instanced(list, cast) {
    const im = new THREE.InstancedMesh(geo(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    list.forEach((b, i) => {
      if (b.ry) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.ry); else q.identity();
      m4.compose(pos.set(b.x, b.y, b.z), q, scl.set(b.w, b.h, b.d));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.setHex(b.hex));
    });
    im.receiveShadow = true;
    im.castShadow = !!cast;
    sceneGroup.add(im);
    return im;
  }

  // =========================================================
  // The island: layered slab, pond, home, fence, props, old trees.
  // Everything lives in sceneGroup so a preset can be swapped live.
  // =========================================================
  function setScene(id) {
    sceneId = SCENES[id] ? id : 'hollow';
    SC = SCENES[sceneId];
    COL.blossom = SC.blossom; COL.trunk = SC.trunk; COL.grass = SC.grass;
    computeReserved();
    if (sceneGroup) {
      terrariumGroup.remove(sceneGroup);
      sceneGroup.traverse(o => { if (o.isInstancedMesh) o.material.dispose(); });
    }
    smoke.forEach(sm => fxGroup.remove(sm.m)); smoke.length = 0;
    decorTrees.length = 0; sceneAnims.length = 0;
    sceneGroup = new THREE.Group();
    terrariumGroup.add(sceneGroup);
    buildIsland();
    L.interior.position.copy(home.light);

    // re-seat everything that lives on the scenery
    const crit = { snail: !!critters.snail, ladybug: !!critters.ladybug, frog: !!critters.frog };
    setCritters({}); setCritters(crit);
    const ex = {}; Object.keys(extras).forEach(k => { ex[k] = true; });
    setExtras({}); setExtras(ex);
    // plants standing on new scenery hop to the nearest free plot
    const taken = new Set();
    plants.forEach(pl => {
      const k = pl.gx + ',' + pl.gz;
      if (!RESERVED.has(k) && !taken.has(k)) { taken.add(k); return; }
      let best = null, bd = 1e9;
      for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
        const c = x + ',' + z;
        if (RESERVED.has(c) || taken.has(c) || plants.some(o => o !== pl && o.gx === x && o.gz === z)) continue;
        const d = (x - pl.gx) ** 2 + (z - pl.gz) ** 2;
        if (d < bd) { bd = d; best = { x, z }; }
      }
      if (!best) return;
      pl.gx = best.x; pl.gz = best.z;
      pl.group.position.set(cellX(best.x), SOIL_TOP, cellZ(best.z));
      taken.add(best.x + ',' + best.z);
    });
  }

  function buildIsland() {
    const r = mulberry32(42);
    const ground = [];
    for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
      const X = cellX(x), Z = cellZ(z);
      if (inPond(x, z)) {
        ground.push({ x: X, y: -1.7, z: Z, w: 1, h: 1.8, d: 1, hex: pick(COL.dirt, r) });
        continue;
      }
      const edge = x === 0 || z === 0 || x === GRID - 1 || z === GRID - 1;
      const dip = edge && r() < 0.14 ? -0.1 : 0;     // hand-made wobble on the rim
      ground.push({ x: X, y: dip - 0.2, z: Z, w: 1, h: 0.4, d: 1, hex: pick(SC.grass, r) });
      ground.push({ x: X, y: -1.0, z: Z, w: 1, h: 1.2, d: 1, hex: pick(COL.dirt, r) });
      ground.push({ x: X, y: -2.1, z: Z, w: 1, h: 1.0, d: 1, hex: pick(COL.deep, r) });
    }
    instanced(ground);

    // grass texture: little tufts
    const tufts = [], H0 = SC.home;
    for (let i = 0; i < 90; i++) {
      const x = R(r, -HALF + 0.15, HALF - 0.15), z = R(r, -HALF + 0.15, HALF - 0.15);
      const gx = Math.floor(x + HALF), gz = Math.floor(z + HALF);
      if (inPond(gx, gz) || (Math.abs(gx - H0.x) <= 1 && Math.abs(gz - H0.z) <= 1)) continue;
      const tall = r() < 0.5;
      tufts.push({ x, y: tall ? 0.09 : 0.03, z, w: 0.12, h: tall ? 0.18 : 0.06, d: tall ? 0.12 : 0.3, hex: pick(SC.tuft, r), ry: R(r, 0, 3) });
    }
    instanced(tufts);

    buildPond(r);
    home = HOMES[SC.home.type](cellX(SC.home.x), cellZ(SC.home.z));
    buildFence();
    buildProps(r);
    buildDecor(r);
    SC.trees.forEach(([gx, gz, h, seed]) => decorTree(gx, gz, h, seed));
  }

  function buildPond(r) {
    const P = SC.pond;
    const cx = cellX(P.x0 + 1), cz = cellZ(P.z0 + 1);
    const bed = new THREE.Mesh(geo(3, 0.1, 3), mat(P.bed));
    bed.position.set(cx, -0.78, cz); bed.receiveShadow = true;
    sceneGroup.add(bed);
    const water = new THREE.Mesh(geo(3, 0.06, 3), new THREE.MeshLambertMaterial({ color: P.water, transparent: true, opacity: P.opacity, depthWrite: false }));
    water.position.set(cx, -0.3, cz); water.receiveShadow = true;
    water.renderOrder = 2;
    sceneGroup.add(water);
    // pads (the frog hops between the first two)
    [[cx - 0.6, cz - 0.6], [cx + 0.7, cz + 0.7], [cx + 0.8, cz - 0.9]].forEach(([x, z], i) => {
      const pad = new THREE.Mesh(geo(i === 2 ? 0.38 : 0.6, 0.05, i === 2 ? 0.38 : 0.6), mat(0x5a8a4a));
      pad.position.set(x, -0.25, z); pad.rotation.y = R(r, 0, 1);
      sceneGroup.add(pad);
      if (i === 2) { const f = new THREE.Mesh(geo(0.14, 0.12, 0.14), mat(pick(SC.flowers, r))); f.position.set(x, -0.17, z); sceneGroup.add(f); }
    });
    // reeds poking out of the water
    [[-1.3, -1.3], [-1.25, -1.0], [-0.95, -1.35], [1.3, 1.2], [1.25, 0.9], [-1.3, 1.3]].forEach(([dx, dz]) => {
      const h = R(r, 0.6, 1.3);
      const reed = new THREE.Mesh(geo(0.08, h, 0.08), mat(pick(P.reeds, r)));
      reed.position.set(cx + dx, -0.3 + h / 2, cz + dz); reed.castShadow = true;
      sceneGroup.add(reed);
    });
    pondInfo.pads = [new THREE.Vector3(cx - 0.6, -0.22, cz - 0.6), new THREE.Vector3(cx + 0.7, -0.22, cz + 0.7)];
    if (P.swimmer === 'ducks') swimmers(cx, cz, 2, () => {
      const g = new THREE.Group();
      part(g, 0xffd84a, 0.26, 0.18, 0.34, 0, 0.09, 0);
      part(g, 0xffd84a, 0.17, 0.17, 0.17, 0, 0.26, 0.13);
      part(g, 0xf08a2a, 0.08, 0.05, 0.1, 0, 0.24, 0.25);
      part(g, 0x2a1a24, 0.03, 0.04, 0.03, 0.07, 0.29, 0.2);
      part(g, 0x2a1a24, 0.03, 0.04, 0.03, -0.07, 0.29, 0.2);
      part(g, 0xf0c03a, 0.1, 0.08, 0.1, 0, 0.16, -0.18);
      return { g, y: -0.28, rad: 0.75, speed: 0.35, bob: 0.02 };
    });
    if (P.swimmer === 'koi') swimmers(cx, cz, 3, i => {
      const g = new THREE.Group();
      const main = [0xff8a3a, 0xfff4ea, 0xff6a3a][i];
      part(g, main, 0.12, 0.08, 0.36, 0, 0, 0);
      part(g, i === 1 ? 0xff7a3a : 0xffffff, 0.1, 0.085, 0.12, 0, 0.005, 0.06);
      part(g, main, 0.16, 0.03, 0.12, 0, 0, -0.24);
      return { g, y: -0.4, rad: 0.5 + i * 0.25, speed: 0.5 - i * 0.08, bob: 0 };
    });
  }
  const pondInfo = {};

  // little critters that circle the pond for the whole session
  function swimmers(cx, cz, n, make) {
    for (let i = 0; i < n; i++) {
      const sw = make(i);
      sceneGroup.add(sw.g);
      const phase = i * Math.PI * 2 / n + Math.random();
      sceneAnims.push((dt, t) => {
        const a = phase + t * sw.speed * (i % 2 ? -1 : 1) * 0.6;
        const rad = sw.rad + Math.sin(t * 0.4 + i) * 0.12;
        sw.g.position.set(cx + Math.cos(a) * rad, sw.y + Math.sin(t * 3 + i) * sw.bob, cz + Math.sin(a) * rad);
        sw.g.rotation.y = -a + (i % 2 ? 0 : Math.PI);
      });
    }
  }

  // ---- homes: each returns where the cat naps, where fairy lights hang, where the window glows ----
  const HOMES = {
    cabin(X, Z) {
      const g = new THREE.Group();
      g.position.set(X, 0, Z);
      const W = 2.6, D = 2.6, H = 1.9;
      for (let i = 0; i < 6; i++) part(g, i % 2 ? 0x6e4e36 : 0x7a5a40, W, 0.32, D, 0, 0.16 + i * 0.32, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => part(g, 0x4a3426, 0.22, H + 0.05, 0.22, sx * W / 2, H / 2, sz * D / 2));
      part(g, 0x4a3426, 0.72, 1.18, 0.08, 0, 0.6, D / 2 + 0.03);
      part(g, 0x5e4230, 0.56, 1.06, 0.08, 0, 0.55, D / 2 + 0.06);
      part(g, 0xd8b060, 0.07, 0.07, 0.05, 0.18, 0.55, D / 2 + 0.11);
      part(g, 0x4a3426, 0.08, 0.72, 0.82, W / 2 + 0.03, 1.15, 0);
      const win = new THREE.Mesh(geo(0.06, 0.54, 0.64), glowMat(0xffc670));
      win.position.set(W / 2 + 0.06, 1.15, 0);
      g.add(win);
      part(g, 0x4a3426, 0.1, 0.06, 0.66, W / 2 + 0.09, 1.15, 0);
      part(g, 0x4a3426, 0.1, 0.56, 0.06, W / 2 + 0.09, 1.15, 0);
      part(g, 0x6a4a34, 0.2, 0.16, 0.86, W / 2 + 0.13, 0.76, 0);
      SC.flowers.concat(SC.flowers).slice(0, 4).forEach((c, i) => part(g, c, 0.13, 0.13, 0.13, W / 2 + 0.15, 0.9, -0.3 + i * 0.2));
      let k = 0;
      for (; k < 6; k++) part(g, k % 2 ? 0x4e3c32 : 0x5a463a, W + 0.5, 0.26, D + 0.6 - k * 0.55, 0, H + 0.13 + k * 0.26, 0);
      const roofTop = H + k * 0.26;
      part(g, 0x7a7690, 0.46, 1.1, 0.46, -0.75, H + 1.1, -0.55);
      part(g, 0x6a6680, 0.56, 0.12, 0.56, -0.75, H + 1.66, -0.55);
      part(g, 0x8a86a0, 0.9, 0.12, 0.42, 0, 0.06, D / 2 + 0.26);
      sceneGroup.add(g);
      return {
        g,
        cat: { pos: new THREE.Vector3(X + 0.2, roofTop - 0.02, Z), ry: 0 },
        eave: new THREE.Vector3(X - 1.55, 1.95, Z + 1.55),
        light: new THREE.Vector3(X + 2.2, 1.2, Z),
        smokeAt: new THREE.Vector3(X - 0.75, H + 1.8, Z - 0.55), smokeIn: 0,
      };
    },

    windmill(X, Z) {
      const g = new THREE.Group();
      g.position.set(X, 0, Z);
      part(g, 0x8a86a0, 3.0, 0.3, 3.0, 0, 0.15, 0);
      const stones = [0xc8c0d0, 0xb8b0c4, 0xd0c8d8];
      let y = 0.3, w = 2.1;
      for (let i = 0; i < 8; i++) {
        part(g, stones[i % 3], w, 0.45, w, 0, y + 0.225, 0);
        y += 0.45; w -= 0.11;
      }
      // door + window
      part(g, 0x4a3426, 0.62, 1.02, 0.08, 0, 0.82, 2.1 / 2 + 0.03);
      part(g, 0x6a4a34, 0.5, 0.92, 0.08, 0, 0.78, 2.1 / 2 + 0.06);
      part(g, 0x4a3426, 0.08, 0.6, 0.6, 1.75 / 2 + 0.05, 2.3, 0);
      const win = new THREE.Mesh(geo(0.06, 0.44, 0.44), glowMat(0xffc670));
      win.position.set(1.75 / 2 + 0.09, 2.3, 0);
      g.add(win);
      // stepped red roof
      for (let i = 0; i < 4; i++) part(g, i % 2 ? 0x9a4a3a : 0x8a3e32, 1.7 - i * 0.4, 0.26, 1.7 - i * 0.4, 0, y + 0.13 + i * 0.26, 0);
      part(g, 0xd8b060, 0.12, 0.3, 0.12, 0, y + 1.2, 0);
      // sails on the front face, turning slowly
      const sails = new THREE.Group();
      sails.position.set(0, y - 0.55, w / 2 + 0.5);
      part(sails, 0x5a4030, 0.3, 0.3, 0.24, 0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group();
        arm.rotation.z = i * Math.PI / 2;
        part(arm, 0x6a4a34, 0.1, 1.75, 0.08, 0, 0.95, 0);
        part(arm, 0xf2e8d8, 0.42, 1.25, 0.04, 0.27, 1.15, 0.02);
        part(arm, 0x8a6a4a, 0.04, 1.25, 0.06, 0.27, 1.15, 0.03);
        sails.add(arm);
      }
      g.add(sails);
      sceneGroup.add(g);
      sceneAnims.push(dt => { sails.rotation.z -= dt * 0.55; });
      return {
        g,
        cat: { pos: new THREE.Vector3(X + 1.25, 0.31, Z - 0.1), ry: -Math.PI / 2 },
        eave: new THREE.Vector3(X + 0.7, y - 0.2, Z + 0.7),
        light: new THREE.Vector3(X + 1.8, 2.3, Z),
      };
    },

    greenhouse(X, Z) {
      const g = new THREE.Group();
      g.position.set(X, 0, Z);
      const W = 2.7, D = 2.5, frame = 0xf4f0ea;
      part(g, 0x8a86a0, W, 0.35, D, 0, 0.175, 0);
      const glass = new THREE.MeshLambertMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.22, depthWrite: false });
      const pane = new THREE.Mesh(geo(W - 0.06, 1.4, D - 0.06), glass);
      pane.position.y = 1.05; pane.renderOrder = 3;
      g.add(pane);
      // frame posts + rails
      for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) part(g, frame, 0.07, 1.42, 0.07, sx * W / 2, 1.05, sz * D / 2);
      for (const sz of [-0.33, 0.33]) for (const sx of [-1, 1]) part(g, frame, 0.07, 1.42, 0.07, sx * W / 2, 1.05, sz * D / 2);
      part(g, frame, W + 0.04, 0.07, 0.07, 0, 1.76, D / 2); part(g, frame, W + 0.04, 0.07, 0.07, 0, 1.76, -D / 2);
      part(g, frame, 0.07, 0.07, D + 0.04, W / 2, 1.76, 0); part(g, frame, 0.07, 0.07, D + 0.04, -W / 2, 1.76, 0);
      // glass gable roof, ridge along x
      [-1, 1].forEach(sz => {
        const roof = new THREE.Mesh(geo(W + 0.1, 0.05, D / 2 + 0.22), glass);
        roof.position.set(0, 2.08, sz * D / 4);
        roof.rotation.x = sz * 0.5;
        roof.renderOrder = 3;
        g.add(roof);
        for (const sx of [-1, 0, 1]) {
          const raf = part(g, frame, 0.07, 0.06, D / 2 + 0.22, sx * W / 2, 2.08, sz * D / 4);
          raf.rotation.x = sz * 0.5;
        }
      });
      part(g, frame, W + 0.14, 0.09, 0.09, 0, 2.38, 0);
      // door outline on the front
      part(g, frame, 0.07, 1.2, 0.08, -0.32, 0.95, D / 2 + 0.03); part(g, frame, 0.07, 1.2, 0.08, 0.32, 0.95, D / 2 + 0.03);
      part(g, 0xd8b060, 0.06, 0.06, 0.05, 0.2, 0.95, D / 2 + 0.08);
      // glowing seedlings inside
      [[-0.8, -0.6], [0, -0.7], [0.8, -0.6], [-0.85, 0.5], [0.85, 0.5]].forEach(([x, z], i) => {
        part(g, 0x6a4a34, 0.5, 0.22, 0.4, x, 0.46, z);
        part(g, 0x5aa86a, 0.06, 0.4, 0.06, x, 0.75, z);
        const bloom = new THREE.Mesh(geo(0.2, 0.2, 0.2), glowMat([0xff9ad8, 0x9fe8d0, 0xc8a0ff][i % 3]));
        bloom.position.set(x, 1.0, z);
        g.add(bloom);
      });
      sceneGroup.add(g);
      return {
        g,
        cat: { pos: new THREE.Vector3(X + 0.2, 2.42, Z), ry: 0 },
        eave: new THREE.Vector3(X - W / 2, 1.8, Z + D / 2),
        light: new THREE.Vector3(X, 1.1, Z),
      };
    },
  };

  function buildFence() {
    const F = SC.fence, len = F.to - F.from;
    const at = (u, y, w, h, d) => F.axis === 'z'
      ? part(sceneGroup, 0x6a4a34, w, h, d, F.at, y, u)
      : part(sceneGroup, 0x6a4a34, d, h, w, u, y, F.at);
    for (let u = F.from; u <= F.to + 0.01; u += 1) at(u, 0.36, 0.14, 0.72, 0.14);
    [0.56, 0.28].forEach(y => {
      const rail = at((F.from + F.to) / 2, y, 0.08, 0.08, len + 0.1);
      rail.material = mat(0x7a5a40);
    });
  }

  const PROPS = {
    barrel(X, Z) {
      part(sceneGroup, 0x7a5a40, 0.6, 0.72, 0.6, X, 0.36, Z);
      part(sceneGroup, 0x3a3530, 0.64, 0.06, 0.64, X, 0.16, Z);
      part(sceneGroup, 0x3a3530, 0.64, 0.06, 0.64, X, 0.56, Z);
      part(sceneGroup, 0x5e4230, 0.5, 0.04, 0.5, X, 0.73, Z);
    },
    crate(X, Z) {
      part(sceneGroup, 0xa07e54, 0.58, 0.58, 0.58, X, 0.29, Z);
      part(sceneGroup, 0x7a5a3a, 0.62, 0.08, 0.62, X, 0.54, Z);
      part(sceneGroup, 0x7a5a3a, 0.62, 0.08, 0.62, X, 0.04, Z);
    },
    hay(X, Z) {
      part(sceneGroup, 0xe0c060, 0.82, 0.5, 0.56, X, 0.25, Z).rotation.y = 0.3;
      part(sceneGroup, 0xb89a40, 0.84, 0.52, 0.06, X, 0.25, Z).rotation.y = 0.3;
      part(sceneGroup, 0xe8cc70, 0.6, 0.4, 0.44, X + 0.1, 0.7, Z - 0.05).rotation.y = -0.2;
    },
    pumpkins(X, Z) {
      [[0, 0, 0.42], [0.32, 0.22, 0.3], [-0.26, 0.25, 0.26]].forEach(([dx, dz, s]) => {
        part(sceneGroup, 0xf08a2a, s, s * 0.8, s, X + dx, s * 0.4, Z + dz);
        part(sceneGroup, 0xe0782a, s * 0.4, s * 0.82, s * 1.02, X + dx, s * 0.4, Z + dz);
        part(sceneGroup, 0x5a8a3a, 0.06, 0.12, 0.06, X + dx, s * 0.8 + 0.05, Z + dz);
      });
    },
    well(X, Z) {
      const st = [0x8a86a0, 0x9692ac, 0x7a7690];
      [[0, 0.34, 0.7, 0.12], [0, -0.34, 0.7, 0.12], [0.34, 0, 0.12, 0.7], [-0.34, 0, 0.12, 0.7]].forEach(([dx, dz, w, d], i) =>
        part(sceneGroup, st[i % 3], w + 0.02, 0.5, d + 0.02, X + dx, 0.25, Z + dz));
      const w = new THREE.Mesh(geo(0.56, 0.04, 0.56), new THREE.MeshLambertMaterial({ color: SC.pond.water }));
      w.position.set(X, 0.32, Z); sceneGroup.add(w);
      part(sceneGroup, 0x6a4a34, 0.07, 0.8, 0.07, X - 0.34, 0.9, Z); part(sceneGroup, 0x6a4a34, 0.07, 0.8, 0.07, X + 0.34, 0.9, Z);
      part(sceneGroup, 0x5a463a, 0.9, 0.08, 0.5, X, 1.33, Z - 0.12).rotation.x = -0.5;
      part(sceneGroup, 0x5a463a, 0.9, 0.08, 0.5, X, 1.33, Z + 0.12).rotation.x = 0.5;
      part(sceneGroup, 0x7a5a40, 0.18, 0.16, 0.18, X, 0.78, Z);
    },
    bench(X, Z) {
      part(sceneGroup, 0x8a6a4a, 0.9, 0.08, 0.32, X, 0.34, Z).rotation.y = Math.PI / 4;
      part(sceneGroup, 0x7a5a40, 0.9, 0.24, 0.06, X - 0.1, 0.56, Z - 0.1).rotation.y = Math.PI / 4;
      [[-0.3, -0.3], [0.3, 0.3]].forEach(([dx, dz]) => part(sceneGroup, 0x5a4030, 0.08, 0.34, 0.24, X + dx * 0.9, 0.17, Z + dz * 0.9).rotation.y = Math.PI / 4);
    },
  };

  function buildProps(r) {
    SC.props.forEach(([kind, gx, gz]) => PROPS[kind](cellX(gx), cellZ(gz)));
    // stepping stones from the front door
    SC.path.forEach(([gx, gz]) => {
      [[-0.18, -0.15], [0.2, 0.18]].forEach(([dx, dz]) => {
        const st = part(sceneGroup, pick(COL.stone, r), 0.42, 0.08, 0.36, cellX(gx) + dx, 0.04, cellZ(gz) + dz);
        st.rotation.y = R(r, -0.4, 0.4);
        st.receiveShadow = true;
      });
    });
  }

  // flowers, glowing mushrooms, little rocks at cell corners
  function buildDecor(r) {
    for (let i = 0; i < 46; i++) {
      const gx = (r() * GRID) | 0, gz = (r() * GRID) | 0;
      if (RESERVED.has(gx + ',' + gz)) continue;
      const x = cellX(gx) + (r() < 0.5 ? -0.42 : 0.42), z = cellZ(gz) + (r() < 0.5 ? -0.42 : 0.42);
      const kind = r();
      if (kind < 0.45) {
        part(sceneGroup, 0x4f7f5a, 0.04, 0.2, 0.04, x, 0.1, z);
        part(sceneGroup, pick(SC.flowers, r), 0.12, 0.12, 0.12, x, 0.24, z);
      } else if (kind < 0.8) {
        part(sceneGroup, 0xe8e4f4, 0.06, 0.12, 0.06, x, 0.06, z);
        const cap = new THREE.Mesh(geo(0.18, 0.08, 0.18), glowMat(pick(SC.glow, r)));
        cap.position.set(x, 0.16, z);
        sceneGroup.add(cap);
      } else {
        part(sceneGroup, pick(COL.stone, r), 0.2, 0.12, 0.16, x, 0.06, z).rotation.y = R(r, 0, 2);
      }
    }
  }

  // the island's old trees
  function decorTree(gx, gz, h, seed) {
    const group = new THREE.Group();
    group.position.set(cellX(gx), 0, cellZ(gz));
    sceneGroup.add(group);
    const p = { kind: 'tree', gx, gz, h, seed, state: 'alive', group, blocks: [], built: h, crownBuilt: true };
    for (let lv = 0; lv < h; lv++) SPECIES.tree.level(p, lv, rngFor(seed, lv));
    SPECIES.tree.crown(p, rngFor(seed, 99));
    p.blocks.forEach(b => { b.mesh.scale.setScalar(1); b.age = 1; });
    p.sway = Math.random() * 6;
    decorTrees.push(p);
  }

  function buildDust() {
    const m = new THREE.MeshBasicMaterial({ color: 0xffeef8, transparent: true, opacity: 0.45 });
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Mesh(geo(0.05, 0.05, 0.05), m);
      s.position.set(rand(-HALF, HALF), rand(0.6, 5), rand(-HALF, HALF));
      fxGroup.add(s);
      particles.push({ mesh: s, base: s.position.clone(), phase: Math.random() * 6.28, speed: rand(0.2, 0.5) });
    }
  }

  // stars on a big plane behind the island, facing the (fixed) camera
  function buildStars() {
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const n = 420, pos = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.copy(ISO_DIR).multiplyScalar(-60).addScaledVector(right, rand(-60, 60)).addScaledVector(up, rand(-35, 40));
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starField = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xfff6e0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false,
    }));
    scene.add(starField);
  }

  // --- Rain cloud (short breaks) ---
  const CLOUD_Y = SKY - 1.2;
  function buildRain() {
    rain.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    rain.mat = new THREE.MeshBasicMaterial({ color: 0xb8d4ff, transparent: true, opacity: 0, depthWrite: false });
    const cloud = new THREE.Group();
    [[0, 0, 0, 1.2], [0.95, -0.1, 0.1, 0.95], [-0.95, -0.05, -0.1, 1.0], [0.45, 0.5, 0, 0.85],
     [-0.45, 0.45, 0.1, 0.8], [1.7, -0.2, 0, 0.6], [-1.75, -0.2, 0.05, 0.62], [0, -0.3, 0.45, 0.8],
     [0.3, -0.1, -0.7, 0.9], [-0.6, 0.1, 0.7, 0.8]]
      .forEach(([x, y, z, s]) => {
        const c = new THREE.Mesh(geo(s, s * 0.8, s), rain.cloudMat);
        c.position.set(x, y, z);
        cloud.add(c);
      });
    cloud.scale.setScalar(1.6);
    cloud.position.set(0, CLOUD_Y, 0);
    cloud.visible = false;
    fxGroup.add(cloud);
    rain.cloud = cloud;
    for (let i = 0; i < 120; i++) {
      const d = new THREE.Mesh(geo(0.05, 0.34, 0.05), rain.mat);
      d.visible = false;
      fxGroup.add(d);
      rain.drops.push({ mesh: d, v: rand(6, 8) });
      resetDrop(rain.drops[i], true);
    }
  }
  function resetDrop(d, scatter) {
    const cx = rain.cloud ? rain.cloud.position.x : 0, cz = rain.cloud ? rain.cloud.position.z : 0;
    d.mesh.position.set(cx + rand(-2.8, 2.8), scatter ? rand(0, CLOUD_Y - 0.8) : CLOUD_Y - 0.8, cz + rand(-1.6, 1.6));
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
        add(p, COL.trunk, 0.4, 1, 0.4, 0, yAt(lv), 0);
        if (lv % 2 === 1) add(p, 0x5a4030, 0.44, 0.1, 0.44, 0, yAt(lv) + 0.3, 0);   // bark rings
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
        // a lower side cluster, like layered foliage
        const sx = r() < 0.5 ? 1 : -1;
        add(p, pick(COL.blossom, r), 0.75, 0.6, 0.75, sx * 1.05, y - 0.75, -sx * 0.35);
        add(p, COL.trunk, 0.5, 0.12, 0.12, sx * 0.5, y - 1.0, -sx * 0.18, 0, -sx * 0.5);
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
    for (let x = 0; x < BOX_W; x++) for (let z = 0; z < BOX_D; z++) {
      const k = x + ',' + z;
      if (!occ.has(k) && !RESERVED.has(k)) out.push({ x, z });
    }
    return out;
  }

  // tall things go to the back, small things to the front, trees away from the glass
  function chooseCell(kind, h) {
    let cells = freeCells();
    if (kind === 'tree') cells = cells.filter(c => c.x >= 1 && c.x <= GRID - 2 && c.z >= 1 && c.z <= GRID - 2);
    if (!cells.length) return null;
    const weights = cells.map(c => {
      const back = 1 - (c.x + c.z) / (2 * (GRID - 1));      // far corner of the iso view
      return h >= 4 ? 0.7 + back * 0.8 : 0.7 + (1 - back) * 0.8;   // gentle depth bias; the island is roomy
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
    const taken = new Set();
    (list || []).forEach((d, i) => {
      // plants from an older layout (or the jar) can land on scenery: move them to a free plot
      let k = d.gx + ',' + d.gz;
      if (d.gx < 0 || d.gz < 0 || d.gx >= GRID || d.gz >= GRID || RESERVED.has(k) || taken.has(k)) {
        const free = [];
        for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
          const c = x + ',' + z;
          if (!RESERVED.has(c) && !taken.has(c) && !(list || []).some(o => o !== d && o.gx + ',' + o.gz === c)) free.push({ x, z });
        }
        if (!free.length) return;
        const c = free[(d.seed >>> 0) % free.length];
        d = Object.assign({}, d, { gx: c.x, gz: c.z });
        k = c.x + ',' + c.z;
      }
      taken.add(k);
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
    g.scale.setScalar(0.7);
    g.position.set(1, 0, HALF - 0.22);              // crawls along the front rim
    return { g, dir: 1, speed: 0.14, pause: 0 };
  }

  function makeLadybug() {
    const g = new THREE.Group();
    part(g, 0xe03a2e, 0.28, 0.14, 0.24, 0, 0.07, 0);
    part(g, 0x1c1c22, 0.1, 0.1, 0.16, 0.18, 0.06, 0);
    part(g, 0x1c1c22, 0.07, 0.03, 0.07, -0.05, 0.15, 0.06);
    part(g, 0x1c1c22, 0.07, 0.03, 0.07, 0.06, 0.15, -0.06);
    part(g, 0x1c1c22, 0.02, 0.03, 0.24, 0, 0.15, 0);
    const F = SC.fence, mid = (F.from + F.to) / 2;   // walks the fence rail
    if (F.axis === 'z') g.position.set(F.at, 0.6, mid); else g.position.set(mid, 0.6, F.at);
    return { g, dir: 1, speed: 0.35, pause: 2, t: 0, axis: F.axis, lo: F.from + 0.3, hi: F.to - 0.3 };
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
    g.scale.setScalar(0.85);
    g.position.copy(pondInfo.pads[0]);             // lives on the lily pads
    g.rotation.y = Math.PI / 4;
    return { g, eyes, throat, blinkIn: 3, hopIn: 9, hop: -1, croak: 0, pad: 0 };
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
        e.g.position.set(0, 1.5, 0);
        e.target = new THREE.Vector3(0, 1.5, 0); e.retarget = 0; e.vis = 1;
      },
      update(e, dt, t) {
        e.vis += ((moodName === 'night' ? 0 : 1) - e.vis) * (1 - Math.exp(-dt * 2));
        e.g.scale.setScalar(Math.max(0.001, e.vis));
        e.retarget -= dt;
        if (e.retarget <= 0) {
          const blooms = plants.filter(p => p.crownBuilt && p.state === 'alive');
          if (blooms.length && Math.random() < 0.8) e.target.copy(plantTop(pick(blooms))).add(new THREE.Vector3(0.15, 0.25, 0.2));
          else e.target.set(rand(-4.5, 4.5), rand(0.6, 3.5), rand(-4.5, 4.5));
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
        e.g.position.set(cellX(SC.spots.bunny[0]), 0, cellZ(SC.spots.bunny[1]));
        e.g.rotation.y = Math.PI / 4;
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
          e.g.position.y = Math.sin(Math.min(1, e.hop) * Math.PI) * 0.35;
          if (e.hop >= 1) { e.hop = -1; e.g.position.y = 0; }
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
        e.g.position.copy(home.cat.pos);              // napping on the island's home
        e.g.rotation.y = home.cat.ry;
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
        const F = SC.fence;                            // on the end fence post
        if (F.axis === 'z') e.g.position.set(F.at, 0.73, F.from); else e.g.position.set(F.from, 0.73, F.at);
        e.g.rotation.y = Math.PI / 4;
        e.blinkIn = 2;
      },
      update(e, dt, t) {
        const awake = moodName !== 'day';
        e.blinkIn -= dt;
        if (e.blinkIn <= 0) e.blinkIn = rand(2, 5);
        const open = awake && e.blinkIn > 0.15;
        e.lids.forEach(l => { l.scale.y += ((open ? 0.01 : 1) - l.scale.y) * (1 - Math.exp(-dt * 14)); });
        e.g.rotation.y = Math.PI / 4 + (awake ? Math.sin(t * 0.4) * 0.6 : 0);
      },
    },

    fairyLights: {
      build(preview) {
        const T0 = SC.trees[0];
        const A = preview ? new THREE.Vector3(-1.4, 0, 0) : home.eave.clone();
        const B = preview ? new THREE.Vector3(1.4, 0, 0) : new THREE.Vector3(cellX(T0[0]) + 0.15, T0[2] - 0.7, cellZ(T0[1]) + 0.2);
        const swags = preview ? 2 : 1, sag = preview ? 0.55 : 0.7;
        const g = new THREE.Group();
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const u = i / 40, f = (u * swags) % 1;
          pts.push(A.clone().lerp(B, u).add(new THREE.Vector3(0, -Math.sin(f * Math.PI) * sag, 0)));
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
          const w = new THREE.Mesh(geo(0.025, 0.025, len), mat(0x3a3448));
          w.position.copy(a).lerp(b, 0.5);
          w.lookAt(b);
          g.add(w);
        }
        const cols = [0xfff1c8, 0xffb3e0, 0xffd27a, 0xc8b8ff, 0xa8d0ff];
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
        return { g, bulbs, mid: pts[20].clone() };
      },
      place() {},
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
        part(g, 0x7a7690, 0.34, 0.12, 0.34, 0, 0.06, 0);
        part(g, iron, 0.1, 1.7, 0.1, 0, 0.9, 0);
        part(g, iron, 0.5, 0.07, 0.07, 0.22, 1.72, 0);
        part(g, iron, 0.03, 0.16, 0.03, 0.42, 1.62, 0);
        const L0 = new THREE.Group();
        L0.position.set(0.42, 1.54, 0);
        part(L0, iron, 0.24, 0.06, 0.24, 0, 0, 0);
        part(L0, iron, 0.32, 0.05, 0.32, 0, -0.05, 0);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => part(L0, iron, 0.04, 0.3, 0.04, sx * 0.13, -0.22, sz * 0.13));
        part(L0, iron, 0.32, 0.05, 0.32, 0, -0.39, 0);
        const core = new THREE.Mesh(geo(0.2, 0.24, 0.2), glowMat(0xffd27a));
        core.position.y = -0.22;
        L0.add(core);
        g.add(L0);
        const light = new THREE.PointLight(0xffc070, 0.5, 6, 1.6);
        light.position.set(0.42, 1.32, 0);
        g.add(light);
        const h = halo(0xffd890, 1.8);
        h.position.set(0.42, 1.32, 0);
        g.add(h);
        return { g, light, h, L0 };
      },
      place(e) { e.g.position.set(cellX(SC.spots.lamp[0]), 0, cellZ(SC.spots.lamp[1])); e.g.rotation.y = Math.PI / 4; },
      update(e, dt, t) {
        e.L0.rotation.z = Math.sin(t * 0.9) * 0.05;
        e.light.intensity = 0.25 + moodCur.glow * 1.8;
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
        e.g.position.set(cellX(SC.spots.gnome[0]), 0, cellZ(SC.spots.gnome[1]));
        e.g.rotation.y = Math.PI / 4;
        e.wobIn = rand(5, 10); e.wob = 0;
      },
      update(e, dt, t) {
        e.wobIn -= dt;
        if (e.wobIn <= 0) { e.wob = 1; e.wobIn = rand(8, 16); }
        e.wob = Math.max(0, e.wob - dt);
        e.g.rotation.z = Math.sin(e.wob * 20) * 0.08 * e.wob;
      },
    },

    mossyRocks: {
      build() {
        const g = new THREE.Group();
        const r = mulberry32(77);
        [[0, 0, 0, 0.7, 0.55, 0.6], [0.45, 0, 0.3, 0.45, 0.35, 0.4], [-0.35, 0, 0.35, 0.38, 0.28, 0.34]].forEach(([x, , z, w, h, d]) => {
          part(g, pick(COL.stone, r), w, h, d, x, h / 2, z).rotation.y = R(r, -0.4, 0.4);
          part(g, pick(COL.moss, r), w * 0.8, 0.12, d * 0.75, x - 0.03, h + 0.04, z);
          for (let i = 0; i < 3; i++) part(g, pick(COL.moss, r), 0.14, 0.14, 0.14, x + R(r, -w / 2, w / 2), R(r, 0.08, h), z + d / 2);
          if (r() < 0.8) part(g, pick([0xffffff, 0xffd94a, 0xff9acb, 0xb084f0], r), 0.08, 0.08, 0.08, x, h + 0.14, z);
        });
        return { g };
      },
      place(e) { e.g.position.set(cellX(SC.spots.rocks[0]), 0, cellZ(SC.spots.rocks[1])); },
    },

    balloon: {
      build() {
        const g = new THREE.Group();
        const env = new THREE.Group();
        const rows = [0.36, 0.62, 0.8, 0.9, 0.92, 0.86, 0.72, 0.52, 0.3];
        const cols = [0xff8fb8, 0xfff0e0, 0xc8a8f0];
        rows.forEach((rr, i) => {
          const y = 2.4 - i * 0.26;
          part(env, cols[i % 3], rr * 2, 0.27, rr * 2, 0, y, 0);
          part(env, cols[(i + 1) % 3], rr * 2 + 0.02, 0.27, rr * 0.6, 0, y, 0);   // vertical gore stripe
        });
        part(env, 0xb06a8a, 0.36, 0.14, 0.36, 0, 0.18 + 0.12, 0);
        g.add(env);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => part(g, 0x5a4636, 0.03, 0.62, 0.03, sx * 0.2, -0.05, sz * 0.2));
        part(g, 0x9a6a40, 0.5, 0.36, 0.5, 0, -0.5, 0);
        part(g, 0x7a5232, 0.54, 0.06, 0.54, 0, -0.32, 0);
        const flame = new THREE.Mesh(geo(0.12, 0.16, 0.12), glowMat(0xffb040));
        flame.position.y = 0.12;
        g.add(flame);
        g.scale.setScalar(0.85);
        return { g, flame };
      },
      place(e) { e.g.position.set(3, 6.4, -1); e.ang = 0; },
      update(e, dt, t) {
        e.ang += dt * 0.07;
        e.g.position.set(Math.cos(e.ang) * 3.6, 6.2 + Math.sin(t * 0.6) * 0.25, Math.sin(e.ang) * 3.6 - 0.5);
        e.g.rotation.y = -e.ang;
        e.flame.scale.y = 1 + Math.sin(t * 9) * 0.25;
      },
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
          const at = e.mid ? e.mid.clone() : e.g.position.clone();
          if (k === 'lantern') at.y += 1.2;
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
      const grass = new THREE.Mesh(geo(1.3, 0.16, 1.3), mat(COL.grass[0]));
      grass.position.y = -0.08;
      const soil = new THREE.Mesh(geo(1.3, 0.26, 1.3), mat(COL.dirt[0]));
      soil.position.y = -0.29;
      holder.add(grass, soil);
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
    core.position.set(rand(-4.5, 4.5), rand(0.5, 3.5), rand(-4.5, 4.5));
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

  // island bounds in client pixels (for the onboarding spotlight)
  function screenRect() {
    const rect = renderer.domElement.getBoundingClientRect();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => [-2.7, 5.4].forEach(y => {
      const v = new THREE.Vector3(sx * HALF, y, sz * HALF);
      terrariumGroup.localToWorld(v); v.project(camera);
      const px = rect.left + (v.x + 1) / 2 * rect.width, py = rect.top + (1 - v.y) / 2 * rect.height;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    })));
    return { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0 };
  }

  // =========================================================
  // Snapshot for the garden album
  // =========================================================
  function capture(bg) {
    renderer.render(scene, camera);
    const src = renderer.domElement;
    // project the island's bounds to find a tight crop
    const pts = [];
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => [-2.8, 6].forEach(y => {
      const v = new THREE.Vector3(sx * (HALF + 0.3), y, sz * (HALF + 0.3));
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

    // the old trees sway and drop petals too
    decorTrees.forEach(p => {
      p.group.rotation.z = Math.sin(t * 1.1 + p.sway) * 0.012;
      p.petalTimer -= dt;
      if (p.petalTimer <= 0) { p.petalTimer = rand(1.2, 3.5); dropPetal(p); }
    });

    // chimney smoke
    sceneAnims.forEach(fn => fn(dt, t));
    if (home && home.smokeAt) {
      home.smokeIn -= dt;
      if (home.smokeIn <= 0) {
        home.smokeIn = 1.1;
        const m = new THREE.Mesh(geo(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0xf0e6f4, transparent: true, opacity: 0 }));
        m.position.copy(home.smokeAt);
        fxGroup.add(m);
        smoke.push({ m, life: 0 });
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const sm = smoke[i];
        sm.life += dt;
        sm.m.position.y += dt * 0.45;
        sm.m.position.x += dt * 0.12;
        sm.m.rotation.y += dt * 0.5;
        sm.m.scale.setScalar(1 + sm.life * 0.35);
        sm.m.material.opacity = Math.min(1, sm.life * 1.5) * Math.max(0, 1 - sm.life / 4.5) * 0.7;
        if (sm.life > 4.5) { fxGroup.remove(sm.m); sm.m.material.dispose(); smoke.splice(i, 1); }
      }
    }

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
    rain.cloud.position.x = Math.sin(t * 0.2) * 2.2;
    rain.cloud.position.z = Math.cos(t * 0.15) * 1.2;
    rain.cloud.position.y = CLOUD_Y + Math.sin(t * 0.7) * 0.1;
    rain.drops.forEach(d => {
      d.mesh.visible = vis;
      if (!vis) return;
      d.mesh.position.y -= d.v * dt;
      if (d.mesh.position.y < 0.05) resetDrop(d, false);
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
        f.target.set(rand(-HALF + 0.5, HALF - 0.5), rand(0.4, 4.5), rand(-HALF + 0.5, HALF - 0.5));
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
        b.target.set(rand(-4.5, 4.5), rand(0.8, 4.5), rand(-4.5, 4.5));
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
        if (sn.g.position.x > 3.8 || sn.g.position.x < -3.8) {
          sn.dir *= -1; sn.pause = rand(2, 6);
          sn.g.position.x = clamp(sn.g.position.x, -3.8, 3.8);
        }
      }
      sn.g.rotation.y += ((sn.dir > 0 ? 0 : Math.PI) - sn.g.rotation.y) * (1 - Math.exp(-dt * 2));
      sn.g.scale.x = 0.8 * (1 + Math.sin(t * 2) * 0.04);
    }
    const lb = critters.ladybug;
    if (lb) {
      if (lb.pause > 0) lb.pause -= dt;
      else {
        lb.g.position[lb.axis] += lb.dir * lb.speed * dt;
        lb.t -= dt;
        if (lb.t <= 0) { lb.pause = rand(1, 4); lb.t = rand(2, 6); if (Math.random() < 0.4) lb.dir *= -1; }
        const u = lb.g.position[lb.axis];
        if (u > lb.hi || u < lb.lo) { lb.dir *= -1; lb.g.position[lb.axis] = clamp(u, lb.lo, lb.hi); }
      }
      const face = lb.axis === 'z' ? (lb.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (lb.dir > 0 ? 0 : Math.PI);
      lb.g.rotation.y += (face - lb.g.rotation.y) * (1 - Math.exp(-dt * 5));
    }
    const fr = critters.frog;
    if (fr) {
      fr.blinkIn -= dt;
      fr.eyes.scale.y = fr.blinkIn < 0.12 ? 0.15 : 1;
      if (fr.blinkIn <= 0) fr.blinkIn = rand(2.5, 6);
      fr.hopIn -= dt;
      if (fr.hopIn <= 0 && fr.hop < 0) { fr.hop = 0; fr.hopIn = rand(8, 16); }
      if (fr.hop >= 0) {
        // hop to the other lily pad
        fr.hop += dt * 1.6;
        const a = pondInfo.pads[fr.pad], b = pondInfo.pads[1 - fr.pad], k = Math.min(1, fr.hop);
        fr.g.position.lerpVectors(a, b, k);
        fr.g.position.y += Math.sin(k * Math.PI) * 0.7;
        fr.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        if (fr.hop >= 1) { fr.hop = -1; fr.pad = 1 - fr.pad; fr.g.position.copy(b); fr.g.rotation.y = Math.PI / 4; fr.croak = 1.2; }
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
    spawnButterfly, onHover, capture, screenRect, freeCount: () => freeCells().length,
    get CAPACITY() { return BOX_W * BOX_D - RESERVED.size; },
    setScene, scene: () => sceneId,
    SCENES: Object.keys(SCENES).map(id => ({ id, name: SCENES[id].name, tag: SCENES[id].tag,
      swatch: [SCENES[id].grass[1], SCENES[id].blossom[0], SCENES[id].pond.water] })),
  };
})();
