// Two-way sync between the app's task list and a "Focus" list in Google Tasks.
// Anything that can write to Google Tasks (Muse, the Tasks app, Gmail) shows up
// here, and tasks added or finished here show up there.
//
// Offline-first: every change is saved locally right away and marked `dirty`;
// a sync pushes dirty tasks (and deletions), then pulls whatever changed in
// Google since the last sync. If both sides edited the same task, the newer
// edit wins. Exposes window.GTasks.
(function () {
  const API = 'https://tasks.googleapis.com/tasks/v1';
  const SCOPE = 'https://www.googleapis.com/auth/tasks email';
  const LIST_NAME = 'Focus';
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const AUTH = native ? (cap.registerPlugin ? cap.registerPlugin('GoogleTasksAuth') : cap.Plugins.GoogleTasksAuth) : null;

  let H = null;                      // hooks from the app
  let token = null, tokenExp = 0;
  let running = null, again = false, debounce = null, lastError = '';

  const st = () => H.state().gsync;
  const now = () => Date.now();

  // ---------------------------------------------------------------- tokens
  // Android: Google Play services hands out fresh tokens silently after the first consent.
  // Web: Google Identity Services' token client (a popup the first time).
  let gis = null;
  function loadGis() {
    if (gis) return gis;
    gis = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = ok; s.onerror = () => fail(new Error('Could not load Google sign-in'));
      document.head.appendChild(s);
    });
    return gis;
  }
  async function webToken(interactive) {
    await loadGis();
    return new Promise((ok, fail) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: H.webClientId, scope: SCOPE,
        callback: r => r && r.access_token ? ok({ accessToken: r.access_token, ttl: (r.expires_in || 3600) * 1000 }) : fail(new Error(r && r.error || 'no token')),
        error_callback: e => fail(new Error(e && e.type || 'popup closed')),
      });
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }
  async function getToken(interactive) {
    if (!interactive && token && now() < tokenExp) return token;
    const r = AUTH ? await AUTH.authorize({ interactive }) : await webToken(interactive);
    token = r.accessToken;
    tokenExp = now() + Math.min(r.ttl || 3600e3, 3600e3) - 5 * 60e3;   // renew 5 minutes early
    st().needsAuth = false;
    return token;
  }

  // ---------------------------------------------------------------- REST
  async function api(method, path, body, retried) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: 'Bearer ' + await getToken(false), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried) { token = null; return api(method, path, body, true); }
    if (res.status === 404) return { notFound: true };
    if (res.status === 204) return {};
    if (!res.ok) throw new Error(`Google Tasks ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return res.json();
  }

  async function ensureList() {
    const g = st();
    if (g.listId) {
      const chk = await api('GET', `/users/@me/lists/${g.listId}`);
      if (!chk.notFound) return g.listId;
      g.listId = null; g.since = null;          // the list was deleted in Google: find or make it again,
      H.state().tasks.forEach(t => {            // and re-upload whatever is still open here
        delete t.gid; delete t.gu;
        if (!t.done) { t.dirty = true; t.mt = now(); }
      });
      g.tombs = [];
    }
    let pageToken = '', found = null;
    do {
      const r = await api('GET', `/users/@me/lists?maxResults=100${pageToken ? '&pageToken=' + pageToken : ''}`);
      found = (r.items || []).find(l => (l.title || '').trim().toLowerCase() === LIST_NAME.toLowerCase());
      pageToken = r.nextPageToken || '';
    } while (!found && pageToken);
    if (!found) found = await api('POST', '/users/@me/lists', { title: LIST_NAME });
    g.listId = found.id;
    return g.listId;
  }

  // ---------------------------------------------------------------- sync
  async function push(L) {
    const S = H.state(), g = st();
    for (const t of S.tasks.filter(x => x.dirty)) {
      const body = t.done ? { title: t.text, status: 'completed' } : { title: t.text, status: 'needsAction', completed: null };
      let r = t.gid ? await api('PATCH', `/lists/${L}/tasks/${t.gid}`, body) : null;
      if (!t.gid || r.notFound) r = await api('POST', `/lists/${L}/tasks`, body);   // new here, or deleted remotely while edited here
      t.gid = r.id; t.gu = r.updated; t.dirty = false;
    }
    for (const gid of g.tombs.splice(0)) await api('DELETE', `/lists/${L}/tasks/${gid}`);
    if (g.clear) { await api('POST', `/lists/${L}/clear`); g.clear = false; }
  }

  async function pull(L) {
    const S = H.state(), g = st();
    const started = new Date(now() - 60e3).toISOString();      // a minute of overlap covers clock skew
    let pageToken = '', added = 0, finished = [];
    do {
      const q = `?maxResults=100&showCompleted=true&showHidden=true&showDeleted=true${g.since ? '&updatedMin=' + encodeURIComponent(g.since) : ''}${pageToken ? '&pageToken=' + pageToken : ''}`;
      const r = await api('GET', `/lists/${L}/tasks${q}`);
      for (const it of r.items || []) {
        const t = S.tasks.find(x => x.gid === it.id);
        if (it.deleted || (it.hidden && (!t || t.done))) {
          if (t) { S.tasks.splice(S.tasks.indexOf(t), 1); if (S.activeTaskId === t.id) S.activeTaskId = null; }
          continue;
        }
        if (!t) {
          if (it.status === 'completed' || !(it.title || '').trim()) continue;   // only bring over open tasks
          S.tasks.push({ id: now() + Math.floor(Math.random() * 1000), gid: it.id, gu: it.updated, text: it.title.trim(),
            done: false, pomos: 0, planted: false, from: 'google', mt: Date.parse(it.updated) });
          added++;
          continue;
        }
        if (it.updated === t.gu) continue;                        // our own write coming back
        if (t.dirty && (t.mt || 0) > Date.parse(it.updated)) continue;   // newer local edit wins; pushed next time
        t.text = (it.title || t.text).trim();
        const done = it.status === 'completed';
        if (done && !t.done) { t.done = true; finished.push(t); }
        else if (!done && t.done) t.done = false;
        t.gu = it.updated; t.dirty = false;
      }
      pageToken = r.nextPageToken || '';
    } while (pageToken);
    g.since = started;
    return { added, finished };
  }

  async function run(reason) {
    const g = st();
    if (!g.on || !navigator.onLine) return;
    try {
      H.status('syncing');
      const L = await ensureList();
      await push(L);
      const { added, finished } = await pull(L);
      g.last = now(); lastError = '';
      H.save();
      H.changed({ added, finished, reason });
      H.status('ok');
    } catch (e) {
      const needsAuth = e && (e.code === 'NEEDS_CONSENT' || /NEEDS_CONSENT|sign in again/i.test(e.message || ''));
      if (needsAuth) { g.needsAuth = true; token = null; }
      lastError = needsAuth ? 'Sign in again to keep syncing' : 'Will retry when online';
      console.warn('Google Tasks sync failed', e);
      H.save();
      H.status(needsAuth ? 'auth' : 'error');
    }
  }

  function sync(reason) {
    if (!H || !st().on || st().needsAuth) return Promise.resolve();
    if (running) { again = true; return running; }
    running = run(reason).finally(() => {
      running = null;
      if (again) { again = false; sync('again'); }
    });
    return running;
  }

  // called after any local change; batches bursts of edits
  function touch() {
    clearTimeout(debounce);
    debounce = setTimeout(() => sync('local'), 1500);
  }

  async function connect() {
    const g = st();
    await getToken(true);                    // shows Google's sign-in / consent the first time
    try {
      const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());
      g.email = me.email || '';
    } catch (e) {}
    const firstTime = !g.on;
    g.on = true; g.needsAuth = false;
    if (firstTime) {
      g.since = null;
      // everything still open in the app goes up to Google too
      H.state().tasks.forEach(t => { if (!t.done && !t.gid) { t.dirty = true; t.mt = now(); } });
    }
    H.save();
    return sync('connect');
  }

  async function disconnect() {
    const g = st();
    try {
      if (token) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' });
    } catch (e) {}
    token = null; tokenExp = 0;
    Object.assign(g, { on: false, needsAuth: false, email: '', since: null, tombs: [], clear: false });
    // keep the tasks, but forget their Google links so a later connect starts clean
    H.state().tasks.forEach(t => { delete t.gid; delete t.gu; delete t.dirty; });
    H.save();
    H.status('off');
  }

  function setup(hooks) {
    H = hooks;
    const S = H.state();
    S.gsync = Object.assign({ on: false, email: '', listId: null, since: null, tombs: [], clear: false, last: 0, needsAuth: false }, S.gsync || {});
    // sync when the app comes back, when the network returns, and every few minutes while open
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync('resume'); });
    window.addEventListener('online', () => sync('online'));
    setInterval(() => { if (document.visibilityState === 'visible') sync('interval'); }, 3 * 60e3);
  }

  window.GTasks = {
    setup, connect, disconnect, sync, touch, native,
    error: () => lastError,
  };
})();
