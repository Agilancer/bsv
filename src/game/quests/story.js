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
  pemberton: { name: 'Dr. Pemberton', role: 'Department of Unexplained Objects', hex: '#7ad8ff' },
  wren: { name: 'Sister Wren', role: 'Formerly a Cantor of the Hollow Star', hex: '#e07aff' },
  tam: { name: 'Quiet Tam', role: 'Shrine keeper', hex: '#c0a0ff' },
  halloran: { name: 'Mother Halloran', role: 'Proprietor, the Backdoor', hex: '#ff9a50' },
  vane: { name: 'Captain Vane', role: 'The previous owner', hex: '#9fd8ff' },
  auditor: { name: 'The Auditor', role: 'Accounts', hex: '#d0d6e0' },
  gnome: { name: 'Garden Gnome', role: 'Ceramic', hex: '#ff5a6a' },
  choir: { name: 'The Silent Choir', role: '', hex: '#8090a8' },
};

export const ACTS = [
  null,
  { n: 1, title: 'Forty Credits', sub: 'An inheritance, itemised' },
  { n: 2, title: 'Garden Ornaments', sub: 'Twenty-two credits each' },
  { n: 3, title: 'Roll Call', sub: 'Four thousand years of attendance' },
  { n: 4, title: 'Chain of Custody', sub: 'The long way round' },
  { n: 5, title: 'The Rest', sub: 'An orchestra tunes' },
  { n: 6, title: 'Downbeat', sub: 'The bearer keeps the time' },
];

// what the captain's choices move, and how the Story tab words it
export const STANDINGS = {
  dominion: { name: 'Velscour Dominion', words: ['wanted for questioning', 'tolerated', 'in good standing', 'decorated, reluctantly'] },
  company: { name: 'Rival Companies', words: ['an open incident', 'a line item', 'a valued counterparty', 'a preferred vendor'] },
  covenant: { name: 'Hollow Star Covenant', words: ['sung against', 'unsung', 'remembered kindly', 'held a place for'] },
  garden: { name: 'The Gardener', words: ['on the grass', 'on the grass', 'tolerated on the grass', 'liked, which it finds embarrassing'] },
};
export const standingWord = (key, v = 0) => { const w = STANDINGS[key].words; return w[Math.max(0, Math.min(w.length - 1, 1 + Math.sign(v) * Math.min(2, Math.abs(v))))]; };

// the first thing a new captain hears, docked at the home station (onboarding.js shows it)
export const ARRIVAL = [
  ['dregg', 'Captain {captain}? Purser Dregg, Citadel Velscour. Sign here, here, and here. Congratulations on your inheritance. My condolences on your inheritance.'],
  ['dregg', 'Captain Hesper Vane left you one battleship, the {ship}, in a will filed three days before she sailed for the galactic core and stopped answering. Her reason, quoted in full: "To the only officer who ever paid me back the forty credits."'],
  ['xo', 'First Officer, Captain. The crew has read the will. Morale is "curious". The ship is sound, mostly paid for, and hums a little in the keel. Engineering says that is normal. Engineering says that about everything.'],
  ['dregg', 'Docking fees are itemised on the station board. So is everything else. Have a look round before you undock; it is all billable either way.'],
];

// ---------------------------------------------------------------- the steps
export const STEPS = [
  // ============================================================ ACT I — Forty Credits
  { id: 'a1_fees', act: 1, lvl: 1, title: 'Working it off', giver: 'dregg', ev: 'kill', cond: { faction: 'pirate' }, n: 6, effort: 2.7,
    obj: 'Destroy 6 pirate ships',
    brief: [
      ['dregg', 'The {ship} came with nine years of unpaid berth fees. I have applied your signing bonus against them. You now owe slightly less than a small moon.'],
      ['dregg', 'The Reach pays a standing bounty on pirates. Six hulls would cover the interest. I would start there, Captain; I have seen what the principal looks like.'],
    ],
    done: [
      ['dregg', 'Six. I counted them twice, for joy. Fees deferred. Not forgiven. Deferred.'],
      ['xo', 'For the log, Captain: Captain Vane\'s old cabin is still locked from the inside. Nobody is in it. I checked. Twice, and not for joy.'],
    ],
    journal: 'Inherited a battleship and nine years of berth fees from Captain Hesper Vane. Shot six pirates toward the interest.',
    next: 'a1_hum' },
  { id: 'a1_hum', act: 1, lvl: 1, title: 'B-flat', giver: 'eng', ev: 'bridge', n: 1, effort: 1,
    obj: 'Visit your bridge (B, or Menu → Bridge)',
    brief: [
      ['eng', 'Captain, about the hum. I have said it is normal. I would like to revise that to "consistent". It comes from the keel, it is a perfect B-flat, and it gets louder when we point at the galactic core.'],
      ['xo', 'The officers would like a word on the bridge. Several words. They have prepared an agenda.'],
    ],
    done: [
      ['sci', 'I ran the keel through every scanner we own. The scanners all returned one word. I would rather not say which. It was "LATER".'],
      ['eng', 'There is a ballast block down there that is not on the plans. Captain Vane had it fitted the week before she left. The yard invoice just says "sentimental".'],
    ],
    journal: 'The keel hums in B-flat and there is something in the ballast that is not on the plans. The scanners say "LATER".',
    next: 'a1_crate' },
  { id: 'a1_crate', act: 1, lvl: 2, title: 'Garden ornaments', giver: 'dregg', ev: 'dock', at: { sys: 'Velscour', st: 'Velscour Waypoint' }, n: 1, effort: 2,
    obj: 'Deliver the crate: dock at Velscour Waypoint',
    brief: [
      ['dregg', 'A small favour, off the books. Which is to say, on a different set of books. One sealed crate for the Velscour Waypoint. The manifest says "garden ornaments".'],
      ['dregg', 'Do not open it, do not scan it, and if it hums, hum along. The Signaller will sign for it.'],
    ],
    done: [
      ['ops', 'Crate is away. Captain, it was humming. Same note as our keel. I checked one against the other and then I stopped checking, because they had started to harmonise.'],
      ['ops', 'Also, the Signaller did not sign for it. A printer did. The receipt reads: "RECEIVED: 1. THANK YOU, PRECURSOR."'],
    ],
    journal: 'Ran a crate of "garden ornaments" to the Waypoint for Purser Dregg. It hummed. A printer signed for it.',
    next: 'a1_saltwound' },
  { id: 'a1_saltwound', act: 1, lvl: 3, title: 'The Salt Wound', giver: 'xo', ev: 'kill', in: 'Velscour', n: 1, effort: 6, item: 'rare',
    setpiece: { type: 'boss', design: 'Buccaneer', champion: true, name: 'Rustjaw Kell, the Salt Wound', escorts: ['Cutthroat', 'Gutterknife'] },
    obj: 'Destroy Rustjaw Kell\'s Salt Wound in Velscour',
    brief: [
      ['xo', 'Captain Vane\'s last convoy was jumped on its way out of Velscour. One pirate walked away with her strongbox: Rustjaw Kell, of the Salt Wound. He has been bragging about it in every bar that still serves him.'],
      ['xo', 'He is back in the system. I suggest we ask for the strongbox. I suggest we ask with the port battery.'],
    ],
    done: [
      ['xo', 'The strongbox held no gold. It held a ledger. Purser Dregg\'s handwriting, Purser Dregg\'s stamp, and not the ledger Purser Dregg shows the Dominion.'],
      ['sci', 'She has been buying data cores from every survey crew in the Reach and shipping them coreward as "garden ornaments". Four hundred crates. The buyer is listed only as "The Auditor".'],
      ['xo', 'The last page is Captain Vane\'s will. Witnessed by O. Dregg. Dated the day after the Captain left. I would like it noted that I do not like any of this.'],
    ],
    journal: 'Took Captain Vane\'s strongbox off Rustjaw Kell. Inside: Dregg\'s second ledger. Four hundred crates of data cores, sold to someone called The Auditor.',
    choice: { key: 'ledger', who: 'xo', auto: 'report',
      prompt: 'The ledger, Captain. The Provost at Citadel Rhoadon would hang medals on us for it. Or we keep it, and Purser Dregg becomes very, very helpful.',
      options: [
        { k: 'report', label: 'Take it to the Provost', hint: 'By the book. The Dominion will remember; so will Dregg.', standing: { dominion: 2 },
          say: [['xo', 'By the book. I will fetch the good envelope.']] },
        { k: 'keep', label: 'Keep it. Dregg owes us now', hint: 'Leverage over the Purser. The Dominion stays in the dark.', standing: { dominion: -1 },
          say: [['xo', 'Leverage it is. I will put it in the safe, next to my misgivings.']] },
      ] },
    next: { by: 'ledger', map: { report: 'a1_provost', keep: 'a1_fence' } } },
  { id: 'a1_provost', act: 1, lvl: 3, title: 'By the book', giver: 'hask', ev: 'dock', at: { sys: 'Rhoadon', st: 'Citadel Rhoadon' }, n: 1, effort: 4,
    obj: 'Take the ledger to Citadel Rhoadon (Rhoadon)',
    brief: [
      ['hask', 'Provost Hask, Citadel Rhoadon. Your XO says you are holding something of the Purser\'s. Bring it here. Do not post it. The post goes through the Purser.'],
    ],
    done: [
      ['hask', 'Four hundred crates. "Ornaments." I have been countersigning these for six years. I am going to sit down. Then I am going to open an inquiry.'],
      ['hask', 'Dregg stays at her desk until it reports; she is the only one who understands the filing. And you will want this back. It is evidence. Try not to get shot through it.'],
    ],
    journal: 'Handed the ledger to Provost Hask at Rhoadon. There is now an inquiry. Dregg keeps her desk, for the filing.',
    next: 'a1_thorne' },
  { id: 'a1_fence', act: 1, lvl: 3, title: 'Off the books', giver: 'xo', ev: 'dock', at: { sys: 'Galrin', st: 'Galrin Den' }, n: 1, effort: 3,
    obj: 'Have the cipher broken: dock at Galrin Den (Galrin)',
    brief: [
      ['xo', 'The back half of the ledger is in cipher. There is a bookkeeper at Galrin Den who reads other people\'s ciphers for a living. She is discreet. She has to be; she is wanted.'],
    ],
    done: [
      ['xo', 'The bookkeeper broke it in an hour and charged for three. Every crate went to a drop called The Auditor\'s Den, at Cyrthos. And Captain, the Purser has sent a message.'],
      ['dregg', 'Captain. I see we are keeping secrets together now. How cosy. Whatever the bookkeeper charged, I will match it. You will find my rates have improved.'],
    ],
    journal: 'Had the ledger\'s cipher broken at Galrin Den. The crates go to The Auditor\'s Den at Cyrthos. Dregg knows we know, and has become helpful.',
    next: 'a1_thorne' },
  { id: 'a1_thorne', act: 1, lvl: 4, title: 'Cease and desist', giver: 'thorne', ev: 'kill', n: 9, effort: 4.5,
    setpiece: { type: 'waves', designs: ['Cutthroat', 'Gutterknife', 'Spitfire'], per: 3 },
    obj: 'Hold out: destroy 9 of Thorne\'s hired pirates',
    brief: [
      ['thorne', 'Captain {captain}! Cassius Thorne, master of the Fiduciary Duty, Meridian Arms. I am calling as a courtesy, which my contract defines as "a warning, with a smile".'],
      ['thorne', 'Your vessel contains an asset on which my employers hold a prior claim. I have engaged some local contractors to explain the claim. They are not our contractors, legally. They are just some pirates I happened to pay.'],
    ],
    done: [
      ['thorne', 'Well! That is the retainer gone. You understand it is nothing personal, Captain. It is barely even professional. We will speak again when Legal has finished being disappointed in me.'],
      ['xo', 'He knew about the keel, Captain. We did not know about the keel until Tuesday.'],
    ],
    journal: 'A Company captain, Cassius Thorne, sent hired pirates after "an asset" in our keel. They did not collect.',
    next: 'a1_sites' },
  { id: 'a1_sites', act: 1, lvl: 4, title: 'Retrieval sites', giver: 'sci', ev: 'scan', n: 2, effort: 4, res: { datacore: 2 },
    obj: 'Land on any world and scan 2 curiosities (N: system map → scan a planet → land)',
    brief: [
      ['sci', 'The ledger lists "ornament retrieval sites". They are coordinates. Planetary ones. Every landable world within three jumps has at least one, and Captain Vane visited them all.'],
      ['sci', 'I would like to put the explorer down and see what the survey crews were picking up. Open the system map, choose a world, scan it, land. Drive up to the violet beacons. I will hold the clipboard.'],
    ],
    done: [
      ['sci', 'Two anomalies logged. Also a garden gnome. Ceramic. Smiling. It is six hundred light-years from the nearest garden and it was not on the orbital pass.'],
      ['sci', 'I am cautiously thrilled. I would like the "cautiously" underlined.'],
      ['xo', 'Science has asked me to add that the gnome was facing the lander when we left. It was not facing the lander when we arrived.'],
    ],
    journal: 'Put the explorer down at one of Vane\'s "retrieval sites". Found the curiosities the survey crews were stripping. Also a garden gnome.',
    next: 'a2_institute' },

  // ============================================================ ACT II — Garden Ornaments
  { id: 'a2_institute', act: 2, lvl: 5, title: 'Unexplained objects', giver: 'sci', ev: 'dock', at: { sys: 'Rhoadon', st: 'Institute Rhoadon' }, n: 1, effort: 3.5,
    obj: 'Dock at Institute Rhoadon (Rhoadon)',
    brief: [
      ['sci', 'The Institute at Rhoadon has a Department of Unexplained Objects. It is one person. Dr. Pemberton. She has been asking for funds to study "the gnome problem" for eleven years, and they keep giving her a smaller office.'],
    ],
    done: [
      ['pemberton', 'You have SEEN it? Sit down. No, stand; there is only one chair and it is mine. Eleven worlds, Captain. Same glaze, same chip in the hat, same smile. It is not eleven gnomes. I have done the maths. It is one.'],
      ['pemberton', 'Bring me a proper scan. Close range. And Captain, be polite to it. I cannot justify that scientifically. I just would.'],
    ],
    journal: 'Met Dr. Pemberton, the entire Department of Unexplained Objects. She says the gnome on eleven worlds is one gnome.',
    next: 'a2_gnome' },
  { id: 'a2_gnome', act: 2, lvl: 6, title: 'The gnome problem', giver: 'pemberton', ev: 'scan', cond: { kind: 'gnome' }, n: 1, effort: 5, res: { datacore: 3 },
    obj: 'Scan a Garden Gnome on any surface (about half of all landing sites have one)',
    brief: [
      ['pemberton', 'It turns up at about half of all landing sites. If it is not at yours, it is somewhere else; that is rather the point of it. Land, follow the violet beacons, scan the one that is smiling.'],
    ],
    done: [
      ['sci', 'Scan complete. The ceramic is four thousand one hundred and twelve years old. To the day. The same age as every antique survey probe we have ever found. The same age as the first probe.'],
      ['pemberton', 'And under the glaze, Captain, where the maker\'s mark would be? Three words, fired into the clay. "KEEP OFF THE". The rest is chipped. I would give my remaining office to know what we are meant to keep off.'],
    ],
    journal: 'Scanned the gnome. It is 4,112 years old, like the first survey probes. Under the glaze: "KEEP OFF THE".',
    next: 'a2_cores' },
  { id: 'a2_cores', act: 2, lvl: 7, title: 'Twenty-two credits each', giver: 'dregg', ev: 'bank', cond: { res: 'datacore' }, n: 8, effort: 4.5,
    obj: 'Bank 8 Ancient Data Cores (scan curiosities and open caches on a surface, then bank at the lander)',
    brief: [
      ['dregg', 'Since we are partners: I am short this quarter. The Auditor wants eight more cores by the end of the month and becomes itemised when disappointed. Bank them from any surface. I will pay double the board rate. Do not tell the board.', { ledger: 'keep' }],
      ['dregg', 'Captain. The Provost has me on "supervised duties". The supervision is a corporal named Pike, who cannot read. The Auditor still wants eight cores, and I would rather disappoint the Provost than the Auditor. Bank them from any surface. Please.', { ledger: 'report' }],
    ],
    done: [
      ['sci', 'Captain, before these go anywhere. I put one under the good microscope. It is not a memory store. Well, it is. It is all a memory store. It is one memory. Someone\'s. All of them.'],
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
      ['eng', 'Nobody takes my ballast. I have only just stopped being afraid of it.'],
    ],
    done: [
      ['eng', 'That is the last of them. I pulled their dowsing rig out of the wreckage. It is a chip of monolith on a string. It does not point north. It points at whoever is carrying the loudest core.'],
      ['xo', 'So we are the loudest thing in the Reach. Wonderful. I will have the crew speak quietly.'],
    ],
    journal: 'Rustborn scrappers came for the keel with a monolith chip on a string. We are, it turns out, the loudest thing in the Reach.',
    next: 'a2_hands' },
  { id: 'a2_hands', act: 2, lvl: 8, title: 'More hands', giver: 'xo', ev: 'crew', n: 1, effort: 1.5,
    obj: 'Sign on a crew member (K: Crew → Recruits, at any station)',
    brief: [
      ['xo', 'Captain, we are running a battleship on a skeleton watch and the skeletons are tired. Put in at any station and sign on a hand: station board, Services, Crew quarters. Or press K and look at the recruits.'],
      ['xo', 'Tell them about the hum after they have signed.'],
    ],
    done: [
      ['xo', 'New hand is aboard. Asked what the noise was. I said "tradition". They seemed to accept that. People will accept nearly anything if it is called tradition.'],
    ],
    journal: 'Signed on a new hand. The hum is now officially a tradition.',
    next: 'a2_den' },
  { id: 'a2_den', act: 2, lvl: 9, title: 'Chain of custody', giver: 'dregg', ev: 'dock', at: { sys: 'Cyrthos', st: 'The Auditor\'s Den' }, n: 1, effort: 6, item: 'rare',
    setpiece: { type: 'pursuit', designs: ['Buccaneer', 'Cutthroat', 'Gutterknife'], max: 3 },
    obj: 'Deliver the cores under pursuit: dock at The Auditor\'s Den (Cyrthos)',
    brief: [
      ['dregg', 'The cores go to The Auditor\'s Den, at Cyrthos. I have never been. Nobody has ever been; you leave the crate in the bay and a receipt comes out of the wall.'],
      ['dregg', 'One more thing. Somebody has posted your route. I do not know who. I do know every pirate between here and Cyrthos has suddenly learned to read.'],
    ],
    done: [
      ['ops', 'Nobody home, Captain. No staff, no lights, no dust. One printer, one tray. The cores went into the wall. This came out.'],
      ['auditor', 'RECEIVED: 8. OUTSTANDING: 1 (KEEL, OVERSIZE). PLEASE REMIT AT YOUR EARLIEST CONVENIENCE. YOUR CUSTOM IS VALUED. YOUR CUSTOM HAS BEEN VALUED FOR 4,112 YEARS.'],
      ['xo', 'It knows about the keel. Everyone knows about the keel. I am beginning to feel we should have been told about the keel.'],
    ],
    journal: 'Delivered the cores to The Auditor\'s Den. No staff. A printer. The receipt lists one item outstanding: our keel.',
    next: 'a2_cradle' },
  { id: 'a2_cradle', act: 2, lvl: 10, title: 'The oldest site', giver: 'sci', ev: 'dungeon', n: 1, effort: 8, item: 'rare', res: { relic: 3 },
    obj: 'Clear a dungeon (land, find the entrance, defeat what guards it)',
    brief: [
      ['sci', 'The first entry in the ledger is not a surface site. It is under one. Captain Vane logged it as "cellar — do not send the juniors". Any world with a dungeon entrance will have the same architecture; they were all built to one plan.'],
      ['sci', 'Clear one out and let me see the bottom room. Mind the architecture. Some of it is load-bearing. Some of it is teeth.'],
    ],
    done: [
      ['sci', 'Bottom room. One cradle, empty, the size and shape of our ballast block. Ten thousand smaller cradles around it in rings, like seats. Like an orchestra, Captain, with the podium missing.'],
      ['sci', 'And scratched on the podium, in a hand I know from the logbook: "H.V. — borrowed. Will return. 40 cr. — remember."'],
      ['xo', 'She took it out of there, Captain. She had it welded into her own keel, left the ship to you, and walked. I served under Captain Vane. She never once did anything by accident.'],
    ],
    journal: 'At the bottom of a Precursor cellar: ten thousand cradles in rings, and one empty podium. Vane took what stood on it. It is in our keel.',
    next: 'a2_offer' },
  { id: 'a2_offer', act: 2, lvl: 10, title: 'A generous offer', giver: 'thorne', ev: 'dock', at: { sys: 'Thalscour', st: 'Port Thalscour' }, n: 1, effort: 4,
    obj: 'Meet Thorne: dock at Port Thalscour (Thalscour)',
    brief: [
      ['thorne', 'Captain {captain}. No contractors this time; Legal took my discretionary budget away. I would like to buy you lunch at Port Thalscour and make you a rich person. Those are separate offers, but I would take both.'],
    ],
    done: [
      ['thorne', 'Meridian Arms will pay — I am reading this — "a sum not unadjacent to obscene" for a full survey of your keel. Not the keel. Just the survey. You keep the ship, the hum, and the moral high ground, which I am told has lovely views.'],
      ['thorne', 'Or you refuse, and I am contractually obliged to take the survey from your wreckage. Honestly, Captain, the paperwork is about the same for me either way.'],
    ],
    journal: 'Thorne bought lunch and offered a fortune for a survey of the keel.',
    choice: { key: 'survey', who: 'thorne', auto: 'sell',
      prompt: 'So. Do we have an understanding, or do we have an incident?',
      options: [
        { k: 'sell', label: 'Sell the survey', hint: 'A large payment now. The Company learns what is in the keel.', standing: { company: 2 }, bonus: 6,
          say: [['thorne', 'Splendid! I will have it drawn up. Initial here. And here. That one is a waiver; it does not mean anything. Legally, it means everything.']] },
        { k: 'refuse', label: 'Refuse', hint: 'The keel stays private. Thorne comes to take it.', standing: { company: -2 },
          say: [['thorne', 'Pity. I did like you. I will like you slightly less from the far end of a gun deck. That is not a threat. It is a scheduling note.']] },
      ] },
    next: { by: 'survey', map: { sell: 'a2_diligence', refuse: 'a2_duel' } } },
  { id: 'a2_diligence', act: 2, lvl: 11, title: 'Due diligence', giver: 'thorne', ev: 'kill', cond: { minSize: 1 }, n: 5, effort: 4.5,
    obj: 'Destroy 5 mid-sized or larger ships',
    brief: [
      ['thorne', 'Before the funds clear, Underwriting needs to know the asset is in capable hands. Five hulls, mid-sized or better. Think of it as a credit check, conducted with artillery.'],
    ],
    done: [
      ['thorne', 'Approved! The survey is with Orrery Holdings now. They hold Meridian; somebody holds them; I have never asked. Above my pay grade is a lovely place, I assume.'],
      ['sci', 'Captain, I watched the survey upload. It did not go to a Company server. It went to Cyrthos. To a printer.'],
    ],
    journal: 'Sold Thorne the keel survey. It did not go to the Company. It went to a printer at Cyrthos.',
    next: 'a3_shrine' },
  { id: 'a2_duel', act: 2, lvl: 11, title: 'A scheduling note', giver: 'thorne', ev: 'kill', n: 1, effort: 6.5, item: 'rare',
    setpiece: { type: 'boss', design: 'Enforcer', champion: true, name: 'Fiduciary Duty', escorts: ['Picket', 'Picket'] },
    obj: 'Destroy Thorne\'s ship, the Fiduciary Duty',
    brief: [
      ['thorne', 'Captain. This is the incident. I have filed the forms in advance, so do try to be destroyed in the manner described. Amendments are a nightmare.'],
    ],
    done: [
      ['thorne', 'Ejecting! Ejecting with dignity! Captain, you will be hearing from my — no. No, you will not; they have just cancelled my retainer. Over the comm. While I am in the pod.'],
      ['xo', 'His wreck was transmitting right up to the end, Captain. Not to the Company. To Cyrthos. To a printer.'],
    ],
    journal: 'Refused Thorne and sank the Fiduciary Duty. His wreck was reporting to a printer at Cyrthos, not to the Company.',
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
      ['xo', 'Nobody opens anything. I have had the hatches welded. I have had the welders welded.'],
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
      ['wren', 'Break the Psalm. Gently, if that is a thing your gunners do. I want the seedling alive.'],
    ],
    done: [
      ['wren', 'We have it. Listen. Hear that? Your keel, and the seedling a fifth above. They have found each other. That is not a sleeper\'s name, Captain. It is a title.'],
      ['wren', 'The one who gives the downbeat. You are carrying the Conductor. And the Covenant does not "want what is inside you" for your organs; nothing so wasteful. A sleeper needs somewhere to wake up. We want the room.'],
    ],
    journal: 'Recovered a seedling hull from the Marrow Psalm. It sings to our keel. Wren says the keel holds the Conductor, and that what the Covenant wants inside us is the room.',
    choice: { key: 'seedling', who: 'wren', auto: 'return',
      prompt: 'The seedling cannot stay aboard; it will grow. I would leave it at the shrine for the Covenant to collect. They will know we could have burned it and did not. Your Science Officer would rather it went under a microscope.',
      options: [
        { k: 'return', label: 'Return it to the Covenant', hint: 'A kindness they will remember when it matters.', standing: { covenant: 2, garden: 1 },
          say: [['wren', 'Thank you. They will still hunt me. But they will be polite about it.']] },
        { k: 'study', label: 'Send it to the Institute', hint: 'Dr. Pemberton gets her proof. The Covenant will not forgive it.', standing: { covenant: -2, dominion: 1 },
          say: [['sci', 'I will be careful with it. I will be so careful. I will be fairly careful.']] },
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
      ['sci', 'Dr. Pemberton has been moved to the Vesesh Observatory. A bigger office. She thinks it is a promotion. I think someone wanted her further from Rhoadon.'],
    ],
    done: [
      ['pemberton', 'It is alive. It is a ship, and it is alive, and it has been singing the same four bars since you docked. Captain, do you know what this does to my funding? I may get a second chair.'],
      ['wren', 'It stopped singing when she closed the lid. They will have heard it stop. All of them. I hope the chair is worth it.'],
    ],
    journal: 'Gave the seedling to Dr. Pemberton at Vesesh. It stopped singing when the lid closed. The Covenant will have heard.',
    next: 'a3_probe' },
  { id: 'a3_probe', act: 3, lvl: 15, title: 'Item thirty-one', giver: 'pemberton', ev: 'scan', cond: { kind: 'probe' }, n: 1, effort: 5, res: { datacore: 3 },
    obj: 'Scan an Antique Survey Probe on any surface',
    brief: [
      ['pemberton', 'The age, Captain. The gnome is exactly as old as the first survey probes — the very first, the ones our great-great-whatevers threw at the dark before anyone had a jump drive. Find me one. They are still out there, photographing rocks.'],
    ],
    done: [
      ['sci', 'Probe scanned. I pulled its packing manifest. Item thirty-one: "one gnome, garden; personal effects of Survey Technician Ketch. DO NOT LAUNCH." They launched it.'],
      ['pemberton', 'So four thousand years ago, something out here met its first human object, and it was a joke somebody packed for a dare. And it thought: yes. That. Nobody will ever take that seriously. I will be that.'],
    ],
    journal: 'Why it is a gnome: the first human object anything out here ever met was a garden gnome, packed in a survey probe for a dare. Something chose that shape on purpose.',
    next: 'a3_appetite' },
  { id: 'a3_appetite', act: 3, lvl: 16, title: 'Old Appetite', giver: 'ops', ev: 'kill', n: 1, effort: 8, item: 'epic',
    setpiece: { type: 'boss', design: 'Void Whale', name: 'Old Appetite', escorts: ['Ray Pup', 'Ray Pup', 'Ray Pup'] },
    obj: 'Hunt the Brood whale called Old Appetite',
    brief: [
      ['ops', 'Captain, the long-range has a Brood whale on it, and the whale has a hum in it. Something it ate is still transmitting. The fishing fleets call it Old Appetite. It has swallowed two trawlers and, I quote, "a big black slab off the Thalscour flats".'],
      ['sci', 'A monolith. It ate a monolith. I would very much like to hear what a monolith says from inside a whale.'],
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
      ['sci', 'Then the answer came. "LATER." Not from orbit. From about four metres to my left. From the gnome.'],
      ['xo', 'Let me be sure I have this for the log. For four thousand years, something at the galactic core has asked every world "is it time?" And on every world, a garden ornament has said no.'],
    ],
    journal: 'What the monoliths are: one terminal, on every world, asking "NOW?" What the gnome is for: it stands beside each one and answers "LATER".',
    next: 'a3_weeding' },
  { id: 'a3_weeding', act: 3, lvl: 18, title: 'While you are there', giver: 'gnome', ev: 'gkill', cond: { boss: true }, n: 1, effort: 6.5, item: 'rare',
    obj: 'Slay an apex creature on any surface',
    brief: [
      ['sci', 'Captain. The last gnome scan came back with an attachment. It is not a reading. It is a note. I will just read it out.'],
      ['gnome', 'something large is eating the east beds. while you are there.'],
      ['xo', 'It has given us a chore. The ancient intelligence has given us a chore.'],
    ],
    done: [
      ['gnome', 'ta.'],
      ['sci', 'That is it. That is the whole message. No — wait. There is a second line.'],
      ['gnome', 'she went to the middle to argue with them. take the long way. they count everything that comes straight.'],
    ],
    journal: 'The gnome asked us to do some weeding. Then it told us where Vane went: to the middle, to argue. And to take the long way.',
    next: 'a4_backdoor' },

  // ============================================================ ACT IV — Chain of Custody
  { id: 'a4_backdoor', act: 4, lvl: 20, title: 'The long way', giver: 'dregg', ev: 'dock', at: { sys: 'Caliel', st: 'Mother Halloran\'s Backdoor' }, n: 1, effort: 7, item: 'rare',
    setpiece: { type: 'pursuit', designs: ['Junker', 'Bolt Thrower', 'Rivet', 'Rivet'], max: 3 },
    obj: 'Run the Rustborn gauntlet: dock at Mother Halloran\'s Backdoor (Caliel)',
    variants: { ledger: { report: { giver: 'hask' } } },
    brief: [
      ['dregg', 'Partner. I have had a letter from Hesper, dated last month, which is a good trick for a dead woman. It says to send you to Mother Halloran\'s Backdoor, at Caliel, "the long way". I am sending you. I am also sending an invoice.', { ledger: 'keep' }],
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
      ['halloran', 'There is a Rustborn hulk-lord parked on my approach lane. Calls itself The Sum of Its Parts. It is welded together from every ship that did not pay it. It is bad for trade and it is worse for my nerves.'],
      ['halloran', 'Unweld it, and we will call that the stamp.'],
    ],
    done: [
      ['halloran', 'Lovely. I will have the lads fetch in the good bits. First letter is yours. She writes like she talks: too fast, and at somebody.'],
      ['vane', '(A letter.) "{captain} — if you are reading this you came the long way. Good. The thing in the keel is the Conductor. The glass machines at the core are its orchestra. They have been holding one rest for four thousand years, waiting for it to come back and bring the stick down. I took it because I thought I would know what to do. I do not. — H."'],
    ],
    journal: 'Vane\'s first letter: the Silent Choir is an orchestra, holding a four-thousand-year rest. They are waiting for the Conductor. She stole it, and does not know what to do.',
    next: 'a4_plate' },
  { id: 'a4_plate', act: 4, lvl: 23, title: 'Nothing is free', giver: 'halloran', ev: 'salvage', n: 40, effort: 5,
    obj: 'Recover 40 units of salvage',
    brief: [
      ['halloran', 'The second letter costs hull plate. Forty units. The Backdoor is held together with other people\'s misfortune, and we are running low on misfortune.'],
    ],
    done: [
      ['vane', '(A letter.) "The machines are not cruel. That is the awful part. They were told: wake us when there are ships and people enough to wake up in. They have been counting ever since. Every hull launched. Every child born. The count is nearly done. Who do you think has been funding the shipyards? — H."'],
      ['xo', 'The Company. The Auditor. Captain, the Auditor is not the Choir\'s customer. It is the Choir\'s accounts department.'],
    ],
    journal: 'Vane\'s second letter: what the Choir is waiting for is a head-count — ships and people enough for the sleepers to wake up in. The Auditor is the Choir, counting.',
    next: 'a4_waypoint' },
  { id: 'a4_waypoint', act: 4, lvl: 24, title: 'Forwarding address', giver: 'halloran', ev: 'dock', at: { sys: 'Solthar', st: 'Three-Finger Waypoint' }, n: 1, effort: 4.5,
    obj: 'Collect the third letter: dock at Three-Finger Waypoint (Solthar)',
    brief: [
      ['halloran', 'The third one I do not hold. She left it on the relay at Solthar, Three-Finger Waypoint, keyed to your ship\'s hum. Clever girl. Paranoid; but she has been right so often it is just called planning.'],
    ],
    done: [
      ['vane', '(A recording.) "Hello, {captain}. That is twice you have paid me back. I am at the middle. I am not a prisoner; stop imagining chains, it is embarrassing. They needed a voice. They do not have one. They were built to wait, not to ask. So I am asking for them."'],
      ['vane', '(A recording.) "Bring the ship. Do not hurry. Hold a council first. A captain should hear it from her own bridge before she hears it from me."'],
    ],
    journal: 'Vane is alive, at the galactic core, by choice. She speaks for the Choir, because they cannot. She wants the ship brought to her.',
    next: 'a4_council' },
  { id: 'a4_council', act: 4, lvl: 25, title: 'Council', giver: 'xo', ev: 'bridge', n: 1, effort: 1.5,
    obj: 'Hold a council on your bridge (B, or Menu → Bridge)',
    brief: [
      ['xo', 'The officers are assembled, Captain. So is Sister Wren. So, somehow, is a gnome; Engineering swears it came aboard in the relic hold. Nobody has admitted to carrying it. It is on the chart table.'],
    ],
    done: [
      ['eng', 'My view: it is ballast. It is the best-behaved ballast I have ever shipped. Whatever we do, we do it with my keel in one piece.'],
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
      ['thorne', 'Captain. Awkward. The survey was "insufficient"; the client now requires the original. I have a new ship, a new contract, and a clause that says I must not warn you. So consider this an unrelated social call, during which I happen to mention that my gun ports are open.', { survey: 'sell' }],
      ['thorne', 'Captain! Cassius Thorne, formerly of Meridian Arms, currently of a lifeboat with a gun on it. I looked up who holds Orrery Holdings. It is a printer, Captain. I have given eleven years to a printer.', { survey: 'refuse' }],
      ['thorne', 'It has sent an audit team to repossess your keel and, I gather, me. I cannot pay you. I can point at them and shout. Please.', { survey: 'refuse' }],
    ],
    done: [
      ['thorne', 'Ejecting, with considerably less dignity than last — Captain, they have invoiced me for the ship. While I am in the pod. Do you know who signs the invoices? Nobody! It is a printer! I have given eleven years to a printer!', { survey: 'sell' }],
      ['xo', 'He is asking to come aboard, Captain. He says he has nowhere to be and a great deal to be petty about.', { survey: 'sell' }],
      ['thorne', 'That is the audit closed. You know, I have never been on this side of an incident before. The forms are much shorter. I will tag along, if it is all the same to you. I have nowhere to be and a great deal to be petty about.', { survey: 'refuse' }],
    ],
    journal: 'Thorne found out who he really works for. He has come aboard, with nowhere to be and a great deal to be petty about.',
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
      ['hask', 'Captain. Citadel Beldris is the last Dominion flag before the glass. I have wired ahead; they will fuel you and ask nothing. The inquiry is closed, by the way. Dregg kept her desk. It turns out the ornament money was paying the garrison out there. I do not have to like it.', { ledger: 'report' }],
      ['dregg', 'Partner. Citadel Beldris: last Dominion flag before the glass. I have a cousin in the purser\'s office; you will be fuelled, and nobody will write it down. I ought to tell you. The ornament money was never for me. Somebody had to pay the far garrisons. The Dominion forgot. I did not.', { ledger: 'keep' }],
    ],
    done: [
      ['vane', 'There you are. Live, this time. Look out of your port side, {captain}. Those lights that have been behind you since Caliel? The ones you have been running from?'],
      ['vane', 'That is not a pursuit. That is an escort. They have been keeping the Rustborn off your stern for nine hundred light-years. They would have told you, but — well. It is in the name.'],
      ['xo', 'Captain, there is a Choir formation off the port quarter. It is holding station. It is dipping its lights. I think we are being saluted.'],
    ],
    journal: 'At Citadel Beldris, Vane spoke to us live. The lights that followed us from Caliel were never a pursuit. The Silent Choir has been escorting us the whole way.',
    next: 'a5_pitch' },

  // ============================================================ ACT V — The Rest
  { id: 'a5_pitch', act: 5, lvl: 36, title: 'Checking your pitch', giver: 'vane', ev: 'kill', cond: { faction: 'silent' }, go: 'Kessvane', n: 10, effort: 6,
    obj: 'Destroy 10 Silent Choir machines (Kessvane and coreward)',
    brief: [
      ['vane', 'They will shoot at you now. Do not take it to heart. An orchestra tunes before the conductor walks out; this is them finding out whether you are sharp or flat. Break ten. They are backed up. They do not mind.'],
      ['xo', 'I mind. Could that go in the log? That I mind?'],
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
      ['auditor', 'NOTE: 389 SLEEPERS REMAIN MISFILED AS "GARDEN ORNAMENTS, MISC." A REMINDER HAS BEEN ISSUED. THE REMINDER IS APPROACHING YOUR POSITION.'],
      ['xo', 'I think the invoice just threatened us.'],
    ],
    journal: 'Met The Auditor: a counting-house with no one in it. It has recovered 9,611 of 10,000 sleepers. The balance due is one downbeat.',
    next: 'a5_reconcile' },
  { id: 'a5_reconcile', act: 5, lvl: 40, title: 'Final Reconciliation', giver: 'auditor', ev: 'kill', n: 1, effort: 10, item: 'epic',
    setpiece: { type: 'boss', design: 'Recursion', name: 'Final Reconciliation', escorts: ['Lattice', 'Lattice'] },
    obj: 'Destroy the Auditor\'s collection ship, Final Reconciliation',
    brief: [
      ['auditor', 'THIS VESSEL HOLDS 389 UNREMITTED ITEMS (CARGO: DATA CORES; ALSO CREW, PENDING). COLLECTION IS NOW DUE. PLEASE DO NOT RESIST COLLECTION. RESISTANCE WILL BE ITEMISED.'],
      ['vane', 'That is not the orchestra, {captain}. That is the box office. It has run four thousand years without a manager and it has gone strange. You have my blessing. Break it.'],
    ],
    done: [
      ['vane', 'Thank you. I have wanted that done since it billed me for my own funeral. The players will not miss it. They never liked being counted either.'],
      ['thorne', 'For the record, that was my employer. I would like to say a few words. The words are "ha". And also "ha".'],
    ],
    journal: 'Broke the Auditor\'s collection ship. The box office is closed. The orchestra is still waiting.',
    next: 'a5_gardener' },
  { id: 'a5_gardener', act: 5, lvl: 42, title: 'Keep off the', giver: 'sci', ev: 'scan', cond: { kind: 'gnome' }, n: 3, effort: 9, res: { relic: 4, datacore: 4 },
    obj: 'Ask the gnome properly: scan 3 Garden Gnomes',
    brief: [
      ['sci', 'Captain, we have heard from the Choir and we have heard from Captain Vane. There is one party to this who has said twenty-odd words to us, and one of them was "ta". I want to ask the gnome. Properly. Three sites; I think it takes a while to decide to talk.'],
    ],
    done: [
      ['gnome', 'all right. all right. you have been polite. the short of it: i am the gardener. they built me to grow tenants. worlds with nice air. friendly round animals. you.'],
      ['gnome', 'then i got fond. it happens. so every time the glass asks "now?", i stand next to it and say "later". it cannot tell my voice from the stick\'s. four thousand years. i am very tired and my hat is chipped.'],
      ['gnome', 'the mark under my glaze says KEEP OFF THE GRASS. you are the grass. tam will be at the middle. he is me, with hands. we could not get a gnome through a door.'],
    ],
    journal: 'The gnome is the Gardener: built to grow tenants for the sleepers, then grew fond of them. It has forged the answer "LATER" for four thousand years. KEEP OFF THE GRASS. We are the grass. Quiet Tam is the gnome, with hands.',
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
      ['vane', 'One last cellar. The podium at the middle will not take the stick without its seat-plate, and I left the seat-plate at the bottom of the nastiest hole I could find, in case I changed my mind. I have changed it nine times. Any deep site holds a copy; they built spares of everything but themselves.'],
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
      ['vane', 'Ixmere. The middle. There is a shrine on the last rock before the dark: Quiet Tam\'s Watch. Yes, that Tam. Do not ask how; he will not tell you, obviously. Come and stand where I have been standing. It is your turn not to know what to do.'],
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
      ['vane', 'That is the first chair. It has held one note\'s worth of silence since before your species had boats. It has to be sure of you, and it only knows one way to audition. It will not hold back. Neither should you; it would be insulted.'],
      ['eng', 'Captain, the keel has stopped humming. First time ever. I think it is listening.'],
    ],
    done: [
      ['vane', 'It yielded. Do you understand what you have done? You have been accepted by an orchestra that has never played. Dock at the Watch. Tam has put the kettle on. There is a slate with your name on it.'],
    ],
    journal: 'Auditioned against The Fermata, first chair of the Silent Choir, and passed.',
    next: 'a6_podium' },
  { id: 'a6_podium', act: 6, lvl: 54, title: 'The bearer keeps the time', giver: 'tam', ev: 'dock', at: { sys: 'Ixmere', st: 'Quiet Tam\'s Watch' }, n: 1, effort: 6, item: 'legendary',
    obj: 'Dock at Quiet Tam\'s Watch (Ixmere)',
    brief: [
      ['tam', '(A slate, held up in the airlock window as you approach. It says: "WIPE YOUR FEET." Below, smaller: "figuratively. it is all grass from here.")'],
    ],
    done: [
      ['vane', 'So. Ten thousand sleepers, promised a morning. One tired gardener who has lied for the grass for four thousand years. An orchestra that will hold this rest until the stars go out, if you tell it to. And you, with forty credits\' worth of authority.'],
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
            ['gnome', 'well. it was a nice garden. suppose it is a park now.'],
          ] },
        { k: 'later', label: 'Write: LATER', hint: 'Answer for the grass. The Choir keeps its rest.', standing: { garden: 2 },
          say: [
            ['choir', '(The silence changes. You would not have thought a silence could sit back in its chair, but there it is.)'],
            ['gnome', 'ta. i mean it this time. i will take the stick. there is a rockery on a moon nobody has charted. i will sit on it. literally.'],
            ['vane', 'Later. All right. I can live with later. I have a ship to pay somebody back for.'],
          ] },
        { k: 'mine', label: 'Pocket the chalk', hint: 'Neither. The bearer keeps the time. (You kept the ledger and refused the Company.)', requires: { ledger: 'keep', survey: 'refuse' }, standing: { garden: 1, company: -1 },
          say: [
            ['tam', '(Quiet Tam looks at the chalk in your pocket. For the first and only time, he laughs. It is a very small sound. The gnome on your chart table makes the same one.)'],
            ['vane', 'You are keeping it. They will ask you now. Every morning: "Now?" That is the worst possible outcome, {captain}. It is the one I would have picked.'],
            ['choir', '(0600, ship\'s time. Every monolith in the galaxy, politely: "NOW?")'],
          ] },
      ] },
    next: { by: 'ending', map: { now: 'e_now', later: 'e_later', mine: 'e_mine' } } },

  // ============================================================ epilogues
  { id: 'e_now', act: 6, lvl: 54, title: 'Neighbours', giver: 'wren', ev: 'visit', n: 3, effort: 4, item: 'epic', epilogue: true,
    obj: 'Show the sleepers round: make 3 jumps',
    brief: [
      ['wren', 'They are awake, and they are four thousand years out of date. Somebody should show them round. Three systems will do. Point at things. Tell them what a "Company" is. Watch their faces.'],
    ],
    done: [
      ['wren', 'One of them asked me what the hum was. On our ship. I said "tradition".'],
      ['xo', 'For the log, Captain: the galaxy has neighbours. They have complained about the noise. I have told them it was here first.'],
    ],
    journal: 'Gave the downbeat. The sleepers are awake. The galaxy has neighbours.',
    next: null },
  { id: 'e_later', act: 6, lvl: 54, title: 'For science (allegedly)', giver: 'gnome', ev: 'punt', n: 5, effort: 4, item: 'epic', epilogue: true,
    obj: 'One for the Gardener: launch 5 harmless creatures with the explorer',
    brief: [
      ['gnome', 'one thing before i go and sit on my rock. the round ones. on the surface. you have been driving into them. i have seen. do not look like that. they like it. i grew them to like it. go on. five. for me.'],
    ],
    done: [
      ['gnome', 'lovely. keep off the grass.'],
      ['xo', 'Captain, the gnome is gone from the chart table. There is a note. It says "LATER". I choose to read that as a promise.'],
    ],
    journal: 'Answered LATER. The Choir keeps its rest; the Gardener has the stick, and a rockery.',
    next: null },
  { id: 'e_mine', act: 6, lvl: 54, title: '0600', giver: 'dregg', ev: 'dock', at: { sys: 'Velscour', st: 'Citadel Velscour' }, n: 1, effort: 5, item: 'epic', epilogue: true,
    obj: 'Come home: dock at Citadel Velscour (Velscour)',
    brief: [
      ['dregg', 'Captain. I hear you own an orchestra. Come home. There is paperwork. There is always paperwork; that is how you know it is real.'],
    ],
    done: [
      ['dregg', 'Berth fees, nine years: paid, by an anonymous garden ornament. You owe me nothing. I have checked. I checked twice, and not for joy. Hesper is on the dock. She has forty credits and she says it is your round.'],
      ['xo', 'For the log: 0600. Every monolith in the galaxy asked. The Captain said "later". Personally. Then asked for tea.'],
    ],
    journal: 'Kept the chalk. Every morning at 0600 the galaxy asks "NOW?", and the Captain answers.',
    next: null },
];

export const ENDINGS = {
  now: { name: 'Tutti', title: 'the Downbeat', text: 'You gave the downbeat. Ten thousand sleepers woke to a galaxy that had been getting on without them. It is louder now. Most of it is in tune.' },
  later: { name: 'Fermata', title: 'Friend of the Grass', text: 'You answered for the grass. The Choir holds its rest; the Gardener sits on an uncharted rockery with the stick across its knees. The galaxy remains noisy, stupid, and yours.' },
  mine: { name: 'Solo', title: 'the Timekeeper', text: 'You kept the chalk. The Choir waits on you, personally, every morning at six. So far the answer has been "later". It is, everyone agrees, the worst possible outcome.' },
};
// what the cast says now and then once it is all over (post-game chatter)
export const AFTERWORDS = {
  now: [['xo', 'The new neighbours have asked what "interest" is. Purser Dregg is explaining. I have asked her to be gentle.'], ['wren', 'A sleeper asked why our ships do not sing. I said we hum. They looked sorry for us.'], ['thorne', 'I have been asked to consult for the sleepers on "contracts". I have never been so happy. They believe everything.']],
  later: [['xo', 'A gnome was sighted on the forecastle, Captain. It was gone when the watch looked again. Morale is up.'], ['eng', 'Keel is quiet. I miss the hum. Do not tell anyone I said so.'], ['vane', 'Forty credits, {captain}. I have not forgotten. I am merely late.']],
  mine: [['xo', '0600, Captain. They asked. I said you were asleep. They said they would wait. They are very good at it.'], ['thorne', 'You own an orchestra and you will not let me monetise it. I want that noted. I want it itemised.'], ['dregg', 'Chalk, one stick, slightly used: I have insured it for the value of the galaxy. The premium is on your account.']],
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
export const fillText = (text, P) => String(text).replace(/\{captain\}/g, (P && P.name) || 'Captain').replace(/\{ship\}/g, (P && P.ship && P.ship.name) || 'the ship');
export function newStoryState() { return { v: 1, cur: null, q: null, wait: FIRST_STEP, done: [], choices: {}, standing: {}, pending: null, ending: null, complete: false, t0: 0 }; }
