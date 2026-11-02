/* Pultoberfläche: Kanalzüge, Aux-Master, Summe, Recorder, Abhöre */
(function (S) {
  "use strict";
  const { el, $ } = S;
  S.ui = {};

  function strip(color, cls = '') { const s = el('section', 'strip ' + cls); s.style.setProperty('--c', color); s.append(el('div', 'cap')); return s; }

  S.buildConsole = function (scene, st, changed) {
    const con = $('#console'); con.innerHTML = ''; S.refreshers.length = 0;
    const ui = S.ui = { ch: [], aux: [] };

    st.ch.forEach((c, i) => {
      const s = strip('#59616b'); s.setAttribute('aria-label', 'Kanal ' + (i + 1));
      const g = k => () => c[k], sv = k => v => { c[k] = v; changed('ch'); };
      const head = el('div', 'chhead'); head.dataset.help = 'chname';
      const num = el('div', 'chnum', String(i + 1)); const nm = el('div', 'chname', '—'); head.append(num, nm); s.append(head);
      const inp = el('div', 'src', ''); inp.dataset.help = 'chname'; s.append(inp);
      S.toggle(s, { label: '48 V', cls: 'ph', get: g('phantom'), set: v => { c.phantom = v; changed('ch'); }, help: 'phantom' });
      let r = el('div', 'krow'); s.append(r);
      S.knob(r, { label: 'GAIN', p: S.P.gain, get: g('gain'), set: sv('gain'), help: 'gain', aria: `Kanal ${i + 1} Gain` });
      const lb = el('div', 'ledbox'); lb.dataset.help = 'led'; const led = el('div', 'led'); const lr = el('div', 'ledread', '—'); lb.append(el('div', 'ledlab', 'PEAK'), led, lr); r.append(lb);
      r = el('div', 'krow'); s.append(r);
      S.toggle(r, { label: 'HPF', cls: 'hpfb', get: g('hpfOn'), set: sv('hpfOn'), help: 'hpf' });
      S.knob(r, { label: 'FREQ', p: S.P.hpf, get: g('hpf'), set: sv('hpf'), help: 'hpf', aria: `Kanal ${i + 1} Low-Cut-Frequenz` });
      s.append(el('div', 'slabel', 'EQ'));
      r = el('div', 'krow'); s.append(r);
      S.knob(r, { label: 'HI', p: S.P.eqg, get: g('hi'), set: sv('hi'), help: 'eq', aria: `Kanal ${i + 1} Höhen` });
      S.knob(r, { label: 'LO', p: S.P.eqg, get: g('lo'), set: sv('lo'), help: 'eq', aria: `Kanal ${i + 1} Tiefen` });
      r = el('div', 'krow'); s.append(r);
      S.knob(r, { label: 'MID', p: S.P.eqg, get: g('midG'), set: sv('midG'), help: 'eq', aria: `Kanal ${i + 1} Mitten` });
      S.knob(r, { label: 'FREQ', p: S.P.midF, get: g('midF'), set: sv('midF'), help: 'eq', aria: `Kanal ${i + 1} Mittenfrequenz` });
      S.toggle(s, { label: 'EQ IN', cls: 'eqb', get: g('eqOn'), set: sv('eqOn'), help: 'eq' });
      for (let a = 0; a < 2; a++) {
        s.append(el('div', 'slabel', `Aux ${a + 1} · ${scene.auxNames[a]}`));
        r = el('div', 'krow'); s.append(r);
        S.knob(r, { label: 'A' + (a + 1), p: S.P.send, get: () => c.aux[a], set: v => { c.aux[a] = v; changed('ch'); }, help: 'aux', aria: `Kanal ${i + 1} Aux ${a + 1}` });
        S.toggle(r, { label: 'PRE', cls: 'preb', get: () => c.pre[a], set: v => { c.pre[a] = v; changed('ch'); }, help: 'aux', labelFn: on => on ? 'PRE' : 'POST' });
      }
      r = el('div', 'krow one'); s.append(r);
      S.knob(r, { label: 'PAN', p: S.P.pan, get: g('pan'), set: sv('pan'), help: 'pan', aria: `Kanal ${i + 1} Panorama` });
      r = el('div', 'krow'); r.style.gap = '4px'; s.append(r);
      S.toggle(r, { label: 'MUTE', cls: 'mute', get: g('mute'), set: sv('mute'), help: 'mute' });
      S.toggle(r, { label: 'PFL', cls: 'pfl', get: g('pfl'), set: v => { c.pfl = v; changed('pfl'); }, help: 'pfl' });
      s.append(el('div', 'spacer'));
      const cans = S.fader(s, { get: g('fader'), set: sv('fader'), help: 'fader', aria: `Kanal ${i + 1} Fader` });
      ui.ch.push({ strip: s, led, lr, meter: cans[0], nm, inp });
      con.append(s);
    });

    const sep = el('div', 'consep'); con.append(sep);
    for (let a = 0; a < 2; a++) {
      const s = strip('#8b96a3', 'master');
      const nm = el('div', 'chname wide', scene.auxNames[a]); nm.dataset.help = 'auxm'; s.append(nm);
      s.append(el('div', 'src', `Aux ${a + 1} Master`)); s.append(el('div', 'spacer'));
      const cans = S.fader(s, { get: () => st.auxM[a], set: v => { st.auxM[a] = v; changed('m'); }, help: 'auxm', aria: `Aux ${a + 1} Master` });
      ui.aux.push(cans[0]); con.append(s);
    }
    if (scene.fx) {
      const s = strip('#8b96a3', 'master');
      const nm = el('div', 'chname wide', 'FX'); nm.dataset.help = 'fxret'; s.append(nm);
      s.append(el('div', 'src', 'Hall-Rückweg')); s.append(el('div', 'spacer'));
      ui.fx = S.fader(s, { get: () => st.fxRet, set: v => { st.fxRet = v; changed('m'); }, help: 'fxret', aria: 'FX Return' })[0];
      con.append(s);
    }
    {
      const s = strip('#e6e9ed', 'master');
      const nm = el('div', 'chname wide', 'Summe'); nm.dataset.help = 'main'; s.append(nm);
      s.append(el('div', 'src', 'Main L / R')); s.append(el('div', 'spacer'));
      const cr = el('div', 'cliprow'); cr.dataset.help = 'main'; const led = el('div', 'led'); cr.append(el('div', 'ledlab', 'CLIP'), led); s.append(cr);
      const cans = S.fader(s, { get: () => st.main, set: v => { st.main = v; changed('m'); }, help: 'main', meters: 2, aria: 'Summenfader' });
      ui.main = { clip: led, mL: cans[0], mR: cans[1] }; con.append(s);
    }
    if (scene.recorder) {
      const s = strip('#ff4f4f', 'master rec');
      const nm = el('div', 'chname wide', 'Recorder'); nm.dataset.help = 'rec'; s.append(nm);
      s.append(el('div', 'src', 'extern, Stereo'));
      const r = el('div', 'krow one'); s.append(r);
      S.knob(r, { label: 'TRIM', p: S.P.trim, get: () => st.rec.trim, set: v => { st.rec.trim = v; changed('m'); }, help: 'rec', aria: 'Recorder Trim' });
      S.toggle(s, { label: '● REC', cls: 'recb', get: () => st.rec.on, set: v => { st.rec.on = v; if (v) st.rec.t = 0; changed('m'); }, help: 'rec' });
      const time = el('div', 'rectime', '00:00'); s.append(time);
      s.append(el('div', 'spacer'));
      const cr = el('div', 'cliprow'); cr.dataset.help = 'rec'; const led = el('div', 'led'); cr.append(el('div', 'ledlab', 'CLIP'), led); s.append(cr);
      const wrap = el('div', 'fwrap'); const ms = el('div', 'meters'); ms.dataset.help = 'rec';
      const mL = el('canvas', 'meter'), mR = el('canvas', 'meter'); ms.append(mL, mR); wrap.append(ms); s.append(wrap, el('div', 'fread', 'IN L/R'));
      ui.rec = { clip: led, mL, mR, time }; con.append(s);
    }
    {
      const s = strip('#f0b03a', 'master listen');
      const nm = el('div', 'chname wide', 'Abhöre'); nm.dataset.help = 'listen'; s.append(nm);
      s.append(el('div', 'src', 'Regie / Kopfhörer'));
      const box = el('div', 'lsbox'); box.dataset.help = 'listen';
      ui.listenBtns = scene.listen.map(l => {
        const b = el('button', 'btn lsb', l.label); b.type = 'button'; b.dataset.help = 'listen';
        b.addEventListener('click', () => { st.listen = l.id; changed('listen'); });
        box.append(b); return [l.id, b];
      });
      s.append(box);
      const pf = el('div', 'pflind', 'PFL aktiv'); pf.dataset.help = 'pfl'; s.append(pf); ui.pflInd = pf;
      s.append(el('div', 'spacer'));
      const r = el('div', 'krow one'); s.append(r);
      S.knob(r, { label: 'VOL', p: S.P.vol, get: () => st.vol, set: v => { st.vol = v; changed('m'); }, help: 'vol', aria: 'Abhörlautstärke' });
      con.append(s);
    }
    S.updateConsoleLabels(scene, st);
  };

  S.updateConsoleLabels = function (scene, st) {
    const ui = S.ui; if (!ui.ch) return;
    st.ch.forEach((c, i) => {
      const d = S.describeInput(scene, st, c.input);
      const u = ui.ch[i]; u.nm.textContent = d.short; u.inp.textContent = d.text; u.strip.style.setProperty('--c', d.color);
    });
    const anyPfl = st.ch.some(c => c.pfl);
    ui.listenBtns.forEach(([id, b]) => { b.classList.toggle('on', st.listen === id); b.classList.toggle('dim', anyPfl); b.setAttribute('aria-pressed', st.listen === id); });
    ui.pflInd.classList.toggle('on', anyPfl);
  };
})(Sim);
