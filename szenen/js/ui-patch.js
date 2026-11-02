/* Patchfeld: Eingänge → Kanäle, Busse → Ausgänge */
(function (S) {
  "use strict";
  const { $ } = S;

  S.describeInput = (scene, st, inputId) => {
    if (!inputId) return { short: '—', text: 'kein Eingang', color: '#59616b' };
    const inp = scene.inputs.find(i => i.id === inputId);
    if (inp.fixed) { const s = scene.sources.find(x => x.kind === 'line' && x.inputs.includes(inputId)); return { short: s ? s.short + (s.inputs.length > 1 ? (s.inputs.indexOf(inputId) ? ' R' : ' L') : '') : inp.fixed, text: `${inp.label} · ${inp.fixed}`, color: s ? s.color : '#59616b' }; }
    const mc = scene.mics.find(m => st.mics[m.id].socket === inputId);
    if (!mc) return { short: '—', text: `${inp.label} · leer`, color: '#59616b' };
    const s = scene.sources.find(x => x.id === mc.for);
    return { short: s.short, text: `${inp.label} · ${mc.name}`, color: s.color };
  };

  S.renderPatch = function (scene, st, changed) {
    const host = $('#patch'); const lock = st.mode !== 'check';
    const busNames = { mainL: 'Summe L', mainR: 'Summe R', aux1: `Aux 1 (${scene.auxNames[0]})`, aux2: `Aux 2 (${scene.auxNames[1]})` };
    let h = `<div class="ptitle" data-help="patchIn"><h4>Eingänge → Kanäle</h4>${lock ? '<span class="lock">gesperrt in der Show</span>' : ''}</div>
      <div class="ptable-wrap"><table class="ptable" data-help="patchIn"><thead><tr><th></th>${st.ch.map((c, i) => `<th>K${i + 1}</th>`).join('')}</tr></thead><tbody>`;
    for (const inp of scene.inputs) {
      const d = S.describeInput(scene, st, inp.id);
      h += `<tr><th class="rowh"><span class="dot" style="background:${d.color}"></span>${d.text}</th>`;
      st.ch.forEach((c, i) => { const on = c.input === inp.id; h += `<td><button type="button" class="pcell${on ? ' on' : ''}" data-in="${inp.id}" data-ch="${i}" aria-label="${inp.label} auf Kanal ${i + 1}" aria-pressed="${on}"${lock ? ' disabled' : ''}></button></td>`; });
      h += '</tr>';
    }
    h += `</tbody></table></div><div class="ptitle" data-help="patchOut"><h4>Busse → Ausgänge</h4></div>
      <div class="ptable-wrap"><table class="ptable out" data-help="patchOut"><thead><tr><th></th>${Object.values(busNames).map(n => `<th>${n}</th>`).join('')}</tr></thead><tbody>`;
    for (const o of scene.outputs) {
      h += `<tr><th class="rowh">${o.name}</th>`;
      for (const b of Object.keys(busNames)) { const on = st.out[o.id] === b; h += `<td><button type="button" class="pcell${on ? ' on' : ''}" data-out="${o.id}" data-bus="${b}" aria-label="${busNames[b]} auf ${o.name}" aria-pressed="${on}"${lock ? ' disabled' : ''}></button></td>`; }
      h += '</tr>';
    }
    h += '</tbody></table></div>';
    host.innerHTML = h;
    host.querySelectorAll('.pcell').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.in) { const c = st.ch[+b.dataset.ch]; c.input = c.input === b.dataset.in ? null : b.dataset.in; }
      else { st.out[b.dataset.out] = st.out[b.dataset.out] === b.dataset.bus ? null : b.dataset.bus; }
      changed('patch');
    }));
  };
})(Sim);
