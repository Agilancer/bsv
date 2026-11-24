// The space bestiary: 360 enemy ship designs.
// Six size classes (small, mid, large, epic, legendary, gargantuan) x ten combat roles x six
// factions. A design = faction look + role behaviour + size. Roles are what make a size class
// feel different: smalls swarm, ram, mine and board; mids hold the line, screen and heal;
// larges besiege, snare and command; epics are mini-bosses with a signature attack;
// legendaries are multi-phase bosses; gargantuans are set-piece raid fights against things
// that dwarf a dreadnought. Pure data — importable in node.

export const SIZES = [
  { k: 'small', name: 'Small', tiers: [1, 2], len: [20, 46], hull: 0.55, shield: 0.5, xp: 0.6, loot: 0.6, minDanger: 1, color: '#c4cad6' },
  { k: 'mid', name: 'Mid-sized', tiers: [3, 4], len: [52, 96], hull: 1, shield: 1, xp: 1, loot: 1.2, minDanger: 2, color: '#4ade80' },
  { k: 'large', name: 'Large', tiers: [5, 7], len: [104, 160], hull: 1.4, shield: 1.3, xp: 2, loot: 2.2, minDanger: 7, color: '#4f9dff' },
  { k: 'epic', name: 'Epic', tiers: [7, 8], len: [170, 240], hull: 3, shield: 2.4, xp: 5, loot: 4, minDanger: 13, color: '#b46bff', boss: 1 },
  { k: 'legendary', name: 'Legendary', tiers: [9, 10], len: [250, 340], hull: 7, shield: 4, xp: 14, loot: 7, minDanger: 20, color: '#ff9a2e', boss: 2, phases: [0.66, 0.33] },
  { k: 'gargantuan', name: 'Gargantuan', tiers: [10, 10], len: [420, 900], hull: 16, shield: 8, xp: 40, loot: 12, minDanger: 26, color: '#ff3b5c', boss: 2, phases: [0.75, 0.5, 0.25] },
];
export const SIZE_BY_KEY = Object.fromEntries(SIZES.map((s, i) => [s.k, { ...s, i }]));

// ai: brawler (broadside line), prow (nose on), sniper (max range), kamikaze (rams and
// detonates), orbit (fast circling strafe), support (stays with allies), carrier (stands off),
// boarder (latches on), lurker (cloaked ambush), artillery (long-range telegraphed shells)
// w: weapons by slot; specials: names in ai/specials.js; stat multipliers
export const ROLES = {
  small: [
    { k: 'interceptor', name: 'Interceptor', ai: 'orbit', w: { turret: ['laser'], broadside: ['plasma'] }, speed: 1.35, turn: 1.4, hull: 0.8, beam: 0.15, desc: 'Fast and nimble; circles and strafes.' },
    { k: 'gunboat', name: 'Gunboat', ai: 'brawler', w: { broadside: ['macrocannon', 'carronade'], turret: ['autocannon'] }, hull: 1.1, beam: 0.22, desc: 'A floating gun platform that trades broadsides.' },
    { k: 'torpedo', name: 'Torpedo Boat', ai: 'prow', w: { prow: ['torpedo'], turret: ['autocannon'] }, speed: 1.15, beam: 0.16, desc: 'Runs in, looses torpedoes, turns away.' },
    { k: 'fireship', name: 'Fireship', ai: 'kamikaze', w: { turret: ['flak'] }, speed: 1.5, turn: 1.2, hull: 0.7, beam: 0.14, specials: ['detonate'], desc: 'A hull packed with explosives. Kill it before it reaches you.' },
    { k: 'minelayer', name: 'Minelayer', ai: 'sniper', w: { turret: ['autocannon'] }, specials: ['mines'], beam: 0.2, desc: 'Seeds proximity mines across your path.' },
    { k: 'harrier', name: 'Harrier', ai: 'orbit', w: { turret: ['missile'] }, speed: 1.3, turn: 1.3, hull: 0.8, beam: 0.15, desc: 'Missile skirmisher that never stops moving.' },
    { k: 'boarder', name: 'Boarding Skiff', ai: 'boarder', w: { turret: ['autocannon'] }, speed: 1.45, hull: 1.1, beam: 0.18, specials: ['board'], desc: 'Latches onto your hull and sends a boarding party. Evasive manoeuvres shake it loose.' },
    { k: 'spotter', name: 'Spotter', ai: 'sniper', w: { turret: ['laser'] }, specials: ['spot'], speed: 1.2, hull: 0.7, beam: 0.14, desc: 'Paints you for its friends: everything nearby hits harder while it lives.' },
    { k: 'swarmer', name: 'Swarmer', ai: 'orbit', w: { turret: ['autocannon'] }, speed: 1.5, turn: 1.6, hull: 0.5, beam: 0.13, pack: 3, desc: 'Comes in clouds. Flak shreds them.' },
    { k: 'ionskiff', name: 'Ion Skiff', ai: 'orbit', w: { turret: ['ion'] }, specials: ['ionDrain'], speed: 1.2, hull: 0.8, beam: 0.15, desc: 'Strips shields and slows your engines.' },
  ],
  mid: [
    { k: 'frigate', name: 'Frigate', ai: 'brawler', w: { broadside: ['macrocannon', 'lance'], turret: ['autocannon'], prow: ['torpedo'] }, desc: 'The backbone of every fleet: a steady broadside.' },
    { k: 'destroyer', name: 'Destroyer', ai: 'prow', w: { prow: ['torpedo', 'torpedo'], broadside: ['carronade'], turret: ['flak'] }, speed: 1.15, specials: ['torpStorm'], desc: 'Torpedo spreads from the prow.' },
    { k: 'escort', name: 'Escort', ai: 'support', w: { turret: ['flak', 'flak'], broadside: ['carronade'] }, specials: ['shieldAura'], hull: 1.1, desc: 'Screens its allies with flak and shield projection.' },
    { k: 'lightcarrier', name: 'Light Carrier', ai: 'carrier', w: { hangar: ['fighters', 'bombers'], turret: ['flak'] }, hull: 0.9, desc: 'Hangs back while its wings do the fighting.' },
    { k: 'gunship', name: 'Gunship', ai: 'prow', w: { prow: ['nova'], turret: ['autocannon', 'laser'] }, hull: 1.2, specials: ['artillery'], desc: 'Lobs telegraphed heavy shells. Watch for the warning rings.' },
    { k: 'raider', name: 'Raider', ai: 'orbit', w: { broadside: ['plasma'], turret: ['missile'] }, speed: 1.3, turn: 1.2, hull: 0.85, desc: 'Hit-and-run predator.' },
    { k: 'jammer', name: 'Jammer', ai: 'sniper', w: { turret: ['ion', 'laser'] }, specials: ['ionDrain', 'spot'], hull: 0.9, desc: 'Electronic warfare ship: drains shields, marks targets.' },
    { k: 'tender', name: 'Repair Tender', ai: 'support', w: { turret: ['laser'], hangar: ['drones'] }, specials: ['heal'], hull: 1.0, desc: 'Keeps the line alive. Kill it first.' },
    { k: 'lancer', name: 'Lancer', ai: 'brawler', w: { broadside: ['lance', 'lance'], turret: ['ion'] }, desc: 'Beam frigate; burns through shields.' },
    { k: 'assault', name: 'Assault Ram', ai: 'boarder', w: { broadside: ['carronade'], turret: ['autocannon'] }, speed: 1.2, hull: 1.4, armor: 8, specials: ['board', 'ram'], desc: 'Armoured prow, boarding tubes, no fear.' },
  ],
  large: [
    { k: 'cruiser', name: 'Cruiser', ai: 'brawler', w: { broadside: ['macrocannon', 'lance', 'plasma'], turret: ['autocannon', 'missile'], prow: ['torpedo'] }, desc: 'A ship of the line in full.' },
    { k: 'heavy', name: 'Heavy Cruiser', ai: 'brawler', w: { broadside: ['macrocannon', 'railgun'], turret: ['flak'], prow: ['torpedo'] }, hull: 1.4, armor: 14, speed: 0.85, desc: 'Armour like a cliff face.' },
    { k: 'battlecruiser', name: 'Battlecruiser', ai: 'brawler', w: { broadside: ['lance', 'railgun'], turret: ['missile'], prow: ['spinal'] }, speed: 1.2, hull: 0.9, specials: ['megabeam'], desc: 'Fast, hard-hitting, lightly armoured; fires a sweeping spinal beam.' },
    { k: 'carrier', name: 'Fleet Carrier', ai: 'carrier', w: { hangar: ['fighters', 'bombers', 'fighters'], turret: ['flak', 'flak'] }, specials: ['droneCloud'], desc: 'Wings upon wings.' },
    { k: 'siege', name: 'Siege Cruiser', ai: 'artillery', w: { prow: ['nova'], turret: ['autocannon'] }, specials: ['artillery'], hull: 1.1, desc: 'Long-range bombardment with telegraphed impacts.' },
    { k: 'shieldship', name: 'Aegis Cruiser', ai: 'support', w: { turret: ['flak', 'laser'], broadside: ['lance'] }, specials: ['shieldAura'], shield: 1.8, desc: 'Projects shields over its allies.' },
    { k: 'command', name: 'Command Cruiser', ai: 'brawler', w: { broadside: ['macrocannon'], turret: ['missile', 'laser'] }, specials: ['commandAura', 'spawn'], desc: 'Its presence makes every nearby ship fight harder; calls reinforcements.' },
    { k: 'minecruiser', name: 'Mine Cruiser', ai: 'sniper', w: { turret: ['flak', 'missile'] }, specials: ['mines', 'mines'], desc: 'Turns space into a minefield.' },
    { k: 'strike', name: 'Strike Cruiser', ai: 'sniper', w: { turret: ['missile', 'missile', 'missile'], prow: ['torpedo'] }, specials: ['torpStorm'], desc: 'Missile and torpedo saturation from range.' },
    { k: 'interdictor', name: 'Interdictor', ai: 'brawler', w: { broadside: ['plasma'], turret: ['ion'] }, specials: ['snare'], hull: 1.2, desc: 'Gravity snares hold you in place while the fleet closes.' },
  ],
  epic: [
    { k: 'battleship', name: 'Battleship', ai: 'brawler', w: { broadside: ['macrocannon', 'lance', 'railgun'], turret: ['flak', 'missile'], prow: ['nova'] }, specials: ['novaBurst', 'artillery'], desc: 'A mountain of guns with a close-in shockwave.' },
    { k: 'assaultcarrier', name: 'Assault Carrier', ai: 'carrier', w: { hangar: ['fighters', 'bombers', 'bombers'], turret: ['flak', 'missile'] }, specials: ['droneCloud', 'spawn'], desc: 'Launches wing after wing and calls escorts.' },
    { k: 'siegeship', name: 'Siege Leviathan', ai: 'artillery', w: { prow: ['nova', 'nova'], turret: ['flak'] }, specials: ['artillery', 'artillery'], desc: 'Carpets the field with telegraphed bombardment.' },
    { k: 'fortress', name: 'Fortress Ship', ai: 'brawler', w: { turret: ['autocannon', 'flak', 'laser', 'missile'], broadside: ['macrocannon'] }, hull: 1.5, armor: 20, speed: 0.6, specials: ['shieldAura', 'novaBurst'], desc: 'Bristling, armoured, nearly immobile.' },
    { k: 'dreadlite', name: 'Ravager', ai: 'brawler', w: { broadside: ['railgun', 'carronade'], prow: ['spinal'] }, specials: ['megabeam', 'enrage'], desc: 'Grows more dangerous as it breaks.' },
    { k: 'spawner', name: 'Brood Ship', ai: 'carrier', w: { turret: ['flak', 'laser'] }, specials: ['spawn', 'spawn'], desc: 'Births a stream of small craft.' },
    { k: 'beamship', name: 'Lance Basilica', ai: 'prow', w: { prow: ['spinal'], broadside: ['lance', 'lance'] }, specials: ['megabeam', 'megabeam'], desc: 'Twin sweeping beams. Never sit in front of it.' },
    { k: 'cloakship', name: 'Shade', ai: 'lurker', w: { broadside: ['plasma', 'railgun'], prow: ['torpedo'] }, specials: ['cloak', 'torpStorm'], desc: 'Vanishes, repositions, strikes from nowhere.' },
    { k: 'bombardier', name: 'Bombardier', ai: 'sniper', w: { turret: ['missile', 'missile'], prow: ['torpedo', 'torpedo'] }, specials: ['torpStorm', 'mines'], desc: 'Torpedo storms and minefields.' },
    { k: 'warlord', name: 'Warlord', ai: 'brawler', w: { broadside: ['lance', 'macrocannon'], turret: ['missile'] }, specials: ['commandAura', 'snare', 'spawn'], desc: 'A commander with an honour guard and a snare.' },
  ],
  legendary: [
    { k: 'flagship', name: 'Flagship', ai: 'brawler', w: { broadside: ['macrocannon', 'lance', 'railgun'], turret: ['flak', 'missile'], prow: ['nova'] }, specials: ['novaBurst', 'megabeam', 'spawn'], desc: 'A fleet admiral’s ship: every trick in the book.' },
    { k: 'hivelord', name: 'Hive Lord', ai: 'carrier', w: { turret: ['flak', 'laser'], hangar: ['fighters', 'bombers'] }, specials: ['spawn', 'droneCloud', 'heal'], desc: 'Endless spawn; heals what it births.' },
    { k: 'titan', name: 'Titan', ai: 'brawler', w: { broadside: ['railgun', 'macrocannon'], turret: ['flak'] }, hull: 1.4, armor: 30, speed: 0.6, specials: ['novaBurst', 'enrage'], desc: 'Slow. Unstoppable. Shrugs off small guns.' },
    { k: 'beamlord', name: 'Prism Lord', ai: 'prow', w: { prow: ['spinal'], broadside: ['lance'] }, specials: ['megabeam', 'megabeam', 'phase'], desc: 'Teleports and sweeps the field with beams.' },
    { k: 'minelord', name: 'Mine Sovereign', ai: 'sniper', w: { turret: ['flak', 'missile'] }, specials: ['mines', 'mines', 'snare', 'artillery'], desc: 'Fills space with death and holds you in it.' },
    { k: 'carrierlord', name: 'Grand Carrier', ai: 'carrier', w: { hangar: ['fighters', 'bombers', 'bombers'], turret: ['flak', 'flak'] }, specials: ['droneCloud', 'droneCloud', 'shieldAura'], desc: 'The sky turns black with wings.' },
    { k: 'siegelord', name: 'Siege Sovereign', ai: 'artillery', w: { prow: ['nova', 'nova'] }, specials: ['artillery', 'artillery', 'novaBurst'], desc: 'Bombardment that never ends.' },
    { k: 'phaselord', name: 'Phase Wraith', ai: 'lurker', w: { broadside: ['plasma', 'lance'], prow: ['torpedo'] }, specials: ['cloak', 'phase', 'torpStorm'], desc: 'Never where you aimed.' },
    { k: 'juggernaut', name: 'Juggernaut', ai: 'boarder', w: { broadside: ['carronade', 'carronade'], turret: ['autocannon'] }, hull: 1.3, armor: 24, specials: ['ram', 'board', 'enrage'], desc: 'Rams, boards, and rages.' },
    { k: 'apex', name: 'Apex', ai: 'brawler', w: { broadside: ['lance', 'railgun', 'plasma'], turret: ['missile', 'flak'], prow: ['spinal'] }, specials: ['megabeam', 'novaBurst', 'spawn', 'snare'], desc: 'The strongest of its kind.' },
  ],
  gargantuan: [
    { k: 'fortressworld', name: 'Mobile Fortress', ai: 'brawler', w: { turret: ['flak', 'autocannon', 'missile', 'laser'], broadside: ['macrocannon', 'railgun'] }, speed: 0.4, armor: 40, specials: ['novaBurst', 'spawn', 'shieldAura'], desc: 'A citadel with engines. Bring friends.' },
    { k: 'hive', name: 'Hive', ai: 'carrier', w: { turret: ['flak', 'laser'], hangar: ['fighters', 'bombers'] }, speed: 0.4, specials: ['spawn', 'spawn', 'droneCloud', 'heal'], desc: 'A living nest that never stops birthing.' },
    { k: 'worldship', name: 'Worldship', ai: 'brawler', w: { broadside: ['macrocannon', 'lance', 'railgun', 'plasma'], turret: ['flak', 'missile'], prow: ['nova'] }, speed: 0.45, specials: ['artillery', 'novaBurst', 'spawn'], desc: 'A nation under way.' },
    { k: 'beamworld', name: 'Prism Engine', ai: 'prow', w: { prow: ['spinal', 'spinal'], broadside: ['lance'] }, speed: 0.4, specials: ['megabeam', 'megabeam', 'megabeam', 'phase'], desc: 'Sweeps whole battle zones with beams.' },
    { k: 'minefield', name: 'Mine Nebula', ai: 'sniper', w: { turret: ['flak', 'missile', 'missile'] }, speed: 0.4, specials: ['mines', 'mines', 'mines', 'snare'], desc: 'It does not chase. It doesn’t have to.' },
    { k: 'carrierworld', name: 'Carrier Moon', ai: 'carrier', w: { hangar: ['fighters', 'bombers', 'bombers', 'fighters'], turret: ['flak', 'flak'] }, speed: 0.35, specials: ['droneCloud', 'droneCloud', 'spawn'], desc: 'Hangars the size of cities.' },
    { k: 'siegeworld', name: 'Planet Breaker', ai: 'artillery', w: { prow: ['nova', 'nova', 'nova'] }, speed: 0.35, specials: ['artillery', 'artillery', 'artillery', 'novaBurst'], desc: 'Built to crack worlds; you are a rounding error.' },
    { k: 'phaseworld', name: 'Phase Colossus', ai: 'lurker', w: { broadside: ['plasma', 'lance'], prow: ['torpedo'] }, speed: 0.5, specials: ['phase', 'phase', 'torpStorm', 'cloak'], desc: 'Something that large should not be able to vanish.' },
    { k: 'devourer', name: 'Devourer', ai: 'boarder', w: { broadside: ['carronade', 'carronade'], turret: ['flak'] }, speed: 0.55, specials: ['ram', 'snare', 'enrage', 'spawn'], desc: 'It wants to swallow your ship whole.' },
    { k: 'apexworld', name: 'Apex Leviathan', ai: 'brawler', w: { broadside: ['lance', 'railgun', 'plasma', 'macrocannon'], turret: ['missile', 'flak'], prow: ['spinal'] }, speed: 0.45, specials: ['megabeam', 'novaBurst', 'artillery', 'spawn', 'snare'], desc: 'The end of the road.' },
  ],
};

// Six enemy factions. `style` = hull design language for HullBuilder (YARDS key).
export const ENEMY_FACTIONS = {
  pirate: { name: 'Corsair Pirates', team: 2, styles: ['corsair', 'corsair', 'tidewright'], minDanger: 1, blurb: 'Raiders, boarders and fireships under black pennants.' },
  rival: { name: 'Rival Companies', team: 4, styles: ['aurelian', 'ironhold', 'aurelian', 'tidewright'], minDanger: 1, blurb: 'Corporate security fleets — neutral until provoked.' },
  rustborn: { name: 'Rustborn Scavengers', team: 5, styles: ['rustborn'], minDanger: 3, blurb: 'Welded from wrecks, hungry for yours.' },
  covenant: { name: 'Hollow Star Covenant', team: 3, styles: ['hollow'], minDanger: 8, blurb: 'Grown hulls that sing. They want what is inside you.' },
  brood: { name: 'Leviathan Brood', team: 7, styles: ['brood'], minDanger: 6, blurb: 'Void fauna — eels, rays, krakens, star-whales.' },
  silent: { name: 'The Silent Choir', team: 6, styles: ['silent'], minDanger: 12, blurb: 'Ancient machines of black glass. They do not speak.' },
};

// What makes each faction fight differently (see enemyFactory / Ship / Combat)
export const FACTION_TRAITS = {
  pirate: { name: 'Plunderers', desc: 'Fast, break off when beaten, and carry more coin.' },
  rival: { name: 'Disciplined', desc: 'Strong shields; focus fire on the weakest target.' },
  rustborn: { name: 'Scavengers', desc: 'Patch their hulls from every wreck nearby; kinetic junk-guns.' },
  covenant: { name: 'Hungering', desc: 'Leech hull from what they hit and strip shields; energy and ion.' },
  brood: { name: 'Living hulls', desc: 'Regenerate constantly; bio-plasma and spore missiles.' },
  silent: { name: 'Phase-shifted', desc: 'Pure energy weapons; blink away from heavy fire.' },
};
// faction weapon dialects: the same role, armed in the faction's own way
export const WEAPON_DIALECT = {
  brood: { macrocannon: 'plasma', carronade: 'plasma', railgun: 'lance', autocannon: 'laser', flak: 'laser', ion: 'laser', nova: 'torpedo' },
  silent: { macrocannon: 'lance', carronade: 'plasma', railgun: 'lance', autocannon: 'laser', flak: 'ion', missile: 'laser', torpedo: 'spinal', nova: 'spinal' },
  rustborn: { lance: 'carronade', plasma: 'macrocannon', laser: 'autocannon', ion: 'flak', spinal: 'nova' },
  covenant: { macrocannon: 'plasma', autocannon: 'ion', laser: 'ion', railgun: 'lance' },
};

// 60 names per faction: ten per size class, in ROLES order.
const N = {
  pirate: [
    ['Cutthroat', 'Gutterknife', 'Spitfire', 'Powder Monkey', 'Bilge Rat', 'Sea Wasp', 'Grapnel', 'Lookout', 'Jackdaw', 'Sparkjack'],
    ['Buccaneer', 'Reaver', 'Black Gull', 'Privateer', 'Bombardo', 'Marauder', 'Hellbrand', 'Sawbones', 'Harpooner', 'Ramshackle'],
    ['Dread Galleon', 'Ironclad', 'Sabre', 'Plunderer', 'Bombard', 'Corsair Queen', 'Flagbreaker', 'Kraken’s Due', 'Broadside Betty', 'Gallows'],
    ['Widowmaker', 'Davy’s Locker', 'Hellfire Galleon', 'Iron Jolly', 'Grim Tide', 'Sea Devil', 'Bloodmoon', 'The Plank', 'Powder Keg', 'Corsair King'],
    ['Redgut’s Revenge', 'The Pirate Nest', 'Thousand Cannons', 'Drowned Crown', 'Gallowglass', 'Salt Emperor', 'Maelstrom Throne', 'Pale Corsair', 'Blackhand’s Folly', 'The Last Bounty'],
    ['Pirate Haven', 'Plunder Hive', 'Freeport Leviathan', 'The Black Citadel', 'The Powder Nebula', 'Corsair Colossus', 'Hell’s Harbour', 'The Ghost Armada', 'Bone Armada Ark', 'Grand Buccaneer'],
  ],
  rival: [
    ['Picket', 'Bailiff', 'Courier', 'Liquidator Drone', 'Surveyor', 'Pathfinder', 'Repossessor', 'Auditor', 'Clerk', 'Compliance Skiff'],
    ['Enforcer', 'Executor', 'Underwriter', 'Collector', 'Assessor', 'Proxy', 'Mediator', 'Warden', 'Arbitrator', 'Foreclosure'],
    ['Chairman', 'Monopoly', 'Merger', 'Conglomerate', 'Dividend', 'Charter', 'Syndicate', 'Hostile Takeover', 'Shareholder', 'Embargo'],
    ['Chief Executive', 'Market Maker', 'Leveraged Buyout', 'Trust Breaker', 'Bull Run', 'Golden Parachute', 'Tender Offer', 'Bear Raid', 'Stock Crash', 'Capital Omega'],
    ['The Founder', 'Holding Company Zero', 'Iron Ledger', 'The Invisible Hand', 'Insolvency', 'Prime Contractor', 'Grand Auditor', 'Total Acquisition', 'The Majority Stake', 'Perpetual Dividend'],
    ['Corporate Arcology', 'Company Town', 'Megafreighter Atlas', 'Trade Spire', 'Mining Leviathan', 'Shipyard Colossus', 'Orbital Foundry', 'The Exchange', 'Refinery Prime', 'Headquarters'],
  ],
  rustborn: [
    ['Junkfly', 'Rivet', 'Nailgun', 'Sparkplug', 'Tin Can', 'Cutter Torch', 'Magnet Mite', 'Wrecklet', 'Scrapper', 'Static Bucket'],
    ['Junker', 'Bolt Thrower', 'Patchwork', 'Hulkbreaker', 'Crusher', 'Scrapjaw', 'Clanker', 'Smelter', 'Grinder', 'Wrecker'],
    ['Scrapheap', 'Rust Bucket', 'Foundry Barge', 'Junkyard Carrier', 'Slag Hauler', 'Magnet Hulk', 'Salvage Lord', 'Iron Midden', 'Wreckmonger', 'Tinker King'],
    ['Scrapyard Dread', 'Hulk Mother', 'Crane Titan', 'Junk Behemoth', 'The Shredder', 'The Recycler', 'Grand Smelter', 'Reclaimer', 'Bonepile', 'Rust Colossus'],
    ['The Rust King', 'Hulk of Hulks', 'Mountain of Scrap', 'The Furnace', 'Magnetar', 'Grand Salvager', 'Old Iron', 'The Scrapgod', 'The Junk Emperor', 'Eternal Wreck'],
    ['Rust Citadel', 'Recycler World', 'Scrap Moon', 'The Mega-Magnet', 'Iron Graveyard', 'Salvage Station Omega', 'The Great Junkyard', 'Wreck Nebula Ark', 'Junk Leviathan', 'Hulk Continent'],
  ],
  covenant: [
    ['Thornling', 'Marrowdart', 'Psalmseed', 'Wailer', 'Bloomspore', 'Ashwing', 'Choirling', 'Weepmote', 'Hymnfly', 'Lanternmite'],
    ['Thornmaw', 'Psalm Spike', 'Bone Cantor', 'Grief Lantern', 'Hunger Hymn', 'Choir Wraith', 'Weeping Saint', 'Requiem Seed', 'Marrow Lancer', 'Hymnreaver'],
    ['Choir-Ship', 'Bone Organ', 'Thorn Cathedral', 'Hive Lantern', 'Grief Engine', 'Hollowheart', 'Carrion Psalm', 'Marrowbloom', 'Starveling', 'Lament'],
    ['Hymn of Hunger', 'Mother of Thorns', 'The Weeping Spire', 'Bone Basilica', 'Psalm of Ruin', 'Grief Mother', 'The Choirmaster', 'Hollow Saint', 'Marrow Crown', 'The Lanternbearer'],
    ['The Hollow Star', 'Mother Hunger', 'The Thousand Mouths', 'Voice of the Void', 'The Black Choir', 'Hymn Eternal', 'Requiem Absolute', 'The Unsung', 'Saint Carrion', 'The Last Psalm'],
    ['Cathedral of Teeth', 'Hive Moon', 'Psalm World', 'The Singing Dark', 'Bone Nebula', 'Choir Leviathan', 'Star-Eater Choir', 'The Hollow Throne', 'The Hungering Spire', 'The Endless Hymn'],
  ],
  brood: [
    ['Ray Pup', 'Shard Beetle', 'Comet Wisp', 'Spore Puff', 'Driftling', 'Lumen Fly', 'Nebula Leech', 'Star Tick', 'Void Mite', 'Glass Eel'],
    ['Starray', 'Comet Hound', 'Shell Crab', 'Leech Mother', 'Nebula Shark', 'Drift Serpent', 'Ion Jelly', 'Glimmer Squid', 'Pulsar Ray', 'Void Eel'],
    ['Void Whale', 'Shellback', 'Star Kraken', 'Brood Carrier', 'Comet Wyrm', 'Ion Medusa', 'Hive Mantis', 'Lumen Leviathan', 'Storm Ray', 'Nebula Serpent'],
    ['Starwhale Bull', 'Brood Queen', 'Comet Dragon', 'Ancient Shellback', 'Abyss Wyrm', 'Nebula Hydra', 'Great Medusa', 'Void Behemoth', 'Thunder Jelly', 'Elder Kraken'],
    ['The Deep Mother', 'Brood Sovereign', 'Old One-Eye', 'The Star Wyrm', 'The Drowned Star', 'The Great Devourer', 'Kraken Eternal', 'Hydra of Nebulae', 'Void Leviathan', 'The Lumen God'],
    ['Moonwhale', 'Hive Planetoid', 'The Living Nebula', 'Titan Medusa', 'Void Mother', 'Comet Leviathan', 'The Great Kraken', 'The Abyss', 'Star-Eater', 'World Serpent'],
  ],
  silent: [
    ['Mote', 'Shard', 'Seeker', 'Spark', 'Node', 'Glyph', 'Facet', 'Echo', 'Prism', 'Whisper'],
    ['Lattice', 'Vector', 'Obelisk', 'Resonator', 'Monolith', 'Cipher', 'Paradox', 'Axiom', 'Null Lancer', 'Theorem'],
    ['Archive', 'Silent Arbiter', 'Spire of Glass', 'Harmonic', 'Oracle', 'Aegis Lattice', 'Equation', 'Null Engine', 'Enigma', 'Hush'],
    ['Prime Monolith', 'Recursion', 'The Silencer', 'Glass Leviathan', 'Entropy Engine', 'Zero Point', 'The Arbiter Absolute', 'Stillness', 'Quiet Storm', 'The Last Number'],
    ['The First Machine', 'Infinite Archive', 'Omega Lattice', 'Event Horizon', 'Absolute Zero', 'The Null Choir', 'The Calculator of Ends', 'Voice of Silence', 'Prime Axiom', 'The Clockwork God'],
    ['Monolith Prime', 'Archive Ark', 'Dyson Shard', 'Glass Moon', 'Ring of Silence', 'Matrioshka Fragment', 'The Great Engine', 'The Hushed Sphere', 'Singularity Forge', 'The Silent World'],
  ],
};

// tint / glow overrides so the same faction's ships vary across a roster
const GLOW_VARIANTS = {
  pirate: [0xff3050, 0xff7040, 0xffc040], rival: [0x58b8ff, 0xffd070, 0x7ad8ff, 0xffa030], rustborn: [0xffa040, 0xff7020, 0xffd060],
  covenant: [0xff2040, 0xff40a0, 0xc02060], brood: [0x40ffd0, 0x60a0ff, 0xb070ff], silent: [0x9ff0ff, 0xffffff, 0xa0b0ff],
};

// what a role carries on its hull, so roles read at a glance
export const ROLE_KIT = {
  fireship: 'payload', minelayer: 'mines', minecruiser: 'mines', minelord: 'mines', minefield: 'mines',
  boarder: 'grapple', assault: 'grapple', juggernaut: 'grapple', devourer: 'grapple',
  spotter: 'dish', jammer: 'dish', tender: 'cranes', hivelord: 'cranes',
  siege: 'barrel', siegeship: 'barrel', siegelord: 'barrel', siegeworld: 'barrel', gunship: 'barrel', bombardier: 'barrel',
  escort: 'emitters', shieldship: 'emitters', fortress: 'emitters', fortressworld: 'emitters',
  command: 'antenna', warlord: 'antenna', flagship: 'antenna', apex: 'antenna', apexworld: 'antenna',
  interceptor: 'wings', harrier: 'wings', swarmer: 'wings', raider: 'wings', ionskiff: 'wings',
  beamship: 'prism', beamlord: 'prism', beamworld: 'prism', lancer: 'prism', battlecruiser: 'prism',
  lightcarrier: 'carrier', carrier: 'carrier', assaultcarrier: 'carrier', carrierlord: 'carrier',
};
export const ROLE_SHAPE = { hive: 'sphere', carrierworld: 'sphere' };

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const ENEMIES = [];
for (const [fk, F] of Object.entries(ENEMY_FACTIONS)) {
  SIZES.forEach((size, si) => {
    ROLES[size.k].forEach((role, ri) => {
      const name = N[fk][si][ri];
      const h = hash(fk + size.k + role.k);
      const lenT = ((h % 1000) / 1000) * 0.6 + ri / 9 * 0.4;
      const len = Math.round(size.len[0] + (size.len[1] - size.len[0]) * lenT);
      const tier = size.tiers[0] + ((h >>> 10) % (size.tiers[1] - size.tiers[0] + 1));
      const style = F.styles[(h >>> 4) % F.styles.length];
      const glows = GLOW_VARIANTS[fk];
      // within a size band, designs unlock across the danger range so the roster keeps revealing itself
      const band = si < 5 ? SIZES[si + 1].minDanger - size.minDanger : 30;
      const minDanger = Math.max(size.minDanger, F.minDanger) + Math.floor((ri / 10) * Math.max(2, band));
      ENEMIES.push({
        id: `${fk}_${size.k}_${role.k}`, name, faction: fk, size: size.k, sizeIndex: si, role: role.k, roleName: role.name,
        cls: `${role.name}`, fullName: `${name}-class ${role.name}`, style, glow: glows[(h >>> 7) % glows.length],
        len, tier, beam: role.beam || (size.k === 'gargantuan' ? 0.2 + ((h >>> 3) % 10) / 100 : 0.17 + ((h >>> 5) % 6) / 100),
        ai: role.ai, weapons: role.w, specials: role.specials || [], pack: role.pack || 1,
        mul: { hull: size.hull * (role.hull || 1), shield: size.shield * (role.shield || 1), speed: role.speed || 1, turn: role.turn || 1, armor: role.armor || 0 },
        boss: size.boss || 0, phases: size.phases || null, minDanger, desc: role.desc,
        kit: ROLE_KIT[role.k] || null, shape: ROLE_SHAPE[role.k] || null,
        seed: h,
      });
    });
  });
}
export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

// Encounter composition by danger: which sizes show up, and how packs are built.
export function encounterSizes(danger) {
  const w = [['small', danger < 15 ? 6 - danger * 0.3 : 0.6], ['mid', danger >= 2 ? 4 : 0], ['large', danger >= 7 ? 2.5 + danger * 0.05 : 0], ['epic', danger >= 13 ? 0.7 + danger * 0.03 : 0], ['legendary', danger >= 20 ? 0.12 + danger * 0.004 : 0]];
  return w.filter(([, x]) => x > 0);
}
export function designsFor(faction, size, danger) {
  return ENEMIES.filter((e) => e.faction === faction && e.size === size && e.minDanger <= Math.max(danger, SIZE_BY_KEY[size].minDanger));
}

// hull slots for a design (drives HullBuilder hardpoints)
export function designSlots(d) {
  const c = (k) => (d.weapons[k] ? d.weapons[k].length : 0);
  const big = d.sizeIndex >= 3 ? 1 + (d.sizeIndex - 2) : 0;
  return {
    broadside: c('broadside') ? Math.min(10, c('broadside') + big + (d.sizeIndex >= 2 ? 1 : 0)) : 0,
    turret: Math.min(12, c('turret') + big * 2),
    prow: Math.min(4, c('prow') + (d.sizeIndex >= 4 && c('prow') ? 1 : 0)),
    hangar: Math.min(6, c('hangar') + (c('hangar') ? big : 0)),
    module: 2 + d.sizeIndex,
  };
}
