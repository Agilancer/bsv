// The captain's own colours: paint schemes for the player's ships. Pure data, importable in node.
// A scheme overrides the YARDS fields the hull materials read (fx/materials.js): plating textures and
// tints, and the colour of the running lights (glow), windows and engines. The accent is chosen
// separately, so plating and lights can be mixed. Only the player's hull is painted: fx/materials.js
// keeps a painted material set under its own cache key, and Ship swaps it onto the captain's hull.
// Saved per hull as `data.ship.paint = { scheme, accent }` (fleet hulls keep theirs; `data.paint` is the
// captain's last choice, which a new hull is delivered in).
//   chip: [plate, trim, light] colours as they read on the hull, for the Ship window's swatches.
export const PAINT_SCHEMES = {
  yard: { name: 'Yard colours', blurb: 'As she left the slip.' },
  navy: {
    name: 'Navy Grey', blurb: 'Fleet-issue haze grey, darker on deck.',
    palette: { hull: 'hull_glacier', tint: 0x80847f, trim: 'hull_glacier', trimTint: 0x565a5c, dark: 'hull_graphite', darkTint: 0x8a9098, glow: 0x8fd0ff, window: 0xffe2b0, engine: 0x6ab8ff },
  },
  arctic: {
    name: 'Arctic White', blurb: 'Polar white over pale steel.',
    palette: { hull: 'hull_glacier', tint: 0xe2e8ee, trim: 'hull_glacier', trimTint: 0xa9bace, dark: 'hull_graphite', darkTint: 0x98a2b0, glow: 0x7ad8ff, window: 0xbfeaff, engine: 0x58b8ff },
  },
  midnight: {
    name: 'Midnight Blue', blurb: 'Deep blue plate, steel-blue decks.',
    palette: { hull: 'hull_glacier', tint: 0x263a68, trim: 'hull_glacier', trimTint: 0x4a6096, dark: 'hull_graphite', darkTint: 0x5c6684, glow: 0x58a8ff, window: 0xcfe0ff, engine: 0x4a90ff },
  },
  crimson: {
    name: 'Crimson Guard', blurb: 'Guard red over maroon, gilt lights.',
    palette: { hull: 'hull_glacier', tint: 0x94202a, trim: 'hull_glacier', trimTint: 0x5a1418, dark: 'hull_graphite', darkTint: 0x74585c, glow: 0xffb040, window: 0xffd9a0, engine: 0xff7a30 },
  },
  gold: {
    name: 'Imperial Gold', blurb: 'Gilded plate over ivory.',
    palette: { hull: 'hull_gold', tint: 0xf0d8a4, trim: 'hull_glacier', trimTint: 0xf4ecd8, dark: 'hull_graphite', darkTint: 0x8c7c62, glow: 0xffc24a, window: 0xffe6a8, engine: 0xffa030 },
  },
  forest: {
    name: 'Forest Green', blurb: 'Ranger green over olive drab.',
    palette: { hull: 'hull_glacier', tint: 0x28582e, trim: 'hull_glacier', trimTint: 0x485c28, dark: 'hull_graphite', darkTint: 0x5c6858, glow: 0xb8e070, window: 0xf0f0b8, engine: 0x8ce880 },
  },
  blackops: {
    name: 'Black Ops', blurb: 'Unmarked black. Few lights showing.',
    palette: { hull: 'hull_graphite', tint: 0x5c6068, trim: 'hull_graphite', trimTint: 0x9aa0aa, dark: 'hull_dropship', darkTint: 0x505258, glow: 0xff3a30, window: 0xff8a70, engine: 0xff4030, windowDensity: 0.16 },
  },
  bone: {
    name: 'Bone and Rust', blurb: 'Weathered bone plate, rust-red ironwork.',
    palette: { hull: 'hull_glacier', tint: 0xcdb98c, trim: 'hull_mech', trimTint: 0xd87446, dark: 'hull_apc', darkTint: 0xa08870, glow: 0xffa040, window: 0xffd9a0, engine: 0xff8030 },
  },
  violet: {
    name: 'Violet Court', blurb: 'Court violet, lilac decks, gold lights.',
    palette: { hull: 'hull_glacier', tint: 0x473068, trim: 'hull_glacier', trimTint: 0x7a62ac, dark: 'hull_graphite', darkTint: 0x6a6080, glow: 0xffc860, window: 0xffe6b0, engine: 0xc080ff },
  },
  verdigris: {
    name: 'Verdigris', blurb: 'Sea-green plate, copper trim.',
    palette: { hull: 'hull_glacier', tint: 0x2a7468, trim: 'hull_mech', trimTint: 0xf0a070, dark: 'hull_graphite', darkTint: 0x587068, glow: 0x60ffd8, window: 0xc8fff0, engine: 0x40e0c0 },
  },
};
export const PAINT_ORDER = Object.keys(PAINT_SCHEMES);

// Running lights, chosen apart from the plating. `scheme` follows the paint scheme (or the yard).
export const PAINT_ACCENTS = {
  scheme: { name: 'Scheme lights' },
  ember: { name: 'Ember', hex: 0xff7a3a },
  amber: { name: 'Amber', hex: 0xffc24a },
  crimson: { name: 'Crimson', hex: 0xff3a30 },
  ice: { name: 'Ice', hex: 0x7ad8ff },
  azure: { name: 'Azure', hex: 0x4a90ff },
  violet: { name: 'Violet', hex: 0xb070ff },
  jade: { name: 'Jade', hex: 0x60f0a0 },
  white: { name: 'White', hex: 0xe8f4ff },
};
export const ACCENT_ORDER = Object.keys(PAINT_ACCENTS);

export const DEFAULT_PAINT = Object.freeze({ scheme: 'yard', accent: 'scheme' });

// anything (old saves, bad data) -> a valid { scheme, accent }
export function normPaint(p) {
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  return { scheme: p && own(PAINT_SCHEMES, p.scheme) ? p.scheme : 'yard', accent: p && own(PAINT_ACCENTS, p.accent) ? p.accent : 'scheme' };
}
export const isDefaultPaint = (p) => { const n = normPaint(p); return n.scheme === 'yard' && n.accent === 'scheme'; };
// '' for yard colours (so unpainted ships keep the material sets they always had)
export function paintKey(p) {
  const n = normPaint(p);
  return n.scheme === 'yard' && n.accent === 'scheme' ? '' : `${n.scheme}/${n.accent}`;
}

const mixWhite = (hex, t) => {
  const ch = (s) => { const v = (hex >> s) & 255; return Math.round(v + (255 - v) * t); };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
// The yard palette as painted. Yard colours with scheme lights returns the yard object itself.
export function paintPalette(yard, p) {
  const n = normPaint(p);
  if (n.scheme === 'yard' && n.accent === 'scheme') return yard;
  const sc = PAINT_SCHEMES[n.scheme].palette;
  const y = sc ? { ...yard, tintMul: 1, ...sc } : { ...yard };
  const a = PAINT_ACCENTS[n.accent].hex;
  if (a != null) { y.glow = a; y.engine = a; y.window = mixWhite(a, 0.45); y.sail = a; }
  else if (sc) y.sail = sc.glow;
  return y;
}

// rough mean colour of each plating texture, to show a tint as it reads on the hull
const TEX_TONE = { hull_alien: 0x1e1715, hull_apc: 0x3a3734, hull_dropship: 0x353330, hull_glacier: 0xcbd4dd, hull_gold: 0xc7a467, hull_graphite: 0x424245, hull_mech: 0x756964, hull_naval: 0x21324f };
const mul = (a, b, k = 1) => {
  const ch = (s) => Math.min(255, Math.round(((a >> s) & 255) * ((b >> s) & 255) / 255 * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
export const cssHex = (hex) => '#' + (hex & 0xffffff).toString(16).padStart(6, '0');
// [plate, trim, light] for a swatch: plating lifted a little, as the lit hull reads on screen
export function paintChip(yard, p) {
  const y = paintPalette(yard, p);
  const tone = (texName, tint, tm = 1) => mul(TEX_TONE[texName] ?? 0x808080, tint ?? 0xffffff, 1.5 * tm);
  return [tone(y.hull, y.tint, y.tintMul || 1), tone(y.trim, y.trimTint), y.glow];
}

// The ship in service always carries a valid paint record. Old saves get yard colours; a hull that has
// never been painted (fresh from the yard) takes the captain's last choice (`data.paint`).
export function ensurePaint(data) {
  if (!data || !data.ship) return data;
  data.ship.paint = normPaint(data.ship.paint ?? data.paint);
  for (const f of data.fleet || []) if (f && f.paint) f.paint = normPaint(f.paint);
  return data;
}
