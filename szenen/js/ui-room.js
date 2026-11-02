/* Raumplan (Draufsicht): Quellen, Mikrofone mit Richtcharakteristik, Verschieben und Drehen im Soundcheck */
(function (S) {
  "use strict";
  const { el, $, clamp, fmtM } = S;
  const NS = 'http://www.w3.org/2000/svg';
  let svg, dyn, scene, st, changed, drag = null;

  function patternPaths(pat, R) {
    const a = S.PATTERNS[pat].a; let f = '', b = '';
    for (let deg = 0; deg <= 360; deg += 4) {
      const t = deg * Math.PI / 180, v = a + (1 - a) * Math.cos(t);
      const rf = Math.max(v, 0) * R, rb = Math.max(-v, 0) * R;
      f += (deg ? 'L' : 'M') + (rf * Math.cos(t)).toFixed(3) + ' ' + (rf * Math.sin(t)).toFixed(3);
      b += (deg ? 'L' : 'M') + (rb * Math.cos(t)).toFixed(3) + ' ' + (rb * Math.sin(t)).toFixed(3);
    }
    return [f + 'Z', a < 0.5 ? b + 'Z' : ''];
  }
  S.micGeom = (st, micId, srcId) => {
    const m = st.mics[micId], s = st.srcPos[srcId];
    const dx = s.x - m.x, dy = s.y - m.y, dist = Math.hypot(dx, dy);
    let err = Math.abs(((Math.atan2(dy, dx) * 180 / Math.PI - m.angle) % 360 + 540) % 360 - 180);
    return { dist, err };
  };

  S.buildRoom = function (sc, state, ch) {
    scene = sc; st = state; changed = ch;
    const host = $('#room'); host.innerHTML = '';
    const R = sc.room, pad = 0.35;
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${R.w + 2 * pad} ${R.h + 2 * pad}`); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Raumplan ' + R.label); svg.classList.add('roomsvg'); svg.style.setProperty('--rs', Math.max(0.6, Math.min(1, R.w / 12))); svg.dataset.help = 'room';
    let h = `<rect class="floor" x="0" y="0" width="${R.w}" height="${R.h}"/>`;
    for (let x = 1; x < R.w; x++) h += `<line class="grid" x1="${x}" y1="0" x2="${x}" y2="${R.h}"/>`;
    for (let y = 1; y < R.h; y++) h += `<line class="grid" x1="0" y1="${y}" x2="${R.w}" y2="${y}"/>`;
    for (const it of R.items) {
      if (it.t === 'rect' || it.t === 'zone') h += `<rect class="${it.t === 'zone' ? 'zone' : 'furn'}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="0.05"/><text class="ilabel" x="${it.x + it.w / 2}" y="${it.t === 'zone' ? it.y + it.h - 0.15 : it.y + it.h / 2 + 0.08}">${it.label}</text>`;
      if (it.t === 'pa') h += `<g transform="translate(${it.x} ${it.y}) rotate(${it.a})"><rect class="pa" x="-0.2" y="-0.32" width="0.4" height="0.64" rx="0.04"/><path class="pacone" d="M0.2 -0.2 L0.45 -0.32 L0.45 0.32 L0.2 0.2Z"/></g><text class="ilabel" x="${it.x}" y="${it.y + 0.6}">PA</text>`;
    }
    h += `<text class="ilabel scale" x="${R.w - 0.5}" y="${R.h + 0.25}">1 Kästchen = 1 m</text>`;
    svg.innerHTML = h;
    dyn = document.createElementNS(NS, 'g'); svg.append(dyn);
    host.append(svg);
    svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', () => { drag = null; }); svg.addEventListener('pointercancel', () => { drag = null; });
    buildChips(); S.renderRoom();
  };

  function pt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function onDown(e) {
    const t = e.target.closest('[data-mic],[data-handle],[data-src]'); if (!t) return;
    if (t.dataset.src) { if (st.mode === 'check') { st.srcOn[t.dataset.src] = !st.srcOn[t.dataset.src]; changed('src'); } return; }
    const id = t.dataset.mic || t.dataset.handle; st.selMic = id;
    if (st.mode !== 'check') { S.renderRoom(); return; }
    const p = pt(e), m = st.mics[id];
    drag = t.dataset.handle ? { id, rot: true } : { id, dx: m.x - p.x, dy: m.y - p.y };
    svg.setPointerCapture(e.pointerId); e.preventDefault(); S.renderRoom();
  }
  function onMove(e) {
    if (!drag) return; const p = pt(e), m = st.mics[drag.id];
    if (drag.rot) { m.angle = Math.round(Math.atan2(p.y - m.y, p.x - m.x) * 180 / Math.PI); }
    else { m.x = Math.round(clamp(p.x + drag.dx, 0.1, scene.room.w - 0.1) * 100) / 100; m.y = Math.round(clamp(p.y + drag.dy, 0.1, scene.room.h - 0.1) * 100) / 100; }
    changed('mic');
  }

  S.renderRoom = function () {
    if (!dyn) return;
    let h = '';
    const sel = st.selMic;
    if (sel) {
      const m = st.mics[sel];
      for (const s of scene.sources) if (s.kind === 'acoustic') {
        const p = st.srcPos[s.id], d = Math.hypot(p.x - m.x, p.y - m.y);
        h += `<line class="dline" x1="${m.x}" y1="${m.y}" x2="${p.x}" y2="${p.y}"/><text class="dlabel" x="${(m.x + p.x) / 2}" y="${(m.y + p.y) / 2 - 0.06}">${fmtM(d)}</text>`;
      }
    }
    for (const mc of scene.mics) {
      const m = st.mics[mc.id], [fp, bp] = patternPaths(m.pattern, Math.max(0.6, Math.min(1, scene.room.w / 12))), on = mc.id === sel;
      const pw = S.Engine.g ? S.Engine.micPowered(st, mc) : true;
      h += `<g class="mic${on ? ' sel' : ''}${pw ? '' : ' nopower'}" transform="translate(${m.x} ${m.y})">`;
      h += `<g transform="rotate(${m.angle})"><path class="pfront" d="${fp}"/>${bp ? `<path class="pback" d="${bp}"/>` : ''}`;
      h += `<g data-mic="${mc.id}" class="mbody"><rect x="-0.2" y="-0.05" width="0.22" height="0.1" rx="0.02"/><circle cx="0.05" cy="0" r="0.065"/><rect class="hit" x="-0.25" y="-0.15" width="0.4" height="0.3" fill="transparent"/></g>`;
      if (on && st.mode === 'check') h += `<line class="hline" x1="0.12" y1="0" x2="0.52" y2="0"/><circle data-handle="${mc.id}" class="handle" cx="0.6" cy="0" r="0.1"/>`;
      h += `</g>${on || !pw ? `<text class="mlabel" x="0" y="-0.17">${on ? mc.name : ''}${pw ? '' : ' 48V?'}</text>` : ''}</g>`;
    }
    for (const s of scene.sources) if (s.kind === 'acoustic') {
      const p = st.srcPos[s.id];
      h += `<g data-src="${s.id}" class="srcg" style="--sc:${s.color}"><circle class="ring" cx="${p.x}" cy="${p.y}" r="0.34"/><circle class="sdot" cx="${p.x}" cy="${p.y}" r="0.22"/><text class="sshort" x="${p.x}" y="${p.y + 0.07}">${s.short}</text><text class="srclabel" x="${p.x}" y="${p.y - 0.42}">${s.name}</text></g>`;
    }
    dyn.innerHTML = h;
    renderMicPanel();
  };

  S.updateRoomActivity = active => {
    if (!dyn) return;
    dyn.querySelectorAll('[data-src]').forEach(g => g.classList.toggle('on', !!active[g.dataset.src]));
    S.$$('#chips .chip').forEach(b => b.classList.toggle('on', !!active[b.dataset.id]));
  };

  function buildChips() {
    const c = $('#chips'); c.innerHTML = '';
    c.append(el('span', 'chiplab', 'Anspielen:'));
    for (const s of scene.sources) {
      const b = el('button', 'chip', `<i style="background:${s.color}"></i>${s.name}<small>${s.role}</small>`); b.type = 'button'; b.dataset.id = s.id; b.dataset.help = 'source';
      b.addEventListener('click', () => { if (st.mode !== 'check') return; st.srcOn[s.id] = !st.srcOn[s.id]; changed('src'); });
      c.append(b);
    }
    const all = el('button', 'chip all', 'Alle'); all.type = 'button'; all.dataset.help = 'source';
    all.addEventListener('click', () => { if (st.mode !== 'check') return; const v = !scene.sources.every(s => st.srcOn[s.id]); scene.sources.forEach(s => st.srcOn[s.id] = v); changed('src'); });
    c.append(all);
  }

  const dbTxt = d => d === -Infinity || d < -40 ? '< −40' : S.fmtDb(d, 1);
  function pickupTable(mc, m, target) {
    const lv = id => { const s = scene.sources.find(x => x.id === id), g = S.micGeom(st, mc.id, id), pg = Math.abs(S.patternGain(m.pattern, g.err * Math.PI / 180));
      return { s, g, pat: S.ampToDb(pg), tot: S.ampToDb((s.level || 1) * pg * 0.3 / Math.max(0.03, g.dist)) }; };
    const ref = lv(target.id).tot, Q = S.PATTERNS[m.pattern].Q;
    const rows = scene.sources.filter(s => s.kind === 'acoustic').map(s => { const v = lv(s.id);
      return `<tr${s.id === target.id ? ' class="tgt"' : ''}><td><span class="dot" style="background:${s.color}"></span>${s.name}</td><td>${S.fmtM(v.g.dist)}</td><td>${Math.round(v.g.err)}°</td><td>${dbTxt(v.pat)} dB</td><td>${s.id === target.id ? 'Bezug' : dbTxt(v.tot - ref) + ' dB'}</td></tr>`; }).join('');
    return `<table class="pickup" data-help="pickup"><thead><tr><th>Quelle</th><th>Abstand</th><th>Winkel</th><th>Richtwirkung</th><th>Direktschall ggü. ${target.short}</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="pnote" data-help="pickup">Raumanteil (Diffusschall) gegenüber einer Kugel: ${S.fmtDb(-10 * Math.log10(Q))} dB</p>`;
  }
  function renderMicPanel() {
    const p = $('#micpanel'); const id = st.selMic;
    if (!id) { p.innerHTML = '<p class="muted">Wähle im Raumplan ein Mikrofon aus, um Typ, Richtcharakteristik und Kabel einzustellen.</p>'; return; }
    const mc = scene.mics.find(m => m.id === id), m = st.mics[id], target = scene.sources.find(s => s.id === mc.for);
    const geo = S.micGeom(st, id, mc.for), type = S.MICTYPES[m.type], pat = S.PATTERNS[m.pattern];
    const pw = S.Engine.g ? S.Engine.micPowered(st, mc) : null;
    const prox = (1 - pat.a) * 16 * clamp((0.25 - geo.dist) / 0.22, 0, 1);
    const dis = st.mode !== 'check' ? ' disabled' : '';
    const opt = (o, v) => Object.entries(o).map(([k, x]) => `<option value="${k}"${k === v ? ' selected' : ''}>${x.name}</option>`).join('');
    const socks = scene.inputs.filter(i => i.id.startsWith('sb')).map(i => `<option value="${i.id}"${i.id === m.socket ? ' selected' : ''}>${i.label}</option>`).join('');
    const ph = !type.phantom ? '<span class="ok">nicht nötig</span>' : pw ? '<span class="ok">48 V liegt an</span>' : '<span class="bad">fehlt – Mikrofon stumm</span>';
    p.innerHTML = `<div class="mphead"><b>${mc.name}</b> für ${target.name}</div>
      <div class="mpgrid">
        <label data-help="mictype">Wandler<select id="mpType"${dis}>${opt(S.MICTYPES, m.type)}</select></label>
        <label data-help="pattern">Richtcharakteristik<select id="mpPat"${dis}>${opt(S.PATTERNS, m.pattern)}</select></label>
        <label data-help="socket">Kabel an<select id="mpSock"${dis}><option value="">nicht verbunden</option>${socks}</select></label>
      </div>
      <div class="mpinfo"><span data-help="mic">Abstand zu ${target.name}: <b>${fmtM(geo.dist)}</b>, ${Math.round(geo.err)}° neben der Achse</span>
      <span data-help="phantom">Phantomspeisung: ${ph}</span>${prox > 1 ? `<span data-help="proximity">Nahbesprechung: ca. +${Math.round(prox)} dB Bass</span>` : ''}</div>
      ${pickupTable(mc, m, target)}`;
    if (!dis) {
      $('#mpType').addEventListener('change', e => { m.type = e.target.value; changed('mic'); });
      $('#mpPat').addEventListener('change', e => { m.pattern = e.target.value; changed('mic'); });
      $('#mpSock').addEventListener('change', e => { m.socket = e.target.value || null; changed('patch'); });
    }
  }
})(Sim);
