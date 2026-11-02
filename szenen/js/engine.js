/* Audio-Engine: baut pro Szene den kompletten Signalweg auf.
   Quelle → (Raum + Mikrofon) → Stagebox/Line-Eingang → Input-Patch → Kanalzug → Busse → Output-Patch → Ausgänge → Abhöre */
(function (S) {
  "use strict";
  const { dbToAmp, clamp } = S;
  const E = S.Engine = { ctx: null, g: null };
  S.custom = {};
  const MIC_LEVEL = 0.03;  // Mikrofonpegel liegt weit unter Line-Pegel: daher braucht ein Mic-Kanal +20 … +45 dB Gain
  const SPEED = 343;

  E.init = async () => {
    if (E.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Dieser Browser unterstützt die Web Audio API nicht.');
    E.ctx = new AC();
  };

  function an(n = 1024) { const a = E.ctx.createAnalyser(); a.fftSize = n; a.smoothingTimeConstant = 0.7; return a; }
  function gain(v = 1, mono = false) { const g = E.ctx.createGain(); g.gain.value = v; if (mono) { g.channelCount = 1; g.channelCountMode = 'explicit'; } return g; }
  const lin = new Float32Array([-1, 1]);
  function clipper() { const w = E.ctx.createWaveShaper(); w.curve = lin; return w; }
  function setP(p, v) { p.setTargetAtTime(v, E.ctx.currentTime, 0.015); }

  E.teardown = () => {
    const g = E.g; if (!g) return;
    try { g.final.gain.setTargetAtTime(0, E.ctx.currentTime, 0.02); } catch (e) {}
    const old = g; setTimeout(() => { try { old.final.disconnect(); } catch (e) {} old.sources.forEach(s => { try { s.stop(); } catch (e) {} }); }, 120);
    E.g = null;
  };

  E.build = async (scene, st) => {
    const ctx = E.ctx, sr = ctx.sampleRate;
    const bufs = {};
    await Promise.all(scene.sources.map(async s => { bufs[s.id] = (S.custom[scene.id] || {})[s.id] || await S.Sounds.render(sr, s.sound); }));
    E.teardown();
    const g = { scene, src: {}, mic: {}, inp: {}, ch: [], bus: {}, out: {}, sources: [], power: {} };

    /* Eingänge (Buchsen) */
    for (const i of scene.inputs) g.inp[i.id] = gain(1, true);

    /* Raum (gemeinsamer Nachhall für alle akustischen Quellen) */
    g.roomIn = gain(scene.room.level || 0.2, true);
    g.room = ctx.createConvolver(); g.room.buffer = S.Sounds.makeIR(ctx, scene.room.rt || 1, 1);
    g.roomOut = gain(1, true); g.roomIn.connect(g.room).connect(g.roomOut);

    /* Quellen */
    for (const s of scene.sources) {
      const bs = ctx.createBufferSource(); bs.buffer = bufs[s.id]; bs.loop = true;
      const gate = gain(0); bs.connect(gate); g.sources.push(bs);
      const n = { bs, gate };
      if (s.kind === 'acoustic') {
        n.dry = gain(1, true); gate.connect(n.dry); n.dry.connect(g.roomIn);
      } else {
        const sp = ctx.createChannelSplitter(2); gate.connect(sp);
        s.inputs.forEach((id, k) => sp.connect(g.inp[id], bufs[s.id].numberOfChannels > 1 ? k : 0));
      }
      g.src[s.id] = n;
    }

    /* Mikrofone: pro (Quelle, Mikrofon) ein Weg mit Laufzeit, Nahbesprechungseffekt und Richtwirkung */
    for (const m of scene.mics) {
      const sum = gain(1, true), out = gain(0, true);
      sum.connect(out);
      const pairs = {};
      for (const s of scene.sources) if (s.kind === 'acoustic') {
        const d = ctx.createDelay(0.2), sh = ctx.createBiquadFilter(), gg = gain(0);
        sh.type = 'lowshelf'; sh.frequency.value = 180;
        g.src[s.id].dry.connect(d).connect(sh).connect(gg).connect(sum);
        pairs[s.id] = { d, sh, gg };
      }
      const diff = gain(0); g.roomOut.connect(diff).connect(sum);
      g.mic[m.id] = { sum, out, pairs, diff, socket: null };
    }

    /* Busse */
    g.mainBus = gain(1); g.mainFader = gain(1); g.mainBus.connect(g.mainFader);
    const msp = ctx.createChannelSplitter(2); g.mainFader.connect(msp);
    g.bus.mainL = gain(1); g.bus.mainR = gain(1); msp.connect(g.bus.mainL, 0); msp.connect(g.bus.mainR, 1);
    g.anML = an(); g.anMR = an(); g.bus.mainL.connect(g.anML); g.bus.mainR.connect(g.anMR);
    g.auxBus = []; g.auxFader = []; g.anAux = [];
    for (let a = 0; a < 2; a++) {
      g.auxBus[a] = gain(1, true); g.auxFader[a] = gain(1, true); g.anAux[a] = an();
      g.auxBus[a].connect(g.auxFader[a]); g.auxFader[a].connect(g.anAux[a]); g.bus['aux' + (a + 1)] = g.auxFader[a];
    }
    g.pflBus = gain(1, true);

    /* Kanalzüge */
    for (let i = 0; i < st.ch.length; i++) {
      const n = {};
      n.inGain = gain(1, true); n.inAn = an(); n.clip = clipper();
      n.hpf = ctx.createBiquadFilter(); n.hpf.type = 'highpass'; n.hpf.Q.value = 0.707;
      n.lo = ctx.createBiquadFilter(); n.lo.type = 'lowshelf'; n.lo.frequency.value = 100;
      n.mid = ctx.createBiquadFilter(); n.mid.type = 'peaking'; n.mid.Q.value = 1;
      n.hi = ctx.createBiquadFilter(); n.hi.type = 'highshelf'; n.hi.frequency.value = 10000;
      n.pfl = gain(0); n.mute = gain(1); n.fader = gain(1); n.postAn = an(); n.pan = ctx.createStereoPanner();
      n.send = [[gain(0), gain(0)], [gain(0), gain(0)]]; // [aux][pre, post]
      n.inGain.connect(n.inAn); n.inGain.connect(n.clip); n.clip.connect(n.hpf).connect(n.lo).connect(n.mid).connect(n.hi);
      n.hi.connect(n.pfl).connect(g.pflBus);
      n.hi.connect(n.mute).connect(n.fader).connect(n.pan).connect(g.mainBus);
      n.fader.connect(n.postAn);
      for (let a = 0; a < 2; a++) { n.mute.connect(n.send[a][0]).connect(g.auxBus[a]); n.fader.connect(n.send[a][1]).connect(g.auxBus[a]); }
      n.input = null;
      g.ch.push(n);
    }

    /* Ausgänge */
    for (const o of scene.outputs) { g.out[o.id] = gain(1, true); g.out[o.id].src = null; }

    /* Hallgerät (wenn die Szene eines hat): Ausgang „fx“ → Hall → FX-Return in die Summe */
    if (scene.fx) {
      g.fxConv = ctx.createConvolver(); g.fxConv.buffer = S.Sounds.makeIR(ctx, scene.fx.rt || 2, 2);
      g.fxRet = gain(1); g.fxAn = an(); g.out.fx.connect(g.fxConv).connect(g.fxRet); g.fxRet.connect(g.mainBus); g.fxRet.connect(g.fxAn);
    }

    /* Recorder mit Hinterbandkontrolle */
    if (scene.recorder) {
      const r = g.rec = {};
      r.trimL = gain(1, true); r.trimR = gain(1, true); g.out.recL.connect(r.trimL); g.out.recR.connect(r.trimR);
      r.anL = an(); r.anR = an(); r.trimL.connect(r.anL); r.trimR.connect(r.anR);
      r.clL = clipper(); r.clR = clipper(); r.trimL.connect(r.clL); r.trimR.connect(r.clR);
      r.gateL = gain(0, true); r.gateR = gain(0, true); r.clL.connect(r.gateL); r.clR.connect(r.gateR);
      r.dL = ctx.createDelay(1); r.dR = ctx.createDelay(1); r.dL.delayTime.value = r.dR.delayTime.value = 0.14;
      r.hbL = gain(1, true); r.hbR = gain(1, true); r.gateL.connect(r.dL).connect(r.hbL); r.gateR.connect(r.dR).connect(r.hbR);
    }

    /* Abhöre */
    g.lsL = gain(1, true); g.lsR = gain(1, true); const mg = ctx.createChannelMerger(2);
    g.lsL.connect(mg, 0, 0); g.lsR.connect(mg, 0, 1);
    g.lsVol = gain(1); g.final = gain(1); mg.connect(g.lsVol).connect(g.final).connect(ctx.destination);
    g.lsConn = [];

    E.g = g;
    E.applyAll(st);
    const t = ctx.currentTime + 0.06; g.sources.forEach(s => s.start(t));
  };

  /* ---------- Parameter anwenden ---------- */
  E.micPowered = (st, m) => {
    if (!S.MICTYPES[st.mics[m.id].type].phantom) return true;
    const sock = st.mics[m.id].socket; if (!sock) return false;
    return st.ch.some(c => c.input === sock && c.phantom);
  };
  E.applyMics = st => {
    const g = E.g; if (!g) return;
    for (const m of g.scene.mics) {
      const ms = st.mics[m.id], n = g.mic[m.id], pat = S.PATTERNS[ms.pattern], type = S.MICTYPES[ms.type];
      const ang = ms.angle * Math.PI / 180;
      for (const s of g.scene.sources) if (s.kind === 'acoustic') {
        const p = n.pairs[s.id], sp = st.srcPos[s.id];
        const dx = sp.x - ms.x, dy = sp.y - ms.y, dist = Math.max(0.03, Math.hypot(dx, dy));
        const theta = Math.atan2(dy, dx) - ang;
        const pg = S.patternGain(ms.pattern, theta);
        setP(p.gg.gain, clamp(0.3 / dist, 0, 10) * pg * (s.level || 1));
        p.d.delayTime.setTargetAtTime(dist / SPEED, E.ctx.currentTime, 0.03);
        const prox = (1 - pat.a) * 16 * clamp((0.25 - dist) / 0.22, 0, 1);
        setP(p.sh.gain, prox);
      }
      setP(n.diff.gain, 1 / Math.sqrt(pat.Q));
      const powered = E.micPowered(st, m);
      if (powered && n.wasPowered === false && type.phantom && ms.socket) E.plop(ms.socket);
      n.wasPowered = powered;
      setP(n.out.gain, powered ? type.sens * MIC_LEVEL : 0);
      if (n.socket !== ms.socket) {
        try { n.out.disconnect(); } catch (e) {}
        if (ms.socket && g.inp[ms.socket]) n.out.connect(g.inp[ms.socket]);
        n.socket = ms.socket;
      }
    }
  };
  E.plop = sock => {
    const g = E.g; if (!g || !g.inp[sock]) return;
    const b = E.ctx.createBufferSource(); b.buffer = S.Sounds.thump(E.ctx); const k = gain(0.08); b.connect(k).connect(g.inp[sock]); b.start();
  };
  E.applyChannels = st => {
    const g = E.g; if (!g) return;
    const anyPfl = st.ch.some(c => c.pfl);
    st.ch.forEach((c, i) => {
      const n = g.ch[i];
      if (n.input !== c.input) {
        if (n.input && g.inp[n.input]) try { g.inp[n.input].disconnect(n.inGain); } catch (e) {}
        if (c.input && g.inp[c.input]) g.inp[c.input].connect(n.inGain);
        n.input = c.input;
      }
      setP(n.inGain.gain, dbToAmp(c.gain)); setP(n.hpf.frequency, c.hpfOn ? c.hpf : 5);
      setP(n.lo.gain, c.eqOn ? c.lo : 0); setP(n.mid.gain, c.eqOn ? c.midG : 0); setP(n.mid.frequency, c.midF); setP(n.hi.gain, c.eqOn ? c.hi : 0);
      setP(n.pfl.gain, c.pfl ? 1 : 0); setP(n.mute.gain, c.mute ? 0 : 1); setP(n.fader.gain, dbToAmp(c.fader)); setP(n.pan.pan, c.pan);
      for (let a = 0; a < 2; a++) { const v = dbToAmp(c.aux[a]); setP(n.send[a][0].gain, c.pre[a] ? v : 0); setP(n.send[a][1].gain, c.pre[a] ? 0 : v); }
    });
    g.anyPfl = anyPfl;
  };
  E.applyMasters = st => {
    const g = E.g; if (!g) return;
    setP(g.mainFader.gain, dbToAmp(st.main)); for (let a = 0; a < 2; a++) setP(g.auxFader[a].gain, dbToAmp(st.auxM[a]));
    if (g.fxRet) setP(g.fxRet.gain, dbToAmp(st.fxRet));
    if (g.rec) { setP(g.rec.trimL.gain, dbToAmp(st.rec.trim)); setP(g.rec.trimR.gain, dbToAmp(st.rec.trim)); setP(g.rec.gateL.gain, st.rec.on ? 1 : 0); setP(g.rec.gateR.gain, st.rec.on ? 1 : 0); }
    setP(g.lsVol.gain, dbToAmp(st.vol));
  };
  E.applyOutputs = st => {
    const g = E.g; if (!g) return;
    for (const o of g.scene.outputs) {
      const want = st.out[o.id] || null, n = g.out[o.id];
      if (n.src === want) continue;
      if (n.src && g.bus[n.src]) try { g.bus[n.src].disconnect(n); } catch (e) {}
      if (want && g.bus[want]) g.bus[want].connect(n);
      n.src = want;
    }
  };
  E.applyListen = st => {
    const g = E.g; if (!g) return;
    for (const [node, dest] of g.lsConn) try { node.disconnect(dest); } catch (e) {}
    g.lsConn = [];
    const c = (node, dest) => { node.connect(dest); g.lsConn.push([node, dest]); };
    const anyPfl = st.ch.some(x => x.pfl);
    if (anyPfl) { c(g.pflBus, g.lsL); c(g.pflBus, g.lsR); return; }
    const lp = g.scene.listen.find(l => l.id === st.listen) || g.scene.listen[0];
    if (lp.hb && g.rec) { c(g.rec.hbL, g.lsL); c(g.rec.hbR, g.lsR); }
    else if (lp.mono) { c(g.out[lp.mono], g.lsL); c(g.out[lp.mono], g.lsR); }
    else { c(g.out[lp.L], g.lsL); c(g.out[lp.R], g.lsR); }
  };
  E.applyGates = active => {
    const g = E.g; if (!g) return;
    for (const s of g.scene.sources) { const on = !!active[s.id]; const n = g.src[s.id]; if (n.on !== on) { n.gate.gain.setTargetAtTime(on ? 1 : 0, E.ctx.currentTime, 0.04); n.on = on; } }
  };
  E.replaceSource = (id, buf) => {
    const g = E.g; if (!g) return; const n = g.src[id];
    try { n.bs.stop(); n.bs.disconnect(); } catch (e) {}
    const bs = E.ctx.createBufferSource(); bs.buffer = buf; bs.loop = true; bs.connect(n.gate); bs.start(); n.bs = bs; g.sources.push(bs);
  };
  E.applyAll = st => { E.applyMics(st); E.applyChannels(st); E.applyMasters(st); E.applyOutputs(st); E.applyListen(st); };
})(Sim);
