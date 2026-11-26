// Hangar craft classes and how a wing is made up (pure data/logic: importable in node, tests/craft.test.mjs).
//
// A bay's item names its small craft (fighters, bombers, repair drones) and how many fly (`count`). A carrier
// long enough to berth bigger craft puts them at the head of each wing: from BERTH.M a medium craft leads it,
// from BERTH.L a large escort as well. The lead craft take the places of small ones and the wing's output is
// shared out by weight, so a bay puts the same damage (or repair) on its target from any hull: the bigger the
// ship, the heavier and fewer its craft. Extra craft from powers (Swarm, the launch ability) fly as before.
export const CRAFT = {
  //          class    weight  speed turn(rad/s) hull (x a small craft's)  roll (bank in turns)
  fighter: { cls: 'S', w: 1, speed: 170, turn: 4.0, hp: 1, roll: 0.9, name: 'fighter' },
  bomber: { cls: 'S', w: 1, speed: 120, turn: 3.0, hp: 1, roll: 0.6, name: 'bomber' },
  drone: { cls: 'S', w: 1, speed: 110, turn: 3.5, hp: 1, roll: 0.5, name: 'repair drone' },
  decoy: { cls: 'S', w: 0, speed: 110, turn: 3.0, hp: 1, roll: 0.5, name: 'decoy' },
  gunship: { cls: 'M', w: 2, speed: 128, turn: 1.9, hp: 3.5, roll: 0.35, name: 'gunship' },
  torpboat: { cls: 'M', w: 2, speed: 108, turn: 1.5, hp: 4, roll: 0.3, name: 'torpedo boat' },
  tender: { cls: 'M', w: 2, speed: 92, turn: 1.4, hp: 3.5, roll: 0.25, name: 'repair tender' },
  frigate: { cls: 'L', w: 3, speed: 84, turn: 0.75, hp: 8, roll: 0.12, name: 'escort frigate' },
};
// the lead craft a bay of each small kind berths: [medium, large] (a drone bay's large berth takes a tender)
export const LEAD = { fighter: ['gunship', 'frigate'], bomber: ['torpboat', 'frigate'], drone: ['tender', null] };
// carrier length (ship.dims.L) from which medium / large craft are berthed
export const BERTH = { M: 105, L: 180 };
export const berth = (L) => (L >= BERTH.L ? 2 : L >= BERTH.M ? 1 : 0);

// The wing a bay flies: [{ kind, share }], lead craft first. share = the craft's part of the wing's output in
// small-craft units (the shares add up to count).
export function wingPlan(craft, count, L) {
  count = Math.max(0, Math.floor(count));
  const lead = LEAD[craft] || [null, null];
  const b = berth(L);
  const kinds = [];
  if (b >= 2 && lead[1] && count >= 1) kinds.push(lead[1]);
  if (b >= 1 && lead[0] && kinds.length < count) kinds.push(lead[0]);
  while (kinds.length < count) kinds.push(craft);
  const W = kinds.reduce((s, k) => s + CRAFT[k].w, 0) || 1;
  return kinds.map((kind) => ({ kind, share: (count * CRAFT[kind].w) / W }));
}

// what the bay's tooltip says about its wing on a hull of length L ('' when it flies only small craft)
export function wingLine(craft, count, L) {
  const plan = wingPlan(craft, count, L);
  const lead = plan.filter((p) => CRAFT[p.kind].cls !== 'S');
  if (!lead.length) return '';
  return 'Led by ' + lead.map((p) => `a${/^[aeiou]/.test(CRAFT[p.kind].name) ? 'n' : ''} ${CRAFT[p.kind].name}`).join(' and ');
}

// Design lines: each is one Blender model set (tools/blender/craft_<line>.py -> assets/ships/craft/<line>.glb), a
// design language across all eight craft. A wing flies its carrier's yard's line, so craft look like they came
// out of the ship that launched them.
export const LINES = ['navy', 'concord', 'foundry', 'raider', 'choir'];
export const LINE_BY_YARD = {
  velscour: 'navy', aurelian: 'concord', tidewright: 'concord', ironhold: 'foundry',
  corsair: 'raider', rustborn: 'raider', hollow: 'choir', silent: 'choir', brood: 'choir',
};
export const lineFor = (yard) => LINE_BY_YARD[yard] || 'navy';
// Enemy fleets fly their faction's line whatever yard built the hull (pirates sail captured Tidewright clippers,
// but their wings are raider craft); Rival Companies keep their yards' lines.
export const LINE_BY_FACTION = { pirate: 'raider', rustborn: 'raider', covenant: 'choir', silent: 'choir', brood: 'choir' };
export function lineForShip(ship) {
  if (!ship) return 'navy';
  const ch = ship.chassis || {};
  if (ch.kind === 'enemy' && LINE_BY_FACTION[ship.faction]) return LINE_BY_FACTION[ship.faction];
  return lineFor(ch.yard);
}

// Wing colours. The captain's wing paints ALLY_PAINT; a hostile wing paints its yard's glow, except that it
// never paints in the captain's blue: a colour within ALLY_BAND degrees of its hue (or a pale bluish one)
// takes the faction's own alternative, else the standard hostile red.
export const ALLY_PAINT = 0x3f8cff;
export const ALLY_BAND = 45;
const HOSTILE_ALT = { silent: 0xc84cff, brood: 0x40ffd0, covenant: 0xff2a50 };
const HOSTILE_RED = 0xff4a3a;
export function hueSat(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (d === 0) return { h: 0, s: 0, l, blue: false };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l, blue: b > r };
}
export const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
export function hostilePaint(hex, faction) {
  const c = hueSat(hex), ally = hueSat(ALLY_PAINT);
  const near = c.s > 0.12 ? hueGap(c.h, ally.h) < ALLY_BAND : c.blue;
  return near ? HOSTILE_ALT[faction] ?? HOSTILE_RED : hex;
}
