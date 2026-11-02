/* Szene b) Musik: kleine Band im Club. Kick, Snare und Gesang über Mikrofone, Bass und Keys per DI-Box. */
Sim.registerScene({
  id: 'musik',
  name: 'Musik',
  intro: 'Band im Club: Kick, Snare und Gesang werden mikrofoniert, Bass und Keyboard kommen über DI-Boxen. Der Sänger braucht seinen Monitor, der Gesang bekommt Hall.',
  room: {
    w: 10, h: 7, rt: 0.9, level: 0.2, label: 'Club, ca. 10 × 7 m, Nachhallzeit ≈ 0,9 s',
    items: [
      { t: 'zone', x: 1, y: 0.5, w: 8, h: 3.8, label: 'Bühne' },
      { t: 'rect', x: 3.6, y: 1.1, w: 2.0, h: 1.4, label: 'Drums' },
      { t: 'rect', x: 1.5, y: 1.9, w: 0.9, h: 0.5, label: 'Bass-Amp (DI)' },
      { t: 'rect', x: 6.9, y: 2.1, w: 1.3, h: 0.55, label: 'Keyboard (DI)' },
      { t: 'rect', x: 4.85, y: 4.0, w: 0.7, h: 0.3, label: 'Wedge' },
      { t: 'zone', x: 1, y: 5.0, w: 8, h: 1.8, label: 'Publikum' },
      { t: 'pa', x: 0.5, y: 4.5, a: 30 }, { t: 'pa', x: 9.5, y: 4.5, a: 150 },
    ],
  },
  sources: [
    { id: 'kick', name: 'Kick', short: 'K', role: 'Bassdrum', kind: 'acoustic', x: 4.4, y: 2.15, level: 4, color: '#e3604c', sound: { gen: 'kick' } },
    { id: 'snare', name: 'Snare + HiHat', short: 'SN', role: 'Snare', kind: 'acoustic', x: 4.95, y: 1.75, level: 3.5, color: '#e6a23c', sound: { gen: 'snare' } },
    { id: 'sing', name: 'Gesang', short: 'VOX', role: 'Sänger', kind: 'acoustic', x: 5.2, y: 3.45, level: 1.3, color: '#c47ce3', sound: { gen: 'sing' } },
    { id: 'bass', name: 'Bass', short: 'B', role: 'DI-Box', kind: 'line', inputs: ['l1'], color: '#4f9de0', sound: { gen: 'bass' } },
    { id: 'keys', name: 'Keys', short: 'KEY', role: 'DI-Box', kind: 'line', inputs: ['l2'], color: '#4fc49a', sound: { gen: 'keys' } },
  ],
  mics: [
    { id: 'mk', name: 'Kick-Mic', for: 'kick', x: 4.4, y: 2.55, angle: -90, type: 'dyn', pattern: 'niere', socket: 'sb1' },
    { id: 'ms', name: 'Snare-Mic', for: 'snare', x: 5.1, y: 2.0, angle: -121, type: 'dyn', pattern: 'kugel', socket: 'sb2' },
    { id: 'mv', name: 'Vocal-Mic', for: 'sing', x: 5.2, y: 3.7, angle: 90, type: 'dyn', pattern: 'niere', socket: 'sb3' },
  ],
  inputs: [
    { id: 'sb1', label: 'SB 1' }, { id: 'sb2', label: 'SB 2' }, { id: 'sb3', label: 'SB 3' }, { id: 'sb4', label: 'SB 4' },
    { id: 'l1', label: 'DI 1', fixed: 'Bass' }, { id: 'l2', label: 'DI 2', fixed: 'Keys' },
  ],
  channels: [
    { input: 'sb1', gain: 25, fader: -5 },
    { input: 'sb2', gain: 24, fader: -7, pan: 0.1, aux: [-Infinity, -20] },
    { input: 'l2', gain: 0, fader: -6 },
    { input: 'l1', gain: 0, fader: -10, pan: 0.3 },
    { input: 'sb3', gain: 31, fader: -3, hpfOn: true, hpf: 100, aux: [-Infinity, -12] },
    {}, {}, {},
  ],
  auxNames: ['Monitor', 'Hall'],
  outputs: [
    { id: 'paL', name: 'PA links' }, { id: 'paR', name: 'PA rechts' },
    { id: 'mon', name: 'Wedge Gesang' }, { id: 'fx', name: 'Hallgerät In' },
  ],
  outDefault: { paL: 'mainL', paR: 'mainR', mon: 'aux2', fx: 'aux2' },
  fx: { rt: 2.0 },
  listen: [
    { id: 'pa', label: 'Saal (PA)', L: 'paL', R: 'paR' },
    { id: 'mon', label: 'Wedge Gesang', mono: 'mon' },
  ],
  masters: { main: 0, auxM: [0, 0], fxRet: -6, vol: -12 },
  show: {
    len: 40,
    cues: [
      { t: 0, text: 'Song läuft: Strophe' },
      { t: 10, text: 'Refrain' },
      { t: 20, text: 'Strophe 2' },
      { t: 30, text: 'Refrain' },
    ],
    activity: { kick: [[0, 1e9]], snare: [[0, 1e9]], sing: [[0, 1e9]], bass: [[0, 1e9]], keys: [[0, 1e9]] },
    rules(api) {
      const issues = [];
      for (const id of ['kick', 'snare', 'sing', 'bass', 'keys']) {
        if (!api.chansForSource(id).some(i => api.open(i))) issues.push(`${api.src(id).name}: kein offener Kanal in der Summe.`);
      }
      const vox = api.chansForSource('sing');
      if (api.st.out.mon !== 'aux1' || !vox.some(i => api.st.ch[i].aux[0] > -25)) issues.push('Der Sänger hört sich nicht auf dem Wedge.');
      if (api.st.out.paL !== 'mainL' || api.st.out.paR !== 'mainR') issues.push('Die PA bekommt nicht die Summe L/R.');
      if (api.mainClip()) issues.push('Die Summe übersteuert.');
      return issues;
    },
  },
  tasks: [
    { id: 'rot', t: 'Gesangsmikro drehen', d: 'Das Vocal-Mic zeigt mit der Rückseite zum Sänger. Wähle es im Raumplan aus und drehe es am Griff, bis der Sänger höchstens 30° neben der Achse liegt.',
      ok: api => api.angleErr('mv', 'sing') <= 30 },
    { id: 'snare', t: 'Übersprechen auf der Snare', d: 'Das Snare-Mic steht auf <b>Kugel</b> und nimmt viel Kick mit. Stelle eine gerichtete Charakteristik ein (Niere oder enger) und bring es auf höchstens 20 cm an die Snare.',
      ok: api => api.st.mics.ms.pattern !== 'kugel' && api.st.mics.ms.pattern !== 'acht' && api.dist('ms', 'snare') <= 0.2 && api.angleErr('ms', 'snare') <= 30 },
    { id: 'patch', t: 'Kanäle vertauscht', d: 'Auf Kanal 3 sollte der Bass liegen, auf Kanal 4 die Keys. Im Moment ist es umgekehrt. Korrigiere den Eingangs-Patch.',
      ok: api => api.st.ch[2].input === 'l1' && api.st.ch[3].input === 'l2' },
    { id: 'mon', t: 'Monitor für den Sänger', d: 'Der Wedge hängt am falschen Bus. Lege den Ausgang „Wedge Gesang“ auf <b>Aux 1</b> und dreh am Gesangskanal den Aux-1-Send (PRE) auf. Kontrolle: Abhöre auf „Wedge Gesang“.',
      ok: api => api.st.out.mon === 'aux1' && api.chansForSource('sing').some(i => api.st.ch[i].aux[0] > -20) },
    { id: 'pfl', t: 'Abhören mit PFL', d: 'Hör dir die Kick allein an: <b>PFL</b> am Kick-Kanal drücken. PFL schaltet nur die Abhöre um, das Publikum hört weiter den ganzen Mix.',
      ok: api => api.chansForSource('kick').some(i => api.st.ch[i].pfl) && api.st.ch.filter(c => c.pfl).length === 1 },
    { id: 'lvl', t: 'Mikrofone einpegeln', d: 'Bring Kick, Snare und Gesang mit dem Gain auf Spitzen zwischen −18 und −6 dBFS.',
      ok: api => ['kick', 'snare', 'sing'].every(id => api.levelOk(id)) },
  ],
});
