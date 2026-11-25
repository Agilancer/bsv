// Names the player chooses: the captain and their hulls. Pure (no DOM): importable in node.
// Everything typed by a person passes through cleanName before it is stored, and is only ever put
// on screen with textContent / esc().
export const CAPTAIN_MAX = 20;
export const SHIP_MAX = 24;          // the part after the registry prefix
export const SHIP_FULL_MAX = 28;     // prefix included (the fleet tab's rename box)
export const DEFAULT_CAPTAIN = 'Captain';
export const DEFAULT_SHIP = 'Velscour';

const FIRST = ['Ada', 'Bram', 'Corva', 'Dessa', 'Emeric', 'Fenna', 'Garrick', 'Hale', 'Ione', 'Jory', 'Kestrel', 'Lior', 'Maren', 'Nix', 'Orla', 'Perrin', 'Quill', 'Rook', 'Sabine', 'Tavish', 'Una', 'Vesper', 'Wynn', 'Yara', 'Zeno'];
const LAST = ['Ashgrove', 'Bellweather', 'Calloway', 'Drummond', 'Everard', 'Fairwind', 'Greaves', 'Holloway', 'Ironside', 'Jessup', 'Kincaid', 'Lockhart', 'Merrow', 'Nightingale', 'Oakhurst', 'Pryce', 'Quarrel', 'Redfern', 'Stroud', 'Tolliver', 'Underwood', 'Varley', 'Whitlock', 'Yarrow'];
// names a Velscour captain gives a hull
const SHIPS = ['Steadfast', 'Resolute', 'Vigilant', 'Indomitable', 'Unbowed', 'Iron Meridian', 'Far Horizon', 'Hard Reckoning', 'Ashen Vow', 'Bastion', 'Calculated Risk', 'Dawn Chorus', 'Errand of Mercy', 'Fair Warning', 'Gallant', 'Harbinger', 'Iron Oath', 'Justiciar', 'Kindly Light', 'Last Light', 'Morning Star', 'Nightfall', 'Oathkeeper', 'Patience of Saints', 'Quietus', 'Retribution', 'Solace', 'Tempest', 'Unfinished Business', 'Velvet Hammer', 'Wayfarer', 'Yeoman'];

// strip anything that is not a plain printable character, collapse whitespace, clamp the length
export function cleanName(v, max = CAPTAIN_MAX) {
  const raw = String(v == null ? '' : v);
  let s = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i), ch = raw[i];
    // control characters, zero-width and bidi marks, line separators, and anything markup could use
    const bad = c < 32 || (c >= 127 && c <= 159) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202f) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff || '<>&"`\\'.includes(ch);
    s += bad ? ' ' : ch;
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max).trim();
  return s;
}
export const captainName = (v) => cleanName(v, CAPTAIN_MAX) || DEFAULT_CAPTAIN;
// a ship's full name: the registry prefix is added unless the captain typed one of their own
export function shipName(v, prefix = 'DSV', fallback = DEFAULT_SHIP) {
  let s = cleanName(v, SHIP_FULL_MAX);
  if (!s) return `${prefix} ${fallback}`;
  if (/^[A-Z]{2,4} \S/.test(s)) return s;
  s = cleanName(s, SHIP_MAX);
  return `${prefix} ${s}`;
}
const pick = (a, rnd) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
export const randomCaptain = (rnd = Math.random) => `${pick(FIRST, rnd)} ${pick(LAST, rnd)}`;
export const randomShip = (rnd = Math.random) => pick(SHIPS, rnd);
export const NAME_POOLS = { FIRST, LAST, SHIPS };
