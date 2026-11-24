// Contested zones: Voidglass fields in some systems. Three extractors (A/B/C); captains of the
// alliances fight over them. Opposing blocs are hostile "players" (their own teams, so
// World.hostile holds every way round); your allies warp in beside you. Holdings persist per
// zone in the save and keep shifting while you are away (a cheap step every minute of play).
import * as THREE from 'three/webgpu';
import { RNG, rng as R, clamp } from '../../engine/rng.js';
import { galaxy } from '../galaxy.js';
import { PLAYER_NAMES } from '../data/names.js';
import * as D from './data.js';
import { spawnBot, warpOut, PVP_TEAM, ringMesh, beaconMesh, tint, anchor } from './bots.js';

const ZONE_RARITY = [['uncommon', 3], ['rare', 4], ['epic', 2]];
const NEAR = 3200, LEAVE = 4800, SIM_EVERY = 60, HOT = 90, COOL_WON = 420, COOL_LOST = 150;
const YARDS = ['velscour', 'aurelian', 'tidewright', 'ironhold', 'corsair'];
const _v = new THREE.Vector3(), _c = new THREE.Color();

export function installZones(game, G) {
  const ids = D.contestedSystems(), S = galaxy().systems;
  const Z = G.zones = { ids, cur: null };
  const pt = () => game.data.playtime || 0;

  // persisted state of one field (sanitised: blocs dissolve, the captain changes sides)
  Z.state = (id) => {
    const zs = G.pvp.zones, d = G.diplo;
    let st = zs[id];
    if (!st) { st = zs[id] = D.newZoneState(); D.simulateZone(st, d, G.guilds, S[id], new RNG(id * 7919 + 13), 8); st.income = 0; }
    for (let i = 0; i < 3; i++) {
      const o = st.own[i];
      if (o === 'own') { if (!G.g) st.own[i] = null; else if (d.player) st.own[i] = d.player; }   // the guild's ground goes with it into an alliance
      else if (o && !d.blocs.some((b) => b.id === o)) st.own[i] = null;
    }
    return st;
  };
  Z.zone = (id) => D.zoneFor(S[id]);

  function paint(C) { for (const p of C.pts) { const c = G.sideColor(p.owner); tint(p.ring, c, p.owner ? 1.5 : 0.7); tint(p.core, c, p.owner ? 2.2 : 1); } }
  function build(sys) {
    const zone = D.zoneFor(sys), st = Z.state(sys.id), W = game.world, scene = game.spaceScene || game.engine.scene;
    const pts = zone.points.map((p, i) => {
      const pos = new THREE.Vector3(p.x, 0, p.z);
      const ring = ringMesh(D.POINT_RADIUS, '#6a7a9a'), core = beaconMesh('#6a7a9a');
      ring.position.set(p.x, -8, p.z); core.position.set(p.x, 46, p.z);
      scene.add(ring, core); W.bodies.push(ring, core);           // World.clearAll takes them out with the system
      return { k: p.k, i, pos, owner: st.own[i], cap: null, prog: 0, pres: {}, ring, core, hold: anchor(pos) };
    });
    const C = Z.cur = { id: sys.id, zone, st, pts, center: new THREE.Vector3(zone.x, 0, zone.z), phase: 'idle', sides: [], linger: [], near: false, tickT: D.CONTROL_TICK, hotT: 0, earned: 0, pulseT: 0, dist: 1e9 };
    paint(C);
  }
  Z.enter = (id) => { Z.cur = null; if (ids.includes(id)) build(S[id]); };

  // ---- squads
  const taken = () => { const n = new Set(); for (const s of game.world.ships) n.add(s.name); return n; };
  function spawnFor(C, sd) {
    const P = game.player, d = G.diplo, g = G.g, rng = new RNG((Math.random() * 1e9) >>> 0), names = taken();
    let name = null, guild = null, own = false;
    if (sd.ally) {
      const free = g ? g.members.filter((m) => !names.has(m.name)) : [];
      if (free.length && (sd.side === 'own' || rng.chance(0.5))) { name = rng.pick(free).name; guild = g.tag; own = true; }
      else if (sd.side === 'own') return null;                    // a guild alone only has its own roster to call on
    }
    if (!name) {
      const bloc = d.blocs.find((b) => b.id === sd.side);
      guild = bloc && bloc.guilds.length ? rng.pick(bloc.guilds) : null;
      for (let i = 0; i < 30 && (!name || names.has(name)); i++) name = rng.pick(PLAYER_NAMES);
      if (names.has(name)) return null;
    }
    const level = clamp(game.data.level + rng.int(-1, 0), 1, 60);
    const held = C.pts.slice().sort((a, b) => (b.owner === sd.side) - (a.owner === sd.side) || b.pos.distanceToSquared(P.position) - a.pos.distanceToSquared(P.position));
    const a = rng.float(0, 6.28), r = sd.ally ? 320 : 140;
    const pos = (sd.ally ? P.position.clone() : held[sd.spawned % 2].pos.clone()).add(_v.set(Math.sin(a) * r, 0, Math.cos(a) * r));
    const s = spawnBot(game, { name, guild, level, yard: rng.pick(YARDS), tier: D.tierForLevel(level), team: sd.team, pos, heading: rng.float(0, 6.28), seed: rng.int(1, 1e9), rarity: ZONE_RARITY, dmg: 1, contract: D.pvpTargets(level, D.ZONE_BOT), aggro: 1300, side: sd.side });
    if (!sd.ally) s.capRoot = sd;                                    // a squad shares one MIN_TTK window against the captain
    s.zoneBot = sd; s.ownGuild = own;
    s.ai.follow = C.pts[(sd.spawned + (sd.ally ? 1 : 0)) % 3].hold;   // they take station on an extractor
    sd.spawned++;
    game.world.fx.column(pos, sd.ally ? 0x58c8ff : 0xff5a8a, 160, 40);
    sd.ships.push(s);
    return s;
  }
  function addSide(C, side, team, n, ally) {
    const sd = { side, team, n, reserve: n, rt: 18, ally, ships: [], spawned: 0, alive: true };
    C.sides.push(sd);
    for (let i = 0; i < n; i++) spawnFor(C, sd);
    return sd;
  }
  function activate(C) {
    const d = G.diplo, my = G.side(), n = 2 + (game.data.level >= 12 ? 1 : 0), rng = new RNG((Math.random() * 1e9) >>> 0);
    const foes = d.blocs.filter((b) => b.id !== my);
    if (!foes.length) return;
    const first = rng.weighted(foes.map((b) => [b, 1 + C.pts.filter((p) => p.owner === b.id).length * 3 + D.blocStrength(d, G.guilds, b) / 100]));
    C.sides = []; C.earned = 0; C.result = null;
    addSide(C, first.id, PVP_TEAM, n, false);
    if (my) addSide(C, my, 1, n - 1, true);
    else { const others = foes.filter((b) => b !== first); if (others.length) addSide(C, rng.pick(others).id, PVP_TEAM + 1, n, false); }
    C.phase = 'battle'; C.tickT = D.CONTROL_TICK;
    game.ui.toast(`Contested zone · ${first.name} is working the ${C.zone.name}`, 'legend');
    game.ui.chat('LOCAL', null, my ? `${first.name} captains are on the extractors. Take the points: every ${D.CONTROL_TICK}s they pay ${D.RESOURCE.name} to whoever holds them.` : 'Unaligned captains are fair game in contested space. Found a guild to claim extractors.', 'sys');
    const ally = C.sides.find((sd) => sd.ally && sd.ships.length);
    if (ally) G.chat(ally.ships[0].name, R.pick(['on your wing captain', 'here for the glass o7', 'lets take the points', 'allies inbound']));
  }
  function release(C, delay) { for (const sd of C.sides) for (const s of sd.ships) C.linger.push({ s, t: delay + Math.random() * 6 }); C.sides = []; }
  function won(C) {
    const my = G.side(), pvp = G.pvp, d = G.diplo, rw = D.ZONE_REWARDS.secured;
    for (const sd of C.sides) if (!sd.ally) D.shiftBloc(d, d.blocs.find((b) => b.id === sd.side), -4);
    if (my) {
      pvp.voidglass += rw.glass; pvp.honour += rw.honour; pvp.honourTotal += rw.honour; C.earned += rw.glass;
      pvp.zonesWon = (pvp.zonesWon || 0) + 1;
      if (d.player) D.shiftBloc(d, D.playerBloc(d), 3);
      G.addXp(D.DEEDS.zoneWon); G.react('win', 0.8);
      game.ui.toast(`${C.zone.name} secured · +${rw.glass} ${D.RESOURCE.sym} +${rw.honour} honour`, 'legend');
      game.ui.chat('WORLD', null, `${G.sideName(my)} has driven its rivals from the ${C.zone.name}.`, 'sys');
    } else { pvp.honour += 20; pvp.honourTotal += 20; game.ui.toast(`${C.zone.name} cleared · +20 honour`, 'epic'); }
    C.st.cool = pt() + COOL_WON; C.hotT = HOT; C.phase = 'idle'; C.result = 'won';
    release(C, 45);
    G.dirty();
  }
  function setOwner(C, p, side) { p.owner = side; p.cap = null; p.prog = 0; C.st.own[p.i] = side; paint(C); }
  function lost(C, why) {
    const my = G.side(), foe = C.sides.find((sd) => !sd.ally && sd.ships.length);
    if (why === 'died' && my && foe) { const p = C.pts.find((x) => x.owner === my); if (p) setOwner(C, p, foe.side); }
    C.st.cool = pt() + COOL_LOST; C.phase = 'idle'; C.result = 'lost';
    release(C, why === 'died' ? 25 : 2);
    if (why === 'died') { game.ui.chat('LOCAL', null, `The ${C.zone.name} is lost for now. (No insurance is charged for PvP losses.)`, 'sys'); G.react('loss', 0.6); }
  }
  function onCapture(C, p) {
    const my = G.side(), P = game.player;
    C.st.own[p.i] = p.owner; paint(C);
    game.world.fx.ring(p.pos, D.POINT_RADIUS, _c.set(G.sideColor(p.owner)).getHex(), 72);
    G.feed.push({ t: game.engine.realTime, a: G.sideName(p.owner), b: `extractor ${p.k}`, mine: p.owner === my, verb: 'took' });
    if (p.owner !== my) return;
    G.addXp(D.DEEDS.capture); G.react('capture', 0.4);
    if (P.alive && P.position.distanceToSquared(p.pos) < 500 * 500) {
      const r = D.ZONE_REWARDS.capture, pvp = G.pvp;
      pvp.voidglass += r.glass; pvp.honour += r.honour; pvp.honourTotal += r.honour; C.earned += r.glass;
      pvp.captures = (pvp.captures || 0) + 1;
      game.ui.toast(`Extractor ${p.k} captured · +${r.glass} ${D.RESOURCE.sym}`, 'epic');
    }
  }
  function pay(C) {
    const my = G.side(); if (!my) return;
    let n = 0; for (const p of C.pts) if (p.owner === my) n++;
    const g = D.CONTROL_PAY[n]; if (!g) return;
    G.pvp.voidglass += g; C.earned += g; C.paidAt = game.engine.realTime; C.paid = g;
    G.pvp.ticksPaid = (G.pvp.ticksPaid || 0) + 1;
    game.ui.chat('LOOT', null, `Extractors paid ${g} ${D.RESOURCE.name} (${n}/3 held)`, 'loot', 'loot');
  }
  function capture(C, dt) {
    const my = G.side(), P = game.player, R2 = D.POINT_RADIUS * D.POINT_RADIUS;
    for (const p of C.pts) for (const k in p.pres) p.pres[k] = 0;
    for (const s of game.world.ships) {
      if (!s.alive) continue;
      const side = s === P ? my : s.zoneBot ? s.pvpSide : null;
      if (!side) continue;
      for (const p of C.pts) if (s.position.distanceToSquared(p.pos) < R2) p.pres[side] = (p.pres[side] || 0) + 1;
    }
    for (const p of C.pts) if (D.captureStep(p, p.pres, dt) === 'captured') onCapture(C, p);
  }

  Z.update = (dt) => {
    const pvp = G.pvp, C = Z.cur, P = game.player;
    if (pt() - (pvp.simT || 0) >= SIM_EVERY) {
      pvp.simT = pt();
      const rng = new RNG((Math.random() * 1e9) >>> 0), mine = G.strength();
      for (const id of ids) {
        if (C && C.id === id && (C.near || C.phase !== 'idle')) continue;      // the one you are standing in is live
        D.simulateZone(Z.state(id), G.diplo, G.guilds, S[id], rng, 1, mine);
      }
      if (C && !C.near && C.phase === 'idle') { for (const p of C.pts) p.owner = C.st.own[p.i]; paint(C); }
    }
    if (!C || !P) return;
    const d = P.alive ? P.position.distanceTo(C.center) : 1e9;
    C.near = d < NEAR; C.dist = d;
    for (let i = C.linger.length - 1; i >= 0; i--) { const l = C.linger[i]; if ((l.t -= dt) <= 0 || !l.s.alive) { warpOut(game, l.s); C.linger.splice(i, 1); } }
    if (C.phase === 'idle') {
      if (C.near && !game.docked && pt() >= C.st.cool) activate(C);
      if (C.near && C.st.income >= 1 && G.side()) {
        const n = Math.floor(C.st.income); C.st.income -= n; pvp.voidglass += n;
        game.ui.toast(`Your side held ground here while you were away · +${n} ${D.RESOURCE.sym}`, 'epic');
      }
    } else {
      let foes = 0;
      for (const sd of C.sides) {
        for (let i = sd.ships.length - 1; i >= 0; i--) if (!sd.ships[i].alive) sd.ships.splice(i, 1);
        if (sd.reserve > 0 && sd.ships.length < sd.n && (sd.rt -= dt) <= 0) { sd.rt = 16; sd.reserve--; spawnFor(C, sd); }
        if (!sd.ally) foes += sd.ships.length + sd.reserve;
      }
      if (!P.alive) lost(C, 'died');
      else if (d > LEAVE) lost(C, 'left');
      else if (!foes) won(C);
    }
    if (C.hotT > 0) C.hotT -= dt;
    if ((C.phase === 'battle' || C.hotT > 0) && (C.tickT -= dt) <= 0) { C.tickT = D.CONTROL_TICK; if (C.near) pay(C); }
    if (C.near || C.phase !== 'idle' || C.linger.length) capture(C, dt);
    if (C.near && (C.pulseT -= dt) <= 0) {
      C.pulseT = 2.4;
      for (const p of C.pts) { p.core.rotation.y += 0.6; game.world.fx.ring(p.pos, 70, _c.set(G.sideColor(p.owner)).getHex(), 20); }
    }
  };

  // ---- autoplay helpers
  Z.canVisit = () => {
    const C = Z.cur;
    return !!(C && G.side() && pt() >= C.st.cool && (G.diplo.player || (G.g && G.g.members.length >= 2)));
  };
  Z.worthStaying = () => { const C = Z.cur; return !!(C && G.side() && (C.phase === 'battle' || pt() >= C.st.cool)); };
  Z.autoSteer = (s) => {
    const C = Z.cur; if (!C || (game.isWarping && game.isWarping())) return;
    const d = s.position.distanceTo(C.center), my = G.side();
    if (d > 2600) {
      _v.copy(s.position).sub(C.center).setY(0).setLength(900).add(C.center);
      if (!game.warpTo || !game.warpTo(_v)) s.steerTo(C.center, 200, 1);
      return;
    }
    let best = null, bd = Infinity;
    for (const p of C.pts) if (p.owner !== my) { const dd = p.pos.distanceToSquared(s.position); if (dd < bd) { bd = dd; best = p; } }
    if (best) s.steerTo(best.pos, 50, 1); else s.steerTo(C.center, 150, 0.5);
  };
  Z.warpToField = () => {
    const C = Z.cur, s = game.player; if (!C || !s || !game.warpTo) return false;
    _v.copy(s.position).sub(C.center).setY(0).setLength(1100).add(C.center);
    return game.warpTo(_v);
  };

  // ---- maps (nav/index.js calls these when present)
  game.mapExtras = {
    system(c, X, Y, t) {
      const C = Z.cur; if (!C) return;
      const x = X(C.zone.x), y = Y(C.zone.z), r = 12 + Math.sin(t * 3) * 1.5;
      c.save();
      c.strokeStyle = '#c88cff'; c.lineWidth = 1.5; c.setLineDash([4, 3]); c.beginPath(); c.arc(x, y, r + 6, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      C.pts.forEach((p, i) => { c.fillStyle = G.sideColor(p.owner); c.beginPath(); c.arc(x + (i - 1) * 8, y, 3, 0, Math.PI * 2); c.fill(); });
      c.fillStyle = '#c88cff'; c.textAlign = 'center'; c.fillText(`${D.RESOURCE.sym} ${C.zone.name.toUpperCase()}${C.phase === 'battle' ? ' · BATTLE' : ''}`, x, y - r - 10);
      c.restore();
    },
    galaxy(c, L) {
      c.save(); c.font = '600 12px Rajdhani, sans-serif'; c.textAlign = 'center';
      for (const id of ids) {
        const s = S[id], h = D.zoneHolder(Z.state(id));
        c.fillStyle = h ? G.sideColor(h) : '#c88cff';
        c.fillText(D.RESOURCE.sym, L.cx + s.x * L.S + 10, L.cy + s.y * L.S + 13);
      }
      c.restore();
    },
  };

  game.start = ((start) => (fresh) => {
    start(fresh);
    G.ensure();
    game.world.events.on('kill', ({ ship, killer }) => {
      const sd = ship.zoneBot, C = Z.cur; if (!sd || !C) return;
      const P = game.player, mine = killer === P || ship.playerTagged;
      G.feed.push({ t: game.engine.realTime, a: killer ? (killer === P ? game.data.name : killer.name) : 'The void', b: ship.name, mine: !sd.ally, verb: 'sank' });
      if (sd.ally || !mine) return;
      const r = D.ZONE_REWARDS.kill, pvp = G.pvp;
      pvp.voidglass += r.glass; pvp.honour += r.honour; pvp.honourTotal += r.honour; C.earned += r.glass;
      pvp.zoneKills = (pvp.zoneKills || 0) + 1;
      if (ship.guild) G.standing(ship.guild, -3);
      game.ui.chat('COMBAT', null, `${ship.guild ? '<' + ship.guild + '> ' : ''}${ship.name} sunk · +${r.glass} ${D.RESOURCE.name}, +${r.honour} honour`, 'sys', 'combat');
    });
    const enter = game.enterSystem;
    game.enterSystem = (id) => { Z.cur = null; enter(id); Z.enter(id); };
    // an autoplay sortie stays on the field: between kills its patrol brain would otherwise spool
    // a warp to the next PvE zone before the reinforcements arrive
    const warpTo = game.warpTo;
    if (warpTo) game.warpTo = (pos) => (G.sortie && G.sortie.kind === 'zone' && Z.cur && Z.cur.phase === 'battle' && pos.distanceTo(Z.cur.center) > NEAR ? false : warpTo(pos));
    Z.enter(game.data.system || 0);
  })(game.start.bind(game));
}
