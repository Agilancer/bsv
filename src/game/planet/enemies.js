// The planetary bestiary: 360 named designs — 12 families x 6 size classes x 5 roles.
//   small = swarms and fodder, mid = line troops, large = elites, epic = mini-bosses with a special,
//   legendary = phased bosses, gargantuan = set-piece monsters and war machines with weak points.
// Each entry carries its stats, AI archetype + attack pattern, where it lives, its level band and the
// visual parameters the procedural builder (creatureModels.js) turns into a body. Spawn tables draw
// from the roster by planet type, hazard and context (open surface / dungeon / lair).
// Pure data: importable in node.
import { RNG, hashStr } from '../../engine/rng.js';

export const SIZE_CLASSES = {
  small: { i: 0, name: 'Small', scale: 0.95, hp: 1, dmg: 1, speed: 1.0, xp: 1, pack: [4, 8], lvl: [-1, 1], minLevel: 1 },
  mid: { i: 1, name: 'Mid-sized', scale: 1.55, hp: 2.6, dmg: 1.55, speed: 0.95, xp: 2.6, pack: [2, 4], lvl: [0, 2], minLevel: 1 },
  large: { i: 2, name: 'Large', scale: 2.3, hp: 7, dmg: 2.3, speed: 0.82, xp: 7, pack: [1, 2], lvl: [1, 3], minLevel: 3 },
  epic: { i: 3, name: 'Epic', scale: 3.1, hp: 20, dmg: 3.2, speed: 0.75, xp: 22, pack: [1, 1], lvl: [2, 4], minLevel: 6, special: true },
  legendary: { i: 4, name: 'Legendary', scale: 4.1, hp: 30, dmg: 4.2, speed: 0.72, xp: 70, pack: [1, 1], lvl: [3, 5], minLevel: 9, boss: true, phases: 2 },
  gargantuan: { i: 5, name: 'Gargantuan', scale: 7.2, hp: 70, dmg: 5.8, speed: 0.55, xp: 200, pack: [1, 1], lvl: [4, 6], minLevel: 12, boss: true, phases: 3, weakPoints: 3 },
};
export const SIZE_KEYS = Object.keys(SIZE_CLASSES);

// AI archetypes: how a design behaves and attacks (stat multipliers on top of family x size)
export const ARCHETYPES = {
  swarm: { ai: 'melee', hp: 0.8, dmg: 0.8, speed: 1.25, cd: 0.8, range: 2.2, leap: true, role: 'Swarms in packs and leaps onto the hull' },
  charger: { ai: 'charger', hp: 1.3, dmg: 1.5, speed: 1.0, cd: 3.4, range: 3, role: 'Lowers its head and charges along a telegraphed line' },
  brute: { ai: 'brute', attack: 'boulder', hp: 1.6, dmg: 1.4, speed: 0.7, cd: 3, range: 7, far: 60, role: 'Slams the ground and hurls boulders' },
  spitter: { ai: 'ranged', attack: 'spit', hp: 0.9, dmg: 1.1, speed: 0.85, cd: 2.4, range: 40, keep: 24, role: 'Lobs corrosive globs from range' },
  gunner: { ai: 'ranged', attack: 'bolt', burst: 3, hp: 1.0, dmg: 0.55, speed: 0.9, cd: 1.6, range: 48, keep: 28, role: 'Rakes the explorer with bolt bursts' },
  sniper: { ai: 'sniper', attack: 'beam', hp: 0.8, dmg: 2.4, speed: 0.7, cd: 4.6, range: 85, keep: 60, role: 'Charges a long lance shot along a visible line' },
  artillery: { ai: 'artillery', attack: 'mortar', hp: 0.9, dmg: 1.7, speed: 0.6, cd: 4, range: 95, keep: 55, role: 'Shells your position from afar' },
  burrower: { ai: 'burrow', hp: 1.4, dmg: 1.5, speed: 1.0, cd: 1.1, range: 4, role: 'Tunnels beneath and erupts under you' },
  flyer: { ai: 'strafe', attack: 'bolt', float: 7.5, hp: 0.8, dmg: 0.7, speed: 1.35, cd: 1.0, range: 44, keep: 22, role: 'Circles overhead, strafing' },
  bomber: { ai: 'strafe', attack: 'bomb', float: 9, hp: 1.0, dmg: 1.5, speed: 1.1, cd: 2.2, range: 26, keep: 8, role: 'Passes overhead dropping bombs' },
  kamikaze: { ai: 'kamikaze', hp: 0.5, dmg: 3.2, speed: 1.5, cd: 0, range: 3, role: 'Sprints straight at you and detonates' },
  shielder: { ai: 'support', support: 'shield', attack: 'bolt', hp: 1.5, dmg: 0.45, speed: 0.8, cd: 2.2, range: 36, keep: 26, role: 'Projects shields over nearby allies' },
  healer: { ai: 'support', support: 'heal', attack: 'bolt', hp: 1.0, dmg: 0.4, speed: 0.85, cd: 2.2, range: 36, keep: 30, role: 'Mends wounded allies with a tether' },
  summoner: { ai: 'summoner', attack: 'spit', hp: 1.2, dmg: 0.7, speed: 0.75, cd: 2.6, range: 40, keep: 30, spawnCd: 8, role: 'Calls reinforcements of its kind' },
  turret: { ai: 'static', attack: 'bolt', hp: 2.2, dmg: 0.85, speed: 0, cd: 0.5, range: 66, role: 'Fixed gun emplacement' },
  emplacement: { ai: 'static', attack: 'mortar', hp: 2.4, dmg: 1.6, speed: 0, cd: 3.4, range: 100, role: 'Fortified mortar pit' },
  nova: { ai: 'ranged', attack: 'nova', hp: 1.2, dmg: 0.9, speed: 0.8, cd: 3.5, range: 30, keep: 16, role: 'Pulses rings of shards around itself' },
};

// families: body plan, home worlds, palette, base stats, drops, attack colour, boss specials
export const FAMILIES = {
  hive: { name: 'Swarm bugs', plan: 'bug', planets: ['terran', 'toxic', 'desert', 'arid', 'crystal'], hp: 36, dmg: 6, speed: 14, radius: 1.2,
    colors: [0x5a4a60, 0x6a5a40, 0x4a5a3a, 0x704838, 0x3a4a5a], glows: [0x9aff40, 0xffd040, 0x40ffd0, 0xff6040], ichor: 0x9aff40, bolt: 0xa8ff40, drops: { biomass: 0.5 }, special: 'barrage' },
  burrower: { name: 'Burrowers', plan: 'worm', planets: ['desert', 'lava', 'toxic', 'ice', 'arid'], hp: 60, dmg: 10, speed: 14, radius: 1.6,
    colors: [0x8a6a58, 0x7a5040, 0x6a7080, 0x8a8060], glows: [0xff5030, 0xffa040, 0x60d0ff], ichor: 0xff8040, bolt: 0xffa040, drops: { isotope: 0.4, biomass: 0.4 }, special: 'quake' },
  lithic: { name: 'Rock golems', plan: 'golem', planets: ['arid', 'lava', 'barren', 'ice', 'desert'], hp: 90, dmg: 12, speed: 7, radius: 1.0,
    colors: [0xffffff, 0xd8c8b8, 0xb8b0c8], glows: [0xffa040, 0xff5020, 0x70c8ff, 0xd080ff], ichor: 0xffa040, bolt: 0xffa050, drops: { ore: 1.4, crystal: 0.3 }, special: 'quake' },
  crystal: { name: 'Crystal sentinels', plan: 'sentinel', planets: ['crystal', 'ice', 'barren'], hp: 55, dmg: 6, speed: 9, radius: 1.0,
    colors: [0xd070ff, 0x70d0ff, 0xff70c0, 0xa0ffe0], glows: [0xd070ff, 0x70d0ff, 0xffffff], ichor: 0xd080ff, bolt: 0xd070ff, drops: { crystal: 1.4 }, special: 'nova' },
  drone: { name: 'Rogue drones', plan: 'drone', planets: ['barren', 'terran', 'ice', 'arid', 'desert'], hp: 28, dmg: 4, speed: 20, radius: 0.9,
    colors: [0x9a9ea8, 0x8a8070, 0x606878], glows: [0xff4040, 0xffa020, 0x40c0ff], ichor: 0xff6040, bolt: 0xff4a3a, drops: { datacore: 0.12, ore: 0.3 }, special: 'missiles', mech: true },
  mech: { name: 'Rogue war-mechs', plan: 'mech', planets: ['barren', 'arid', 'desert', 'lava'], hp: 60, dmg: 6, speed: 10, radius: 1.1,
    colors: [0x9a9890, 0xb0a890, 0x707880], glows: [0xff5030, 0xffd040, 0x50a0ff], ichor: 0xff6040, bolt: 0xff6a3a, drops: { ore: 0.6, datacore: 0.1 }, special: 'missiles', mech: true },
  corsair: { name: 'Corsair ground forces', plan: 'mech', planets: ['arid', 'desert', 'barren', 'terran', 'lava'], hp: 50, dmg: 5, speed: 11, radius: 1.0,
    colors: [0xb0a890, 0xa08060, 0x8a8a7a], glows: [0xff5030, 0xff3060], ichor: 0xff6040, bolt: 0xff4a3a, drops: { ore: 0.4, datacore: 0.08 }, special: 'barrage', mech: true, pirate: true },
  fungal: { name: 'Xeno-flora', plan: 'flora', planets: ['toxic', 'terran', 'crystal'], hp: 45, dmg: 6, speed: 9, radius: 1.2,
    colors: [0x9a60c0, 0x5a8a40, 0xc09040, 0x40a090], glows: [0xa0ff40, 0x60ffd0, 0xff70ff], ichor: 0xa0ff60, bolt: 0xb0ff50, drops: { biomass: 1.0 }, special: 'barrage' },
  magma: { name: 'Lava elementals', plan: 'elemental', planets: ['lava', 'arid'], hp: 55, dmg: 8, speed: 10, radius: 1.1,
    colors: [0x3a3230, 0x4a3a30, 0x2a2624], glows: [0xff5a10, 0xffa020, 0xff3010], ichor: 0xff7020, bolt: 0xff7020, drops: { isotope: 0.7, ore: 0.4 }, special: 'nova' },
  frost: { name: 'Ice elementals', plan: 'elemental', planets: ['ice', 'crystal'], hp: 55, dmg: 7, speed: 10, radius: 1.1,
    colors: [0xc8e0f0, 0x9ab8d8, 0xe0f0ff], glows: [0x70d0ff, 0xa0f0ff, 0x80a0ff], ichor: 0x90e0ff, bolt: 0x80d8ff, drops: { crystal: 0.9, isotope: 0.2 }, special: 'nova' },
  guardian: { name: 'Precursor guardians', plan: 'guardian', planets: ['terran', 'desert', 'arid', 'ice', 'lava', 'barren', 'toxic', 'crystal'], hp: 70, dmg: 8, speed: 8, radius: 1.1,
    colors: [0x403848, 0x384050, 0x50404a], glows: [0xc080ff, 0x60e0ff, 0xffd060], ichor: 0xc080ff, bolt: 0xc080ff, drops: { relic: 0.12, datacore: 0.2 }, special: 'beam', rare: true },
  velscour: { name: 'Reliquary automata', plan: 'guardian', gothic: true, planets: ['barren', 'arid', 'ice', 'lava', 'desert'], hp: 65, dmg: 7, speed: 9, radius: 1.1,
    colors: [0x5a5050, 0x6a6058, 0x4a4448], glows: [0xff9a3a, 0xffd080, 0xff5a20], ichor: 0xffa050, bolt: 0xffa040, drops: { relic: 0.08, datacore: 0.15, ore: 0.3 }, special: 'barrage', rare: true, mech: true },
};

// [name, archetype] per family per size class
const R = (s) => s.split('|').map((x) => { const [n, a] = x.split(':'); return [n.trim(), a.trim()]; });
const ROSTER = {
  hive: {
    small: R('Skitterling:swarm|Needlemite:swarm|Acid Tick:spitter|Brood Larva:kamikaze|Glowgnat:flyer'),
    mid: R('Hive Warrior:swarm|Spitter Drone:spitter|Lancer Beetle:charger|Carapace Crawler:shielder|Pheromite:summoner'),
    large: R('Brood Guard:brute|Siege Mantis:charger|Bile Behemoth:artillery|Hive Lancer:sniper|Stalker Prime:swarm'),
    epic: R('Brood Tyrant:summoner|Mantis Reaper:charger|Acid Matron:artillery|Carapace Juggernaut:brute|Swarmcaller:summoner'),
    legendary: R('Hive Matriarch:summoner|The Chittering King:charger|Reaper Empress:swarm|Bloated Progenitor:artillery|Mantis Lord Vyx:charger'),
    gargantuan: R('World-Hive Leviathan:summoner|Brood Mother Ascendant:artillery|Chitin Colossus:brute|Queen of the Endless Swarm:summoner|Hive-Titan Ozzrak:charger'),
  },
  burrower: {
    small: R('Sandgrub:burrower|Burrow Leech:swarm|Tunnel Mite:kamikaze|Dust Eel:burrower|Rockgnawer:swarm'),
    mid: R('Burrower:burrower|Dune Lurker:burrower|Cinder Eel:spitter|Grinder Worm:charger|Ambush Maw:burrower'),
    large: R('Sandwyrm:burrower|Magma Borer:burrower|Frost Burrower:burrower|Gravel Maw:spitter|Spined Delver:charger'),
    epic: R('Elder Burrower:burrower|Ashmaw:spitter|Glacier Wyrm:burrower|Grinding Dread:charger|Tremor Lord:burrower'),
    legendary: R('Elder Wyrm:burrower|Sandmother Ssyrra:burrower|The Endless Maw:charger|Magma Wyrm Kolos:spitter|Rimeback Devourer:burrower'),
    gargantuan: R('World-Worm:burrower|Shai-Kolah the Earthbreaker:burrower|The Abyssal Coil:charger|Planetgut Leviathan:burrower|Tectonic Wyrm:spitter'),
  },
  lithic: {
    small: R('Pebblekin:swarm|Shard Imp:kamikaze|Rubble Mite:swarm|Gravelborn:spitter|Stoneling:charger'),
    mid: R('Rock Golem:brute|Boulderhurler:artillery|Slatecrusher:charger|Basalt Warder:shielder|Cragling Shaman:healer'),
    large: R('Monolith Golem:brute|Avalanche Brute:charger|Obsidian Sentry:turret|Quarry Titan:brute|Shalebreaker:artillery'),
    epic: R('Granite Warlord:brute|The Rockslide:charger|Obsidian Juggernaut:brute|Earthshaper:summoner|Mountain\'s Fist:brute'),
    legendary: R('Colossus of the Deep Crust:brute|Basalt King:brute|The Walking Quarry:artillery|Petrified Sovereign:summoner|Avalanche Lord:charger'),
    gargantuan: R('Living Mountain:brute|Titan of the Spine Range:brute|The Unmoving Throne:artillery|Continental Golem:charger|Craton Colossus:brute'),
  },
  crystal: {
    small: R('Prism Mote:flyer|Shardling:swarm|Glint Wisp:kamikaze|Refractor Seed:gunner|Lumen Spark:flyer'),
    mid: R('Crystal Sentinel:gunner|Prism Warden:shielder|Lattice Weaver:healer|Shard Lancer:sniper|Resonator:nova'),
    large: R('Spire Sentinel:sniper|Prism Colossus:nova|Lens Tyrant:sniper|Choir Pillar:healer|Facet Guardian:shielder'),
    epic: R('Prism Archon:nova|Refraction Engine:sniper|The Singing Spire:summoner|Lattice Mother:healer|Shatterlord:nova'),
    legendary: R('Crystal Colossus:nova|Archon of Facets:sniper|Hymn of Glass:summoner|Prismatic Sovereign:nova|The Lumen Throne:sniper'),
    gargantuan: R('Cathedral of Crystal:nova|The Shardmind:summoner|Geode Titan:nova|World Prism:sniper|Resonant Colossus:nova'),
  },
  drone: {
    small: R('Scout Drone:flyer|Gnat Drone:flyer|Sparker:kamikaze|Swarm Bot:swarm|Kamikaze Pod:kamikaze'),
    mid: R('Rogue Drone:flyer|Gunship Drone:gunner|Repair Drone:healer|Shield Drone:shielder|Hunter-Killer:flyer'),
    large: R('Warden Drone:gunner|Bomber Drone:bomber|Drone Carrier:summoner|Siege Drone:artillery|Sentinel Platform:sniper'),
    epic: R('Overseer Mk II:summoner|Hive Node:summoner|Storm Drone:bomber|Annihilator Platform:sniper|Swarm Mind:summoner'),
    legendary: R('Iron Overseer:summoner|Orbital Watcher:sniper|The Drone Queen:summoner|Eclipse Platform:bomber|Machine Saint Vel:gunner'),
    gargantuan: R('Skyfortress Aegis:gunner|The Swarm Cathedral:summoner|Dreadnought Drone:bomber|Mothership Hollow-9:summoner|Godmind Array:sniper'),
  },
  mech: {
    small: R('Scrap Walker:gunner|Spider Bot:swarm|Rivet Crawler:kamikaze|Servo Hound:charger|Bolt Bug:swarm'),
    mid: R('War Mech:gunner|Sentry Walker:turret|Flamer Mech:charger|Lancer Frame:sniper|Mortar Strider:artillery'),
    large: R('Siege Walker:artillery|Juggernaut Frame:charger|Heavy Mech:gunner|Assault Strider:gunner|Reactor Walker:shielder'),
    epic: R('Titan Frame:gunner|Executioner Mech:sniper|Warmonger Strider:artillery|Siegebreaker:charger|Foundry Overlord:summoner'),
    legendary: R('Dreadwalker:gunner|The Iron Pope:summoner|Engine of Ruin:artillery|Marshal Cog:gunner|Warforged Sovereign:charger'),
    gargantuan: R('Walking Fortress:artillery|Citadel Strider:gunner|Land Dreadnought:artillery|The Iron Cathedral:summoner|Siege Titan Ostrakon:gunner'),
  },
  corsair: {
    small: R('Corsair Scav:gunner|Deck Rat:swarm|Sapper:kamikaze|Scrapper:charger|Gun Nest:turret'),
    mid: R('Corsair Trooper:gunner|Corsair Gunner:gunner|Corsair Medic:healer|Shield Bearer:shielder|Mortar Pit:emplacement'),
    large: R('Corsair Brute:charger|Rocket Trooper:artillery|Corsair Captain:summoner|Rail Bastion:turret|Flame Trooper:charger'),
    epic: R('Corsair Warboss:summoner|Sniper Ace:sniper|Juggernaut Raider:charger|Pyre Captain:artillery|Warlord\'s Champion:gunner'),
    legendary: R('Warlord Kessk:summoner|Black Admiral Harrow:artillery|Queen Magpie:gunner|Iron Jackal:charger|The Red Prospector:sniper'),
    gargantuan: R('Corsair Landship:artillery|Crawler Fortress Blackjack:gunner|The Rust Leviathan:summoner|Siege Barge Kingslayer:artillery|Warhost Behemoth:charger'),
  },
  fungal: {
    small: R('Sporeling:swarm|Puffball:kamikaze|Creeping Mold:swarm|Glowcap Mite:spitter|Spore Tick:swarm'),
    mid: R('Fungal Walker:brute|Spore Spitter:spitter|Mycelid:healer|Rot Shambler:charger|Bloomcaller:summoner'),
    large: R('Myconid Brute:brute|Spore Cannon:artillery|Rot Colossus:brute|Glowshroom Hulk:shielder|Bloom Mother:summoner'),
    epic: R('Fungal Tyrant:brute|The Rotting Garden:summoner|Sporelord:artillery|Mycelial Heart:healer|Blight Shepherd:summoner'),
    legendary: R('The Mycelium Queen:summoner|Old Rot:brute|Sporemind Ygg:artillery|The Weeping Bloom:spitter|Blightfather:summoner'),
    gargantuan: R('World-Fungus:summoner|The Garden That Walks:brute|Spore Leviathan:artillery|Mycelial Titan:brute|Rot Cathedral:summoner'),
  },
  magma: {
    small: R('Ember Imp:swarm|Cinder Sprite:flyer|Slag Mite:kamikaze|Ash Wisp:flyer|Spark Hound:charger'),
    mid: R('Magma Elemental:nova|Cinder Hurler:artillery|Lava Leaper:charger|Ash Shaman:healer|Slag Walker:brute'),
    large: R('Magma Brute:brute|Caldera Golem:nova|Pyroclast:artillery|Furnace Heart:shielder|Obsidian Burner:sniper'),
    epic: R('Inferno Lord:nova|Caldera Tyrant:brute|The Living Eruption:artillery|Ashen Prophet:summoner|Magma Juggernaut:charger'),
    legendary: R('Pyre King Vulkhar:nova|The Molten Crown:artillery|Heart of the Volcano:summoner|Ashen Colossus:brute|Cinderqueen:nova'),
    gargantuan: R('Volcano Titan:artillery|The Walking Caldera:nova|Magma Leviathan:brute|Firestorm Colossus:nova|World-Forge:summoner'),
  },
  frost: {
    small: R('Frost Mote:flyer|Rime Wisp:flyer|Snow Mite:swarm|Ice Shard:kamikaze|Chill Sprite:gunner'),
    mid: R('Frost Wraith:flyer|Ice Elemental:nova|Glacier Hound:charger|Hailcaller:artillery|Rime Warden:shielder'),
    large: R('Glacier Golem:brute|Frost Giant:brute|Blizzard Elemental:nova|Icefang Brute:charger|Permafrost Sentinel:sniper'),
    epic: R('Winter Tyrant:nova|The Whiteout:summoner|Glacial Archon:sniper|Frostbound Juggernaut:brute|Avalanche Wraith:charger'),
    legendary: R('Rime Sovereign:nova|The Frozen King:summoner|Blizzard Queen Isska:artillery|Hoarfrost Colossus:brute|The Long Winter:nova'),
    gargantuan: R('Glacier Leviathan:charger|Ice Age Titan:brute|The Frozen Throne:nova|Permafrost Colossus:brute|World-Glacier:artillery'),
  },
  guardian: {
    small: R('Vault Wisp:flyer|Glyph Drone:gunner|Warden Orb:shielder|Sigil Mite:kamikaze|Relic Spark:flyer'),
    mid: R('Precursor Guardian:gunner|Glyph Warden:shielder|Vault Sentry:turret|Obelisk Walker:brute|Rune Caster:healer'),
    large: R('Vault Keeper:brute|Obelisk Titan:sniper|Glyph Colossus:nova|Archive Warden:summoner|Rune Bastion:emplacement'),
    epic: R('Precursor Archon:nova|The Keeper of Doors:summoner|Glyphlord:sniper|Vault Executioner:charger|Sentinel of Ages:gunner'),
    legendary: R('Ancient Guardian:nova|The Last Precursor:summoner|Archivist Prime:sniper|The Sealed King:brute|Keeper of the Vault:nova'),
    gargantuan: R('Precursor Colossus:nova|The Vault Itself:summoner|Ancient War Engine:artillery|Gatekeeper of Eons:sniper|The Sleeping God:nova'),
  },
  velscour: {
    small: R('Censer Mite:kamikaze|Reliquary Cherub:flyer|Candle Wisp:flyer|Bell Drone:gunner|Ossuary Crawler:swarm'),
    mid: R('Reliquary Automaton:gunner|Censer Bearer:artillery|Chorister Frame:healer|Penitent Engine:charger|Litany Drone:shielder'),
    large: R('Cathedral Warden:brute|Bell-Tower Walker:artillery|Sepulchre Guard:shielder|Requiem Frame:gunner|Ossuary Knight:charger'),
    epic: R('Cardinal Engine:summoner|The Tolling Bell:nova|Reliquary Paladin:charger|Saint of Rivets:healer|Inquisitor Frame:sniper'),
    legendary: R('The Velscour Martyr:nova|Archdeacon Ironpsalm:summoner|The Reliquary Saint:sniper|Choir of Ash:artillery|Pontifex Engine:gunner'),
    gargantuan: R('Walking Cathedral:artillery|The Basilica Titan:nova|Throne of Velscour Reborn:summoner|Sepulchre Colossus:brute|The Great Requiem:nova'),
  },
};

// which plan an archetype uses within a family (defaults to the family plan)
function planFor(fam, arch) {
  if (fam === 'hive') return arch === 'spitter' || arch === 'artillery' || arch === 'summoner' ? 'spitter' : 'bug';
  if (fam === 'mech' || fam === 'corsair') return arch === 'turret' || arch === 'emplacement' ? 'turret' : 'mech';
  if (fam === 'guardian' && arch === 'flyer') return 'sentinel';
  if (fam === 'lithic' && arch === 'turret') return 'golem';
  if ((fam === 'magma' || fam === 'frost') && (arch === 'brute' || arch === 'charger')) return 'golem';
  if (fam === 'drone' && (arch === 'swarm')) return 'drone';
  return FAMILIES[fam].plan;
}

// per-planet family weights for open-surface spawning
export const PLANET_FAMILIES = {
  terran: { hive: 4, fungal: 2, drone: 1.5, corsair: 1.5, guardian: 0.5 },
  desert: { burrower: 3.5, hive: 2, corsair: 2.5, lithic: 1, drone: 1, guardian: 0.5, velscour: 0.4 },
  arid: { lithic: 3, corsair: 3, hive: 1.5, mech: 1.5, magma: 0.6, burrower: 1, velscour: 0.4 },
  ice: { frost: 3.5, crystal: 2, lithic: 1.5, drone: 1.5, burrower: 1, velscour: 0.4 },
  lava: { magma: 4, lithic: 2.5, burrower: 2, mech: 1, corsair: 0.6, velscour: 0.4 },
  barren: { drone: 3, mech: 3, corsair: 2, crystal: 1, lithic: 1, guardian: 0.6, velscour: 0.8 },
  toxic: { hive: 3.5, fungal: 4, burrower: 1.5 },
  crystal: { crystal: 4, frost: 1.5, hive: 1.5, fungal: 1, guardian: 1 },
};

// ---------------- build the roster ----------------
export const ENEMIES = [];
const pct = (x) => Math.round(x * 100) / 100;
for (const [fk, fam] of Object.entries(FAMILIES)) {
  for (const sk of SIZE_KEYS) {
    const sz = SIZE_CLASSES[sk];
    ROSTER[fk][sk].forEach(([name, ak], i) => {
      const A = ARCHETYPES[ak];
      const id = `${fk}_${sk}_${i}`;
      const rng = new RNG(hashStr(id + name));
      const plan = planFor(fk, ak);
      const boss = !!sz.boss;
      const scale = sz.scale * rng.float(0.9, 1.1) * (plan === 'worm' && sk !== 'small' ? 0.9 : 1) * (plan === 'golem' ? 0.62 : plan === 'turret' ? 0.95 : 1);
      // a few designs per family/size can live on worlds beyond the family's usual range
      const planets = fam.planets.slice();
      if (rng.chance(0.15)) { const extra = rng.pick(Object.keys(PLANET_FAMILIES)); if (!planets.includes(extra)) planets.push(extra); }
      const vis = {
        plan, color: rng.pick(fam.colors), glow: rng.pick(fam.glows),
        legs: plan === 'bug' ? rng.pick([4, 6, 6, 8]) : plan === 'mech' ? (ak === 'artillery' || sk === 'gargantuan' ? 4 : rng.pick([2, 2, 4])) : plan === 'guardian' ? rng.pick([2, 2, 0]) : plan === 'flora' ? rng.pick([3, 4, 5]) : 0,
        segs: plan === 'worm' ? 6 + sz.i * 2 + rng.int(0, 2) : 0,
        spikes: rng.int(0, 2) + sz.i, horns: rng.chance(0.4 + sz.i * 0.1), armor: rng.chance(0.25 + sz.i * 0.12),
        stretch: pct(rng.float(0.85, 1.25)), wings: plan === 'bug' && (ak === 'flyer' || ak === 'bomber'), crown: sz.i >= 4,
        eyes: rng.int(1, 3), gothic: !!fam.gothic, pirate: !!fam.pirate, weak: sz.weakPoints || 0, variant: i,
      };
      const e = {
        id, name, family: fk, familyName: fam.name, sizeClass: sk, size: sz.i, archetype: ak, ai: A.ai, attack: A.attack || null, role: A.role,
        planets, boss, phases: sz.phases || 1, weakPoints: sz.weakPoints || 0, special: (sz.special || boss) ? fam.special : null,
        hp: Math.round(fam.hp * sz.hp * A.hp), dmg: pct(fam.dmg * sz.dmg * A.dmg), speed: pct(fam.speed * sz.speed * A.speed),
        radius: pct(fam.radius * (plan === 'worm' ? 1.2 : plan === 'golem' ? 2.6 : plan === 'turret' ? 2 : plan === 'spitter' ? 1.7 : plan === 'drone' ? 1.6 : plan === 'sentinel' ? 1.8 : plan === 'guardian' ? 1.5 : plan === 'elemental' ? 1.6 : plan === 'flora' ? 1.5 : 1)),
        scale: pct(scale), cd: A.cd, range: A.range ? pct(A.range * (1 + sz.i * 0.12)) : 0, keep: A.keep || 0, far: A.far || 0, float: A.float ? pct(A.float * (1 + sz.i * 0.15)) : plan === 'sentinel' || plan === 'drone' ? 4 + sz.i * 1.2 : plan === 'elemental' ? 1.5 + sz.i * 0.6 : 0,
        burst: A.burst || 0, leap: !!A.leap, support: A.support || null, spawnCd: A.spawnCd || (boss ? 10 : 0),
        xp: Math.round(8 * sz.xp * (A.hp + A.dmg) / 2), pack: sz.pack.slice(),
        levelBand: [sz.minLevel, 60], lvlOffset: sz.lvl.slice(),
        drops: { ...fam.drops }, ichor: fam.ichor, bolt: fam.bolt, mech: !!fam.mech, rare: !!fam.rare, vis,
      };
      if (ak === 'swarm' || ak === 'kamikaze') e.pack = [sz.pack[0] + 1, sz.pack[1] + 2];
      if (ak === 'turret' || ak === 'emplacement' || ak === 'sniper' || ak === 'artillery') e.pack = [Math.max(1, sz.pack[0] - 1), Math.max(1, sz.pack[1] - 1)];
      ENEMIES.push(e);
    });
  }
}
export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

// ---------------- spawn tables ----------------
const CONTEXT_SIZE = {
  surface: (hz) => [5, 4, hz >= 2 ? 0.8 + hz * 0.35 : 0.35, hz >= 3 ? 0.12 * hz : 0, 0, 0],
  dungeon: (hz) => [3, 5, 2.2 + hz * 0.3, 0.4 + hz * 0.2, 0, 0],
  lair: (hz) => [1, 2, 2.5, 1.2, 0, 0],
};
// family weights: the planet's own, optionally overridden (dungeon themes bring their own residents)
function famWeights(type, fam) {
  const base = PLANET_FAMILIES[type] || PLANET_FAMILIES.barren;
  if (!fam) return base;
  const out = {};
  for (const [k, v] of Object.entries(base)) out[k] = v * 0.3;
  for (const [k, v] of Object.entries(fam)) out[k] = (out[k] || 0) + v;
  return out;
}
const lives = (e, type, fam) => e.planets.includes(type) || !!(fam && fam[e.family]);

// weighted [entry, weight] for a planet type, hazard (1-5) and context
export function spawnTable(type, hazard, context = 'surface', level = 99, fam = null) {
  const fw = famWeights(type, fam);
  const sw = (CONTEXT_SIZE[context] || CONTEXT_SIZE.surface)(hazard);
  const out = [];
  for (const e of ENEMIES) {
    if (!lives(e, type, fam)) continue;
    const w = (fw[e.family] || (context === 'dungeon' && e.rare ? 1.2 : 0.15)) * sw[e.size];
    if (w <= 0) continue;
    if (level < e.levelBand[0] && context !== 'lair') continue;
    out.push([e, w * (e.rare && context !== 'dungeon' ? 0.6 : 1)]);
  }
  return out;
}
// a pack: one design (sometimes with an escort of smaller kin)
export function pickPack(rng, type, hazard, context, level, fam = null) {
  const table = spawnTable(type, hazard, context, level, fam);
  if (!table.length) return null;
  const e = rng.weighted(table);
  const count = rng.int(e.pack[0], e.pack[1] + (hazard >= 4 && e.size <= 1 ? 2 : 0));
  const lvl = Math.max(1, level + rng.int(e.lvlOffset[0], e.lvlOffset[1]) - 1);
  const elite = e.size >= 1 && e.size <= 2 && rng.chance(0.06 + hazard * 0.03 + (context === 'dungeon' ? 0.1 : 0));
  let escort = null;
  if (e.size >= 2) {
    const kin = ENEMIES.filter((x) => x.family === e.family && x.size === 0 && lives(x, type, fam) && x.ai !== 'static');
    if (kin.length && rng.chance(0.6)) escort = { entry: rng.pick(kin), count: rng.int(2, 4) };
  }
  return { entry: e, count, level: lvl, elite, escort };
}
// the apex of a lair or dungeon: legendary, or gargantuan on harsh worlds
export function pickBoss(rng, type, hazard, context = 'lair', fam = null) {
  const fw = famWeights(type, fam);
  const garg = hazard >= 5 || (hazard >= 3 && rng.chance(0.4 + (context === 'dungeon' ? 0.15 : 0))) || (hazard >= 2 && rng.chance(0.15));
  const size = garg ? 5 : 4;
  const pool = ENEMIES.filter((e) => e.size === size && lives(e, type, fam) && e.ai !== 'static').map((e) => [e, (fw[e.family] || 0.2)]);
  return rng.weighted(pool.length ? pool : ENEMIES.filter((e) => e.size === size).map((e) => [e, 1]));
}
// mini-boss for dungeon vaults / ruin guardians
export function pickEpic(rng, type, fam = null) {
  const fw = famWeights(type, fam);
  const pool = ENEMIES.filter((e) => e.size === 3 && lives(e, type, fam)).map((e) => [e, fw[e.family] || 0.3]);
  return pool.length ? rng.weighted(pool) : null;
}
