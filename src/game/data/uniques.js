// Named legendaries: fixed identities to chase. Each has a base, its own unique powers,
// guaranteed affixes and a line of flavour. Legendary drops roll one of these 60% of
// the time (matching slot when possible); the rest are random legendaries.
// No power appears on more than two of them, and every module and hangar has its own
// (tests/items.test.mjs holds that line).
export const NAMED = [
  // broadsides
  { name: 'Wrath of Velscour', base: 'macrocannon', powers: ['splitShot', 'overload'], affixes: ['dmg', 'critDmg'], flavor: 'Cast from the bells of the first cathedral-ship.' },
  { name: 'The Ninth Psalm', base: 'lance', powers: ['chainLance'], affixes: ['dmg', 'range', 'crit'], flavor: 'It sings on a frequency only the dying hear.' },
  { name: 'Widowmaker', base: 'railgun', powers: ['doubleTap', 'executioner'], affixes: ['dmg', 'hullDmg', 'crit'], flavor: 'Two shots. One grave.' },
  { name: 'Cinderhymn', base: 'plasma', powers: ['inferno', 'splitShot'], affixes: ['splash', 'dmg'], flavor: 'The hull burns long after the bolt is gone.' },
  { name: 'Kessrin’s Lament', base: 'carronade', powers: ['breach'], affixes: ['rof', 'critDmg', 'hullDmg'], flavor: 'Fired at a range where you can hear them scream.' },
  { name: 'Stormcaller', base: 'lance', powers: ['chainLance', 'stasis'], affixes: ['shieldDmg', 'rof'], flavor: 'Lightning that remembers who it struck.' },
  { name: 'The Last Admiral', base: 'macrocannon', powers: ['siege', 'vampiric'], affixes: ['dmg', 'rof', 'salvage'], flavor: 'Every broadside, a toast to the fallen.' },
  { name: 'Hullsplitter Grand', base: 'railgun', powers: ['shieldbreak', 'breach'], affixes: ['hullDmg', 'projSpeed'], flavor: 'Through the shield, through the armour, through the crew.' },
  // turrets
  { name: 'Vesper’s Fang', base: 'laser', powers: ['hairTrigger'], affixes: ['rof', 'crit'], flavor: 'Small bites. Endless hunger.' },
  { name: 'Brood Mother', base: 'missile', powers: ['clusterTorp'], affixes: ['homing', 'splash', 'dmg'], flavor: 'Every warhead hatches six more.' },
  { name: 'Starfall', base: 'missile', powers: ['overload'], affixes: ['dmg', 'range', 'critDmg'], flavor: 'The sky comes down in pieces.' },
  { name: 'The Pale Armada', base: 'flak', powers: ['ironCurtain'], affixes: ['splash', 'rof'], flavor: 'A wall of iron no fighter crosses twice.' },
  { name: 'Hollow Choir', base: 'ion', powers: ['vampiric', 'stasis'], affixes: ['shieldDmg', 'rof'], flavor: 'It drinks the light from their shields.' },
  { name: 'Ashen Covenant', base: 'autocannon', powers: ['inferno'], affixes: ['rof', 'dmg'], flavor: 'Burning tracer, burning hull.' },
  // prow
  { name: 'Dawnbreaker', base: 'nova', powers: ['hairTrigger'], affixes: ['splash', 'dmg', 'critDmg'], flavor: 'The morning after is very quiet.' },
  { name: 'Sunder', base: 'spinal', powers: ['shieldbreak'], affixes: ['dmg', 'range'], flavor: 'A line drawn through the enemy fleet.' },
  { name: 'Gravebloom', base: 'torpedo', powers: ['clusterTorp', 'doubleTap'], affixes: ['homing', 'dmg'], flavor: 'Plant one. Reap a field.' },
  { name: 'The Red Litany', base: 'torpedo', powers: ['executioner'], affixes: ['splash', 'hullDmg', 'homing'], flavor: 'Read aloud at the funerals it causes.' },
  { name: 'Oath of Iron', base: 'nova', powers: ['siege'], affixes: ['dmg', 'salvage'], flavor: 'Sworn on the anvil of Ironhold. Every blow lands harder than the last.' },
  // hangars
  { name: 'The Swarming Dark', base: 'fighters', powers: ['swarm'], affixes: ['crit', 'cdr'], flavor: 'Wings beyond counting.' },
  { name: 'Requiem Wing', base: 'bombers', powers: ['decoy'], affixes: ['critDmg', 'xp'], flavor: 'Every sortie returns lighter.' },
  { name: 'Mercy of the Deep', base: 'drones', powers: ['weavers'], affixes: ['hull', 'shieldRegen'], flavor: 'Small hands that mend.' },
  // modules
  { name: 'Aegis of Aurel', base: 'shieldgen', powers: ['aegis'], affixes: ['shield', 'shieldRegen'], flavor: 'Faith, made of light.' },
  { name: 'The Mountain', base: 'armor', powers: ['stonewall'], affixes: ['hull', 'armor'], flavor: 'Things break against it. It does not.' },
  { name: 'Heart of the Forge', base: 'reactor', powers: ['forgeheart'], affixes: ['cdr', 'crit'], flavor: 'Still warm from the furnace that made it.' },
  { name: 'Clipper’s Grace', base: 'thrusters', powers: ['wakeMines'], affixes: ['speed', 'turn'], flavor: 'She leans into the turn, and leaves thorns in her wake.' },
  { name: 'Eye of the Choir', base: 'targeting', powers: ['paint'], affixes: ['crit', 'critDmg'], flavor: 'It sees where you will be.' },
  { name: 'Magpie’s Hoard', base: 'tractor', powers: ['hoard'], affixes: ['lootFind', 'credits'], flavor: 'Shiny things find their way home.' },
  { name: 'The Patient Surgeon', base: 'repair', powers: ['surgeon'], affixes: ['hull', 'shieldRegen'], flavor: 'No wound too deep, no hull too far gone.' },
  { name: 'Throne of Velscour', base: 'shieldgen', powers: ['retribution', 'sovereign'], affixes: ['shield', 'hull', 'cdr'], flavor: 'Mythic. Worn by the first captain.' },
];
