/* Szene c) Aufnahme: zwei Sprecher in der Kabine, Atmo-Zuspielung, Recorder mit Hinterbandkontrolle. */
Sim.registerScene({
  id: 'aufnahme',
  name: 'Aufnahme',
  checkOn: ['sa'],
  intro: 'Dialogaufnahme in der Sprecherkabine: zwei Großmembran-Mikrofone, eine Stereo-Atmo als Zuspielung, Kopfhörer für die Sprecher. Aufgenommen wird auf einen Stereo-Recorder, kontrolliert wird über Hinterband.',
  room: {
    w: 6, h: 4.5, rt: 0.35, level: 0.12, label: 'Sprecherkabine, ca. 6 × 4,5 m, Nachhallzeit ≈ 0,35 s',
    items: [
      { t: 'rect', x: 1.9, y: 1.7, w: 2.2, h: 0.9, label: 'Tisch' },
      { t: 'zone', x: 0.3, y: 3.6, w: 5.4, h: 0.6, label: 'Fenster zur Regie' },
    ],
  },
  sources: [
    { id: 'sa', name: 'Sprecherin A', short: 'A', role: 'Moderation', kind: 'acoustic', x: 1.5, y: 2.15, level: 1, color: '#e3604c', sound: { gen: 'voice', f0: 195, seed: 11, female: true } },
    { id: 'sb', name: 'Sprecher B', short: 'B', role: 'Gast', kind: 'acoustic', x: 4.5, y: 2.15, level: 1, color: '#4f9de0', sound: { gen: 'voice', f0: 108, seed: 23 } },
    { id: 'atmo', name: 'Atmo', short: 'ATM', role: 'Zuspielung, Stereo', kind: 'line', inputs: ['l1', 'l2'], color: '#4fc49a', sound: { gen: 'atmo' } },
  ],
  mics: [
    { id: 'ma', name: 'Mic A', for: 'sa', x: 2.3, y: 2.15, angle: 180, type: 'kond', pattern: 'niere', socket: 'sb1' },
    { id: 'mb', name: 'Mic B', for: 'sb', x: 3.9, y: 2.15, angle: 0, type: 'kond', pattern: 'niere', socket: 'sb3' },
  ],
  inputs: [
    { id: 'sb1', label: 'SB 1' }, { id: 'sb2', label: 'SB 2' }, { id: 'sb3', label: 'SB 3' }, { id: 'sb4', label: 'SB 4' },
    { id: 'l1', label: 'Line 1', fixed: 'Atmo L' }, { id: 'l2', label: 'Line 2', fixed: 'Atmo R' },
  ],
  channels: [
    { input: 'sb1', gain: 30, phantom: true, fader: 0 },
    { input: 'sb2', gain: 30, phantom: false, fader: 0 },
    {}, {}, {}, {},
    { input: 'l1', gain: -4, fader: -14 },
    { input: 'l2', gain: -4, fader: -14 },
  ],
  auxNames: ['Kopfhörer', 'Aux 2'],
  outputs: [
    { id: 'recL', name: 'Recorder In L' }, { id: 'recR', name: 'Recorder In R' },
    { id: 'kh', name: 'Kopfhörer Sprecher' },
  ],
  outDefault: { recL: 'aux2', recR: 'aux2', kh: 'aux1' },
  recorder: true,
  listen: [
    { id: 'vor', label: 'Vorband (Rec-Eingang)', L: 'recL', R: 'recR' },
    { id: 'hb', label: 'Hinterband', hb: true },
    { id: 'kh', label: 'Kopfhörer Sprecher', mono: 'kh' },
  ],
  masters: { main: 0, auxM: [0, 0], vol: -12, recTrim: 0 },
  show: {
    len: 40,
    cues: [
      { t: 0, text: 'Sprecherin A: Anmoderation' },
      { t: 8, text: 'Sprecher B antwortet' },
      { t: 16, text: 'Sprecherin A fragt nach' },
      { t: 22, text: 'Sprecher B erzählt' },
      { t: 30, text: 'Sprecherin A' },
      { t: 36, text: 'Sprecher B: Schlusswort' },
    ],
    activity: { sa: [[0, 8], [16, 22], [30, 36]], sb: [[8, 16], [22, 30], [36, 40]], atmo: [[0, 1e9]] },
    rules(api) {
      const issues = [];
      if (!api.st.rec.on) issues.push('Der Recorder nimmt nicht auf (REC).');
      if (api.st.out.recL !== 'mainL' || api.st.out.recR !== 'mainR') issues.push('Der Recorder bekommt nicht die Summe L/R.');
      if (api.recClip()) issues.push('Der Recorder-Eingang übersteuert.');
      else if (api.recLow()) issues.push('Aufnahmepegel zu niedrig (Spitzen unter −30 dBFS).');
      for (const id of ['sa', 'sb']) {
        const name = api.src(id).name;
        if (api.mustOpen(id)) {
          if (!api.chansForSource(id).some(i => api.open(i))) issues.push(`${name} spricht, aber kein Kanal mit dem Mikrofon ist offen.`);
          else if (!api.powered(api.micFor(id))) issues.push(`${name} spricht, aber das Mikrofon hat keine Phantomspeisung.`);
        }
      }
      if (!api.chansForInputs(['l1', 'l2']).some(i => api.open(i))) issues.push('Die Atmo fehlt in der Aufnahme.');
      return issues;
    },
  },
  tasks: [
    { id: 'patch', t: 'Mic B ist nicht im Pult', d: 'Das Kabel von Mic B steckt in SB 3, Kanal 2 ist aber auf SB 2 gepatcht. Korrigiere den Eingangs-Patch oder steck das Kabel um (Mikrofon im Raumplan auswählen).',
      ok: api => api.chansForInputs([api.st.mics.mb.socket]).length > 0 },
    { id: 'ph', t: 'Phantomspeisung', d: 'Beide Großmembran-Mikrofone sind Kondensatormikrofone. Sorge dafür, dass beide 48 V bekommen.',
      ok: api => api.powered('ma') && api.powered('mb') },
    { id: 'dist', t: 'Sprechabstand', d: 'Die Mikrofone stehen zu weit weg, der Raum klingt mit. Schiebe beide auf 15 bis 30 cm an ihre Sprecher heran und richte sie aus. Achte auf den Nahbesprechungseffekt: Je näher, desto mehr Bass.',
      ok: api => [['ma', 'sa'], ['mb', 'sb']].every(([m, s]) => api.dist(m, s) >= 0.12 && api.dist(m, s) <= 0.35 && api.angleErr(m, s) <= 30) },
    { id: 'atmo', t: 'Atmo in Stereo', d: 'Die Atmo liegt auf den Kanälen 7 und 8, beide stehen aber in der Mitte. Panne Kanal 7 ganz links und Kanal 8 ganz rechts.',
      ok: api => api.chansForInputs(['l1']).some(i => api.st.ch[i].pan <= -0.8) && api.chansForInputs(['l2']).some(i => api.st.ch[i].pan >= 0.8) },
    { id: 'rec', t: 'Recorder versorgen', d: 'Der Recorder hängt an Aux 2. Lege im Ausgangs-Patch Summe L auf Recorder In L und Summe R auf Recorder In R.',
      ok: api => api.st.out.recL === 'mainL' && api.st.out.recR === 'mainR' },
    { id: 'kh', t: 'Kopfhörer für die Sprecher', d: 'Die Sprecher hören sich nicht. Dreh an beiden Mikrofonkanälen den Aux-1-Send (PRE) auf. Kontrolle: Abhöre auf „Kopfhörer Sprecher“.',
      ok: api => api.st.out.kh === 'aux1' && ['sa', 'sb'].every(id => api.chansForSource(id).some(i => api.st.ch[i].aux[0] > -30)) },
    { id: 'hb', t: 'Hinterbandkontrolle', d: 'Starte eine Testaufnahme mit <b>REC</b> und schalte die Abhöre auf „Hinterband“. Du hörst jetzt, was wirklich auf dem Recorder ankommt, leicht verzögert.',
      ok: api => api.st.rec.on && api.st.listen === 'hb' && api.playing() },
  ],
});
