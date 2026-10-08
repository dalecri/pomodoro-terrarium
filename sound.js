// Tiny WebAudio synth: music-box chimes, pops, rain hush and night crickets.
// Exposes window.Sound.
(function () {
  let ctx = null, master = null;
  let fxOn = true, ambOn = true;
  let rainNode = null, rainGain = null, cricketTimer = null;
  let ambience = 'none';   // 'none' | 'rain' | 'night'

  function ac() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function note(freq, t0, dur, vol, type) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // music-box tone: sine + quiet octave sparkle
  function mbox(freq, t0, dur, vol) {
    note(freq, t0, dur, vol, 'sine');
    note(freq * 2, t0, dur * 0.5, vol * 0.18, 'triangle');
  }

  const NOTES = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.7, E6: 1318.5, G4: 392 };

  function bloom() {
    if (!fxOn) return; const c = ac(); if (!c) return;
    const t = c.currentTime + 0.02;
    ['C5', 'E5', 'G5', 'C6', 'E6', 'D6', 'C6'].forEach((n, i) =>
      mbox(NOTES[n], t + i * 0.16 + (i > 4 ? 0.1 : 0), 1.4, 0.07));
  }
  function breakOver() {
    if (!fxOn) return; const c = ac(); if (!c) return;
    const t = c.currentTime + 0.02;
    ['G5', 'E5', 'C5', 'G4'].forEach((n, i) => mbox(NOTES[n], t + i * 0.2, 1.2, 0.06));
  }
  function pop() {
    if (!fxOn) return; const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(380, t);
    o.frequency.exponentialRampToValueAtTime(980, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
    mbox(NOTES.A5, t + 0.08, 0.6, 0.04);
  }
  function plip() {
    if (!fxOn) return; const c = ac(); if (!c) return;
    const t = c.currentTime;
    note(1200 + Math.random() * 300, t, 0.12, 0.025, 'sine');
  }
  function coin() {
    if (!fxOn) return; const c = ac(); if (!c) return;
    const t = c.currentTime;
    note(987.8, t, 0.09, 0.05, 'triangle');
    note(1318.5, t + 0.08, 0.4, 0.055, 'triangle');
    note(2637, t + 0.08, 0.2, 0.008, 'sine');
  }
  function soft() {
    if (!fxOn) return; const c = ac(); if (!c) return;
    note(NOTES.E5, c.currentTime, 0.25, 0.035, 'triangle');
  }
  function wilt() {
    if (!fxOn) return; const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.75);
  }

  // --- ambience ---
  function startRain() {
    const c = ac(); if (!c || rainNode) return;
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {        // brown-ish noise
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04;
      d[i] = last * 3.2 + w * 0.08;
    }
    rainNode = c.createBufferSource(); rainNode.buffer = buf; rainNode.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    rainGain = c.createGain(); rainGain.gain.value = 0.0001;
    rainNode.connect(lp).connect(rainGain).connect(master);
    rainNode.start();
    rainGain.gain.exponentialRampToValueAtTime(0.22, c.currentTime + 2.5);
  }
  function stopRain() {
    if (!rainNode) return;
    const n = rainNode, g = rainGain;
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
    setTimeout(() => { try { n.stop(); } catch (e) {} }, 3000);
    rainNode = null; rainGain = null;
  }
  function chirp() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const n = 2 + ((Math.random() * 2) | 0);
    const f = 4300 + Math.random() * 400;
    for (let i = 0; i < n; i++) note(f, t + i * 0.09, 0.05, 0.012, 'sine');
  }
  function startCrickets() {
    if (cricketTimer) return;
    const loop = () => { chirp(); cricketTimer = setTimeout(loop, 900 + Math.random() * 2200); };
    cricketTimer = setTimeout(loop, 600);
  }
  function stopCrickets() { clearTimeout(cricketTimer); cricketTimer = null; }

  function applyAmbience() {
    const want = ambOn ? ambience : 'none';
    if (want === 'rain') startRain(); else stopRain();
    if (want === 'night') startCrickets(); else stopCrickets();
  }
  function setAmbience(kind) { ambience = kind; if (ctx || kind === 'none') applyAmbience(); }

  window.Sound = {
    unlock() { ac(); applyAmbience(); },
    bloom, breakOver, pop, plip, soft, wilt, coin, setAmbience,
    setFx(v) { fxOn = v; },
    setAmb(v) { ambOn = v; applyAmbience(); },
  };
})();
