// The living, talking side of a landing site. Pure data + small pure helpers (no three.js, no DOM):
// harmless fauna per biome, the curiosities an explorer can scan, the radio chatter from orbit,
// kill-streak callouts, time-of-day presets and the expedition report's rating.
import { RNG } from '../../engine/rng.js';

// ---------------------------------------------------------------- harmless fauna
// body/belly/glow colours; hop = jump height; shape picks the model variant.
export const FAUNA = {
  terran: { id: 'blorp', name: 'Meadow Blorp', plural: 'Blorps', shape: 'blob', body: 0xff8fb8, belly: 0xffe0ea, glow: 0x80ffb0, hop: 1.5, size: 1,
    note: 'Round, harmless, quietly judgemental. Tastes of regret (the ship\'s cook checked).' },
  desert: { id: 'skitter', name: 'Dune Skitter', plural: 'Skitters', shape: 'bug', body: 0xd8a45a, belly: 0xf6e2b0, glow: 0xffd070, hop: 0.6, size: 0.9,
    note: 'Runs everywhere, arrives nowhere. Believed to be late for something.' },
  arid: { id: 'plodder', name: 'Canyon Plodder', plural: 'Plodders', shape: 'blob', body: 0xb86a48, belly: 0xe8b890, glow: 0xff9060, hop: 0.7, size: 1.25,
    note: 'Has been walking to the same rock for nine years. Do not tell it the rock moved.' },
  ice: { id: 'puff', name: 'Frost Puff', plural: 'Puffs', shape: 'puff', body: 0xe8f4ff, belly: 0xffffff, glow: 0x80d8ff, hop: 1.2, size: 1,
    note: 'Ninety percent fluff by volume. The remaining ten percent is also fluff.' },
  lava: { id: 'tick', name: 'Cinder Tick', plural: 'Ticks', shape: 'bug', body: 0x3a2a26, belly: 0xff7a30, glow: 0xff6020, hop: 0.9, size: 0.85,
    note: 'Lives in lava by choice. Science has asked why. The tick declined to comment.' },
  barren: { id: 'bunny', name: 'Regolith Dust Bunny', plural: 'Dust Bunnies', shape: 'puff', body: 0x9a9aa8, belly: 0xc8c8d8, glow: 0x9ab8ff, hop: 2.2, size: 0.9,
    note: 'Breathes nothing, eats nothing, somehow multiplies. Low gravity enthusiast.' },
  toxic: { id: 'wobbler', name: 'Spore Wobbler', plural: 'Wobblers', shape: 'shroom', body: 0x8ac040, belly: 0xe8ffb0, glow: 0xa0ff40, hop: 0.8, size: 1.05,
    note: 'Technically a mushroom with opinions. Do not lick. This warning exists for a reason.' },
  crystal: { id: 'hopper', name: 'Prism Hopper', plural: 'Hoppers', shape: 'gem', body: 0xc890ff, belly: 0xf0d8ff, glow: 0xd080ff, hop: 1.8, size: 0.95,
    note: 'Refracts sunlight into rainbows and anxiety. Chimes faintly when startled.' },
};
export function faunaFor(type) { return FAUNA[type] || FAUNA.barren; }

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
// Things with no business being on an alien world. Scanning one pays explorer XP, a few data
// cores and a line for the log. `where` limits a curio to some biomes (omitted = anywhere).
export const CURIOS = {
  monolith: { name: 'Featureless Monolith', hex: 0xb080ff, lore: [
    'Perfectly black, perfectly smooth, humming in B-flat. Science is "cautiously thrilled".',
    'It is exactly 1 by 4 by 9. The XO asks that nobody touch it. Somebody has already touched it.',
    'Absorbs all scans and returns one word: "LATER".' ] },
  probe: { name: 'Antique Survey Probe', hex: 0x58c8ff, lore: [
    'A probe from an earlier age, still transmitting. The message decodes as "is anyone coming to get me".',
    'Its mission clock reads 4,112 years. Its warranty expired after two.',
    'Still dutifully photographing the same rock. 900,000 pictures. They are all quite good.' ] },
  skull: { name: 'Titanic Skull', hex: 0xffd66a, lore: [
    'Whatever this was, it had three eyes and died annoyed.',
    'Bite radius: one explorer. Recommended response: gratitude that it is extinct.',
    'Science notes tooth marks on the skull. From something bigger. Science has stopped taking notes.' ] },
  gnome: { name: 'Garden Gnome', hex: 0xff5a6a, lore: [
    'A ceramic garden gnome, 600 light-years from the nearest garden. It is smiling. Nobody put it here.',
    'The gnome has been catalogued on eleven worlds. It is always the same gnome.',
    'Scan complete. The gnome was facing the other way a moment ago.' ] },
  vendor: { name: 'Vending Machine', hex: 0x5affb0, lore: [
    'Fully stocked and powered. Prices are in a currency that predates your species. Exact change only.',
    'Dispensed one (1) lukewarm beverage and a receipt reading "THANK YOU, PRECURSOR".',
    'Row C is all the same snack. The label translates to "regret (original flavour)".' ] },
  camp: { name: 'Abandoned Survey Camp', hex: 0xffb040, lore: [
    'A previous expedition\'s camp. The log\'s last entry: "The blobs are friendly. Too friendly."',
    'One tent, one flag, one half-finished crossword. 7 down is "extraction".',
    'Rations untouched, coffee gone. They left in a hurry but not without priorities.' ] },
  duck: { name: 'Unexplained Duck', hex: 0xffe040, lore: [
    'A rubber duck the size of a shuttle. Carbon dating says: older than the planet.',
    'It squeaks when scanned. The squeak contains a compressed star chart. And a second, smaller squeak.',
    'The Precursors built wonders beyond comprehension. Also this.' ] },
  statue: { name: 'Weathered Idol', hex: 0xc0a0ff, lore: [
    'A stone idol of a round creature with eye-stalks. Somebody worshipped the local wildlife. Understandable.',
    'The inscription reads: "It hopped. We followed. No further questions."',
    'An offering bowl at its feet holds a single, very old biscuit.' ] },
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
  deploy: [['ops', 'Explorer away. Try to bring this one back with all its wheels.'], ['eng', 'She\'s freshly waxed, Captain. Please notice before you scratch her.'],
    ['xo', 'Surface team is go. Standing orders: mine, map, don\'t feed anything.'], ['qm', 'Hold\'s empty and I\'m optimistic. Don\'t ruin either.']],
  deploy_lava: [['eng', 'Reminder: the tyres are rated for "warm". That down there is not "warm".'], ['sci', 'The ground is mostly ground. The glowing parts are not ground.']],
  deploy_ice: [['eng', 'Heater\'s on full. If you smell burning, that\'s the heater. Probably.'], ['sci', 'Minus ninety outside. The locals think it\'s a heatwave.']],
  deploy_toxic: [['sci', 'Atmosphere is 4% oxygen and 96% bad decisions. Keep the windows up.'], ['xo', 'Nobody lick anything. I mean it this time.']],
  deploy_terran: [['sci', 'Breathable air, liquid water, trees. Suspiciously nice. Stay alert.'], ['qm', 'If it\'s green and it grows, I can sell it. Fill the hold.']],
  deploy_desert: [['ops', 'Sand in every direction, Captain. Sensors confirm: more sand.'], ['eng', 'I\'ll be cleaning grit out of that drivetrain for a month. Enjoy yourself.']],
  deploy_crystal: [['sci', 'The whole landscape is singing at 40 kilohertz. Please don\'t sing back.'], ['qm', 'Everything down there sparkles. Grab the sparkly ones.']],
  deploy_barren: [['ops', 'No air, no water, no life signs. Lovely spot. Very quiet.'], ['sci', 'Technically nothing lives here. Technically.']],
  deploy_arid: [['ops', 'Canyon country. Mind the edges, they are famously further down than they look.'], ['sci', 'Stratigraphy is gorgeous. Please drive slowly past the good layers.']],
  firstKill: [['xo', 'First contact protocol: completed, loudly.'], ['ops', 'Hostile down. It started it. Logging that it started it.'], ['sci', 'I was going to study that.']],
  lowHull: [['eng', 'Hull\'s at a third! That is my LEAST favourite fraction!'], ['eng', 'She\'s coming apart, Captain — the lander can patch her, if there\'s a "her" left.'], ['xo', 'Recommend a tactical withdrawal. Screaming optional.']],
  cargoFull: [['qm', 'Hold\'s full to the gunwales. Bring it home before something eats it.'], ['qm', 'That\'s a full load. I can hear the invoice writing itself.']],
  banked: [['qm', 'Cargo received. Counting it twice, for joy.'], ['qm', 'Banked and logged. You may now go and risk your life again.']],
  boss: [['sci', 'That reading is either one enormous creature or my instruments have given up.'], ['xo', 'Apex contact. Captain, I\'d like it noted that I suggested staying in orbit.'], ['ops', 'Big one on the scope. Really leaning into the "apex" part.']],
  bossDown: [['sci', 'Magnificent specimen. Was. Was a magnificent specimen.'], ['xo', 'Apex down. Drinks are on the Captain.'], ['ops', 'Confirmed kill. The seismographs can stop crying now.']],
  death: [['eng', 'And THAT is why we buy them in bulk. Replacement inbound.'], ['qm', 'That one\'s coming out of someone\'s wages. Not mine.'], ['xo', 'Explorer lost. Pilot recovered, pride not recovered.']],
  punt: [['sci', 'Please stop launching the wildlife. I am trying to count it.'], ['ops', 'Tracking one airborne blob. It appears to be fine. It appears to be delighted.'], ['xo', 'That was not in the survey plan, Captain.'], ['eng', 'Bumper\'s rated for rocks. Not for... whatever that squeak was.']],
  curio: [['sci', 'Fascinating. Completely useless, but fascinating.'], ['sci', 'Log it, scan it, do not bring it aboard.'], ['ops', 'Adding that to the map under "unexplained". The folder is getting thick.']],
  curioAll: [['sci', 'That\'s every anomaly on site catalogued. The Institute will name a corridor after you.'], ['xo', 'Full survey. A commendation is being drafted. Briefly.']],
  dungeon: [['ops', 'We lose telemetry underground. If you need us, yell upward.'], ['xo', 'Going into the dark hole voluntarily. Noted in the log, with punctuation.'], ['sci', 'Mind the architecture — some of it is load-bearing, some of it is teeth.']],
  streak: [['ops', 'Somebody\'s having a day.'], ['xo', 'Leave some for the next survey team.'], ['eng', 'Barrels are glowing. Pretty. Stop it.']],
  wave: [['ops', 'Movement all around you. A lot of it. Mostly teeth.'], ['ops', 'Company\'s coming, and it didn\'t bring a dish.']],
  idle: [['ops', 'Captain? Still with us? The explorer hasn\'t moved and the crew is taking bets.'], ['eng', 'If you\'re just going to park, at least turn the engine off.'], ['sci', 'While you\'re stationary — the small round locals are staring at you. All of them.']],
  extract: [['ops', 'Dropship is burning hard for your position. Do not die in the next eight seconds.'], ['xo', 'Hold that ground. Preferably the part you\'re standing on.']],
  weather: [['ops', 'Weather front on top of you. We can see it from orbit. It\'s quite pretty from here.'], ['eng', 'She\'s weatherproof. Weather-resistant. Weather-aware.']],
  weather_storm: [['sci', 'Lightning seeks the tallest metal object for kilometres. Captain, that\'s you.'], ['ops', 'Storm cell overhead. If your hair stands up, move.']],
  weather_acid: [['eng', 'Acid rain. That\'s the paint gone, then.'], ['sci', 'pH of 1.4 and falling. Do not catch it on your tongue.']],
  weather_sand: [['eng', 'Close the vents! ...there are a lot of vents. Close most of the vents!'], ['ops', 'We\'ve lost visual on you. We assume you\'re the beige thing.']],
  weather_blizzard: [['ops', 'Whiteout. Lander beacon is your friend.'], ['eng', 'Wipers are for rain, Captain. This is weather with ambitions.']],
  weather_ash: [['sci', 'The volcano is clearing its throat. Rocks first, apologies never.'], ['xo', 'Things are falling from the sky that used to be the ground. Adjust accordingly.']],
  weather_meteors: [['sci', 'Meteor shower! Make a wish. Wish for a harder roof.'], ['qm', 'Free ore, delivered at orbital velocity. Collect it after it stops.']],
  weather_resonance: [['sci', 'The crystals are discharging in harmony. It\'s beautiful. It\'s also 40,000 volts.'], ['ops', 'Whole valley just lit up on sensors. Tread carefully.']],
  honk: [['xo', 'Was that the horn? In a combat zone? Captain.'], ['sci', 'Fascinating. Every creature within a kilometre now knows exactly where you are.'], ['eng', 'Horn works, then. I\'ll tick it off the list.']],
  curious: [['sci', 'The wildlife has gathered to watch you. Do something impressive.'], ['ops', 'You have an audience, Captain. Small. Round. Unblinking.']],
};
export function radioLine(event, rnd = Math.random) {
  const pool = RADIO[event];
  if (!pool || !pool.length) return null;
  const [who, text] = pool[Math.floor(rnd() * pool.length) % pool.length];
  return { who, name: RADIO_CAST[who].name, hex: RADIO_CAST[who].hex, text };
}

// ---------------------------------------------------------------- kill streaks
export const STREAKS = [
  [2, 'DOUBLE KILL', ''], [3, 'TRIPLE KILL', ''], [4, 'OVERKILL', 'the paperwork is going to be enormous'],
  [6, 'RAMPAGE', 'ecologists hate this one trick'], [9, 'EXTINCTION EVENT', 'please leave a breeding pair'],
  [13, 'PLANETARY PEST CONTROL', 'invoice sent to the biosphere'], [18, 'THEY HAD FAMILIES', 'large ones, apparently'],
];
export const STREAK_WINDOW = 4.5;
// the callout for reaching exactly n kills in a chain (null between tiers)
export function streakFor(n) { for (const s of STREAKS) if (s[0] === n) return { n, title: s[1], sub: s[2], tier: STREAKS.indexOf(s) }; return null; }
export function streakBonus(n) { return n >= 2 ? Math.min(0.5, 0.05 * (n - 1)) : 0; }   // bonus XP share per kill in a chain

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
// One title per run, first match wins: the funniest true thing about how it went.
export function expeditionRating(r) {
  const banked = r.banked || 0, kills = r.kills || 0;
  if ((r.deaths || 0) >= 3) return ['Insurance Liability', 'The fabricator would like a word.'];
  if ((r.bosses || 0) >= 2) return ['Apex of Apexes', 'The food chain has been restructured.'];
  if ((r.curios || 0) >= (r.curioTotal || 99)) return ['Tourist of the Year', 'Saw everything. Touched most of it.'];
  if ((r.punts || 0) >= 8) return ['Blob Launcher, First Class', 'The wildlife has filed a formal complaint.'];
  if ((r.bestStreak || 0) >= 9) return ['One-Rover Extinction Event', 'Ecologists are drafting a strongly worded letter.'];
  if ((r.bosses || 0) >= 1) return ['Big Game Hunter', 'It was bigger. You were ruder.'];
  if ((r.dungeons || 0) >= 1 && kills >= 20) return ['Professional Trespasser', 'Went into the hole. Came out richer.'];
  if (kills === 0 && banked > 0) return ['Conscientious Objector (With a Drill)', 'Harmed nothing but the geology.'];
  if (banked >= 150) return ['Strip Miner Supreme', 'The planet is measurably lighter.'];
  if ((r.deaths || 0) >= 1) return ['Learning Experience', 'Half the cargo, twice the humility.'];
  if (banked === 0 && kills === 0) return ['Scenic Detour', 'Fuel spent: lots. Results: vibes.'];
  if (kills >= 25) return ['Pest Control', 'Efficient. Unrequested. Efficient.'];
  return ['Honest Day\'s Survey', 'Nothing exploded that wasn\'t supposed to.'];
}
