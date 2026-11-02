/* Gemeinsame Hilfsfunktionen. Alles hängt am globalen Objekt Sim. */
window.Sim = window.Sim || {};
(function (S) {
  "use strict";
  S.$ = (s, r = document) => r.querySelector(s);
  S.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  S.el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  S.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  S.dbToAmp = d => d === -Infinity ? 0 : Math.pow(10, d / 20);
  S.ampToDb = a => a > 1e-7 ? 20 * Math.log10(a) : -Infinity;
  const comma = s => s.replace('.', ',');
  S.comma = comma;
  S.fmtDb = (d, dec = 1) => d === -Infinity ? '−∞' : (d > 0.04 ? '+' : d < -0.04 ? '−' : '') + comma(Math.abs(d).toFixed(dec));
  S.fmtHz = f => f >= 1000 ? comma((f / 1000).toFixed(f >= 10000 ? 0 : 1)) + 'k' : String(Math.round(f));
  S.fmtPan = p => Math.abs(p) < 0.005 ? 'C' : (p < 0 ? 'L' : 'R') + Math.round(Math.abs(p) * 100);
  S.fmtM = m => m < 1 ? Math.round(m * 100) + ' cm' : comma(m.toFixed(2)) + ' m';
  S.hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  S.rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  S.clone = o => JSON.parse(JSON.stringify(o, (k, v) => v === -Infinity ? '__ninf' : v), (k, v) => v === '__ninf' ? -Infinity : v);

  /* Szenen-Registry: jede Datei in js/scenes/ ruft Sim.registerScene(...) auf. */
  S.scenes = [];
  S.registerScene = sc => S.scenes.push(sc);

  /* Richtcharakteristiken: Empfindlichkeit g(θ) = a + (1−a)·cos θ, Q = Bündelungsgrad (Diffusfeld) */
  S.PATTERNS = {
    kugel:      { name: 'Kugel',      a: 1,    Q: 1 },
    niere:      { name: 'Niere',      a: 0.5,  Q: 3 },
    superniere: { name: 'Superniere', a: 0.37, Q: 3.7 },
    hyperniere: { name: 'Hyperniere', a: 0.25, Q: 4 },
    acht:       { name: 'Acht',       a: 0,    Q: 3 },
  };
  S.MICTYPES = {
    dyn:  { name: 'Dynamisch',    sens: 0.3, phantom: false },
    kond: { name: 'Kondensator', sens: 1.0, phantom: true },
  };
  S.patternGain = (pat, theta) => { const a = S.PATTERNS[pat].a; return a + (1 - a) * Math.cos(theta); };
})(Sim);
