// The Ship window's Paint control: scheme swatches, a row of light colours, and a reset to yard colours.
// A choice is applied at once (game.setPaint repaints the flagship where she lies), so the ship behind
// the window is the preview. Data: game/data/paint.js.
import { PAINT_SCHEMES, PAINT_ORDER, PAINT_ACCENTS, ACCENT_ORDER, normPaint, isDefaultPaint, paintChip, paintPalette, cssHex } from '../game/data/paint.js';
import { CHASSIS_BY_ID, YARDS } from '../game/data/chassis.js';

export function paintPanel(game, box) {
  if (!box) return;
  const P = game.data, cur = normPaint(P.ship.paint);
  const yard = YARDS[CHASSIS_BY_ID[P.ship.chassis].yard];
  const chip = (c) => `<i style="background:${cssHex(c)}"></i>`;
  const schemes = PAINT_ORDER.map((id) => {
    const s = PAINT_SCHEMES[id], c = paintChip(yard, { scheme: id, accent: cur.accent });
    return `<button class="paint-sw${id === cur.scheme ? ' on' : ''}" data-scheme="${id}" title="${s.blurb}"><span class="paint-chip">${chip(c[0])}${chip(c[1])}<i class="lt" style="background:${cssHex(c[2])};color:${cssHex(c[2])}"></i></span><span class="paint-n">${s.name}</span></button>`;
  }).join('');
  const lights = ACCENT_ORDER.map((id) => {
    const a = PAINT_ACCENTS[id], hex = cssHex(a.hex ?? paintPalette(yard, { scheme: cur.scheme }).glow);
    return `<button class="paint-ac${id === cur.accent ? ' on' : ''}${a.hex == null ? ' auto' : ''}" data-accent="${id}" title="${a.name}" aria-label="${a.name}" style="--pc:${hex}"><i></i></button>`;
  }).join('');
  // folded to one line until asked for, so the ship's figures stay in view
  const open = !!game.ui.paintOpen, c0 = paintChip(yard, cur);
  box.className = 'paint' + (open ? ' open' : '');
  box.innerHTML = `<div class="paint-h"><button class="paint-fold" aria-expanded="${open}"><span class="label">Paint</span><span class="paint-chip">${chip(c0[0])}${chip(c0[1])}<i class="lt" style="background:${cssHex(c0[2])};color:${cssHex(c0[2])}"></i></span><span class="paint-n">${PAINT_SCHEMES[cur.scheme].name}${cur.accent === 'scheme' ? '' : ' · ' + PAINT_ACCENTS[cur.accent].name + ' lights'}</span><span class="paint-car">${open ? '▾' : '▸'}</span></button>${open ? `<button class="btn violet paint-reset"${isDefaultPaint(cur) ? ' disabled' : ''}>Yard colours</button>` : ''}</div>`
    + (open ? `<div class="paint-grid">${schemes}</div>
    <div class="paint-h"><span class="label">Running lights · ${PAINT_ACCENTS[cur.accent].name}</span></div>
    <div class="paint-row">${lights}</div>` : '');
  box.querySelector('.paint-fold').onclick = () => { game.ui.paintOpen = !open; paintPanel(game, box); };
  if (!open) return;
  box.querySelectorAll('[data-scheme]').forEach((b) => { b.onclick = () => game.setPaint({ scheme: b.dataset.scheme }); });
  box.querySelectorAll('[data-accent]').forEach((b) => { b.onclick = () => game.setPaint({ accent: b.dataset.accent }); });
  box.querySelector('.paint-reset').onclick = () => game.setPaint({ scheme: 'yard', accent: 'scheme' });
}
