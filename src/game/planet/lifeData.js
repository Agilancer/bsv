// The living, talking side of a landing site. Pure data + small pure helpers (no three.js, no DOM):
// harmless fauna per biome, the curiosities an explorer can scan, the radio chatter from orbit,
// time-of-day presets and the expedition report's rating.
import { RNG } from '../../engine/rng.js';

// ---------------------------------------------------------------- harmless fauna
// body/belly/glow colours (glow = bioluminescent markings); shape picks the model (Life.js);
// gait 'walk' animates the legs, 'hop' bounds; hop = bound height (or the walking bob).
export const FAUNA = {
  terran: { id: 'strider', name: 'Meadow Strider', plural: 'Striders', shape: 'grazer', gait: 'walk', body: 0x6f7a52, belly: 0xc8c49a, glow: 0x7fe0b0, hop: 0.06, size: 1,
    note: 'Six-limbed grazer that crops ground cover in loose herds. Hears the rover long before it sees it, and scatters from weapons fire.' },
  desert: { id: 'skitter', name: 'Dune Skitter', plural: 'Skitters', shape: 'bug', gait: 'walk', body: 0xb08a52, belly: 0xe2cc98, glow: 0xffc860, hop: 0.03, size: 0.9,
    note: 'Burrowing arthropod. Feeds on wind-blown organics after dark and rides out the heat of the day under the sand.' },
  arid: { id: 'shellback', name: 'Canyon Shellback', plural: 'Shellbacks', shape: 'shell', gait: 'walk', body: 0x8a5a40, belly: 0xc89878, glow: 0xff9060, hop: 0.03, size: 1.25,
    note: 'Slow, heavily plated browser. Scrapes mineral crust from canyon walls; the growth rings on its shell put the oldest at two centuries.' },
  ice: { id: 'drifter', name: 'Rime Drifter', plural: 'Drifters', shape: 'woolly', gait: 'walk', body: 0xd8dee6, belly: 0x9aa6b4, glow: 0x80d8ff, hop: 0.05, size: 1.05,
    note: 'Dense-coated herd animal that digs for lichen beneath the snow crust. Its fur insulates so well it reads cold on thermal.' },
  lava: { id: 'tick', name: 'Cinder Tick', plural: 'Ticks', shape: 'bug', gait: 'walk', body: 0x2e2624, belly: 0xc85a28, glow: 0xff6020, hop: 0.03, size: 0.85,
    note: 'Silicate-shelled arthropod that grazes mineral films at the edges of lava flows. Body temperature near four hundred degrees.' },
  barren: { id: 'crawler', name: 'Regolith Crawler', plural: 'Crawlers', shape: 'shell', gait: 'walk', body: 0x6c6c74, belly: 0x9a9aa4, glow: 0x9ab8ff, hop: 0.02, size: 0.9,
    note: 'Lithotroph with a stone-hard shell. Draws energy from sulphur compounds in the regolith and needs no atmosphere at all.' },
  toxic: { id: 'sporewalker', name: 'Spore Walker', plural: 'Spore Walkers', shape: 'fungal', gait: 'walk', body: 0x6a8a34, belly: 0xc8e090, glow: 0xa0ff40, hop: 0.04, size: 1.05,
    note: 'Motile fungal colony on root-like legs. Releases a spore cloud when disturbed; keep the cabin sealed near a herd.' },
  crystal: { id: 'hopper', name: 'Prism Hopper', plural: 'Hoppers', shape: 'crystal', gait: 'hop', body: 0x9a70d8, belly: 0xd8c0f0, glow: 0xd080ff, hop: 1.2, size: 0.95,
    note: 'Grows a mineral carapace from the crystal it eats and moves in long bounds. The shell rings at a single pitch when struck.' },
};
export function faunaFor(type) { return FAUNA[type] || FAUNA.barren; }
// ids and curio kinds that were renamed; old saves are moved over on load (migrateLife)
export const FAUNA_RENAMES = { blorp: 'strider', plodder: 'shellback', puff: 'drifter', bunny: 'crawler', wobbler: 'sporewalker' };
export const CURIO_RENAMES = { gnome: 'custodian', vendor: 'wreck', duck: 'vault' };
export function migrateLife(D) {
  for (const [key, map] of [['faunaCodex', FAUNA_RENAMES], ['curios', CURIO_RENAMES]]) {
    const rec = D && D[key];
    if (!rec) continue;
    for (const [from, to] of Object.entries(map)) {
      if (!(from in rec)) continue;
      const v = rec[from]; delete rec[from];
      if (key === 'curios') rec[to] = (rec[to] || 0) + (v || 0);
      else rec[to] ||= { seen: 1 };
    }
    if (key === 'faunaCodex') for (const v of Object.values(rec)) if (v && typeof v === 'object') { delete v.punts; delete v.best; }
  }
  return D;
}

// herds: deterministic from the site seed; kept off the landing pad and inside the site
export function planHerds(seed, count = 16) {
  const rng = new RNG((seed ^ 0x51f15e) >>> 0), out = [];
  for (let i = 0; i < count; i++) {
    const a = rng.float(0, Math.PI * 2), r = i < 3 ? rng.float(45, 110) : rng.float(110, 900);
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, n: rng.int(3, 7), seed: rng.int(1, 1e9) });
  }
  return out;
}

// ---------------------------------------------------------------- curiosities
// Anomalies the survey crews logged before us: Precursor works, wrecks, remains. Scanning one pays
// explorer XP, a few data cores and a line for the log. Keys are save data (data.curios); the
// order is the site RNG's, so a replacement takes the slot of what it replaces.
export const CURIOS = {
  monolith: { name: 'Featureless Monolith', hex: 0xb080ff, lore: [
    'Black, seamless and warm to the touch. It emits a steady tone at 233 hertz. There is no tool mark anywhere on it.',
    'Exactly one by four by nine. Every monolith logged in the Reach matches these proportions to the micron.',
    'Our scan is absorbed without a return. A moment later, one word arrives on the comm band: "LATER".' ] },
  probe: { name: 'Antique Survey Probe', hex: 0x58c8ff, lore: [
    'One of the first survey probes ever launched from human space, still transmitting on a band nobody has monitored in millennia.',
    'Mission clock: 4,112 years. Its power cell should have failed thirty-nine centuries ago. Something has been keeping it charged.',
    'Its camera has held on the same outcrop since landing. Nine hundred thousand frames, all intact, all identical.' ] },
  skull: { name: 'Fossil Skull', hex: 0xffd66a, lore: [
    'Three orbits and a jaw built for crushing. Isotope dating puts it at eleven million years. Nothing like it lives here now.',
    'The bite span is wider than the explorer. The skull was picked clean long before the sediment covered it.',
    'Tooth marks score the crown. They belong to something considerably larger.' ] },
  custodian: { name: 'Custodian Automaton', hex: 0xff6a5a, lore: [
    'A squat survey automaton, scoured by four thousand years of weather. It stands facing the nearest anomaly and does not respond to hails.',
    'Same serial scoring, same dented cowl, same cracked visor as the unit logged on eleven other worlds. It is not a copy. It is the same machine.',
    'Its sensor head tracked the explorer for the whole scan. When we finished it turned back to face the monolith.' ] },
  wreck: { name: 'Downed Dropship', hex: 0x5affb0, lore: [
    'A colony dropship, broken across the spine. The hull registry predates the Dominion. No remains aboard; the hatches were opened from the inside.',
    'The flight recorder is intact. The last eleven minutes are a stable descent, then the recording stops a hundred metres up.',
    'Cargo bay stripped to the frame. Whoever salvaged it took the cryo cradles and left the fuel.' ] },
  camp: { name: 'Abandoned Survey Camp', hex: 0xffb040, lore: [
    'A previous expedition\'s camp. The last log entry is a grid reference and two words: "going closer".',
    'One shelter, one beacon, one bedroll still laid out. The beacon\'s battery was removed, not drained.',
    'Rations untouched. Rover tracks lead away towards the nearest anomaly and stop in open ground.' ] },
  vault: { name: 'Sealed Seed Vault', hex: 0xffe040, lore: [
    'A ribbed Precursor dome, sealed and cold inside. Deep scan finds stored genetic material from forty species. Several match the local wildlife.',
    'The seals are keyed to a signal we cannot produce. The interior has held at four degrees for longer than the planet has had an ocean.',
    'A record of what this world was meant to become, written before anything lived on it.' ] },
  statue: { name: 'Weathered Idol', hex: 0xc0a0ff, lore: [
    'A stone figure of a six-limbed grazer, worn almost smooth. Nothing native to this world could have carved it.',
    'The inscription is in Precursor script. Science can read one word of it, repeated down the plinth: "tended".',
    'An offering bowl at its base holds fresh seed husks. There are no settlements within a thousand kilometres.' ] },
};
export const CURIO_KINDS = Object.keys(CURIOS);
export const CURIOS_PER_SITE = 5;

export function planCurios(seed, n = CURIOS_PER_SITE) {
  const rng = new RNG((seed ^ 0xc0c0a) >>> 0), out = [];
  const kinds = [...CURIO_KINDS];
  for (let i = 0; i < n; i++) {
    const kind = kinds.splice(rng.int(0, kinds.length - 1), 1)[0];
    // the first one sits close to the pad so every landing teaches the idea
    const a = rng.float(0, Math.PI * 2), r = i === 0 ? rng.float(60, 95) : rng.float(140, 620);
    out.push({ kind, x: Math.cos(a) * r, z: Math.sin(a) * r, rot: rng.float(0, 6.28), lore: rng.int(0, CURIOS[kind].lore.length - 1), scanned: false, progress: 0 });
  }
  return out;
}
export function curioReward(level, all = false) {
  return { xp: Math.round((18 + level * 7) * (all ? 3 : 1)), credits: Math.round((40 + level * 22) * (all ? 3 : 1)), data: all ? 4 : 2 };
}

// ---------------------------------------------------------------- radio chatter from orbit
export const RADIO_CAST = {
  ops: { name: 'Ops', hex: '#58c8ff' }, eng: { name: 'Chief Engineer', hex: '#ffb040' },
  sci: { name: 'Science', hex: '#b48cff' }, qm: { name: 'Quartermaster', hex: '#5affb0' }, xo: { name: 'XO', hex: '#ff8a9a' },
};
export const RADIO = {
  deploy: [['ops', 'Explorer away. Telemetry is green; we have you on the orbital pass.'], ['eng', 'She\'s freshly serviced, Captain. Try to bring her back with all her wheels.'],
    ['xo', 'Surface team is go. Standing orders: mine, map, and report anything that moves.'], ['qm', 'Hold\'s empty. Every crate you bring back pays for the next landing.']],
  deploy_lava: [['eng', 'Tyres are rated for heat, not for that. Stay off anything that glows.'], ['sci', 'Surface crust is thin in places. If the ground brightens under you, move.']],
  deploy_ice: [['eng', 'Heaters on full. Cells drain faster in this cold; watch the hull readout.'], ['sci', 'Minus ninety at the surface. Crevasse fields show dark on your map.']],
  deploy_toxic: [['sci', 'Four percent oxygen, the rest corrosive. Keep the cabin sealed the whole time.'], ['xo', 'Contaminated site. Decon on return, no exceptions.']],
  deploy_terran: [['sci', 'Breathable air, liquid water, an active biosphere. Expect wildlife, and expect it to be territorial.'], ['qm', 'Organics sell. Fill the hold.']],
  deploy_desert: [['ops', 'Open dunes to every horizon. Sand will hide deposits; trust the scanner over your eyes.'], ['eng', 'Grit gets into everything. Keep your speed up and the intakes closed.']],
  deploy_crystal: [['sci', 'The whole formation is resonating at forty kilohertz. Sensors will be noisy down there.'], ['qm', 'Crystal fetches a good price. Bring back as much as you can carry.']],
  deploy_barren: [['ops', 'No air, no water, no life signs. Quiet site. Keep it that way.'], ['sci', 'Nothing should live here. If something reads as alive, log it.']],
  deploy_arid: [['ops', 'Canyon country. The edges are further down than they look.'], ['sci', 'Exposed strata all the way down. Some of the best deposits sit along the walls.']],
  firstKill: [['xo', 'First hostile down. Log the engagement.'], ['ops', 'Contact destroyed. It fired first; that\'s on the record.'], ['sci', 'I would have liked that one intact for study.']],
  lowHull: [['eng', 'Hull\'s at a third! Get clear and let the lander patch her.'], ['eng', 'She\'s coming apart, Captain. Break contact while there\'s something left to repair.'], ['xo', 'Recommend withdrawal to the lander. Now.']],
  cargoFull: [['qm', 'Hold\'s full. Bring it home before something takes it off you.'], ['qm', 'That\'s a full load. Bank it at the lander.']],
  banked: [['qm', 'Cargo received and logged.'], ['qm', 'Banked. Hold is clear for the next run.']],
  boss: [['sci', 'That reading is one creature. One very large creature.'], ['xo', 'Apex contact. Captain, I\'d like it noted that I suggested staying in orbit.'], ['ops', 'Large signature closing on your position. Weapons free.']],
  bossDown: [['sci', 'Apex down. I want tissue samples before the scavengers arrive.'], ['xo', 'Confirmed kill on the apex. Good work, Captain.'], ['ops', 'Signature is gone. Seismographs are settling.']],
  death: [['eng', 'Explorer lost. Fabricating a replacement now.'], ['qm', 'That one\'s coming out of the budget.'], ['xo', 'Explorer down. Pilot recovered. Replacement inbound.']],
  curio: [['sci', 'Anomaly logged. I want the full scan uploaded to the Institute.'], ['sci', 'Scan it, log it, do not bring it aboard.'], ['ops', 'Marked on the map. That\'s another one for the unexplained file.'], ['sci', 'Fascinating. I have no idea what it means yet.']],
  curioAll: [['sci', 'Every anomaly on site catalogued. That\'s a complete survey.'], ['xo', 'Full survey complete. Noted in the captain\'s log.']],
  dungeon: [['ops', 'We lose telemetry underground. Your beacon is all we\'ll have.'], ['xo', 'Entering the structure. Weapons ready, and keep the way out in mind.'], ['sci', 'Precursor architecture. Some of it is load-bearing. Some of it is defended.']],
  wave: [['ops', 'Movement all around you. A lot of it.'], ['ops', 'Multiple contacts converging on your position.']],
  idle: [['ops', 'Captain? The explorer hasn\'t moved in a while. Confirm status.'], ['eng', 'If you\'re holding position, at least idle the drive.'], ['sci', 'While you\'re stationary, the local wildlife has stopped grazing to watch you.']],
  extract: [['ops', 'Dropship is burning hard for your position. Hold on for eight seconds.'], ['xo', 'Hold that ground until the dropship is down.']],
  weather: [['ops', 'Weather front on top of you. We can see it from orbit.'], ['eng', 'She\'s weather-sealed. Mostly.']],
  weather_storm: [['sci', 'Lightning finds the tallest metal object for kilometres. Captain, that\'s you.'], ['ops', 'Storm cell overhead. Watch for the strike markers.']],
  weather_acid: [['eng', 'Acid rain. That\'s the paint gone, then.'], ['sci', 'pH of 1.4 and falling. Keep exposure short.']],
  weather_sand: [['eng', 'Close the vents. Sandstorm is right on you.'], ['ops', 'We\'ve lost visual. Steering you by beacon.']],
  weather_blizzard: [['ops', 'Whiteout. The lander beacon is your way home.'], ['eng', 'Ice is building on the sensors. Keep moving.']],
  weather_ash: [['sci', 'The volcano is venting. Ejecta incoming; watch for the impact markers.'], ['xo', 'Debris falling across your area. Adjust course.']],
  weather_meteors: [['sci', 'Meteor shower inbound. Stay clear of the impact markers.'], ['qm', 'Those impacts leave ore behind. Collect it once they stop.']],
  weather_resonance: [['sci', 'The crystals are discharging in sequence. Forty thousand volts per arc.'], ['ops', 'Whole valley just lit up on sensors. Tread carefully.']],
  lure: [['ops', 'Lure pulse away. Everything hostile within seventy metres is coming to you.'], ['sci', 'Every creature for a kilometre now knows exactly where you are.'], ['xo', 'You called them in, Captain. Make sure you have the guns for it.']],
  curious: [['sci', 'The wildlife has gathered to watch you. Don\'t make any sudden moves.'], ['ops', 'You have company, Captain. Several of the locals, keeping their distance.']],
};
export function radioLine(event, rnd = Math.random) {
  const pool = RADIO[event];
  if (!pool || !pool.length) return null;
  const [who, text] = pool[Math.floor(rnd() * pool.length) % pool.length];
  return { who, name: RADIO_CAST[who].name, hex: RADIO_CAST[who].hex, text };
}

// ---------------------------------------------------------------- time of day
// Multipliers and tints over the biome's own light. `dir` is the sun direction (x, y, z); a low sun
// lights flat ground at a grazing angle, so sunMul rises as the sun sinks to keep the ground readable.
export const TIMES_OF_DAY = {
  noon: { name: 'High sun', dir: [0.45, 1, 0.3], sun: 0xffffff, sunMul: 1, hemiMul: 1, fogTint: 0xffffff, fogMix: 0, w: 3 },
  morning: { name: 'Early light', dir: [-0.8, 0.62, 0.45], sun: 0xfff0d0, sunMul: 1.4, hemiMul: 0.95, fogTint: 0xfff0e0, fogMix: 0.12, w: 2.5 },
  golden: { name: 'Golden hour', dir: [0.9, 0.42, -0.35], sun: 0xffc27a, sunMul: 1.8, hemiMul: 0.85, fogTint: 0xffb878, fogMix: 0.3, w: 2.5 },
  dusk: { name: 'Dusk', dir: [-0.85, 0.3, -0.5], sun: 0xff8a70, sunMul: 1.7, hemiMul: 0.7, fogTint: 0x6a4a90, fogMix: 0.42, w: 1.6 },
};
export function timeOfDay(seed) {
  const rng = new RNG((seed ^ 0x7ac0) >>> 0);
  const k = rng.weighted(Object.entries(TIMES_OF_DAY).map(([id, t]) => [id, t.w]));
  return { id: k, ...TIMES_OF_DAY[k] };
}

// ---------------------------------------------------------------- weather fronts
// fall: the particle kind; fog/dim: how far the haze closes in and the sun drops at full strength;
// strike: telegraphed hits {kind, every (s), r, lead (s), dmg (share of explorer hull), hex}.
export const WEATHER = {
  terran: { id: 'storm', name: 'Thunderstorm', warn: 'lightning incoming, stay out of the rings', fall: 'rain', rate: 14, col: [1.3, 1.8, 2.6], fog: 0.3, dim: 0.45,
    strike: { kind: 'bolt', every: 3.2, r: 6, lead: 1.3, dmg: 0.07, hex: 0xbfd8ff } },
  toxic: { id: 'acid', name: 'Acid squall', warn: 'caustic lightning, mind the rings', fall: 'rain', rate: 12, col: [1.5, 2.6, 0.6], fog: 0.3, dim: 0.35,
    strike: { kind: 'bolt', every: 3.6, r: 6, lead: 1.3, dmg: 0.07, hex: 0xb0ff50 } },
  desert: { id: 'sand', name: 'Sandstorm', warn: 'visibility dropping', fall: 'sand', rate: 2.2, col: [0.5, 0.4, 0.27], fog: 0.5, dim: 0.35, strike: null },
  arid: { id: 'sand', name: 'Dust storm', warn: 'visibility dropping', fall: 'sand', rate: 2.0, col: [0.48, 0.32, 0.24], fog: 0.45, dim: 0.3, strike: null },
  ice: { id: 'blizzard', name: 'Blizzard', warn: 'whiteout conditions', fall: 'snow', rate: 10, col: [2.3, 2.5, 2.8], fog: 0.45, dim: 0.3, strike: null },
  lava: { id: 'ash', name: 'Eruption', warn: 'lava bombs falling, watch the rings', fall: 'ash', rate: 4, col: [2.4, 0.8, 0.25], fog: 0.25, dim: 0.2,
    strike: { kind: 'bomb', every: 3.4, r: 7, lead: 1.5, dmg: 0.08, hex: 0xff6a20 } },
  barren: { id: 'meteors', name: 'Meteor shower', warn: 'impacts incoming — they leave ore behind', fall: 'none', rate: 0, col: [1, 1, 1], fog: 0, dim: 0,
    strike: { kind: 'meteor', every: 2.6, r: 7, lead: 1.5, dmg: 0.08, hex: 0xffb060 } },
  crystal: { id: 'resonance', name: 'Resonance storm', warn: 'the crystals are discharging', fall: 'glints', rate: 5, col: [2.4, 1.6, 3.2], fog: 0.15, dim: 0.25,
    strike: { kind: 'bolt', every: 3.0, r: 6, lead: 1.3, dmg: 0.07, hex: 0xd890ff } },
};
export function weatherFor(type) { return WEATHER[type] || null; }

// ---------------------------------------------------------------- expedition report
// One rating per run, first match wins: the line the survey office files it under.
export function expeditionRating(r) {
  const banked = r.banked || 0, kills = r.kills || 0;
  if ((r.deaths || 0) >= 3) return ['Heavy Losses', 'Three or more explorers lost. Review the approach before the next landing.'];
  if ((r.bosses || 0) >= 2) return ['Apex Clearance', 'Multiple apex predators destroyed. The site is safer for the next crew.'];
  if ((r.curios || 0) >= (r.curioTotal || 99)) return ['Full Survey', 'Every anomaly on the site scanned and logged.'];
  if (kills >= 60) return ['Sustained Engagement', 'Heavy resistance on the surface, all of it put down.'];
  if ((r.bosses || 0) >= 1) return ['Apex Kill', 'The site\'s apex predator is confirmed destroyed.'];
  if ((r.dungeons || 0) >= 1 && kills >= 20) return ['Structure Cleared', 'Entered a Precursor structure and came back out with the haul.'];
  if (kills === 0 && banked > 0) return ['Clean Extraction', 'Cargo banked without a single engagement.'];
  if (banked >= 150) return ['Major Haul', 'A heavy load of resources banked at the lander.'];
  if ((r.deaths || 0) >= 1) return ['Costly Landing', 'An explorer lost; part of the cargo with it.'];
  if (banked === 0 && kills === 0) return ['Reconnaissance', 'Site observed. Nothing banked, nothing engaged.'];
  if (kills >= 25) return ['Area Secured', 'Hostile life cleared from the landing zone.'];
  return ['Routine Survey', 'Objectives met without incident.'];
}
