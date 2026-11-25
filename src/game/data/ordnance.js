// How every shot looks and sounds: in flight, at the muzzle and where it lands. Pure data (node-safe).
//
// The game is set in vacuum: nothing leaves smoke or a contrail. A rocket motor shows only as the short
// flame at its own tail (`plume`); an energy torpedo is a self-contained packet of light (`orb`) that
// at most leaves a brief afterimage (`after`, a tenth of a second) so its line reads at a glance.
//
// Projectile styles (SHOT): picked per weapon base by `fx`, else by kind / damage type (shotStyle).
//   body    'tracer' thin hot streak | 'bolt' soft energy bolt | 'slug' hypervelocity slug | 'missile' dark
//           body + motor flare | 'orb' no streak, the flare is the shot
//   len     streak length scale
//   flare   the glowing head: size (x shot size), spikes (rays), sharp (ray thinness), ring (halo ring),
//           core (white-hot centre radius), pulse (Hz), throb (pulse depth), spin (rad/s), hot (core tint hex)
//   grow    size reached at the end of flight (plasma globes swell as they go)
//   motes   bright motes corkscrewing round the shot (count, radius x size, turns/s)
//   plume   rocket flame at the tail (0 = none), after: afterimage strength (0 = none)
//   muzzle  launch effect: 'gun' | 'energy' | 'rail' | 'launch' (missile cell) | 'tube' (torpedo tube)
//   det     where it lands: DET key (fx/Particles.js FX.detonate draws them)
//   sfx     launch sound (engine/Audio.js), pitch: its pitch scale
export const SHOT = {
  tracer: { body: 'tracer', len: 1, flare: { size: 1.8, spikes: 0, core: 0.22 }, muzzle: 'gun', det: 'burst', sfx: 'cannon' },
  heavyShell: { body: 'tracer', len: 1.2, flare: { size: 2.4, spikes: 4, sharp: 1.4, core: 0.2 }, muzzle: 'gun', det: 'burst', sfx: 'heavy' },
  flak: { body: 'tracer', len: 0.7, flare: { size: 1.6, spikes: 0, core: 0.25 }, muzzle: 'gun', det: 'flak', sfx: 'cannon', pitch: 1.3 },
  nova: { body: 'orb', flare: { size: 10.5, spikes: 8, sharp: 1.2, ring: 0.5, core: 0.22, pulse: 4, throb: 0.15, spin: 0.6, hot: 0xffffff }, after: 0.6, muzzle: 'tube', det: 'nova', sfx: 'heavy', pitch: 0.7 },
  laserBolt: { body: 'bolt', len: 1.4, flare: { size: 2.2, spikes: 0, core: 0.3 }, muzzle: 'energy', det: 'spark', sfx: 'pulsePhaser' },
  plasmaBolt: { body: 'bolt', len: 0.6, flare: { size: 4.2, spikes: 0, core: 0.22, pulse: 9, throb: 0.25 }, muzzle: 'energy', det: 'plasma', sfx: 'plasmaShot' },
  slug: { body: 'slug', len: 2.2, flare: { size: 2.6, spikes: 2, sharp: 3, core: 0.2, hot: 0xffffff }, after: 0.35, muzzle: 'rail', det: 'spark', sfx: 'rail' },
  ionBolt: { body: 'orb', flare: { size: 7.5, spikes: 4, sharp: 2, ring: 0.7, core: 0.18, pulse: 14, throb: 0.3, spin: 3 }, after: 0.5, muzzle: 'energy', det: 'ion', sfx: 'ionShot' },
  missile: { body: 'missile', len: 0.8, flare: { size: 2.2, spikes: 4, sharp: 2, core: 0.3, hot: 0xfff4d0 }, plume: 1, muzzle: 'launch', det: 'burst', sfx: 'missile' },
  // a physical torpedo with a motor (heavy, breaching, siege, cluster): no glow of its own but the drive
  warhead: { body: 'missile', len: 1.1, flare: { size: 3, spikes: 4, sharp: 1.6, core: 0.26, hot: 0xfff0d0 }, plume: 1.6, muzzle: 'tube', det: 'burst', sfx: 'torpedo' },
  // ---- energy torpedoes ----
  // red-orange packet of light with a four-point star that turns as it pulses (the classic tube torpedo)
  photic: { body: 'orb', flare: { size: 10.5, spikes: 4, sharp: 1, ring: 0.3, core: 0.22, pulse: 6, throb: 0.25, spin: 2.2, hot: 0xffe0b0 }, after: 0.8, muzzle: 'tube', det: 'photic', sfx: 'photon' },
  // blue-white, harder and brighter, a six-point glint that sparkles
  quantal: { body: 'orb', flare: { size: 7.5, spikes: 6, sharp: 2.2, ring: 0.45, core: 0.17, pulse: 11, throb: 0.3, spin: -3, hot: 0xffffff }, after: 0.9, muzzle: 'tube', det: 'quantal', sfx: 'quantal' },
  // a seething plasma globe: no rays, a corona that boils, and it swells as it flies
  plasmic: { body: 'orb', flare: { size: 9, spikes: 0, ring: 0.15, core: 0.3, pulse: 3.2, throb: 0.4, hot: 0xeaffd0 }, grow: 2.1, after: 0.5, muzzle: 'tube', det: 'implode', sfx: 'plasmic' },
  // smaller green plasma charge (the plasma torpedo tubes)
  plasma: { body: 'orb', flare: { size: 7.5, spikes: 0, ring: 0.2, core: 0.26, pulse: 5, throb: 0.35, hot: 0xe0fff0 }, grow: 1.3, after: 0.6, muzzle: 'tube', det: 'implode', sfx: 'plasmic', pitch: 1.25 },
  // gold, ringed, with a slow ticking pulse
  chronal: { body: 'orb', flare: { size: 7.8, spikes: 4, sharp: 1.6, ring: 1, core: 0.18, pulse: 2, throb: 0.35, spin: 0.8, hot: 0xfff6d0 }, motes: { n: 1, r: 0.5, turns: 1.2 }, after: 0.7, muzzle: 'tube', det: 'chronal', sfx: 'photon', pitch: 1.3 },
  // the demolition device: huge, white-blue, slow and stately
  tricore: { body: 'orb', flare: { size: 10.5, spikes: 8, sharp: 1.3, ring: 0.6, core: 0.2, pulse: 1.6, throb: 0.2, spin: 0.4, hot: 0xffffff }, after: 0.6, muzzle: 'tube', det: 'nova', sfx: 'heavyTorp' },
  // magenta, wrapped in two motes that corkscrew round it
  phase: { body: 'orb', flare: { size: 6.9, spikes: 4, sharp: 1.8, ring: 0.3, core: 0.2, pulse: 8, throb: 0.25, spin: 4, hot: 0xffd8ff }, motes: { n: 2, r: 0.9, turns: 2.6 }, after: 0.8, muzzle: 'tube', det: 'phase', sfx: 'photon', pitch: 0.8 },
  // violet ion charge, six rays inside a bright ring
  polaric: { body: 'orb', flare: { size: 7.5, spikes: 6, sharp: 1.4, ring: 0.8, core: 0.18, pulse: 7, throb: 0.3, spin: -1.6, hot: 0xf0d8ff }, after: 0.7, muzzle: 'tube', det: 'rift', sfx: 'quantal', pitch: 0.72 },
  // gravity torpedo: dark-cored, ringed, the light bent round it
  rift: { body: 'orb', flare: { size: 8.2, spikes: 0, ring: 1, core: 0.12, pulse: 2.5, throb: 0.3, hot: 0xd0b0ff }, motes: { n: 3, r: 0.7, turns: -1.5 }, after: 0.5, muzzle: 'tube', det: 'rift', sfx: 'heavyTorp', pitch: 1.3 },
  // antimatter: a hard white-pink point with long rays
  antimatter: { body: 'orb', flare: { size: 10.5, spikes: 8, sharp: 2.4, ring: 0.4, core: 0.14, pulse: 5, throb: 0.2, spin: 1, hot: 0xffffff }, after: 0.8, muzzle: 'tube', det: 'nova', sfx: 'heavyTorp', pitch: 1.15 },
};

// Beam styles (BEAM): how a beam weapon draws and sounds.
//   core     white-hot share of the core, flow: energy pulses running down the beam (units/s / wave length)
//   wave     pulse spacing (world units), jag: lightning segments (0 = straight), flicker: width noise
//   sweep    how far the strike point rakes across the target over the beam's life (x target beam)
//   life     the least time the beam is drawn (damage is still dealt once, as it lands)
//   spikes   emitter / impact star rays, sfx + pitch: the sound (engine/Audio.js)
export const BEAM = {
  plain: { core: 0.5, flow: 0, wave: 40, jag: 0, flicker: 0.25, sweep: 0, life: 0, spikes: 0, sfx: null },
  phaser: { core: 0.6, flow: 260, wave: 26, jag: 0, flicker: 0.12, sweep: 0.8, life: 0.42, spikes: 4, sfx: 'phaser', pitch: 1 },
  lance: { core: 0.55, flow: 200, wave: 44, jag: 0, flicker: 0.1, sweep: 0.4, life: 0.4, spikes: 6, sfx: 'lance', pitch: 1 },
  pulse: { core: 0.7, flow: 420, wave: 20, jag: 0, flicker: 0.1, sweep: 0, life: 0, spikes: 4, sfx: 'pulsePhaser', pitch: 0.85 },
  tachyon: { core: 0.9, flow: 600, wave: 60, jag: 0, flicker: 0.05, sweep: 0.2, life: 0.4, spikes: 2, sfx: 'tosPhaser', pitch: 1.2 },
  solar: { core: 0.75, flow: 160, wave: 50, jag: 0, flicker: 0.18, sweep: 0.5, life: 0.6, spikes: 8, sfx: 'lance', pitch: 0.75 },
  spinal: { core: 0.7, flow: 340, wave: 80, jag: 0, flicker: 0.08, sweep: 0.15, life: 0.6, spikes: 8, sfx: 'spinal', pitch: 1 },
  disruptor: { core: 0.35, flow: 520, wave: 16, jag: 0, flicker: 0.45, sweep: 0.3, life: 0.3, spikes: 4, sfx: 'disruptor', pitch: 1 },
  arc: { core: 0.85, flow: 0, wave: 30, jag: 6, flicker: 0.5, sweep: 0, life: 0.22, spikes: 4, sfx: 'arc', pitch: 1 },
  graviton: { core: 0.25, flow: -180, wave: 36, jag: 0, flicker: 0.2, sweep: 0.2, life: 0.45, spikes: 0, sfx: 'graviton', pitch: 1 },
  tractor: { core: 0.35, flow: -120, wave: 30, jag: 0, flicker: 0.15, sweep: 0.5, life: 0.45, spikes: 0, sfx: 'graviton', pitch: 1.5 },
  disintegrator: { core: 0.65, flow: 300, wave: 22, jag: 0, flicker: 0.3, sweep: 0.6, life: 0.45, spikes: 6, sfx: 'phaser', pitch: 0.7 },
};

// Fire patterns: how a volley of `barrels` shots leaves the launcher (timing and fan only; the damage of a
// volley is the same whichever pattern fires it).
//   pair    tubes fire one after the other, a beat apart
//   spread  every tube at once, fanned out (the torpedoes home back in)
//   salvo   one tube cycling fast: a string of shots down the same line
export const PATTERN = {
  ripple: { gap: 0.05, fan: 0 },
  broadside: { gap: 0.09, fan: 0 },
  pair: { gap: 0.32, fan: 0 },
  spread: { gap: 0.025, fan: 0.11 },
  salvo: { gap: 0.13, fan: 0, oneTube: true },
};

// detonation looks (FX.detonate)
export const DET = ['burst', 'flak', 'spark', 'plasma', 'ion', 'nova', 'photic', 'quantal', 'implode', 'chronal', 'phase', 'rift'];

// The projectile style a weapon base fires.
export function shotStyle(b) {
  if (b.fx && SHOT[b.fx]) return b.fx;
  switch (b.kind) {
    case 'torpedo': return b.dmgType === 'energy' ? 'plasma' : b.dmgType === 'ion' ? 'quantal' : 'photic';
    case 'missile': return 'missile';
    case 'flak': return 'flak';
    case 'bolt': return b.dmgType === 'kinetic' ? 'slug' : b.dmgType === 'ion' ? 'ionBolt' : b.splash ? 'plasmaBolt' : 'laserBolt';
    case 'shell': return b.dmg > 150 || (b.splash || 0) > 80 ? 'nova' : b.dmg > 60 ? 'heavyShell' : 'tracer';
    default: return 'tracer';
  }
}

// The beam style a beam weapon base draws.
export function beamStyle(b) {
  if (b.beam && BEAM[b.beam]) return b.beam;
  if (b.slot === 'prow') return b.dmgType === 'ion' ? 'disruptor' : b.dmgType === 'kinetic' ? 'graviton' : 'spinal';
  if (b.dmgType === 'ion') return 'disruptor';
  if (b.dmgType === 'kinetic') return 'graviton';
  return b.slot === 'broadside' ? 'lance' : 'phaser';
}

// The pattern a volley fires in.
export function firePattern(b, slot) {
  if (b.pattern && PATTERN[b.pattern]) return b.pattern;
  return slot === 'broadside' ? 'broadside' : 'ripple';
}

// Launch sound for a weapon base: [sound, pitch]
export function shotSound(b) {
  if (b.kind === 'beam') { const s = BEAM[beamStyle(b)]; return [s.sfx || 'phaser', s.pitch || 1]; }
  const s = SHOT[shotStyle(b)];
  return [s.sfx, s.pitch || 1];
}
