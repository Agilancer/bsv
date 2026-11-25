// The autoplay captain and the quest boards.
//   acceptScore(q, env)   how much the autopilot wants a job (pure: tests call it)
//   autoAccept(game, st)  while docked: drop stale jobs, take the best of the board
//   questGoal(ap)         a long-horizon goal: put in at a board when the log runs low, and run
//                         cheap errands (courier / scout). Every phase is on a clock: it gives up
//                         rather than hang. The live story step (quests/story.js) is run as an errand
//                         too when its destination is cheap and safe to reach; a step the autopilot
//                         cannot do is left alone for ten minutes and then tried again.
import * as THREE from 'three/webgpu';
import { MAX_ACTIVE } from './data.js';
import { galaxy, systemDetail, systemFactions } from '../galaxy.js';
import { SIZES } from '../data/enemies.js';
import { RARITY } from '../data/items.js';
import { repairCost } from '../station/services.js';
import { route, jumpCost } from '../nav/index.js';

// env: { level, system, danger, factions: {key: share}, ptypes: Set, planet: bool,
//        hops(sysId) -> jumps or null, sysDanger(sysId) }
// >= 1 means "take it"; higher is better. The captain prefers work its normal play completes.
export function acceptScore(q, env) {
  const c = q.cond || {};
  const reach = (sys) => {
    if (sys === env.system) return 0;
    const h = env.hops(sys);
    return h == null || h > 3 || env.sysDanger(sys) > env.level + 1 ? null : h;
  };
  switch (q.ev) {
    case 'kill': {
      if (c.system != null && c.system !== env.system) {
        // only worth it where the captain would be heading anyway (a harder system it can handle)
        const h = reach(c.system);
        return h != null && h <= 2 && env.sysDanger(c.system) >= env.danger ? 1.2 : 0;
      }
      let s = 3;
      if (c.faction === 'rival') return 0;   // the Companies are neutral until provoked: the autopilot never starts that fight
      if (c.faction != null) { const share = env.factions[c.faction] || 0; if (share < 0.12) return 0; s = 1.6 + share * 2; }
      if (c.boss) return env.danger >= 4 ? 1.1 : 0;
      if (c.elite) s = Math.min(s, 2);
      if (c.size === 0) s = Math.min(s, 2.5);
      if (c.minSize != null) { if (SIZES[c.minSize].minDanger > env.danger) return 0; s = Math.min(s, 1.8); }
      return s;
    }
    case 'collect': return c.rarity >= 3 ? 1.4 : c.rarity === 2 ? 2.4 : 3;
    case 'sell': return c.rarity >= 2 ? 1.5 : 2.5;
    case 'earn': return 2.8;
    case 'salvage': return 2.8;
    case 'craft': return 2.2;
    case 'visit': {
      if (c.system == null) return 1.5;
      const h = reach(c.system);
      return h == null || h === 0 ? 0 : 1.9 - 0.2 * h;
    }
    case 'dock': {
      if (c.station == null) return 1.6;
      const h = reach(c.system);
      return h == null ? 0 : 2.3 - 0.3 * h;
    }
    // the explorer's work: only if the captain lands at all
    case 'bank': return !env.planet ? 0 : c.res ? 1.6 : 2.2;
    case 'scan': return env.planet ? 2 : 0;
    case 'gkill': return !env.planet ? 0 : c.boss ? 1 : 2.2;
    case 'dungeon': return env.planet ? 1 : 0;
    case 'land': return !env.planet ? 0 : c.ptype ? (env.ptypes.has(c.ptype) ? 1.4 : 0) : 2;
    case 'punt': return env.planet ? 1.1 : 0;
    default: return 0;
  }
}
const isPlanetQuest = (q) => q.ev === 'bank' || q.ev === 'scan' || q.ev === 'gkill' || q.ev === 'dungeon' || q.ev === 'land' || q.ev === 'punt';
const isErrand = (q) => !!q.travel && (q.ev === 'dock' || q.ev === 'visit');

function envFor(game) {
  const P = game.data, sys = game.sector.sys, S = galaxy().systems;
  const fw = systemFactions(sys), total = fw.reduce((a, [, w]) => a + w, 0) || 1;
  const factions = {};
  for (const [k, w] of fw) factions[k] = w / total;
  const ptypes = new Set(systemDetail(sys).planets.filter((p) => p.landable).map((p) => p.type));
  const mode = (P.autoplay && P.autoplay.mode) || 'full';
  return {
    level: P.level, system: sys.id, danger: sys.danger, factions, ptypes,
    planet: !!game.planetAuto && mode === 'full',
    hops: (id) => { const r = route(P.system, id, P); return r ? r.length - 1 : null; },
    sysDanger: (id) => S[id].danger,
  };
}

const STALE = 1500;   // seconds of playtime without progress before the autopilot gives a job back
export function autoAccept(game, st) {
  const Q = game.quests, P = game.data;
  if (!Q || !st) return 0;
  const env = envFor(game), now = P.playtime || 0;
  let dropped = 0;
  for (const q of Q.active().slice()) if (now - (q.tp || q.t0 || now) > STALE && !(q.chain && q.chain.i > 1)) { Q.abandon(q.id); dropped++; }
  const ranked = Q.offers(st).map((q) => ({ q, s: acceptScore(q, env) })).filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s || b.q.reward.credits - a.q.reward.credits);
  let taken = 0;
  for (const { q } of ranked) {
    const A = Q.active();
    if (A.length >= MAX_ACTIVE) break;
    if (isErrand(q) && A.filter(isErrand).length >= 2) continue;        // errands cost travel: two at a time
    if (isPlanetQuest(q) && A.filter(isPlanetQuest).length >= 3) continue;
    if (Q.accept(q, true)) taken++;
  }
  if ((taken || dropped) && game.autoplay) game.autoplay.log(`Quest board: took ${taken} job${taken === 1 ? '' : 's'}${dropped ? `, handed back ${dropped} stale` : ''} (${Q.active().length}/${MAX_ACTIVE} active)`);
  return taken;
}

const _off = new THREE.Vector3(500, 0, 400);
const ERRAND_LIMIT = 170;      // seconds one errand may run (the soak gate fails a goal at 240)
const ERRAND_REST = 300;       // playtime between errands
const BOARD_REST = 420;        // playtime between unprompted board visits
const STORY_REST = 120;        // playtime between story errands
const STORY_RETRY = 600;       // playtime before a story errand that failed is tried again
export function questGoal(ap) {
  const g = ap.game;
  let job = null, phase = null, t = 0, total = 0, fired = false, tries = 0;
  let restUntil = 0, boardAt = -1e9, storyRetry = 0, storyAt = -1e9;
  const skip = new Set();
  const playtime = () => g.data.playtime || 0;
  const holdMode = () => ((g.data.autoplay && g.data.autoplay.mode) || 'full') === 'hold';

  // the cheapest errand on the books that is worth the trip right now
  function pickErrand() {
    const P = g.data, Q = g.quests, S = galaxy().systems, here = g.sector.sys;
    const sq = storyErrand();
    if (sq) return sq;
    if (playtime() < restUntil) return null;
    let best = null, bh = Infinity;
    for (const q of Q.active()) {
      if (!isErrand(q) || skip.has(q.id)) continue;
      const to = q.travel.sys;
      let hops = 0;
      if (to !== P.system) {
        if (holdMode() || S[to].danger > P.level + 1 || S[to].danger < here.danger - 4) continue;
        const r = route(P.system, to, P);
        if (!r || r.length - 1 > 3 || jumpCost(r, P) > P.credits * 0.3) continue;
        hops = r.length - 1;
      } else if (q.ev === 'visit') continue;   // already here: it completes on a later arrival
      if (hops < bh) { bh = hops; best = q; }
    }
    return best;
  }
  // the story step, when following it means a trip the captain can afford and survive
  function storyErrand() {
    const P = g.data, Q = g.quests, S = galaxy().systems;
    const q = Q.story && Q.story.quest();
    if (!q || !q.travel || playtime() < storyRetry || playtime() - storyAt < STORY_REST) return null;
    const to = q.travel.sys;
    if (to === P.system) return q.ev === 'dock' && q.travel.st != null ? q : null;   // already here: only a berth is left to reach
    if (holdMode() || S[to].danger > P.level + 2) return null;
    const r = route(P.system, to, P);
    if (!r || r.length - 1 > 8 || jumpCost(r, P) > P.credits * 0.5) return null;
    return q;
  }
  const giveUp = (j) => { if (j.story) storyRetry = playtime() + STORY_RETRY; else if (j.id) skip.add(j.id); };
  const live = (id) => g.quests.active().some((q) => q.id === id) || !!(g.quests.story && g.quests.story.quest() && g.quests.story.quest().id === id);
  const wantBoard = () => g.stations && g.stations.length && g.quests.active().length <= MAX_ACTIVE - 4 && playtime() - boardAt > BOARD_REST;
  const finish = () => { if (g.docked) g.undock(); job = null; phase = null; restUntil = playtime() + ERRAND_REST; return true; };   // never leave the ship parked

  return {
    name: 'Quest board & errands',
    score() {
      const s = g.player, P = g.data;
      if (!s || !g.quests || !g.sector) return 0;
      if (job) return 4.5;
      if (s.hull / s.maxHull < 0.5) return 0;
      // a station across the system is not started for while the drive is still cooling (the autopilot's drive is for
      // real distances, never back to back): there is work nearer by, and the errand keeps
      const reach = (st) => !st || !g.autoReach || g.autoReach(st.position);
      if (wantBoard()) { const n = g.nearestStation(); return n && !reach(n.station) ? 0 : 1.3; }
      const q = pickErrand();
      if (!q) return 0;
      if (q.travel && q.travel.sys === P.system && q.travel.st != null && !reach(g.stations[q.travel.st])) return 0;
      return 1.2;
    },
    update(dt) {
      const s = g.player, P = g.data, Q = g.quests;
      if (!job) {
        t = 0; total = 0; fired = false; tries = 0;
        if (wantBoard()) {
          const n = g.nearestStation();
          if (!n) return finish();
          job = { board: true, sys: P.system, st: g.stations.indexOf(n.station) };
          phase = 'dock'; boardAt = playtime();
          ap.log(`Putting in at ${n.station.name} for work`);
        } else {
          const q = pickErrand();
          if (!q) return finish();
          job = { id: q.id, sys: q.travel.sys, st: q.ev === 'dock' ? q.travel.st : null, story: !!q.story };
          if (job.story) storyAt = playtime();
          phase = P.system === job.sys ? 'dock' : 'jump';
          ap.log(`${job.story ? 'Story' : 'Errand'}: ${q.obj}`);
        }
      }
      t += dt; total += dt;
      if (total > ERRAND_LIMIT) { giveUp(job); if (g.docked) g.undock(); ap.log(job.board ? 'Gave up on the quest board (taking too long)' : 'Errand abandoned (taking too long)'); return finish(); }
      // the quest went away under us (abandoned, or finished some other way): stop travelling for it
      // (never while docked or on approach: docking is what completes a courier job, and we still have to leave)
      if (job.id && !g.docked && !g.dockingTarget && (phase === 'jump' || phase === 'dock') && !live(job.id) && !g.isWarping()) return finish();

      if (phase === 'jump') {
        if (P.system === job.sys) { if (job.st == null) return finish(); phase = 'dock'; t = 0; return false; }
        if (!g.isWarping()) {   // again if a spool was broken off
          fired = g.jumpTo(job.sys);
          if (!fired && ++tries > 20) { giveUp(job); return finish(); }   // ~5 s of refusals (combat, fuel, no route)
        }
        return false;
      }
      if (phase === 'dock') {
        const st = g.stations[job.st];
        if (!st) { giveUp(job); return finish(); }
        if (g.docked === st) { phase = 'services'; t = 0; return false; }
        if (g.docked) { g.undock(); return false; }
        const d = st.position.distanceTo(s.position);
        if (g.isWarping()) return false;
        if (d > 2600 && g.autoWarp(st.position.clone().add(_off))) return false;
        if (d <= 900 && !g.dockingTarget) g.modes.dock();   // this close, the nearest station is ours
        else if (!g.dockingTarget) s.steerTo(st.position, 80, 1);
        return false;
      }
      if (phase === 'services') {
        if (!g.docked) { phase = 'dock'; t = 0; return false; }
        if (t < 1.5) return false;
        // a light turn-around: clear the hold, patch the hull, read the board
        const st = g.docked;
        g.equipBest();
        if (g.sellNonUpgrades) g.sellNonUpgrades();
        for (const it of P.inventory.slice()) if (it.slot !== 'blueprint' && RARITY[it.rarity].i < 2) g.sellItem(it, true);
        const rc = repairCost(s, st.kind); if (rc > 0 && P.credits >= rc) { P.credits -= rc; s.hull = s.maxHull; }
        Q.autoAccept(st);
        boardAt = playtime();
        phase = 'leave'; t = 0;
        return false;
      }
      if (phase === 'leave') { if (t > 1) { if (g.docked) g.undock(); return finish(); } return false; }
      return finish();
    },
  };
}
