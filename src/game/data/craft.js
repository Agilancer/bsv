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

// How large a craft is drawn (x its Blender model, by class). A craft is drawn at most a seventh of the length of
// the shortest hull that berths it (tests/craft.test.mjs), so a wing looks like it fits in its carrier: a fighter
// about 5-7 long, a gunship about 10-12, an escort frigate about 21-23.
export const DRAW = { S: 0.75, M: 0.75, L: 0.65 };

// Where a craft keeps station on its carrier, in the carrier's frame (+x port, +y up, +z bow); dims = ship.dims.
// side: +1 for a port bay, -1 starboard; row: which pair of bays (0 the first, 1 the second...); fi: the craft's
// place among its bay's craft of the same role, lead craft first. reach(z), when given, is how far the carrier
// reaches out to the side at z, guns included (Hangars measures it from the hull); else the broadside guns' ~2.45 x
// the half-beam. A wing with nothing to fight flies a tight echelon along the stern quarter on its bay's side, the
// lead a few metres outside the hull there, each next craft a length out and back (a port and a starboard wing make
// a V on the carrier's stern). An escort frigate holds abeam just outside the guns; repair drones ride just over the
// deck (Hangars puts them on the hull's real height) and a tender over the stern. No slot moves: nothing circles.
export const FORM = {
  strike: { z: 0.34, clear: 3, y: 0.3, out: 6, up: 0.6, back: 7 },
  frigate: { z: 0.12, clear: 4, y: -3 },
};
// half a craft's beam as drawn, by class: room to keep off the hull
const HALF_BEAM = { S: 2.3, M: 3.6, L: 4.2 };
export const ROLE = { fighter: 'strike', bomber: 'strike', gunship: 'strike', torpboat: 'strike', frigate: 'frigate', drone: 'drone', tender: 'tender', decoy: 'decoy' };
export function formSlot(kind, fi, side, row, dims, out = { x: 0, y: 0, z: 0 }, reach = null) {
  const { L, W, Ht } = dims, hb = HALF_BEAM[(CRAFT[kind] || CRAFT.fighter).cls];
  const at = (z) => Math.max(W, reach ? reach(z) : W * 2.45);
  switch (ROLE[kind]) {
    case 'frigate': {
      const F = FORM.frigate, n = row + fi, z = -L * F.z - n * 24;
      out.x = side * (Math.max(at(z), at(z + 12), at(z - 12)) + F.clear + hb + n * 22); out.y = F.y - row * 4; out.z = z;
      break;
    }
    case 'drone':
      out.x = side * W * (0.3 + 0.3 * (fi % 2)); out.y = Ht + 4;
      out.z = clampZ(L * (0.3 - 0.2 * fi - 0.1 * row), L);
      break;
    case 'tender':
      out.x = side * W * 0.5; out.y = Ht + 8 + row * 5; out.z = -(L * 0.5 + 12 + (row + fi) * 12);
      break;
    case 'decoy':   // with nothing to draw fire from, astern and a little low
      out.x = 0; out.y = -(dims.Hb ?? Ht) - 4; out.z = -(L * 0.5 + 16);
      break;
    default: {
      // the echelon's line starts just outside the hull at the lead's station (or wherever it is wider further aft)
      // (the lead may be a medium craft: the rest keep a little extra room from it)
      const F = FORM.strike, z0 = -L * F.z - row * 16, z = z0 - fi * F.back - (fi ? 4 : 0);
      const base = Math.max(at(z0), at(z0 - 8), at(z));
      out.x = side * (base + F.clear + hb + fi * F.out + (fi ? 2 : 0) + row * 9); out.y = Ht * F.y + fi * F.up + row * 4;
      out.z = z;
    }
  }
  return out;
}
function clampZ(z, L) { return Math.max(-L * 0.42, Math.min(L * 0.42, z)); }

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
