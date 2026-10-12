// Glue: pomodoro timer + tasks → terrarium + UI + sound. Everything persists through Store
// (localStorage on the web, mirrored to SQLite in the Android app).
Store.ready.then(function () {
  const $ = id => document.getElementById(id);
  // ?speed=60 makes a minute pass in a second — handy for demoing the garden
  const SPEED = Math.max(1, +new URLSearchParams(location.search).get('speed') || 1);
  // The island keeps its own save (seeded once from the jar version) so the two
  // branches never trample each other's gardens.
  const KEY = 'pomodoro_terrarium_island_v1', JAR_KEY = 'pomodoro_terrarium_v1';

  const DEFAULTS = {
    settings: { focus: 25, short: 5, long: 15, longEvery: 4, fx: true, amb: true, autoBreak: false, season: 'auto', awake: true, haptics: true, testSeconds: false },
    timer: { mode: 'focus', status: 'idle', endAt: 0, remaining: 0, total: 0, growingId: null },
    cycle: 0,
    tasks: [],
    activeTaskId: null,
    garden: [],
    shelf: [],
    stats: { total: 0, tasks: 0, days: {} },
    unlocked: {},
    seenWelcome: false,
    coins: null,       // null → first run with coins: seeded from past progress
    owned: {},         // shop critters/accents bought
    placed: {},        // ...and currently shown on the island
    bought: {},        // shop flower purchase counts
    scene: null,       // which island preset this garden lives on
    land: 0,           // land expansions bought (0 = 11x11, 1 = 13x13, 2 = 15x15)
  };

  const CRITTERS = [
    { k: 'butterfly', icon: '🦋', name: 'Butterflies', hint: 'Bloom your first focus plant.', toast: 'A butterfly found your first bloom! 🦋' },
    { k: 'snail', icon: '🐌', name: 'Snail', hint: 'Bloom 3 focus plants.', toast: 'A snail is exploring the garden rim. Slow and steady 🐌' },
    { k: 'ladybug', icon: '🐞', name: 'Ladybug', hint: 'Finish 5 tasks.', toast: 'A ladybug is patrolling the fence 🐞' },
    { k: 'firefly', icon: '✨', name: 'Fireflies', hint: 'Take a long break.', toast: 'Fireflies came out for your long break ✨' },
    { k: 'tree', icon: '🌸', name: 'Cherry tree', hint: 'Finish a full set of 4 pomodoros.', toast: 'A cherry blossom tree! Every 4th pomodoro grows one 🌸' },
    { k: 'frog', icon: '🐸', name: 'Frog', hint: 'Bloom 10 focus plants.', toast: 'A frog moved onto the lily pads 🐸' },
  ];

  const COINS = { task: 2, bloom: 3 };
  const SHOP = [
    { id: 'lavender', cat: 'flowers', kind: 'lavender', price: 6, name: 'Lavender', desc: 'Three soft purple spikes. Smells like calm.' },
    { id: 'cactus', cat: 'flowers', kind: 'cactus', price: 7, name: 'Blooming cactus', desc: 'Prickly outside, pink flower on top.' },
    { id: 'rose', cat: 'flowers', kind: 'rose', price: 8, name: 'Velvet rose', desc: 'A layered rose with tiny thorns.' },
    { id: 'lily', cat: 'flowers', kind: 'lily', price: 9, name: 'Lily of the valley', desc: 'A little arch of white bells.' },
    { id: 'flytrap', cat: 'flowers', kind: 'flytrap', price: 12, name: 'Venus flytrap', desc: 'Eats distractions. Probably.' },
    { id: 'moonflower', cat: 'flowers', kind: 'moonflower', price: 15, name: 'Moonflower', desc: 'Glows softly, brightest on long breaks.' },
    { id: 'bonsai', cat: 'flowers', kind: 'bonsai', price: 20, name: 'Bonsai pine', desc: 'Patiently pruned cloud pads.' },
    { id: 'rainbow', cat: 'flowers', kind: 'rainbow', price: 25, name: 'Rainbow tulip', desc: 'Every petal a different color.' },
    { id: 'hydrangea', cat: 'flowers', kind: 'hydrangea', price: 10, name: 'Hydrangea', desc: 'A big puffball of blue, pink or purple florets.' },
    { id: 'foxglove', cat: 'flowers', kind: 'foxglove', price: 11, name: 'Foxglove', desc: 'A tall spike of freckled bells.' },
    { id: 'paradise', cat: 'flowers', kind: 'paradise', price: 14, name: 'Bird of paradise', desc: 'Looks like a tiny orange bird mid-song.' },
    { id: 'monstera', cat: 'flowers', kind: 'monstera', price: 18, name: 'Monstera', desc: 'Big split leaves, very houseplant-core.' },
    { id: 'crystal', cat: 'flowers', kind: 'crystal', price: 30, name: 'Crystal bloom', desc: 'Glowing gem shards. Sparkles brightest at night.' },
    { id: 'cat_diego', cat: 'fauna', price: 0, family: true, name: 'Diego', desc: 'Rosetted Bengal. Stalks butterflies, naps in sunbeams.', toast: 'Diego is prowling the island 🐾' },
    { id: 'cat_ramses', cat: 'fauna', price: 0, family: true, name: 'Ramses', desc: 'Spotted Savannah. Long legs, big ears, always exploring.', toast: 'Ramses moved in and is already exploring 🐾' },
    { id: 'cat_cali', cat: 'fauna', price: 0, family: true, name: 'Cali', desc: 'Calico shorthair. Patches of orange, black and white.', toast: 'Cali found a sunny spot 🐾' },
    { id: 'cat_neo', cat: 'fauna', price: 0, family: true, name: 'Neo', desc: 'White shorthair with big grey tabby patches.', toast: 'Neo is wandering the garden 🐾' },
    { id: 'bee', cat: 'fauna', price: 15, name: 'Bumblebee', desc: 'Visits your blooms by day, naps at night.', toast: 'A bumblebee is buzzing between your blooms 🐝' },
    { id: 'bunny', cat: 'fauna', price: 25, name: 'Bunny', desc: 'Sits in the front corner, twitches its nose, flops an ear.', toast: 'A bunny hopped into the corner 🐰' },
    { id: 'owl', cat: 'fauna', price: 30, name: 'Night owl', desc: 'Dozes on a fence post by day, wide awake at dusk.', toast: 'An owl perched on the corner 🦉' },
    { id: 'cat', cat: 'fauna', price: 45, name: 'Sleepy cat', desc: 'Naps on the cabin roof by the chimney. Zzz.', toast: 'A cat is napping on the cabin roof. Shh 🐈' },
    { id: 'mossyRocks', cat: 'accents', price: 10, name: 'Mossy boulders', desc: 'Soft, moss-capped stones with tiny flowers.', toast: 'Mossy boulders settled into the corner 🌿' },
    { id: 'lantern', cat: 'accents', price: 15, name: 'Lamp post', desc: 'A little lantern by the path, cozier at night.', toast: 'A lamp post is glowing by the path 🏮' },
    { id: 'gnome', cat: 'accents', price: 18, name: 'Garden gnome', desc: 'Guards the cabin door. Wobbles when nobody looks.', toast: 'A gnome is guarding your garden' },
    { id: 'fairyLights', cat: 'accents', price: 22, name: 'Fairy lights', desc: 'Twinkly lights from the cabin to the old tree.', toast: 'Fairy lights strung up ✨' },
    { id: 'balloon', cat: 'accents', price: 35, name: 'Hot-air balloon', desc: 'Drifts in slow circles above your island.', toast: 'A hot-air balloon is drifting overhead 🎈' },
  ];
  SHOP.push(
    { id: 'land1', cat: 'land', price: 40, land: 1, name: 'Meadow expansion', desc: 'Grow your island to 13×13: a new ring of grass all the way around, +48 plots.' },
    { id: 'land2', cat: 'land', price: 90, land: 2, name: 'Grand estate', desc: 'Grow to 15×15 for another +56 plots. Room for every flower you can dream up.' },
  );
  const COIN_SVG = document.querySelector('.coin').outerHTML;

  // ---------- persistence ----------
  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(JAR_KEY)) || {}; } catch (e) {}
    const s = JSON.parse(JSON.stringify(DEFAULTS));
    Object.keys(saved).forEach(k => {
      s[k] = (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) ? Object.assign(s[k], saved[k]) : saved[k];
    });
    return s;
  }
  let S = load();
  if (S.coins == null) S.coins = 5 + COINS.task * S.stats.tasks + COINS.bloom * S.stats.total;
  // gardens from before island presets keep their original island; brand-new ones get a surprise
  if (!S.scene) S.scene = (S.seenWelcome || S.garden.length) ? 'hollow' : Terrarium.SCENES[(Math.random() * Terrarium.SCENES.length) | 0].id;
  // the jar-only accents became island accents
  [['mossyFrame', 'mossyRocks'], ['goldenFrame', 'balloon']].forEach(([a, b]) => {
    if (S.owned[a]) { S.owned[b] = true; S.placed[b] = S.placed[a]; delete S.owned[a]; delete S.placed[a]; }
  });
  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => Store.set(KEY, JSON.stringify(S));
    if (now) { write(); Store.flush(); } else saveTimer = setTimeout(write, 150);
  }
  function syncGarden() { S.garden = Terrarium.serialize(); save(); renderStats(); }

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function today() {
    const k = dayKey();
    return S.stats.days[k] || (S.stats.days[k] = { pomos: 0, minutes: 0, tasks: 0 });
  }
  function streak() {
    let n = 0;
    const d = new Date();
    if (!(S.stats.days[dayKey(d)] || {}).pomos) d.setDate(d.getDate() - 1);   // today not started yet is fine
    while ((S.stats.days[dayKey(d)] || {}).pomos) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
  function activeTask() { return S.tasks.find(t => t.id === S.activeTaskId && !t.done) || null; }

  // ---------- toasts ----------
  function toast(msg, ms) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = msg;
    $('toasts').appendChild(el);
    const live = $('toasts').querySelectorAll('.toast:not(.out)');
    if (live.length > 2) { live[0].classList.add('out'); setTimeout(() => live[0].remove(), 400); }
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms || 3800);
  }

  // ---------- scene ----------
  // Quebec seasons, read off the calendar in Quebec's own time zone
  const SEASON_LABEL = { spring: '🌸 Spring', summer: '☀️ Summer', fall: '🍁 Fall', winter: '❄️ Winter' };
  const SEASON_ORDER = ['auto', 'spring', 'summer', 'fall', 'winter'];
  function seasonFor(date) {
    const m = +new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal', month: 'numeric' }).format(date);
    return m === 12 || m <= 3 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall';
  }
  const currentSeason = () => S.settings.season === 'auto' ? seasonFor(new Date()) : S.settings.season;

  Terrarium.init($('scene'), { scene: S.scene, land: S.land, season: currentSeason() });
  // zoom: wheel or pinch on the island; a pill brings you back
  Terrarium.onView(z => { $('viewReset').hidden = z <= 1.02; });
  $('viewReset').addEventListener('click', () => Terrarium.resetView());
  Terrarium.load(S.garden);
  S.garden = Terrarium.serialize();     // plants may have been moved off scenery
  save();
  Sound.setFx(S.settings.fx);
  Sound.setAmb(S.settings.amb);

  // =====================================================
  // Timer
  // =====================================================
  const T = S.timer;
  const MODE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  // Test mode (settings) makes every "minute" a second, for trying the app quickly
  const unitMs = () => (S.settings.testSeconds ? 1000 : 60000) / SPEED;
  const unitLabel = () => S.settings.testSeconds ? 'sec' : 'min';
  function durMs(mode) { return S.settings[mode] * unitMs(); }
  function remaining() {
    if (T.status === 'running') return Math.max(0, T.endAt - Date.now());
    if (T.status === 'paused') return T.remaining;
    return durMs(T.mode);
  }

  function start() {
    Sound.unlock();
    if (T.status === 'running') return;
    if (T.status === 'idle') {
      T.total = durMs(T.mode);
      T.remaining = T.total;
      if (T.mode === 'focus') plantFocusSeed();
      if (T.mode === 'long' && !S.unlocked.firefly) unlock('firefly');
    }
    T.status = 'running';
    T.endAt = Date.now() + T.remaining;
    armAlarm();
    buzz('light');
    save(true);
    render();
  }

  // the OS fires this at T.endAt even if the app is backgrounded or killed
  function armAlarm() {
    const focus = T.mode === 'focus';
    Device.scheduleTimer(T.endAt,
      focus ? 'Your sprout bloomed! 🌼' : 'Break’s over 🌱',
      focus ? 'Focus session complete. Time for a break.' : 'Ready to plant another seed?');
  }
  function buzz(kind) { if (S.settings.haptics) Device.buzz(kind); }

  function plantFocusSeed() {
    if (Terrarium.freeCount() === 0) {
      toast('Your garden is full! Save it to the album in the garden panel to start fresh.', 5000);
      return;
    }
    const isTree = S.cycle % S.settings.longEvery === S.settings.longEvery - 1;
    const task = activeTask();
    const data = Terrarium.plantSeed(isTree ? 'tree' : 'focus',
      { task: task ? task.text : null, date: Date.now(), minutes: S.settings.focus, from: 'focus' },
      { long: S.settings.focus >= 40 });
    if (!data) return;
    T.growingId = data.id;
    Terrarium.setMarker(data.id);
    Sound.soft();
    syncGarden();
  }

  function pause() {
    if (T.status !== 'running') return;
    T.remaining = Math.max(0, T.endAt - Date.now());
    T.status = 'paused';
    Device.cancelTimer();
    save(true);
    render();
  }

  function stop() {
    if (T.mode !== 'focus' || T.status === 'idle') return;
    const elapsed = T.total - remaining();
    if (T.growingId != null) {
      if (elapsed < unitMs()) {
        Terrarium.remove(T.growingId);
        toast('Seed tucked back into your pocket 🌰');
      } else {
        Terrarium.wilt(T.growingId);
        Sound.wilt();
        toast('This sprout wilted. Finishing a task will revive it 💧', 4800);
      }
    }
    T.growingId = null;
    Terrarium.setMarker(null);
    T.status = 'idle';
    Device.cancelTimer();
    syncGarden();
    save(true);
    render();
  }

  function complete() {
    const mode = T.mode;
    T.status = 'idle';
    Device.cancelTimer();          // celebrating in person, so the OS ping isn't needed
    buzz('done');
    if (mode === 'focus') {
      const day = today();
      S.stats.total++;
      day.pomos++;
      if (!S.settings.testSeconds) day.minutes += S.settings.focus;   // test sessions don't inflate focus time
      const task = activeTask();
      if (task) task.pomos = (task.pomos || 0) + 1;
      S.cycle++;
      let label = 'garden';
      if (T.growingId != null) {
        const p = Terrarium.bloom(T.growingId);
        if (p) {
          label = Terrarium.speciesLabel(p.kind).toLowerCase();
          if (p.kind === 'tree') unlock('tree');
        }
      }
      T.growingId = null;
      Terrarium.setMarker(null);
      syncGarden();
      Sound.bloom();
      earn(COINS.bloom);
      toast(`Your ${esc(label)} bloomed 🌼 +${COINS.bloom} coins. Time for a break.`, 5000);
      setMode(S.cycle % S.settings.longEvery === 0 ? 'long' : 'short');
      checkUnlocks();
      if (S.settings.autoBreak) start();
    } else {
      Sound.breakOver();
      toast('Break\'s over. Ready to plant another seed? 🌱');
      setMode('focus');
    }
    save(true);
    renderAll();
  }

  function skip() {
    if (T.mode === 'focus') return;
    setMode('focus');
  }

  function setMode(mode) {
    if (T.mode === 'focus' && T.status !== 'idle') return;
    if (T.status === 'running') Device.cancelTimer();
    T.mode = mode;
    T.status = 'idle';
    T.remaining = T.total = durMs(mode);
    save(true);
    render();
  }

  // tick: drives growth + display. Uses wall-clock so background tabs stay correct.
  function tick() {
    if (T.status === 'running') {
      const rem = T.endAt - Date.now();
      if (rem <= 0) { complete(); return; }
      if (T.mode === 'focus' && T.growingId != null) {
        if (Terrarium.setGrowth(T.growingId, 1 - rem / T.total)) { Sound.plip(); syncGarden(); }
      }
    }
    renderTimer();
  }

  // =====================================================
  // Rendering
  // =====================================================
  let lastMood = null;
  function applyMood() {
    const mood = T.mode === 'focus' ? 'day' : T.mode === 'short' ? 'dusk' : 'night';
    document.body.dataset.mood = mood;
    Terrarium.setMood(mood);
    const resting = T.status === 'running';
    Terrarium.setRain(T.mode === 'short' && resting);
    Terrarium.setFireflies(T.mode === 'long' ? 3 + Math.min(11, today().pomos) : 0);
    Sound.setAmbience(T.mode === 'short' && resting ? 'rain' : T.mode === 'long' ? 'night' : 'none');
    lastMood = mood;
  }

  function fmt(ms) {
    const s = Math.ceil(ms / 1000 * SPEED);
    const m = Math.floor(s / 60), r = s % 60;
    return [String(m).padStart(2, '0'), String(r).padStart(2, '0')];
  }

  function renderTimer() {
    const rem = remaining();
    const [m, s] = fmt(rem);
    $('time').innerHTML = `${m}<span class="colon">:</span>${s}`;
    const total = T.status === 'idle' ? durMs(T.mode) : T.total;
    const prog = T.status === 'idle' ? 0 : 1 - rem / total;
    $('progress').style.width = (prog * 100).toFixed(2) + '%';
    document.title = T.status === 'idle' ? 'Pomodoro Terrarium' : `${m}:${s} · ${MODE_LABEL[T.mode]}${T.status === 'paused' ? ' (paused)' : ''}`;
    renderCaption(prog);
  }

  let lastCaption = '';
  function renderCaption(prog) {
    const task = activeTask();
    const taskBit = task ? ` for <b>${esc(task.text)}</b>` : '';
    let c;
    if (T.mode === 'focus') {
      if (T.status === 'idle') {
        if (Terrarium.freeCount() === 0) c = 'Your garden is full. Save it to the album to keep growing.';
        else if (S.cycle % S.settings.longEvery === S.settings.longEvery - 1) c = task ? `Something special is waiting to sprout${taskBit}…` : 'Something special is waiting to sprout…';
        else c = task ? `Next seed${taskBit}` : 'Pick a task, or just plant a seed and focus.';
      } else if (T.growingId == null) c = `Focusing${taskBit}`;
      else {
        const g = S.garden.find(p => p.id === T.growingId);
        const what = g && prog >= 0.5
          ? `It's a <b>${esc(Terrarium.speciesLabel(g.kind).toLowerCase())}</b>! Growing${taskBit}`
          : `A mystery seed is sprouting${taskBit}…`;
        c = T.status === 'paused' ? 'Paused. Your sprout is waiting for you.' : what;
      }
    } else if (T.mode === 'short') {
      c = T.status === 'running' ? 'Rain is watering your garden. Stretch, sip some water.' : 'You earned a rest. Let it rain for a bit.';
    } else {
      c = T.status === 'running' ? 'Fireflies are out. Rest well.' : 'A long break under the stars.';
    }
    if (c !== lastCaption) { $('caption').innerHTML = c; lastCaption = c; }
  }

  function render() {
    $('timer').classList.toggle('running', T.status === 'running');
    $('timer').classList.toggle('test', !!S.settings.testSeconds);
    Device.setAwake(S.settings.awake && T.mode === 'focus' && T.status === 'running');
    const main = $('mainBtn');
    if (T.status === 'running') main.textContent = 'Pause';
    else if (T.status === 'paused') main.textContent = 'Resume';
    else main.textContent = T.mode === 'focus' ? 'Plant & focus' : 'Start break';
    $('stopBtn').hidden = !(T.mode === 'focus' && T.status !== 'idle');
    $('skipBtn').hidden = T.mode === 'focus';
    document.querySelectorAll('#modes button').forEach(b => {
      b.classList.toggle('on', b.dataset.mode === T.mode);
      b.disabled = T.mode === 'focus' && T.status !== 'idle';
      b.style.opacity = b.disabled && b.dataset.mode !== T.mode ? 0.4 : '';
    });
    const n = S.settings.longEvery;
    const filled = T.mode === 'long' ? n : S.cycle % n;
    $('seeds').innerHTML = Array.from({ length: n }, (_, i) =>
      `<i class="${i < filled ? 'full' : ''} ${i === filled && T.mode === 'focus' ? 'next' : ''}"></i>`).join('');
    $('seeds').title = `${filled} of ${n} toward a long break`;
    applyMood();
    renderTimer();
  }

  // ---------- tasks ----------
  function renderTasks() {
    const list = $('taskList');
    const open = S.tasks.filter(t => !t.done).length;
    $('taskCount').textContent = S.tasks.length ? `${S.tasks.length - open}/${S.tasks.length} done` : '';
    if (!S.tasks.length) {
      list.innerHTML = '<li class="empty-tasks">Nothing planted yet.<br>Add what you\'re working on, then tend it with a pomodoro.<br>Each finished task grows something small.</li>';
      return;
    }
    list.innerHTML = S.tasks.map(t => `
      <li class="task${t.done ? ' done' : ''}${t.id === S.activeTaskId && !t.done ? ' active' : ''}" data-id="${t.id}">
        <button class="check" aria-label="Done"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
        <span class="t-text">${esc(t.text)}</span>
        <span class="t-right"><span class="t-pomos">${'<i></i>'.repeat(Math.min(8, t.pomos || 0))}</span><button class="t-del" aria-label="Remove">×</button></span>
      </li>`).join('');
  }

  $('addForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('taskInput').value.trim();
    if (!text) return;
    const t = { id: Date.now(), text, done: false, pomos: 0, planted: false, dirty: true, mt: Date.now() };
    S.tasks.push(t);
    if (!activeTask()) S.activeTaskId = t.id;
    $('taskInput').value = '';
    save(); renderTasks(); renderTimer();
    GTasks.touch();
  });

  $('taskList').addEventListener('click', e => {
    const li = e.target.closest('.task'); if (!li) return;
    const t = S.tasks.find(x => x.id === +li.dataset.id); if (!t) return;
    if (e.target.closest('.t-del')) {
      S.tasks.splice(S.tasks.indexOf(t), 1);
      if (S.activeTaskId === t.id) S.activeTaskId = null;
      if (t.gid) { S.gsync.tombs.push(t.gid); GTasks.touch(); }
    } else if (e.target.closest('.check')) {
      t.done = !t.done;
      t.dirty = true; t.mt = Date.now();
      if (t.done) finishTask(t);
      GTasks.touch();
    } else if (!t.done) {
      S.activeTaskId = S.activeTaskId === t.id ? null : t.id;
      Sound.unlock();
    }
    save(); renderTasks(); renderTimer();
  });

  function finishTask(t) {
    Sound.unlock();
    Sound.pop();
    buzz('light');
    if (S.activeTaskId === t.id) {
      const next = S.tasks.find(x => !x.done && x.id !== t.id);
      S.activeTaskId = next ? next.id : null;
    }
    if (t.planted) return;      // no farming plants by re-ticking
    t.planted = true;
    S.stats.tasks++;
    today().tasks++;
    setTimeout(() => earn(COINS.task), 250);
    const wilted = S.garden.find(p => p.state === 'wilted');
    if (wilted) {
      Terrarium.revive(wilted.id);
      toast(`“${esc(t.text)}” done! A wilted sprout perked back up 💧`);
    } else {
      const p = Terrarium.plantSeed('task', { task: t.text, date: Date.now(), from: 'task' }, { instant: true });
      toast(p ? `“${esc(t.text)}” done! A little ${esc(Terrarium.speciesLabel(p.kind).toLowerCase())} popped up` : `“${esc(t.text)}” done! 🎉`);
    }
    syncGarden();
    checkUnlocks();
    renderStats();
  }

  $('clearDone').addEventListener('click', () => {
    if (S.tasks.some(t => t.done && t.gid)) { S.gsync.clear = true; GTasks.touch(); }   // hides them in Google too
    S.tasks = S.tasks.filter(t => !t.done);
    save(); renderTasks();
  });

  // ---------- garden panel ----------
  function renderStats() {
    const d = today();
    $('sToday').textContent = d.pomos;
    $('sMinutes').innerHTML = d.minutes >= 60 ? `${Math.floor(d.minutes / 60)}<small>h</small> ${d.minutes % 60}<small>m</small>` : `${d.minutes}<small>m</small>`;
    $('sStreak').textContent = streak();
    $('sTotal').textContent = S.stats.total;
    const used = Terrarium.CAPACITY - Terrarium.freeCount();
    $('jarCount').textContent = `${used} / ${Terrarium.CAPACITY} plots`;
    $('jarMeter').style.width = (used / Terrarium.CAPACITY * 100) + '%';
    $('dayNote').textContent = '· ' + new Date().toLocaleDateString([], { weekday: 'long' }) + ' · ' + SEASON_LABEL[currentSeason()];
    renderChart();
  }

  // ---------- focus chart: 7-day bars or a 16-week heatmap ----------
  let chartView = 'week';
  const dayAt = offset => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - offset); return d; };
  const statsOn = d => S.stats.days[dayKey(d)] || { pomos: 0, minutes: 0, tasks: 0 };
  const fmtMins = m => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  function dayTip(d) {
    const st = statsOn(d), n = st.pomos;
    const label = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return `<b>${label}</b>${n} pomodoro${n === 1 ? '' : 's'}${n ? ` · ${fmtMins(st.minutes)} focused` : ''}` +
      (st.tasks ? `<div class="sub">${st.tasks} task${st.tasks === 1 ? '' : 's'} done</div>` : '');
  }
  function weekSvg() {
    const W = 252, top = 16, base = 72, H = 90, n = 7, bw = 20, step = (W - bw) / (n - 1);
    const days = Array.from({ length: n }, (_, i) => dayAt(n - 1 - i));
    const vals = days.map(d => statsOn(d).pomos);
    const max = Math.max(4, ...vals), best = Math.max(...vals);
    let bestShown = false, out = `<line x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}" class="chart-base"/>`;
    days.forEach((d, i) => {
      const v = vals[i], x = i * step, h = Math.round(v / max * (base - top)), y = base - h, r = Math.min(4, h, bw / 2);
      const today = i === n - 1;
      if (h > 0) out += `<path class="bar" d="M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z"/>`;
      const label = today || (v === best && v > 0 && !bestShown);
      if (v === best && v > 0) bestShown = true;
      if (label && v > 0) out += `<text x="${x + bw / 2}" y="${y - 4}" class="chart-val" text-anchor="middle">${v}</text>`;
      out += `<text x="${x + bw / 2}" y="${H - 2}" class="chart-axis${today ? ' today' : ''}" text-anchor="middle">${today ? 'Today' : d.toLocaleDateString([], { weekday: 'narrow' })}</text>`;
      out += `<rect x="${x - (step - bw) / 2}" y="0" width="${step}" height="${base}" fill="transparent" data-tip="${encodeURIComponent(dayTip(d))}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pomodoros per day for the last 7 days">${out}</svg>`;
  }
  function heatSvg() {
    const weeks = 16, c = 11, g = 2, left = 16, top = 14, step = c + g;
    const today = dayAt(0), start = dayAt(today.getDay() + (weeks - 1) * 7);   // a Sunday 15 weeks back
    const level = n => n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4;
    let out = '', lastMonth = -1, lastLabel = -9;
    ['M', 'W', 'F'].forEach((l, i) => { out += `<text x="0" y="${top + (1 + i * 2) * step + c - 2}" class="chart-axis">${l}</text>`; });
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
        if (day > today) continue;
        if (d === 0 && day.getMonth() !== lastMonth) {
          lastMonth = day.getMonth();
          if (w < weeks - 1 && w - lastLabel >= 3) {      // keep month names from colliding
            out += `<text x="${left + w * step}" y="9" class="chart-axis">${day.toLocaleDateString([], { month: 'short' })}</text>`;
            lastLabel = w;
          }
        }
        const isToday = dayKey(day) === dayKey(today);
        out += `<rect x="${left + w * step}" y="${top + d * step}" width="${c}" height="${c}" rx="2.5" class="heat-${level(statsOn(day).pomos)}${isToday ? ' heat-today' : ''}" data-tip="${encodeURIComponent(dayTip(day))}"/>`;
      }
    }
    const W = left + weeks * step - g, H = top + 7 * step - g;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pomodoros per day for the last 16 weeks">${out}</svg>
      <div class="heat-legend">Less ${[0, 1, 2, 3, 4].map(l => `<i class="heat-${l}"></i>`).join('')} More</div>`;
  }
  function renderChart() {
    $('chartSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === chartView));
    $('chartTitle').textContent = 'Pomodoros per day';
    $('chart').innerHTML = chartView === 'week' ? weekSvg() : heatSvg();
  }
  $('chartSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    chartView = b.dataset.v;
    renderChart();
  });
  // hover (or tap) any bar or day for its numbers
  const chartTip = (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) { $('tip').classList.remove('show'); return; }
    const t = $('tip');
    t.innerHTML = decodeURIComponent(el.dataset.tip);
    t.classList.add('show');
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = Math.max(10, Math.min(window.innerWidth - w - 10, e.clientX - w / 2)) + 'px';
    t.style.top = Math.max(10, e.clientY - h - 14) + 'px';
  };
  $('chart').addEventListener('pointermove', chartTip);
  $('chart').addEventListener('pointerdown', chartTip);
  $('chart').addEventListener('pointerleave', () => $('tip').classList.remove('show'));

  function renderJournal(fresh) {
    const got = CRITTERS.filter(c => S.unlocked[c.k]).length;
    $('journalCount').textContent = `${got}/${CRITTERS.length}`;
    $('journal').innerHTML = CRITTERS.map(c =>
      `<div class="critter${S.unlocked[c.k] ? '' : ' locked'}${fresh === c.k ? ' fresh' : ''}" data-k="${c.k}">${c.icon}</div>`).join('');
  }
  $('journal').addEventListener('mouseover', e => {
    const el = e.target.closest('.critter'); if (!el) return;
    const c = CRITTERS.find(x => x.k === el.dataset.k);
    $('journalNote').innerHTML = S.unlocked[c.k] ? `<b>${c.name}</b> live on your island.` : `<b>???</b> ${c.hint}`;
  });
  $('journal').addEventListener('mouseleave', () => { $('journalNote').textContent = 'Hover a critter to see how to meet it.'; });

  function unlock(k) {
    if (S.unlocked[k]) return;
    S.unlocked[k] = true;
    const c = CRITTERS.find(x => x.k === k);
    setTimeout(() => toast(c.toast, 5200), 900);
    renderJournal(k);
    syncCritters();
    save();
  }
  function checkUnlocks() {
    if (S.stats.total >= 1) unlock('butterfly');
    if (S.stats.total >= 3) unlock('snail');
    if (S.stats.tasks >= 5) unlock('ladybug');
    if (S.stats.total >= 10) unlock('frog');
  }
  function syncCritters() {
    Terrarium.setCritters({ snail: !!S.unlocked.snail, ladybug: !!S.unlocked.ladybug, frog: !!S.unlocked.frog });
  }

  function renderShelf() {
    $('shelf').innerHTML = S.shelf.length
      ? S.shelf.map(j => `<div class="jar-thumb" title="${j.plants} plants · ${fmtDate(j.date)}"><img src="${j.img}" alt="Saved garden"><span>${fmtDate(j.date)}</span></div>`).join('')
      : '<div class="shelf-empty">When your island fills up, save a snapshot here and start fresh. Your old gardens live here.</div>';
  }

  let shelveArmed = 0;
  $('newJar').addEventListener('click', () => {
    if (T.mode === 'focus' && T.status !== 'idle') { toast('Finish or stop this focus first. Your sprout is still growing!'); return; }
    if (!S.garden.length) { toast('Your garden is still empty. Grow something first 🌱'); return; }
    if (Date.now() - shelveArmed > 3000) {
      shelveArmed = Date.now();
      $('newJar').textContent = 'Tap again to save & clear';
      setTimeout(() => { $('newJar').innerHTML = 'Save to album &amp; start fresh'; }, 3000);
      return;
    }
    shelveArmed = 0;
    $('newJar').innerHTML = 'Save to album &amp; start fresh';
    const bg = { day: '#8a6688', dusk: '#6e78a6', night: '#1d1f48' }[document.body.dataset.mood];
    S.shelf.unshift({ img: Terrarium.capture(bg), date: Date.now(), plants: S.garden.length });
    S.shelf = S.shelf.slice(0, 12);
    Terrarium.clearPlants();
    const others = Terrarium.SCENES.filter(sc => sc.id !== S.scene);
    const next = others[(Math.random() * others.length) | 0];
    Terrarium.setScene(next.id);
    S.scene = next.id;
    syncGarden();
    save(true);
    Sound.pop();
    toast(`Saved to your album. Fresh soil on a new island: <b>${next.name}</b> 🪴`, 5000);
    renderShelf(); renderStats();
  });

  // ---------- settings ----------
  // switch the island at any time; plants on the new scenery hop to a free spot
  function renderSceneBtn() {
    $('sceneBtn').textContent = Terrarium.SCENES.find(sc => sc.id === S.scene).name;
  }
  $('sceneBtn').addEventListener('click', () => {
    const ids = Terrarium.SCENES.map(sc => sc.id);
    S.scene = ids[(ids.indexOf(S.scene) + 1) % ids.length];
    Terrarium.setScene(S.scene);
    syncGarden();
    renderSceneBtn();
    Sound.unlock(); Sound.soft();
  });

  function renderSeasonBtn() {
    $('seasonBtn').textContent = S.settings.season === 'auto' ? `Auto · ${SEASON_LABEL[currentSeason()]}` : SEASON_LABEL[S.settings.season];
  }
  $('seasonBtn').addEventListener('click', () => {
    S.settings.season = SEASON_ORDER[(SEASON_ORDER.indexOf(S.settings.season) + 1) % SEASON_ORDER.length];
    Terrarium.setSeason(currentSeason());
    syncGarden();
    renderSeasonBtn();
  });
  // the calendar can roll into a new season while the app is open
  setInterval(() => { if (Terrarium.season() !== currentSeason()) { Terrarium.setSeason(currentSeason()); syncGarden(); renderSeasonBtn(); } }, 60 * 60 * 1000);

  const LIMITS = { focus: [5, 90, 5], short: [1, 30, 1], long: [5, 45, 5] };
  function renderSettings() {
    document.querySelectorAll('.stepper').forEach(st => { st.querySelector('span').textContent = S.settings[st.dataset.k] + ' ' + unitLabel(); });
    document.querySelectorAll('.toggle').forEach(tg => tg.classList.toggle('on', !!S.settings[tg.dataset.t]));
  }
  $('settingsBtn').addEventListener('click', () => $('settings').classList.toggle('open'));
  document.querySelectorAll('.stepper').forEach(st => {
    const k = st.dataset.k, [lo, hi, step] = LIMITS[k];
    const [minus, plus] = st.querySelectorAll('button');
    const bump = d => {
      S.settings[k] = Math.max(lo, Math.min(hi, S.settings[k] + d * step));
      if (T.status === 'idle' && T.mode === k) T.remaining = T.total = durMs(k);
      save(); renderSettings(); renderTimer();
    };
    minus.addEventListener('click', () => bump(-1));
    plus.addEventListener('click', () => bump(1));
  });
  document.querySelectorAll('.toggle').forEach(tg => tg.addEventListener('click', () => {
    const k = tg.dataset.t;
    S.settings[k] = !S.settings[k];
    if (k === 'fx') Sound.setFx(S.settings.fx);
    if (k === 'amb') { Sound.unlock(); Sound.setAmb(S.settings.amb); }
    if (k === 'awake') render();
    if (k === 'testSeconds') {
      if (T.status === 'idle') T.remaining = T.total = durMs(T.mode);   // a running timer keeps its length
      renderSettings(); render();
      toast(S.settings.testSeconds ? 'Test mode on: timers count in seconds 🧪' : 'Test mode off: back to real minutes');
    }
    if (k === 'haptics' && S.settings.haptics) Device.buzz('medium');
    save(); renderSettings();
  }));

  // ---------- controls ----------
  $('mainBtn').addEventListener('click', () => {
    if (T.status === 'running') pause();
    else {
      // ask once, politely, so the timer can ping you when you're not in the app
      if (!S.askedNotify) {
        S.askedNotify = true;
        Device.askPermission().then(ok => {
          if (!ok) toast('Notifications are off, so you won’t be pinged when the timer ends. You can turn them on in your phone’s settings.', 6000);
          else if (T.status === 'running') armAlarm();
        });
      }
      start();
    }
  });
  $('stopBtn').addEventListener('click', stop);
  $('skipBtn').addEventListener('click', skip);
  $('modes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    setMode(b.dataset.mode);
  });
  document.addEventListener('keydown', e => {
    if (!$('tour').hidden || e.target.closest('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); $('mainBtn').click(); }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openSheet('tasks'); $('taskInput').focus(); }
    if (e.key === 'Escape') { if (!$('shop').hidden) closeShop(); else openSheet(null); }
    if ((e.key === 's' || e.key === 'S') && $('shop').hidden) { e.preventDefault(); openShop(); }
  });

  // mobile sheets
  function openSheet(which) {
    $('tasksPanel').classList.toggle('open', which === 'tasks' && !$('tasksPanel').classList.contains('open'));
    $('gardenPanel').classList.toggle('open', which === 'garden' && !$('gardenPanel').classList.contains('open'));
  }
  $('mTasks').addEventListener('click', () => openSheet('tasks'));
  $('mGarden').addEventListener('click', () => openSheet('garden'));

  // ---------- plant tooltips ----------
  const tip = $('tip');
  Terrarium.onHover((p, x, y) => {
    if (!p) { tip.classList.remove('show'); return; }
    if (p.cat) {
      const doing = { walk: 'Wandering the garden', sit: 'Sitting pretty', groom: 'Grooming', nap: 'Napping 💤' }[p.state] || '';
      tip.innerHTML = `<b>${p.name}</b>${p.breed}<div class="sub">${doing}</div>`;
    } else {
    const m = p.meta || {};
    let story;
    if (p.state === 'growing') story = 'Still growing… keep going!';
    else if (p.state === 'wilted') story = 'Wilted. Finish a task to revive it.';
    else if (m.from === 'shop') story = 'Bought from the garden shop';
    else if (m.from === 'task') story = m.task ? `Sprouted when you finished “${esc(m.task)}”` : 'Sprouted from a finished task';
    else story = m.task ? `Grew while you worked on “${esc(m.task)}”` : 'Grew during a quiet focus session';
    const label = p.state === 'growing' ? 'Mystery sprout' : Terrarium.speciesLabel(p.kind);
    const when = m.date ? fmtDate(m.date) + (m.minutes ? ` · ${m.minutes} min` : '') : '';
    tip.innerHTML = `<b>${label}</b>${story}${when ? `<div class="sub">${when}</div>` : ''}`;
    }
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 10, x + 14) + 'px';
    tip.style.top = Math.max(10, y - h - 10) + 'px';
    tip.classList.add('show');
  });

  // =====================================================
  // Coins + shop
  // =====================================================
  function renderCoins(delta) {
    document.querySelectorAll('.coin-count').forEach(el => { el.textContent = S.coins; });
    if (!delta) return;
    document.querySelectorAll('.coin-pill:not(.static)').forEach(pill => {
      if (!pill.offsetParent) return;
      pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
      const f = document.createElement('span');
      f.className = 'coin-float';
      f.textContent = '+' + delta;
      pill.appendChild(f);
      setTimeout(() => f.remove(), 1300);
    });
  }
  function earn(n) {
    S.coins += n;
    save();
    Sound.coin();
    renderCoins(n);
    if (!$('shop').hidden) renderShop();
  }
  function syncExtras() {
    const on = {};
    SHOP.forEach(it => { if (it.cat !== 'flowers') on[it.id] = !!(S.owned[it.id] && S.placed[it.id]); });
    return on;
  }
  function applyExtras(fanfare) {
    const on = syncExtras();
    on._fanfare = fanfare;
    Terrarium.setExtras(on);
  }

  let shopCat = 'flowers';
  const thumbs = {};
  function openShop() {
    Sound.unlock();
    openSheet(null);
    $('shop').hidden = false;
    renderShop();
  }
  function closeShop() { $('shop').hidden = true; }

  function renderShop() {
    document.querySelectorAll('#shopTabs button').forEach(b => b.classList.toggle('on', b.dataset.cat === shopCat));
    const full = Terrarium.freeCount() === 0;
    $('shopNote').textContent = shopCat === 'flowers'
      ? (full ? 'Your garden is full. Save it to the album to plant more.' : 'Flowers are planted on your island right away. Buy as many as you like.')
      : shopCat === 'fauna' ? 'Your cats are free to adopt. Critters move in for good; tap “Placed” to send one on vacation.'
      : shopCat === 'land' ? 'More room to grow. Everything you’ve planted stays right where it is.'
      : 'Accents are yours to keep. Tap “Placed” to put one away.';
    const items = SHOP.filter(it => it.cat === shopCat);
    $('shopGrid').innerHTML = items.map(it => {
      const owned = it.cat === 'land' ? S.land >= it.land : it.cat !== 'flowers' && S.owned[it.id];
      let btn;
      if (it.cat === 'land' && owned) {
        btn = `<button class="buy owned" disabled>Yours ✓</button>`;
      } else if (it.cat === 'land' && S.land < it.land - 1) {
        btn = `<button class="buy" disabled>Needs ${SHOP.find(x => x.land === it.land - 1).name}</button>`;
      } else if (owned) {
        btn = S.placed[it.id]
          ? `<button class="buy owned" data-id="${it.id}">Placed ✓</button>`
          : `<button class="buy stored" data-id="${it.id}">Put it back</button>`;
      } else {
        const short = S.coins < it.price, blocked = it.cat === 'flowers' && full;
        btn = it.price === 0
          ? `<button class="buy" data-id="${it.id}">Adopt 🐾</button>`
          : `<button class="buy" data-id="${it.id}" ${short || blocked ? 'disabled' : ''} title="${short ? `${it.price - S.coins} more coins needed` : ''}">${COIN_SVG}${it.price}</button>`;
      }
      const meta = it.cat === 'flowers' ? (S.bought[it.id] ? `Planted ×${S.bought[it.id]}` : '')
        : it.family ? (owned ? 'Family · home' : 'Family') : (owned ? 'Yours' : '');
      return `<div class="card">
        <div class="thumb" data-thumb="${it.id}">${thumbs[it.id] ? `<img src="${thumbs[it.id]}" alt="">` : '<i class="loading"></i>'}</div>
        <div class="c-name">${it.name}</div>
        <div class="c-desc">${it.desc}</div>
        <div class="c-meta">${meta}</div>
        ${btn}
      </div>`;
    }).join('');
    // render 3D thumbnails one per frame so the dialog opens instantly
    const todo = items.filter(it => !thumbs[it.id]);
    const next = () => {
      const it = todo.shift(); if (!it) return;
      try { thumbs[it.id] = Terrarium.preview(it.cat === 'flowers' ? { plant: it.kind } : it.cat === 'land' ? { land: it.land } : { extra: it.id }); } catch (e) { thumbs[it.id] = ''; }
      const slot = document.querySelector(`[data-thumb="${it.id}"]`);
      if (slot && thumbs[it.id]) slot.innerHTML = `<img src="${thumbs[it.id]}" alt="">`;
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }

  function buy(id) {
    const it = SHOP.find(x => x.id === id); if (!it) return;
    if (it.cat === 'land') {
      if (S.land >= it.land || S.land < it.land - 1 || S.coins < it.price) return;
      S.coins -= it.price;
      S.land = it.land;
      Terrarium.setLand(S.land);
      syncGarden();
      Sound.pop();
      save(true);
      renderCoins();
      closeShop();
      toast(`Your island grew to ${11 + 2 * S.land}×${11 + 2 * S.land}. Room for ${Terrarium.freeCount()} more plants 🌱`, 5000);
      return;
    }
    if (it.cat !== 'flowers' && S.owned[id]) {
      S.placed[id] = !S.placed[id];
      applyExtras(S.placed[id] ? id : null);
      Sound.soft();
      save(); renderShop();
      return;
    }
    if (S.coins < it.price) return;
    if (it.cat === 'flowers') {
      const p = Terrarium.plantSeed(it.kind, { from: 'shop', date: Date.now() }, { instant: true });
      if (!p) { toast('No room left. Save this garden to the album to plant more.'); return; }
      S.bought[id] = (S.bought[id] || 0) + 1;
      syncGarden();
      toast(`A ${esc(it.name.toLowerCase())} was planted 🌱`);
    } else {
      S.owned[id] = true;
      S.placed[id] = true;
      applyExtras(id);
      toast(it.toast, 4500);
    }
    S.coins -= it.price;
    Sound.pop();
    save(true);
    renderCoins();
    closeShop();
  }

  document.querySelectorAll('[data-shop]').forEach(b => b.addEventListener('click', openShop));
  $('shop').addEventListener('click', e => {
    if (e.target.closest('[data-close]')) closeShop();
    const b = e.target.closest('.buy');
    if (b && !b.disabled) buy(b.dataset.id);
  });
  $('shopTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    shopCat = b.dataset.cat;
    renderShop();
  });

  // =====================================================
  // First-run walkthrough
  // =====================================================
  const narrow = () => window.innerWidth <= 980;
  const visible = el => el && el.offsetParent !== null;
  const TOUR = [
    {
      art: { plant: 'tree' }, title: 'Welcome to your little island',
      text: 'This garden grows while you focus, rests while you rest, and remembers everything you worked on.',
      target: () => Terrarium.screenRect(), pad: 4,
    },
    {
      title: 'Pick your island',
      text: 'Each one has its own home, trees and pond friends. Tap to try them on.',
      choose: true, target: () => Terrarium.screenRect(), pad: 4,
    },
    {
      art: { plant: 'tulip' }, title: 'Plant a task',
      text: 'List what you’re working on and tap one to tend it. Finishing a task grows something small and earns 2 coins.',
      target: () => narrow() ? $('mTasks') : $('tasksPanel'),
    },
    {
      art: { plant: 'sunflower' }, title: 'Focus to grow',
      text: 'Press <b>Plant &amp; focus</b>. A mystery seed sprouts while the timer runs and blooms at the end. Stop early and it wilts, but a finished task will revive it.',
      target: () => $('timer'),
    },
    {
      art: { extra: 'cat' }, title: 'Rest, collect, decorate',
      text: 'Breaks bring rain and starry nights. Critters move in as you go, and coins buy flowers, critters and cozy accents in the shop. Here are 5 to start.',
      target: () => [...document.querySelectorAll('.coin-pill[data-shop]')].find(visible),
    },
    {
      art: { extra: 'bunny' }, title: 'What will you tend first?',
      text: 'Name one thing for today. We’ll plant it in your task list.',
      form: true,
    },
  ];
  const tourArt = {};
  let tourAt = 0;

  function startTour() {
    Terrarium.resetView();
    openSheet(null);
    closeShop();
    tourAt = 0;
    $('tour').hidden = false;
    $('tourDots').innerHTML = TOUR.map(() => '<i></i>').join('');
    showStep();
  }
  function endTour(firstTask) {
    $('tour').hidden = true;
    if (!S.seenWelcome) { S.seenWelcome = true; save(); }
    if (firstTask) {
      const t = { id: Date.now(), text: firstTask, done: false, pomos: 0, planted: false, dirty: true, mt: Date.now() };
      S.tasks.push(t);
      S.activeTaskId = t.id;
      save(); renderTasks(); renderTimer();
      Sound.unlock(); Sound.pop();
      toast(`“${esc(firstTask)}” is planted. Press <b>Plant &amp; focus</b> whenever you’re ready 🌱`, 6000);
    }
  }

  function showStep() {
    const step = TOUR[tourAt], last = tourAt === TOUR.length - 1;
    $('tourStep').textContent = `${tourAt + 1} of ${TOUR.length}`;
    $('tourTitle').textContent = step.title;
    $('tourText').innerHTML = step.text;
    $('tourForm').hidden = !step.form;
    $('tourChoices').hidden = !step.choose;
    if (step.choose) renderChoices();
    $('tourNext').textContent = last ? 'Plant it 🌱' : tourAt === 0 ? 'Show me' : 'Next';
    $('tourSkip').textContent = last ? 'Maybe later' : 'Skip';
    $('tourDots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === tourAt));
    $('tourArt').hidden = !step.art;
    if (step.art) {
      const key = JSON.stringify(step.art) + Terrarium.scene();    // tree colors follow the island
      if (!tourArt[key]) { try { tourArt[key] = Terrarium.preview(step.art); } catch (e) { tourArt[key] = ''; } }
      $('tourArt').innerHTML = tourArt[key] ? `<img src="${tourArt[key]}" alt="">` : '';
    }
    placeTour();
    if (step.form) setTimeout(() => $('tourInput').focus(), 350);
    else $('tourNext').focus({ preventScroll: true });
  }

  // spotlight the target and tuck the card beside it wherever it fits
  function placeTour() {
    if ($('tour').hidden) return;
    const step = TOUR[tourAt], spot = $('tourSpot'), card = $('tourCard');
    const W = window.innerWidth, H = window.innerHeight, m = 16;
    let r = null;
    if (step.target) {
      const t = step.target();
      r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : t;
    }
    if (r) {
      const pad = step.pad != null ? step.pad : 8;
      Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      spot.classList.add('ring');
    } else {
      Object.assign(spot.style, { left: W / 2 + 'px', top: H / 2 + 'px', width: '0px', height: '0px' });
      spot.classList.remove('ring');
    }
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let x = (W - cw) / 2, y = (H - ch) / 2;
    if (r && narrow()) {
      // phones: card hugs the bottom, or the top if the target lives down there
      y = r.top + r.height / 2 > H * 0.55 ? m : H - ch - m;
      if (y === m && r.top < ch + m * 2) y = Math.min(H - ch - m, r.bottom + m);
    } else if (r) {
      const fits = (cx, cy) => cx >= m && cx + cw <= W - m && cy >= m && cy + ch <= H - m;
      const midY = Math.min(Math.max(r.top + r.height / 2 - ch / 2, m), H - ch - m);
      const midX = Math.min(Math.max(r.left + r.width / 2 - cw / 2, m), W - cw - m);
      const options = [
        [r.right + 24, midY], [r.left - 24 - cw, midY],
        [midX, r.top - 24 - ch], [midX, r.bottom + 24],
      ];
      const hit = options.find(([cx, cy]) => fits(cx, cy));
      if (hit) [x, y] = hit;
    }
    card.style.left = Math.round(x) + 'px';
    card.style.top = Math.round(y) + 'px';
  }

  function renderChoices() {
    $('tourChoices').innerHTML = Terrarium.SCENES.map(sc => `
      <button type="button" class="choice${sc.id === S.scene ? ' on' : ''}" data-scene="${sc.id}">
        <span class="sw">${sc.swatch.map(c => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('')}</span>
        <span class="ct"><b>${sc.name}</b><small>${sc.tag}</small></span>
      </button>`).join('');
  }
  $('tourChoices').addEventListener('click', e => {
    const b = e.target.closest('.choice'); if (!b || b.dataset.scene === S.scene) return;
    S.scene = b.dataset.scene;
    Terrarium.setScene(S.scene);
    syncGarden();
    syncCritters(); applyExtras();
    renderChoices();
    Sound.unlock(); Sound.soft();
  });

  function tourNext() {
    if (tourAt < TOUR.length - 1) { tourAt++; showStep(); Sound.unlock(); Sound.soft(); return; }
    const text = $('tourInput').value.trim();
    if (!text) {      // empty: a gentle wiggle instead of silently closing ("Maybe later" skips)
      const inp = $('tourInput');
      inp.classList.remove('nudge'); void inp.offsetWidth; inp.classList.add('nudge');
      inp.focus();
      return;
    }
    endTour(text);
  }
  $('tourNext').addEventListener('click', tourNext);
  $('tourSkip').addEventListener('click', () => endTour(''));
  $('tourForm').addEventListener('submit', e => { e.preventDefault(); tourNext(); });
  $('tour').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); endTour(''); }
    if (e.key === 'ArrowRight' && !e.target.closest('input')) tourNext();
    if (e.key === 'ArrowLeft' && !e.target.closest('input') && tourAt > 0) { tourAt--; showStep(); }
  });
  window.addEventListener('resize', placeTour);
  $('replayTour').addEventListener('click', () => { $('settings').classList.remove('open'); startTour(); });

  // =====================================================
  // Google Tasks sync (a "Focus" list; Muse and the Tasks app write there)
  // =====================================================
  const GOOGLE_WEB_CLIENT_ID = '139246714495-pt7fchq7eta9924plt6ksl42id1gduea.apps.googleusercontent.com';
  let gState = 'off';
  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  }
  function renderGoogle() {
    const g = S.gsync, on = g.on;
    $('gStatus').textContent = !on ? 'Not connected'
      : g.needsAuth ? 'Signed out'
      : gState === 'syncing' ? 'Syncing…'
      : gState === 'error' ? GTasks.error()
      : g.last ? `Synced ${ago(g.last)}` : 'Connected';
    $('gBtn').textContent = !on ? 'Connect' : g.needsAuth ? 'Reconnect' : 'Sync now';
    $('gOff').hidden = !on;
    $('gFoot').textContent = on ? (g.needsAuth ? '⚠ Google Tasks: sign in again' : `☁ Synced with Google Tasks · ${g.last ? ago(g.last) : '…'}`) : 'Tap a task to tend it';
  }
  GTasks.setup({
    state: () => S,
    save: () => save(),
    webClientId: GOOGLE_WEB_CLIENT_ID,
    status: st => { gState = st; renderGoogle(); },
    changed: ({ added, finished }) => {
      // finished in Google Tasks or by Muse: grows a plant and earns coins, once per task
      finished.forEach(t => finishTask(t));
      if (added) toast(`🌱 ${added} new task${added === 1 ? '' : 's'} from Google Tasks`);
      if (!activeTask()) { const next = S.tasks.find(t => !t.done); if (next) S.activeTaskId = next.id; }
      save(); renderTasks(); renderTimer();
    },
  });
  $('gBtn').addEventListener('click', async () => {
    const g = S.gsync;
    if (g.on && !g.needsAuth) { GTasks.sync('manual'); return; }
    try {
      $('gStatus').textContent = 'Opening Google…';
      await GTasks.connect();
      toast(`Connected to Google Tasks${S.gsync.email ? ` as ${esc(S.gsync.email)}` : ''}. Syncing your “Focus” list 🌱`, 5000);
    } catch (e) {
      console.warn(e);
      toast('Couldn’t connect to Google Tasks. ' + esc(e.code === 'CANCELLED' ? 'Sign-in was cancelled.' : (e.message || '')).slice(0, 120), 6000);
    }
    renderGoogle();
  });
  $('gOff').addEventListener('click', async () => {
    await GTasks.disconnect();
    toast('Disconnected from Google Tasks. Your tasks stay in the app.');
    renderGoogle(); renderTasks();
  });
  setInterval(renderGoogle, 30000);
  if (Store.app) Store.app.addListener('resume', () => GTasks.sync('resume'));

  // ---------- boot ----------
  function renderAll() { renderGoogle(); render(); renderTasks(); renderStats(); renderJournal(); renderShelf(); renderSettings(); renderSeasonBtn(); renderSceneBtn(); }

  // resume a session that was running while the tab was closed
  if (T.status !== 'idle' && T.growingId != null) Terrarium.setMarker(T.growingId);
  if (T.mode === 'focus' && T.status === 'idle' && T.growingId != null) T.growingId = null;
  syncCritters();
  applyExtras();
  renderAll();
  renderCoins();
  if (T.status === 'running' && T.endAt <= Date.now()) setTimeout(complete, 1200);
  else if (T.status === 'running') armAlarm();     // restored after the app was killed   // bloom it after the garden wakes up

  if (!S.seenWelcome) setTimeout(startTour, 1100);    // let the garden wake up first
  if (SPEED > 1) setTimeout(() => toast(`Demo speed ×${SPEED}: a minute passes every ${(60 / SPEED).toFixed(1)}s`, 4000), 300);

  setInterval(tick, 200);
  GTasks.sync('boot');
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

  // Android back button: close whatever is open, otherwise tuck the app away
  // (minimizing rather than exiting keeps a running timer's state warm)
  if (Store.app) {
    Store.app.addListener('backButton', () => {
      if (!$('tour').hidden) endTour('');
      else if (!$('shop').hidden) closeShop();
      else if ($('tasksPanel').classList.contains('open') || $('gardenPanel').classList.contains('open')) openSheet(null);
      else if ($('settings').classList.contains('open')) $('settings').classList.remove('open');
      else { save(true); Store.app.minimizeApp(); }
    });
  }

  window.__terrarium = { state: () => S, complete, unlock, earn, startTour };
});
