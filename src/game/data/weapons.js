// The wider armoury: sixty-four weapon bases on top of the sixteen core ones in items.js.
// Each one names the core gun it descends from (`of`); items.js derives its damage so that, per slot,
// it is worth what its parent is worth on the gear score (same damage-type mix, area, disruption and
// built-in powers accounted for), so the balance contract in data/balance.js holds whatever drops.
// Longer reach costs a little damage and shorter reach buys a little (`reachTrade`).
//
// Fields beyond the core ones (read through weaponStats -> ws):
//   innate  built-in powers (UNIQUES keys); never rolled again on the same item
//   beamW   beam width multiplier, beamT beam lifetime (s)
//   pSize   projectile size multiplier, turn missile / torpedo agility (rad/s)
//   fx      projectile look and sound (data/ordnance.js SHOT), beam: beam look and sound (BEAM),
//   pattern how a volley leaves the launcher (PATTERN: pair / spread / salvo); looks and timing only
//   model   WeaponModels silhouette (defaults to the parent's)
//   dps     extra per-slot value multiplier on top of the reach trade (default 1)
// Spec: [key, of, name, overrides]
export const WEAPON_VARIANTS = [
  // ================= broadsides =================
  // ---- energy lances ----
  ['phaseLance', 'lance', 'Phase Lance Battery', { rof: 0.7, range: 540, color: 0xb48cff, beamW: 0.8, innate: ['shieldbreak'], beam: 'phaser', icon: 'lance' }],
  ['graviticLance', 'lance', 'Gravitic Lance Battery', { dmgType: 'kinetic', rof: 0.45, range: 580, color: 0x9a8cff, beamW: 1.2, innate: ['stasis'], icon: 'gravity' }],
  ['pulseLance', 'lance', 'Pulse Lance Array', { barrels: 3, rof: 0.5, range: 520, color: 0x5ae0ff, beamW: 0.6, beamT: 0.18, beam: 'pulse', icon: 'lance' }],
  ['solarLance', 'lance', 'Solar Lance Battery', { rof: 0.34, range: 600, color: 0xffd060, beamW: 1.7, beamT: 0.6, innate: ['inferno'], beam: 'solar', icon: 'lance' }],
  ['arcProjector', 'lance', 'Arc Projector Battery', { rof: 0.8, range: 420, color: 0xa0d0ff, beamW: 0.7, beamT: 0.2, innate: ['chainLance'], beam: 'arc', icon: 'ion' }],
  ['ionLance', 'lance', 'Ion Lance Battery', { dmgType: 'ion', disrupt: 2, rof: 0.5, range: 540, color: 0x58a8ff, beamW: 1.1, icon: 'ion' }],
  ['tachyonLance', 'lance', 'Tachyon Lance Battery', { rof: 0.3, range: 760, color: 0xe8f4ff, beamW: 0.5, beamT: 0.45, beam: 'tachyon', icon: 'lance' }],
  // ---- guns ----
  ['gaussBattery', 'railgun', 'Gauss Battery', { barrels: 2, rof: 0.45, range: 640, speed: 1000, color: 0xa0c8ff, icon: 'rail' }],
  ['massDriver', 'macrocannon', 'Mass Driver Battery', { barrels: 2, rof: 0.4, range: 620, speed: 520, spread: 0.03, pSize: 1.4, color: 0xffc890, innate: ['breach'], icon: 'cannon' }],
  ['howitzer', 'macrocannon', 'Quad Howitzer Deck', { dmgType: 'explosive', barrels: 4, rof: 0.35, range: 600, speed: 340, spread: 0.06, splash: 40, color: 0xffa050, icon: 'cannon' }],
  ['fusionBroadside', 'plasma', 'Fusion Broadside', { barrels: 3, rof: 0.45, range: 440, speed: 420, splash: 30, color: 0xff8a3a, innate: ['inferno'], icon: 'plasma' }],
  ['helixPlasma', 'plasma', 'Helix Plasma Battery', { barrels: 2, rof: 0.55, range: 480, speed: 300, homing: 0.5, color: 0x80ffe0, icon: 'plasma' }],
  ['grapeshot', 'carronade', 'Grapeshot Deck', { dmgType: 'kinetic', barrels: 6, rof: 0.6, range: 300, speed: 420, spread: 0.16, color: 0xffd0a0, icon: 'cannon' }],
  // ---- broadside launchers ----
  ['missileCells', 'macrocannon', 'Broadside Missile Cells', { kind: 'missile', dmgType: 'explosive', barrels: 4, rof: 0.35, range: 640, speed: 250, homing: 1, splash: 16, turn: 3.5, color: 0xffc040, model: 'cells', icon: 'missile' }],
  ['torpedoBroadside', 'carronade', 'Broadside Torpedo Racks', { kind: 'torpedo', barrels: 2, rof: 0.22, range: 760, speed: 170, homing: 0.5, splash: 40, spread: 0, color: 0xff7030, model: 'cells', fx: 'warhead', pattern: 'pair', icon: 'torpedo' }],

  // ================= turrets =================
  // ---- beams ----
  ['beamLaser', 'laser', 'Beam Laser Turret', { kind: 'beam', barrels: 1, rof: 1.6, range: 440, color: 0xff4a8a, beamW: 0.5, beamT: 0.2, model: 'beamturret', icon: 'laser' }],
  ['particleBeam', 'laser', 'Particle Beam Turret', { kind: 'beam', barrels: 1, rof: 1.0, range: 480, color: 0xffe080, beamW: 0.7, model: 'beamturret', beam: 'lance', icon: 'laser' }],
  ['phaser', 'laser', 'Phaser Turret', { kind: 'beam', barrels: 2, rof: 1.3, range: 420, color: 0xff8030, beamW: 0.55, beamT: 0.16, model: 'beamturret', icon: 'laser' }],
  ['cutterBeam', 'laser', 'Tractor-Cutter Beam', { kind: 'beam', dmgType: 'kinetic', barrels: 1, rof: 1.2, range: 360, color: 0x60ffa0, beamW: 0.9, innate: ['stasis'], model: 'ion', beam: 'tractor', icon: 'tractor' }],
  ['disintegrator', 'laser', 'Disintegrator Turret', { kind: 'beam', barrels: 1, rof: 0.7, range: 400, color: 0x9effa0, beamW: 0.8, beamT: 0.35, innate: ['breach'], model: 'beamturret', beam: 'disintegrator', icon: 'laser' }],
  ['arcTurret', 'ion', 'Arc Turret', { dmgType: 'energy', disrupt: 0, rof: 1.1, range: 360, color: 0xc8e0ff, beamW: 0.6, beamT: 0.15, innate: ['chainLance'], beam: 'arc', icon: 'ion' }],
  ['empProjector', 'ion', 'EMP Projector', { kind: 'bolt', disrupt: 3, barrels: 1, rof: 1.2, range: 440, speed: 600, splash: 20, color: 0x6ab0ff, model: 'ion', icon: 'ion' }],
  // ---- guns ----
  ['gatling', 'autocannon', 'Gatling Turret', { barrels: 4, rof: 4, range: 380, speed: 560, spread: 0.07, color: 0xffe0a0, pSize: 0.8, model: 'gatling', icon: 'turret' }],
  ['gaussTurret', 'autocannon', 'Gauss Turret', { kind: 'bolt', barrels: 1, rof: 1.2, range: 520, speed: 1000, pierce: 1, spread: 0, color: 0xb0c0ff, model: 'laser', icon: 'rail' }],
  ['plasmaTurret', 'laser', 'Plasma Turret', { barrels: 2, rof: 1.4, range: 420, speed: 420, splash: 14, color: 0x6affc8, icon: 'plasma' }],
  ['scatterLaser', 'laser', 'Scatter Laser Turret', { barrels: 4, rof: 1.8, range: 340, spread: 0.12, color: 0xff6aff, pSize: 0.7, model: 'gatling', icon: 'laser' }],
  ['magRail', 'autocannon', 'Mag-Rail Turret', { kind: 'bolt', barrels: 2, rof: 1.6, range: 480, speed: 900, spread: 0.02, color: 0xc8b4ff, model: 'laser', icon: 'rail' }],
  // ---- missiles ----
  ['swarmPod', 'missile', 'Swarm Missile Pod', { barrels: 6, rof: 0.5, range: 560, speed: 260, turn: 5, splash: 10, pSize: 0.7, color: 0xffd870, model: 'pod', icon: 'missile' }],
  ['hellfire', 'missile', 'Hellfire Rack', { rof: 0.7, splash: 18, color: 0xff6a30, innate: ['inferno'], icon: 'missile' }],
  ['longbow', 'missile', 'Longbow Missile Battery', { rof: 0.5, range: 820, speed: 210, turn: 2.5, color: 0xffb040, icon: 'missile' }],
  ['hunterKiller', 'missile', 'Hunter-Killer Pod', { dmgType: 'kinetic', barrels: 1, rof: 1.1, range: 600, speed: 340, turn: 6, splash: 0, color: 0xfff0b0, model: 'pod', icon: 'missile' }],
  ['ionMissile', 'missile', 'Ion Missile Rack', { dmgType: 'ion', disrupt: 2, rof: 0.8, color: 0x58a8ff, icon: 'missile' }],
  ['clusterMissile', 'missile', 'Cluster Missile Rack', { barrels: 1, rof: 0.55, range: 640, color: 0xffa040, innate: ['clusterTorp'], icon: 'missile' }],
  // ---- point defence ----
  ['pdCluster', 'flak', 'Point-Defence Cluster', { barrels: 4, rof: 3, range: 260, splash: 18, color: 0xe0f0ff, model: 'gatling', icon: 'flak' }],
  ['airburst', 'flak', 'Airburst Cannon', { dmgType: 'explosive', barrels: 2, rof: 1.6, range: 340, splash: 34, color: 0xffb070, icon: 'flak' }],

  // ================= prow =================
  // ---- torpedoes ----
  ['heavyTorpedo', 'torpedo', 'Heavy Torpedo Launcher', { barrels: 1, rof: 0.12, range: 960, speed: 120, splash: 70, pSize: 1.4, fx: 'warhead', icon: 'torpedo' }],
  ['swarmTorpedo', 'torpedo', 'Swarm Torpedo Tubes', { barrels: 4, rof: 0.16, speed: 180, homing: 0.6, splash: 30, pSize: 0.7, turn: 1.8, fx: 'warhead', pattern: 'spread', icon: 'torpedo' }],
  ['plasmaTorpedo', 'torpedo', 'Plasma Torpedo Tubes', { dmgType: 'energy', splash: 50, color: 0x6affc8, innate: ['inferno'], icon: 'torpedo' }],
  ['ionTorpedo', 'torpedo', 'Ion Torpedo Tubes', { dmgType: 'ion', disrupt: 4, splash: 60, color: 0x58a8ff, icon: 'torpedo' }],
  ['gravitonTorpedo', 'torpedo', 'Graviton Torpedo Tubes', { splash: 60, color: 0xb07aff, innate: ['stasis'], fx: 'rift', icon: 'gravity' }],
  ['breachingTorpedo', 'torpedo', 'Breaching Torpedo Tubes', { dmgType: 'kinetic', splash: 30, speed: 190, color: 0xffb060, innate: ['breach'], fx: 'warhead', icon: 'torpedo' }],
  ['clusterTorpedo', 'torpedo', 'Cluster Torpedo Bay', { barrels: 1, rof: 0.2, color: 0xff9040, innate: ['clusterTorp'], fx: 'warhead', icon: 'torpedo' }],
  ['antimatterTorpedo', 'torpedo', 'Antimatter Torpedo', { barrels: 1, rof: 0.08, range: 1000, speed: 130, splash: 90, pSize: 1.6, color: 0xff60ff, fx: 'antimatter', icon: 'nova' }],
  ['lancerTorpedo', 'torpedo', 'Lancer Torpedo Tubes', { speed: 300, homing: 0.8, rof: 0.2, range: 860, splash: 30, turn: 1.6, pSize: 0.8, color: 0xffe070, fx: 'quantal', pattern: 'pair', icon: 'torpedo' }],
  ['siegeTorpedo', 'torpedo', 'Hammerhead Siege Tubes', { rof: 0.2, splash: 50, color: 0xff5030, innate: ['siege'], fx: 'warhead', icon: 'torpedo' }],
  // ---- spinal beams ----
  ['disruptorSpine', 'spinal', 'Disruptor Spinal Beam', { dmgType: 'ion', disrupt: 3, rof: 0.14, range: 800, color: 0x58a8ff, beamW: 1.2, icon: 'ion' }],
  ['gravitonSpine', 'spinal', 'Graviton Spinal Lance', { dmgType: 'kinetic', rof: 0.15, color: 0x9a8cff, beamW: 1.3, innate: ['stasis'], icon: 'gravity' }],
  ['solarSpine', 'spinal', 'Solar Spinal Lance', { rof: 0.12, color: 0xffc040, beamW: 1.6, beamT: 0.9, innate: ['inferno'], beam: 'solar', icon: 'lance' }],
  ['tachyonSpine', 'spinal', 'Tachyon Spinal Lance', { rof: 0.1, range: 1050, color: 0xf0f8ff, beamW: 0.7, beamT: 0.7, beam: 'tachyon', icon: 'lance' }],
  ['stormSpine', 'spinal', 'Stormcaller Spine', { rof: 0.18, range: 700, color: 0xbfe8ff, beamW: 0.9, innate: ['chainLance'], beam: 'arc', icon: 'ion' }],

  // ================= energy torpedoes =================
  // Packets of light fired from tubes: they carry no motor and leave no exhaust, only a glow that pulses as it
  // flies. Each family has its own look (data/ordnance.js SHOT), sound and fire pattern.
  // ---- prow ----
  ['photicTorpedo', 'torpedo', 'Photic Torpedo Tubes', { speed: 190, homing: 0.6, color: 0xff4a1a, fx: 'photic', pattern: 'pair', icon: 'torpedo' }],
  ['photicSpread', 'torpedo', 'Photic Spread Launcher', { barrels: 5, rof: 0.12, speed: 175, homing: 0.85, turn: 1.6, splash: 34, pSize: 0.72, color: 0xff6a28, fx: 'photic', pattern: 'spread', icon: 'torpedo' }],
  ['rapidPhotic', 'torpedo', 'Rapid-Cycle Photic Launcher', { barrels: 6, rof: 0.1, speed: 225, homing: 0.7, turn: 1.7, splash: 22, pSize: 0.58, color: 0xff3818, fx: 'photic', pattern: 'salvo', icon: 'torpedo' }],
  ['quantalTorpedo', 'torpedo', 'Quantal Torpedo Tubes', { barrels: 3, rof: 0.15, speed: 235, homing: 0.7, turn: 1.6, splash: 46, pSize: 0.9, color: 0x6ab4ff, fx: 'quantal', pattern: 'salvo', icon: 'torpedo' }],
  ['plasmicGlobe', 'torpedo', 'Plasmic Globe Projector', { dmgType: 'energy', barrels: 1, rof: 0.1, range: 880, speed: 105, homing: 0.9, turn: 0.9, splash: 70, pSize: 1.2, color: 0x48ff60, innate: ['inferno'], fx: 'plasmic', icon: 'plasma' }],
  ['chronalTorpedo', 'torpedo', 'Chronal Torpedo Tubes', { speed: 170, homing: 0.6, splash: 44, color: 0xffc030, innate: ['stasis'], fx: 'chronal', pattern: 'pair', icon: 'torpedo' }],
  ['phaseTorpedo', 'torpedo', 'Phase-Shift Torpedo Tubes', { speed: 200, homing: 0.6, splash: 36, color: 0xff48d0, innate: ['shieldbreak'], fx: 'phase', pattern: 'pair', icon: 'torpedo' }],
  ['polaricTorpedo', 'torpedo', 'Polaric Torpedo Tubes', { dmgType: 'ion', disrupt: 2, speed: 185, homing: 0.6, splash: 50, color: 0xb46cff, fx: 'polaric', pattern: 'pair', icon: 'ion' }],
  ['tricoreDevice', 'torpedo', 'Tri-Core Demolition Device', { barrels: 1, rof: 0.06, range: 1000, speed: 92, homing: 0.5, turn: 0.8, splash: 130, pSize: 1.9, color: 0xd8ecff, fx: 'tricore', icon: 'nova' }],
  // ---- turrets ----
  ['microPhotic', 'missile', 'Micro-Photic Launcher', { kind: 'torpedo', barrels: 2, rof: 0.7, speed: 250, homing: 0.9, turn: 3, splash: 14, pSize: 0.42, color: 0xff5a24, fx: 'photic', pattern: 'pair', model: 'pod', icon: 'torpedo' }],
  ['quantalPod', 'missile', 'Quantal Pulse Launcher', { kind: 'torpedo', barrels: 4, rof: 0.42, speed: 290, homing: 0.85, turn: 3.2, splash: 10, pSize: 0.36, color: 0x8ac8ff, fx: 'quantal', pattern: 'salvo', model: 'pod', icon: 'torpedo' }],
  ['plasmicPod', 'missile', 'Plasmic Charge Launcher', { kind: 'torpedo', dmgType: 'energy', barrels: 1, rof: 0.6, range: 560, speed: 170, homing: 0.9, turn: 2.2, splash: 22, pSize: 0.55, color: 0x6aff58, fx: 'plasma', model: 'pod', icon: 'plasma' }],
  // ---- broadsides ----
  ['photicBroadside', 'macrocannon', 'Photic Broadside Tubes', { kind: 'torpedo', dmgType: 'explosive', barrels: 3, rof: 0.3, range: 660, speed: 200, homing: 0.75, turn: 2, splash: 26, spread: 0, pSize: 0.66, color: 0xff5020, fx: 'photic', pattern: 'spread', model: 'cells', icon: 'torpedo' }],
  ['plasmicBroadside', 'plasma', 'Plasmic Broadside Projectors', { kind: 'torpedo', barrels: 2, rof: 0.3, range: 520, speed: 160, homing: 0.8, turn: 1.4, splash: 34, pSize: 0.85, color: 0x5aff70, fx: 'plasmic', pattern: 'pair', icon: 'plasma' }],
];
