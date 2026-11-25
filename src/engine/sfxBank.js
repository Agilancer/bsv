// The interface sound bank: every file under assets/audio/ui (built from the SCI-FI UI SFX pack by
// tools/audio/build_ui_sfx.py) belongs to exactly one cue here, and every cue says what in the game it is for.
// Pure data, importable in node: tests/sfx.test.mjs checks the bank against the files on disk and the call sites.
//
// A cue: { f: files, v: volume (0..1, files are loudness-matched), pick, gap: seconds before it may sound again,
//          lim: voices at once, with: another cue layered on top, pre: decode at start-up (frequent, latency-bound) }
// pick: 'any'   a random file (never the same twice running)       — clicks, glitches
//       'tier'  o.tier picks the file (clamped)                     — rarity, ship size, talent rank
//       'key'   a stable hash of o.key picks it                     — each window / mode / option keeps its own pitch
//       'cycle' round-robin                                         — repeated notices
//
// How the pack is spread over the game:
//   clicks, click combos ... direct interface handling: buttons, tabs, sliders, the helm's throttle, equip, trade, craft
//   air .................... sheets sliding in and out, full-screen mode changes
//   Tone1 .................. the interface speaking: windows, toggles, notices, cautions, locks (A highest .. D lowest)
//   Tone2 .................. the captain's progress: loot, credits, quests, ranks, crew, guild and arena standing
//   Tone3 (stereo, longer) . the world reaching the bridge: contacts, comms, the drive, planets, shields, alarms
//   rings .................. target lock, scanner pings, incoming messages, objectives, move orders
//   glitches ............... refusals, comm static, hull systems taking hard hits, ion disruption, the warp tear
//   impacts ................ the big beats: PvP title and verdict, story acts, hull lost, boss arrival, rank
export const SFX_DIR = 'assets/audio/ui/';

const L4 = ['a', 'b', 'c', 'd'], L5 = ['a', 'b', 'c', 'd', 'e'];
// a tone family: every register (A high .. D/E low) of one interval
const tone = (set, iv) => (set === 3 ? L5 : L4).map((l) => `tone${set}/${l}${iv ? '-' + iv : ''}`);
const n2 = (n) => String(n).padStart(2, '0');
const glitch = (...ns) => ns.map((n) => `glitch/glitch-${n2(n)}`);

export const CUES = {
  // ---------------- interface: clicks and combos ----------------
  click:       { f: ['click/click', 'click/click-1', 'click/click-2', 'click/click-mid'], v: 0.32, pick: 'any', gap: 0.03, lim: 2, pre: true },
  hover:       { f: ['click/high-click-1', 'click/high-click-2'], v: 0.1, pick: 'any', gap: 0.06, lim: 1, pre: true },
  tab:         { f: ['click/click-3', 'click/click-mid-high'], v: 0.32, pick: 'any', gap: 0.04, lim: 2, pre: true },
  slider:      { f: ['click/click-low'], v: 0.22, gap: 0.07, lim: 1, pre: true },
  drag:        { f: ['click/click-stutter', 'click/click-stutter-high'], v: 0.2, pick: 'any', gap: 0.3, lim: 1 },
  throttleUp:  { f: ['click/click-up'], v: 0.3, gap: 0.05, lim: 2, pre: true },
  throttleDown:{ f: ['click/click-down'], v: 0.3, gap: 0.05, lim: 2, pre: true },
  allStop:     { f: ['click/click-down-hp'], v: 0.34, gap: 0.1, lim: 1 },
  autoFire:    { f: ['click/click-scoop'], v: 0.34, gap: 0.1, lim: 1 },
  select:      { f: ['click/ting-up'], v: 0.26, gap: 0.05, lim: 2 },
  unselect:    { f: ['click/ting-down'], v: 0.24, gap: 0.05, lim: 2 },
  equip:       { f: ['combo/combo-3', 'combo/combo-3-high'], v: 0.34, pick: 'any', gap: 0.12, lim: 2 },
  unequip:     { f: ['combo/combo-2-low', 'combo/combo-5-down'], v: 0.32, pick: 'any', gap: 0.12, lim: 2 },
  trade:       { f: ['combo/combo-4', 'combo/combo-4-high'], v: 0.34, pick: 'any', gap: 0.12, lim: 2 },
  craft:       { f: ['combo/combo-5', 'combo/combo-5-up'], v: 0.36, pick: 'any', gap: 0.15, lim: 2 },
  plot:        { f: ['combo/combo-1', 'combo/combo-1-up'], v: 0.34, pick: 'any', gap: 0.2, lim: 1 },
  dock:        { f: ['combo/combo-2'], v: 0.4, gap: 0.5, lim: 1 },
  undock:      { f: ['combo/combo-2-high'], v: 0.4, gap: 0.5, lim: 1 },

  // ---------------- interface: air ----------------
  sheetOpen:   { f: ['air/air-up'], v: 0.28, gap: 0.15, lim: 1 },
  sheetClose:  { f: ['air/air-down'], v: 0.26, gap: 0.15, lim: 1 },
  modeAir:     { f: ['air/air'], v: 0.4, gap: 0.3, lim: 1 },

  // ---------------- Tone1: the interface ----------------
  itemHover:   { f: tone(1), v: 0.1, pick: 'tier', gap: 0.07, lim: 1, pre: true },            // register by rarity
  notice:      { f: tone(1, 'double'), v: 0.22, pick: 'cycle', gap: 0.25, lim: 1, pre: true },  // info toast
  winOpen:     { f: tone(1, 'fourth-up'), v: 0.22, pick: 'key', gap: 0.05, lim: 2, pre: true },
  winClose:    { f: tone(1, 'fourth-down'), v: 0.2, pick: 'key', gap: 0.05, lim: 2, pre: true },
  modeIn:      { f: tone(1, 'fourth-octave-up'), v: 0.26, pick: 'key', gap: 0.3, lim: 1, with: 'modeAir' },
  modeOut:     { f: tone(1, 'fourth-octave-down'), v: 0.24, pick: 'key', gap: 0.3, lim: 1, with: 'modeAir' },
  accept:      { f: tone(1, 'fifth-up'), v: 0.26, pick: 'cycle', gap: 0.1, lim: 2 },          // a choice made (dialogue, briefing)
  decline:     { f: tone(1, 'fifth-down'), v: 0.24, pick: 'cycle', gap: 0.1, lim: 2 },
  autoOn:      { f: tone(1, 'fifth-octave-up'), v: 0.3, pick: 'key', gap: 0.2, lim: 1 },      // register by autoplay ambition
  autoOff:     { f: tone(1, 'fifth-octave-down'), v: 0.28, pick: 'key', gap: 0.2, lim: 1 },
  toggleOn:    { f: tone(1, 'major-third-up'), v: 0.22, pick: 'key', gap: 0.05, lim: 2 },
  toggleOff:   { f: tone(1, 'major-third-down'), v: 0.2, pick: 'key', gap: 0.05, lim: 2 },
  talent:      { f: tone(1, 'major-triad-up'), v: 0.28, pick: 'tier', gap: 0.1, lim: 2 },     // register by the rank taken
  respec:      { f: tone(1, 'major-triad-down'), v: 0.28, pick: 'cycle', gap: 0.3, lim: 1 },
  prompt:      { f: tone(1, 'minor-third-up'), v: 0.18, pick: 'key', gap: 1, lim: 1 },        // dock / scan prompt comes up
  caution:     { f: tone(1, 'minor-third-down'), v: 0.24, pick: 'cycle', gap: 0.35, lim: 1, pre: true },  // warn toast
  codex:       { f: tone(1, 'minor-triad-up'), v: 0.26, pick: 'tier', gap: 0.5, lim: 1 },     // register by hull size
  salvage:     { f: tone(1, 'minor-triad-down'), v: 0.24, pick: 'cycle', gap: 0.15, lim: 1 },
  custom:      { f: tone(1, 'octave-up'), v: 0.26, pick: 'cycle', gap: 0.2, lim: 1 },          // paint, names
  layout:      { f: tone(1, 'octave-down'), v: 0.24, pick: 'cycle', gap: 0.2, lim: 1 },        // window layout reset
  locked:      { f: tone(1, 'tritone-up'), v: 0.24, pick: 'cycle', gap: 0.3, lim: 1 },         // rank or gate locked
  full:        { f: tone(1, 'tritone-down'), v: 0.26, pick: 'cycle', gap: 1, lim: 1 },         // a hold or bay is full
  cooldown:    { f: tone(1, 'tritone-octave-up'), v: 0.16, pick: 'cycle', gap: 0.35, lim: 1, pre: true },
  refuse:      { f: tone(1, 'tritone-octave-down'), v: 0.24, pick: 'cycle', gap: 0.4, lim: 1, with: 'denied', pre: true },  // bad toast

  // ---------------- Tone2: progress and reward ----------------
  pickup:      { f: tone(2), v: 0.22, pick: 'tier', gap: 0.08, lim: 2, pre: true },            // register by rarity
  credits:     { f: tone(2, 'double'), v: 0.16, pick: 'cycle', gap: 0.3, lim: 1, pre: true },
  questAccept: { f: tone(2, 'fourth-up'), v: 0.28, pick: 'cycle', gap: 0.15, lim: 1 },
  questDrop:   { f: tone(2, 'fourth-down'), v: 0.26, pick: 'cycle', gap: 0.15, lim: 1 },
  questDone:   { f: tone(2, 'fourth-octave-up'), v: 0.34, pick: 'cycle', gap: 0.4, lim: 1 },
  storyStep:   { f: tone(2, 'fourth-octave-down'), v: 0.34, pick: 'cycle', gap: 0.4, lim: 1 },              // a story step closes (a cadence)
  questStep:   { f: tone(2, 'fifth-up'), v: 0.18, pick: 'cycle', gap: 0.6, lim: 1 },
  repair:      { f: tone(2, 'fifth-down'), v: 0.26, pick: 'cycle', gap: 0.3, lim: 1 },
  shipLevel:   { f: tone(2, 'fifth-octave-up'), v: 0.32, pick: 'cycle', gap: 0.5, lim: 1 },
  mastery:     { f: tone(2, 'fifth-octave-down'), v: 0.22, pick: 'cycle', gap: 0.5, lim: 1 },
  epic:        { f: tone(2, 'major-third-up'), v: 0.28, pick: 'cycle', gap: 0.3, lim: 1, pre: true },  // epic toast
  blueprint:   { f: tone(2, 'major-third-down'), v: 0.3, pick: 'cycle', gap: 0.5, lim: 1 },
  legend:      { f: tone(2, 'major-triad-up'), v: 0.32, pick: 'tier', gap: 0.4, lim: 1, pre: true },   // legend toast, legendary+ loot
  bounty:      { f: tone(2, 'major-triad-down'), v: 0.3, pick: 'cycle', gap: 0.5, lim: 1 },            // a bounty or payout lands
  hire:        { f: tone(2, 'minor-third-up'), v: 0.28, pick: 'cycle', gap: 0.3, lim: 1 },
  crewLeave:   { f: tone(2, 'minor-third-down'), v: 0.26, pick: 'cycle', gap: 0.3, lim: 1 },
  relic:       { f: tone(2, 'minor-triad-up'), v: 0.3, pick: 'cycle', gap: 0.5, lim: 1 },              // a curio recovered
  scrap:       { f: tone(2, 'minor-triad-down'), v: 0.28, pick: 'cycle', gap: 0.5, lim: 1 },           // a hull scrapped or sold
  rankUp:      { f: tone(2, 'octave-up'), v: 0.36, pick: 'tier', gap: 0.5, lim: 1 },                   // register by rank band
  respawn:     { f: tone(2, 'octave-down'), v: 0.3, pick: 'cycle', gap: 1, lim: 1 },
  matchFound:  { f: tone(2, 'tritone-up'), v: 0.3, pick: 'cycle', gap: 1, lim: 1 },                   // an arena match begins
  defeat:      { f: tone(2, 'tritone-down'), v: 0.32, pick: 'cycle', gap: 1, lim: 1 },
  zoneContest: { f: tone(2, 'tritone-octave-up'), v: 0.3, pick: 'cycle', gap: 2, lim: 1 },             // a contested field opens
  zoneLost:    { f: tone(2, 'tritone-octave-down'), v: 0.3, pick: 'cycle', gap: 2, lim: 1 },

  // ---------------- Tone3: the world ----------------
  contact:     { f: tone(3), v: 0.2, pick: 'tier', gap: 1.6, lim: 1 },                          // register by hull size
  comm:        { f: tone(3, 'double'), v: 0.22, pick: 'cycle', gap: 1, lim: 1, with: 'static' },
  warpAlign:   { f: tone(3, 'fifth-up'), v: 0.3, pick: 'cycle', gap: 1, lim: 1 },
  warpAbort:   { f: tone(3, 'fifth-down'), v: 0.32, pick: 'cycle', gap: 1, lim: 1 },
  jumpArrive:  { f: tone(3, 'fifth-octave-up'), v: 0.34, pick: 'cycle', gap: 1, lim: 1 },
  warpArrive:  { f: tone(3, 'fifth-octave-down'), v: 0.3, pick: 'cycle', gap: 1, lim: 1 },
  land:        { f: tone(3, 'fourth-up'), v: 0.32, pick: 'cycle', gap: 1, lim: 1 },
  launch:      { f: tone(3, 'fourth-down'), v: 0.32, pick: 'cycle', gap: 1, lim: 1 },
  probeDrop:   { f: tone(3, 'fourth-octave-up'), v: 0.28, pick: 'cycle', gap: 0.5, lim: 1 },
  probeRecover:{ f: tone(3, 'fourth-octave-down'), v: 0.28, pick: 'cycle', gap: 0.5, lim: 1 },
  scan:        { f: tone(3, 'major-third-up'), v: 0.26, pick: 'cycle', gap: 0.5, lim: 1 },
  scanDone:    { f: tone(3, 'major-third-down'), v: 0.28, pick: 'cycle', gap: 0.5, lim: 1 },
  discover:    { f: tone(3, 'major-triad-up'), v: 0.32, pick: 'cycle', gap: 0.8, lim: 1 },
  report:      { f: tone(3, 'major-triad-down'), v: 0.32, pick: 'cycle', gap: 1, lim: 1 },
  weather:     { f: tone(3, 'minor-third-up'), v: 0.28, pick: 'cycle', gap: 3, lim: 1 },
  clear:       { f: tone(3, 'minor-third-down'), v: 0.24, pick: 'cycle', gap: 3, lim: 1 },
  depths:      { f: tone(3, 'minor-triad-up'), v: 0.3, pick: 'cycle', gap: 1, lim: 1 },               // into a dungeon or derelict
  lastWords:   { f: tone(3, 'minor-triad-down'), v: 0.22, pick: 'cycle', gap: 2, lim: 1, with: 'static' },
  shieldUp:    { f: tone(3, 'octave-up'), v: 0.22, pick: 'cycle', gap: 3, lim: 1 },
  shieldDown:  { f: tone(3, 'octave-down'), v: 0.28, pick: 'cycle', gap: 3, lim: 1 },
  hullLow:     { f: tone(3, 'tritone-up'), v: 0.3, pick: 'cycle', gap: 6, lim: 1 },
  hullCrit:    { f: tone(3, 'tritone-down'), v: 0.34, pick: 'cycle', gap: 4, lim: 1 },
  bossWarn:    { f: tone(3, 'tritone-octave-up'), v: 0.36, pick: 'cycle', gap: 4, lim: 1, with: 'boss' },
  strike:      { f: tone(3, 'tritone-octave-down'), v: 0.24, pick: 'cycle', gap: 1.2, lim: 1 },       // telegraphed ground strike

  // ---------------- rings ----------------
  lock:        { f: ['ring/reverse-2-high'], v: 0.22, gap: 0.12, lim: 1, pre: true },
  ping:        { f: ['ring/reverse-2', 'ring/reverse-2-mid', 'ring/reverse-2-low', 'ring/reverse-2-very-low'], v: 0.24, pick: 'tier', gap: 0.15, lim: 2 },
  message:     { f: ['ring/reverse-1-high', 'ring/reverse-1', 'ring/reverse-1-low', 'ring/reverse-1-very-low'], v: 0.18, pick: 'key', gap: 1.2, lim: 1 },
  objective:   { f: ['ring/ring-up', 'ring/ring-up-soft'], v: 0.26, pick: 'cycle', gap: 0.4, lim: 1 },
  waypoint:    { f: ['ring/ring-down'], v: 0.16, gap: 0.15, lim: 1, pre: true },

  // ---------------- glitches ----------------
  denied:      { f: glitch(7, 10, 13, 16, 19), v: 0.2, pick: 'any', gap: 0.3, lim: 1, pre: true },
  static:      { f: glitch(0, 9, 11, 12, 18, 20, 23, 30), v: 0.12, pick: 'any', gap: 0.8, lim: 1 },
  systems:     { f: glitch(3, 4, 5, 15, 28, 29), v: 0.22, pick: 'any', gap: 1.2, lim: 1 },            // a hard hit to the hull
  disrupt:     { f: glitch(1, 6, 8, 17, 21, 22, 24, 25, 26, 27), v: 0.24, pick: 'any', gap: 1.5, lim: 1 },  // ion disruption
  tear:        { f: glitch(2, 14), v: 0.22, pick: 'any', gap: 1, lim: 1 },                         // the warp transit

  // ---------------- impacts ----------------
  pvpTitle:    { f: ['impact/impact-2-top'], v: 0.5, gap: 2, lim: 1 },
  pvpStamp:    { f: ['impact/impact-2-reso'], v: 0.55, gap: 2, lim: 1 },
  act:         { f: ['impact/impact-1'], v: 0.5, gap: 2, lim: 1 },                                  // story act / ending card
  death:       { f: ['impact/impact-1-low'], v: 0.55, gap: 2, lim: 1 },
  boss:        { f: ['impact/impact-2-mid'], v: 0.42, gap: 4, lim: 1 },
  rank:        { f: ['impact/impact-2'], v: 0.36, gap: 1, lim: 1, with: 'rankUp' },
};

// a stable index for a key (a window id, a mode name): the same thing keeps the same pitch
export function keyIndex(key, n) {
  let h = 2166136261;
  const s = String(key);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % n;
}

// which file a cue plays: state = { last, i } per cue (kept by the caller), o = { tier, key }
export function pickFile(cue, state, o, rand = Math.random) {
  const f = cue.f, n = f.length;
  if (n === 1) return f[0];
  let i;
  switch (cue.pick) {
    case 'tier': i = Math.max(0, Math.min(n - 1, Math.round(+(o && o.tier) || 0))); break;
    case 'key': i = keyIndex(o && o.key != null ? o.key : '', n); break;
    case 'cycle': i = state.i = ((state.i ?? -1) + 1) % n; break;
    default: i = Math.floor(rand() * n); if (i === state.last) i = (i + 1 + Math.floor(rand() * (n - 1))) % n;
  }
  state.last = i;
  return f[i];
}

export const sfxUrl = (file) => SFX_DIR + file + '.mp3';
