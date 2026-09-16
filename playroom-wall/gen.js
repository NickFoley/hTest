// Playroom wall elevation generator. All units millimetres, origin = floor / left corner.
const fs = require('fs');

const W = 4150, H = 2700;
const CORNICE = 70;            // existing cornice depth at ceiling
const SCRIBE = 50;             // scribe filler each end
const TOP = 2600;              // top of joinery
const BENCH_B = 910, BENCH_T = 950;
const CLOW = 560;              // top of centre low unit
const UPPER_B = 1750;          // underside of upper door band
const SH1 = 1230, SH2 = 1500;  // tower shelf lines
const TVW = 1340, TVH = 780, TVB = 680;

const Lx = SCRIBE, Lw = 1100;             // left tower  50..1150
const Cx = Lx + Lw, Cw = 1850;            // centre bay 1150..3000
const Rx = Cx + Cw, Rw = 1100;            // right tower 3000..4100

const Y = v => H - v;                      // mm -> svg y
const R = (x, yb, w, h, a = {}) => tag('rect', { x, y: Y(yb + h), width: w, height: h, ...a });
function tag(n, a, inner) {
  const s = Object.entries(a).map(([k, v]) => `${k}="${typeof v === 'number' ? +v.toFixed(2) : v}"`).join(' ');
  return inner === undefined ? `<${n} ${s}/>` : `<${n} ${s}>${inner}</${n}>`;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---- material palette -------------------------------------------------
const C = {
  wall: '#EDE8E0', wallDk: '#E3DCD1', ceil: '#F6F3EE',
  floor: '#D6BB95', floorLn: '#C2A377',
  case: '#EFEAE1', caseEdge: '#CFC5B5', caseDk: '#E2DACD',
  oak: '#D2AE7C', oakDk: '#B98F58', oakLt: '#E0C39A',
  panel: '#2F3B35', panelLn: '#3B4A42',
  bin: '#DBD2C2', binLip: '#C6BBA7',
  basket: '#C39A68', basketLn: '#A97F4E',
  screen: '#12161A', ink: '#2A2E33', led: '#FFE9B8'
};
const SPINES = ['#C06A54', '#D89C55', '#7C9A6C', '#5B7C8A', '#B25068', '#836BA0',
  '#D3C096', '#4E6A5A', '#A8573F', '#6E8FA6', '#C98A9B', '#5F6B7A'];

let seed = 20260916;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// ---- content primitives ----------------------------------------------
function spines(x, yb, w, h) {     // spine-out books filling a bay
  let o = '', cx = x + 14, n = 0;
  while (cx < x + w - 24) {
    const bw = 13 + Math.round(rnd() * 20);
    if (cx + bw > x + w - 14) break;
    const bh = h * (0.62 + rnd() * 0.3), lean = n > 0 && rnd() > 0.93;
    const col = SPINES[Math.floor(rnd() * SPINES.length)];
    o += R(cx, yb, bw, bh, { fill: col, opacity: 0.95, ...(lean ? { transform: `rotate(9 ${cx} ${Y(yb)})` } : {}) });
    o += R(cx + 3, yb + bh * 0.72, bw - 6, 5, { fill: '#FFFFFF', opacity: 0.35 });
    cx += bw + 2.5; n++;
  }
  return o;
}
function faceOut(x, yb, w, h, count) { // front-facing picture books, propped on a ledge
  let o = '', bw = Math.min(215, (w - 44) / count), gap = (w - 44 - bw * count) / Math.max(1, count - 1);
  for (let i = 0; i < count; i++) {
    const bx = x + 22 + i * (bw + gap), bh = Math.min(h - 34, 212 + rnd() * 58);
    const col = SPINES[Math.floor(rnd() * SPINES.length)];
    o += R(bx + 7, yb, bw - 7, bh, { fill: '#F3EDE1' });                    // page block behind
    o += R(bx, yb, bw - 14, bh, { fill: col, rx: 3 });                       // cover
    o += R(bx, yb, 13, bh, { fill: '#000', opacity: 0.22 });                 // spine roll
    o += R(bx + 30, yb + bh - 46, bw - 74, 13, { fill: '#FFF', opacity: 0.5, rx: 6 });
    o += R(bx + 30, yb + bh * 0.3, (bw - 74) * 0.62, 10, { fill: '#FFF', opacity: 0.34, rx: 5 });
  }
  return o;
}
function bin(x, yb, w, h) {
  return R(x + 10, yb + 8, w - 20, h - 16, { fill: C.bin, stroke: C.binLip, 'stroke-width': 3, rx: 10 })
    + R(x + 10, yb + h - 40, w - 20, 16, { fill: C.binLip, rx: 6 })
    + R(x + w / 2 - 55, yb + h - 34, 110, 7, { fill: C.oakDk, rx: 3.5, opacity: 0.75 })
    + R(x + w / 2 - 78, yb + h * 0.42, 156, 62, { fill: '#FBF8F2', stroke: C.binLip, 'stroke-width': 2, rx: 5 })
    + R(x + w / 2 - 58, yb + h * 0.42 + 22, 116, 9, { fill: C.binLip, rx: 4.5 });
}
function basket(x, yb, w, h) {
  let o = R(x, yb, w, h, { fill: C.basket, rx: 8 });
  for (let i = 1; i < 7; i++) o += R(x, yb + h * i / 7, w, 3, { fill: C.basketLn, opacity: 0.5 });
  return o + R(x + w * 0.3, yb + h - 26, w * 0.4, 9, { fill: C.basketLn, rx: 4 });
}
function toyBits(x, yb) {   // small styling objects on a shelf
  return R(x, yb, 46, 120, { fill: '#7C9A6C', rx: 6 }) + R(x + 60, yb, 90, 74, { fill: '#D89C55', rx: 8 })
    + tag('circle', { cx: x + 190, cy: Y(yb + 46), r: 46, fill: '#5B7C8A' });
}
function plant(x, yb, s = 1) {
  let o = R(x - 52 * s, yb, 104 * s, 96 * s, { fill: '#B98F58', rx: 8 });
  for (const a of [-42, -20, 0, 22, 44]) o += tag('ellipse', {
    cx: x, cy: Y(yb + 200 * s), rx: 26 * s, ry: 104 * s, fill: '#6F8F68',
    transform: `rotate(${a} ${(x).toFixed(1)} ${Y(yb + 96 * s).toFixed(1)})`
  });
  return o;
}

// ---- the joinery ------------------------------------------------------
function room() {
  return R(0, 0, W, H, { fill: C.wall })
    + R(0, H - CORNICE, W, CORNICE, { fill: C.ceil })
    + tag('line', { x1: 0, y1: Y(H - CORNICE), x2: W, y2: Y(H - CORNICE), stroke: C.caseEdge, 'stroke-width': 3 })
    + R(-260, -170, W + 520, 170, { fill: C.floor })
    + Array.from({ length: 26 }, (_, i) => tag('line', {
      x1: -260 + i * 190, y1: Y(0), x2: -260 + i * 190 + 120, y2: Y(-170),
      stroke: C.floorLn, 'stroke-width': 2, opacity: 0.55
    })).join('');
}

function carcass() {
  let o = '';
  // scribe fillers
  o += R(0, 0, SCRIBE, TOP, { fill: C.caseDk });
  o += R(W - SCRIBE, 0, SCRIBE, TOP, { fill: C.caseDk });
  // shadow-gap to ceiling
  o += R(0, TOP, W, H - CORNICE - TOP, { fill: C.caseDk });
  o += R(0, TOP + 4, W, 10, { fill: '#B9AE9C', opacity: 0.5 });
  // towers + upper band
  o += R(Lx, 0, Lw, TOP, { fill: C.case, stroke: C.caseEdge, 'stroke-width': 4 });
  o += R(Rx, 0, Rw, TOP, { fill: C.case, stroke: C.caseEdge, 'stroke-width': 4 });
  o += R(Cx, UPPER_B, Cw, TOP - UPPER_B, { fill: C.case, stroke: C.caseEdge, 'stroke-width': 4 });
  o += R(Cx, 0, Cw, CLOW, { fill: C.case, stroke: C.caseEdge, 'stroke-width': 4 });
  return o;
}

function tvPanel() {
  let o = R(Cx, CLOW, Cw, UPPER_B - CLOW, { fill: C.panel });
  for (let x = Cx + 46; x < Cx + Cw - 20; x += 46)
    o += tag('line', { x1: x, y1: Y(CLOW), x2: x, y2: Y(UPPER_B), stroke: C.panelLn, 'stroke-width': 7 });
  // LED wash from under the bridge
  o += tag('rect', { x: Cx, y: Y(UPPER_B), width: Cw, height: 300, fill: 'url(#led)' });
  o += R(Cx + 30, UPPER_B - 26, Cw - 60, 12, { fill: C.led, opacity: 0.85, rx: 6 });
  // the television
  const tx = Cx + (Cw - TVW) / 2;
  o += R(tx - 10, TVB - 10, TVW + 20, TVH + 20, { fill: '#000', opacity: 0.22, rx: 10 });
  o += R(tx, TVB, TVW, TVH, { fill: C.screen, rx: 8 });
  o += R(tx + 14, TVB + 14, TVW - 28, TVH - 28, { fill: 'url(#scr)', rx: 4 });
  // soundbar on the low unit
  o += R(Cx + Cw / 2 - 450, CLOW, 900, 68, { fill: '#3A4149', rx: 10 });
  return o;
}

function lowerBand() {
  let o = '';
  const col = (x, w) => bin(x, 0, w, 370) + bin(x, 370, w, 370) + bin(x, 740, w, 170)
    + tag('line', { x1: x + w, y1: Y(0), x2: x + w, y2: Y(BENCH_B), stroke: C.caseEdge, 'stroke-width': 4 });
  // left tower: two bin columns
  o += col(Lx, 550) + col(Lx + 550, 550);
  // right tower: front-facing book nook + one bin column
  const nx = Rx, nw = 540;
  o += R(nx + 14, 0, nw - 28, 60, { fill: C.oakDk, rx: 4 });
  [60, 343, 626].forEach((yb, i) => {
    o += faceOut(nx, yb, nw, 283, 2);
    if (i < 2) o += R(nx + 14, yb + 283 - 18, nw - 28, 18, { fill: C.oak, rx: 3 });
  });
  o += tag('line', { x1: nx + nw, y1: Y(0), x2: nx + nw, y2: Y(BENCH_B), stroke: C.caseEdge, 'stroke-width': 4 });
  o += col(nx + nw, 560);
  // centre low unit: four bays
  for (let i = 0; i < 4; i++) {
    const x = Cx + i * (Cw / 4);
    o += bin(x, 0, Cw / 4, 370) + bin(x, 370, Cw / 4, 170);
    if (i) o += tag('line', { x1: x, y1: Y(0), x2: x, y2: Y(CLOW), stroke: C.caseEdge, 'stroke-width': 4 });
  }
  // continuous oak benchtop over both towers
  [[Lx - 20, Lw + 40], [Rx - 20, Rw + 40]].forEach(([x, w]) => {
    o += R(x, BENCH_B, w, BENCH_T - BENCH_B, { fill: C.oak, rx: 3 });
    o += R(x, BENCH_B, w, 9, { fill: C.oakDk, opacity: 0.65 });
  });
  o += R(Cx, CLOW - 22, Cw, 22, { fill: C.oak });
  return o;
}

function towersMid() {
  let o = '';
  const shelf = (x, w, yb) => R(x, yb, w, 20, { fill: C.oak });
  // left tower: books, books, baskets
  o += spines(Lx, BENCH_T, Lw, SH1 - BENCH_T - 20) + shelf(Lx, Lw, SH1 - 20);
  o += spines(Lx, SH1, Lw, SH2 - SH1 - 20) + shelf(Lx, Lw, SH2 - 20);
  o += basket(Lx + 60, SH2 + 20, 460, 190) + basket(Lx + 570, SH2 + 20, 460, 190);
  // right tower: two front-facing ledges, then spine-out
  o += faceOut(Rx, BENCH_T, Rw, SH1 - BENCH_T - 20, 4) + shelf(Rx, Rw, SH1 - 20);
  o += faceOut(Rx, SH1, Rw, SH2 - SH1 - 20, 4) + shelf(Rx, Rw, SH2 - 20);
  o += spines(Rx, SH2 + 20, Rw - 330, SH2 ? 210 : 210);
  o += toyBits(Rx + Rw - 300, SH2 + 20);
  // ledge lips on the front-facing rows
  [BENCH_T, SH1].forEach(yb => o += R(Rx + 8, yb, Rw - 16, 26, { fill: C.oakDk, rx: 4, opacity: 0.9 }));
  return o;
}

function upperDoors() {
  let o = '';
  const n = 7, dw = (W - 2 * SCRIBE) / n;
  for (let i = 0; i < n; i++) {
    const x = SCRIBE + i * dw;
    o += R(x + 6, UPPER_B + 6, dw - 12, TOP - UPPER_B - 12, { fill: C.case, stroke: C.caseEdge, 'stroke-width': 4, rx: 5 });
    o += R(x + 48, UPPER_B + 48, dw - 96, TOP - UPPER_B - 96, { fill: 'none', stroke: C.caseEdge, 'stroke-width': 3, opacity: 0.85 });
    o += R(x + 6, UPPER_B + 6, dw - 12, 26, { fill: C.oakDk, opacity: 0.55, rx: 4 });   // finger pull rail
  }
  return o;
}

function styling() {   // the few objects that make it a room
  let o = plant(Lx + 140, BENCH_T, 1.0);
  o += R(Rx + Rw - 250, BENCH_T + 26, 150, 190, { fill: '#B25068', rx: 8 });
  return o;
}

// ---- dimension drawing ------------------------------------------------
const MONO = 'font-family="IBM Plex Mono, ui-monospace, monospace"';
function dimH(x1, x2, yb, label, up = false) {
  const y = Y(yb), t = 46;
  return tag('line', { x1, y1: y, x2, y2: y, stroke: C.ink, 'stroke-width': 3 })
    + tag('line', { x1, y1: y - 16, x2: x1, y2: y + 16, stroke: C.ink, 'stroke-width': 3 })
    + tag('line', { x1: x2, y1: y - 16, x2, y2: y + 16, stroke: C.ink, 'stroke-width': 3 })
    + `<text x="${((x1 + x2) / 2).toFixed(1)}" y="${(y + (up ? -22 : t)).toFixed(1)}" ${MONO} font-size="62" fill="${C.ink}" text-anchor="middle">${esc(label)}</text>`;
}
function dimV(x, y1, y2, label) {
  const a = Y(y1), b = Y(y2);
  return tag('line', { x1: x, y1: a, x2: x, y2: b, stroke: C.ink, 'stroke-width': 3 })
    + tag('line', { x1: x - 16, y1: a, x2: x + 16, y2: a, stroke: C.ink, 'stroke-width': 3 })
    + tag('line', { x1: x - 16, y1: b, x2: x + 16, y2: b, stroke: C.ink, 'stroke-width': 3 })
    + `<text x="${x + 26}" y="${((a + b) / 2 + 22).toFixed(1)}" ${MONO} font-size="62" fill="${C.ink}">${esc(label)}</text>`;
}
function leader(x, yb, tx, ty, label) {
  return tag('line', { x1: x, y1: Y(yb), x2: tx, y2: Y(ty), stroke: C.ink, 'stroke-width': 2.5, opacity: 0.8 })
    + tag('circle', { cx: x, cy: Y(yb), r: 9, fill: C.ink })
    + `<text x="${tx + 14}" y="${(Y(ty) + 20).toFixed(1)}" ${MONO} font-size="58" fill="${C.ink}">${esc(label)}</text>`;
}

const DEFS = `<defs>
<linearGradient id="scr" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#1D2733"/><stop offset="0.5" stop-color="#121821"/><stop offset="1" stop-color="#0B0E13"/>
</linearGradient>
<linearGradient id="led" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFE9B8" stop-opacity="0.34"/><stop offset="1" stop-color="#FFE9B8" stop-opacity="0"/>
</linearGradient>
<linearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000" stop-opacity="0.07"/><stop offset="0.4" stop-color="#000" stop-opacity="0"/>
</linearGradient>
</defs>`;

function svg(body, pad) {
  const [l, t, r, b] = pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-l} ${-t} ${W + l + r} ${H + t + b}" `
    + `width="100%" role="img">${DEFS}${body}</svg>`;
}

// styled elevation
const styled = svg(
  room() + carcass() + tvPanel() + lowerBand() + towersMid() + upperDoors() + styling()
  + tag('rect', { x: 0, y: 0, width: W, height: 360, fill: 'url(#vig)' }), [70, 70, 70, 250]);

// dimensioned elevation
let d = R(0, 0, W, H, { fill: '#FBFAF7' })
  + R(0, H - CORNICE, W, CORNICE, { fill: '#F0ECE4' })
  + R(0, 0, SCRIBE, TOP, { fill: '#E7E1D6' }) + R(W - SCRIBE, 0, SCRIBE, TOP, { fill: '#E7E1D6' })
  + R(0, TOP, W, H - CORNICE - TOP, { fill: '#E7E1D6' })
  + [[Lx, Lw, 0, TOP], [Rx, Rw, 0, TOP], [Cx, Cw, 0, CLOW], [Cx, Cw, UPPER_B, TOP - UPPER_B]]
    .map(([x, w, yb, h]) => R(x, yb, w, h, { fill: '#FFF', stroke: C.ink, 'stroke-width': 5 })).join('');
// internal lines
[[Lx, Lw, [370, 740, BENCH_B, BENCH_T, SH1, SH2]], [Rx, Rw, [370, 740, BENCH_B, BENCH_T, SH1, SH2]]]
  .forEach(([x, w, ys]) => ys.forEach(y => d += tag('line', { x1: x, y1: Y(y), x2: x + w, y2: Y(y), stroke: C.ink, 'stroke-width': 2.5, opacity: 0.55 })));
d += tag('line', { x1: Cx, y1: Y(370), x2: Cx + Cw, y2: Y(370), stroke: C.ink, 'stroke-width': 2.5, opacity: 0.55 });
d += tag('line', { x1: SCRIBE, y1: Y(UPPER_B), x2: W - SCRIBE, y2: Y(UPPER_B), stroke: C.ink, 'stroke-width': 5 });
for (let i = 1; i < 7; i++) { const x = SCRIBE + i * (W - 2 * SCRIBE) / 7; d += tag('line', { x1: x, y1: Y(UPPER_B), x2: x, y2: Y(TOP), stroke: C.ink, 'stroke-width': 2.5, opacity: 0.55 }); }
[Lx + 550, Rx + 540].forEach(x => d += tag('line', { x1: x, y1: Y(0), x2: x, y2: Y(BENCH_B), stroke: C.ink, 'stroke-width': 2.5, opacity: 0.55 }));
for (let i = 1; i < 4; i++) { const x = Cx + i * Cw / 4; d += tag('line', { x1: x, y1: Y(0), x2: x, y2: Y(CLOW), stroke: C.ink, 'stroke-width': 2.5, opacity: 0.55 }); }
// TV outline
const tx = Cx + (Cw - TVW) / 2;
d += R(tx, TVB, TVW, TVH, { fill: 'none', stroke: C.ink, 'stroke-width': 5, 'stroke-dasharray': '26 16' });
d += `<text x="${(Cx + Cw / 2).toFixed(1)}" y="${(Y(TVB + TVH / 2) + 22).toFixed(1)}" ${MONO} font-size="64" fill="${C.ink}" text-anchor="middle">60" TV &#183; 1340 &#215; 780</text>`;
d += tag('line', { x1: Cx, y1: Y(TVB + TVH / 2), x2: tx, y2: Y(TVB + TVH / 2), stroke: '#B25068', 'stroke-width': 4, 'stroke-dasharray': '18 12' });
d += tag('line', { x1: tx + TVW, y1: Y(TVB + TVH / 2), x2: Cx + Cw, y2: Y(TVB + TVH / 2), stroke: '#B25068', 'stroke-width': 4, 'stroke-dasharray': '18 12' });
// dimension chains
d += dimH(0, SCRIBE, -170, '50') + dimH(Lx, Lx + Lw, -170, '1100') + dimH(Cx, Cx + Cw, -170, '1850')
  + dimH(Rx, Rx + Rw, -170, '1100') + dimH(W - SCRIBE, W, -170, '50') + dimH(0, W, -430, '4150 — wall width');
d += dimV(W + 150, 0, CLOW, '560') + dimV(W + 150, CLOW, BENCH_T, '950') + dimV(W + 150, BENCH_T, UPPER_B, '1750')
  + dimV(W + 150, UPPER_B, TOP, '2600') + dimV(W + 620, 0, H, '2700 — ceiling');
d += dimV(-180, 0, TVB, '680') + dimV(-520, 0, TVB + TVH / 2, '1070');
const KEY = [['1070', 'centre of screen — adult eye level seated, easy glance from the rug'],
  ['950', 'oak bench / ledge over both towers'],
  ['1750', 'underside of the upper door band; LED strip washes down the TV panel'],
  ['910', 'top of the kid zone — everything below is open, no doors, no lids']];
d += KEY.map(([k, v], i) => `<text x="-700" y="${(Y(-560 - i * 105)).toFixed(1)}" ${MONO} font-size="58" fill="${C.ink}">${esc(k.padEnd(6))} ${esc(v)}</text>`).join('');
fs.writeFileSync(__dirname + '/dims.svg', svg(d, [720, 70, 1200, 1050]));
fs.writeFileSync(__dirname + '/styled.svg', styled);
console.log('ok', styled.length, 'bytes styled');
