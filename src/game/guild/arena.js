// Instanced PvP: Skirmish (3v3 deathmatch), Relay Capture (5v5, three points), Convoy (4v4 raid or
// escort) and the 1v1 Duel ladder. An instance is a sealed arena far outside the system (the same
// space scene: the captain is moved there and back); while it runs, the system's director and
// population are paused and warp/jump are locked. Teammates and opponents are NPC captains in a
// hull of your tier at your ship's rank (bots.js), scaled by the rating you are matched at.
import * as THREE from 'three/webgpu';
import { RNG, rng as R, clamp } from '../../engine/rng.js';
import { CHASSIS_BY_ID } from '../data/chassis.js';
import { PLAYER_NAMES } from '../data/names.js';
import * as D from './data.js';
import { spawnBot, PVP_TEAM, ringMesh, beaconMesh, tint, anchor } from './bots.js';

const ARENAS = {
  skirmish: { name: 'The Cinder Ring', r: 1500, x: 70000, z: 70000 },
  capture: { name: 'Relay Triad', r: 1800, x: 76000, z: 70000 },
  convoy: { name: "Smuggler's Run", r: 2100, x: 70000, z: 77000 },
  duel: { name: 'The Glass Circle', r: 1150, x: 76000, z: 77000 },
};
const YARDS = ['velscour', 'aurelian', 'tidewright', 'ironhold', 'corsair'];
const COUNTDOWN = 4;
const _v = new THREE.Vector3();

export function installArena(game, G) {
  const A = G.arena = { match: null, last: null, arenas: ARENAS };
  const sideColor = (side) => (side === 0 ? '#58c8ff' : '#ff5a8a');

  A.blocked = () => {
    const s = game.player;
    if (!s || !s.alive) return 'No ship under you';
    if (A.match) return 'Already in a match';
    if (game.mode !== 'space') return 'Return to space first';
    if (game.docked) return 'Undock first';
    if (game.isWarping && game.isWarping()) return 'The drive is spooling';
    for (const o of game.world.ships) if (o.alive && game.world.hostile(s, o) && o.position.distanceToSquared(s.position) < 1200 * 1200) return 'Cannot queue in combat';
    return null;
  };

  function spawnAt(M, side, i, n) {
    const a = M.arena, sx = M.key === 'duel' ? 600 : M.key === 'convoy' ? 0 : a.r * 0.6;
    const spread = n > 1 ? (i - (n - 1) / 2) * 190 : 0;
    if (M.key === 'convoy') {
      // escorts sail with the freighters; raiders wait on both flanks of the lane
      const esc = side === M.convoy.side, dir = M.convoy.side === 0 ? 1 : -1;
      return esc ? _v.set(a.x - dir * (a.r * 0.72) + spread * 0.4, 0, a.z + (i % 2 ? 260 : -260)).clone() : _v.set(a.x + dir * 250 + spread * 0.5, 0, a.z + (i % 2 ? 1 : -1) * a.r * 0.55).clone();
    }
    return new THREE.Vector3(a.x + (side === 0 ? -sx : sx), 0, a.z + spread);
  }
  function spawnRec(M, rec) {
    const pos = spawnAt(M, rec.side, rec.i, rec.n), a = M.arena;
    const s = spawnBot(game, { name: rec.name, guild: rec.guild, level: M.level, yard: rec.yard, tier: M.tier, team: rec.side === 0 ? 1 : PVP_TEAM, pos, heading: Math.atan2(a.x - pos.x, a.z - pos.z), seed: rec.seed, rarity: rec.power.rarity, dmg: 1, contract: rec.contract, talents: true, aggro: 0, side: rec.side });
    s.ownGuild = rec.own;
    s.invuln = M.phase !== 'live';
    rec.ship = s; rec.rt = 0;
    if (M.phase === 'live') { arm(M, rec); game.world.fx.column(pos, rec.side === 0 ? 0x58c8ff : 0xff5a8a, 140, 30); }
    return s;
  }
  // give a bot its job for the mode
  function arm(M, rec) {
    const ai = rec.ship.ai;
    ai.aggro = 6000; ai.follow = null;
    if (M.key === 'capture') { ai.aggro = 750; ai.follow = M.points[rec.i % 3].hold; }
    if (M.key === 'convoy' && rec.side === M.convoy.side) { ai.aggro = 900; ai.follow = M.convoy.ships.find((f, k) => f.alive && k >= rec.i % 3) || M.convoy.ships.find((f) => f.alive) || null; }
  }

  A.start = (key, opts = {}) => {
    const mode = D.MODES[key], why = A.blocked();
    if (!mode) return false;
    if (why) { if (!opts.quiet) game.ui.toast(why, 'warn'); return false; }
    G.ensure();
    const P = game.data, pvp = G.pvp, s = game.player, W = game.world, g = G.g;
    const rng = new RNG((opts.seed ?? Math.random() * 1e9) >>> 0);
    const duel = key === 'duel', myRating = duel ? pvp.duel.rating : pvp.rating;
    const opp = duel ? D.duelOpponent(G.ladder, myRating, rng) : null;
    const oppRating = opts.oppRating ?? (duel ? opp.rating : D.opponentRating(myRating, rng, pvp.streak));
    const arena = ARENAS[key];
    const M = A.match = {
      key, mode, arena, phase: 'countdown', cd: COUNTDOWN, t: 0, left: mode.time, score: [0, 0], recs: [], feed: [],
      pl: { kills: 0, assists: 0, deaths: 0, rt: 0, grace: 0, obj: 0 }, points: null, convoy: null, acc: 0,
      myRating, oppRating, opp, level: s.level, tier: CHASSIS_BY_ID[P.ship.chassis].tier, meshes: [], fast: !!opts.fast, quiet: !!opts.quiet,
      back: { pos: s.position.clone(), heading: s.heading, hull: s.hull / s.maxHull, sh: s.shields.map((x) => x / Math.max(1, s.maxShield)) },
      center: new THREE.Vector3(arena.x, 0, arena.z),
    };
    // seal the instance: the system's director sleeps, the arena runs in its place (before the world steps)
    M.sector = game.sector; M.sectorUpdate = game.sector.update;
    game.sector.update = (dt) => pre(dt);
    game.ui.closeAll();
    if (game.cancelWarp) game.cancelWarp();
    const scene = game.spaceScene || game.engine.scene;
    const addMesh = (m) => { scene.add(m); M.meshes.push(m); return m; };
    addMesh(ringMesh(arena.r, '#9a6bff', 10)).position.set(arena.x, -10, arena.z);

    // objectives
    if (key === 'capture') {
      M.points = ['A', 'B', 'C'].map((k, i) => {
        const pos = new THREE.Vector3(arena.x, 0, arena.z + (i - 1) * arena.r * 0.48);
        const ring = addMesh(ringMesh(D.POINT_RADIUS, '#6a7a9a')), core = addMesh(beaconMesh('#6a7a9a'));
        ring.position.set(pos.x, -8, pos.z); core.position.set(pos.x, 46, pos.z);
        return { k, i, pos, owner: null, cap: null, prog: 0, pres: { 0: 0, 1: 0 }, ring, core, hold: anchor(pos) };
      });
    }
    if (key === 'convoy') {
      const fs = pvp.convoyN++ % 2 === 0 ? 0 : 1, dir = fs === 0 ? 1 : -1;      // you escort, then raid, turn about
      M.convoy = { side: fs, ships: [], arrived: 0, lost: 0, end: new THREE.Vector3(arena.x + dir * arena.r * 0.8, 0, arena.z), role: fs === 0 ? 'escort' : 'raid' };
      for (let i = 0; i < 3; i++) {
        const pos = new THREE.Vector3(arena.x - dir * arena.r * 0.8, 0, arena.z + (i - 1) * 150);
        const f = spawnBot(game, { name: `Freighter ${['Halcyon', 'Mercy', 'Tallow'][i]}`, level: M.level, yard: 'tidewright', tier: clamp(M.tier, 2, 10), team: fs === 0 ? 1 : PVP_TEAM, pos, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2, seed: 7 + i, unarmed: true, noAI: true, contract: { pool: D.pvpTargets(M.level, { kill: mode.freighter, die: 30 }).pool, dps: 0 }, side: fs });
        f.invuln = true; f.freighter = true;
        f.cruise = clamp((arena.r * 1.6 / (mode.time * 0.8)) / f.maxSpeed, 0.15, 1);
        M.convoy.ships.push(f);
      }
    }

    // the two teams: guild members sail with you when you have them
    const names = new Set([P.name]);
    const pick = () => { let n = rng.pick(PLAYER_NAMES); for (let i = 0; i < 40 && names.has(n); i++) n = rng.pick(PLAYER_NAMES); names.add(n); return n; };
    const mates = g ? rng.shuffle(g.members.slice()) : [];
    const bloc = D.playerBloc(G.diplo), foeBlocs = G.diplo.blocs.filter((b) => b !== bloc && b.guilds.length);
    const foeGuild = duel ? opp.guild : foeBlocs.length ? rng.pick(rng.pick(foeBlocs).guilds) : rng.pick(G.guilds).tag;
    M.foeGuild = foeGuild;
    for (let side = 0; side < 2; side++) {
      const n = side === 0 ? mode.team - 1 : mode.team;
      for (let i = 0; i < n; i++) {
        const mate = side === 0 ? mates[i] : null;
        if (mate) names.add(mate.name);
        const rating = side === 0 ? myRating + rng.float(-40, 40) : oppRating + (duel ? 0 : rng.float(-40, 40));
        const rec = { side, i: side === 0 ? i + 1 : i, n: mode.team, name: duel ? opp.name : mate ? mate.name : pick(), guild: side === 0 ? (mate ? g.tag : bloc ? rng.pick(bloc.guilds) : g && rng.chance(0.3) ? g.tag : null) : foeGuild, own: !!mate, yard: duel ? opp.yard : rng.pick(YARDS), seed: rng.int(1, 1e9), power: D.botPower(rating), kills: 0, deaths: 0, rt: 0, ship: null };
        rec.contract = D.pvpTargets(M.level, D.BOT, rec.power.power);
        rec.contract.dps /= mode.focus || 1;
        M.recs.push(rec);
        spawnRec(M, rec);
      }
    }

    // the captain takes station
    const pos = spawnAt(M, 0, 0, mode.team);
    s.position.copy(pos); s.velocity.set(0, 0, 0); s.speed = 0; s.throttle = 0; s.rudder = 0;
    s.heading = Math.atan2(arena.x - pos.x, arena.z - pos.z); s.target = null; s.invuln = true;
    s.hull = s.maxHull; for (let i = 0; i < 4; i++) s.shields[i] = s.maxShield * 0.3;
    game.moveTarget = null; game.cam.focus.copy(pos);
    W.fx.column(pos, 0x58b8ff, 140, 60);
    if (game.audio) game.audio.play('jump', null, 0.6);
    game.ui.toast(`${mode.name} · ${arena.name}`, 'legend');
    game.ui.chat('PVP', null, `${mode.name} at ${arena.name} — ${mode.sub}${M.convoy ? ` · you ${M.convoy.role === 'escort' ? 'ESCORT the freighters' : 'RAID the convoy'}` : ''}. Matched at ${Math.round(oppRating)} (you: ${Math.round(myRating)}).`, 'sys');
    return true;
  };

  function feed(M, a, aside, b, bside, verb = 'sank') {
    const e = { t: game.engine.realTime, a, b, verb, mine: aside === 0, ca: sideColor(aside), cb: sideColor(bside) };
    M.feed.push(e); if (M.feed.length > 30) M.feed.shift();
    G.feed.push(e);
  }
  function onKill({ ship, killer }) {
    const M = A.match; if (!M || M.phase !== 'live') return;
    const P = game.player, isP = ship === P, rec = isP ? null : M.recs.find((r) => r.ship === ship);
    const fr = !!(M.convoy && M.convoy.ships.includes(ship));
    if (!isP && !rec && !fr) return;
    const vside = isP ? 0 : fr ? M.convoy.side : rec.side;
    const kr = killer ? M.recs.find((r) => r.ship === killer) : null;
    feed(M, killer ? (killer === P ? game.data.name : killer.name) : 'The void', 1 - vside, isP ? game.data.name : ship.name, vside);
    if (killer === P) M.pl.kills++; else if (!isP && ship.playerTagged && vside === 1) M.pl.assists++;
    if (kr) kr.kills++;
    if (rec) { rec.deaths++; rec.rt = M.mode.respawn; }
    if (isP) { M.pl.deaths++; M.pl.rt = M.mode.respawn; }
    if (fr) { M.convoy.lost++; M.score[1 - M.convoy.side] = M.convoy.lost; }
    else if (M.key === 'skirmish') M.score[1 - vside]++;
    else if (M.key === 'duel') M.score[1 - vside] = 1;
  }

  function go(M) {
    M.phase = 'live';
    const P = game.player;
    P.invuln = false;
    for (const r of M.recs) if (r.ship && r.ship.alive) { r.ship.invuln = false; arm(M, r); }
    if (M.convoy) for (const f of M.convoy.ships) f.invuln = false;
    game.ui.toast('FIGHT!', 'legend');
    if (game.audio) game.audio.play('levelup', null, 0.6);
  }

  function hpFrac(s) { return s && s.alive ? (s.hull + s.shieldTotal()) / (s.maxHull + s.maxShield * 1.2) : 0; }
  function checkEnd(M) {
    const sc = M.score, goal = M.mode.goal;
    if (M.key === 'convoy') {
      const need = 2, esc = M.convoy.side;                           // two of three freighters decide it
      if (sc[esc] >= need) return finish(M, esc === 0 ? 1 : 0);
      if (sc[1 - esc] >= need) return finish(M, esc === 0 ? 0 : 1);
      if (M.left <= 0) { sc[esc] += M.convoy.ships.filter((f) => f.alive).length; return finish(M, (sc[esc] >= need) === (esc === 0) ? 1 : 0); }
      return;
    }
    if (M.key === 'duel') {
      if (sc[0] || sc[1]) return finish(M, sc[0] ? 1 : 0);
      if (M.left <= 0) { const a = hpFrac(game.player), b = hpFrac(M.recs[0].ship); return finish(M, Math.abs(a - b) < 0.03 ? 0.5 : a > b ? 1 : 0); }
      return;
    }
    if (sc[0] >= goal || sc[1] >= goal || M.left <= 0) finish(M, sc[0] === sc[1] ? 0.5 : sc[0] > sc[1] ? 1 : 0);
  }

  function finish(M, res) {
    if (M.phase === 'over') return;
    const P = game.data, pvp = G.pvp, duel = M.key === 'duel', book = duel ? pvp.duel : pvp;
    M.phase = 'over'; M.result = res;
    M.hp = [hpFrac(game.player), M.recs.filter((r) => r.side === 1).reduce((a, r) => a + hpFrac(r.ship), 0) / M.mode.team];
    for (const r of M.recs) if (r.ship && r.ship.alive) { r.ship.invuln = true; r.ship.ai.aggro = 0; r.ship.target = null; }
    if (M.convoy) for (const f of M.convoy.ships) f.invuln = true;
    if (game.player.alive) { game.player.invuln = true; game.player.target = null; }
    const obj = M.key === 'capture' ? clamp(M.pl.obj, 0, 1) : M.key === 'convoy' ? (M.convoy.role === 'escort' ? M.convoy.arrived / 3 : M.convoy.lost / 3) : 0;
    const tier = G.tier();
    const rw = D.matchRewards(M.key, res, P.level, tier.index, { kills: M.pl.kills + M.pl.assists * 0.5, objective: obj });
    const delta = M.forfeit && res !== 0 ? 0 : D.ratingChange(M.myRating, M.oppRating, res, book.games);
    book.rating = Math.max(100, book.rating + delta); book.games++;
    if (res >= 1) book.wins++; else if (res <= 0) book.losses++;
    if (!duel) pvp.streak = res >= 1 ? Math.max(1, pvp.streak + 1) : res <= 0 ? Math.min(-1, pvp.streak - 1) : 0;
    const ms = pvp.modes[M.key] || (pvp.modes[M.key] = { w: 0, l: 0, d: 0 });
    if (res >= 1) ms.w++; else if (res <= 0) ms.l++; else ms.d++;
    pvp.honour += rw.honour; pvp.honourTotal += rw.honour; pvp.voidglass += rw.glass; P.credits += rw.credits;
    M.rewards = rw; M.delta = delta; M.newRating = book.rating; M.tierBefore = tier; M.tierAfter = D.tierFor(pvp.rating);
    M.overT = M.fast ? 0.5 : game.autoplay && game.autoplay.active ? 6 : 30;
    G.addXp(res >= 1 ? D.DEEDS.matchWin : D.DEEDS.matchLoss);
    G.react(res >= 1 ? 'win' : 'loss', 0.8, 2);
    const word = res >= 1 ? 'Victory' : res <= 0 ? 'Defeat' : 'Draw';
    game.ui.chat('PVP', null, `${word} in ${M.mode.name} ${M.score[0]}–${M.score[1]} · rating ${delta >= 0 ? '+' : ''}${delta} (${book.rating}) · +${rw.honour} honour, +${rw.glass} ${D.RESOURCE.name}, +${rw.credits} ¢`, 'sys');
    if (!duel && M.tierAfter.index > tier.index) { game.ui.toast(`Promoted to ${M.tierAfter.name} tier`, 'legend'); game.ui.chat('WORLD', null, `${P.name} has reached ${M.tierAfter.name} tier in the arenas.`, 'sys'); }
    if (game.audio) game.audio.play(res >= 1 ? 'levelup' : 'hit', null, 0.8);
  }
  A.forfeit = () => { const M = A.match; if (!M) return; if (M.phase !== 'over') { M.forfeit = true; finish(M, 0); } M.overT = 0; };
  A.dismiss = () => { const M = A.match; if (M && M.phase === 'over') M.overT = 0; };

  function cleanup(M) {
    const W = game.world, scene = game.spaceScene || game.engine.scene;
    for (const r of M.recs) if (r.ship && W.ships.includes(r.ship)) W.removeShip(r.ship);
    if (M.convoy) for (const f of M.convoy.ships) if (W.ships.includes(f)) W.removeShip(f);
    for (const m of M.meshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    for (const o of W.ships.slice()) if (o.pvp && o.position.distanceToSquared(M.center) < 9e6 * 4) W.removeShip(o);   // hulks still burning
    if (M.sector) M.sector.update = M.sectorUpdate;
    let s = game.player;
    if (!s.alive) s = game.spawnPlayer(M.back.pos);
    s.position.copy(M.back.pos); s.heading = M.back.heading; s.velocity.set(0, 0, 0); s.speed = 0; s.throttle = 0; s.target = null;
    s.hull = Math.max(1, s.maxHull * M.back.hull); for (let i = 0; i < 4; i++) s.shields[i] = s.maxShield * M.back.sh[i];
    s.invuln = false;
    game.cam.focus.copy(s.position); game.moveTarget = null;
    W.fx.column(s.position, 0x58b8ff, 140, 60);
    A.last = { key: M.key, result: M.result, score: M.score.slice(), rewards: M.rewards, delta: M.delta, t: M.t, pl: M.pl, hp: M.hp, role: M.convoy && M.convoy.role, oppRating: M.oppRating, myRating: M.myRating };
    A.match = null;
    game.saveNow();
    G.dirty();
  }
  A.abort = () => { const M = A.match; if (M) { if (M.phase !== 'over') { M.forfeit = true; finish(M, 0); } cleanup(M); } };

  // one step of the arena, run in the sector's place: after the autoplay has thought, before the world moves
  function pre(dt) {
    const M = A.match; if (!M) return;
    let P = game.player;
    M.t += dt;
    if (M.phase === 'countdown') {
      if (P.alive) { P.throttle = 0; P.rudder = 0; }
      if ((M.cd -= dt) <= 0) go(M);
    } else if (M.phase === 'live') {
      M.left -= dt;
      // respawns
      if (M.mode.respawn) {
        for (const r of M.recs) if (!r.ship.alive && (r.rt -= dt) <= 0) spawnRec(M, r);
        if (!P.alive && (M.pl.rt -= dt) <= 0) { P = game.spawnPlayer(spawnAt(M, 0, 0, M.mode.team)); P.invuln = true; M.pl.grace = 3; }
      }
      if (M.pl.grace > 0 && (M.pl.grace -= dt) <= 0 && P.alive) P.invuln = false;
      if (M.points) relays(M, dt);
      if (M.convoy) convoy(M, dt);
      autopilot(M, P);
      checkEnd(M);
    } else {
      if (P.alive) { P.throttle = 0; P.rudder = 0; }
      if ((M.overT -= dt) <= 0) return cleanup(M);
    }
    // the arena's edge
    const a = M.arena, r2 = a.r * a.r;
    for (const s of game.world.ships) {
      if (!s.alive || !(s.pvp || s === P)) continue;
      const dx = s.position.x - a.x, dz = s.position.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 > r2 && d2 < r2 * 9) { const k = a.r / Math.sqrt(d2); s.position.x = a.x + dx * k; s.position.z = a.z + dz * k; }
    }
  }
  function relays(M, dt) {
    const P = game.player, R2 = D.POINT_RADIUS * D.POINT_RADIUS;
    for (const p of M.points) { p.pres[0] = 0; p.pres[1] = 0; }
    for (const s of game.world.ships) {
      if (!s.alive || !(s.pvp || s === P)) continue;
      const side = s === P ? 0 : s.pvpSide;
      for (const p of M.points) if (s.position.distanceToSquared(p.pos) < R2) { p.pres[side]++; if (s === P && p.owner !== '0') M.pl.obj += dt / 30; }
    }
    for (const p of M.points) if (D.captureStep(p, p.pres, dt) === 'captured') {
      const c = sideColor(+p.owner); tint(p.ring, c, 1.5); tint(p.core, c, 2.2);
      feed(M, p.owner === '0' ? 'Your team' : 'The enemy', +p.owner, `relay ${p.k}`, 1 - p.owner, 'took');
    }
    if ((M.acc += dt) >= 1) {
      M.acc -= 1;
      for (const p of M.points) if (p.owner != null) M.score[+p.owner]++;
      // bots holding a quiet relay move on to one that needs taking
      for (const r of M.recs) {
        const s = r.ship; if (!s.alive || s.target) continue;
        const cur = M.points.find((p) => p.hold === s.ai.follow);
        if (cur && cur.owner === String(r.side) && !cur.pres[1 - r.side]) {
          let best = null, bd = Infinity;
          for (const p of M.points) if (p.owner !== String(r.side)) { const d = p.pos.distanceToSquared(s.position); if (d < bd) { bd = d; best = p; } }
          if (best && (r.i + Math.floor(M.t / 8)) % 3 !== 0) s.ai.follow = best.hold;   // someone stays behind
        }
      }
    }
  }
  function convoy(M, dt) {
    const C = M.convoy;
    for (const f of C.ships) {
      if (!f.alive || f.done) continue;
      const d = f.steerTo(C.end, 30, f.cruise);
      if (d < 140) {
        f.done = true; C.arrived++; M.score[C.side] = C.arrived;
        feed(M, f.name, C.side, 'the jump point', C.side, 'reached');
        game.world.fx.column(f.position, 0x58c8ff, 220, 50); game.world.removeShip(f);
      }
    }
    if ((M.acc += dt) >= 2) {
      M.acc = 0;
      for (const r of M.recs) if (r.side === C.side && r.ship.alive && !(r.ship.ai.follow && r.ship.ai.follow.alive)) r.ship.ai.follow = C.ships.find((f) => f.alive) || null;
    }
  }
  // autoplay inside a match: its combat brain fights; between fights the arena points it at the objective
  function autopilot(M, s) {
    const ap = game.autoplay;
    if (!ap || !ap.active || !s.alive) return;
    if (ap.state === 'retreat' || (ap.state === 'combat' && s.target && s.target.alive)) return;
    s.autoFire = true;
    let to = null, stop = 300;
    if (M.points) {
      let bd = Infinity;
      for (const p of M.points) { const d = p.pos.distanceToSquared(s.position) * (p.owner === '0' ? 4 : 1); if (d < bd) { bd = d; to = p.pos; } }
      stop = 40;
    } else if (M.convoy && M.convoy.role === 'escort') {
      const f = M.convoy.ships.find((x) => x.alive); if (f) { to = f.position; stop = 220; }
    }
    if (!to) {
      let bd = Infinity;
      for (const o of game.world.ships) if (o.alive && o.pvp && o.pvpSide === 1 && !o.invuln) { const d = o.position.distanceToSquared(s.position) * (o.freighter ? 0.5 : 1); if (d < bd) { bd = d; to = o.position; } }
    }
    if (to) s.steerTo(to, stop, 1); else { s.throttle = 0; }
  }

  // ---- what the HUD shows
  A.board = () => {
    const M = A.match; if (!M) return null;
    const rows = M.recs.map((r) => ({ name: r.name, guild: r.guild, side: r.side, k: r.kills, d: r.deaths, alive: r.ship && r.ship.alive }));
    rows.push({ name: game.data.name, guild: G.g ? G.g.tag : null, side: 0, k: M.pl.kills, d: M.pl.deaths, alive: game.player.alive, you: true });
    return rows.sort((a, b) => a.side - b.side || b.k - a.k);
  };

  // ---- hooks: PvP deaths carry no PvE penalty; the instance is sealed
  game.pvpDeath = (killer) => (A.match ? true : killer && killer.pvp ? 'waive' : false);
  const lock = (name) => { const f = game[name]; if (f) game[name] = (...a) => (A.match ? false : f(...a)); };
  game.start = ((start) => (fresh) => {
    start(fresh);
    G.ensure();
    game.world.events.on('kill', onKill);
    lock('warpTo'); lock('jumpTo');
    const enter = game.enterSystem; game.enterSystem = (id) => { if (A.match) A.abort(); enter(id); };
    const mode = game.enterMode; game.enterMode = function (...a) { if (A.match) A.abort(); return mode.apply(this, a); };
  })(game.start.bind(game));
}
