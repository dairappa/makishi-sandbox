window.GameAudio = (function () {
  let ctx = null;
  let master, musicGain, sfxGain;
  let timer = null;
  let nextNoteTime = 0;
  let step = 0;
  let musicEnabled = true;
  let sfxEnabled = true;

  const BPM = 96;
  const STEP_S = 60 / BPM / 4; // 16分音符の長さ
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.12;

  // 32 ステップ = 8 拍 = 約 5 秒。null は休符
  // メロディ：C メジャーの軽快なフレーズ（8分音符グリッド）
  const LEAD = [
    72, null, 76, null, 79, null, 81, null,
    79, null, 76, null, 74, null, 76, null,
    72, null, 76, null, 79, null, 84, null,
    81, null, 77, null, 76, null, null, null,
  ];
  // ベース：I - IV - V - I
  const BASS = [
    36, null, null, null, 43, null, null, null,
    41, null, null, null, 43, null, null, null,
    43, null, null, null, 41, null, null, null,
    36, null, null, null, 43, null, null, null,
  ];

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
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(master);
    return ctx;
  }

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

  function scheduleStep(s, time) {
    const lead = LEAD[s];
    const bass = BASS[s];
    if (lead != null) {
      const f = midiToFreq(lead);
      // 軽くデチューンして温かみを足す
      playTone(f, time, 0.22, 'triangle', 0.55, musicGain);
      playTone(f * 1.006, time, 0.22, 'triangle', 0.25, musicGain);
    }
    if (bass != null) {
      playTone(midiToFreq(bass), time, 0.45, 'sine', 0.7, musicGain);
    }
    // 各拍に短いノイズでクリック音
    if (s % 4 === 0) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.07;
      src.connect(g).connect(musicGain);
      src.start(time);
    }
  }

  function loop() {
    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      scheduleStep(step, nextNoteTime);
      nextNoteTime += STEP_S;
      step = (step + 1) % LEAD.length;
    }
    timer = setTimeout(loop, LOOKAHEAD_MS);
  }

  function startMusic() {
    ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (timer) return;
    nextNoteTime = ctx.currentTime + 0.05;
    step = 0;
    loop();
  }

  function stopMusic() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function setMusic(on) {
    musicEnabled = on;
    if (on) startMusic();
    else stopMusic();
  }

  function setSfx(on) { sfxEnabled = on; }

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
    const notes = [base, base + 4, base + 7]; // 長三和音アルペジオ
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
