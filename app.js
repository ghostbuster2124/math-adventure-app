'use strict';
/* =========================================================
   Reken Avontuur / Math Adventure — for children aged 5–6
   Works fully offline (service worker + localStorage).
   Every text exists in Dutch (nl-BE) and English.
   ========================================================= */

// ---------- helpers ----------
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

// ---------- storage ----------
const KEY = 'reken-avontuur';
function loadState() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
const loaded = loadState();
const state = Object.assign({
  best: {}, stars: 0, stickers: [], sound: true,
  display: 'both', // text on screen: 'nl' | 'en' | 'both'
  speech: 'nl',    // read aloud: 'off' | 'nl' | 'en' | 'both'
}, loaded);
if (loaded.voice === false && !loaded.speech) state.speech = 'off'; // older version
delete state.voice;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ok */ }
}

// ---------- languages ----------
const L = (nl, en) => ({ nl, en });
const isL = (x) => x != null && typeof x === 'object' && !(x instanceof Node) && 'nl' in x;
const pv = (x, lang) => (isL(x) ? x[lang] : x == null ? '' : String(x));
// join several texts (bilingual or plain) into one bilingual text
function cat(...ps) {
  const f = (lang) => ps.map((p) => pv(p, lang)).filter(Boolean).join(' ');
  return L(f('nl'), f('en'));
}
// show a text according to the display setting
function tx(x, inline) {
  if (!isL(x)) return x;
  if (state.display === 'nl') return x.nl;
  if (state.display === 'en') return x.en;
  // both: hide a repeated leading emoji on the English line
  const pre = (x.nl.match(/^[^\p{L}\p{N}]+/u) || [''])[0];
  const en = pre.trim() && x.en.startsWith(pre) ? x.en.slice(pre.length) : x.en;
  if (en === x.nl) return x.nl;
  if (inline) return h('span', null, x.nl, h('span', { class: 'bi-en inline' }, ' · ' + en.trim()));
  return h('span', { class: 'bi' }, h('span', { class: 'bi-nl' }, x.nl), h('span', { class: 'bi-en' }, en));
}
// "7 + ? = 10" -> "7 plus hoeveel is 10" / "7 plus what equals 10"
function eqSay(eq) {
  const clean = (s) => s.replace(/\s+/g, ' ').trim();
  return L(
    clean(eq.replace(/\+/g, ' plus ').replace(/−/g, ' min ').replace(/×/g, ' keer ')
      .replace(/:/g, ' gedeeld door ').replace(/=/g, ' is ').replace(/\?/g, ' hoeveel ')),
    clean(eq.replace(/\+/g, ' plus ').replace(/−/g, ' minus ').replace(/×/g, ' times ')
      .replace(/:/g, ' divided by ').replace(/=/g, ' equals ').replace(/\?/g, ' what ')));
}
function placeWords(n) {
  const H = Math.floor(n / 100), T = Math.floor((n % 100) / 10), E = n % 10;
  const join = (parts, and) => (parts.length > 1 ? parts.slice(0, -1).join(', ') + ` ${and} ` + parts[parts.length - 1] : parts[0]);
  const nl = [], en = [];
  if (H) { nl.push(H === 1 ? '1 honderdtal' : `${H} honderdtallen`); en.push(H === 1 ? '1 hundred' : `${H} hundreds`); }
  if (T || H) { nl.push(T === 1 ? '1 tiental' : `${T} tientallen`); en.push(T === 1 ? '1 ten' : `${T} tens`); }
  nl.push(E === 1 ? '1 eenheid' : `${E} eenheden`);
  en.push(E === 1 ? '1 one' : `${E} ones`);
  return L(join(nl, 'en'), join(en, 'and'));
}

// 3 answer buttons: the right answer + "clever" wrong answers close to it
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
// 34 -> 43, 134 -> 143 (Dutch says the ones first: "vierendertig")
function swapDigits(n) {
  if (n < 10) return null;
  const s = String(n);
  const t = s[s.length - 2], e = s[s.length - 1];
  if (t === e) return null;
  return Number(s.slice(0, -2) + e + t);
}

// ---------- reading aloud ----------
const hasTTS = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
const voices = { nl: null, en: null };
function pickVoice() {
  if (!hasTTS) return;
  const vs = speechSynthesis.getVoices();
  voices.nl = vs.find((v) => /^nl[-_]BE/i.test(v.lang)) || vs.find((v) => /^nl/i.test(v.lang)) || null;
  voices.en = vs.find((v) => /^en[-_]GB/i.test(v.lang)) || vs.find((v) => /^en[-_]US/i.test(v.lang))
    || vs.find((v) => /^en/i.test(v.lang)) || null;
}
if (hasTTS) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
const voiceOn = () => hasTTS && state.speech !== 'off';
function speak(text, only) {
  return new Promise((resolve) => {
    const t = isL(text) ? text : L(String(text == null ? '' : text), String(text == null ? '' : text));
    const parts = [];
    if (only && hasTTS) parts.push([only, t[only]]);
    else if (voiceOn()) {
      if (state.speech !== 'en' && t.nl) parts.push(['nl', t.nl]);
      if (state.speech !== 'nl' && t.en) parts.push(['en', t.en]);
    }
    if (!parts.length) { setTimeout(resolve, 1100); return; }
    const est = Math.min(14000, 900 + sum(parts.map((p) => p[1].length)) * 70);
    let finished = false;
    const done = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
    const timer = setTimeout(done, est + 1500);
    try {
      speechSynthesis.cancel();
      parts.forEach(([lang, s], i) => {
        const u = new SpeechSynthesisUtterance(s);
        const v = voices[lang];
        u.lang = v ? v.lang : (lang === 'nl' ? 'nl-BE' : 'en-GB');
        if (v) u.voice = v;
        u.rate = 0.9;
        u.pitch = 1.1;
        if (i === parts.length - 1) { u.onend = done; u.onerror = done; }
        speechSynthesis.speak(u);
      });
    } catch (e) { done(); }
  });
}
function stopSpeech() {
  if (hasTTS) { try { speechSynthesis.cancel(); } catch (e) { /* ok */ } }
}

// ---------- sound effects (no files needed) ----------
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

// ---------- content ----------
const THINGS = [
  ['🍎', L('appels', 'apples')], ['🍓', L('aardbeien', 'strawberries')], ['🍌', L('bananen', 'bananas')],
  ['🥕', L('wortels', 'carrots')], ['🍪', L('koekjes', 'cookies')], ['🐟', L('visjes', 'fish')],
  ['⭐', L('sterren', 'stars')], ['🎈', L('ballonnen', 'balloons')], ['🌻', L('bloemen', 'flowers')],
  ['🚗', L('autootjes', 'cars')], ['🦆', L('eendjes', 'ducks')], ['🍩', L('donuts', 'donuts')],
  ['🐞', L('lieveheersbeestjes', 'ladybirds')], ['⚽', L('ballen', 'balls')], ['🧁', L('cupcakes', 'cupcakes')],
  ['🐣', L('kuikentjes', 'chicks')], ['🍒', L('kersen', 'cherries')], ['🦋', L('vlinders', 'butterflies')],
];
const FOODS = [
  ['🍪', L('koekjes', 'cookies')], ['🍎', L('appels', 'apples')], ['🍓', L('aardbeien', 'strawberries')],
  ['🍌', L('bananen', 'bananas')], ['🥕', L('wortels', 'carrots')], ['🍩', L('donuts', 'donuts')],
  ['🧁', L('cupcakes', 'cupcakes')], ['🍒', L('kersen', 'cherries')],
];
const ANIMALS = ['🐻', '🐰', '🐵', '🦊', '🐱', '🐶', '🐼', '🐸', '🐷', '🐯', '🐨', '🦁'];
const STICKERS = ['🦁', '🐯', '🐼', '🐨', '🦒', '🦓', '🐘', '🦛', '🦘', '🐧', '🦉', '🦜', '🐢', '🐙', '🦀', '🐬',
  '🐳', '🦄', '🐲', '🦖', '🐝', '🦋', '🐞', '🐌', '🦔', '🦦', '🐿️', '🦩', '🐊', '🦭', '🐺', '🦚'];
const PRAISE = [L('Goed zo!', 'Well done!'), L('Super!', 'Super!'), L('Knap!', 'Clever!'), L('Straf!', 'Awesome!'),
  L('Heel goed!', 'Very good!'), L('Joepie!', 'Hooray!'), L('Prima!', 'Great!'), L('Bravo!', 'Bravo!'),
  L('Fantastisch!', 'Fantastic!')];
const OOPS = [L('Probeer nog eens.', 'Try again.'), L('Bijna! Nog een keer.', 'Almost! One more time.'),
  L('Kijk nog eens goed.', 'Look again carefully.'), L('Hmm, nog eens proberen.', 'Hmm, try again.')];
const LEVELS = [
  { emoji: '🐣', name: L('Makkelijk', 'Easy') },
  { emoji: '🐥', name: L('Gewoon', 'Normal') },
  { emoji: '🦁', name: L('Moeilijk', 'Hard') },
];
const ROUND = 8; // questions per round

// ---------- visual building blocks ----------
// objects in rows of 5 (easier to count)
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
// ten frames with dots
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
// base-ten blocks: H green, T red, E blue (Flemish colour code)
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

// Rekenrek (bead rack): rows of 10 beads (5 red, 5 white). Tap a bead to slide it.
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

// Telraam (abacus) with H, T, E rods. 10 beads are exchanged automatically.
const PLACE_VALUE = { H: 100, T: 10, E: 1 };
const UP = { E: 'T', T: 'H' };
const placeLabel = (p) => (p === 'E' && state.display === 'en' ? 'O' : p); // English: Hundreds, Tens, Ones
function Telraam({ places = ['T', 'E'], values = {}, interactive = true, maxTotal = 200, onChange } = {}) {
  const vals = Object.assign({ H: 0, T: 0, E: 0 }, values);
  const el = h('div', { class: 'telraam' });
  const rods = {};
  const total = () => vals.H * 100 + vals.T * 10 + vals.E;
  for (const p of places) {
    rods[p] = h('div', { class: 'tr-rod' });
    const col = h('div', { class: 'tr-col' }, rods[p], h('div', { class: 'tr-label ' + p }, placeLabel(p)));
    if (interactive) {
      col.append(h('div', { class: 'tr-btns' },
        h('button', { class: 'tr-btn plus', 'aria-label': '+', onclick: () => add(p, 1) }, '+'),
        h('button', { class: 'tr-btn min', 'aria-label': '−', onclick: () => add(p, -1) }, '−')));
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
      if (total() + PLACE_VALUE[p] > maxTotal) { sfx.bad(); speak(L('Hoger gaat niet.', 'It can not go higher.')); return; }
      const wasFull = vals[p] === 9;
      if (!inc(p)) { sfx.bad(); speak(L('Er passen maar 9 kralen op een staaf.', 'Only 9 beads fit on a rod.')); return; }
      if (wasFull) {
        exchanged = true;
        sfx.good();
        speak(p === 'E' ? L('10 eenheden worden 1 tiental!', '10 ones become 1 ten!')
          : L('10 tientallen worden 1 honderdtal!', '10 tens become 1 hundred!'));
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
  return h('button', { class: 'check-btn', onclick }, tx(L('✔ Klaar', '✔ Done'), true));
}
const hearPrompt = (n) => ({
  prompt: L('👂 Welk getal hoor je?', '👂 Which number do you hear?'),
  promptNoVoice: L(`Tik op ${n}.`, `Tap ${n}.`),
  say: L(`Tik op het getal ${n}.`, `Tap the number ${n}.`),
  after: L(`Dat is ${n}.`, `That is ${n}.`),
});

// ---------- question generators ----------
function genTellen(level) {
  const max = [5, 10, 20][level - 1], min = [1, 3, 8][level - 1];
  const [e, name] = pick(THINGS);
  const n = rnd(min, max);
  if (Math.random() < 0.25) {
    return { ...hearPrompt(n), choices: numChoices(n, { min: 1, max: max + 3, near: [swapDigits(n), n + 1, n - 1] }), answer: n };
  }
  return {
    prompt: L(`Hoeveel ${name.nl} zie je?`, `How many ${name.en} do you see?`), visual: objects(n, e, { small: n > 10 }),
    choices: numChoices(n, { min: 1, max: max + 2, spread: 2 }), answer: n,
    after: L(`Het zijn er ${n}.`, `There are ${n}.`),
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
      return { ...hearPrompt(n), choices: numChoices(n, { min: 0, max, near: [swapDigits(n), n + 1, n - 1, n + 10, n - 10] }), answer: n };
    case 'blokken': {
      const m = level === 1 ? rnd(10, 20) : n;
      const w = placeWords(m);
      return {
        prompt: L('Welk getal is dit?', 'What number is this?'),
        say: L('Welk getal zie je hier? Tel de staven en de blokjes.', 'What number do you see? Count the rods and the cubes.'),
        visual: base10(m),
        choices: numChoices(m, { min: 0, max, near: [swapDigits(m), m + 10, m - 10, m + 1, m - 1] }),
        answer: m, after: L(`Het is ${m}: ${w.nl}.`, `It is ${m}: ${w.en}.`),
      };
    }
    case 'tussen': {
      const m = Math.max(1, Math.min(max - 1, n));
      return {
        prompt: L('Welk getal ontbreekt?', 'Which number is missing?'),
        say: L(`Welk getal komt tussen ${m - 1} en ${m + 1}?`, `Which number comes between ${m - 1} and ${m + 1}?`),
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
        prompt: smallest ? L('Welk getal is het kleinst?', 'Which number is the smallest?')
          : L('Welk getal is het grootst?', 'Which number is the biggest?'),
        choices: shuffle([a, b]), answer: ans,
        after: smallest ? L(`${ans} is kleiner.`, `${ans} is smaller.`) : L(`${ans} is groter.`, `${ans} is bigger.`),
      };
    }
    default: { // count on in jumps
      const step = level === 2 ? pick([10, 10, 5, 2]) : pick([10, 10, 1, 5]);
      let s;
      if (step === 1) s = rnd(95, 195);
      else if (level === 2) s = step * rnd(0, Math.floor(max / step) - 4);
      else s = step * rnd(Math.ceil(70 / step), Math.floor(200 / step) - 3);
      const seq = [s, s + step, s + 2 * step];
      const ans = s + 3 * step;
      const list = seq.join(', ');
      return {
        prompt: L('Tel verder!', 'Keep counting!'),
        say: L(`Tel verder: ${list}. Wat komt er dan?`, `Keep counting: ${list}. What comes next?`),
        visual: numRow([...seq, '?']),
        choices: numChoices(ans, { min: 0, max, near: [ans + step, ans - step, ans + 1, ans + 10, swapDigits(ans)] }),
        answer: ans, after: L(`${list}, ${ans}. Sprongen van ${step}.`, `${list}, ${ans}. Jumps of ${step}.`),
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
    prompt: level < 3 ? L(`Hoeveel ${name.nl} samen?`, `How many ${name.en} altogether?`)
      : L('Hoeveel bolletjes samen?', 'How many dots altogether?'),
    eq: `${a} + ${b} = ?`,
    say: L(`${a} plus ${b}. Hoeveel is dat samen?`, `${a} plus ${b}. How many altogether?`), visual,
    choices: numChoices(s, { min: 0, max: 20, near: [s + 1, s - 1, s + 2] }), answer: s,
    after: L(`${a} plus ${b} is ${s}.`, `${a} plus ${b} equals ${s}.`),
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
    prompt: L('Hoeveel blijven er over?', 'How many are left?'), eq: `${a} − ${b} = ?`,
    say: level < 3
      ? L(`Er zijn ${a} ${name.nl}. Er gaan er ${b} weg. ${a} min ${b}. Hoeveel blijven er over?`,
        `There are ${a} ${name.en}. ${b} go away. ${a} minus ${b}. How many are left?`)
      : L(`${a} min ${b}. Hoeveel blijven er over?`, `${a} minus ${b}. How many are left?`),
    visual, choices: numChoices(d, { min: 0, max: 20, near: [d + 1, d - 1, a + b > 20 ? d + 2 : a + b] }),
    answer: d, after: L(`${a} min ${b} is ${d}.`, `${a} minus ${b} equals ${d}.`),
  };
}

function genKeer(level) {
  let n, k;
  if (level === 1) { n = pick([2, 2, 3]); k = rnd(1, 4); }
  else if (level === 2) { n = pick([2, 5, 10]); k = rnd(1, 5); }
  else { n = pick([2, 3, 4, 5, 10]); k = rnd(2, n === 10 ? 5 : 6); }
  const p = n * k;
  const [e] = pick(THINGS);
  const g = L(k === 1 ? 'groepje' : 'groepjes', k === 1 ? 'group' : 'groups');
  return {
    prompt: L(`${k} ${g.nl} van ${n}. Hoeveel samen?`, `${k} ${g.en} of ${n}. How many altogether?`),
    eq: `${k} × ${n} = ?`,
    say: L(`${k} ${g.nl} van ${n}. ${k} keer ${n}. Hoeveel zijn het er samen?`,
      `${k} ${g.en} of ${n}. ${k} times ${n}. How many altogether?`),
    visual: groupsVis(k, n, e),
    choices: numChoices(p, { min: 0, max: 100, near: [p + n, p - n, p + 1, p - 1, k + n] }), answer: p,
    after: L(`${k} keer ${n} is ${p}.`, `${k} times ${n} equals ${p}.`),
  };
}

function genDelen(level) {
  const k = level === 1 ? 2 : level === 2 ? pick([2, 3]) : rnd(2, 5);
  const per = level === 1 ? rnd(1, 3) : level === 2 ? rnd(1, 4) : rnd(2, Math.min(5, Math.floor(20 / k)));
  const total = k * per;
  const [e, name] = pick(FOODS);
  const animals = shuffle(ANIMALS).slice(0, k);
  return {
    key: `d${total}:${k}`, eq: `${total} : ${k} = ?`, answer: per,
    prompt: L(`Verdeel ${total} ${name.nl} eerlijk.`, `Share ${total} ${name.en} fairly.`),
    say: L(`Verdeel ${total} ${name.nl} eerlijk over ${k} dieren. Tik op een dier om het iets te geven.`,
      `Share ${total} ${name.en} fairly between ${k} animals. Tap an animal to give it one.`),
    after: L(`${total} gedeeld door ${k} is ${per}. Iedereen krijgt ${per}.`,
      `${total} divided by ${k} equals ${per}. Everyone gets ${per}.`),
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
      const again = h('button', {
        class: 'big-btn reset', onclick: () => {
          if (phase !== 1) return;
          pile = total; plates.fill(0); sfx.tap(); draw();
        },
      }, tx(L('🔄 Opnieuw', '🔄 Start over'), true));
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
          api.setPrompt(L('Hoeveel krijgt elk dier?', 'How many does each animal get?'),
            L(`Eerlijk verdeeld! Hoeveel ${name.nl} krijgt elk dier?`, `Fair share! How many ${name.en} does each animal get?`));
          renderChoices(numChoices(per, { min: 1, max: Math.max(6, per + 3), near: [per + 1, per - 1, k] }), per, ans, api);
        } else {
          api.wrong(L('Oei, dat is niet eerlijk! Iedereen moet evenveel krijgen. Tik op opnieuw en probeer nog eens.',
            'Oops, that is not fair! Everyone must get the same amount. Tap start over and try again.'));
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
      key: 'maak' + n,
      prompt: L(`Maak ${n} op het rekenrek.`, `Make ${n} on the bead rack.`),
      say: L(`Maak ${n}. Tik op de kralen om ze naar links te schuiven. Tik dan op klaar.`,
        `Make ${n}. Tap the beads to slide them to the left. Then tap done.`),
      after: L(`Je maakte ${n}.`, `You made ${n}.`),
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
          else api.wrong(L(`Je hebt er ${got}. We zoeken ${n}.`, `You have ${got}. We need ${n}.`));
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
      prompt: L('Hoeveel kralen staan er links?', 'How many beads are on the left?'),
      say: L('Hoeveel kralen zijn er naar links geschoven?', 'How many beads have been slid to the left?'),
      visual: Rekenrek({ rows, values: rows === 1 ? [a] : [a, b], interactive: false }),
      choices: numChoices(n, { min: 1, max: 20, near: [n + 1, n - 1, n + 5, n - 5] }), answer: n,
      after: rows > 1 && b > 0 ? L(`${a} plus ${b} is ${n}.`, `${a} plus ${b} equals ${n}.`)
        : L(`Het zijn er ${n}.`, `There are ${n}.`),
    };
  }
  const a = rnd(4, 10), b = rnd(3, 10), n = a + b;
  return {
    prompt: L('Hoeveel kralen samen?', 'How many beads altogether?'), eq: `${a} + ${b} = ?`,
    say: L(`Bovenaan ${a}, onderaan ${b}. ${a} plus ${b}. Hoeveel is dat samen?`,
      `${a} on top, ${b} below. ${a} plus ${b}. How many altogether?`),
    visual: Rekenrek({ rows: 2, values: [a, b], interactive: false }),
    choices: numChoices(n, { min: 1, max: 20, near: [n + 1, n - 1, n + 10, n - 10] }), answer: n,
    after: L(`${a} plus ${b} is ${n}.`, `${a} plus ${b} equals ${n}.`),
  };
}

function genTelraam(level) {
  const places = level === 3 ? ['H', 'T', 'E'] : ['T', 'E'];
  const maxTotal = level === 3 ? 200 : 99;
  const n = level === 1 ? rnd(10, 20) : level === 2 ? rnd(21, 99) : rnd(100, 200);
  const w = placeWords(n);
  const after = L(`${n} is ${w.nl}.`, `${n} is ${w.en}.`);
  if (Math.random() < 0.5) {
    return {
      key: 'm' + n, after,
      prompt: L(`Maak ${n} op het telraam.`, `Make ${n} on the abacus.`),
      say: L(`Maak ${n} op het telraam. Hoeveel ${level === 3 ? 'honderdtallen, ' : ''}tientallen en eenheden heb je nodig?`,
        `Make ${n} on the abacus. How many ${level === 3 ? 'hundreds, ' : ''}tens and ones do you need?`),
      custom(vis, api, ans) {
        const tr = Telraam({ places, maxTotal });
        vis.append(tr);
        ans.append(checkBtn(() => {
          if (api.isLocked()) return;
          const got = tr.getValue();
          if (got === n) api.correct();
          else api.wrong(L(`Dat is ${got}. We zoeken ${n}.`, `That is ${got}. We need ${n}.`));
        }));
      },
    };
  }
  const vals = { H: Math.floor(n / 100), T: Math.floor((n % 100) / 10), E: n % 10 };
  return {
    prompt: L('Welk getal staat op het telraam?', 'What number is on the abacus?'),
    say: L('Welk getal staat op het telraam? Kijk goed naar de kleuren.', 'What number is on the abacus? Look carefully at the colours.'),
    visual: Telraam({ places, values: vals, interactive: false }),
    choices: numChoices(n, { min: 0, max: maxTotal, near: [swapDigits(n), n + 10, n - 10, n + 1, n - 1] }),
    answer: n, after,
  };
}

function mental(eq, ans, opts = {}) {
  const q = eqSay(eq), done = eqSay(eq.replace('?', ans));
  return {
    prompt: opts.prompt || L('🧠 Reken in je hoofd!', '🧠 Work it out in your head!'), eq,
    say: opts.say || L(q.nl + '?', q.en + '?'),
    choices: numChoices(ans, { min: 0, max: opts.max || 200, near: opts.near || [ans + 1, ans - 1, ans + 2, ans - 2] }),
    answer: ans, after: opts.after || L(done.nl + '.', done.en + '.'), visual: opts.visual || null,
  };
}
function genHoofd(level) {
  if (level === 1) {
    const t = pick(['harten', 'harten', 'dubbel', 'plus', 'min']);
    if (t === 'harten') {
      const a = rnd(1, 9);
      return mental(`${a} + ? = 10`, 10 - a, {
        prompt: L('❤️ Verliefde harten: samen 10!', '❤️ Love hearts: make 10!'),
        say: L(`Verliefde harten! ${a} plus hoeveel is 10?`, `Love hearts! ${a} plus what makes 10?`),
        after: L(`${a} en ${10 - a} zijn verliefde harten. Samen 10.`, `${a} and ${10 - a} are love hearts. Together they make 10.`),
        max: 10, near: [11 - a, 9 - a, a],
        visual: tenFrames(times(a, () => ({ c: 'a' }))),
      });
    }
    if (t === 'dubbel') { const a = rnd(1, 5); return mental(`${a} + ${a} = ?`, 2 * a, { prompt: L('👯 Dubbel!', '👯 Double!'), max: 10 }); }
    if (t === 'plus') { const a = rnd(1, 8), b = rnd(1, 10 - a); return mental(`${a} + ${b} = ?`, a + b, { max: 10 }); }
    const a = rnd(3, 10), b = rnd(1, a - 1);
    return mental(`${a} − ${b} = ?`, a - b, { max: 10 });
  }
  if (level === 2) {
    const t = pick(['plus', 'min', 'dubbel', 'helft', 'harten']);
    if (t === 'plus') { const a = rnd(3, 9), b = rnd(11 - a, Math.min(9, 20 - a)); return mental(`${a} + ${b} = ?`, a + b, { max: 20 }); }
    if (t === 'min') { const a = rnd(11, 18), b = rnd(a - 9, 9); return mental(`${a} − ${b} = ?`, a - b, { max: 20 }); }
    if (t === 'dubbel') { const a = rnd(3, 10); return mental(`${a} + ${a} = ?`, 2 * a, { prompt: L('👯 Dubbel!', '👯 Double!'), max: 20 }); }
    if (t === 'helft') {
      const x = 2 * rnd(2, 10);
      return mental(`${x} : 2 = ?`, x / 2, {
        prompt: L('✂️ De helft!', '✂️ Half!'), max: 20,
        say: L(`Wat is de helft van ${x}?`, `What is half of ${x}?`),
        after: L(`De helft van ${x} is ${x / 2}.`, `Half of ${x} is ${x / 2}.`),
      });
    }
    const a = rnd(1, 9);
    return mental(`${a} + ? = 10`, 10 - a, {
      prompt: L('❤️ Verliefde harten!', '❤️ Love hearts!'), max: 10, near: [11 - a, 9 - a, a],
      say: L(`${a} plus hoeveel is 10?`, `${a} plus what makes 10?`),
    });
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

// ---------- games ----------
const MODULES = [
  { id: 'tellen', name: L('Tellen', 'Counting'), icon: '🐞', color: '#ff8a65', gen: genTellen,
    desc: L('Tel de dingen en tik op het juiste getal.', 'Count the things and tap the right number.'),
    levels: [L('tot 5', 'up to 5'), L('tot 10', 'up to 10'), L('tot 20', 'up to 20')] },
  { id: 'getallen', name: L('Getallen', 'Numbers'), icon: '💯', color: '#ba68c8', gen: genGetallen,
    desc: L('Getallen herkennen, vergelijken en verder tellen.', 'Recognise, compare and count on with numbers.'),
    levels: [L('tot 20', 'up to 20'), L('tot 100', 'up to 100'), L('tot 200', 'up to 200')] },
  { id: 'plus', name: L('Plus', 'Plus'), icon: '➕', color: '#66bb6a', gen: genPlus,
    desc: L('Samen doen: hoeveel zijn het er samen?', 'Putting together: how many altogether?'),
    levels: [L('tot 5', 'up to 5'), L('tot 10', 'up to 10'), L('tot 20', 'up to 20')] },
  { id: 'min', name: L('Min', 'Minus'), icon: '➖', color: '#f06292', gen: genMin,
    desc: L('Weg doen: hoeveel blijven er over?', 'Taking away: how many are left?'),
    levels: [L('tot 5', 'up to 5'), L('tot 10', 'up to 10'), L('tot 20', 'up to 20')] },
  { id: 'keer', name: L('Keer', 'Times'), icon: '✖️', color: '#ffa000', gen: genKeer,
    say: L('Keer. Groepjes maken', 'Times. Making groups'),
    desc: L('Groepjes maken: 3 groepjes van 2.', 'Making groups: 3 groups of 2.'),
    levels: [L('groepjes van 2 en 3', 'groups of 2 and 3'), L('tafels van 2, 5 en 10', 'tables of 2, 5 and 10'), L('groepjes tot 10', 'groups up to 10')] },
  { id: 'delen', name: L('Delen', 'Sharing'), icon: '➗', color: '#29b6f6', gen: genDelen,
    say: L('Delen. Eerlijk verdelen', 'Sharing. Dividing fairly'),
    desc: L('Eerlijk verdelen: iedereen krijgt evenveel.', 'Share fairly: everyone gets the same.'),
    levels: [L('over 2 dieren', 'between 2 animals'), L('over 2 of 3', 'between 2 or 3'), L('over 2 tot 5', 'between 2 to 5')] },
  { id: 'rekenrek', name: L('Rekenrek', 'Bead rack'), iconNode: miniRekenrek, color: '#e57373', gen: genRekenrek, free: () => freeRekenrek(),
    desc: L('Schuif de kralen. Rood en wit: 5 en 5.', 'Slide the beads. Red and white: 5 and 5.'),
    levels: [L('tot 10', 'up to 10'), L('tot 20', 'up to 20'), L('plus tot 20', 'plus up to 20')] },
  { id: 'telraam', name: L('Telraam', 'Abacus'), icon: '🧮', color: '#7986cb', gen: genTelraam, free: () => freeTelraam(),
    desc: L('Honderdtallen, tientallen en eenheden.', 'Hundreds, tens and ones.'),
    levels: [L('tot 20', 'up to 20'), L('tot 100', 'up to 100'), L('tot 200', 'up to 200')] },
  { id: 'hoofd', name: L('Hoofdrekenen', 'Mental maths'), icon: '🧠', color: '#26a69a', gen: genHoofd,
    desc: L('Snel rekenen in je hoofd, zonder prentjes.', 'Quick sums in your head, without pictures.'),
    levels: [L('verliefde harten', 'love hearts (make 10)'), L('tot 20', 'up to 20'), L('tientallen tot 200', 'tens up to 200')] },
];

// ---------- screens ----------
const app = document.getElementById('app');
let current = null; // the round being played
let locked = false; // question already answered correctly
let redraw = null;  // redraws the current screen (after a language change)

function screen(cls) {
  app.replaceChildren();
  const s = h('div', { class: 'screen ' + cls });
  app.append(s);
  app.scrollTop = 0;
  return s;
}
function setHeader(title, showHome, suffix) {
  $('#title').replaceChildren(tx(title), suffix ? ' ' + suffix : '');
  $('#homeBtn').hidden = !showHome;
  $('#starCount').textContent = state.stars;
  $('#langBtn').textContent = { both: '🇧🇪 🇬🇧', nl: '🇧🇪 NL', en: '🇬🇧 EN' }[state.display];
}
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function showHome() {
  current = null;
  redraw = showHome;
  stopSpeech();
  setHeader(L('Reken Avontuur', 'Math Adventure'), false);
  const s = screen('home');
  s.append(h('div', { class: 'hello' },
    h('span', { class: 'mascot', onclick: () => speak(L('Hallo! Ik ben Uil. Kies een spel!', 'Hello! I am Owl. Pick a game!')) }, '🦉'),
    h('div', { class: 'hello-text' }, tx(L('Hallo! Kies een spel.', 'Hello! Pick a game.')))));
  s.append(h('div', { class: 'tiles' }, MODULES.map((m) => {
    const earned = sum([1, 2, 3].map((l) => state.best[m.id + l] || 0));
    return h('button', { class: 'tile', style: `--c:${m.color}`, onclick: () => { sfx.tap(); showLevels(m); } },
      h('div', { class: 'tile-icon' }, m.iconNode ? m.iconNode() : m.icon),
      h('div', { class: 'tile-name' }, tx(m.name)),
      h('div', { class: 'tile-stars' }, `⭐ ${earned} / 9`));
  })));
  s.append(h('div', { class: 'home-bottom' },
    h('button', { class: 'small-btn', onclick: showAlbum }, `🏅 Stickers (${state.stickers.length})`),
    h('button', { class: 'small-btn', onclick: showSettings }, tx(L('⚙️ Ouders', '⚙️ Parents')))));
}

function showLevels(m, quiet) {
  current = null;
  redraw = () => showLevels(m, true);
  setHeader(m.name, true);
  const s0 = m.say || m.name;
  if (!quiet) speak(L(`${s0.nl}. Kies hoe moeilijk.`, `${s0.en}. Choose how hard.`));
  const s = screen('levels');
  s.append(h('div', { class: 'lv-head' },
    h('div', { class: 'lv-icon' }, m.iconNode ? m.iconNode() : m.icon),
    h('div', { class: 'lv-desc' }, tx(m.desc))));
  s.append(h('div', { class: 'lv-row' }, LEVELS.map((lv, i) =>
    h('button', { class: 'lv-btn lv' + (i + 1), onclick: () => { sfx.tap(); startRound(m, i + 1); } },
      h('div', { class: 'lv-emoji' }, lv.emoji),
      h('div', { class: 'lv-name' }, tx(lv.name)),
      h('div', { class: 'lv-sub' }, tx(m.levels[i])),
      h('div', { class: 'lv-stars' }, starStr(state.best[m.id + (i + 1)] || 0))))));
  if (m.free) s.append(h('button', { class: 'free-btn', onclick: () => { sfx.tap(); m.free(); } }, tx(L('🎨 Vrij spelen', '🎨 Free play'))));
}

function startRound(mod, level) {
  current = { mod, level, i: 0, qid: 0, firstTry: 0, missed: false, keys: new Set() };
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
    q.key = q.key || JSON.stringify([q.prompt, q.eq, q.answer, q.say]);
  } while (r.keys.has(q.key) && ++tries < 15);
  r.keys.add(q.key);
  renderQuestion(r, q);
}

function renderQuestion(r, q) {
  locked = false;
  redraw = () => renderQuestion(r, q);
  if (q.say0 === undefined) q.say0 = q.say || null; else q.say = q.say0 || undefined;
  setHeader(r.mod.name, true, LEVELS[r.level - 1].emoji);
  const qid = r.qid;
  const s = screen('question');
  s.append(h('div', { class: 'progress' }, times(ROUND, (i) =>
    h('span', { class: 'pdot' + (i < r.i ? ' done' : '') + (i === r.i ? ' now' : '') }))));
  const promptEl = h('div', { class: 'prompt-text' }, tx((!voiceOn() && q.promptNoVoice) ? q.promptNoVoice : q.prompt));
  s.append(h('div', { class: 'bubble' },
    h('button', { class: 'speak-btn', 'aria-label': '🔊', onclick: () => speak(q.say || q.prompt) }, '🔊'),
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
    setPrompt: (text, say) => { promptEl.replaceChildren(tx(text)); q.say = say || text; speak(q.say); },
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
        api.wrong(typeof c === 'number' ? cat(L(`Dat is ${c}.`, `That is ${c}.`), pick(OOPS)) : null);
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
  speak(cat(pick(PRAISE), q.after)).then(() => setTimeout(() => {
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
  sfx.win();
  burst(); setTimeout(burst, 400);
  showEnd(r, stars, sticker);
  const st = L(stars === 1 ? 'ster' : 'sterren', stars === 1 ? 'star' : 'stars');
  speak(L(`Proficiat! Je hebt ${stars} ${st.nl}!` + (sticker ? ' En een nieuwe sticker!' : ''),
    `Well done! You got ${stars} ${st.en}!` + (sticker ? ' And a new sticker!' : '')));
}
function showEnd(r, stars, sticker) {
  redraw = () => showEnd(r, stars, sticker);
  setHeader(r.mod.name, true);
  const s = screen('end');
  s.append(h('div', { class: 'big-title' }, tx(L('Proficiat! 🎉', 'Well done! 🎉'))));
  s.append(h('div', { class: 'end-stars' }, times(3, (i) =>
    h('span', { class: i < stars ? '' : 'off', style: `animation-delay:${0.2 + i * 0.3}s` }, '⭐'))));
  if (sticker) {
    s.append(h('div', { class: 'sticker-card' },
      h('div', { class: 'st' }, sticker), h('div', null, tx(L('Nieuwe sticker!', 'New sticker!')))));
  }
  const btns = [h('button', { class: 'big-btn again', onclick: () => startRound(r.mod, r.level) }, tx(L('🔁 Nog eens', '🔁 Again')))];
  if (r.level < 3) {
    const e = LEVELS[r.level].emoji;
    btns.push(h('button', { class: 'big-btn harder', onclick: () => startRound(r.mod, r.level + 1) }, tx(L(`${e} Moeilijker`, `${e} Harder`))));
  }
  btns.push(h('button', { class: 'big-btn home', onclick: showHome }, tx(L('🏠 Ander spel', '🏠 Other game'))));
  s.append(h('div', { class: 'btn-row' }, btns));
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

// ---------- free play ----------
function freeRekenrek(quiet) {
  current = null;
  redraw = () => freeRekenrek(true);
  setHeader(L('Rekenrek 🎨', 'Bead rack 🎨'), true);
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
  s.append(h('div', { class: 'bubble' }, h('div', { class: 'prompt-text' }, tx(L('Schuif de kralen. Hoeveel zijn het er?', 'Slide the beads. How many are there?')))),
    num, rr,
    h('button', { class: 'big-btn reset', onclick: () => { rr.reset(); num.textContent = '0'; speak(L('Alles terug.', 'All back.')); } },
      tx(L('🔄 Alles terug', '🔄 Reset'))));
  if (!quiet) speak(L('Speel met het rekenrek. Tik op de kralen.', 'Play with the bead rack. Tap the beads.'));
}

function freeTelraam(quiet) {
  current = null;
  redraw = () => freeTelraam(true);
  setHeader(L('Telraam 🎨', 'Abacus 🎨'), true);
  const s = screen('free');
  const num = h('div', { class: 'live-num' }, '0');
  const parts = h('div', { class: 'live-small' }, tx(placeWords(0)));
  let t;
  const tr = Telraam({
    places: ['H', 'T', 'E'], maxTotal: 200, onChange: (n, exchanged) => {
      num.textContent = n;
      parts.replaceChildren(tx(placeWords(n)));
      clearTimeout(t);
      if (!exchanged) t = setTimeout(() => speak(String(n)), 450);
    },
  });
  s.append(h('div', { class: 'bubble' }, h('div', { class: 'prompt-text' }, tx(L('Maak een getal. Tot 200!', 'Make a number. Up to 200!')))),
    num, parts, tr,
    h('button', {
      class: 'big-btn reset',
      onclick: () => { tr.reset(); num.textContent = '0'; parts.replaceChildren(tx(placeWords(0))); speak(L('Alles terug.', 'All back.')); },
    }, tx(L('🔄 Alles terug', '🔄 Reset'))));
  if (!quiet) speak(L('Speel met het telraam. Druk op plus en min.', 'Play with the abacus. Press plus and minus.'));
}

// ---------- stickers ----------
function showAlbum(quiet) {
  current = null;
  redraw = () => showAlbum(true);
  const n = state.stickers.length;
  setHeader(L('Mijn stickers', 'My stickers'), true);
  if (quiet !== true) speak(L(`Je hebt al ${n} stickers!`, `You already have ${n} stickers!`));
  const s = screen('album-screen');
  s.append(h('div', { class: 'lv-desc' }, tx(L(`Elke ronde = een nieuwe sticker. ${n} van ${STICKERS.length}.`,
    `Every round = a new sticker. ${n} of ${STICKERS.length}.`))));
  s.append(h('div', { class: 'album' }, STICKERS.map((st) => state.stickers.includes(st)
    ? h('div', { class: 'slot' }, st)
    : h('div', { class: 'slot empty' }, '?'))));
}

// ---------- parents ----------
const GLOSSARY = [
  ['tellen', 'counting'],
  ['het getal', 'the number'],
  ['plus · erbij', 'plus · add'],
  ['min · eraf', 'minus · take away'],
  ['keer (×)', 'times (×)'],
  ['gedeeld door ( : )', 'divided by (÷) — Belgian schools write  :'],
  ['is', 'equals'],
  ['samen', 'altogether'],
  ['blijven er over', 'are left'],
  ['eerlijk verdelen · evenveel', 'share fairly · the same amount'],
  ['een groepje van 3', 'a group of 3'],
  ['meer · minder', 'more · less'],
  ['groter · kleiner', 'bigger · smaller'],
  ['het grootst · het kleinst', 'the biggest · the smallest'],
  ['ervoor · erna · ertussen', 'before · after · in between'],
  ['tel verder', 'keep counting / count on'],
  ['sprongen van 10', 'jumps of 10 (counting in tens)'],
  ['eenheid (E) – blauw', 'one / unit (O) – blue'],
  ['tiental (T) – rood', 'ten (T) – red'],
  ['honderdtal (H) – groen', 'hundred (H) – green'],
  ['het rekenrek', 'bead rack (20 beads: 5 red, 5 white per row)'],
  ['het telraam', 'abacus'],
  ['het tienkader', 'ten frame'],
  ['verliefde harten', '"love hearts": two numbers that make 10 (7 + 3)'],
  ['dubbel · de helft', 'double · half'],
  ['hoofdrekenen', 'mental maths'],
  ['Klaar!', 'Done!'],
  ['Goed zo! · Knap! · Straf!', 'Well done! · Clever! · Awesome!'],
  ['Probeer nog eens.', 'Try again.'],
];

function showSettings() {
  current = null;
  redraw = showSettings;
  stopSpeech();
  setHeader(L('Voor ouders', 'For parents'), true);
  const s = screen('settings');
  const seg = (prop, opts) => h('div', { class: 'seg' }, opts.map(([val, label]) =>
    h('button', {
      class: state[prop] === val ? 'on' : '',
      onclick: () => { state[prop] = val; save(); showSettings(); },
    }, label)));
  pickVoice();
  const vInfo = (lang, name) => (voices[lang] ? `✅ ${name}: ${voices[lang].name}` : `⚠️ ${name}: —`);
  let resetArmed = false;
  const resetBtn = h('button', { class: 'small-btn danger' }, tx(L('🗑️ Alles wissen', '🗑️ Erase all')));
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) { resetArmed = true; resetBtn.replaceChildren(tx(L('Zeker? Tik nog eens', 'Sure? Tap again'))); return; }
    state.best = {}; state.stars = 0; state.stickers = [];
    save();
    showHome();
  });
  s.append(h('div', { class: 'card' },
    h('div', { class: 'set-row' }, h('span', null, tx(L('🌍 Tekst op het scherm', '🌍 Text on screen'))),
      seg('display', [['nl', 'NL'], ['both', 'NL + EN'], ['en', 'EN']])),
    h('div', { class: 'set-row' }, h('span', null, tx(L('🗣️ Voorlezen', '🗣️ Read aloud'))),
      seg('speech', [['off', tx(L('Uit', 'Off'))], ['nl', 'NL'], ['both', 'NL + EN'], ['en', 'EN']])),
    h('div', { class: 'set-row' }, h('span', null, tx(L('🔔 Geluidjes', '🔔 Sounds'))),
      seg('sound', [[false, tx(L('Uit', 'Off'))], [true, tx(L('Aan', 'On'))]])),
    h('div', { class: 'set-row' },
      h('span', { class: 'muted' }, hasTTS ? [vInfo('nl', 'Nederlands'), h('br'), vInfo('en', 'English')]
        : tx(L('Dit toestel kan niet voorlezen.', 'This device cannot read aloud.'))),
      h('button', { class: 'small-btn', onclick: () => speak(L('Hallo! Honderdvierendertig. 134.', 'Hello! One hundred and thirty four. 134.')) },
        tx(L('▶️ Test stem', '▶️ Test voice')))),
    h('div', { class: 'set-row' }, h('span', null, `⭐ ${state.stars} · 🏅 ${state.stickers.length}`), resetBtn)));
  s.append(h('div', { class: 'card info' },
    h('h3', null, tx(L('Tips', 'Tips'))),
    h('ul', null,
      h('li', null, tx(L('Tik bovenaan op de vlag om de taal van de tekst te wisselen.',
        'Tap the flag at the top to switch the language of the text.'))),
      h('li', null, tx(L('Elke ronde heeft 8 vragen. Juist bij de eerste poging = meer sterren.',
        'Every round has 8 questions. Right on the first try = more stars.'))),
      h('li', null, tx(L('Kleuren zoals op school: H = groen, T = rood, E = blauw.',
        'Colours like at school: H (hundreds) = green, T (tens) = red, E/O (ones) = blue.'))),
      h('li', null, tx(L('Let op: in het Nederlands zeg je eerst de eenheden. 34 = vierendertig ("vier-en-dertig").',
        'Watch out: Dutch says the ones first. 34 = "vierendertig" (four-and-thirty). Children often write 43 by mistake.'))),
      h('li', null, tx(L('Stemmen zonder internet: Android Instellingen → Systeem → Talen → Tekst-naar-spraak → Google → Spraakgegevens installeren → Nederlands (België) en English.',
        'Offline voices: Android Settings → System → Languages → Text-to-speech → Google → Install voice data → Dutch (Belgium) and English.'))))));
  s.append(h('div', { class: 'card info' },
    h('h3', null, '📖 Woordenlijst · Word list'),
    h('table', { class: 'gloss' },
      h('tr', null, h('th', null, '🇧🇪 Nederlands'), h('th', null, '🇬🇧 English')),
      GLOSSARY.map(([nl, en]) => h('tr', { onclick: () => speak(nl.replace(/\(.*?\)|–.*$/g, ''), 'nl') },
        h('td', { class: 'g-nl' }, '🔊 ' + nl), h('td', null, en))))));
}

// ---------- start ----------
$('#homeBtn').addEventListener('click', () => { sfx.tap(); showHome(); });
$('#langBtn').addEventListener('click', () => {
  sfx.tap();
  state.display = { both: 'nl', nl: 'en', en: 'both' }[state.display];
  save();
  if (redraw) redraw();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
showHome();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
