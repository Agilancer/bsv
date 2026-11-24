// Side-profile deck plan of a chassis, Star-Trek-cutaway style: decks of the main hull, the superstructure stacked on
// top (bridge on its crown), and rooms laid along each deck. Pure data in hull fractions so it is testable without a
// page and so a hit on the hull can be traced to the room it landed in.
//   u: 0 stern .. 1 bow (the ship's local z), row: deck index from the top of the main hull (castle decks are < 0)
import { hullPlan } from '../ship/hullPlan.js';

export const SECTIONS = {
  bridge:      { name: 'Bridge', depts: ['command', 'helm'] },
  quarters:    { name: 'Crew Quarters', depts: [] },
  engineering: { name: 'Engineering', depts: ['engineering'] },
  shields:     { name: 'Shield Generators', depts: ['shields'] },
  sensors:     { name: 'Sensors & Science', depts: ['sensors'] },
  teleporter:  { name: 'Teleporters', depts: ['boarding'] },
  hangar:      { name: 'Flight Deck', depts: ['hangar'] },
  medical:     { name: 'Sickbay', depts: ['medical'] },
  weapons:     { name: 'Weapons Decks', depts: ['tactical'] },
  cargo:       { name: 'Cargo Hold', depts: [] },
  damage:      { name: 'Damage Control', depts: ['damage'] },
  lounge:      { name: 'Observation Lounge', depts: [] },
};

// the castle's run along the hull and how many tiers it stacks, from the hull builder's own plan
export function castleSpan(chassis) {
  const c = hullPlan(chassis).castle;
  return { u0: c.u0, u1: c.u1, tiers: c.tiers };
}

export function deckPlan(chassis) {
  const tier = chassis.tier;
  const D = 2 + Math.floor(tier / 2);                // decks in the main hull: 2 (cutter) .. 7 (dreadnought)
  const hangars = chassis.slots.hangar;
  const rooms = [];
  const room = (sec, row, u0, u1, label) => rooms.push({ id: rooms.length, sec, row, u0, u1, name: label || SECTIONS[sec].name });
  const top = 0, bottom = D - 1;
  const eng = 0.17;
  // engineering runs the full height at the stern: the reactor (warp core) stands in it
  for (let r = 0; r < D; r++) room('engineering', r, 0.015, eng, r === 0 ? 'Main Engineering' : 'Engineering');
  // top deck: quarters, sickbay, teleporters, quarters, sensors
  room('quarters', top, eng, 0.38, 'Crew Quarters');
  room('medical', top, 0.38, 0.49);
  room('teleporter', top, 0.49, 0.59, 'Teleporter Room');
  room('quarters', top, 0.59, 0.8, 'Crew Quarters');
  room('sensors', top, 0.8, 0.965, 'Sensor Array');
  const gunRows = [];
  if (D === 2) {
    room('hangar', bottom, eng, 0.26, 'Shuttle Bay');
    room('weapons', bottom, 0.26, 0.52, 'Gun Deck');
    room('shields', bottom, 0.52, 0.64, 'Shield Generator');
    room('damage', bottom, 0.64, 0.74, 'Damage Control');
    room('weapons', bottom, 0.74, 0.955, 'Torpedo Room');
    gunRows.push(bottom);
  } else {
    // a big flight deck is two decks tall
    const tallHangar = hangars >= 2 && D >= 4;
    for (let r = 1; r < bottom; r++) {
      const inHangar = tallHangar && r === bottom - 1;
      const u0 = inHangar ? 0.36 : eng;
      if (r === 2 && D >= 6) {
        room('quarters', r, u0, 0.5, 'Crew Quarters');
        room('lounge', r, 0.5, 0.6, 'Mess Hall');
        room('sensors', r, 0.6, 0.78, 'Science Labs');
        room('weapons', r, 0.78, 0.95, 'Torpedo Magazine');
        continue;
      }
      room('weapons', r, u0, 0.8, `Gun Deck ${String.fromCharCode(65 + gunRows.length)}`);
      room('weapons', r, 0.8, 0.95, r === 1 ? 'Torpedo Room' : 'Magazine');
      gunRows.push(r);
      if (inHangar) room('hangar', r, eng, 0.36, 'Flight Deck');
    }
    // bottom deck
    if (hangars) room('hangar', bottom, eng, 0.36, 'Flight Deck');
    else room('hangar', bottom, eng, 0.27, 'Shuttle Bay');
    room('cargo', bottom, hangars ? 0.36 : 0.27, 0.52, 'Cargo Hold');
    room('shields', bottom, 0.52, 0.67, 'Shield Generators');
    room('damage', bottom, 0.67, 0.78, 'Damage Control');
    room('shields', bottom, 0.78, 0.93, 'Deflector');
  }
  // superstructure: stacked tiers over the castle span, the bridge on top
  const cs = castleSpan(chassis);
  const ctiers = Math.min(4, Math.max(1, cs.tiers - 1));
  let a = cs.u0, b = cs.u1;
  for (let i = 0; i < ctiers; i++) {
    const row = -1 - i;
    const w = b - a;
    if (i === ctiers - 1) {
      room('bridge', row, a + w * 0.12, b - w * 0.12, 'Main Bridge');
    } else if (i === ctiers - 2) {
      room('lounge', row, a, a + w * 0.45, 'Observation Lounge');
      room('bridge', row, a + w * 0.45, b, 'Ready Room');
    } else {
      room('quarters', row, a, a + w * 0.6, 'Officers\' Quarters');
      room('damage', row, a + w * 0.6, b, 'DC Station');
    }
    const shrink = w * 0.14;
    a += shrink * 0.4; b -= shrink * 0.6;
  }
  return { decks: D, castleRows: ctiers, rooms, gunRows, castle: cs };
}

// which room a point in ship-local space falls in (dims from the hull builder: L, W, Ht, Hb)
export function roomAt(plan, dims, lx, ly, lz) {
  const u = Math.max(0, Math.min(1, (lz + dims.L / 2) / dims.L));
  let row;
  if (ly > dims.Ht) row = -1 - Math.min(plan.castleRows - 1, Math.floor((ly - dims.Ht) / Math.max(1, dims.Ht * 0.55)));
  else row = Math.max(0, Math.min(plan.decks - 1, Math.floor((dims.Ht - ly) / (dims.Ht + dims.Hb) * plan.decks)));
  let best = null, bd = Infinity;
  for (const r of plan.rooms) {
    if (r.row !== row) continue;
    const d = u < r.u0 ? r.u0 - u : u > r.u1 ? u - r.u1 : 0;
    if (d < bd) { bd = d; best = r; }
  }
  return best || plan.rooms[0];
}
