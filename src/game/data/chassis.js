// The 60 main-ship chassis and the 84 planet-explorer chassis (7 frames x 12 marks).
// Six shipyards x ten hull classes. A yard sets the design language (hull plating, prow,
// superstructure, spires, sails, glow colour); a class sets size, crew, slots and handling.
// Ship local frame: +Z is the bow, +Y up, +X is port, -X starboard.

export const YARDS = {
  velscour: {
    name: 'Velscour Dominion', short: 'VLS', blurb: 'Cathedral-hulled line ships of the old Dominion. Spires, rams and walls of guns.',
    hull: 'hull_graphite', trim: 'hull_gold', dark: 'hull_dropship', tint: 0x9aa0b0, trimTint: 0xffd89a,
    glow: 0xff7a3a, window: 0xffb46a, engine: 0xff6a30,
    prow: 'ram', castle: 'cathedral', spires: 4, sails: 0, buttress: true, keel: 1.0, sponsons: 0.6, hullRound: 0.15,
    names: ['Penitent', 'Vigil', 'Censer', 'Reliquary', 'Litany', 'Ossuary', 'Basilica', 'Requiem', 'Sepulchre', 'Throne of Velscour'],
  },
  aurelian: {
    name: 'Aurelian Concord', short: 'AUR', blurb: 'White-and-gold courtly hulls. Swept lines, strong shields, lance batteries.',
    hull: 'hull_glacier', trim: 'hull_gold', dark: 'hull_graphite', tint: 0xe8ecf4, trimTint: 0xffe2a8,
    glow: 0x7ad8ff, window: 0x9fe4ff, engine: 0x58b8ff,
    prow: 'needle', castle: 'swept', spires: 2, sails: 0, buttress: false, keel: 0.6, sponsons: 0.3, hullRound: 0.45,
    names: ['Halcyon', 'Laurel', 'Seraph', 'Meridian', 'Aureole', 'Paragon', 'Solace', 'Empyrean', 'Sovereign', 'Crown Ascendant'],
  },
  tidewright: {
    name: 'Tidewright Yards', short: 'TDW', blurb: 'Clippers of the void. Long, narrow and fast, under great solar sails.',
    hull: 'hull_naval', trim: 'hull_gold', dark: 'hull_graphite', tint: 0xb8c8ff, trimTint: 0xffd08a,
    glow: 0x58ffd8, window: 0xc8f0ff, engine: 0x40e0ff,
    prow: 'clipper', castle: 'stern', spires: 0, sails: 3, buttress: false, keel: 1.3, sponsons: 0.2, hullRound: 0.3,
    names: ['Petrel', 'Gannet', 'Spindrift', 'Corsair Wind', 'Albatross', 'Tempest', 'Maelstrom', 'Leviathan Tide', 'Storm Regent', 'Abyssal Mariner'],
  },
  ironhold: {
    name: 'Ironhold Foundry', short: 'IRH', blurb: 'Brick-hulled foundry ships. Thick armour, slow turns, enormous broadsides.',
    hull: 'hull_dropship', trim: 'hull_apc', dark: 'hull_graphite', tint: 0xd8d2c4, trimTint: 0xd8c070,
    glow: 0xffc040, window: 0xffd070, engine: 0xffa030,
    prow: 'blunt', castle: 'block', spires: 0, sails: 0, buttress: true, keel: 0.4, sponsons: 1.0, hullRound: 0.0, glowMul: 0.7,
    names: ['Anvil', 'Bulwark', 'Crucible', 'Rampart', 'Smelter', 'Bastion', 'Forgeheart', 'Juggernaut', 'Citadel', 'Mountain of Ironhold'],
  },
  corsair: {
    name: 'Corsair Free Union', short: 'CFU', blurb: 'Scavenged, uparmoured, bristling. Rakish raiders with too many guns.',
    hull: 'hull_mech', trim: 'hull_apc', dark: 'hull_dropship', tint: 0xd0c8c0, trimTint: 0xff7060,
    glow: 0xff3050, window: 0xff8070, engine: 0xff4060,
    prow: 'fork', castle: 'scrap', spires: 1, sails: 1, buttress: false, keel: 0.8, sponsons: 0.8, hullRound: 0.1,
    names: ['Jackal', 'Cutlass', 'Magpie', 'Blackjack', 'Harrow', 'Reaver', 'Marauder', 'Dread Pennant', 'Kingslayer', 'Black Armada'],
  },
  hollow: {
    name: 'Hollow Star Covenant', short: 'HSC', blurb: 'Grown, not built. Chitinous hulls lit from within by something red.',
    hull: 'hull_alien', trim: 'hull_graphite', dark: 'hull_alien', tint: 0xb0a0a8, trimTint: 0xe08a98, tintMul: 2.0,
    glow: 0xff2040, window: 0xff3050, engine: 0xff1050, alienGlow: true,
    prow: 'fork', castle: 'organic', spires: 6, sails: 0, buttress: true, keel: 1.1, sponsons: 0.4, hullRound: 0.6,
    names: ['Thornmaw', 'Hive Lantern', 'Choir of Teeth', 'Marrowbloom', 'Hollowheart', 'Carrion Psalm', 'Starveling', 'Nest Eternal', 'Void Cantor', 'The Unmaking'],
  },
  // ---- enemy-only design languages (not sold at shipyards) ----
  rustborn: {
    name: 'Rustborn Scavengers', short: 'RST', enemyOnly: true, blurb: 'Welded from wrecks.',
    hull: 'hull_apc', trim: 'hull_mech', dark: 'hull_dropship', tint: 0xd8a070, trimTint: 0xd09060, tintMul: 1.7,
    glow: 0xffa040, window: 0xffc070, engine: 0xff8030,
    prow: 'blunt', castle: 'scrap', spires: 1, sails: 0, buttress: true, keel: 0.6, sponsons: 1.2, hullRound: 0.05,
    names: [],
  },
  silent: {
    name: 'The Silent Choir', short: 'SIL', enemyOnly: true, blurb: 'Black glass and white light.',
    hull: 'hull_graphite', trim: 'hull_glacier', dark: 'hull_graphite', tint: 0x50586e, trimTint: 0xe0f0ff, tintMul: 1.2,
    glow: 0x9ff0ff, window: 0xbff8ff, engine: 0x9ff0ff,
    prow: 'needle', castle: 'swept', spires: 3, sails: 0, buttress: false, keel: 0.3, sponsons: 0, hullRound: 0.0, glowMul: 0.55,
    names: [],
  },
  brood: {
    name: 'Leviathan Brood', short: 'BRD', enemyOnly: true, blurb: 'Void fauna.',
    hull: 'hull_alien', trim: 'hull_alien', dark: 'hull_alien', tint: 0x88b8c0, trimTint: 0x6a90a0, alienGlow: true,
    glow: 0x40ffd0, window: 0x40ffd0, engine: 0x60fff0,
    prow: 'fork', castle: 'organic', spires: 5, sails: 2, buttress: false, keel: 1.4, sponsons: 0, hullRound: 0.9, organic: true, tintMul: 1.6,
    names: [],
  },
};

// Shipyard signatures: what flying a yard's hull feels like
export const YARD_TRAITS = {
  velscour: 'Cathedral Batteries — broadsides +12% damage, +5 armour.',
  aurelian: 'Shield Overcharge — shields keep regenerating under fire (40%).',
  tidewright: 'Solar Sails — +25% speed after 4 s without firing.',
  ironhold: 'Armoured Flanks — port and starboard facings take 20% less hull damage.',
  corsair: 'Boarding Crews — +1 craft per hangar, +15% better loot.',
  hollow: 'Living Hull — regenerates 0.4% hull per second.',
};

// Each class has its own silhouette (arch): bow length, number of gun decks, where the
// castle sits, outrigger pods or side hulls, an armour belt, fins. The capital classes each carry
// one bold feature that reads from the game camera (built in ship/HullBuilder.js from ship/hullPlan.js):
//   foreSpire: a raised forward command spire (cruiser)       galleries: sponson gun-galleries jutting
//   spine: an armoured spinal ridge and split prow (battleship)  from both flanks (heavy cruiser)
export const ARCH = {
  1: { prow: 0.75, decks: 1, castle: 'aft', castleScale: 0.7 },
  2: { prow: 0.9, decks: 1, castle: 'aft', outrig: 'pods' },
  3: { prow: 1.0, decks: 1, castle: 'mid' },
  4: { prow: 1.45, decks: 1, castle: 'aft', castleScale: 0.8, torpBow: true },
  5: { prow: 1.1, decks: 2, castle: 'twin', fins: 0.6 },
  6: { prow: 1.0, decks: 2, castle: 'aft', foreSpire: 1 },
  7: { prow: 0.85, decks: 2, castle: 'aft', belt: true, galleries: 1 },
  8: { prow: 1.3, decks: 2, castle: 'aft', fins: 1.25, castleScale: 0.9 },
  9: { prow: 1.0, decks: 3, castle: 'aft', castleScale: 1.15, spine: 1 },
  10: { prow: 1.05, decks: 3, castle: 'twin', outrig: 'hulls', castleScale: 1.2 },
};

export const CLASSES = [
  // tier, name, length, beam/len, crew, hull, shield, speed, turn(deg/s), slots
  { tier: 1, name: 'Cutter', len: 38, beam: 0.20, crew: [5, 12], hull: 900, shield: 600, speed: 96, turn: 46, slots: { broadside: 1, turret: 1, prow: 1, hangar: 0, module: 2 } },
  { tier: 2, name: 'Corvette', len: 50, beam: 0.19, crew: [10, 22], hull: 1500, shield: 950, speed: 88, turn: 38, slots: { broadside: 2, turret: 1, prow: 1, hangar: 0, module: 3 } },
  { tier: 3, name: 'Frigate', len: 64, beam: 0.18, crew: [18, 36], hull: 2300, shield: 1400, speed: 80, turn: 31, slots: { broadside: 2, turret: 2, prow: 1, hangar: 1, module: 3 } },
  { tier: 4, name: 'Destroyer', len: 80, beam: 0.17, crew: [30, 52], hull: 3300, shield: 1900, speed: 74, turn: 26, slots: { broadside: 3, turret: 2, prow: 1, hangar: 1, module: 4 } },
  { tier: 5, name: 'Light Cruiser', len: 98, beam: 0.17, crew: [44, 72], hull: 4600, shield: 2600, speed: 66, turn: 22, slots: { broadside: 3, turret: 3, prow: 1, hangar: 1, module: 4 } },
  { tier: 6, name: 'Cruiser', len: 118, beam: 0.17, crew: [60, 96], hull: 6200, shield: 3400, speed: 60, turn: 18, slots: { broadside: 4, turret: 3, prow: 2, hangar: 2, module: 5 } },
  { tier: 7, name: 'Heavy Cruiser', len: 140, beam: 0.18, crew: [80, 124], hull: 8200, shield: 4300, speed: 54, turn: 15, slots: { broadside: 4, turret: 4, prow: 2, hangar: 2, module: 5 } },
  { tier: 8, name: 'Battlecruiser', len: 165, beam: 0.17, crew: [104, 150], hull: 10500, shield: 5400, speed: 52, turn: 13, slots: { broadside: 5, turret: 4, prow: 2, hangar: 2, module: 6 } },
  { tier: 9, name: 'Battleship', len: 195, beam: 0.18, crew: [130, 178], hull: 13500, shield: 6600, speed: 44, turn: 11.5, slots: { broadside: 6, turret: 5, prow: 2, hangar: 3, module: 6 } },
  { tier: 10, name: 'Dreadnought', len: 235, beam: 0.18, crew: [160, 200], hull: 17500, shield: 8200, speed: 38, turn: 10, slots: { broadside: 7, turret: 6, prow: 3, hangar: 3, module: 7 } },
];

// per-yard handling modifiers (multipliers)
const YARD_MOD = {
  velscour: { hull: 1.1, shield: 0.95, speed: 0.95, turn: 0.95, len: 1.0, slotBonus: 'broadside' },
  aurelian: { hull: 0.9, shield: 1.3, speed: 1.0, turn: 1.05, len: 1.0, slotBonus: 'turret' },
  tidewright: { hull: 0.85, shield: 0.95, speed: 1.25, turn: 1.15, len: 1.12, slotBonus: 'prow' },
  ironhold: { hull: 1.35, shield: 0.8, speed: 0.85, turn: 0.8, len: 0.95, slotBonus: 'broadside' },
  corsair: { hull: 1.0, shield: 0.9, speed: 1.1, turn: 1.1, len: 0.95, slotBonus: 'hangar' },
  hollow: { hull: 1.15, shield: 1.1, speed: 1.0, turn: 1.0, len: 1.05, slotBonus: 'module' },
};

export const CHASSIS = [];
for (const [yk, yard] of Object.entries(YARDS)) {
  if (yard.enemyOnly) continue;
  const mod = YARD_MOD[yk];
  CLASSES.forEach((c, i) => {
    const slots = { ...c.slots };
    if (c.tier >= 3) slots[mod.slotBonus] += 1;
    const id = `${yk}_${c.tier}`;
    CHASSIS.push({
      id, kind: 'ship', yard: yk, tier: c.tier, cls: c.name,
      name: `${yard.names[i]}`, fullName: `${yard.short} ${yard.names[i]}-class ${c.name}`,
      len: Math.round(c.len * mod.len), beam: c.beam, crew: c.crew.slice(),
      hull: Math.round(c.hull * mod.hull), shield: Math.round(c.shield * mod.shield),
      speed: +(c.speed * mod.speed).toFixed(1), turn: +(c.turn * mod.turn).toFixed(1),
      slots, level: Math.max(1, (c.tier - 2) * 6 + 1 + (yk === 'hollow' ? 4 : 0)),
      price: Math.round(450 * Math.pow(c.tier, 2.35) * (yk === 'hollow' ? 1.8 : 1) / 50) * 50,
      seed: (c.tier * 7919 + [...yk].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261)) >>> 0,
      arch: ARCH[c.tier], carrier: yk === 'corsair' && [6, 8, 10].includes(c.tier),
    });
  });
}
export const CHASSIS_BY_ID = Object.fromEntries(CHASSIS.map((c) => [c.id, c]));

// --- Planet exploration vehicles: 7 frames x 12 marks ---
// hp: [hardpoints at Mk I, at Mk XII]; a hardpoint takes a gun or a drone bay. Models are built in
// Blender (tools/blender, same numbers in tools/blender/frames.py) and grow with every mark.
export const EX_MARKS = 12;
export const EXPLORER_FRAMES = {
  skiff: { name: 'Skiff', blurb: 'Light hover skiff. Fast, fragile, great scanner.', hover: true, speed: 1.35, armor: 0.7, cargo: 0.8, hp: [1, 5], tool: 2, module: 2 },
  rover: { name: 'Rover', blurb: 'Six-wheeled survey rover. Big cargo hold, drills.', hover: false, speed: 1.0, armor: 1.0, cargo: 1.5, hp: [1, 6], tool: 3, module: 2 },
  strider: { name: 'Strider', blurb: 'Walker that grows from four legs to eight. Climbs anything, mounts heavy guns.', hover: false, legs: 4, speed: 0.85, armor: 1.3, cargo: 1.0, hp: [2, 7], tool: 2, module: 3 },
  gunship: { name: 'Gunship', blurb: 'VTOL gunship: two tilt-rotors at Mk I, eight ducted lifters by Mk XII.', hover: true, speed: 1.2, armor: 0.9, cargo: 0.7, hp: [2, 8], tool: 1, module: 2 },
  crawler: { name: 'Crawler', blurb: 'Tracked mining crawler. Slow, nearly indestructible.', hover: false, speed: 0.7, armor: 1.7, cargo: 2.0, hp: [1, 6], tool: 3, module: 3 },
  lancer: { name: 'Lancer', blurb: 'Assault hovertank with a spinal rail lance.', hover: true, speed: 1.05, armor: 1.2, cargo: 0.9, hp: [2, 7], tool: 1, module: 3 },
  seraph: { name: 'Seraph', blurb: 'Flying combat robot on thruster wings. Drone carrier: every swarm launches one more.', hover: true, speed: 1.15, armor: 0.85, cargo: 0.6, hp: [2, 8], tool: 1, module: 2, droneBonus: 1 },
};
const MARK = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const EXPLORER_NAMES = {
  skiff: ['Dart', 'Wisp', 'Swallow', 'Kestrel', 'Glint', 'Mirage', 'Zephyr', 'Phantom', 'Arrowlight', 'Skyreaver', 'Tempest', 'Halcyon'],
  rover: ['Mule', 'Prospector', 'Burro', 'Pathfinder', 'Trailhound', 'Sojourner', 'Wayfarer', 'Frontier', 'Conquistador', 'Odyssey', 'Caravan', 'Atlas'],
  strider: ['Mantis', 'Stalker', 'Heron', 'Arachne', 'Colossus', 'Talon', 'Ravager', 'Goliath', 'Titanwalk', 'Worldstrider', 'Behemoth', 'Ironspire'],
  gunship: ['Hornet', 'Wasp', 'Raptor', 'Harpy', 'Valkyrie', 'Banshee', 'Wyvern', 'Thunderhead', 'Stormcrow', 'Skyhammer', 'Maelstrom', 'Skyfortress'],
  crawler: ['Mole', 'Grub', 'Tortoise', 'Delver', 'Ironback', 'Bore', 'Deepcrusher', 'Monolith', 'Earthshaker', 'Worldeater', 'Mountainbreaker', 'Leviathan'],
  lancer: ['Pike', 'Glaive', 'Halberd', 'Partisan', 'Spear', 'Longinus', 'Javelin', 'Trident', 'Gungnir', 'Dawnspear', 'Sunlance', 'Starpiercer'],
  seraph: ['Sprite', 'Herald', 'Vigil', 'Warden', 'Paladin', 'Archon', 'Cherubim', 'Dominion', 'Throne', 'Virtue', 'Ophanim', 'Empyrean'],
};
// explorer level needed to build Mk m: 1, 5, 10, 14, 19, 23, 28, 32, 37, 41, 46, 50 (Mk XII at the cap)
export const exMarkLevel = (m) => 1 + Math.round((m - 1) * 49 / 11);
export const exHardpoints = (f, m) => f.hp[0] + Math.floor((m - 1) * (f.hp[1] - f.hp[0]) / 11);
export const EXPLORERS = [];
for (const [fk, f] of Object.entries(EXPLORER_FRAMES)) {
  for (let m = 1; m <= EX_MARKS; m++) {
    const eq = 1 + (m - 1) * 0.82;   // stat curve: Mk XII sits a little above the old Mk X
    EXPLORERS.push({
      id: `ex_${fk}_${m}`, kind: 'explorer', frame: fk, tier: m, cls: f.name,
      name: EXPLORER_NAMES[fk][m - 1], fullName: `${EXPLORER_NAMES[fk][m - 1]} ${f.name} Mk ${MARK[m - 1]}`,
      hp: Math.round(300 * Math.pow(eq, 1.35) * f.armor), speed: +(22 * f.speed * (1 + m * 0.025)).toFixed(1),
      cargo: Math.round(40 * eq * f.cargo),
      slots: { hp: exHardpoints(f, m), tool: f.tool + (m >= 7 ? 1 : 0), module: f.module + (m >= 4 ? 1 : 0) + (m >= 10 ? 1 : 0) },
      level: exMarkLevel(m), price: Math.round(600 * Math.pow(eq, 2.4)), hover: f.hover, legs: f.legs || 0, droneBonus: f.droneBonus || 0,
    });
  }
}
export const EXPLORER_BY_ID = Object.fromEntries(EXPLORERS.map((c) => [c.id, c]));
