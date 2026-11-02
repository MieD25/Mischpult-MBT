/* Bedienelemente: Drehregler, Taster, Fader, Pegelanzeige */
(function (S) {
  "use strict";
  const { el, clamp, fmtDb } = S;
  S.refreshers = [];

  const lin = (a, b) => ({ toVal: t => a + t * (b - a), toT: v => (v - a) / (b - a) });
  const lg = (a, b) => ({ toVal: t => a * Math.pow(b / a, t), toT: v => Math.log(v / a) / Math.log(b / a) });
  const sendMap = { toVal: t => t < 0.02 ? -Infinity : -60 + (t - 0.02) / 0.98 * 66, toT: v => v === -Infinity ? 0 : 0.02 + (v + 60) / 66 * 0.98 };
  S.P = {
    gain:  { ...lin(-10, 60), origin: 0.143, dflt: 0, snap: v => Math.round(v * 2) / 2, fmt: v => fmtDb(v) + ' dB' },
    hpf:   { ...lg(20, 400), origin: 0, dflt: 80, snap: v => Math.round(v), fmt: v => Math.round(v) + ' Hz' },
    eqg:   { ...lin(-15, 15), origin: 0.5, dflt: 0, snap: v => Math.round(v * 2) / 2, fmt: v => fmtDb(v) },
    midF:  { ...lg(200, 8000), origin: 0, dflt: 1000, snap: v => v < 1000 ? Math.round(v / 5) * 5 : Math.round(v / 50) * 50, fmt: v => S.fmtHz(v) + 'Hz' },
    send:  { ...sendMap, origin: 0, dflt: -Infinity, snap: v => v === -Infinity ? v : Math.round(v * 2) / 2, fmt: v => fmtDb(v) },
    pan:   { ...lin(-1, 1), origin: 0.5, dflt: 0, snap: v => Math.abs(v) < 0.03 ? 0 : Math.round(v * 100) / 100, fmt: S.fmtPan },
    trim:  { ...lin(-20, 20), origin: 0.5, dflt: 0, snap: v => Math.round(v * 2) / 2, fmt: v => fmtDb(v) + ' dB' },
    vol:   { ...lin(-60, 0), origin: 0, dflt: -12, snap: v => Math.round(v), fmt: v => fmtDb(v, 0) + ' dB' },
  };

  function arc(a0, a1, r) {
    if (Math.abs(a1 - a0) < 0.5) return '';
    const pt = a => [20 + r * Math.sin(a * Math.PI / 180), 20 - r * Math.cos(a * Math.PI / 180)];
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  S.knob = function (parent, { label, p, get, set, help, aria }) {
    const w = el('div', 'knob'); w.dataset.help = help; w.tabIndex = 0; w.setAttribute('role', 'slider'); w.setAttribute('aria-label', aria || label);
    w.innerHTML = `<div class="klabel">${label}</div><svg class="ksvg" viewBox="0 0 40 40" aria-hidden="true"><path class="ktrack" d="${arc(-135, 135, 17)}"/><path class="kval"/><circle class="kcap" cx="20" cy="20" r="12.5"/><line class="kptr" x1="20" y1="20" x2="20" y2="10"/></svg><div class="kread"></div>`;
    const val = w.querySelector('.kval'), ptr = w.querySelector('.kptr'), rd = w.querySelector('.kread');
    const upd = () => {
      const v = get(); const t = clamp(p.toT(v), 0, 1); const a = -135 + 270 * t, o = -135 + 270 * p.origin;
      val.setAttribute('d', arc(Math.min(a, o), Math.max(a, o), 17)); ptr.setAttribute('transform', `rotate(${a.toFixed(1)} 20 20)`);
      rd.textContent = p.fmt(v); w.setAttribute('aria-valuetext', p.fmt(v));
    };
    const setT = t => { set(p.snap(p.toVal(clamp(t, 0, 1)))); upd(); };
    let sy = 0, st = 0, drag = false;
    w.addEventListener('pointerdown', e => { drag = true; sy = e.clientY; st = clamp(p.toT(get()), 0, 1); w.setPointerCapture(e.pointerId); w.focus(); e.preventDefault(); });
    w.addEventListener('pointermove', e => { if (drag) setT(st + (sy - e.clientY) / (e.shiftKey ? 900 : 170)); });
    const end = () => { drag = false; }; w.addEventListener('pointerup', end); w.addEventListener('pointercancel', end);
    w.addEventListener('dblclick', () => { set(p.dflt); upd(); });
    w.addEventListener('keydown', e => {
      const t = clamp(p.toT(get()), 0, 1), s = e.shiftKey ? 0.005 : 0.025;
      if (['ArrowUp', 'ArrowRight'].includes(e.key)) setT(t + s); else if (['ArrowDown', 'ArrowLeft'].includes(e.key)) setT(t - s);
      else if (e.key === 'Home') setT(0); else if (e.key === 'End') setT(1); else return; e.preventDefault();
    });
    S.refreshers.push(upd); upd(); parent.append(w); return w;
  };

  S.toggle = function (parent, { label, cls, get, set, help, labelFn, title }) {
    const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.dataset.help = help; if (title) b.title = title;
    const upd = () => { const on = get(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); if (labelFn) b.textContent = labelFn(on); };
    b.addEventListener('click', () => { set(!get()); upd(); });
    S.refreshers.push(upd); upd(); parent.append(b); return b;
  };

  /* Fader-Kennlinie: Position (0..1) <-> dB */
  const FP = [[0.04, -60], [0.15, -40], [0.28, -30], [0.42, -20], [0.58, -10], [0.75, 0], [0.87, 5], [1, 10]];
  function posToDb(p) {
    if (p <= 0.004) return -Infinity;
    if (p < 0.04) return -60 - (0.04 - p) / 0.04 * 40;
    for (let i = 1; i < FP.length; i++) if (p <= FP[i][0]) { const [p0, d0] = FP[i - 1], [p1, d1] = FP[i]; return d0 + (p - p0) / (p1 - p0) * (d1 - d0); }
    return 10;
  }
  function dbToPos(d) {
    if (d === -Infinity) return 0;
    if (d < -60) return clamp(0.04 - (-60 - d) / 40 * 0.04, 0.005, 0.04);
    for (let i = 1; i < FP.length; i++) if (d <= FP[i][1]) { const [p0, d0] = FP[i - 1], [p1, d1] = FP[i]; return p0 + (d - d0) / (d1 - d0) * (p1 - p0); }
    return 1;
  }
  const FH = 180, TH = 32; S.FH = FH;
  S.fader = function (parent, { get, set, help, meters = 1, aria }) {
    const wrap = el('div', 'fwrap');
    const sc = el('div', 'fscale'); sc.setAttribute('aria-hidden', 'true');
    for (const [d, l] of [[10, '+10'], [0, '0'], [-10, '−10'], [-20, '−20'], [-30, '−30'], [-40, '−40'], [-60, '−60'], [-Infinity, '∞']]) {
      const s = el('span', null, l); s.style.top = ((1 - dbToPos(d)) * (FH - TH) + TH / 2) + 'px'; if (d === 0) s.className = 'zero'; sc.append(s);
    }
    const f = el('div', 'fader'); f.dataset.help = help; f.tabIndex = 0; f.setAttribute('role', 'slider'); f.setAttribute('aria-label', aria);
    const th = el('div', 'thumb'); f.append(th);
    const ms = el('div', 'meters'); ms.dataset.help = 'meter';
    const cans = []; for (let i = 0; i < meters; i++) { const c = el('canvas', 'meter'); ms.append(c); cans.push(c); }
    wrap.append(sc, f, ms, S.meterScale());
    const rd = el('div', 'fread'); rd.dataset.help = help;
    const upd = () => { const d = get(); th.style.top = ((1 - dbToPos(d)) * (FH - TH)) + 'px'; rd.textContent = fmtDb(d) + ' dB'; f.setAttribute('aria-valuetext', fmtDb(d) + ' dB'); };
    const setP = p => { let d = posToDb(clamp(p, 0, 1)); if (d !== -Infinity) d = Math.round(d * 2) / 2; if (Math.abs(d) < 0.6) d = 0; set(d); upd(); };
    let drag = false, sy = 0, sp = 0;
    f.addEventListener('pointerdown', e => {
      drag = true; f.setPointerCapture(e.pointerId); f.focus(); e.preventDefault();
      if (e.target !== th) { const r = f.getBoundingClientRect(); setP(1 - (e.clientY - r.top - TH / 2) / (FH - TH)); }
      sy = e.clientY; sp = dbToPos(get());
    });
    f.addEventListener('pointermove', e => { if (drag) setP(sp + (sy - e.clientY) / (FH - TH) / (e.shiftKey ? 5 : 1)); });
    const end = () => { drag = false; }; f.addEventListener('pointerup', end); f.addEventListener('pointercancel', end);
    f.addEventListener('dblclick', () => { set(0); upd(); });
    f.addEventListener('keydown', e => {
      const p = dbToPos(get()), s = e.shiftKey ? 0.004 : 0.02;
      if (['ArrowUp', 'ArrowRight'].includes(e.key)) setP(p + s); else if (['ArrowDown', 'ArrowLeft'].includes(e.key)) setP(p - s);
      else if (e.key === 'Home') setP(0); else if (e.key === 'End') setP(1); else return; e.preventDefault();
    });
    S.refreshers.push(upd); upd(); parent.append(wrap, rd);
    return cans;
  };

  /* dBFS-Skala für Pegelanzeigen (gleiche Abbildung wie drawMeter: −60 … +6 dBFS) */
  S.meterScale = (target) => {
    const sc = el('div', 'mscale' + (target ? ' target' : '')); sc.dataset.help = 'meter'; sc.setAttribute('aria-hidden', 'true');
    for (const [d, l] of [[0, '0'], [-6, '−6'], [-12, '−12'], [-18, '−18'], [-30, '−30'], [-60, '−60']]) {
      const s = el('span', d === -6 || d === -18 ? 'tg' : null, l); s.style.top = (FH * (1 - (d + 60) / 66)) + 'px'; sc.append(s);
    }
    const u = el('span', 'unit', 'dBFS'); u.style.top = (FH + 9) + 'px'; sc.append(u);
    return sc;
  };
  /* Pegelanzeige: Zustand mit Rücklauf und Peak-Hold */
  const MS = {};
  S.resetMeters = () => { for (const k in MS) delete MS[k]; };
  S.stepMeter = (k, db, dt, now) => {
    const m = MS[k] || (MS[k] = { v: -Infinity, hold: -Infinity, ht: 0 });
    m.v = Math.max(db, m.v - 22 * dt); if (db >= m.hold || now > m.ht) { m.hold = db; m.ht = now + 1500; } return m;
  };
  S.drawMeter = (cv, m, target) => {
    const d = window.devicePixelRatio || 1; if (cv.width !== 8 * d) { cv.width = 8 * d; cv.height = FH * d; }
    const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); const W = 8, H = FH;
    const y = db => H * (1 - (clamp(db, -60, 6) + 60) / 66);
    c.fillStyle = '#0b0c0e'; c.fillRect(0, 0, W, H);
    for (const [a, b, col] of [[-60, -12, '#45d16a'], [-12, -3, '#f2c94c'], [-3, 6, '#ff4f4f']]) {
      c.globalAlpha = 0.13; c.fillStyle = col; c.fillRect(0, y(b), W, y(a) - y(b));
      if (m.v > a) { c.globalAlpha = 1; const top = Math.min(m.v, b); c.fillRect(0, y(top), W, y(a) - y(top)); }
    }
    c.globalAlpha = 1; c.fillStyle = '#0b0c0e'; for (let yy = 0; yy < H; yy += 3) c.fillRect(0, yy, W, 1);
    c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(0, Math.round(y(0)), W, 1);
    if (target) { c.fillStyle = 'rgba(240,176,58,.9)'; c.fillRect(0, Math.round(y(-6)), 2, Math.round(y(-18) - y(-6))); }
    if (m.hold > -60) { c.fillStyle = '#fff'; c.fillRect(0, Math.round(y(m.hold)), W, 2); }
  };
  const tbuf = new Float32Array(1024);
  S.peakOf = a => { a.getFloatTimeDomainData(tbuf); let m = 0; for (let i = 0; i < tbuf.length; i++) { const v = Math.abs(tbuf[i]); if (v > m) m = v; } return m; };
})(Sim);
