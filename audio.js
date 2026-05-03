window.GameAudio = (function () {
  const BGM_URL = 'assets/Sunday_High_Score.mp3';
  const BGM_VOLUME = 0.4;

  let ctx = null;
  let master, sfxGain;
  let bgm = null;
  let musicEnabled = true;
  let sfxEnabled = true;

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(master);
    return ctx;
  }

  function ensureBgm() {
    if (bgm) return bgm;
    bgm = new Audio(BGM_URL);
    bgm.loop = true;
    bgm.preload = 'auto';
    bgm.volume = BGM_VOLUME;
    return bgm;
  }

  function startMusic() {
    ensureBgm();
    const p = bgm.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay ブロック等は無視 */ });
  }

  function stopMusic() {
    if (bgm) bgm.pause();
  }

  function setMusic(on) {
    musicEnabled = on;
    if (on) startMusic();
    else stopMusic();
  }

  function setSfx(on) { sfxEnabled = on; }

  function playTone(freq, time, dur, type, peak, target) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(target);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  function playDrop() {
    if (!sfxEnabled) return;
    ensureCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g).connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  function playMerge(level) {
    if (!sfxEnabled) return;
    ensureCtx();
    const t = ctx.currentTime;
    const base = 64 + Math.min(level, 12) * 1.4;
    const notes = [base, base + 4, base + 7];
    notes.forEach((n, i) => {
      playTone(midiToFreq(n), t + i * 0.04, 0.28, 'triangle', 0.32, sfxGain);
    });
  }

  function playGameOver() {
    if (!sfxEnabled) return;
    ensureCtx();
    const t = ctx.currentTime;
    [67, 64, 60, 55].forEach((n, i) => {
      playTone(midiToFreq(n), t + i * 0.18, 0.45, 'triangle', 0.4, sfxGain);
    });
  }

  return {
    start() {
      ensureCtx();
      const begin = () => { if (musicEnabled) startMusic(); };
      if (ctx.state === 'suspended') {
        ctx.resume().then(begin).catch(begin);
      } else {
        begin();
      }
    },
    setMusic,
    setSfx,
    playDrop,
    playMerge,
    playGameOver,
    isMusicOn: () => musicEnabled,
    isSfxOn: () => sfxEnabled,
  };
})();
