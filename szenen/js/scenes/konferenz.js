/* Szene a) Konferenz: drei Redner mit Schwanenhalsmikrofonen, Stereo-Einspieler vom Laptop.
   Koordinaten in Metern, Winkel in Grad (0° = nach rechts, 90° = nach unten, −90° = nach oben). */
Sim.registerScene({
  id: 'konferenz',
  name: 'Konferenz',
  checkOn: ['r1'],
  intro: 'Podiumsveranstaltung in einem Saal: Moderation am Rednerpult, zwei Gäste am Podiumstisch, ein Trailer vom Laptop. Ausgegeben wird auf die Saal-PA und einen Livestream.',
  room: {
    w: 12, h: 8, rt: 1.3, level: 0.25, label: 'Saal, ca. 12 × 8 m, Nachhallzeit ≈ 1,3 s',
    items: [
      { t: 'rect', x: 1.6, y: 1.65, w: 0.8, h: 0.45, label: 'Rednerpult' },
      { t: 'rect', x: 5.2, y: 1.5, w: 3.8, h: 0.55, label: 'Podiumstisch' },
      { t: 'zone', x: 1.5, y: 3.6, w: 9, h: 3.4, label: 'Publikum' },
      { t: 'rect', x: 5.0, y: 7.25, w: 2, h: 0.5, label: 'Regie' },
      { t: 'pa', x: 0.7, y: 3.0, a: 40 }, { t: 'pa', x: 11.3, y: 3.0, a: 140 },
    ],
  },
  sources: [
    { id: 'r1', name: 'Redner 1', short: 'R1', role: 'Moderation', kind: 'acoustic', x: 2.0, y: 1.35, level: 1, color: '#e3604c', sound: { gen: 'voice', f0: 112, seed: 3 } },
    { id: 'r2', name: 'Rednerin 2', short: 'R2', role: 'Gast', kind: 'acoustic', x: 6.2, y: 1.15, level: 1, color: '#4f9de0', sound: { gen: 'voice', f0: 205, seed: 17, female: true } },
    { id: 'r3', name: 'Redner 3', short: 'R3', role: 'Gast', kind: 'acoustic', x: 8.0, y: 1.15, level: 1, color: '#4fc49a', sound: { gen: 'voice', f0: 135, seed: 29, rate: 1.1 } },
    { id: 'clip', name: 'Einspieler', short: 'EIN', role: 'Laptop, Stereo', kind: 'line', inputs: ['l1', 'l2'], color: '#e6a23c', sound: { gen: 'jingle' } },
  ],
  mics: [
    { id: 'm1', name: 'Mic 1', for: 'r1', x: 2.0, y: 1.72, angle: -90, type: 'kond', pattern: 'superniere', socket: 'sb1' },
    { id: 'm2', name: 'Mic 2', for: 'r2', x: 6.2, y: 1.55, angle: 90, type: 'kond', pattern: 'superniere', socket: 'sb2' },
    { id: 'm3', name: 'Mic 3', for: 'r3', x: 8.0, y: 1.55, angle: -90, type: 'kond', pattern: 'superniere', socket: 'sb3' },
  ],
  inputs: [
    { id: 'sb1', label: 'SB 1' }, { id: 'sb2', label: 'SB 2' }, { id: 'sb3', label: 'SB 3' }, { id: 'sb4', label: 'SB 4' },
    { id: 'l1', label: 'Line 1', fixed: 'Laptop L' }, { id: 'l2', label: 'Line 2', fixed: 'Laptop R' },
  ],
  channels: [
    { input: 'sb1', gain: 26, phantom: true, fader: 0 },
    { input: 'sb2', gain: 14, phantom: true, fader: 0 },
    { input: 'sb3', gain: 26, phantom: false, fader: 0 },
    {}, {}, {},
    { input: 'l1', gain: 0, fader: -10 },
    { input: 'l1', gain: 0, fader: -10 },
  ],
  auxNames: ['Monitor', 'Aux 2'],
  outputs: [
    { id: 'paL', name: 'PA links' }, { id: 'paR', name: 'PA rechts' },
    { id: 'strL', name: 'Stream L' }, { id: 'strR', name: 'Stream R' },
    { id: 'mon', name: 'Bühnenmonitor' },
  ],
  outDefault: { paL: 'mainL', paR: 'mainR', strL: null, strR: null, mon: 'aux1' },
  listen: [
    { id: 'pa', label: 'Saal (PA)', L: 'paL', R: 'paR' },
    { id: 'stream', label: 'Stream', L: 'strL', R: 'strR' },
    { id: 'mon', label: 'Bühnenmonitor', mono: 'mon' },
  ],
  masters: { main: 0, auxM: [0, 0], vol: -12 },
  show: {
    len: 48,
    cues: [
      { t: 0, text: 'Redner 1 begrüßt das Publikum' },
      { t: 12, text: 'Trailer vom Laptop (Einspieler)' },
      { t: 24, text: 'Rednerin 2 hält ihren Impuls' },
      { t: 36, text: 'Redner 3 antwortet' },
      { t: 44, text: 'Redner 1 moderiert ab' },
    ],
    activity: { r1: [[0, 12], [44, 48]], clip: [[12, 24]], r2: [[24, 36]], r3: [[36, 44]] },
    rules(api) {
      const issues = [];
      for (const id of ['r1', 'r2', 'r3']) {
        const name = api.src(id).name, chs = api.chansForSource(id);
        if (api.mustOpen(id)) {
          if (!chs.some(i => api.open(i))) issues.push(`${name} spricht, aber kein Kanal mit dem Mikrofon ist offen.`);
          else if (!api.powered(api.micFor(id))) issues.push(`${name} spricht, aber das Mikrofon hat keine Phantomspeisung.`);
        } else if (api.mustClose(id) && chs.some(i => api.open(i))) {
          issues.push(`Mikrofon von ${name} ist offen, obwohl ${name.startsWith('Rednerin') ? 'sie' : 'er'} nicht spricht.`);
        }
      }
      const clipCh = api.chansForInputs(['l1', 'l2']);
      if (api.mustOpen('clip') && !clipCh.some(i => api.open(i))) issues.push('Der Trailer läuft, aber die Einspieler-Kanäle sind zu.');
      if (api.mustClose('clip') && clipCh.some(i => api.open(i))) issues.push('Einspieler-Kanäle sind offen, obwohl nichts eingespielt wird.');
      if (api.st.out.paL !== 'mainL' || api.st.out.paR !== 'mainR') issues.push('Die PA bekommt nicht die Summe L/R.');
      if (api.mainClip()) issues.push('Die Summe übersteuert.');
      return issues;
    },
  },
  tasks: [
    { id: 'ph', t: 'Redner 3 ist stumm', d: 'Mic 3 ist ein Kondensatormikrofon und braucht <b>Phantomspeisung</b>. Schalte 48 V an dem Kanal ein, auf den SB 3 gepatcht ist. Tipp: Fader vorher zuziehen, beim Einschalten knallt es.',
      ok: api => api.powered('m3') && api.chansForInputs([api.st.mics.m3.socket]).length > 0 },
    { id: 'rot', t: 'Mic 2 ausrichten', d: 'Mic 2 zeigt von Rednerin 2 weg. Wähle es im Raumplan aus und drehe es am runden Griff, bis sie im Hauptempfangsbereich liegt (höchstens 30° daneben).',
      ok: api => api.angleErr('m2', 'r2') <= 30 },
    { id: 'clip', t: 'Einspieler in Stereo', d: 'Laptop L und R liegen auf Line 1 und Line 2. Beide Kanäle 7 und 8 sind aber auf Line 1 gepatcht. Patche Kanal 8 auf Line 2 und panne Kanal 7 ganz links, Kanal 8 ganz rechts.',
      ok: api => api.chansForInputs(['l1']).some(i => api.st.ch[i].pan <= -0.8) && api.chansForInputs(['l2']).some(i => api.st.ch[i].pan >= 0.8) },
    { id: 'lvl', t: 'Redner einpegeln', d: 'Lass jeden Redner einzeln sprechen (Knöpfe unter dem Raumplan), drücke <b>PFL</b> am Kanal und stelle das <b>Gain</b> so ein, dass die Spitzen auf der Abhöranzeige zwischen −18 und −6 dBFS liegen.',
      ok: api => ['r1', 'r2', 'r3'].every(id => api.levelOk(id)) },
    { id: 'hpf', t: 'Low Cut für Sprache', d: 'Schalte an allen drei Rednerkanälen den <b>HPF</b> ein, etwa zwischen 80 und 150 Hz. Das nimmt Trittschall und Rumpeln heraus.',
      ok: api => ['r1', 'r2', 'r3'].every(id => api.chansForSource(id).some(i => api.st.ch[i].hpfOn && api.st.ch[i].hpf >= 70 && api.st.ch[i].hpf <= 160)) },
    { id: 'str', t: 'Stream versorgen', d: 'Der Livestream bekommt nichts. Lege im Ausgangs-Patch Summe L auf Stream L und Summe R auf Stream R. Kontrolle: Abhöre auf „Stream“.',
      ok: api => api.st.out.strL === 'mainL' && api.st.out.strR === 'mainR' },
  ],
});
