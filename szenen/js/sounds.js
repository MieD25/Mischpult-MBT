/* Klangerzeugung: alle Quellen werden einmalig offline gerendert und dann als Schleife abgespielt.
   Eine Szene nennt pro Quelle einen Generator, z. B. {gen:'voice', f0:115, seed:3}. */
(function (S) {
  "use strict";
  const BPM = 96, BEAT = 60 / BPM, STEP = BEAT / 4, BAR = BEAT * 4, SONG = BAR * 4;
  S.SONG_LEN = SONG;

  async function off(sr, dur, ch, fn) { const oc = new OfflineAudioContext(ch, Math.round(dur * sr), sr); fn(oc, oc.destination); return oc.startRendering(); }
  function noiseBuf(oc, rnd = Math.random) { const b = oc.createBuffer(1, oc.sampleRate, oc.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; return b; }
  function env(p, t, peak, att, dec) { p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + att); p.exponentialRampToValueAtTime(0.0001, t + att + dec); }
  function normalize(buf, peak) {
    let m = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; } }
    const k = m ? peak / m : 1; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
    return buf;
  }
  function nsrc(oc, nb, t, dur, type, freq, q, peak, dec, out) {
    const s = oc.createBufferSource(); s.buffer = nb; const f = oc.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = oc.createGain(); g.gain.value = 0; env(g.gain, t, peak, 0.001, dec); s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur);
  }

  const GEN = {};

  /* Sprachähnliches „Gebrabbel“: Stimmquelle (Sägezahn) durch wandernde Formantfilter, Silben, Phrasen, Pausen */
  GEN.voice = (sr, o) => off(sr, o.len || 16, 1, (oc, out) => {
    const rnd = S.rng(o.seed || 1), f0 = o.f0 || 120, fs = o.female ? 1.17 : 1, len = o.len || 16;
    const V = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [290, 2250, 3000], o: [570, 840, 2410], u: [320, 870, 2240], ae: [660, 1720, 2410], oe: [460, 1450, 2350] };
    const vk = Object.keys(V);
    const src = oc.createOscillator(); src.type = 'sawtooth';
    const tilt = oc.createBiquadFilter(); tilt.type = 'lowpass'; tilt.frequency.value = 3200;
    const vEnv = oc.createGain(); vEnv.gain.value = 0;
    src.connect(tilt).connect(vEnv);
    const F = [[1, 9], [0.5, 15], [0.22, 18]].map(([g, q]) => { const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q; const gg = oc.createGain(); gg.gain.value = g; vEnv.connect(bp).connect(gg).connect(out); return bp; });
    const buzz = oc.createGain(); buzz.gain.value = 0.04; vEnv.connect(buzz).connect(out);
    const nb = noiseBuf(oc, rnd);
    const fric = oc.createBufferSource(); fric.buffer = nb; fric.loop = true;
    const fHP = oc.createBiquadFilter(); fHP.type = 'highpass'; fHP.frequency.value = 3800;
    const fEnv = oc.createGain(); fEnv.gain.value = 0; fric.connect(fHP).connect(fEnv).connect(out);
    let t = 0.3; src.frequency.setValueAtTime(f0, 0);
    while (t < len - 1.2) {
      const n = 3 + Math.floor(rnd() * 8); const start = t;
      for (let s = 0; s < n && t < len - 0.9; s++) {
        const progress = s / n, dur = (0.13 + rnd() * 0.13) / (o.rate || 1);
        const kind = rnd();
        if (kind < 0.25) { // Zischlaut
          const fd = 0.05 + rnd() * 0.06; fHP.frequency.setValueAtTime(rnd() < 0.5 ? 4200 : 2600, t);
          fEnv.gain.setTargetAtTime(0.35 + rnd() * 0.2, t, 0.01); fEnv.gain.setTargetAtTime(0, t + fd, 0.012); t += fd;
        } else if (kind < 0.45) { // Plosiv
          nsrc(oc, nb, t, 0.03, 'bandpass', 1200 + rnd() * 1500, 0.8, 0.5, 0.012, out); t += 0.025;
        }
        const v = V[vk[Math.floor(rnd() * vk.length)]];
        const pitch = f0 * (1.15 - 0.3 * progress) * (1 + (rnd() - 0.5) * 0.14) * (s === 0 ? 1.06 : 1);
        src.frequency.setTargetAtTime(pitch, t, 0.03);
        F.forEach((bp, i) => bp.frequency.setTargetAtTime(v[i] * fs, t, 0.025));
        const amp = 0.55 + rnd() * 0.45;
        vEnv.gain.setTargetAtTime(amp, t, 0.015); vEnv.gain.setTargetAtTime(amp * 0.25, t + dur * 0.8, 0.02);
        t += dur;
      }
      vEnv.gain.setTargetAtTime(0, t, 0.03);
      if (t - start > 0) t += 0.25 + rnd() * 0.55;
    }
    vEnv.gain.setTargetAtTime(0, len - 0.8, 0.02);
    src.start(0); fric.start(0);
  }).then(b => normalize(b, 0.5));

  GEN.kick = sr => off(sr, SONG, 1, (oc, out) => {
    const nb = noiseBuf(oc);
    for (let bar = 0; bar < 4; bar++) for (const st of (bar % 2 === 0 ? [0, 7, 8, 14] : [0, 7, 8])) {
      const t = bar * BAR + st * STEP, o = oc.createOscillator(), g = oc.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
      g.gain.value = 0; env(g.gain, t, 1, 0.002, 0.42); o.connect(g).connect(out); o.start(t); o.stop(t + 0.5);
      nsrc(oc, nb, t, 0.03, 'highpass', 3000, 0.7, 0.25, 0.012, out);
    }
  }).then(b => normalize(b, 0.5));

  GEN.snare = sr => off(sr, SONG, 1, (oc, out) => {
    const nb = noiseBuf(oc);
    for (let bar = 0; bar < 4; bar++) {
      const b0 = bar * BAR;
      for (const st of [4, 12]) {
        const t = b0 + st * STEP;
        nsrc(oc, nb, t, 0.3, 'bandpass', 1800, 0.8, 0.9, 0.18, out); nsrc(oc, nb, t, 0.2, 'highpass', 5000, 0.7, 0.35, 0.12, out);
        const o = oc.createOscillator(), g = oc.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(195, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
        g.gain.value = 0; env(g.gain, t, 0.55, 0.001, 0.09); o.connect(g).connect(out); o.start(t); o.stop(t + 0.15);
      }
      for (let st = 0; st < 16; st += 2) { const open = (st === 14 && bar === 3); nsrc(oc, nb, b0 + st * STEP, open ? 0.3 : 0.08, 'highpass', 7500, 0.7, st % 4 === 0 ? 0.28 : 0.2, open ? 0.22 : 0.045, out); }
    }
  }).then(b => normalize(b, 0.5));

  GEN.bass = sr => off(sr, SONG, 1, (oc, out) => {
    const roots = [55, 43.654, 65.406, 48.999], pat = [[0, 1, 3], [3, 1, 1], [6, 1, 2], [8, 1, 2], [10, 2, 2], [12, 1, 1], [14, 1, 2]];
    for (let bar = 0; bar < 4; bar++) for (const [st, m, len] of pat) {
      const t = bar * BAR + st * STEP, te = t + len * STEP * 0.9, f = roots[bar] * m;
      const o = oc.createOscillator(), o2 = oc.createOscillator(), lp = oc.createBiquadFilter(), g = oc.createGain(), g2 = oc.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f; g2.gain.value = 0.8;
      lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(1500, t); lp.frequency.exponentialRampToValueAtTime(380, t + 0.25);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.005); g.gain.setTargetAtTime(0.6, t + 0.01, 0.1); g.gain.setTargetAtTime(0, te, 0.02);
      o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(out); o.start(t); o2.start(t); o.stop(te + 0.15); o2.stop(te + 0.15);
    }
  }).then(b => normalize(b, 0.5));

  GEN.keys = sr => off(sr, SONG, 1, (oc, out) => {
    const ch = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 261.63, 329.63], [196, 246.94, 293.66]];
    const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800; lp.connect(out);
    for (let bar = 0; bar < 4; bar++) for (const [st, vel] of [[0, 1], [6, 0.7], [10, 0.8]]) {
      const t = bar * BAR + st * STEP;
      for (const f of ch[bar]) {
        const o = oc.createOscillator(), o2 = oc.createOscillator(), g = oc.createGain(), g2 = oc.createGain();
        o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.003; g2.gain.value = 0.3;
        g.gain.value = 0; env(g.gain, t, vel * 0.5, 0.004, 1.1); o.connect(g); o2.connect(g2).connect(g); g.connect(lp); o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2);
      }
    }
  }).then(b => normalize(b, 0.5));

  GEN.sing = sr => off(sr, SONG, 1, (oc, out) => {
    const env0 = oc.createGain(); env0.gain.value = 0;
    for (const [f, q, a] of [[800, 6, 1], [1150, 8, 0.6], [2900, 10, 0.35]]) { const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const g = oc.createGain(); g.gain.value = a; env0.connect(bp).connect(g).connect(out); }
    const o = oc.createOscillator(); o.type = 'sawtooth'; const lfo = oc.createOscillator(), lg = oc.createGain(); lfo.frequency.value = 5.3; lg.gain.value = 4; lfo.connect(lg).connect(o.frequency);
    const mel = [[0, 440, 6], [6, 523.25, 2], [8, 587.33, 4], [12, 523.25, 4], [16, 440, 6], [22, 392, 2], [24, 349.23, 8], [32, 392, 4], [36, 440, 2], [38, 523.25, 6], [44, 392, 4], [48, 392, 6], [54, 440, 2], [56, 493.88, 4], [60, 392, 3]];
    o.frequency.setValueAtTime(440, 0);
    for (const [st, f, len] of mel) { const t = st * STEP, te = t + len * STEP - 0.04; o.frequency.setTargetAtTime(f, t, 0.015); env0.gain.setTargetAtTime(1, t, 0.03); env0.gain.setTargetAtTime(0, te - 0.05, 0.03); }
    o.connect(env0); o.start(0); lfo.start(0);
  }).then(b => normalize(b, 0.5));

  /* Stereo-Jingle für den Einspieler (Laptop) */
  GEN.jingle = sr => off(sr, 12, 2, (oc, out) => {
    const chords = [[261.63, 329.63, 392], [220, 277.18, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];
    chords.forEach((c, i) => c.forEach((f, j) => {
      const t = i * 3, o = oc.createOscillator(), g = oc.createGain(), p = oc.createStereoPanner();
      o.type = 'triangle'; o.frequency.value = f / 2; p.pan.value = (j - 1) * 0.7;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.4); g.gain.setTargetAtTime(0, t + 2.7, 0.15);
      o.connect(g).connect(p).connect(out); o.start(t); o.stop(t + 3.4);
    }));
    const mel = [784, 659.25, 783.99, 880, 659.25, 554.37, 659.25, 587.33, 523.25, 440, 523.25, 587.33, 493.88, 587.33, 783.99, 587.33];
    mel.forEach((f, i) => {
      const t = i * 0.75, o = oc.createOscillator(), o2 = oc.createOscillator(), g = oc.createGain(), p = oc.createStereoPanner();
      o.frequency.value = f; o2.frequency.value = f * 3.01; p.pan.value = Math.sin(i * 1.3) * 0.8;
      const g2 = oc.createGain(); g2.gain.value = 0.2; g.gain.value = 0; env(g.gain, t, 0.35, 0.003, 0.9);
      o.connect(g); o2.connect(g2).connect(g); g.connect(p).connect(out); o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
    });
  }).then(b => normalize(b, 0.5));

  /* Stereo-Atmo: Park mit Vögeln und entferntem Verkehr */
  GEN.atmo = sr => off(sr, 16, 2, (oc, out) => {
    const rnd = S.rng(7);
    for (let c = 0; c < 2; c++) {
      const nb = noiseBuf(oc), s = oc.createBufferSource(); s.buffer = nb; s.loop = true;
      const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; const g = oc.createGain(); g.gain.value = 0.5;
      const lfo = oc.createOscillator(), lg = oc.createGain(); lfo.frequency.value = 0.07 + c * 0.03; lg.gain.value = 0.25; lfo.connect(lg).connect(g.gain);
      const p = oc.createStereoPanner(); p.pan.value = c ? 0.9 : -0.9;
      s.connect(lp).connect(g).connect(p).connect(out); s.start(0, c * 0.37); lfo.start(0);
    }
    for (let i = 0; i < 26; i++) {
      const t = 0.3 + rnd() * 15, n = 2 + Math.floor(rnd() * 4), base = 2800 + rnd() * 2200, pan = rnd() * 1.8 - 0.9;
      for (let k = 0; k < n; k++) {
        const tt = t + k * (0.09 + rnd() * 0.05); if (tt > 15.6) break;
        const o = oc.createOscillator(), g = oc.createGain(), p = oc.createStereoPanner(); p.pan.value = pan;
        o.frequency.setValueAtTime(base * (1 + rnd() * 0.15), tt); o.frequency.exponentialRampToValueAtTime(base * (0.75 + rnd() * 0.5), tt + 0.06);
        g.gain.value = 0; env(g.gain, tt, 0.06 + rnd() * 0.05, 0.005, 0.06); o.connect(g).connect(p).connect(out); o.start(tt); o.stop(tt + 0.1);
      }
    }
  }).then(b => normalize(b, 0.45));

  S.Sounds = {
    cache: {},
    render(sr, spec) {
      const key = sr + JSON.stringify(spec);
      if (!this.cache[key]) this.cache[key] = GEN[spec.gen](sr, spec);
      return this.cache[key];
    },
    makeIR(ctx, T, channels = 1) {
      const sr = ctx.sampleRate, len = Math.round(sr * (T + 0.1)), pre = Math.round(sr * 0.012), b = ctx.createBuffer(channels, len, sr);
      for (let c = 0; c < channels; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = pre; i < len; i++) { const t = (i - pre) / sr; lp += 0.35 * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(10, -3 * t / T); } }
      return b;
    },
    thump(ctx) {
      const sr = ctx.sampleRate, n = Math.round(sr * 0.25), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.exp(-t * 18) * Math.sin(2 * Math.PI * 9 * t) + (i < sr * 0.004 ? (Math.random() * 2 - 1) * 0.5 : 0); }
      return b;
    },
  };
})(Sim);
