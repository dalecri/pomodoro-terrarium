// Phone integrations. In the Android app: OS-scheduled timer notifications that fire
// even if the app is killed, a small haptic buzz, and keeping the screen on while
// focusing. In a browser: the Notification API, navigator.vibrate and the Screen
// Wake Lock API stand in where they exist. Exposes window.Device.
(function () {
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const plugin = name => (cap.registerPlugin ? cap.registerPlugin(name) : cap.Plugins[name]);
  const LN = native ? plugin('LocalNotifications') : null;
  const HAPTICS = native ? plugin('Haptics') : null;
  const AWAKE = native ? plugin('KeepAwake') : null;

  const TIMER_ID = 4242;
  const CHANNEL = 'timer';
  // fire a moment after the deadline, so when the app is open the in-app chime
  // completes first and cancels the notification before it can pop up
  const GRACE_MS = 1500;

  let ready = Promise.resolve();
  if (LN) {
    ready = LN.createChannel({
      id: CHANNEL, name: 'Timer alerts', description: 'When a focus session or break ends',
      importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#E8684A',
    }).catch(() => {});
  }

  // ---- notifications ----
  async function askPermission() {
    try {
      if (LN) {
        const now = await LN.checkPermissions();
        if (now.display === 'granted') return true;
        if (now.display === 'denied') return false;
        return (await LN.requestPermissions()).display === 'granted';
      }
      if ('Notification' in window && Notification.permission === 'default') {
        return (await Notification.requestPermission()) === 'granted';
      }
      return 'Notification' in window && Notification.permission === 'granted';
    } catch (e) { return false; }
  }

  let webTimer = null;
  async function scheduleTimer(at, title, body) {
    await cancelTimer();
    if (LN) {
      await ready;
      try {
        await LN.schedule({ notifications: [{
          id: TIMER_ID, title, body, channelId: CHANNEL,
          smallIcon: 'ic_stat_sprout', iconColor: '#E8684A', autoCancel: true,
          schedule: { at: new Date(at + GRACE_MS), allowWhileIdle: true },
        }] });
      } catch (e) { console.warn('Could not schedule the timer notification', e); }
      return;
    }
    // browser: only works while the tab is alive (no OS scheduling on the web)
    webTimer = setTimeout(() => {
      try {
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: 'assets/apple-touch-icon.png', tag: 'pomodoro-timer' });
        }
      } catch (e) {}
    }, Math.max(0, at + GRACE_MS - Date.now()));
  }

  async function cancelTimer() {
    clearTimeout(webTimer);
    if (!LN) return;
    try {
      await LN.cancel({ notifications: [{ id: TIMER_ID }] });
      await LN.removeDeliveredNotifications({ notifications: [{ id: TIMER_ID }] });
    } catch (e) {}
  }

  // ---- haptics ----
  function buzz(kind) {
    if (HAPTICS) {
      if (kind === 'done') HAPTICS.notification({ type: 'SUCCESS' }).catch(() => {});
      else HAPTICS.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' }).catch(() => {});
      return;
    }
    try { if (navigator.vibrate) navigator.vibrate(kind === 'done' ? [40, 60, 40] : 15); } catch (e) {}
  }

  // ---- keep the screen on ----
  let wantAwake = false, wakeLock = null;
  async function setAwake(on) {
    if (on === wantAwake) return;
    wantAwake = on;
    if (AWAKE) {
      (on ? AWAKE.keepAwake() : AWAKE.allowSleep()).catch(() => {});
      return;
    }
    if (!('wakeLock' in navigator)) return;
    try {
      if (on && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) {}
  }
  // browsers drop the wake lock when the tab is hidden; take it back on return
  document.addEventListener('visibilitychange', () => {
    if (!AWAKE && wantAwake && !wakeLock && document.visibilityState === 'visible') {
      wantAwake = false;
      setAwake(true);
    }
  });

  window.Device = { native, askPermission, scheduleTimer, cancelTimer, buzz, setAwake };
})();
