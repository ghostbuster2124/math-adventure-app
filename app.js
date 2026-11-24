'use strict';
/* =========================================================
   Reken Avontuur — rekenspel voor kleuters (5–6 jaar)
   Werkt volledig offline (service worker + localStorage).
   Alle tekst wordt voorgelezen in het Nederlands (nl-BE).
   ========================================================= */

// ---------- hulpfuncties ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const $ = (sel) => document.querySelector(sel);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sum = (arr) => arr.reduce((x, y) => x + y, 0);
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const times = (n, fn) => Array.from({ length: Math.max(0, n) }, (_, i) => fn(i));

// 3 antwoordknoppen: het juiste antwoord + "slimme" foute antwoorden in de buurt
function numChoices(ans, { min = 0, max = 999, near = [], n = 3, spread = 3 } = {}) {
  const set = new Set([ans]);
  for (const c of shuffle(near)) {
    if (set.size >= n) break;
    if (Number.isInteger(c) && c >= min && c <= max) set.add(c);
  }
  let guard = 0;
  while (set.size < n && guard++ < 300) {
    const c = ans + rnd(-spread, spread);
    if (c >= min && c <= max) set.add(c);
  }
  let c = min;
  while (set.size < n) set.add(c++);
  return shuffle([...set]);
}
// 34 -> 43, 134 -> 143 (typische verwarring: "vierendertig")
function swapDigits(n) {
  if (n < 10) return null;
  const s = String(n);
  const t = s[s.length - 2], e = s[s.length - 1];
  if (t === e) return null;
  return Number(s.slice(0, -2) + e + t);
}
function placeWords(n) {
  const H = Math.floor(n / 100), T = Math.floor((n % 100) / 10), E = n % 10;
  const parts = [];
  if (H) parts.push(H === 1 ? '1 honderdtal' : `${H} honderdtallen`);
  if (T || H) parts.push(T === 1 ? '1 tiental' : `${T} tientallen`);
  parts.push(E === 1 ? '1 eenheid' : `${E} eenheden`);
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' en ' + parts[parts.length - 1] : parts[0];
}
// "7 + ? = 10" -> "7 plus hoeveel is 10"
function eqSay(eq) {
  return eq.replace(/\+/g, ' plus ').replace(/−/g, ' min ').replace(/×/g, ' keer ')
    .replace(/:/g, ' gedeeld door ').replace(/=/g, ' is ').replace(/\?/g, ' hoeveel ')
    .replace(/\s+/g, ' ').trim();
}

// ---------- opslag ----------
const KEY = 'reken-avontuur';
function loadState() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
const state = Object.assign({ best: {}, stars: 0, stickers: [], voice: true, sound: true }, loadState());
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ok */ }
}

// ---------- voorlezen ----------
const hasTTS = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let nlVoice = null;
function pickVoice() {
  if (!hasTTS) return;
  const vs = speechSynthesis.getVoices();
  nlVoice = vs.find((v) => /^nl[-_]BE/i.test(v.lang)) || vs.find((v) => /^nl/i.test(v.lang)) || null;
}
if (hasTTS) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speak(text) {
  return new Promise((resolve) => {
    const est = Math.min(7000, 900 + String(text || '').length * 70);
    if (!state.voice || !hasTTS || !text) { setTimeout(resolve, Math.min(est, 1300)); return; }
    let finished = false;
    const done = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
    const timer = setTimeout(done, est + 1500);
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = nlVoice ? nlVoice.lang : 'nl-BE';
      if (nlVoice) u.voice = nlVoice;
      u.rate = 0.9;
      u.pitch = 1.1;
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    } catch (e) { done(); }
  });
}
function stopSpeech() {
  if (hasTTS) { try { speechSynthesis.cancel(); } catch (e) { /* ok */ } }
}

// ---------- geluidjes (zonder bestanden) ----------
let actx = null;
function tone(freq, dur, type = 'sine', when = 0, vol = 0.15) {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime + when;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  } catch (e) { /* ok */ }
}
const sfx = {
  tap: () => tone(880, 0.06, 'sine', 0, 0.08),
  good: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', i * 0.09)),
  bad: () => tone(200, 0.25, 'square', 0, 0.04),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.13)),
};

// ---------- inhoud ----------
const THINGS = [
  ['🍎', 'appels'], ['🍓', 'aardbeien'], ['🍌', 'bananen'], ['🥕', 'wortels'], ['🍪', 'koekjes'],
  ['🐟', 'visjes'], ['⭐', 'sterren'], ['🎈', 'ballonnen'], ['🌻', 'bloemen'], ['🚗', 'autootjes'],
  ['🦆', 'eendjes'], ['🍩', 'donuts'], ['🐞', 'lieveheersbeestjes'], ['⚽', 'ballen'],
  ['🧁', 'cupcakes'], ['🐣', 'kuikentjes'], ['🍒', 'kersen'], ['🦋', 'vlinders'],
];
const FOODS = [
  ['🍪', 'koekjes'], ['🍎', 'appels'], ['🍓', 'aardbeien'], ['🍌', 'bananen'],
  ['🥕', 'wortels'], ['🍩', 'donuts'], ['🧁', 'cupcakes'], ['🍒', 'kersen'],
];
const ANIMALS = ['🐻', '🐰', '🐵', '🦊', '🐱', '🐶', '🐼', '🐸', '🐷', '🐯', '🐨', '🦁'];
const STICKERS = ['🦁', '🐯', '🐼', '🐨', '🦒', '🦓', '🐘', '🦛', '🦘', '🐧', '🦉', '🦜', '🐢', '🐙', '🦀', '🐬',
  '🐳', '🦄', '🐲', '🦖', '🐝', '🦋', '🐞', '🐌', '🦔', '🦦', '🐿️', '🦩', '🐊', '🦭', '🐺', '🦚'];
const PRAISE = ['Goed zo!', 'Super!', 'Knap!', 'Straf!', 'Heel goed!', 'Joepie!', 'Prima!', 'Bravo!', 'Fantastisch!'];
const OOPS = ['Probeer nog eens.', 'Bijna! Nog een keer.', 'Kijk nog eens goed.', 'Hmm, nog eens proberen.'];
const LEVELS = [
  { emoji: '🐣', name: 'Makkelijk' },
  { emoji: '🐥', name: 'Gewoon' },
  { emoji: '🦁', name: 'Moeilijk' },
];
const ROUND = 8; // vragen per ronde

// ---------- visuele bouwstenen ----------
// voorwerpen in rijtjes van 5 (makkelijker om te tellen)
function objects(n, emoji, { gone = 0, small = false } = {}) {
  const wrap = h('div', { class: 'objs' + (small ? ' small' : '') });
  let five = null;
  for (let i = 0; i < n; i++) {
    if (i % 5 === 0) { five = h('div', { class: 'five' }); wrap.append(five); }
    const isGone = i >= n - gone;
    five.append(h('span', { class: 'obj' + (isGone ? ' gone' : ''), style: `animation-delay:${i * 0.03}s` },
      isGone ? h('span', { class: 'ghost' }, emoji) : emoji));
  }
  return wrap;
}
// tienkaders (rekenkaders) met bolletjes
function tenFrames(dots) {
  const frames = Math.max(1, Math.ceil(dots.length / 10));
  return h('div', { class: 'frames' }, times(frames, (f) =>
    h('div', { class: 'frame' }, times(10, (i) => {
      const d = dots[f * 10 + i];
      return h('div', { class: 'cell' }, d ? h('span', { class: 'dot ' + d.c + (d.x ? ' x' : '') }) : null);
    }))));
}
function groupsVis(k, n, emoji) {
  return h('div', { class: 'groups' }, times(k, () => h('div', { class: 'group' }, objects(n, emoji, { small: true }))));
}
// MAB-materiaal: H groen, T rood, E blauw (Vlaamse kleurcode)
function base10(n) {
  const H = Math.floor(n / 100), T = Math.floor((n % 100) / 10), E = n % 10;
  const wrap = h('div', { class: 'b10' });
  if (H) wrap.append(h('div', { class: 'b10-part' }, times(H, () => h('div', { class: 'flat' }, times(100, () => h('i'))))));
  if (T) wrap.append(h('div', { class: 'b10-part' }, times(T, () => h('div', { class: 'rod' }, times(10, () => h('i'))))));
  if (E) wrap.append(h('div', { class: 'b10-part ones' }, times(E, () => h('div', { class: 'cube' }))));
  return wrap;
}
function numRow(items) {
  return h('div', { class: 'numrow' }, items.map((x) =>
    h('div', { class: 'numbox' + (x === '?' ? ' q' : '') }, String(x))));
}
function miniRekenrek() {
  return h('div', { class: 'mini-rr' }, times(2, () => h('div', { class: 'mini-row' }, times(10, (i) => h('i', { class: i < 5 ? 'r' : 'w' })))));
}

// Rekenrek: 2 rijen van 10 kralen (5 rood, 5 wit). Tik op een kraal om te schuiven.
function Rekenrek({ rows = 2, values, interactive = true, onChange } = {}) {
  const vals = values ? [...values] : Array(rows).fill(0);
  const el = h('div', { class: 'rekenrek' + (interactive ? ' interactive' : '') });
  const beads = [];
  for (let r = 0; r < rows; r++) {
    const row = h('div', { class: 'rr-row' }, h('div', { class: 'rr-wire' }));
    beads[r] = [];
    for (let i = 0; i < 10; i++) {
      const b = h('div', { class: 'bead ' + (i < 5 ? 'red' : 'white'), style: `--i:${i}` });
      if (interactive) {
        b.addEventListener('click', () => {
          vals[r] = i < vals[r] ? i : i + 1;
          sfx.tap();
          layout();
          if (onChange) onChange([...vals]);
        });
      }
      beads[r].push(b);
      row.append(b);
    }
    el.append(row);
  }
  function layout() {
    beads.forEach((list, r) => list.forEach((b, i) => b.classList.toggle('left', i < vals[r])));
  }
  layout();
  el.getValues = () => [...vals];
  el.reset = () => { vals.fill(0); layout(); };
  return el;
}

// Telraam met staven H, T, E. 10 kralen worden automatisch ingewisseld.
const PLACE_VALUE = { H: 100, T: 10, E: 1 };
const UP = { E: 'T', T: 'H' };
function Telraam({ places = ['T', 'E'], values = {}, interactive = true, maxTotal = 200, onChange } = {}) {
  const vals = Object.assign({ H: 0, T: 0, E: 0 }, values);
  const el = h('div', { class: 'telraam' });
  const rods = {};
  const total = () => vals.H * 100 + vals.T * 10 + vals.E;
  for (const p of places) {
    rods[p] = h('div', { class: 'tr-rod' });
    const col = h('div', { class: 'tr-col' }, rods[p], h('div', { class: 'tr-label ' + p }, p));
    if (interactive) {
      col.append(h('div', { class: 'tr-btns' },
        h('button', { class: 'tr-btn plus', 'aria-label': 'meer', onclick: () => add(p, 1) }, '+'),
        h('button', { class: 'tr-btn min', 'aria-label': 'minder', onclick: () => add(p, -1) }, '−')));
    }
    el.append(col);
  }
  function draw() {
    for (const p of places) rods[p].replaceChildren(...times(vals[p], () => h('div', { class: 'tr-bead ' + p })));
  }
  function inc(p) {
    if (vals[p] < 9) { vals[p]++; return true; }
    const up = UP[p];
    if (!up || !places.includes(up) || !inc(up)) return false;
    vals[p] = 0;
    return true;
  }
  function add(p, d) {
    let exchanged = false;
    if (d < 0) {
      if (vals[p] === 0) { sfx.bad(); return; }
      vals[p]--;
      sfx.tap();
    } else {
      if (total() + PLACE_VALUE[p] > maxTotal) { sfx.bad(); speak('Hoger gaat niet.'); return; }
      const wasFull = vals[p] === 9;
      if (!inc(p)) { sfx.bad(); speak('Er passen maar 9 kralen op een staaf.'); return; }
      if (wasFull) {
        exchanged = true;
        sfx.good();
        speak(p === 'E' ? '10 eenheden worden 1 tiental!' : '10 tientallen worden 1 honderdtal!');
      } else sfx.tap();
    }
    draw();
    if (onChange) onChange(total(), exchanged);
  }
  draw();
  el.getValue = total;
  el.reset = () => { vals.H = vals.T = vals.E = 0; draw(); };
  return el;
}

function checkBtn(onclick) {
  return h('button', { class: 'check-btn', onclick }, '✔ Klaar');
}

// ---------- vraag-generatoren ----------
function genTellen(level) {
  const max = [5, 10, 20][level - 1], min = [1, 3, 8][level - 1];
  const [e, name] = pick(THINGS);
  const n = rnd(min, max);
  if (Math.random() < 0.25) {
    return {
      prompt: '👂 Welk getal hoor je?', promptNoVoice: `Tik op ${n}.`, say: `Tik op het getal ${n}.`,
      choices: numChoices(n, { min: 1, max: max + 3, near: [swapDigits(n), n + 1, n - 1] }),
      answer: n, after: `Dat is ${n}.`,
    };
  }
  return {
    prompt: `Hoeveel ${name} zie je?`, visual: objects(n, e, { small: n > 10 }),
    choices: numChoices(n, { min: 1, max: max + 2, spread: 2 }), answer: n, after: `Het zijn er ${n}.`,
  };
}

function genGetallen(level) {
  const max = [20, 100, 200][level - 1];
  const types = ['hoor', 'blokken', 'tussen', 'groot'];
  if (level > 1) types.push('sprong');
  const t = pick(types);
  const n = level === 3 ? (Math.random() < 0.75 ? rnd(100, 199) : rnd(20, 99)) : rnd(level === 1 ? 1 : 11, max);
  switch (t) {
    case 'hoor':
      return {
        prompt: '👂 Welk getal hoor je?', promptNoVoice: `Tik op ${n}.`, say: `Tik op het getal ${n}.`,
        choices: numChoices(n, { min: 0, max, near: [swapDigits(n), n + 1, n - 1, n + 10, n - 10] }),
        answer: n, after: `Dat is ${n}.`,
      };
    case 'blokken': {
      const m = level === 1 ? rnd(10, 20) : n;
      return {
        prompt: 'Welk getal is dit?', say: 'Welk getal zie je hier? Tel de staven en de blokjes.',
        visual: base10(m),
        choices: numChoices(m, { min: 0, max, near: [swapDigits(m), m + 10, m - 10, m + 1, m - 1] }),
        answer: m, after: `Het is ${m}. ${placeWords(m)}.`,
      };
    }
    case 'tussen': {
      const m = Math.max(1, Math.min(max - 1, n));
      return {
        prompt: 'Welk getal ontbreekt?', say: `Welk getal komt tussen ${m - 1} en ${m + 1}?`,
        visual: numRow([m - 1, '?', m + 1]),
        choices: numChoices(m, { min: 0, max, near: [m - 1, m + 1, swapDigits(m), m + 10, m - 10] }),
        answer: m, after: `${m - 1}, ${m}, ${m + 1}.`,
      };
    }
    case 'groot': {
      const a = n;
      let b, guard = 0;
      do {
        b = level === 1 ? rnd(1, 20)
          : (Math.random() < 0.5 && swapDigits(a) != null ? swapDigits(a) : a + rnd(-15, 15));
      } while ((b === a || b < 0 || b > max) && ++guard < 50);
      if (b === a || b < 0 || b > max) b = a === 1 ? 2 : a - 1;
      const smallest = Math.random() < 0.3;
      const ans = smallest ? Math.min(a, b) : Math.max(a, b);
      return {
        prompt: smallest ? 'Welk getal is het kleinst?' : 'Welk getal is het grootst?',
        choices: shuffle([a, b]), answer: ans,
        after: smallest ? `${ans} is kleiner.` : `${ans} is groter.`,
      };
    }
    default: { // sprong: tel verder
      const step = level === 2 ? pick([10, 10, 5, 2]) : pick([10, 10, 1, 5]);
      let s;
      if (step === 1) s = rnd(95, 195);
      else if (level === 2) s = step * rnd(0, Math.floor(max / step) - 4);
      else s = step * rnd(Math.ceil(70 / step), Math.floor(200 / step) - 3);
      const seq = [s, s + step, s + 2 * step];
      const ans = s + 3 * step;
      return {
        prompt: 'Tel verder!', say: `Tel verder: ${seq.join(', ')}. Wat komt er dan?`,
        visual: numRow([...seq, '?']),
        choices: numChoices(ans, { min: 0, max, near: [ans + step, ans - step, ans + 1, ans + 10, swapDigits(ans)] }),
        answer: ans, after: `${seq.join(', ')}, ${ans}. Sprongen van ${step}.`,
      };
    }
  }
}

function genPlus(level) {
  let a, b;
  if (level === 1) { a = rnd(1, 4); b = rnd(1, 5 - a); }
  else if (level === 2) { a = rnd(1, 9); b = rnd(1, 10 - a); }
  else { a = rnd(5, 10); b = rnd(Math.max(1, 11 - a), Math.min(10, 20 - a)); }
  const s = a + b;
  const [e, name] = pick(THINGS);
  const visual = level < 3
    ? h('div', { class: 'sumvis' }, objects(a, e), h('div', { class: 'op' }, '+'), objects(b, e))
    : tenFrames([...times(a, () => ({ c: 'a' })), ...times(b, () => ({ c: 'b' }))]);
  return {
    prompt: level < 3 ? `Hoeveel ${name} samen?` : 'Hoeveel bolletjes samen?',
    eq: `${a} + ${b} = ?`, say: `${a} plus ${b}. Hoeveel is dat samen?`, visual,
    choices: numChoices(s, { min: 0, max: 20, near: [s + 1, s - 1, s + 2] }), answer: s,
    after: `${a} plus ${b} is ${s}.`,
  };
}

function genMin(level) {
  let a, b;
  if (level === 1) { a = rnd(2, 5); b = rnd(1, a); }
  else if (level === 2) { a = rnd(4, 10); b = rnd(1, a - 1); }
  else { a = rnd(11, 20); b = rnd(2, a - 2); }
  const d = a - b;
  const [e, name] = pick(THINGS);
  const visual = level < 3
    ? objects(a, e, { gone: b })
    : tenFrames(times(a, (i) => ({ c: 'a', x: i >= a - b })));
  return {
    prompt: 'Hoeveel blijven er over?', eq: `${a} − ${b} = ?`,
    say: level < 3 ? `Er zijn ${a} ${name}. Er gaan er ${b} weg. ${a} min ${b}. Hoeveel blijven er over?`
      : `${a} min ${b}. Hoeveel blijven er over?`,
    visual, choices: numChoices(d, { min: 0, max: 20, near: [d + 1, d - 1, a + b > 20 ? d + 2 : a + b] }),
    answer: d, after: `${a} min ${b} is ${d}.`,
  };
}

function genKeer(level) {
  let n, k;
  if (level === 1) { n = pick([2, 2, 3]); k = rnd(1, 4); }
  else if (level === 2) { n = pick([2, 5, 10]); k = rnd(1, 5); }
  else { n = pick([2, 3, 4, 5, 10]); k = rnd(2, n === 10 ? 5 : 6); }
  const p = n * k;
  const [e] = pick(THINGS);
  return {
    prompt: `${k} ${k === 1 ? 'groepje' : 'groepjes'} van ${n}. Hoeveel samen?`, eq: `${k} × ${n} = ?`,
    say: `${k} ${k === 1 ? 'groepje' : 'groepjes'} van ${n}. ${k} keer ${n}. Hoeveel zijn het er samen?`,
    visual: groupsVis(k, n, e),
    choices: numChoices(p, { min: 0, max: 100, near: [p + n, p - n, p + 1, p - 1, k + n] }), answer: p,
    after: `${k} keer ${n} is ${p}.`,
  };
}

function genDelen(level) {
  const k = level === 1 ? 2 : level === 2 ? pick([2, 3]) : rnd(2, 5);
  const per = level === 1 ? rnd(1, 3) : level === 2 ? rnd(1, 4) : rnd(2, Math.min(5, Math.floor(20 / k)));
  const total = k * per;
  const [e, name] = pick(FOODS);
  const animals = shuffle(ANIMALS).slice(0, k);
  return {
    key: `d${total}:${k}`, prompt: `Verdeel ${total} ${name} eerlijk.`, eq: `${total} : ${k} = ?`, answer: per,
    say: `Verdeel ${total} ${name} eerlijk over ${k} dieren. Tik op een dier om het iets te geven.`,
    after: `${total} gedeeld door ${k} is ${per}. Iedereen krijgt ${per}.`,
    custom(vis, api, ans) {
      let pile = total, phase = 1;
      const plates = Array(k).fill(0);
      const pileEl = h('div', { class: 'pile' });
      const cards = animals.map((a, j) => {
        const plate = h('div', { class: 'plate' });
        const card = h('button', { class: 'friend', onclick: () => give(j) }, h('div', { class: 'animal' }, a), plate);
        card.plate = plate;
        return card;
      });
      vis.append(h('div', { class: 'share' }, pileEl, h('div', { class: 'friends' }, cards)));
      const again = h('button', { class: 'big-btn reset', onclick: () => {
        if (phase !== 1) return;
        pile = total; plates.fill(0); sfx.tap(); draw();
      } }, '🔄 Opnieuw');
      ans.append(again);
      function draw() {
        pileEl.replaceChildren(...(pile ? times(pile, () => h('span', { class: 'obj' }, e))
          : [h('span', { class: 'pile-empty' }, '✔')]));
        cards.forEach((c, j) => c.plate.replaceChildren(...times(plates[j], () =>
          h('span', { class: 'obj', onclick: (ev) => { ev.stopPropagation(); takeBack(j); } }, e))));
      }
      function give(j) {
        if (phase !== 1 || !pile) return;
        pile--; plates[j]++;
        sfx.tap();
        draw();
        if (!pile) check();
      }
      function takeBack(j) {
        if (phase !== 1) return;
        plates[j]--; pile++;
        sfx.tap();
        draw();
      }
      function check() {
        if (plates.every((p) => p === per)) {
          phase = 2;
          again.remove();
          cards.forEach((c) => c.classList.add('done'));
          api.setPrompt('Hoeveel krijgt elk dier?', `Eerlijk verdeeld! Hoeveel ${name} krijgt elk dier?`);
          renderChoices(numChoices(per, { min: 1, max: Math.max(6, per + 3), near: [per + 1, per - 1, k] }), per, ans, api);
        } else {
          api.wrong('Oei, dat is niet eerlijk! Iedereen moet evenveel krijgen. Tik op opnieuw en probeer nog eens.');
          cards.forEach((c) => { c.classList.remove('unfair'); void c.offsetWidth; c.classList.add('unfair'); });
        }
      }
      draw();
    },
  };
}

function genRekenrek(level) {
  const rows = level === 1 ? 1 : 2;
  const t = level === 3 ? pick(['maak', 'som', 'som']) : pick(['maak', 'lees']);
  if (t === 'maak') {
    const n = level === 1 ? rnd(1, 10) : rnd(level === 2 ? 6 : 11, 20);
    return {
      key: 'maak' + n, prompt: `Maak ${n} op het rekenrek.`,
      say: `Maak ${n}. Tik op de kralen om ze naar links te schuiven. Tik dan op klaar.`,
      after: `Je maakte ${n}.`,
      custom(vis, api, ans) {
        const live = h('div', { class: 'live-small', hidden: true });
        const show = (v) => { live.textContent = rows > 1 ? `${v[0]} + ${v[1]} = ${sum(v)}` : String(sum(v)); };
        const rr = Rekenrek({ rows, onChange: show });
        vis.append(h('div', { class: 'stack' }, rr, live));
        ans.append(checkBtn(() => {
          if (api.isLocked()) return;
          const got = sum(rr.getValues());
          show(rr.getValues());
          live.hidden = false;
          if (got === n) api.correct();
          else api.wrong(`Je hebt er ${got}. We zoeken ${n}.`);
        }));
      },
    };
  }
  if (t === 'lees') {
    let a, b;
    if (rows === 1) { a = rnd(1, 10); b = 0; }
    else {
      const n = rnd(6, 20);
      if (Math.random() < 0.6) { a = Math.min(10, n); b = n - a; }
      else { a = rnd(Math.max(1, n - 10), Math.min(10, n - 1)); b = n - a; }
    }
    const n = a + b;
    return {
      prompt: 'Hoeveel kralen staan er links?', say: 'Hoeveel kralen zijn er naar links geschoven?',
      visual: Rekenrek({ rows, values: rows === 1 ? [a] : [a, b], interactive: false }),
      choices: numChoices(n, { min: 1, max: 20, near: [n + 1, n - 1, n + 5, n - 5] }), answer: n,
      after: rows > 1 && b > 0 ? `${a} plus ${b} is ${n}.` : `Het zijn er ${n}.`,
    };
  }
  const a = rnd(4, 10), b = rnd(3, 10), n = a + b;
  return {
    prompt: 'Hoeveel kralen samen?', eq: `${a} + ${b} = ?`,
    say: `Bovenaan ${a}, onderaan ${b}. ${a} plus ${b}. Hoeveel is dat samen?`,
    visual: Rekenrek({ rows: 2, values: [a, b], interactive: false }),
    choices: numChoices(n, { min: 1, max: 20, near: [n + 1, n - 1, n + 10, n - 10] }), answer: n,
    after: `${a} plus ${b} is ${n}.`,
  };
}

function genTelraam(level) {
  const places = level === 3 ? ['H', 'T', 'E'] : ['T', 'E'];
  const maxTotal = level === 3 ? 200 : 99;
  const n = level === 1 ? rnd(10, 20) : level === 2 ? rnd(21, 99) : rnd(100, 200);
  const words = placeWords(n);
  if (Math.random() < 0.5) {
    return {
      key: 'm' + n, prompt: `Maak ${n} op het telraam.`,
      say: `Maak ${n} op het telraam. Hoeveel ${level === 3 ? 'honderdtallen, ' : ''}tientallen en eenheden heb je nodig?`,
      after: `${n} is ${words}.`,
      custom(vis, api, ans) {
        const tr = Telraam({ places, maxTotal });
        vis.append(tr);
        ans.append(checkBtn(() => {
          if (api.isLocked()) return;
          const got = tr.getValue();
          if (got === n) api.correct();
          else api.wrong(`Dat is ${got}. We zoeken ${n}.`);
        }));
      },
    };
  }
  const vals = { H: Math.floor(n / 100), T: Math.floor((n % 100) / 10), E: n % 10 };
  return {
    prompt: 'Welk getal staat op het telraam?', say: 'Welk getal staat op het telraam? Kijk goed naar de kleuren.',
    visual: Telraam({ places, values: vals, interactive: false }),
    choices: numChoices(n, { min: 0, max: maxTotal, near: [swapDigits(n), n + 10, n - 10, n + 1, n - 1] }),
    answer: n, after: `${n} is ${words}.`,
  };
}

function mental(eq, ans, opts = {}) {
  return {
    prompt: opts.prompt || '🧠 Reken in je hoofd!', eq, say: opts.say || eqSay(eq) + '?',
    choices: numChoices(ans, { min: 0, max: opts.max || 200, near: opts.near || [ans + 1, ans - 1, ans + 2, ans - 2] }),
    answer: ans, after: opts.after || eqSay(eq.replace('?', ans)) + '.', visual: opts.visual || null,
  };
}
function genHoofd(level) {
  if (level === 1) {
    const t = pick(['harten', 'harten', 'dubbel', 'plus', 'min']);
    if (t === 'harten') {
      const a = rnd(1, 9);
      return mental(`${a} + ? = 10`, 10 - a, {
        prompt: '❤️ Verliefde harten: samen 10!', say: `Verliefde harten! ${a} plus hoeveel is 10?`,
        after: `${a} en ${10 - a} zijn verliefde harten. Samen 10.`, max: 10, near: [11 - a, 9 - a, a],
        visual: tenFrames(times(a, () => ({ c: 'a' }))),
      });
    }
    if (t === 'dubbel') { const a = rnd(1, 5); return mental(`${a} + ${a} = ?`, 2 * a, { prompt: '👯 Dubbel!', max: 10 }); }
    if (t === 'plus') { const a = rnd(1, 8), b = rnd(1, 10 - a); return mental(`${a} + ${b} = ?`, a + b, { max: 10 }); }
    const a = rnd(3, 10), b = rnd(1, a - 1);
    return mental(`${a} − ${b} = ?`, a - b, { max: 10 });
  }
  if (level === 2) {
    const t = pick(['plus', 'min', 'dubbel', 'helft', 'harten']);
    if (t === 'plus') { const a = rnd(3, 9), b = rnd(11 - a, Math.min(9, 20 - a)); return mental(`${a} + ${b} = ?`, a + b, { max: 20 }); }
    if (t === 'min') { const a = rnd(11, 18), b = rnd(a - 9, 9); return mental(`${a} − ${b} = ?`, a - b, { max: 20 }); }
    if (t === 'dubbel') { const a = rnd(3, 10); return mental(`${a} + ${a} = ?`, 2 * a, { prompt: '👯 Dubbel!', max: 20 }); }
    if (t === 'helft') {
      const x = 2 * rnd(2, 10);
      return mental(`${x} : 2 = ?`, x / 2, { prompt: '✂️ De helft!', say: `Wat is de helft van ${x}?`, after: `De helft van ${x} is ${x / 2}.`, max: 20 });
    }
    const a = rnd(1, 9);
    return mental(`${a} + ? = 10`, 10 - a, { prompt: '❤️ Verliefde harten!', say: `${a} plus hoeveel is 10?`, max: 10, near: [11 - a, 9 - a, a] });
  }
  const t = pick(['tien+', 'tien-', 'plus10', 'min10', 'honderd', 'buur']);
  const near = (x) => [x + 10, x - 10, x + 1, x - 1, swapDigits(x)];
  if (t === 'tien+') {
    const a = 10 * rnd(1, 10), b = 10 * rnd(1, Math.min(10, (200 - a) / 10));
    return mental(`${a} + ${b} = ?`, a + b, { near: near(a + b) });
  }
  if (t === 'tien-') {
    const a = 10 * rnd(3, 20), b = 10 * rnd(1, a / 10 - 1);
    return mental(`${a} − ${b} = ?`, a - b, { near: near(a - b) });
  }
  if (t === 'plus10') { const x = rnd(10, 190); return mental(`${x} + 10 = ?`, x + 10, { near: near(x + 10) }); }
  if (t === 'min10') { const x = rnd(20, 200); return mental(`${x} − 10 = ?`, x - 10, { near: near(x - 10) }); }
  if (t === 'honderd') { const x = rnd(1, 99); return mental(`100 + ${x} = ?`, 100 + x, { near: near(100 + x) }); }
  const base = 10 * rnd(10, 19) + pick([9, 0]);
  const plus = base % 10 === 9 || Math.random() < 0.5;
  const ans = plus ? base + 1 : base - 1;
  return mental(`${base} ${plus ? '+' : '−'} 1 = ?`, ans, { near: near(ans) });
}

// ---------- modules ----------
const MODULES = [
  { id: 'tellen', name: 'Tellen', icon: '🐞', color: '#ff8a65', gen: genTellen,
    desc: 'Tel de dingen en tik op het juiste getal.', levels: ['tot 5', 'tot 10', 'tot 20'] },
  { id: 'getallen', name: 'Getallen', icon: '💯', color: '#ba68c8', gen: genGetallen,
    desc: 'Getallen herkennen, vergelijken en verder tellen.', levels: ['tot 20', 'tot 100', 'tot 200'] },
  { id: 'plus', name: 'Plus', icon: '➕', color: '#66bb6a', gen: genPlus,
    desc: 'Samen doen: hoeveel zijn het er samen?', levels: ['tot 5', 'tot 10', 'tot 20'] },
  { id: 'min', name: 'Min', icon: '➖', color: '#f06292', gen: genMin,
    desc: 'Weg doen: hoeveel blijven er over?', levels: ['tot 5', 'tot 10', 'tot 20'] },
  { id: 'keer', name: 'Keer', icon: '✖️', color: '#ffa000', gen: genKeer, say: 'Keer. Groepjes maken.',
    desc: 'Groepjes maken: 3 groepjes van 2.', levels: ['groepjes van 2 en 3', 'tafels van 2, 5 en 10', 'groepjes tot 10'] },
  { id: 'delen', name: 'Delen', icon: '➗', color: '#29b6f6', gen: genDelen, say: 'Delen. Eerlijk verdelen.',
    desc: 'Eerlijk verdelen: iedereen krijgt evenveel.', levels: ['over 2 dieren', 'over 2 of 3', 'over 2 tot 5'] },
  { id: 'rekenrek', name: 'Rekenrek', iconNode: miniRekenrek, color: '#e57373', gen: genRekenrek, free: () => freeRekenrek(),
    desc: 'Schuif de kralen. Rood en wit: 5 en 5.', levels: ['tot 10', 'tot 20', 'plus tot 20'] },
  { id: 'telraam', name: 'Telraam', icon: '🧮', color: '#7986cb', gen: genTelraam, free: () => freeTelraam(),
    desc: 'Honderdtallen, tientallen en eenheden.', levels: ['tot 20', 'tot 100', 'tot 200'] },
  { id: 'hoofd', name: 'Hoofdrekenen', icon: '🧠', color: '#26a69a', gen: genHoofd,
    desc: 'Snel rekenen in je hoofd, zonder prentjes.', levels: ['verliefde harten', 'tot 20', 'tientallen tot 200'] },
];

// ---------- schermen ----------
const app = document.getElementById('app');
let current = null; // huidige ronde
let locked = false; // vraag al juist beantwoord

function screen(cls) {
  app.replaceChildren();
  const s = h('div', { class: 'screen ' + cls });
  app.append(s);
  app.scrollTop = 0;
  return s;
}
function setHeader(title, showHome) {
  $('#title').textContent = title;
  $('#homeBtn').hidden = !showHome;
  $('#starCount').textContent = state.stars;
}
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function showHome() {
  current = null;
  stopSpeech();
  setHeader('Reken Avontuur', false);
  const s = screen('home');
  s.append(h('div', { class: 'hello' },
    h('span', { class: 'mascot', onclick: () => speak('Hallo! Ik ben Uil. Kies een spel!') }, '🦉'),
    h('div', { class: 'hello-text' }, 'Hallo! Kies een spel.')));
  s.append(h('div', { class: 'tiles' }, MODULES.map((m) => {
    const earned = sum([1, 2, 3].map((l) => state.best[m.id + l] || 0));
    return h('button', { class: 'tile', style: `--c:${m.color}`, onclick: () => { sfx.tap(); showLevels(m); } },
      h('div', { class: 'tile-icon' }, m.iconNode ? m.iconNode() : m.icon),
      h('div', { class: 'tile-name' }, m.name),
      h('div', { class: 'tile-stars' }, `⭐ ${earned} / 9`));
  })));
  s.append(h('div', { class: 'home-bottom' },
    h('button', { class: 'small-btn', onclick: showAlbum }, `🏅 Stickers (${state.stickers.length})`),
    h('button', { class: 'small-btn', onclick: showSettings }, '⚙️ Ouders')));
}

function showLevels(m) {
  current = null;
  setHeader(m.name, true);
  speak((m.say || m.name) + '. Kies hoe moeilijk.');
  const s = screen('levels');
  s.append(h('div', { class: 'lv-head' },
    h('div', { class: 'lv-icon' }, m.iconNode ? m.iconNode() : m.icon),
    h('div', { class: 'lv-desc' }, m.desc)));
  s.append(h('div', { class: 'lv-row' }, LEVELS.map((L, i) =>
    h('button', { class: 'lv-btn lv' + (i + 1), onclick: () => { sfx.tap(); startRound(m, i + 1); } },
      h('div', { class: 'lv-emoji' }, L.emoji),
      h('div', { class: 'lv-name' }, L.name),
      h('div', { class: 'lv-sub' }, m.levels[i]),
      h('div', { class: 'lv-stars' }, starStr(state.best[m.id + (i + 1)] || 0))))));
  if (m.free) s.append(h('button', { class: 'free-btn', onclick: () => { sfx.tap(); m.free(); } }, '🎨 Vrij spelen'));
}

function startRound(mod, level) {
  current = { mod, level, i: 0, qid: 0, firstTry: 0, missed: false, keys: new Set() };
  setHeader(`${mod.name} ${LEVELS[level - 1].emoji}`, true);
  nextQuestion();
}

function nextQuestion() {
  const r = current;
  if (!r) return;
  if (r.i >= ROUND) { endRound(); return; }
  r.missed = false;
  r.qid++;
  let q, tries = 0;
  do {
    q = r.mod.gen(r.level, r.i);
    q.key = q.key || [q.prompt, q.eq, q.answer, q.say].join('|');
  } while (r.keys.has(q.key) && ++tries < 15);
  r.keys.add(q.key);
  renderQuestion(r, q);
}

function renderQuestion(r, q) {
  locked = false;
  const qid = r.qid;
  const s = screen('question');
  s.append(h('div', { class: 'progress' }, times(ROUND, (i) =>
    h('span', { class: 'pdot' + (i < r.i ? ' done' : '') + (i === r.i ? ' now' : '') }))));
  const promptText = (!state.voice && q.promptNoVoice) ? q.promptNoVoice : q.prompt;
  const promptEl = h('div', { class: 'prompt-text' }, promptText);
  s.append(h('div', { class: 'bubble' },
    h('button', { class: 'speak-btn', 'aria-label': 'Lees voor', onclick: () => speak(q.say || q.prompt) }, '🔊'),
    promptEl));
  let eqEl = null;
  if (q.eq) {
    const parts = q.eq.split('?');
    eqEl = h('div', { class: 'equation' }, parts[0], parts.length > 1 ? h('span', { class: 'qmark' }, '?') : null, parts[1] || '');
    s.append(eqEl);
  }
  const vis = h('div', { class: 'visual' });
  if (q.visual) vis.append(q.visual);
  const ans = h('div', { class: 'answers' });
  s.append(vis, ans);

  const api = {
    correct: () => markCorrect(r, q, qid, eqEl),
    wrong: (msg) => markWrong(r, msg),
    isLocked: () => locked,
    setPrompt: (text, say) => { promptEl.textContent = text; q.say = say || text; speak(q.say); },
  };
  if (q.custom) q.custom(vis, api, ans);
  if (q.choices) renderChoices(q.choices, q.answer, ans, api);
  speak(q.say || q.prompt);
}

function renderChoices(choices, answer, el, api) {
  el.replaceChildren(...choices.map((c, i) => {
    const b = h('button', { class: 'choice c' + i }, String(c));
    b.addEventListener('click', () => {
      if (locked) return;
      if (c === answer) { b.classList.add('right'); api.correct(); }
      else {
        b.classList.add('wrong');
        b.disabled = true;
        api.wrong(typeof c === 'number' ? `Dat is ${c}. ${pick(OOPS)}` : null);
      }
    });
    return b;
  }));
}

function markCorrect(r, q, qid, eqEl) {
  if (locked || current !== r) return;
  locked = true;
  if (!r.missed) r.firstTry++;
  sfx.good();
  burst();
  const qm = eqEl && eqEl.querySelector('.qmark');
  if (qm && q.answer != null) { qm.textContent = q.answer; qm.classList.add('filled'); }
  speak(pick(PRAISE) + (q.after ? ' ' + q.after : '')).then(() => setTimeout(() => {
    if (current === r && r.qid === qid) { r.i++; nextQuestion(); }
  }, 400));
}

function markWrong(r, msg) {
  if (locked || current !== r) return;
  r.missed = true;
  sfx.bad();
  speak(msg || pick(OOPS));
}

function endRound() {
  const r = current;
  current = null;
  const stars = r.firstTry >= ROUND - 1 ? 3 : r.firstTry >= ROUND - 3 ? 2 : 1;
  const key = r.mod.id + r.level;
  state.best[key] = Math.max(state.best[key] || 0, stars);
  state.stars += stars;
  const left = STICKERS.filter((x) => !state.stickers.includes(x));
  const sticker = left.length ? pick(left) : null;
  if (sticker) state.stickers.push(sticker);
  save();
  setHeader(r.mod.name, true);
  sfx.win();
  burst(); setTimeout(burst, 400);
  const s = screen('end');
  s.append(h('div', { class: 'big-title' }, 'Proficiat! 🎉'));
  s.append(h('div', { class: 'end-stars' }, times(3, (i) =>
    h('span', { class: i < stars ? '' : 'off', style: `animation-delay:${0.2 + i * 0.3}s` }, '⭐'))));
  if (sticker) {
    s.append(h('div', { class: 'sticker-card' },
      h('div', { class: 'st' }, sticker), h('div', null, 'Nieuwe sticker!')));
  }
  const btns = [h('button', { class: 'big-btn again', onclick: () => startRound(r.mod, r.level) }, '🔁 Nog eens')];
  if (r.level < 3) btns.push(h('button', { class: 'big-btn harder', onclick: () => startRound(r.mod, r.level + 1) }, `${LEVELS[r.level].emoji} Moeilijker`));
  btns.push(h('button', { class: 'big-btn home', onclick: showHome }, '🏠 Ander spel'));
  s.append(h('div', { class: 'btn-row' }, btns));
  speak(`Proficiat! Je hebt ${stars} ${stars === 1 ? 'ster' : 'sterren'}!` + (sticker ? ' En een nieuwe sticker!' : ''));
}

function burst() {
  const fx = document.getElementById('fx');
  for (let i = 0; i < 14; i++) {
    const sp = h('span', { class: 'spark', style: `--dx:${rnd(-280, 280)}px;--dy:${rnd(-260, 200)}px;--r:${rnd(-200, 200)}deg` },
      pick(['⭐', '✨', '🌟', '🎉']));
    fx.append(sp);
    setTimeout(() => sp.remove(), 1100);
  }
}

// ---------- vrij spelen ----------
function freeRekenrek() {
  current = null;
  setHeader('Rekenrek 🎨', true);
  const s = screen('free');
  const num = h('div', { class: 'live-num' }, '0');
  let t;
  const rr = Rekenrek({
    rows: 2, onChange: (v) => {
      const n = sum(v);
      num.textContent = v[1] ? `${v[0]} + ${v[1]} = ${n}` : String(n);
      clearTimeout(t);
      t = setTimeout(() => speak(String(n)), 450);
    },
  });
  s.append(h('div', { class: 'bubble' }, h('div', { class: 'prompt-text' }, 'Schuif de kralen. Hoeveel zijn het er?')),
    num, rr,
    h('button', { class: 'big-btn reset', onclick: () => { rr.reset(); num.textContent = '0'; speak('Alles terug.'); } }, '🔄 Alles terug'));
  speak('Speel met het rekenrek. Tik op de kralen.');
}

function freeTelraam() {
  current = null;
  setHeader('Telraam 🎨', true);
  const s = screen('free');
  const num = h('div', { class: 'live-num' }, '0');
  const parts = h('div', { class: 'live-small' }, placeWords(0));
  let t;
  const tr = Telraam({
    places: ['H', 'T', 'E'], maxTotal: 200, onChange: (n, exchanged) => {
      num.textContent = n;
      parts.textContent = placeWords(n);
      clearTimeout(t);
      if (!exchanged) t = setTimeout(() => speak(String(n)), 450);
    },
  });
  s.append(h('div', { class: 'bubble' }, h('div', { class: 'prompt-text' }, 'Maak een getal. Tot 200!')),
    num, parts, tr,
    h('button', { class: 'big-btn reset', onclick: () => { tr.reset(); num.textContent = '0'; parts.textContent = placeWords(0); speak('Alles terug.'); } }, '🔄 Alles terug'));
  speak('Speel met het telraam. Druk op plus en min.');
}

// ---------- stickers ----------
function showAlbum() {
  current = null;
  setHeader('Mijn stickers', true);
  speak(`Je hebt al ${state.stickers.length} stickers!`);
  const s = screen('album-screen');
  s.append(h('div', { class: 'lv-desc' }, `Elke ronde = een nieuwe sticker. ${state.stickers.length} van ${STICKERS.length}.`));
  s.append(h('div', { class: 'album' }, STICKERS.map((st) => state.stickers.includes(st)
    ? h('div', { class: 'slot' }, st)
    : h('div', { class: 'slot empty' }, '?'))));
}

// ---------- ouders ----------
function showSettings() {
  current = null;
  stopSpeech();
  setHeader('Voor ouders', true);
  const s = screen('settings');
  const toggle = (label, prop) => h('div', { class: 'set-row' }, h('span', null, label),
    h('button', {
      class: 'toggle' + (state[prop] ? ' on' : ''),
      onclick: () => { state[prop] = !state[prop]; save(); showSettings(); },
    }, state[prop] ? 'AAN' : 'UIT'));
  pickVoice();
  const voiceInfo = !hasTTS ? 'Dit toestel kan niet voorlezen.'
    : nlVoice ? `Stem gevonden: ${nlVoice.name} (${nlVoice.lang})`
      : 'Geen Nederlandse stem gevonden. Zie uitleg hieronder.';
  let resetArmed = false;
  const resetBtn = h('button', { class: 'small-btn danger' }, '🗑️ Alles wissen');
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) { resetArmed = true; resetBtn.textContent = 'Zeker? Tik nog eens'; return; }
    state.best = {}; state.stars = 0; state.stickers = [];
    save();
    showHome();
  });
  s.append(h('div', { class: 'card' },
    toggle('🗣️ Voorlezen', 'voice'),
    toggle('🔔 Geluidjes', 'sound'),
    h('div', { class: 'set-row' }, h('span', { class: 'muted' }, voiceInfo),
      h('button', { class: 'small-btn', onclick: () => speak('Hallo! Honderdvierendertig. 134.') }, '▶️ Test stem')),
    h('div', { class: 'set-row' }, h('span', null, `⭐ ${state.stars} sterren · 🏅 ${state.stickers.length} stickers`), resetBtn)));
  s.append(h('div', { class: 'card info' },
    h('h3', null, 'Tips'),
    h('ul', null,
      h('li', null, 'Elke ronde heeft 8 vragen. Juist bij de eerste poging = meer sterren.'),
      h('li', null, 'Kleuren zoals op school: H = groen (honderdtal), T = rood (tiental), E = blauw (eenheid).'),
      h('li', null, 'Voorlezen zonder internet: Android Instellingen → Systeem → Talen → Tekst-naar-spraak → Google → Spraakgegevens installeren → Nederlands (België).'),
      h('li', null, 'Alles werkt offline nadat de app één keer geopend is.'))));
}

// ---------- start ----------
$('#homeBtn').addEventListener('click', () => { sfx.tap(); showHome(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
showHome();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
