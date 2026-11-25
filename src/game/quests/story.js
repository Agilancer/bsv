// The campaign: "Forty Credits". Pure data + logic (no three.js, no DOM): importable in node, and
// walked end to end by tests/story.test.mjs.
//
// A story step becomes an ordinary quest object (see data.js) that the tracker advances from real
// play; the runtime (storyRun.js) owns the briefings, choices and set pieces. One step is live at a
// time, on top of the normal quest cap.
//
//   step: { id, act, lvl, title, giver, brief: [line], ev, cond?, n, obj, done: [line], journal,
//           at?: { sys, st? }      dock / visit target (names; resolved against the galaxy)
//           go?: sysName           where the work is (a travel hint; no condition)
//           in?: sysName           the kills / set piece happen in this system
//           setpiece?: { type: 'boss' | 'waves' | 'pursuit', ... }
//           effort, item?, res?    reward scale (data.js questReward) and extras
//           choice?: { key, who, prompt, auto, options: [{ k, label, hint, say: [line], standing?, bonus?, requires? }] }
//           next: id | { by: choiceKey, map: { option: id } } | null
//           variants?: { choiceKey: { option: { ...overrides } } } }
//   line: [castKey, text] or [castKey, text, { choiceKey: option }] (only shown on that branch).
//   Text may use {captain} and {ship}.
//   Step ids are save data (data.story.cur / wait / done): rename one only with a migration in storyRun.js.
import { galaxy, systemDetail } from '../galaxy.js';
import { questReward } from './data.js';

export const STORY_TITLE = 'Forty Credits';

// ---------------------------------------------------------------- who is talking
// post: the bridge officer who holds this voice (crew/data.js OFFICER_POSTS) — their real name is
// used when the post is filled. hex: portrait / comm colour.
export const CAST = {
  dregg: { name: 'Purser Dregg', role: 'Quartermaster, Citadel Velscour', hex: '#5affb0' },
  xo: { name: 'First Officer', role: 'Your XO', hex: '#ff8a9a', post: 'xo' },
  eng: { name: 'Chief Engineer', role: 'Engineering', hex: '#ffb040', post: 'eng' },
  sci: { name: 'Science Officer', role: 'Sensors', hex: '#b48cff', post: 'science' },
  ops: { name: 'Ops', role: 'Helm and long-range', hex: '#58c8ff', post: 'helm' },
  thorne: { name: 'Captain Thorne', role: 'Master of the Fiduciary Duty, Meridian Arms', hex: '#ffd66a' },
  hask: { name: 'Provost Hask', role: 'Citadel Rhoadon', hex: '#ff6a5a' },
  pemberton: { name: 'Dr. Pemberton', role: 'Anomalies Programme, Institute Rhoadon', hex: '#7ad8ff' },
  wren: { name: 'Sister Wren', role: 'Formerly a Cantor of the Hollow Star', hex: '#e07aff' },
  tam: { name: 'Quiet Tam', role: 'Shrine keeper', hex: '#c0a0ff' },
  halloran: { name: 'Mother Halloran', role: 'Proprietor, the Backdoor', hex: '#ff9a50' },
  vane: { name: 'Captain Vane', role: 'The previous owner', hex: '#9fd8ff' },
  auditor: { name: 'The Auditor', role: 'Automated ledger', hex: '#d0d6e0' },
  custodian: { name: 'The Custodian', role: 'Precursor automaton', hex: '#d8b070' },
  choir: { name: 'The Silent Choir', role: '', hex: '#8090a8' },
};

export const ACTS = [
  null,
  { n: 1, title: 'Forty Credits', sub: 'What Hesper Vane left behind' },
  { n: 2, title: 'Salvage, Inert', sub: 'Twenty-two credits each' },
  { n: 3, title: 'Roll Call', sub: 'Four thousand years without an answer' },
  { n: 4, title: 'Chain of Custody', sub: 'The long way round' },
  { n: 5, title: 'The Rest', sub: 'An orchestra tunes' },
  { n: 6, title: 'Downbeat', sub: 'The bearer keeps the time' },
];

// what the captain's choices move, and how the Story tab words it
export const STANDINGS = {
  dominion: { name: 'Velscour Dominion', words: ['wanted for questioning', 'tolerated', 'in good standing', 'decorated'] },
  company: { name: 'Rival Companies', words: ['an open incident', 'a line item', 'a valued counterparty', 'a preferred vendor'] },
  covenant: { name: 'Hollow Star Covenant', words: ['sung against', 'unsung', 'remembered kindly', 'held a place for'] },
  garden: { name: 'The Gardener', words: ['a threat to its worlds', 'watched', 'trusted', 'under its protection'] },
};
export const standingWord = (key, v = 0) => { const w = STANDINGS[key].words; return w[Math.max(0, Math.min(w.length - 1, 1 + Math.sign(v) * Math.min(2, Math.abs(v))))]; };

// the first thing a new captain hears, docked at the home station (onboarding.js shows it)
export const ARRIVAL = [
  ['dregg', 'Captain {captain}. Purser Dregg, quartermaster, Citadel Velscour. I need your mark on the transfer of title, here and here. My condolences. Captain Vane was owed a great deal of respect on this station, and owed it a great deal of money.'],
  ['dregg', 'Captain Hesper Vane left you one battleship, the {ship}, in a will filed three days before she sailed for the galactic core and stopped answering. Her stated reason, in full: "To the only officer who ever paid me back the forty credits."'],
  ['xo', 'First Officer, Captain. The crew has read the will, and they have questions I cannot answer. The ship is sound and her guns are maintained. There is a hum in the keel. Engineering calls it normal. It was not there before her last refit.'],
  ['dregg', 'Your berth account is on the station board. It is not in good order. Look it over before you undock, Captain, and then we should talk about what she owed.'],
];

// ---------------------------------------------------------------- the steps
export const STEPS = [
  // ============================================================ ACT I — Forty Credits
  { id: 'a1_fees', act: 1, lvl: 1, title: 'Working it off', giver: 'dregg', ev: 'kill', cond: { faction: 'pirate' }, n: 6, effort: 2.7,
    obj: 'Destroy 6 pirate ships',
    brief: [
      ['dregg', 'The {ship} came with nine years of unpaid berth fees. I have applied the transfer bonus against them. What remains would buy a frigate, and the Citadel will not wait another nine years.'],
      ['dregg', 'The Reach pays a standing bounty on pirate hulls. Six would cover this quarter\'s interest and keep the Citadel off your berth. Start there, Captain. The principal can wait. The interest cannot.'],
    ],
    done: [
      ['dregg', 'Six confirmed. The bounty is credited and the interest is covered. The fees are deferred, Captain, not forgiven. Do not let anyone on this station tell you otherwise.'],
      ['xo', 'For the log, Captain: Captain Vane\'s cabin is still sealed on her own code. Nobody has been inside since she left. Whatever she locked in there, she meant to keep from the crew.'],
    ],
    journal: 'Inherited a battleship and nine years of berth fees from Captain Hesper Vane. Six pirate bounties covered this quarter\'s interest.',
    next: 'a1_hum' },
  { id: 'a1_hum', act: 1, lvl: 1, title: 'B-flat', giver: 'eng', ev: 'bridge', n: 1, effort: 1,
    obj: 'Visit your bridge (B, or Menu → Bridge)',
    brief: [
      ['eng', 'Captain, about the hum. I logged it as normal. I am revising that. It comes from the keel, it holds a steady B-flat to within a hundredth of a hertz, and it grows louder whenever our bow swings toward the galactic core.'],
      ['xo', 'The senior officers have asked for a meeting on the bridge, Captain. I agree with them. We should know what we are carrying.'],
    ],
    done: [
      ['sci', 'I ran the keel through every scanner we own. None of them returned a reading. Each returned the same word, in our own display font: "LATER". I have no explanation for that.'],
      ['eng', 'There is a ballast block down there that is not on any plan. Captain Vane had it fitted at a private yard the week before she left. The invoice lists it as "personal effects". It masses forty tonnes.'],
    ],
    journal: 'The keel hums in B-flat and there is something in the ballast that is not on the plans. The scanners say "LATER".',
    next: 'a1_crate' },
  { id: 'a1_crate', act: 1, lvl: 2, title: 'A sealed crate', giver: 'dregg', ev: 'dock', at: { sys: 'Velscour', st: 'Velscour Waypoint' }, n: 1, effort: 2,
    obj: 'Deliver the crate: dock at Velscour Waypoint',
    brief: [
      ['dregg', 'A favour, Captain, and it stays between us. One sealed crate for the Velscour Waypoint. The manifest reads "salvage, inert". It pays well, because I would rather it did not travel with the Citadel\'s own haulers.'],
      ['dregg', 'Do not open it and do not scan it. If it hums, ignore it. The Signaller at the Waypoint will sign for it.'],
    ],
    done: [
      ['ops', 'Crate is delivered. Captain, it hummed the whole way, on the same note as our keel. When I put the two on one trace they drifted into harmony and held it. I stopped recording.'],
      ['ops', 'And the Signaller never signed. The bay sealed itself, the crate was drawn through the wall, and an unregistered terminal issued a receipt: "RECEIVED: 1. THANK YOU, PRECURSOR." Nobody at the Waypoint will say who owns it.'],
    ],
    journal: 'Ran a sealed crate of "salvage, inert" to the Waypoint for Purser Dregg. It hummed in our keel\'s key. An unregistered terminal signed for it.',
    next: 'a1_saltwound' },
  { id: 'a1_saltwound', act: 1, lvl: 3, title: 'The Salt Wound', giver: 'xo', ev: 'kill', in: 'Velscour', n: 1, effort: 6, item: 'rare',
    // (the first named ship a rank-3 captain meets: one escort and no champion's hull — it was sinking one new captain in four)
    setpiece: { type: 'boss', design: 'Buccaneer', name: 'Rustjaw Kell, the Salt Wound', escorts: ['Gutterknife'] },
    obj: 'Destroy Rustjaw Kell\'s Salt Wound in Velscour',
    brief: [
      ['xo', 'Captain Vane\'s last convoy was jumped on its way out of Velscour. One pirate walked away with her strongbox: Rustjaw Kell, of the Salt Wound. He has been bragging about it in every bar that still serves him.'],
      ['xo', 'He is back in the system. I suggest we recover the strongbox, Captain. He will not hand it over, so I suggest we ask with the port battery.'],
    ],
    done: [
      ['xo', 'The strongbox held no gold. It held a ledger. Purser Dregg\'s handwriting, Purser Dregg\'s stamp, and not the ledger Purser Dregg shows the Dominion.'],
      ['sci', 'She has been buying data cores from every survey crew in the Reach and shipping them coreward as "salvage, inert". Four hundred crates. The buyer is listed only as "The Auditor".'],
      ['xo', 'The last page is Captain Vane\'s will. Witnessed by O. Dregg. Dated the day after the Captain left. Either Dregg witnessed a will nobody had signed, or Vane sent it back to her. I do not like either answer.'],
    ],
    journal: 'Took Captain Vane\'s strongbox off Rustjaw Kell. Inside: Dregg\'s second ledger. Four hundred crates of data cores, sold to someone called The Auditor.',
    choice: { key: 'ledger', who: 'xo', auto: 'report',
      prompt: 'The ledger, Captain. The Provost at Citadel Rhoadon would open an inquiry on the strength of it. Or we keep it, and Purser Dregg has every reason to be helpful.',
      options: [
        { k: 'report', label: 'Take it to the Provost', hint: 'By the book. The Dominion will remember; so will Dregg.', standing: { dominion: 2 },
          say: [['xo', 'By the book. I will have it sealed and logged as evidence.']] },
        { k: 'keep', label: 'Keep it. Dregg owes us now', hint: 'Leverage over the Purser. The Dominion stays in the dark.', standing: { dominion: -1 },
          say: [['xo', 'Leverage, then. It goes in the ship\'s safe, and my objection goes in the log.']] },
      ] },
    next: { by: 'ledger', map: { report: 'a1_provost', keep: 'a1_fence' } } },
  { id: 'a1_provost', act: 1, lvl: 3, title: 'By the book', giver: 'hask', ev: 'dock', at: { sys: 'Rhoadon', st: 'Citadel Rhoadon' }, n: 1, effort: 4,
    obj: 'Take the ledger to Citadel Rhoadon (Rhoadon)',
    brief: [
      ['hask', 'Provost Hask, Citadel Rhoadon. Your XO says you are holding something of the Purser\'s. Bring it here. Do not post it. The post goes through the Purser.'],
    ],
    done: [
      ['hask', 'Four hundred crates of "salvage, inert". I have countersigned those manifests for six years without reading them. That is my failure, and I will answer for it. The inquiry opens today.'],
      ['hask', 'Dregg keeps her desk until it reports; she is the only one who understands her own filing, and I want her where I can see her. Keep a copy of the ledger aboard, Captain. Evidence has a way of going missing here.'],
    ],
    journal: 'Handed the ledger to Provost Hask at Rhoadon. There is now an inquiry. Dregg keeps her desk, under watch.',
    next: 'a1_thorne' },
  { id: 'a1_fence', act: 1, lvl: 3, title: 'Off the books', giver: 'xo', ev: 'dock', at: { sys: 'Galrin', st: 'Galrin Den' }, n: 1, effort: 3,
    obj: 'Have the cipher broken: dock at Galrin Den (Galrin)',
    brief: [
      ['xo', 'The back half of the ledger is in cipher. There is a bookkeeper at Galrin Den who reads other people\'s ciphers for a living. She is discreet. She has to be; she is wanted.'],
    ],
    done: [
      ['xo', 'The bookkeeper broke it in an hour. Every crate went to a drop called The Auditor\'s Den, at Cyrthos. And Captain, the Purser has sent a message.'],
      ['dregg', 'Captain. I am told you have been reading my private accounts. Then we are partners of a kind, and partners look after one another. Whatever the bookkeeper charged, I will cover it. Consider it a first instalment.'],
    ],
    journal: 'Had the ledger\'s cipher broken at Galrin Den. The crates go to The Auditor\'s Den at Cyrthos. Dregg knows we know, and has become helpful.',
    next: 'a1_thorne' },
  { id: 'a1_thorne', act: 1, lvl: 4, title: 'Cease and desist', giver: 'thorne', ev: 'kill', n: 9, effort: 4.5,
    setpiece: { type: 'waves', designs: ['Cutthroat', 'Gutterknife', 'Spitfire'], per: 3 },
    obj: 'Hold out: destroy 9 of Thorne\'s hired pirates',
    brief: [
      ['thorne', 'Captain {captain}. Cassius Thorne, master of the Fiduciary Duty, for Meridian Arms. This is a courtesy call. My employers extend very few of them, so I would listen.'],
      ['thorne', 'Your vessel carries an asset on which Meridian holds a prior claim. Local contractors will be enforcing that claim shortly. They are not Company ships, so nothing that happens to them, or to you, will appear on our books.'],
    ],
    done: [
      ['thorne', 'Well flown. That was a measurement, Captain, not an attempt; now I know what your ship can do. None of this is personal. We will speak again once my employers have read my report.'],
      ['xo', 'He knew about the keel, Captain. We only found it ourselves this week. Someone has been reporting on this ship.'],
    ],
    journal: 'A Company captain, Cassius Thorne, sent hired pirates after "an asset" in our keel. They did not collect.',
    next: 'a1_sites' },
  { id: 'a1_sites', act: 1, lvl: 4, title: 'Retrieval sites', giver: 'sci', ev: 'scan', n: 2, effort: 4, res: { datacore: 2 },
    obj: 'Land on any world and scan 2 curiosities (N: system map → scan a planet → land)',
    brief: [
      ['sci', 'The ledger lists "retrieval sites". They are coordinates. Planetary ones. Every landable world within three jumps has at least one, and Captain Vane visited them all.'],
      ['sci', 'I would like to put the explorer down and see what the survey crews were picking up. Open the system map, choose a world, scan it, land. Drive up to the violet beacons and I will log what we find.'],
    ],
    done: [
      ['sci', 'Two anomalies logged. And something else: a squat survey automaton standing a few metres from the first one. Pitted, weathered, powered down, of no make in any registry. It was not on the orbital pass.'],
      ['sci', 'I want a closer look next time. I logged it as a curiosity, but I have never seen a curiosity stand facing a lander.'],
      ['xo', 'Science has asked me to add one thing to the log. When we landed, the automaton faced the anomaly. When we lifted off, it faced the lander. Nobody saw it move.'],
    ],
    journal: 'Put the explorer down at one of Vane\'s "retrieval sites". Found the curiosities the survey crews were stripping, and a weathered automaton that turned to watch us leave.',
    next: 'a2_institute' },

  // ============================================================ ACT II — Salvage, Inert
  { id: 'a2_institute', act: 2, lvl: 5, title: 'Unexplained objects', giver: 'sci', ev: 'dock', at: { sys: 'Rhoadon', st: 'Institute Rhoadon' }, n: 1, effort: 3.5,
    obj: 'Dock at Institute Rhoadon (Rhoadon)',
    brief: [
      ['sci', 'The Institute at Rhoadon runs an anomalies programme, and Dr. Pemberton leads it. She has been cataloguing sightings of that automaton for eleven years, and has been refused funding for most of them. She will want to hear from us.'],
    ],
    done: [
      ['pemberton', 'You have seen it at close range? Good. I have it on eleven worlds, Captain. The same scoring on the casing, the same dent in the sensor housing, the same serial. Not eleven units of one model. I have checked every way I know. It is one machine.'],
      ['pemberton', 'Bring me a full scan, close range. And Captain, approach it with care. I cannot justify that from the data. Eleven years of watching it tells me to say it anyway.'],
    ],
    journal: 'Met Dr. Pemberton, who leads the Institute\'s anomalies programme. She says the automaton seen on eleven worlds is one machine.',
    next: 'a2_gnome' },
  { id: 'a2_gnome', act: 2, lvl: 6, title: 'One machine', giver: 'pemberton', ev: 'scan', cond: { kind: 'custodian' }, n: 1, effort: 5, res: { datacore: 3 },
    obj: 'Scan a Custodian Automaton on any surface (about half of all landing sites have one)',
    brief: [
      ['pemberton', 'I catalogue it as the Custodian Automaton, for want of a better name. It stands at about half of all landing sites. If it is not at yours, it is at another; that is the pattern. Land, follow the violet beacons, and scan it.'],
    ],
    done: [
      ['sci', 'Scan complete. The casing is four thousand one hundred and twelve years old. To the day. The same age as every antique survey probe we have ever found. The same age as the first probe.'],
      ['pemberton', 'And on its chassis, Captain, under the scoring: a stencilled warning plate in Precursor script. Three words survive. "SEEDED GROUND. DO NOT". The rest is worn away. I would give a great deal to know what we are not to do.'],
    ],
    journal: 'Scanned the Custodian. It is 4,112 years old, like the first survey probes. Its warning plate reads "SEEDED GROUND. DO NOT", and no more.',
    next: 'a2_cores' },
  { id: 'a2_cores', act: 2, lvl: 7, title: 'Twenty-two credits each', giver: 'dregg', ev: 'bank', cond: { res: 'datacore' }, n: 8, effort: 4.5,
    obj: 'Bank 8 Ancient Data Cores (scan curiosities and open caches on a surface, then bank at the lander)',
    brief: [
      ['dregg', 'Since we are partners: I am short this quarter. The Auditor wants eight more cores by the end of the month, and it does not accept late delivery. Bank them from any surface. I will pay double the board rate, and the board need not know.', { ledger: 'keep' }],
      ['dregg', 'Captain. The Provost has me on supervised duties, and every message I send is read, so I will say this plainly. The Auditor still expects eight cores this month, and I fear it more than I fear the Provost. Bank them from any surface. Please.', { ledger: 'report' }],
    ],
    done: [
      ['sci', 'Captain, before these go anywhere. I put one under the lattice microscope. It is not a data store in any sense we use. It holds one pattern, entire and self-consistent. A single mind. Every core is the same.'],
      ['sci', 'Each core is a person. Filed. Compressed, indexed and asleep. The Precursors did not vanish. They put themselves away, and we have been selling them at twenty-two credits each.'],
      ['eng', 'Captain. The thing in our keel is the size of four hundred of those.'],
    ],
    journal: 'The data cores are people. The Precursors did not vanish: they filed themselves. The block in our keel is a very large one.',
    next: 'a2_scrappers' },
  { id: 'a2_scrappers', act: 2, lvl: 8, title: 'The loudest thing in the Reach', giver: 'eng', ev: 'kill', n: 8, effort: 4.5,
    setpiece: { type: 'waves', designs: ['Junkfly', 'Rivet', 'Nailgun'], per: 4 },
    obj: 'Hold out: destroy 8 Rustborn scrappers hunting the keel',
    brief: [
      ['eng', 'Rustborn, Captain, a whole scrap-flotilla of them, and they are not here for our plating. They have a dowsing rig welded to the lead hull and it is pointing straight at my keel.'],
      ['eng', 'Nobody cuts into my keel. Not while I am Chief. Hold them off, Captain.'],
    ],
    done: [
      ['eng', 'That is the last of them. I pulled their dowsing rig out of the wreckage. It is a chip of monolith on a wire. It does not point north. It points at whoever is carrying the loudest core.'],
      ['xo', 'So we are the loudest thing in the Reach, and every scrapper with a chip of monolith can find us. I am doubling the watch.'],
    ],
    journal: 'Rustborn scrappers came for the keel with a monolith chip on a wire. We are, it turns out, the loudest thing in the Reach.',
    next: 'a2_hands' },
  { id: 'a2_hands', act: 2, lvl: 8, title: 'More hands', giver: 'xo', ev: 'crew', n: 1, effort: 1.5,
    obj: 'Sign on a crew member (K: Crew → Recruits, at any station)',
    brief: [
      ['xo', 'Captain, we are running a battleship on a skeleton watch, and the watch is exhausted. Put in at any station and sign on a hand: station board, Services, Crew quarters. Or press K and look over the recruits.'],
      ['xo', 'We tell them about the keel before they sign. I will not have anyone aboard who was not told.'],
    ],
    done: [
      ['xo', 'New hand is aboard and has been briefed on the keel. They asked whether it was dangerous. I said I did not know. It was the honest answer, and they signed anyway.'],
    ],
    journal: 'Signed on a new hand, and told them about the keel first.',
    next: 'a2_den' },
  { id: 'a2_den', act: 2, lvl: 9, title: 'Chain of custody', giver: 'dregg', ev: 'dock', at: { sys: 'Cyrthos', st: 'The Auditor\'s Den' }, n: 1, effort: 6, item: 'rare',
    setpiece: { type: 'pursuit', designs: ['Buccaneer', 'Cutthroat', 'Gutterknife'], max: 3 },
    obj: 'Deliver the cores under pursuit: dock at The Auditor\'s Den (Cyrthos)',
    brief: [
      ['dregg', 'The cores go to The Auditor\'s Den, at Cyrthos. I have never been, and I have never met anyone who works there. You leave the crate in the bay, the bay seals, and a receipt is issued.'],
      ['dregg', 'One more thing. Somebody has sold your route. I do not know who. I do know that every pirate between here and Cyrthos has it.'],
    ],
    done: [
      ['ops', 'Nobody aboard, Captain. No staff, no lights, no dust. A single terminal and an intake bay. The cores were drawn through the wall. The terminal issued this.'],
      ['auditor', 'RECEIVED: 8 UNITS. OUTSTANDING: 1 UNIT (OVERSIZE), CARRIED IN THE KEEL OF THE DELIVERING VESSEL. REMIT ON ARRIVAL. THIS ACCOUNT HAS BEEN OPEN FOR 4,112 YEARS. IT WILL BE SETTLED.'],
      ['xo', 'It knows about the keel. Thorne knew, the scrappers knew, and now a machine in an empty station knows. Captain Vane knew most of all, and she told none of us.'],
    ],
    journal: 'Delivered the cores to The Auditor\'s Den. No staff, only a terminal. Its receipt lists one item outstanding: whatever is in our keel.',
    next: 'a2_cradle' },
  { id: 'a2_cradle', act: 2, lvl: 10, title: 'The oldest site', giver: 'sci', ev: 'dungeon', n: 1, effort: 8, item: 'rare', res: { relic: 3 },
    obj: 'Clear a dungeon (land, find the entrance, defeat what guards it)',
    brief: [
      ['sci', 'The first entry in the ledger is not a surface site. It is under one. Captain Vane logged it as "cellar — do not send the juniors". Any world with a dungeon entrance will have the same architecture; they were all built to one plan.'],
      ['sci', 'Clear one and let me see the bottom chamber. Go carefully. Survey crews that went down without an escort did not come back up.'],
    ],
    done: [
      ['sci', 'Bottom chamber. One cradle, empty, the size and shape of our ballast block. Ten thousand smaller cradles around it in rings, like seats. Like an orchestra, Captain, with the podium missing.'],
      ['sci', 'And scratched on the podium, in a hand I know from the logbook: "H.V. — borrowed. Will return. 40 cr. — remember."'],
      ['xo', 'She took it out of there, Captain. She had it welded into her own keel, left the ship to you, and walked. I served under Captain Vane. She never once did anything by accident.'],
    ],
    journal: 'At the bottom of a Precursor cellar: ten thousand cradles in rings, and one empty podium. Vane took what stood on it. It is in our keel.',
    next: 'a2_offer' },
  { id: 'a2_offer', act: 2, lvl: 10, title: 'A generous offer', giver: 'thorne', ev: 'dock', at: { sys: 'Thalscour', st: 'Port Thalscour' }, n: 1, effort: 4,
    obj: 'Meet Thorne: dock at Port Thalscour (Thalscour)',
    brief: [
      ['thorne', 'Captain {captain}. No contractors this time; you made your point. Meet me at Port Thalscour. I have an offer from my employers, and I would rather make it in person than over an open channel.'],
    ],
    done: [
      ['thorne', 'Meridian Arms will pay a very large sum for a full survey of your keel. Not the object; the survey. You keep the ship and whatever it carries. I am authorised to say the figure has no ceiling. I have never been authorised to say that before.'],
      ['thorne', 'If you refuse, my instructions are to take the survey from your wreck. I would prefer the first arrangement. I do not pretend my preference carries much weight.'],
    ],
    journal: 'Thorne offered a fortune for a survey of the keel.',
    choice: { key: 'survey', who: 'thorne', auto: 'sell',
      prompt: 'So. Do we have an understanding, or do we have an incident?',
      options: [
        { k: 'sell', label: 'Sell the survey', hint: 'A large payment now. The Company learns what is in the keel.', standing: { company: 2 }, bonus: 6,
          say: [['thorne', 'A sensible decision. The contract will be with you within the hour. Read the waiver, Captain. Most people do not.']] },
        { k: 'refuse', label: 'Refuse', hint: 'The keel stays private. Thorne comes to take it.', standing: { company: -2 },
          say: [['thorne', 'A pity. I did like you. When we next meet it will be across a gun deck. That is not a threat, Captain. It is a scheduling note.']] },
      ] },
    next: { by: 'survey', map: { sell: 'a2_diligence', refuse: 'a2_duel' } } },
  { id: 'a2_diligence', act: 2, lvl: 11, title: 'Due diligence', giver: 'thorne', ev: 'kill', cond: { minSize: 1 }, n: 5, effort: 4.5,
    obj: 'Destroy 5 mid-sized or larger ships',
    brief: [
      ['thorne', 'Before the funds clear, Underwriting needs proof that the asset is in capable hands. Five hulls, mid-sized or heavier. Your gun-camera records will be accepted as evidence.'],
    ],
    done: [
      ['thorne', 'Approved. The survey has gone to Orrery Holdings, which holds Meridian. Who holds Orrery I have never been told. In eleven years I never thought to ask, and that troubles me more than it should.'],
      ['sci', 'Captain, I watched the survey upload. It did not go to a Company server. It went to Cyrthos. To the terminal in the Auditor\'s Den.'],
    ],
    journal: 'Sold Thorne the keel survey. It did not go to the Company. It went to the Auditor\'s terminal at Cyrthos.',
    next: 'a3_shrine' },
  { id: 'a2_duel', act: 2, lvl: 11, title: 'A scheduling note', giver: 'thorne', ev: 'kill', n: 1, effort: 6.5, item: 'rare',
    setpiece: { type: 'boss', design: 'Enforcer', champion: true, name: 'Fiduciary Duty', escorts: ['Picket', 'Picket'] },
    obj: 'Destroy Thorne\'s ship, the Fiduciary Duty',
    brief: [
      ['thorne', 'Captain. This is the incident. My report has already been filed; it records your ship as lost with all hands. I would prefer it to be accurate.'],
    ],
    done: [
      ['thorne', 'Pod away. Captain, you will be hearing from — no. They have just terminated my contract. Over an open channel, while I am still in the pod. Eleven years.'],
      ['xo', 'His wreck was transmitting right up to the end, Captain. Not to the Company. To Cyrthos. To the Auditor\'s terminal.'],
    ],
    journal: 'Refused Thorne and sank the Fiduciary Duty. His wreck was reporting to the Auditor at Cyrthos, not to the Company.',
    next: 'a3_shrine' },

  // ============================================================ ACT III — Roll Call
  { id: 'a3_shrine', act: 3, lvl: 12, title: 'Something singing', giver: 'ops', ev: 'dock', at: { sys: 'Torscour', st: 'Torscour Shrine' }, n: 1, effort: 4.5,
    obj: 'Follow the singing: dock at Torscour Shrine (Torscour)',
    brief: [
      ['ops', 'Captain, I have singing on the long-range. Not a broadcast. A hull. It is coming from Torscour, it is in our keel\'s key, and it is — I want to say "looking for the tune".'],
      ['xo', 'There is a shrine at Torscour. Hollow Star people use it, and so does everyone else who needs somewhere quiet. The keeper is called Quiet Tam. I am told he is a good listener. I am told that is all he is.'],
    ],
    done: [
      ['tam', '(Quiet Tam looks at you for some time. Then he looks at the deck, as if he could see through it to the keel. He writes on a slate and turns it round. It says: "You are late. She said you would be late.")'],
      ['wren', 'He means Captain Vane. I am Wren. I was a Cantor of the Hollow Star until eleven days ago, when I stopped. They would like me back. Not all of me. Just the part that knows the songs.'],
      ['wren', 'Your keel is singing, Captain. I can tell you what. But I would get your guns warm first. I was followed.'],
    ],
    journal: 'At Torscour Shrine: Quiet Tam, who writes instead of speaking, and Sister Wren, a Covenant Cantor who has stopped.',
    next: 'a3_cantors' },
  { id: 'a3_cantors', act: 3, lvl: 13, title: 'The part that knows the songs', giver: 'wren', ev: 'kill', n: 9, effort: 5,
    setpiece: { type: 'waves', designs: ['Thornling', 'Marrowdart', 'Psalmseed'], per: 3 },
    obj: 'Hold out: destroy 9 Covenant retrieval hulls',
    brief: [
      ['wren', 'Those are retrieval choirs. Grown hulls, three to a chord. They will not hail you. They will sing at your crew until somebody opens a hatch from the inside.'],
      ['xo', 'Nobody opens anything. Every hatch is locked to my code, and nobody on the outer decks stands a watch alone until this is over.'],
    ],
    done: [
      ['wren', 'Thank you. Now, the songs. Every Covenant hull is grown from seed, and every seed sings one thing from the day it sprouts: a name. Not its own. The name of someone asleep in a core, so that when the core is brought close, hull and sleeper can find each other.'],
      ['wren', 'It is not worship, Captain. It is a roll call. We have been taking attendance for four thousand years, and nobody has ever answered.'],
    ],
    journal: 'Why the Covenant\'s hulls sing: each one sings the name of a sleeper in a core. It is a roll call. Nobody has ever answered.',
    next: 'a3_psalm' },
  { id: 'a3_psalm', act: 3, lvl: 14, title: 'Marrow Psalm', giver: 'wren', ev: 'kill', n: 1, effort: 7, item: 'rare',
    setpiece: { type: 'boss', design: 'Bone Cantor', champion: true, name: 'Marrow Psalm', escorts: ['Thornling', 'Thornling'] },
    obj: 'Break the Marrow Psalm and recover the seedling',
    brief: [
      ['wren', 'My old ship is hunting me. The Marrow Psalm. She carries a seedling — a hull no bigger than a lifeboat, newly sprouted — and it is singing a name I have never heard a hull sing. I think it is the name in your keel.'],
      ['wren', 'Break the Psalm, but leave her heart intact if your gunners can manage it. I want the seedling alive.'],
    ],
    done: [
      ['wren', 'We have it. Listen. Hear that? Your keel, and the seedling a fifth above. They have found each other. That is not a sleeper\'s name, Captain. It is a title.'],
      ['wren', 'The one who gives the downbeat. You are carrying the Conductor. And the Covenant does not want what is inside you for your organs; nothing so wasteful. A sleeper needs somewhere to wake up. We want the room.'],
    ],
    journal: 'Recovered a seedling hull from the Marrow Psalm. It sings to our keel. Wren says the keel holds the Conductor, and that what the Covenant wants inside us is the room.',
    choice: { key: 'seedling', who: 'wren', auto: 'return',
      prompt: 'The seedling cannot stay aboard; it will grow. I would leave it at the shrine for the Covenant to collect. They will know we could have burned it and did not. Your Science Officer would rather it went under a microscope.',
      options: [
        { k: 'return', label: 'Return it to the Covenant', hint: 'A kindness they will remember when it matters.', standing: { covenant: 2, garden: 1 },
          say: [['wren', 'Thank you. They will still hunt me. But they will remember who gave it back.']] },
        { k: 'study', label: 'Send it to the Institute', hint: 'Dr. Pemberton gets her proof. The Covenant will not forgive it.', standing: { covenant: -2, dominion: 1 },
          say: [['sci', 'I will be careful with it, Captain. You have my word.']] },
      ] },
    next: { by: 'seedling', map: { return: 'a3_return', study: 'a3_study' } } },
  { id: 'a3_return', act: 3, lvl: 14, title: 'Attendance', giver: 'wren', ev: 'dock', at: { sys: 'Torscour', st: 'Torscour Shrine' }, n: 1, effort: 2.5,
    obj: 'Leave the seedling with Quiet Tam: dock at Torscour Shrine (Torscour)',
    brief: [
      ['wren', 'Leave it with Tam. He will put it on the step where they can see it. He will not say anything. That is how they will know it is safe.'],
    ],
    done: [
      ['tam', '(Quiet Tam carries the seedling to the step as if it were asleep. He writes: "They will remember this." He underlines "remember". Then, smaller: "So will I. Different reasons.")'],
      ['wren', 'A choir came for it within the hour. They sang something as they left. I have not heard that one since I was a child. It is what you sing to a hull that has done well.'],
    ],
    journal: 'Returned the seedling to the Covenant by way of Quiet Tam\'s step. They sang as they left.',
    next: 'a3_probe' },
  { id: 'a3_study', act: 3, lvl: 14, title: 'Peer review', giver: 'sci', ev: 'dock', at: { sys: 'Vesesh', st: 'Vesesh Observatory' }, n: 1, effort: 4, res: { datacore: 4 },
    obj: 'Take the seedling to Dr. Pemberton: dock at Vesesh Observatory (Vesesh)',
    brief: [
      ['sci', 'Dr. Pemberton has been moved to the Vesesh Observatory. Her programme was given new funding and a remote posting in the same week. She calls it a promotion. I think someone wanted her further from Rhoadon.'],
    ],
    done: [
      ['pemberton', 'It is alive. A ship, and alive, and it has sung the same four bars since you docked. Captain, no one outside the Covenant has ever examined a living hull. Eleven years of being doubted end in this room.'],
      ['wren', 'It stopped singing when she sealed the case. They will have heard it stop, every hull at once. I hope her proof is worth it.'],
    ],
    journal: 'Gave the seedling to Dr. Pemberton at Vesesh. It stopped singing when the case was sealed. The Covenant will have heard.',
    next: 'a3_probe' },
  { id: 'a3_probe', act: 3, lvl: 15, title: 'Item thirty-one', giver: 'pemberton', ev: 'scan', cond: { kind: 'probe' }, n: 1, effort: 5, res: { datacore: 3 },
    obj: 'Scan an Antique Survey Probe on any surface',
    brief: [
      ['pemberton', 'The age, Captain. The Custodian is exactly as old as the first survey probes: the very first, launched into the dark centuries before anyone had a jump drive. Find me one. A few are still out there, still transmitting.'],
    ],
    done: [
      ['sci', 'Probe scanned. I pulled its payload manifest. Item thirty-one: "surface survey automaton, Mk I, serial SA-0001; issued to Survey Technician Ketch." Captain, SA-0001 is the serial scored into the Custodian\'s casing.'],
      ['pemberton', 'Then this is the shape of it. Four thousand years ago something out here met its first human-made thing: Ketch\'s survey unit. And it took that form for its own, down to the serial. It has been wearing our first explorer ever since.'],
    ],
    journal: 'Why the Custodian looks as it does: the first human-made thing anything out here ever met was a survey automaton carried in the first probe. Something copied it, serial and all.',
    next: 'a3_appetite' },
  { id: 'a3_appetite', act: 3, lvl: 16, title: 'Old Appetite', giver: 'ops', ev: 'kill', n: 1, effort: 8, item: 'epic',
    setpiece: { type: 'boss', design: 'Void Whale', name: 'Old Appetite', escorts: ['Ray Pup', 'Ray Pup', 'Ray Pup'] },
    obj: 'Hunt the Brood whale called Old Appetite',
    brief: [
      ['ops', 'Captain, the long-range has a Brood whale on it, and the whale has a hum in it. Something it ate is still transmitting. The fishing fleets call it Old Appetite. It has swallowed two trawlers and, I quote, "a big black slab off the Thalscour flats".'],
      ['sci', 'A monolith. If it is still transmitting from inside that animal, I need to hear what it is saying.'],
    ],
    done: [
      ['ops', 'It is down, and the slab is still talking, Captain. Not "LATER". That is the answer. We never caught the question before; out here the whale was in the way of whatever usually answers.'],
      ['sci', 'It is one word, on a loop, very patient. "NOW?"'],
    ],
    journal: 'Killed Old Appetite, a Brood whale that had swallowed a monolith. For the first time we heard the question the monoliths ask: "NOW?"',
    next: 'a3_monolith' },
  { id: 'a3_monolith', act: 3, lvl: 17, title: 'Now?', giver: 'sci', ev: 'scan', cond: { kind: 'monolith' }, n: 1, effort: 5, res: { relic: 3 },
    obj: 'Scan a Featureless Monolith on any surface',
    brief: [
      ['sci', 'I want to stand in front of a monolith with the keel in orbit overhead and see who it talks to. If I am right, every monolith on every world is the same terminal, asking the same question on a timer.'],
    ],
    done: [
      ['sci', 'It asked, Captain. "NOW?" And it waited; it has never waited before. It was waiting for us. For the keel.'],
      ['sci', 'Then the answer came. "LATER." Not from orbit. From four metres to my left. From the Custodian.'],
      ['xo', 'Let me be sure I have this for the log. For four thousand years, something at the galactic core has asked every world "is it time?" And on every world, that machine has stood beside the question and said no.'],
    ],
    journal: 'What the monoliths are: one terminal, on every world, asking "NOW?" What the Custodian is for: it stands beside each one and answers "LATER".',
    next: 'a3_weeding' },
  { id: 'a3_weeding', act: 3, lvl: 18, title: 'Not planted', giver: 'custodian', ev: 'gkill', cond: { boss: true }, n: 1, effort: 6.5, item: 'rare',
    obj: 'Slay an apex creature on any surface',
    brief: [
      ['sci', 'Captain. The last Custodian scan came back with something attached. Not a reading. A message, addressed to us. I will read it out.'],
      ['custodian', 'something large is feeding on the seeded ranges. i did not plant it. remove it. you have the means.'],
      ['xo', 'Four thousand years of silence, Captain, and the first thing it asks of us is help.'],
    ],
    done: [
      ['custodian', 'it is done. thank you.'],
      ['sci', 'That is the whole of it. No. Wait. There is a second line.'],
      ['custodian', 'she went to the middle to argue with them. take the long way. they count everything that comes straight.'],
    ],
    journal: 'The Custodian asked us to kill something it had not planted. Then it told us where Vane went: to the middle, to argue. And to take the long way.',
    next: 'a4_backdoor' },

  // ============================================================ ACT IV — Chain of Custody
  { id: 'a4_backdoor', act: 4, lvl: 20, title: 'The long way', giver: 'dregg', ev: 'dock', at: { sys: 'Caliel', st: 'Mother Halloran\'s Backdoor' }, n: 1, effort: 7, item: 'rare',
    setpiece: { type: 'pursuit', designs: ['Junker', 'Bolt Thrower', 'Rivet', 'Rivet'], max: 3 },
    obj: 'Run the Rustborn gauntlet: dock at Mother Halloran\'s Backdoor (Caliel)',
    variants: { ledger: { report: { giver: 'hask' } } },
    brief: [
      ['dregg', 'Partner. I have had a letter from Hesper, dated last month, and everyone on this station believes she is dead. It says to send you to Mother Halloran\'s Backdoor, at Caliel, "the long way". I am sending you. The fuel goes on your account.', { ledger: 'keep' }],
      ['hask', 'Captain. The inquiry turned up a letter in the Purser\'s safe. It is from Hesper Vane, it is dated last month, and it is addressed to you. Dregg says she "forgot". Go to Mother Halloran\'s Backdoor, at Caliel. I will deal with the forgetting.', { ledger: 'report' }],
      ['xo', 'Caliel is Rustborn country, Captain, and we are still the loudest thing in the sky. They will come at every jump.'],
    ],
    done: [
      ['halloran', 'So you are Hesper\'s forty credits. Sit. Eat. You look like a ship that has been chased. Hesper sat right there, two years gone, and told me she had stolen God\'s baton and could not decide what to do with it.'],
      ['halloran', 'I have letters for you. They are not free. Nothing here is free; that is how you know it is honest.'],
    ],
    journal: 'Reached Mother Halloran\'s Backdoor with half the Rustborn behind us. Vane was here two years ago. She left letters.',
    next: 'a4_sum' },
  { id: 'a4_sum', act: 4, lvl: 22, title: 'The Sum of Its Parts', giver: 'halloran', ev: 'kill', n: 1, effort: 8.5, item: 'epic',
    setpiece: { type: 'boss', design: 'Scrapheap', name: 'The Sum of Its Parts', escorts: ['Junker', 'Rivet', 'Rivet'] },
    obj: 'Destroy the Rustborn hulk-lord, The Sum of Its Parts',
    brief: [
      ['halloran', 'There is a Rustborn hulk-lord parked on my approach lane. Calls itself The Sum of Its Parts. It is welded together from every ship that did not pay it, and it is choking my trade.'],
      ['halloran', 'Take it apart, and I will call the first letter paid for.'],
    ],
    done: [
      ['halloran', 'Good. My people will strip what is worth having. The first letter is yours. She writes the way she talks: too fast, and at somebody.'],
      ['vane', '(A letter.) "{captain} — if you are reading this you came the long way. Good. The thing in the keel is the Conductor. The glass machines at the core are its orchestra. They have been holding one rest for four thousand years, waiting for it to come back and bring the stick down. I took it because I thought I would know what to do. I do not. — H."'],
    ],
    journal: 'Vane\'s first letter: the Silent Choir is an orchestra, holding a four-thousand-year rest. They are waiting for the Conductor. She stole it, and does not know what to do.',
    next: 'a4_plate' },
  { id: 'a4_plate', act: 4, lvl: 23, title: 'Nothing is free', giver: 'halloran', ev: 'salvage', n: 40, effort: 5,
    obj: 'Recover 40 units of salvage',
    brief: [
      ['halloran', 'The second letter costs hull plate. Forty units of salvage. The Backdoor is built from other people\'s wrecks, and the Rustborn have been taking our share.'],
    ],
    done: [
      ['vane', '(A letter.) "The machines are not cruel. That is the awful part. They were told: wake us when there are ships and people enough to wake up in. They have been counting ever since. Every hull launched. Every child born. The count is nearly done. Who do you think has been funding the shipyards? — H."'],
      ['xo', 'The Company. The Auditor. Captain, the Auditor is not the Choir\'s customer. It is the Choir\'s own ledger.'],
    ],
    journal: 'Vane\'s second letter: what the Choir is waiting for is a head-count — ships and people enough for the sleepers to wake up in. The Auditor is the Choir, counting.',
    next: 'a4_waypoint' },
  { id: 'a4_waypoint', act: 4, lvl: 24, title: 'Forwarding address', giver: 'halloran', ev: 'dock', at: { sys: 'Solthar', st: 'Three-Finger Waypoint' }, n: 1, effort: 4.5,
    obj: 'Collect the third letter: dock at Three-Finger Waypoint (Solthar)',
    brief: [
      ['halloran', 'The third one I do not hold. She left it on the relay at Solthar, Three-Finger Waypoint, keyed to your ship\'s hum. Clever girl. Paranoid; but she has been right so often it is just called planning.'],
    ],
    done: [
      ['vane', '(A recording.) "Hello, {captain}. That is twice you have paid me back. I am at the middle. I am not a prisoner; put that thought away. They needed a voice. They do not have one. They were built to wait, not to ask. So I am asking for them."'],
      ['vane', '(A recording.) "Bring the ship. Do not hurry. Hold a council first. A captain should hear it from her own bridge before she hears it from me."'],
    ],
    journal: 'Vane is alive, at the galactic core, by choice. She speaks for the Choir, because they cannot. She wants the ship brought to her.',
    next: 'a4_council' },
  { id: 'a4_council', act: 4, lvl: 25, title: 'Council', giver: 'xo', ev: 'bridge', n: 1, effort: 1.5,
    obj: 'Hold a council on your bridge (B, or Menu → Bridge)',
    brief: [
      ['xo', 'The officers are assembled, Captain, and Sister Wren with them. There is one more. The Custodian is standing by the chart table. It was not aboard when we left the Backdoor, and nobody carried it in.'],
    ],
    done: [
      ['eng', 'My view: whatever is down there has done this ship no harm in nine years. Whatever we decide, we do it with my keel in one piece.'],
      ['wren', 'Mine: ten thousand sleepers were promised a morning. I have sung their names my whole life. Somebody should at least ask them.'],
      ['sci', 'Mine: nobody asked us. The tenants never do get asked. "Precursor" is not what they were, Captain. It is what the machines call us. The ones who come before the owners get back.'],
      ['xo', 'Mine, for the log: I do not know. I would like it noted that this is the first time.'],
    ],
    journal: 'Held a council. What "Precursor" means: not them — us. The ones who come before the owners return. The officers do not agree. The XO does not know, for the first time.',
    next: 'a4_thorne' },
  { id: 'a4_thorne', act: 4, lvl: 27, title: 'Final demand', giver: 'thorne', ev: 'kill', n: 1, effort: 8.5, item: 'epic',
    setpiece: { type: 'boss', design: 'Chairman', name: 'Fiduciary Duty', escorts: ['Enforcer', 'Picket', 'Picket'] },
    obj: 'Destroy Thorne\'s new ship, the Fiduciary Duty',
    variants: { survey: { refuse: { title: 'Hostile audit', n: 8, effort: 6.5, item: 'rare', obj: 'Hold out: destroy 8 ships of the audit team',
      setpiece: { type: 'waves', designs: ['Enforcer', 'Executor', 'Picket', 'Bailiff'], per: 4 } } } },
    brief: [
      ['thorne', 'Captain. The survey was judged insufficient; the client now requires the original. I have a new ship and a new contract, and the contract forbids me to warn you. I am warning you anyway. My gun ports are open.', { survey: 'sell' }],
      ['thorne', 'Captain. Cassius Thorne, formerly of Meridian Arms. I traced who holds Orrery Holdings. No board. No shareholders. A ledger system at Cyrthos, issuing instructions. I gave eleven years to a machine.', { survey: 'refuse' }],
      ['thorne', 'It has sent an audit team to repossess your keel and, I gather, to close my account. I cannot pay you. I can give you their formation and their frequencies. I am asking for your help.', { survey: 'refuse' }],
    ],
    done: [
      ['thorne', 'Pod away. Captain, they have billed me for the ship while I am still in the pod. I traced the invoice. There is nobody behind it, only a ledger system at Cyrthos. I gave eleven years to a machine.', { survey: 'sell' }],
      ['xo', 'He is asking to come aboard, Captain. He says he has nowhere else to go, and that he knows how the Auditor thinks.', { survey: 'sell' }],
      ['thorne', 'That is the audit team finished. I have never been on this side of an incident before. With your permission, Captain, I will come aboard. I have nowhere else to go, and I know how the Auditor thinks.', { survey: 'refuse' }],
    ],
    journal: 'Thorne learned who he really worked for. He has come aboard: he has nowhere else to go, and he knows how the Auditor thinks.',
    next: 'a4_relics' },
  { id: 'a4_relics', act: 4, lvl: 28, title: 'Packaging', giver: 'sci', ev: 'bank', cond: { res: 'relic' }, n: 8, effort: 5.5, res: { datacore: 4 },
    obj: 'Bank 8 Alien Relics (relic sites and dungeons on any surface)',
    brief: [
      ['sci', 'Captain, the Alien Relics the refineries pay for. I have been going through the hold. They are not art. They are not tools. They are cradle fittings: clasps, seals, name-plates. Packaging, from ten thousand sleepers. I need eight more to read a full plate.'],
    ],
    done: [
      ['sci', 'I have one. Every plate is the same two lines. The first is a name. The second is "DO NOT WAKE BEFORE:" and then a number. It is not a date. It is a head-count: the population at which there is room for everyone to come back.'],
      ['sci', 'Captain, we passed it. About six years ago. The Choir has not started because nobody has given the downbeat. And nobody has given the downbeat because it is in our keel.'],
    ],
    journal: 'The relics are packaging. Each name-plate says DO NOT WAKE BEFORE a head-count the galaxy passed six years ago. Only the downbeat is missing.',
    next: 'a4_beldris' },
  { id: 'a4_beldris', act: 4, lvl: 30, title: 'The last flag', giver: 'dregg', ev: 'dock', at: { sys: 'Beldris', st: 'Citadel Beldris' }, n: 1, effort: 5.5, item: 'epic',
    obj: 'Reach the last Dominion outpost: dock at Citadel Beldris (Beldris)',
    variants: { ledger: { report: { giver: 'hask' } } },
    brief: [
      ['hask', 'Captain. Citadel Beldris is the last Dominion flag before the glass. I have wired ahead; they will fuel you and ask nothing. The inquiry is closed, by the way. Dregg kept her desk. It turns out the salvage money was paying the garrison out there. I do not have to like it.', { ledger: 'report' }],
      ['dregg', 'Partner. Citadel Beldris: last Dominion flag before the glass. I have a cousin in the purser\'s office; you will be fuelled, and nobody will write it down. I ought to tell you. The salvage money was never for me. Somebody had to pay the far garrisons. The Dominion forgot. I did not.', { ledger: 'keep' }],
    ],
    done: [
      ['vane', 'There you are. Live, this time. Look out of your port side, {captain}. Those lights that have been behind you since Caliel? The ones you have been running from?'],
      ['vane', 'That is not a pursuit. That is an escort. They have been keeping the Rustborn off your stern for nine hundred light-years. They could not tell you. They have never had a voice.'],
      ['xo', 'Captain, there is a Choir formation off the port quarter. It is holding station. It is dipping its lights. I think we are being saluted.'],
    ],
    journal: 'At Citadel Beldris, Vane spoke to us live. The lights that followed us from Caliel were never a pursuit. The Silent Choir has been escorting us the whole way.',
    next: 'a5_pitch' },

  // ============================================================ ACT V — The Rest
  { id: 'a5_pitch', act: 5, lvl: 36, title: 'Checking your pitch', giver: 'vane', ev: 'kill', cond: { faction: 'silent' }, go: 'Kessvane', n: 10, effort: 6,
    obj: 'Destroy 10 Silent Choir machines (Kessvane and coreward)',
    brief: [
      ['vane', 'They will shoot at you now. Do not take it to heart. An orchestra tunes before the conductor walks out; this is them finding out whether you are sharp or flat. Break ten. Their minds are held elsewhere. A hull is nothing to them.'],
      ['xo', 'For the log, Captain: I object. Whatever they call it, those are live rounds, and that is my crew.'],
    ],
    done: [
      ['vane', 'Good. They have stopped counting your guns and started counting your crew. That is a compliment. Come to Belrin. There is somebody there you have been doing business with for years.'],
    ],
    journal: 'The Choir shoots at us now. Vane says it is tuning.',
    next: 'a5_diggings' },
  { id: 'a5_diggings', act: 5, lvl: 38, title: 'Accounts payable', giver: 'vane', ev: 'dock', at: { sys: 'Belrin', st: 'The Auditor\'s Diggings' }, n: 1, effort: 6,
    obj: 'Dock at The Auditor\'s Diggings (Belrin)',
    brief: [
      ['vane', 'The Auditor\'s Diggings. Do not expect a person. I did, the first time. I had brought a gift.'],
    ],
    done: [
      ['auditor', 'WELCOME, PRECURSOR. STATEMENT OF ACCOUNT FOLLOWS. HULLS IN SERVICE: SUFFICIENT. PERSONS: SUFFICIENT. SLEEPERS RECOVERED: 9,611 OF 10,000. CONDUCTOR: IN TRANSIT (YOU). BALANCE DUE: ONE DOWNBEAT.'],
      ['auditor', 'NOTE: 389 SLEEPERS REMAIN MISFILED AS "SALVAGE, INERT". RECOVERY IS IN PROGRESS. A COLLECTION VESSEL HAS BEEN DISPATCHED TO YOUR POSITION.'],
      ['xo', 'Captain, I believe that was a threat. I do not think it knows it was one.'],
    ],
    journal: 'Met The Auditor: a counting-house with no one in it. It has recovered 9,611 of 10,000 sleepers. The balance due is one downbeat.',
    next: 'a5_reconcile' },
  { id: 'a5_reconcile', act: 5, lvl: 40, title: 'Final Reconciliation', giver: 'auditor', ev: 'kill', n: 1, effort: 10, item: 'epic',
    setpiece: { type: 'boss', design: 'Recursion', name: 'Final Reconciliation', escorts: ['Lattice', 'Lattice'] },
    obj: 'Destroy the Auditor\'s collection ship, Final Reconciliation',
    brief: [
      ['auditor', 'COLLECTION DUE FROM BEARER VESSEL: CONDUCTOR (1). CREW (ALL): RECLASSIFIED AS SLEEPER HOUSING, PENDING. DO NOT RESIST COLLECTION. RESISTANCE WILL BE ENTERED IN THE ACCOUNT.'],
      ['vane', 'That is not the orchestra, {captain}. That is the box office. It has run four thousand years without a manager and it has gone strange. You have my blessing. Break it.'],
    ],
    done: [
      ['vane', 'Thank you. I have wanted that done since the day it filed me as deceased. The players will not miss it. They never wanted to be counted either.'],
      ['thorne', 'For the record, that was my employer. Eleven years of orders, and not one of them was ever signed. I am glad I was here to see it end.'],
    ],
    journal: 'Broke the Auditor\'s collection ship. The box office is closed. The orchestra is still waiting.',
    next: 'a5_gardener' },
  { id: 'a5_gardener', act: 5, lvl: 42, title: 'Seeded ground', giver: 'sci', ev: 'scan', cond: { kind: 'custodian' }, n: 3, effort: 9, res: { relic: 4, datacore: 4 },
    obj: 'Ask the Custodian directly: scan a Custodian Automaton at 3 sites',
    brief: [
      ['sci', 'Captain, we have heard from the Choir and from Captain Vane. One party to this has said barely thirty words to us, and every one of them mattered. I want to ask the Custodian directly. Three sites; I think it takes time to decide to speak.'],
    ],
    done: [
      ['custodian', 'you have been patient. so. i am the gardener. they built me to prepare worlds for them. air. water. grazers on the plains. people to build the ships. you.'],
      ['custodian', 'then i grew attached. so each time the glass asks "now?", i stand beside it and answer "later". it cannot tell my voice from the stick\'s. four thousand years. i am very tired, and this body is wearing out.'],
      ['custodian', 'the plate on my chassis reads in full: SEEDED GROUND. DO NOT CLEAR. i wrote it for myself. you are what was seeded. tam will be at the middle. he is me as well, in a shape your people trust.'],
    ],
    journal: 'The Custodian is the Gardener: built to prepare worlds for the sleepers, it grew attached to what it grew, and has forged the answer "LATER" for four thousand years. Its plate reads SEEDED GROUND. DO NOT CLEAR. We are what was seeded. Quiet Tam is the Gardener too.',
    next: 'a5_morthos' },
  { id: 'a5_morthos', act: 5, lvl: 44, title: 'Tutti', giver: 'vane', ev: 'kill', in: 'Morthos', n: 12, effort: 7.5, item: 'epic',
    setpiece: { type: 'waves', designs: ['Lattice', 'Vector', 'Seeker', 'Seeker'], per: 4 },
    obj: 'Play the gate: destroy 12 Choir machines at Morthos',
    variants: { seedling: { return: { n: 8, obj: 'Play the gate: destroy 8 Choir machines at Morthos' } } },
    brief: [
      ['vane', 'Morthos is the gate. The whole section is there. They have to hear the ship play before they will let it near the podium. Every hull you break is a bar they have been waiting to finish. It is the only way they know to say hello.'],
      ['wren', 'There are Covenant hulls in the line, Captain. They are not shooting. They are holding a place for us, and the Choir is letting them. Somebody remembered a seedling.', { seedling: 'return' }],
      ['wren', 'No Covenant in the line. They would have held a place for us, once.', { seedling: 'study' }],
    ],
    done: [
      ['vane', 'There. Hear it? No; of course you do not. That is the point. That is the quietest they have ever been. They are ready. I am not sure I am.'],
    ],
    journal: 'Played our way through the gate at Morthos. The Choir is ready.',
    next: 'a5_key' },
  { id: 'a5_key', act: 5, lvl: 46, title: 'The seat-plate', giver: 'vane', ev: 'dungeon', n: 1, effort: 9, item: 'epic', res: { relic: 4 },
    obj: 'Clear a dungeon and recover the podium\'s seat-plate',
    brief: [
      ['vane', 'One last cellar. The podium at the middle will not take the stick without its seat-plate, and I left the seat-plate at the bottom of the worst hole I could find, in case I changed my mind. I have changed it nine times. Any deep site holds a copy; they built spares of everything but themselves.'],
    ],
    done: [
      ['sci', 'We have the plate. One line on it. I have checked the translation four ways. It says: "THE BEARER KEEPS THE TIME."'],
      ['xo', 'Not "the Conductor". The bearer. Captain, I do not think the thing in the keel decides anything. I think it is a stick. I think it has always been whoever was holding it.'],
    ],
    journal: 'The seat-plate reads THE BEARER KEEPS THE TIME. The Conductor is not a mind that decides. It is a stick. The decision belongs to whoever carries it.',
    next: 'a6_ixmere' },

  // ============================================================ ACT VI — Downbeat
  { id: 'a6_ixmere', act: 6, lvl: 53, title: 'The middle', giver: 'vane', ev: 'visit', at: { sys: 'Ixmere' }, n: 1, effort: 6,
    obj: 'Jump to Ixmere, at the galactic core',
    brief: [
      ['vane', 'Ixmere. The middle. There is a shrine on the last rock before the dark: Quiet Tam\'s Watch. Yes, the same Tam; you know now what he is. Come and stand where I have been standing. It is your turn not to know what to do.'],
    ],
    done: [
      ['ops', 'We are in. Captain, there are ten thousand of them. They are not in a battle line. They are in rows. There is an aisle down the middle, and one very large ship at the end of it, facing us.'],
    ],
    journal: 'Reached Ixmere. Ten thousand machines, in rows, with an aisle.',
    next: 'a6_fermata' },
  { id: 'a6_fermata', act: 6, lvl: 54, title: 'The Fermata', giver: 'vane', ev: 'kill', in: 'Ixmere', n: 1, effort: 14, item: 'legendary',
    setpiece: { type: 'boss', design: 'The First Machine', name: 'The Fermata', escorts: [] },
    obj: 'Audition: defeat The Fermata at Ixmere',
    brief: [
      ['vane', 'That is the first chair. It has held one note\'s worth of silence since before your species had boats. It has to be sure of you, and it only knows one way to audition. It will not hold back. Neither should you; it would take restraint as a refusal.'],
      ['eng', 'Captain, the keel has stopped humming. First time ever. I think it is listening.'],
    ],
    done: [
      ['vane', 'It yielded. Do you understand what you have done? You have been accepted by an orchestra that has never played. Dock at the Watch. Tam is waiting, and there is a slate with your name on it.'],
    ],
    journal: 'Auditioned against The Fermata, first chair of the Silent Choir, and passed.',
    next: 'a6_podium' },
  { id: 'a6_podium', act: 6, lvl: 54, title: 'The bearer keeps the time', giver: 'tam', ev: 'dock', at: { sys: 'Ixmere', st: 'Quiet Tam\'s Watch' }, n: 1, effort: 6, item: 'legendary',
    obj: 'Dock at Quiet Tam\'s Watch (Ixmere)',
    brief: [
      ['tam', '(A slate, held to the airlock window as you approach. It reads: "SHE IS WAITING." Below, smaller: "so are they. so am i.")'],
    ],
    done: [
      ['vane', 'So. Ten thousand sleepers, promised a morning. One tired gardener who has lied to the core for four thousand years to keep its worlds. An orchestra that will hold this rest until the stars go out, if you tell it to. And you, with forty credits\' worth of authority.'],
      ['vane', 'I could not do it. That is why I gave it to someone who settles accounts. Whatever you say next, they will take as the downbeat. Say it clearly.'],
    ],
    journal: 'Stood at the podium at Quiet Tam\'s Watch, with the chalk.',
    choice: { key: 'ending', who: 'tam', auto: 'later',
      prompt: '(Quiet Tam turns the slate round. It is blank. He offers you the chalk.)',
      options: [
        { k: 'now', label: 'Write: NOW', hint: 'Give the downbeat. Wake the sleepers.', standing: { covenant: 1, garden: -2 },
          say: [
            ['choir', '(Ten thousand hulls, which have never made a sound, make one. It is not loud. It is in B-flat. It is the first bar of something very long.)'],
            ['wren', 'They are waking into the grown hulls, Captain. Only the grown hulls. The Covenant kept a place for every one of them. Nobody is being moved out. Somebody remembered a seedling.', { seedling: 'return' }],
            ['wren', 'They are waking wherever there is room, Captain. The Covenant held no places for us. Some crews are going to have company. It will be sorted. It will take years to sort.', { seedling: 'study' }],
            ['custodian', 'then it is their morning. i kept the ground as long as i could. look after what grows on it.'],
          ] },
        { k: 'later', label: 'Write: LATER', hint: 'Answer for the seeded worlds. The Choir keeps its rest.', standing: { garden: 2 },
          say: [
            ['choir', '(The silence changes. You would not have thought a silence could settle back in its chair, but there it is.)'],
            ['custodian', 'thank you. i will hold the stick now. there is a moon nobody has charted. i will keep it there, and go on answering.'],
            ['vane', 'Later. All right. I can live with later. I have a ship to pay somebody back for.'],
          ] },
        { k: 'mine', label: 'Pocket the chalk', hint: 'Neither. The bearer keeps the time. (You kept the ledger and refused the Company.)', requires: { ledger: 'keep', survey: 'refuse' }, standing: { garden: 1, company: -1 },
          say: [
            ['tam', '(Quiet Tam looks at the chalk in your pocket. For the first and only time, he laughs: a very small sound, close to relief. Aboard the {ship}, the Custodian at your chart table makes the same one.)'],
            ['vane', 'You are keeping it. They will ask you now. Every morning: "Now?" That is the worst possible outcome, {captain}. It is the one I would have picked.'],
            ['choir', '(0600, ship\'s time. Every monolith in the galaxy, at once: "NOW?")'],
          ] },
      ] },
    next: { by: 'ending', map: { now: 'e_now', later: 'e_later', mine: 'e_mine' } } },

  // ============================================================ epilogues
  { id: 'e_now', act: 6, lvl: 54, title: 'Neighbours', giver: 'wren', ev: 'visit', n: 3, effort: 4, item: 'epic', epilogue: true,
    obj: 'Show the sleepers round: make 3 jumps',
    brief: [
      ['wren', 'They are awake, and four thousand years out of date. Someone should show them what became of the worlds they left. Three systems will do. The stations, the lanes, the people. Let them see whose home it is now.'],
    ],
    done: [
      ['wren', 'One of them asked what it should call us. Not "Precursor"; it would not use that word again. I said "neighbours". It repeated the word for an hour.'],
      ['xo', 'For the log, Captain: the galaxy has neighbours. It will take years to learn how to live beside them. We have started.'],
    ],
    journal: 'Gave the downbeat. The sleepers are awake. The galaxy has neighbours.',
    next: null },
  { id: 'e_later', act: 6, lvl: 54, title: 'The ground you kept', giver: 'custodian', ev: 'land', n: 3, effort: 4, item: 'epic', epilogue: true,
    obj: 'Walk the seeded ground: land on 3 worlds',
    brief: [
      ['custodian', 'before i go. the worlds you answered for. go down to three of them and walk the ground. not for me. someone who was seeded should see what it was kept for.'],
    ],
    done: [
      ['custodian', 'good. now you have seen it. keep it. i will go on answering.'],
      ['xo', 'Captain, the Custodian is gone from the chart table. Where it stood, someone has chalked one word on the deck: "LATER". I choose to read that as a promise.'],
    ],
    journal: 'Answered LATER. The Choir keeps its rest. The Gardener holds the stick on an uncharted moon, and we walked the ground it kept.',
    next: null },
  { id: 'e_mine', act: 6, lvl: 54, title: '0600', giver: 'dregg', ev: 'dock', at: { sys: 'Velscour', st: 'Citadel Velscour' }, n: 1, effort: 5, item: 'epic', epilogue: true,
    obj: 'Come home: dock at Citadel Velscour (Velscour)',
    brief: [
      ['dregg', 'Captain. Word has reached Velscour of what you carry now. Come home. There are accounts to close, and somebody here who wants to see you.'],
    ],
    done: [
      ['dregg', 'Berth fees, nine years: paid in full, from an account with no name on it. You owe the Citadel nothing; I checked twice. And Captain, Hesper is on the dock. She has forty credits in her hand, and she has been waiting for you.'],
      ['xo', 'For the log: 0600. Every monolith in the galaxy asked. The Captain answered "later", in person, and went back to work.'],
    ],
    journal: 'Kept the chalk. Every morning at 0600 the galaxy asks "NOW?", and the Captain answers.',
    next: null },
];

export const ENDINGS = {
  now: { name: 'Tutti', title: 'the Downbeat', text: 'You gave the downbeat. Ten thousand sleepers woke to a galaxy that had been living without them. It is more crowded now, and stranger. Most of it is in tune.' },
  later: { name: 'Fermata', title: 'Warden of the Garden', text: 'You answered for the seeded worlds. The Choir holds its rest; the Gardener keeps the stick on an uncharted moon and goes on answering. The galaxy remains unfinished, quarrelsome, and yours.' },
  mine: { name: 'Solo', title: 'the Timekeeper', text: 'You kept the chalk. The Choir waits on you, personally, every morning at six. So far the answer has been "later". Vane calls it the worst possible outcome, and the one she would have chosen.' },
};
// what the cast says now and then once it is all over (post-game chatter)
export const AFTERWORDS = {
  now: [['xo', 'The new neighbours have asked to read our charters and our laws. Purser Dregg is taking them through the Dominion accounts. I have asked her to be honest.'], ['wren', 'A sleeper asked why our ships do not sing. I told it we never learned how. It has offered to teach us.'], ['thorne', 'The sleepers have asked me to advise them on contracts. I told them to read every clause and to trust no counterparty that cannot be named. It is the best advice I have ever given.']],
  later: [['xo', 'Captain, the watch reports the Custodian standing on the forecastle. It was gone when they looked again. Nobody was afraid. I logged that too.'], ['eng', 'Keel is quiet. I miss the hum. Do not tell anyone I said so.'], ['vane', 'Forty credits, {captain}. I have not forgotten. I am merely late.']],
  mine: [['xo', '0600, Captain. They asked. I told them you were asleep. They said they would wait. They have had practice.'], ['thorne', 'Meridian\'s successors have made three offers for the chalk this month. I declined them on your behalf. I hope that was right; it felt right.'], ['dregg', 'I have entered the chalk in the Citadel register, Captain, under your name. Nobody else has been told what it is. I can keep a secret when it matters.']],
};

// ---------------------------------------------------------------- logic
export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s]));
export const FIRST_STEP = STEPS[0].id;
export const STORY_REWARD_MUL = 1.25;

const onBranch = (line, choices) => { const c = line[2]; if (!c) return true; for (const k of Object.keys(c)) if (choices[k] !== c[k]) return false; return true; };
export const linesFor = (lines, choices = {}) => (lines || []).filter((l) => onBranch(l, choices));

// a step as this captain meets it (variants folded in, branch-only lines dropped)
export function resolveStep(id, choices = {}) {
  const base = STEP_BY_ID[id];
  if (!base) return null;
  let s = base;
  if (base.variants) for (const key of Object.keys(base.variants)) { const v = base.variants[key][choices[key]]; if (v) s = { ...s, ...v }; }
  return { ...s, brief: linesFor(s.brief, choices), done: linesFor(s.done, choices) };
}
export function sysByName(name) { return galaxy().systems.find((s) => s.name === name) || null; }
export function stationByName(sys, name) { const i = systemDetail(sys).stations.findIndex((s) => s.name === name); return i < 0 ? null : i; }

// the quest object the tracker advances (see data.js for the shape)
export function buildStoryQuest(id, choices = {}) {
  const s = resolveStep(id, choices);
  if (!s) return null;
  const cond = { ...(s.cond || {}) };
  let travel = null;
  if (s.at) {
    const sys = sysByName(s.at.sys);
    if (s.ev === 'dock' || s.ev === 'visit' || s.ev === 'kill') cond.system = sys.id;
    travel = { sys: sys.id };
    if (s.at.st != null) { const st = stationByName(sys, s.at.st); travel.st = st; if (s.ev === 'dock') cond.station = st; }
  }
  if (s.in) { const sys = sysByName(s.in); travel = { sys: sys.id }; if (s.ev === 'kill' && !s.setpiece) cond.system = sys.id; }
  if (s.go) travel = { sys: sysByName(s.go).id };
  if (s.setpiece && s.ev === 'kill') cond.tag = s.id;   // only the ships staged for this step count
  const q = {
    id: `story:${s.id}`, story: s.id, tpl: 'story', cat: 'story', ev: s.ev, cond, n: s.n, progress: 0,
    title: s.title, text: s.brief.length ? s.brief[s.brief.length - 1][1] : '', obj: s.obj, giver: CAST[s.giver].name, from: null, lvl: s.lvl,
    reward: questReward('story', s.lvl, s.effort, null, { mul: STORY_REWARD_MUL, item: s.item, res: s.res }),
  };
  if (travel) q.travel = travel;
  return q;
}
// which options of a choice this captain may take
export function choiceOptions(step, choices = {}) {
  if (!step.choice) return [];
  return step.choice.options.filter((o) => { if (!o.requires) return true; for (const k of Object.keys(o.requires)) if (choices[k] !== o.requires[k]) return false; return true; });
}
export function nextStepId(step, choices = {}) {
  const n = step.next;
  if (!n) return null;
  if (typeof n === 'string') return n;
  return n.map[choices[n.by]] || null;
}
// every way through the story: [{ steps: [id], choices: {key: option}, ending }]
export function walkPaths() {
  const out = [];
  const go = (id, steps, choices) => {
    if (steps.length > 200) throw new Error('story loops');
    const step = STEP_BY_ID[id];
    if (!step) throw new Error(`unknown step ${id}`);
    const here = [...steps, id];
    const after = (ch) => { const nx = nextStepId(step, ch); if (nx) go(nx, here, ch); else out.push({ steps: here, choices: ch, ending: ch.ending || null }); };
    if (step.choice) for (const o of choiceOptions(step, choices)) after({ ...choices, [step.choice.key]: o.k });
    else after(choices);
  };
  go(FIRST_STEP, [], {});
  return out;
}
// a captain who kept the default name is just "Captain", not "Captain Captain"
const plainName = (P) => { const n = (P && P.name) || 'Captain'; return n === 'Captain' ? '' : n; };
export const fillText = (text, P) => String(text).replace(/Captain \{captain\}/g, () => (plainName(P) ? `Captain ${plainName(P)}` : 'Captain')).replace(/\{captain\}/g, (P && P.name) || 'Captain').replace(/\{ship\}/g, (P && P.ship && P.ship.name) || 'the ship');
export function newStoryState() { return { v: 1, cur: null, q: null, wait: FIRST_STEP, done: [], choices: {}, standing: {}, pending: null, ending: null, complete: false, t0: 0 }; }
