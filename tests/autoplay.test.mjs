// The autoplay captain's loot sweep (src/game/Autoplay.js decide / pickDrop): every drop in reach is fetched, junk
// included, ahead of errands and between enemy groups; never with the helm taken (drive, docking) or mid-fight.
import './support/three.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three/webgpu');
const { Autoplay } = await import('../src/game/Autoplay.js');
const { makeItem, BASES } = await import('../src/game/data/items.js');

const V = (x, z) => new THREE.Vector3(x, 0, z);
const junk = () => makeItem(Object.keys(BASES)[0], 10, 'common');
const pod = (x, z, t = 5) => ({ type: 'item', item: junk(), pos: V(x, z), vel: V(0, 0), t });
const mote = (x, z) => ({ type: 'credits', amount: 40, pos: V(x, z), vel: V(0, 0), t: 5 });
const foe = (x, z, firing, s) => ({ alive: true, position: V(x, z), velocity: V(0, 0), maxSpeed: 60, target: firing ? s : null, lastFire: firing ? 99 : -100, hull: 1000, maxHull: 1000, maxShield: 500, shieldTotal: () => 500, elite: 0 });

function rig({ drops = [], foes = [], mode, goal, full = false } = {}) {
  const s = { alive: true, position: V(0, 0), heading: 0, maxSpeed: 80, hull: 1000, maxHull: 1000, maxShield: 500, shieldTotal: () => 500, weapons: [], dims: { L: 60, W: 12 }, target: null };
  const engine = { time: 100 };
  const world = { ships: [s], hostile: (a, b) => b !== s, loot: { drops }, warnings: [], engine };
  const logs = [];
  const g = {
    player: s, world, engine, mode: 'space', playtime: 0, docked: null, dockingTarget: null, warping: false,
    isWarping: () => g.warping,
    data: { autoplay: mode ? { mode } : undefined, inventory: [], level: 10 },
    canCollect: (d) => d.type !== 'item' || !full,
    ui: { chat: (who, c, m) => logs.push(m) },
    sector: { director: null, detail: { zones: [{ x: 0, z: 0 }] } },
    autoplayGoals: goal ? [() => goal] : [],
  };
  for (const f of foes) world.ships.push(typeof f === 'function' ? f(s) : f);
  const ap = new Autoplay(g);
  return { ap, g, s, logs };
}

test('a lone junk pod well past the old 1600 reach is fetched; a far lone one is not, a far cluster is', () => {
  let r = rig({ drops: [pod(0, 2400)] });
  r.ap.decide();
  assert.equal(r.ap.state, 'loot');
  r = rig({ drops: [pod(0, 6500)] });
  r.ap.decide();
  assert.equal(r.ap.state, 'patrol', 'one common pod is not worth 50 s of sailing');
  r = rig({ drops: [pod(0, 5000), pod(60, 5000), pod(-60, 5020), mote(30, 4980), mote(0, 5050)] });
  r.ap.decide();
  assert.equal(r.ap.state, 'loot', 'a fight\'s worth of drops in one place is');
});

test('nearest first, the hold full skips pods but not motes, and nothing that will drift off first', () => {
  const near = pod(0, 300), far = pod(0, 1500);
  let r = rig({ drops: [far, near] });
  r.ap.decide();
  assert.equal(r.ap.drop, near);
  const m = mote(0, 900);
  r = rig({ drops: [pod(0, 300), m], full: true });
  r.ap.decide();
  assert.equal(r.ap.drop, m);
  r = rig({ drops: [pod(0, 2000, 236)] });
  r.ap.decide();
  assert.equal(r.ap.state, 'patrol');
});

test('an errand waits for the cargo, then resumes without a second log line', () => {
  let ran = 0;
  const goal = { name: 'Quest board & errands', score: () => 1.2, update: () => { ran++; return false; } };
  const d = pod(0, 800);
  const { ap, g, logs } = rig({ drops: [d], goal });
  ap.decide();
  assert.equal(ap.state, 'loot');
  assert.equal(ap.paused, goal);
  g.world.loot.drops.length = 0;   // aboard
  ap.decide();
  assert.equal(ap.state, 'goal');
  assert.equal(ap.goal, goal);
  assert.equal(logs.filter((m) => m.startsWith('Objective')).length, 0, 'the errand was never logged as new');
  g.world.loot.drops.push(pod(0, 500));
  ap.decide();
  assert.equal(ap.state, 'loot', 'a goal under way stops for new cargo too');
  g.world.loot.drops.length = 0;
  ap.decide();
  assert.equal(ap.goal, goal);
  assert.equal(logs.filter((m) => m.startsWith('Objective')).length, 0);
  assert.equal(ran, 0);
});

test('never with the helm taken: on the drive, docking, docked or off in another mode', () => {
  const goal = { name: 'Resupply at station', score: () => 5, update: () => false };
  for (const set of [(g) => { g.warping = true; }, (g) => { g.dockingTarget = {}; }, (g) => { g.docked = {}; }, (g) => { g.mode = 'planet'; }]) {
    const { ap, g } = rig({ drops: [pod(0, 400)], goal });
    set(g);
    ap.decide();
    assert.equal(ap.state, 'goal');
  }
});

test('between enemy groups: close drops first; anything shooting, anything close, or a fight-only captain: fight', () => {
  let r = rig({ drops: [pod(0, 300)], foes: [foe(0, 2000, false)] });
  r.ap.decide();
  assert.equal(r.ap.state, 'loot', 'an idle group 2000 out waits while the pod is picked up');
  r = rig({ drops: [pod(0, 1800)], foes: [foe(0, -2000, false)] });
  r.ap.decide();
  assert.equal(r.ap.state, 'combat', 'only drops close by with hostiles about');
  r = rig({ drops: [pod(0, 300)], foes: [(s) => foe(0, 1400, true, s)] });
  r.ap.decide();
  assert.equal(r.ap.state, 'combat', 'a ship firing on the captain comes first');
  r = rig({ drops: [pod(0, 300)], foes: [foe(0, 2000, false)] });
  r.s.lastHit = 98;
  r.ap.decide();
  assert.equal(r.ap.state, 'combat', 'under fire from long range');
  r = rig({ drops: [pod(0, 300)], foes: [foe(0, 1000, false)] });
  r.ap.decide();
  assert.equal(r.ap.state, 'combat', 'a hostile inside 1200');
  r = rig({ drops: [pod(0, 300)], foes: [foe(0, 2000, false)], mode: 'combat' });
  r.ap.decide();
  assert.equal(r.ap.state, 'combat', 'fight only: the fight first');
});
