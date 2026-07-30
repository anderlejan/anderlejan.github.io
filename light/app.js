/* Light — a flashlight that uses the camera LED when the browser exposes it,
   and falls back to turning the screen into a lamp when it doesn't. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const powerBtn = $('power');
  const powerLabel = $('powerLabel');
  const statusEl = $('status');
  const hintEl = $('hint');
  const lamp = $('screenlamp');
  const rateRow = $('rateRow');
  const rateInput = $('rate');
  const rateOut = $('rateOut');
  const screenOpts = $('screenOpts');
  const dimInput = $('dim');
  const dimOut = $('dimOut');
  const swatchBox = $('swatches');

  const COLOURS = [
    ['#ffffff', 'White'],
    ['#fff1d0', 'Warm'],
    ['#cfe6ff', 'Cool'],
    ['#ff5a4a', 'Red'],
    ['#43d97a', 'Green'],
    ['#4aa3ff', 'Blue'],
  ];

  const state = {
    on: false,
    mode: 'steady',       // steady | strobe | sos
    src: 'torch',         // torch | screen
    colour: COLOURS[0][0],
    dim: 100,
    rate: 4,              // strobe Hz
  };

  let stream = null;      // live camera stream while the LED is in use
  let track = null;
  let torchReady = false; // capabilities confirmed to include torch
  let timer = null;       // strobe interval / SOS timeout
  let wakeLock = null;

  /* ---------- physical light ---------- */

  async function setTorch(on) {
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch {
      return false;
    }
  }

  function setScreen(on) {
    lamp.hidden = !on;
    document.body.classList.toggle('lamp-on', on);
    if (on) {
      lamp.style.background = state.colour;
      lamp.style.filter = `brightness(${state.dim}%)`;
    }
  }

  // Flip whichever source is active. `lit` is the instantaneous state.
  function emit(lit) {
    if (state.src === 'torch') {
      setTorch(lit);
    } else {
      lamp.style.background = lit ? state.colour : '#000';
    }
  }

  /* ---------- camera acquisition ---------- */

  async function acquireTorch() {
    if (torchReady && track && track.readyState === 'live') return true;
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (!caps.torch) {
        releaseCamera();
        return false;
      }
      torchReady = true;
      return true;
    } catch {
      releaseCamera();
      return false;
    }
  }

  function releaseCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    track = null;
    torchReady = false;
  }

  /* ---------- patterns ---------- */

  const UNIT = 180; // SOS dot length, ms
  const SOS = [1, 1, 1, 3, 3, 3, 1, 1, 1]; // dot/dash lengths in units

  function stopPattern() {
    clearInterval(timer);
    clearTimeout(timer);
    timer = null;
  }

  function runPattern() {
    stopPattern();
    if (!state.on) return;

    if (state.mode === 'steady') {
      emit(true);
      return;
    }

    if (state.mode === 'strobe') {
      let lit = false;
      const half = Math.max(30, 500 / state.rate);
      emit((lit = true));
      timer = setInterval(() => emit((lit = !lit)), half);
      return;
    }

    // SOS: symbol, intra-letter gap, then a long gap before repeating.
    const steps = [];
    SOS.forEach((len, i) => {
      steps.push([true, len * UNIT]);
      const endOfLetter = i % 3 === 2;
      steps.push([false, (endOfLetter ? 3 : 1) * UNIT]);
    });
    steps[steps.length - 1] = [false, 7 * UNIT];

    let i = 0;
    const step = () => {
      if (!state.on) return;
      const [lit, ms] = steps[i % steps.length];
      emit(lit);
      i++;
      timer = setTimeout(step, ms);
    };
    step();
  }

  /* ---------- wake lock ---------- */

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* not critical */ }
  }

  function releaseWakeLock() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  /* ---------- on / off ---------- */

  async function turnOn() {
    if (state.src === 'torch') {
      setStatus('Starting camera LED…');
      const ok = await acquireTorch();
      if (!ok) {
        selectSource('screen');
        setStatus('No LED available here — using the screen instead.', true);
      }
    }

    state.on = true;
    powerBtn.setAttribute('aria-pressed', 'true');
    powerLabel.textContent = 'On';
    if (state.src === 'screen') setScreen(true);
    requestWakeLock();
    runPattern();
    if (state.src === 'torch') setStatus('LED on.');
  }

  function turnOff() {
    state.on = false;
    powerBtn.setAttribute('aria-pressed', 'false');
    powerLabel.textContent = 'Off';
    stopPattern();
    setTorch(false);
    releaseCamera();
    setScreen(false);
    releaseWakeLock();
    setStatus(state.src === 'torch' ? 'Camera LED ready.' : 'Screen lamp ready.');
  }

  function toggle() {
    state.on ? turnOff() : turnOn();
  }

  function setStatus(text, warn = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('warn', warn);
  }

  /* ---------- controls ---------- */

  function selectSource(src) {
    const was = state.on;
    if (was) turnOff();
    state.src = src;
    $('srcTorch').classList.toggle('is-on', src === 'torch');
    $('srcScreen').classList.toggle('is-on', src === 'screen');
    screenOpts.hidden = src !== 'screen';
    hintEl.textContent = src === 'screen'
      ? 'Tap anywhere on the lit screen to turn it off.'
      : 'Tap the bulb, or press space.';
    if (!state.on) {
      setStatus(src === 'screen'
        ? 'Screen lamp ready.'
        : 'Camera LED ready — permission is asked on first use.');
    }
    if (was && src === 'screen') turnOn();
  }

  document.querySelectorAll('[data-src]').forEach((btn) => {
    btn.addEventListener('click', () => selectSource(btn.dataset.src));
  });

  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((b) =>
        b.classList.toggle('is-on', b === btn));
      rateRow.hidden = state.mode !== 'strobe';
      if (state.on) runPattern();
    });
  });

  rateInput.addEventListener('input', () => {
    state.rate = Number(rateInput.value);
    rateOut.textContent = `${state.rate.toFixed(1)} Hz`;
    if (state.on && state.mode === 'strobe') runPattern();
  });

  dimInput.addEventListener('input', () => {
    state.dim = Number(dimInput.value);
    dimOut.textContent = `${state.dim}%`;
    if (state.on && state.src === 'screen') lamp.style.filter = `brightness(${state.dim}%)`;
  });

  COLOURS.forEach(([hex, name], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (i === 0 ? ' is-on' : '');
    b.style.background = hex;
    b.title = name;
    b.setAttribute('aria-label', name);
    b.addEventListener('click', () => {
      state.colour = hex;
      swatchBox.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('is-on', s === b));
      if (state.on && state.src === 'screen') lamp.style.background = hex;
    });
    swatchBox.appendChild(b);
  });

  powerBtn.addEventListener('click', toggle);
  lamp.addEventListener('click', turnOff);

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (e.target.matches('button, input')) return;
      e.preventDefault();
      toggle();
    }
  });

  // Browsers suspend the camera in the background; re-assert on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (state.on) {
      requestWakeLock();
      if (state.src === 'torch') runPattern();
    }
  });

  window.addEventListener('pagehide', () => {
    stopPattern();
    setTorch(false);
    releaseCamera();
  });

  /* ---------- install ---------- */

  const installBtn = $('install');
  const iosHelp = $('iosHelp');
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIOS = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Chromium fires this when the app meets the install criteria.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandalone()) installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === 'accepted') installBtn.hidden = true;
      return;
    }
    // Safari has no install API — show the manual steps instead.
    iosHelp.hidden = !iosHelp.hidden;
  });

  $('iosClose').addEventListener('click', () => { iosHelp.hidden = true; });

  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    iosHelp.hidden = true;
    setStatus('Installed. Open Light from your home screen.');
  });

  function initInstallUI() {
    if (isStandalone()) {
      installBtn.hidden = true;
      hintEl.hidden = true;
      return;
    }
    // iOS never fires beforeinstallprompt, so offer the manual route up front.
    if (isIOS()) installBtn.hidden = false;
  }

  /* ---------- boot ---------- */

  (function boot() {
    const secure = window.isSecureContext;
    const hasCam = !!navigator.mediaDevices?.getUserMedia;
    if (!secure || !hasCam) {
      selectSource('screen');
      $('srcTorch').disabled = true;
      setStatus(secure
        ? 'This browser exposes no camera — screen lamp only.'
        : 'Needs HTTPS for the camera LED — screen lamp only.', true);
    } else {
      setStatus('Camera LED ready — permission is asked on first use.');
    }
    initInstallUI();
  })();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
