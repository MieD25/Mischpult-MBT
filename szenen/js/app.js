/* Steuerung: Zustand je Szene, Soundcheck/Show, Aufgaben, Bewertung, Hauptschleife */
(function (S) {
  "use strict";
  const { $, $$, el, clamp, ampToDb, fmtDb } = S;
  const E = S.Engine;
  const STATES = {};
  let scene = null, st = null, api = null;

  /* ---------- Zustand ---------- */
  const BASE_CH = { input: null, gain: 0, phantom: false, hpfOn: false, hpf: 80, hi: 0, lo: 0, midG: 0, midF: 1000, eqOn: true, aux: [-Infinity, -Infinity], pre: [true, false], pan: 0, mute: false, pfl: false, fader: -Infinity };
  function freshState(sc) {
    const ch = sc.channels.map(c => Object.assign({}, BASE_CH, c, { aux: c.aux ? [...c.aux] : [...BASE_CH.aux], pre: c.pre ? [...c.pre] : [...BASE_CH.pre] }));
    const mics = {}; sc.mics.forEach(m => mics[m.id] = { x: m.x, y: m.y, angle: m.angle, type: m.type, pattern: m.pattern, socket: m.socket });
    const srcPos = {}; sc.sources.forEach(s => { if (s.kind === 'acoustic') srcPos[s.id] = { x: s.x, y: s.y }; });
    const srcOn = {}; sc.sources.forEach(s => srcOn[s.id] = sc.checkOn ? sc.checkOn.includes(s.id) : true);
    const M = sc.masters || {};
    return {
      mode: 'check', ch, mics, srcPos, srcOn, out: Object.assign({}, sc.outDefault), selMic: sc.mics[0].id,
      main: M.main ?? 0, auxM: [...(M.auxM || [0, 0])], fxRet: M.fxRet ?? -6, vol: M.vol ?? -12,
      rec: { trim: M.recTrim ?? 0, on: false, t: 0 }, listen: sc.listen[0].id,
      done: [], showT: 0, okT: 0, totT: 0,
    };
  }

  /* ---------- Aktivität der Quellen ---------- */
  const wrapT = t => { const L = scene.show.len; return ((t % L) + L) % L; };
  function activeAt(id, t) { const iv = scene.show.activity[id] || []; const tt = wrapT(t); return iv.some(([a, b]) => tt >= a && tt < b); }
  function activeNow() {
    const a = {};
    for (const s of scene.sources) a[s.id] = st.mode === 'check' ? !!st.srcOn[s.id] : activeAt(s.id, st.showT);
    return a;
  }

  /* ---------- Pegelfenster für Aufgaben ---------- */
  let WIN = [], recWin = [], mainClipUntil = 0, recClipUntil = 0, lastNow = performance.now();
  function chanSources(i) {
    const inp = st.ch[i].input; if (!inp) return [];
    const ls = scene.sources.filter(s => s.kind === 'line' && s.inputs.includes(inp)).map(s => s.id);
    const ms = scene.mics.filter(m => st.mics[m.id].socket === inp).map(m => m.for);
    return ls.concat(ms);
  }
  function winOk(i) {
    const w = WIN[i]; if (!w || w.length < 2 || w[w.length - 1].t - w[0].t < 1500) return false;
    let m = -Infinity; for (const p of w) if (p.p > m) m = p.p; return m >= -18 && m <= -6;
  }

  function makeApi() {
    const a = {
      st, scene,
      src: id => scene.sources.find(s => s.id === id),
      micFor: id => (scene.mics.find(m => m.for === id) || {}).id,
      chansForInputs: ids => st.ch.map((c, i) => c.input && ids.includes(c.input) ? i : -1).filter(i => i >= 0),
      chansForSource: id => {
        const s = a.src(id); if (s.kind === 'line') return a.chansForInputs(s.inputs);
        const sock = st.mics[a.micFor(id)].socket; return sock ? a.chansForInputs([sock]) : [];
      },
      open: i => !st.ch[i].mute && st.ch[i].fader > -30,
      powered: micId => E.micPowered(st, scene.mics.find(m => m.id === micId)),
      angleErr: (m, s) => S.micGeom(st, m, s).err,
      dist: (m, s) => S.micGeom(st, m, s).dist,
      levelOk: id => a.chansForSource(id).some(winOk),
      mustOpen: id => activeAt(id, st.showT) && activeAt(id, st.showT - 1.5),
      mustClose: id => !activeAt(id, st.showT) && !activeAt(id, st.showT - 1.5) && !activeAt(id, st.showT + 1.5),
      mainClip: () => performance.now() < mainClipUntil,
      recClip: () => performance.now() < recClipUntil,
      recLow: () => { if (recWin.length < 2 || recWin[recWin.length - 1].t - recWin[0].t < 2500) return false; return Math.max(...recWin.map(p => p.p)) < -30; },
      playing: () => !!(E.g && E.ctx.state === 'running'),
    };
    return a;
  }

  /* ---------- Änderungen ---------- */
  let powerSig = '';
  function changed(kind) {
    if (kind === 'ch' || kind === 'pfl') { E.applyChannels(st); E.applyMics(st); }
    if (kind === 'pfl' || kind === 'listen') { E.applyListen(st); S.updateConsoleLabels(scene, st); }
    if (kind === 'm') E.applyMasters(st);
    if (kind === 'mic') { E.applyMics(st); S.renderRoom(); }
    if (kind === 'patch') { E.applyMics(st); E.applyChannels(st); E.applyOutputs(st); E.applyListen(st); S.renderPatch(scene, st, changed); S.updateConsoleLabels(scene, st); S.renderRoom(); }
    if (kind === 'src') S.updateRoomActivity(activeNow());
    const sig = scene.mics.map(m => E.micPowered(st, m) ? 1 : 0).join('');
    if (sig !== powerSig) { powerSig = sig; if (kind !== 'mic' && kind !== 'patch') S.renderRoom(); }
    checkTasks();
  }

  /* ---------- Aufgaben ---------- */
  function renderTasks() {
    const ol = $('#tasks'); ol.innerHTML = '';
    scene.tasks.forEach((t, i) => {
      const d = st.done.includes(t.id);
      const li = el('li', 'task' + (d ? ' done' : ''), `<div class="chk" aria-hidden="true">✓</div><div><h4><span class="num">${i + 1}</span>${t.t}</h4><p>${t.d}</p></div>`);
      li.setAttribute('aria-label', t.t + (d ? ': erledigt' : ': offen')); ol.append(li);
    });
    $('#taskCount').innerHTML = `<b>${st.done.length}</b> von ${scene.tasks.length} erledigt`;
  }
  function checkTasks() {
    let ch = false;
    for (const t of scene.tasks) if (!st.done.includes(t.id)) { try { if (t.ok(api)) { st.done.push(t.id); ch = true; } } catch (e) { console.warn(e); } }
    if (ch) renderTasks();
  }

  /* ---------- Show ---------- */
  const mmss = t => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  function renderShow(issues) {
    const sp = $('#showpanel'); if (st.mode !== 'show') { sp.hidden = true; return; } sp.hidden = false;
    const L = scene.show.len, t = st.showT, cues = scene.show.cues;
    let ci = 0; cues.forEach((c, i) => { if (t >= c.t) ci = i; });
    const next = cues[ci + 1] || cues[0], nt = (next.t - t + L) % L || L;
    const pct = st.totT > 0 ? Math.round(st.okT / st.totT * 100) : 100;
    sp.innerHTML = `<div class="showtop" data-help="show"><div><div class="eyebrow">Jetzt · ${mmss(t)} / ${mmss(L)}</div><div class="cuenow">${cues[ci].text}</div>
      <div class="cuenext ${nt <= 4 ? 'soon' : ''}">Nächster Cue in ${Math.ceil(nt)} s: ${next.text}</div></div>
      <div class="score" data-help="score"><div class="scorenum ${pct >= 85 ? 'good' : pct >= 60 ? 'mid' : 'bad'}">${pct} %</div><div class="muted">fehlerfrei</div></div></div>
      <div class="tl" data-help="show"><div class="tlbar" style="width:${(t / L * 100).toFixed(1)}%"></div>${cues.map(c => `<span class="tlmark" style="left:${(c.t / L * 100).toFixed(1)}%"></span>`).join('')}</div>
      <ol class="cuelist" data-help="show">${cues.map((c, i) => `<li class="${i === ci ? 'cur' : ''}"><span>${mmss(c.t)}</span>${c.text}</li>`).join('')}</ol>
      <div class="issues" data-help="score">${!api.playing() ? '<p class="muted">Starte die Wiedergabe, dann läuft die Show.</p>' : issues.length ? issues.map(x => `<p class="issue">${x}</p>`).join('') : '<p class="okmsg">Alles in Ordnung.</p>'}</div>`;
  }

  /* ---------- Szene laden ---------- */
  async function loadScene(id) {
    scene = S.scenes.find(s => s.id === id);
    st = STATES[id] || (STATES[id] = freshState(scene));
    api = makeApi(); WIN = st.ch.map(() => []); recWin = []; powerSig = '';
    S.resetMeters();
    $$('.scenetab').forEach(b => { b.classList.toggle('on', b.dataset.id === id); b.setAttribute('aria-selected', b.dataset.id === id); });
    $('#sceneIntro').textContent = scene.intro; $('#roomLabel').textContent = scene.room.label;
    const fs = $('#fileSrc'); fs.innerHTML = scene.sources.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    S.buildConsole(scene, st, changed); S.buildRoom(scene, st, changed); S.renderPatch(scene, st, changed);
    setMode(st.mode, true); renderTasks();
    if (E.ctx) { setStatus('Szene wird aufgebaut …', true); await E.build(scene, st); setStatus(statusText()); }
    S.renderRoom(); checkTasks();
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }
  function setMode(m, silent) {
    st.mode = m;
    $$('.modebtn').forEach(b => { b.classList.toggle('on', b.dataset.mode === m); b.setAttribute('aria-pressed', b.dataset.mode === m); });
    document.body.classList.toggle('showmode', m === 'show');
    if (m === 'show' && !silent) { st.showT = 0; st.okT = 0; st.totT = 0; }
    S.renderPatch(scene, st, changed); S.renderRoom(); renderShow([]);
    S.updateRoomActivity(activeNow());
  }

  /* ---------- Status / Transport ---------- */
  const statusEl = $('#status'), playBtn = $('#play');
  function setStatus(t, busy) { statusEl.textContent = t; statusEl.classList.toggle('busy', !!busy); }
  const statusText = () => E.ctx && E.ctx.state === 'running' ? (st.mode === 'show' ? 'Show läuft.' : 'Soundcheck läuft. Quellen unter dem Raumplan einzeln an- und ausschalten.') : 'Pausiert.';
  playBtn.addEventListener('click', async () => {
    try {
      if (!E.g) { playBtn.disabled = true; await E.init(); setStatus('Klänge werden erzeugt …', true); await E.build(scene, st); playBtn.disabled = false; await E.ctx.resume(); }
      else if (E.ctx.state === 'running') await E.ctx.suspend();
      else await E.ctx.resume();
      setStatus(statusText());
    } catch (e) { playBtn.disabled = false; setStatus('Audio konnte nicht gestartet werden: ' + e.message); }
    playBtn.textContent = E.ctx && E.ctx.state === 'running' ? '❚❚ Pause' : '▶ Wiedergabe';
    S.renderRoom();
  });
  $('#reset').addEventListener('click', () => { delete STATES[scene.id]; delete S.custom[scene.id]; loadScene(scene.id); });
  $$('.modebtn').forEach(b => b.addEventListener('click', () => { setMode(b.dataset.mode); setStatus(statusText()); }));

  /* Eigene Datei */
  $('#fileLbl').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
  $('#file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return; const id = $('#fileSrc').value;
    try {
      await E.init(); setStatus('Datei wird gelesen …', true);
      const buf = await E.ctx.decodeAudioData(await f.arrayBuffer());
      (S.custom[scene.id] || (S.custom[scene.id] = {}))[id] = buf;
      if (E.g) E.replaceSource(id, buf);
      setStatus(`„${f.name}“ ersetzt jetzt ${scene.sources.find(s => s.id === id).name}. ${E.g ? '' : 'Wiedergabe starten zum Anhören.'}`);
    } catch (err) { setStatus('Die Datei konnte nicht gelesen werden. Bitte WAV oder MP3 versuchen.'); }
    e.target.value = '';
  });

  /* ---------- Hilfe ---------- */
  function showHelp(k) { const h = S.HELP[k]; if (!h) return; $('#helpT').textContent = h.t; $('#helpD').innerHTML = h.d; }
  document.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('[data-help]'); if (t) showHelp(t.dataset.help); });
  document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('[data-help]'); if (t) showHelp(t.dataset.help); });
  $('#helpToggle').addEventListener('click', () => { const h = $('#helpbox'); h.classList.toggle('min'); $('#helpToggle').textContent = h.classList.contains('min') ? 'Hilfe zeigen' : '–'; });

  /* ---------- Hauptschleife ---------- */
  const inHold = {}; let tick = 0, lastIssues = [];
  function frame(now) {
    const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
    const g = E.g && E.g.scene === scene ? E.g : null, run = !!(g && E.ctx.state === 'running');
    if (run && st.mode === 'show') { st.showT += dt; if (st.showT >= scene.show.len) st.showT -= scene.show.len; }
    if (run && st.rec.on) st.rec.t += dt;
    const act = activeNow(); if (g) E.applyGates(act);
    const ui = S.ui;
    st.ch.forEach((c, i) => {
      const ip = run ? ampToDb(S.peakOf(g.ch[i].inAn)) : -Infinity, pp = run ? ampToDb(S.peakOf(g.ch[i].postAn)) : -Infinity;
      S.drawMeter(ui.ch[i].meter, S.stepMeter('c' + i, pp, dt, now));
      const h = inHold[i] || (inHold[i] = { v: -Infinity, t: 0 }); if (ip >= h.v || now > h.t) { h.v = ip; h.t = now + 1000; }
      ui.ch[i].led.className = 'led' + (h.v >= -3 ? ' r' : h.v >= -12 ? ' y' : h.v > -55 ? ' g' : '');
      ui.ch[i].lr.textContent = h.v === -Infinity ? '—' : fmtDb(h.v);
      const w = WIN[i]; if (run && chanSources(i).some(id => act[id])) w.push({ t: now, p: ampToDb(S.peakOf(g.ch[i].preAn)) }); while (w.length && now - w[0].t > 2500) w.shift();
    });
    for (let a = 0; a < 2; a++) S.drawMeter(ui.aux[a], S.stepMeter('a' + a, run ? ampToDb(S.peakOf(g.anAux[a])) : -Infinity, dt, now));
    const lp = run ? S.peakOf(g.anML) : 0, rp = run ? S.peakOf(g.anMR) : 0;
    S.drawMeter(ui.main.mL, S.stepMeter('mL', ampToDb(lp), dt, now)); S.drawMeter(ui.main.mR, S.stepMeter('mR', ampToDb(rp), dt, now));
    if (lp >= 1 || rp >= 1) mainClipUntil = now + 1200; ui.main.clip.className = 'led' + (now < mainClipUntil ? ' r' : '');
    if (ui.ls) {
      const pf = g && g.anyPfl, a = run ? S.peakOf(pf ? g.pflAn : g.lsAnL) : 0, b = run ? S.peakOf(pf ? g.pflAn : g.lsAnR) : 0;
      S.drawMeter(ui.ls.mL, S.stepMeter('lsL', ampToDb(a), dt, now), true); S.drawMeter(ui.ls.mR, S.stepMeter('lsR', ampToDb(b), dt, now), true);
    }
    if (ui.fx) S.drawMeter(ui.fx, S.stepMeter('fx', run && g.fxAn ? ampToDb(S.peakOf(g.fxAn)) : -Infinity, dt, now));
    if (ui.rec) {
      const a = run ? S.peakOf(g.rec.anL) : 0, b = run ? S.peakOf(g.rec.anR) : 0;
      S.drawMeter(ui.rec.mL, S.stepMeter('rL', ampToDb(a), dt, now)); S.drawMeter(ui.rec.mR, S.stepMeter('rR', ampToDb(b), dt, now));
      if (a >= 1 || b >= 1) recClipUntil = now + 1200; ui.rec.clip.className = 'led' + (now < recClipUntil ? ' r' : '');
      if (run) { recWin.push({ t: now, p: ampToDb(Math.max(a, b)) }); while (recWin.length && now - recWin[0].t > 3500) recWin.shift(); }
      ui.rec.time.textContent = (st.rec.on ? '● ' : '') + mmss(st.rec.t); ui.rec.time.classList.toggle('on', st.rec.on);
    }
    if (now - tick > 250) {
      const step = (now - tick) / 1000; tick = now;
      S.updateRoomActivity(act);
      if (st.mode === 'show') {
        lastIssues = run ? scene.show.rules(api) : [];
        if (run) { st.totT += step; if (!lastIssues.length) st.okT += step; }
        renderShow(lastIssues);
      }
      checkTasks();
    }
    requestAnimationFrame(frame);
  }

  S._debug = () => ({ st, scene, changed });
  /* ---------- Start ---------- */
  const tabs = $('#scenetabs');
  S.scenes.forEach(sc => { const b = el('button', 'scenetab', sc.name); b.type = 'button'; b.dataset.id = sc.id; b.dataset.help = 'scene'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => loadScene(sc.id)); tabs.append(b); });
  showHelp('overview');
  const start = (location.hash || '').slice(1);
  loadScene(S.scenes.some(s => s.id === start) ? start : S.scenes[0].id);
  requestAnimationFrame(frame);
})(Sim);
