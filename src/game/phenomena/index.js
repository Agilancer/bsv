// Space phenomena at runtime: builds a system's phenomena when the captain arrives (data.js decides what and
// where), runs their effects on every ship, shot and loot drop in reach, keeps the helm and the AI steering
// round the dangerous ones, announces them, pays a survey bounty for each kind first charted, and draws
// them on the radar and the system map.
//
// Effects go through a few hooks elsewhere: Ship.envRegen (shield regeneration multiplier, reset each frame),
// Ship.veiled (ShipAI will not pick a veiled ship out beyond FX.dust.sight), the `surge` buff (Ship.update),
// and World.avoid (Ship.steerTo / steerHeading call it to bend the wanted heading round hazards).
import * as THREE from 'three/webgpu';
import { KINDS, FX, systemPhenomena, whirl, beamAngle, inBeam, cometPos } from './data.js';
import { BUILDERS } from './visuals.js';
import { steerOffset } from '../planet/avoid.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = {};
const RENOTICE = 150;   // s before entering the same phenomenon is announced again

export function installPhenomena(game) {
  const P = game.phenomena = { list: [], rts: [], inside: [], off: false, data: [] };
  let rts = [];
  const hz = [];                 // steering circles {x, z, r}
  const fields = [];             // asteroid fields (their solid rocks are steering circles too)
  const OBST = {
    forObstacles(px, pz, fn) {
      for (let i = 0; i < hz.length; i++) fn(hz[i]);
      for (let f = 0; f < fields.length; f++) {
        const F = fields[f];
        if (Math.hypot(F.ph.x - px, F.ph.z - pz) > F.ph.r + 900) continue;
        for (let i = 0; i < F.solid.length; i++) fn(F.solid[i]);
      }
    },
  };

  // ---------------------------------------------------------------- build / tear down
  function build() {
    const W = game.world, E = game.engine;
    rts = []; P.rts = rts; hz.length = 0; fields.length = 0; P.inside = [];
    P.list = systemPhenomena(game.sector.sys, game.sector.detail);
    P.data = P.list;
    for (const ph of P.list) {
      const K = KINDS[ph.kind];
      let vis = null;
      try { vis = BUILDERS[ph.kind](ph, E); } catch (e) { console.error('phenomenon', ph.kind, e); }
      if (vis) { E.scene.add(vis.root); W.bodies.push(vis.root); }
      const R = { ph, K, vis, x: ph.x || 0, z: ph.z || 0, reach: ph.r || 0, noticeT: -1e9, inside: false, hit: new WeakMap(), state: {} };
      if (ph.kind === 'asteroids') {
        R.rocks = vis ? vis.rocks : [];
        R.solid = R.rocks.filter((rk) => rk.s >= FX.rock.solid).map((rk) => ({ x: rk.x, z: rk.z, r: rk.s * 0.85, rk }));
        R.cover = R.rocks.filter((rk) => rk.s >= FX.rock.cover);
        fields.push(R);
      }
      if (K.avoid) {
        const r = ph.kind === 'wormhole' ? FX.worm.throat * 2.4 : ph.r * K.avoid;
        R.avoidC = { x: R.x, z: R.z, r };
        hz.push(R.avoidC);
        if (ph.kind === 'wormhole') { R.avoidC2 = { x: ph.x2, z: ph.z2, r }; hz.push(R.avoidC2); }
      }
      if (ph.kind === 'comet') { R.avoidC = { x: 0, z: 0, r: FX.comet.nucleus * 2 }; hz.push(R.avoidC); R.reach = FX.comet.tail + FX.comet.coma; }
      if (ph.kind === 'ion') { R.hx = R.x; R.hz = R.z; R.state.strikeT = 2; }
      if (ph.kind === 'remnant' || ph.kind === 'repulsor') R.state.shedT = 6;
      rts.push(R);
    }
    W.avoid = avoid;
    if (P.list.length && game.ui && game.ui.chat) game.ui.chat('SYS', null, `Sensors: ${P.list.map((p) => KINDS[p.kind].name.toLowerCase()).join(', ')} in this system.`, 'sys');
  }

  const enter = game.enterSystem;
  game.enterSystem = function (id) {
    const r = enter.apply(this, arguments);
    try { build(); } catch (e) { console.error('phenomena build', e); }
    return r;
  };

  // ---------------------------------------------------------------- steering (World.avoid)
  // The AI and the autopilot bend their wanted heading round the hazard circles and the big rocks. A captain at
  // the helm (autopilot off) is left alone: the phenomena are theirs to use or to blunder into.
  function avoid(s, want, dist) {
    if (P.off || (s.isPlayer && !(game.autoplay && game.autoplay.active))) return 0;
    const look = Math.max(420, Math.abs(s.speed) * 4.5 + s.dims.L);
    const px = s.position.x, pz = s.position.z;
    let near = false;
    for (let i = 0; i < hz.length && !near; i++) { const h = hz[i]; if (Math.hypot(h.x - px, h.z - pz) < h.r + look + 50) near = true; }
    for (let f = 0; f < fields.length && !near; f++) { const F = fields[f].ph; if (Math.hypot(F.x - px, F.z - pz) < F.r + look) near = true; }
    if (!near) { if (s._av) s._av.side = 0; return 0; }
    const mem = s._av || (s._av = { side: 0, hold: 0 });
    return steerOffset(OBST, px, pz, Math.sin(want), Math.cos(want), s.dims.W * 1.4 + 20, look, dist === undefined ? Infinity : dist, mem, game.engine.dt || 0.016);
  }
  // is a point inside something the autopilot should not chase loot into?
  P.hazardAt = (pos, pad = 0) => {
    for (const h of hz) if (Math.hypot(h.x - pos.x, h.z - pos.z) < h.r + pad) return true;
    for (const R of rts) if (R.ph.kind === 'blackhole' && Math.hypot(R.x - pos.x, R.z - pos.z) < R.ph.r * 0.5 + pad) return true;
    return false;
  };

  // ---------------------------------------------------------------- per frame
  game.engine.add({
    update(dt, t) {
      if (game.mode !== 'space' || !dt || !rts.length || !game.world || P.off) return;
      tick(dt, t);
    },
  });

  // environmental hull damage that ignores shields (heat, radiation, tidal stress): keeps the last attacker
  const burn = (s, amount) => { if (!s.invuln && s.alive) s.hull -= amount; };
  const hitShip = (W, s, amount, type) => {
    if (s.invuln || !s.alive) return;
    const la = s.lastAttacker;
    W.combat.damage(s, amount, type, s.position, null, null);
    s.lastAttacker = la;
  };
  const stripShields = (s, k) => { for (let i = 0; i < 4; i++) s.shields[i] *= 1 - k; };
  const notice = (R, t) => {
    if (t - R.noticeT < RENOTICE) return;
    R.noticeT = t;
    game.world.toast(`${R.K.name}: ${R.K.fx}`, R.K.hazard ? 'warn' : 'epic');
    survey(R);
  };
  // the first of each kind the captain charts pays a survey bounty (kept in the save)
  function survey(R) {
    const D = game.data; if (!D) return;
    const seen = D.phenomena || (D.phenomena = []);
    if (seen.includes(R.ph.kind)) return;
    seen.push(R.ph.kind);
    const d = game.sector.sys.danger, pay = Math.round(60 + 40 * d);
    D.credits += pay; if (game.gainXp) game.gainXp(pay * 2);
    game.world.toast(`Survey logged: ${R.K.name} · +${pay} ¢`, 'epic');
  }

  function tick(dt, t) {
    const W = game.world, ships = W.ships, pl = game.player;
    for (let i = 0; i < ships.length; i++) { ships[i].envRegen = 1; ships[i].veiled = false; }
    P.inside.length = 0;
    const camF = game.cam.focus;
    for (let ri = 0; ri < rts.length; ri++) {
      const R = rts[ri], ph = R.ph, k = ph.kind;
      // moving ones first
      if (k === 'comet') {
        cometPos(ph, t, _c); R.x = _c.x; R.z = _c.z; R.avoidC.x = _c.x; R.avoidC.z = _c.z;
        R.sunward = Math.atan2(-_c.x, -_c.z);
        if (R.vis) R.vis.anim(dt, t, R.x, R.z, R.sunward);
      } else if (k === 'ion') {
        const a = ph.a0 + t * Math.PI * 2 / ph.dperiod;
        R.x = R.hx + Math.sin(a) * ph.drift; R.z = R.hz + Math.cos(a) * ph.drift;
        if (R.vis) R.vis.anim(dt, t, R.x, R.z);
      }
      const camNear = Math.hypot(camF.x - R.x, camF.z - R.z) < R.reach + 2500;
      if (k === 'pulsar' && R.vis) R.vis.anim(dt, t, beamAngle(ph, t));
      if (k === 'asteroids' && R.vis) R.vis.anim(dt, t, camNear);
      if (k === 'magnetar') magnetarClock(R, t, camNear);
      if (k === 'tidal') tidalClock(R, t);
      // the captain's whereabouts
      if (pl && pl.alive && isInside(R, pl.position.x, pl.position.z)) { P.inside.push(R); if (!R.inside) notice(R, t); R.inside = true; } else R.inside = false;
      if (camNear) particles(R, dt, t);
      // ships
      for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        if (!s.alive || s.latched || (s === pl && warpGo())) continue;
        const dx = s.position.x - R.x, dz = s.position.z - R.z;
        if (k !== 'quasar' && k !== 'wormhole' && dx * dx + dz * dz > (R.reach + 200) * (R.reach + 200)) continue;
        act(R, s, dx, dz, dt, t);
      }
    }
    shots(dt);
    loot(dt);
    status();
  }
  // a line on the radar naming what the captain is inside
  let tagEl = null, tagTxt = '';
  function status() {
    const txt = P.inside.map((R) => R.K.name).join(' · ');
    if (txt === tagTxt) return;
    tagTxt = txt;
    if (!tagEl) { const r = document.getElementById('radar'); if (!r) return; tagEl = document.createElement('div'); tagEl.className = 'phen'; r.appendChild(tagEl); }
    const R = P.inside[0];
    tagEl.textContent = txt ? (P.inside.some((q) => q.K.hazard) ? '⚠ ' : '') + txt : '';
    tagEl.style.color = R ? R.K.css : '';
  }

  const warpGo = () => { const w = game.warpState && game.warpState(); return !!(w && w.phase === 'go'); };
  function isInside(R, x, z) {
    const ph = R.ph;
    if (ph.kind === 'quasar') return laneAt(ph, x, z) >= 0;
    if (ph.kind === 'comet') return inTail(R, x, z) || Math.hypot(x - R.x, z - R.z) < FX.comet.coma;
    if (ph.kind === 'wormhole') return Math.hypot(x - ph.x, z - ph.z) < ph.r || Math.hypot(x - ph.x2, z - ph.z2) < ph.r;
    if (ph.kind === 'pulsar' || ph.kind === 'magnetar' || ph.kind === 'tidal') return Math.hypot(x - R.x, z - R.z) < ph.r;
    return Math.hypot(x - R.x, z - R.z) < ph.r * 0.92;
  }
  // quasar lane: 0..1 strength across the lane (centre 1), -1 outside
  function laneAt(ph, x, z) {
    const rx = x - ph.x0, rz = z - ph.z0;
    const along = rx * ph.dx + rz * ph.dz;
    if (along < 0 || along > ph.len) return -1;
    const lat = Math.abs(rx * ph.dz - rz * ph.dx) / (ph.width / 2);
    return lat < 1 ? 1 - lat * lat : -1;
  }
  function inTail(R, x, z) {
    const C = FX.comet, ux = -Math.sin(R.sunward), uz = -Math.cos(R.sunward);   // away from the star
    const rx = x - R.x, rz = z - R.z, along = rx * ux + rz * uz;
    if (along < 0 || along > C.tail) return false;
    return Math.abs(rx * uz - rz * ux) < 120 + along * 0.12;
  }

  // ---------------------------------------------------------------- effects on one ship
  function act(R, s, dx, dz, dt, t) {
    const ph = R.ph, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, ms = s.maxSpeed, W = game.world;
    const isPl = s === game.player;
    switch (ph.kind) {
      case 'blackhole': {
        const c = whirl(d, ph.r);
        if (c.tan || c.rad) {
          // tangential (the spin's sense) and inward
          const tx = -uz * ph.spin, tz = ux * ph.spin;
          s.position.x += (tx * c.tan - ux * c.rad) * ms * dt;
          s.position.z += (tz * c.tan - uz * c.rad) * ms * dt;
        }
        const core = ph.r * FX.hole.core;
        if (d < core) {
          burn(s, s.maxHull * FX.hole.crush * dt);
          if (Math.random() < dt * 12) W.fx.explosion(s.randomHullPoint(_v), 0.3, 0xffa050);
        } else if (d < core * 2.2) burn(s, s.maxHull * FX.hole.tear * (2.2 - d / core) / 1.2 * dt);
        if (isPl && d < core * 3) game.cam.addShake(dt * 6 * (3 - d / core));
        break;
      }
      case 'well': {
        if (d < ph.r) {
          const f = FX.well.pull * Math.pow(1 - d / ph.r, 1.1);
          s.position.x -= ux * f * ms * dt; s.position.z -= uz * f * ms * dt;
          if (d < ph.r * FX.well.surgeIn && s.speed > ms * FX.well.surgeSpeed && !(s._slingT > t)) {
            s._slingT = t + 15; s.buffs.surge = t + 7;
            W.fx.ring(s.position, s.dims.L * 0.8, 0xb08aff, 36);
            if (isPl) { W.toast('Slingshot: engines surging', 'epic'); game.audio && game.audio.play('warp', s.position, 0.5); }
          }
        }
        break;
      }
      case 'repulsor': {
        if (d < ph.r) {
          const f = FX.repulse.push * Math.pow(1 - d / ph.r, 1.5);
          s.position.x += ux * f * ms * dt; s.position.z += uz * f * ms * dt;
        }
        break;
      }
      case 'wormhole': {
        // gentle draw into either mouth; the throat sends the ship out of the other one
        for (let m = 0; m < 2; m++) {
          const mx = m ? ph.x2 : ph.x, mz = m ? ph.z2 : ph.z;
          const ex = s.position.x - mx, ez = s.position.z - mz, e = Math.hypot(ex, ez) || 1;
          if (e > ph.r) continue;
          const f = 1 - e / ph.r;
          s.position.x += ((-ez / e) * FX.worm.swirl - (ex / e) * FX.worm.draw) * f * ms * dt;
          s.position.z += ((ex / e) * FX.worm.swirl - (ez / e) * FX.worm.draw) * f * ms * dt;
          if (e < FX.worm.throat && !(s._wormT > t)) transit(s, m ? ph.x : ph.x2, m ? ph.z : ph.z2, t);
        }
        break;
      }
      case 'eddy': if (d < ph.r) s.buffs.slowed = Math.max(s.buffs.slowed || 0, t + 0.25); break;
      case 'tidal': {
        const st = R.state;
        for (let i = 0; i < st.fronts.length; i++) {
          const fr = st.fronts[i];
          if (fr <= 0 || fr >= ph.r || Math.abs(d - fr) > FX.tidal.front) continue;
          const f = FX.tidal.shove * (1 - fr / ph.r);
          s.position.x += ux * FX.tidal.speed * f * dt; s.position.z += uz * FX.tidal.speed * f * dt;
          if (isPl && R.hit.get(s) !== st.wave + i * 0.1) { R.hit.set(s, st.wave + i * 0.1); game.cam.addShake(3); }
        }
        break;
      }
      case 'pulsar': {
        if (d > ph.r) break;
        if (d < ph.r * FX.pulsar.core) burn(s, s.maxHull * 0.03 * dt);
        if (inBeam(ph, t, dx, dz)) {
          if (!(s._beamT > t)) {
            stripShields(s, FX.pulsar.shield);
            burn(s, s.maxHull * FX.pulsar.hull * 0.25);
            s.buffs.disrupted = Math.max(s.buffs.disrupted || 0, t + FX.pulsar.disrupt);
            s.lastHit = t;
            W.fx.impact(s.position, 0x9ad8ff, 1.6, true);
            if (isPl) { game.engine.flash(0.12, 0x9ad8ff); game.audio && game.audio.play('beam', s.position, 0.8); }
          }
          s._beamT = t + 0.9;
        }
        break;
      }
      case 'magnetar': {
        const st = R.state;
        if (d < ph.r * FX.magnetar.core) burn(s, s.maxHull * 0.03 * dt);
        if (st.pr > 0 && Math.abs(d - st.pr) < 110 && R.hit.get(s) !== st.quake) {
          R.hit.set(s, st.quake);
          stripShields(s, FX.magnetar.strip);
          s.buffs.disrupted = Math.max(s.buffs.disrupted || 0, t + FX.magnetar.lock);
          s.lastHit = t;
          W.fx.ring(s.position, s.dims.L * 0.7, 0xe08aff, 30);
          if (isPl) { game.engine.flash(0.15, 0xc070ff); game.cam.addShake(4); }
        }
        break;
      }
      case 'quasar': {
        const k = laneAt(ph, s.position.x, s.position.z);
        if (k < 0) break;
        s.position.x += ph.dx * FX.quasar.carry * k * ms * dt; s.position.z += ph.dz * FX.quasar.carry * k * ms * dt;
        for (let i = 0; i < 4; i++) s.shields[i] = Math.max(0, s.shields[i] - s.maxShield * FX.quasar.drain * dt);
        s.envRegen = 0;
        break;
      }
      case 'ion': if (d < ph.r) s.envRegen *= FX.ion.regen; break;
      case 'dust': if (d < ph.r) s.veiled = true; break;
      case 'veil': if (d < ph.r) s.envRegen *= FX.veil.regen; break;
      case 'cryo': if (d < ph.r) { s.envRegen *= FX.cryo.regen; s.buffs.slowed = Math.max(s.buffs.slowed || 0, t + 0.25); } break;
      case 'ember': if (d < ph.r) { burn(s, s.maxHull * FX.ember.heat * dt); s.buffs.surge = Math.max(s.buffs.surge || 0, t + 0.25); } break;
      case 'remnant': if (d < ph.r && d > ph.r * FX.remnant.inner) burn(s, s.maxHull * FX.remnant.rad * dt); break;
      case 'comet': {
        const e = Math.hypot(s.position.x - R.x, s.position.z - R.z);
        bump(s, R.x, R.z, FX.comet.nucleus, e, t);
        if (inTail(R, s.position.x, s.position.z)) s.envRegen *= FX.comet.regen;
        break;
      }
      case 'asteroids': {
        for (let i = 0; i < R.solid.length; i++) {
          const o = R.solid[i];
          const e = Math.hypot(s.position.x - o.x, s.position.z - o.z);
          if (e < o.r + s.dims.W * 1.6 + 10) bump(s, o.x, o.z, o.r, e, t);
        }
        break;
      }
    }
  }
  // a hull meets a rock: pushed clear, and hurt in proportion to the speed it hit at
  function bump(s, x, z, r, e, t) {
    const min = r + s.dims.W * 1.3;
    if (e >= min || e < 1e-3) return;
    const nx = (s.position.x - x) / e, nz = (s.position.z - z) / e;
    s.position.x += nx * (min - e); s.position.z += nz * (min - e);
    const into = -(Math.sin(s.heading) * nx + Math.cos(s.heading) * nz);
    if (into > 0.3 && s.speed > s.maxSpeed * 0.35 && !(s._ramT > t)) {
      s._ramT = t + 1.2;
      const W = game.world;
      hitShip(W, s, s.maxHull * FX.rock.ram * (s.speed / s.maxSpeed), 'kinetic');
      s.speed *= 0.3;
      W.fx.impact(_v.set(x + nx * r, s.position.y, z + nz * r), 0xc0a080, 2.2, false);
      for (let i = 0; i < 3; i++) W.fx.smokePuff(_v, 10);
      if (s === game.player) { game.cam.addShake(5); game.audio && game.audio.play('hit', s.position, 1); }
    }
  }
  function transit(s, x, z, t) {
    const W = game.world;
    s._wormT = t + FX.worm.cool;
    W.fx.column(s.position, 0xc89aff, 120, 30);
    const h = s.heading;
    s.position.set(x + Math.sin(h) * FX.worm.exit, s.position.y, z + Math.cos(h) * FX.worm.exit);
    W.fx.column(s.position, 0x5af0ff, 120, 30);
    W.fx.ring(s.position, s.dims.L, 0xc89aff, 48);
    if (s === game.player) {
      game.cam.focus.copy(s.position); game.cam.lead.set(0, 0, 0);
      game.moveTarget = null;
      game.engine.flash(0.3, 0xb090ff);
      game.audio && game.audio.play('jump', s.position, 0.8);
      W.toast('Wormhole transit', 'epic');
    }
  }

  // ---------------------------------------------------------------- clocks for the periodic ones
  function magnetarClock(R, t, camNear) {
    const ph = R.ph, M = FX.magnetar, st = R.state;
    const n = Math.floor((t - ph.t0) / ph.period), at = ph.t0 + (n + 1) * ph.period;   // next quake
    const pl = game.player;
    const plNear = pl && Math.hypot(pl.position.x - R.x, pl.position.z - R.z) < ph.r + 900;
    if (t > at - M.telegraph && st.warned !== n + 1) {
      st.warned = n + 1;
      if (plNear) { game.world.warn({ kind: 'circle', pos: new THREE.Vector3(R.x, 0, R.z), r: ph.r, dur: M.telegraph, color: '#d070ff' }); game.world.toast('Magnetar: starquake building', 'warn'); }
    }
    const since = t - (ph.t0 + n * ph.period);
    st.quake = n;
    st.pr = since >= 0 && since * M.speed < ph.r ? since * M.speed : 0;
    const build = Math.max(0, 1 - (at - t) / M.telegraph);
    if (R.vis) R.vis.anim(0, t, build, st.pr, st.pr ? 1 - st.pr / ph.r : 0);
    if (st.pr && st.prev !== n && camNear) { st.prev = n; game.world.fx.ring(_v.set(R.x, 0, R.z), 120, 0xe0a0ff, 60); }
  }
  function tidalClock(R, t) {
    const ph = R.ph, st = R.state;
    st.fronts = st.fronts || [0, 0, 0];
    const since = t - ph.t0, n = Math.floor(since / ph.period);
    st.wave = n;
    for (let i = 0; i < 3; i++) { const age = since - (n - i) * ph.period; st.fronts[i] = age > 0 ? age * FX.tidal.speed : 0; }
    if (R.vis) R.vis.anim(0, t, st.fronts);
  }

  // ---------------------------------------------------------------- shots and loot
  function shots(dt) {
    const W = game.world, list = W.projectiles.list;
    if (!list.length) return;
    for (let ri = 0; ri < rts.length; ri++) {
      const R = rts[ri], ph = R.ph, k = ph.kind;
      if (k !== 'blackhole' && k !== 'well' && k !== 'repulsor' && k !== 'eddy' && k !== 'asteroids') continue;
      const reach2 = (ph.r + 50) * (ph.r + 50);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const dx = p.pos.x - R.x, dz = p.pos.z - R.z, d2 = dx * dx + dz * dz;
        if (d2 > reach2) continue;
        const d = Math.sqrt(d2) || 1;
        if (k === 'blackhole') {
          const core = ph.r * FX.hole.core;
          if (d < core) { p.age = p.life; p.splash = 0; continue; }   // swallowed
          bend(p, -dx / d, -dz / d, 1.1 * Math.pow(core / d, 0.9), dt);
        } else if (k === 'well') bend(p, -dx / d, -dz / d, 0.35 * (1 - d / ph.r), dt);
        else if (k === 'repulsor') bend(p, dx / d, dz / d, 0.5 * (1 - d / ph.r), dt);
        else if (k === 'eddy') { if (d < ph.r) { p.pos.addScaledVector(p.vel, -dt * FX.eddy.slow); p.age -= dt * FX.eddy.slow; } }
        else if (k === 'asteroids') {
          // the big rocks are cover
          for (let j = 0; j < R.cover.length; j++) {
            const rk = R.cover[j], ex = p.pos.x - rk.x, ez = p.pos.z - rk.z;
            if (ex * ex + ez * ez < rk.s * rk.s * 0.8) {
              p.age = p.life;
              if (W.camNear(p.pos, 300) && Math.random() < 0.5) W.fx.impact(p.pos, 0xc8a070, 0.8, false);
              break;
            }
          }
        }
      }
    }
  }
  // turn a shot's velocity toward (ux, uz) at `rate` (fraction of its speed per second), keeping its speed
  function bend(p, ux, uz, rate, dt) {
    const a = Math.min(rate, 3) * p.speed * dt;
    p.vel.x += ux * a; p.vel.z += uz * a;
    const l = p.vel.length() || 1;
    p.vel.multiplyScalar(p.speed / l);
  }
  function loot(dt) {
    const W = game.world, drops = W.loot.drops;
    for (let ri = 0; ri < rts.length; ri++) {
      const R = rts[ri], ph = R.ph;
      if (ph.kind !== 'blackhole' && ph.kind !== 'well') continue;
      for (let i = drops.length - 1; i >= 0; i--) {
        const q = drops[i];
        const dx = R.x - q.pos.x, dz = R.z - q.pos.z, d = Math.hypot(dx, dz) || 1;
        if (d > ph.r) continue;
        const pull = (ph.kind === 'blackhole' ? 60 : 25) * (1 - d / ph.r) + 10;
        q.vel.x += dx / d * pull * dt; q.vel.z += dz / d * pull * dt;
        if (ph.kind === 'blackhole' && d < ph.r * FX.hole.core) drops.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- particles (only while the camera is near)
  function particles(R, dt, t) {
    const W = game.world, G = W.fx.glow, ph = R.ph;
    const q = W.fx.q || 1;
    const n = (rate) => { const x = rate * dt * q; return Math.floor(x) + (Math.random() < x % 1 ? 1 : 0); };
    switch (ph.kind) {
      case 'blackhole': {
        const core = ph.r * FX.hole.core;
        for (let i = n(70); i > 0; i--) {
          const a = Math.random() * Math.PI * 2, r = core * 1.2 + Math.pow(Math.random(), 1.6) * ph.r * 0.8;
          const c = whirl(r, ph.r), sp = 140 + 900 * (core / r);
          const ux = Math.sin(a), uz = Math.cos(a), tx = -uz * ph.spin, tz = ux * ph.spin;
          const hot = core / r;
          G.emit(R.x + ux * r, -8, R.z + uz * r, (tx * c.tan - ux * c.rad) * sp, 0, (tz * c.tan - uz * c.rad) * sp, 0.7 + Math.random() * 0.6, 1.4 + hot * 2, 0.6 + hot * 1.6, 0.25 + hot, 0.7, 6 + 10 * hot, 2, 0, 0);
        }
        break;
      }
      case 'well': for (let i = n(18); i > 0; i--) { const a = Math.random() * 6.283, r = ph.r * (0.4 + Math.random() * 0.6); G.emit(R.x + Math.sin(a) * r, -4, R.z + Math.cos(a) * r, -Math.sin(a) * r * 0.5, 0, -Math.cos(a) * r * 0.5, 1.6, 0.7, 0.5, 1.4, 0.5, 5, 1, 0, 0); } break;
      case 'repulsor': for (let i = n(22); i > 0; i--) { const a = Math.random() * 6.283, sp = 160 + Math.random() * 200; G.emit(R.x, -4, R.z, Math.sin(a) * sp, 0, Math.cos(a) * sp, ph.r / sp, 1.4, 1.5, 1.8, 0.5, 6, 2, 0, 0); } break;
      case 'ion': for (let i = n(10); i > 0; i--) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * ph.r; G.emit(R.x + Math.sin(a) * r, Math.random() * 40 - 60, R.z + Math.cos(a) * r, 0, 0, 0, 0.15, 1.2, 2.4, 3, 0.9, 14, 2, 0, 0); } break;
      case 'cryo': for (let i = n(14); i > 0; i--) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * ph.r; G.emit(R.x + Math.sin(a) * r, Math.random() * 60 - 40, R.z + Math.cos(a) * r, 0, -2, 0, 1.4, 1.6, 2, 2.4, 0.7, 2.5, 0.5, 0, 0); } break;
      case 'eddy': for (let i = n(8); i > 0; i--) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * ph.r; G.emit(R.x + Math.sin(a) * r, -2, R.z + Math.cos(a) * r, Math.cos(a) * 6, 2, -Math.sin(a) * 6, 4, 1.6, 1.3, 0.6, 0.4, 5, 1, 0, 0); } break;
      case 'quasar': for (let i = n(40); i > 0; i--) {
        const s = Math.random() * ph.len, l = (Math.random() - 0.5) * ph.width * 0.8;
        const x = ph.x0 + ph.dx * s + ph.dz * l, z = ph.z0 + ph.dz * s - ph.dx * l;
        if (Math.hypot(x - game.cam.focus.x, z - game.cam.focus.z) > 2600) continue;
        G.emit(x, -10, z, ph.dx * 900, 0, ph.dz * 900, 0.5, 1.6, 1.6, 2.6, 0.6, 5, 1, 0, 0);
      } break;
      case 'comet': for (let i = n(30); i > 0; i--) {
        const ux = -Math.sin(R.sunward), uz = -Math.cos(R.sunward), sp = 120 + Math.random() * 260;
        G.emit(R.x + (Math.random() - 0.5) * 80, 10, R.z + (Math.random() - 0.5) * 80, ux * sp + (Math.random() - 0.5) * 40, 0, uz * sp + (Math.random() - 0.5) * 40, 3 + Math.random() * 3, 0.9, 1.6, 2.4, 0.5, 8, 30, 0.2, 0);
      } break;
    }
    // the ion storm's lightning and the shedding ones are tied to the captain being near (they are for the eye)
    if (ph.kind === 'ion') lightning(R, dt);
    if (ph.kind === 'repulsor' || ph.kind === 'remnant' || ph.kind === 'comet') shed(R, dt, t);
  }
  function lightning(R, dt) {
    const W = game.world, st = R.state, pl = game.player, I = FX.ion;
    if (!pl || !pl.alive) return;
    st.strikeT -= dt;
    if (st.strikeT > 0) return;
    st.strikeT = I.strike[0] + Math.random() * (I.strike[1] - I.strike[0]);
    // half the strikes fall near the captain when inside; the rest anywhere in the cell
    const inside = Math.hypot(pl.position.x - R.x, pl.position.z - R.z) < R.ph.r;
    let x, z;
    if (inside && Math.random() < 0.5) { const a = Math.random() * 6.283, r = Math.random() * 380; x = pl.position.x + Math.sin(a) * r; z = pl.position.z + Math.cos(a) * r; }
    else { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * R.ph.r; x = R.x + Math.sin(a) * r; z = R.z + Math.cos(a) * r; }
    const at = new THREE.Vector3(x, 0, z);
    W.warn({ kind: 'circle', pos: at, r: I.radius, dur: I.warn, color: '#7af0ff' });
    W.schedule(I.warn, () => {
      // a jagged bolt out of the cloud
      let prev = _w.set(x + (Math.random() - 0.5) * 60, 420, z + (Math.random() - 0.5) * 60).clone();
      for (let i = 1; i <= 5; i++) {
        const nxt = new THREE.Vector3(x + (Math.random() - 0.5) * 50 * (5 - i) / 5, 420 * (1 - i / 5), z + (Math.random() - 0.5) * 50 * (5 - i) / 5);
        W.beams.add(prev, nxt, 0xbff8ff, 3, 0.25); prev = nxt;
      }
      W.fx.explosion(at, 0.5, 0x7af0ff);
      if (W.camNear(at, 400)) game.audio && game.audio.play('beam', at, 0.9);
      for (const s of W.ships) {
        if (!s.alive || Math.hypot(s.position.x - x, s.position.z - z) > I.radius + s.dims.W) continue;
        hitShip(W, s, s.maxHull * I.hull, 'energy');
        s.buffs.disrupted = Math.max(s.buffs.disrupted || 0, game.engine.time + I.disrupt);
      }
    });
  }
  // exotic matter and ice: a few salvage drops for the captain who goes and looks
  function shed(R, dt, t) {
    const W = game.world, pl = game.player, st = R.state, ph = R.ph;
    if (!pl || !pl.alive) return;
    const d = Math.hypot(pl.position.x - R.x, pl.position.z - R.z), dz = game.sector.sys.danger;
    if (ph.kind === 'remnant') {
      if (!st.seeded && d < ph.r + 300) {
        st.seeded = true;
        const n = 4 + Math.floor(dz / 15);
        for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + ph.seed % 7, r = ph.r * 0.78; W.loot.dropSalvage(4 + Math.ceil(dz / 3), _v.set(R.x + Math.sin(a) * r, 0, R.z + Math.cos(a) * r)); }
        W.toast('Exotic matter detected in the shell', 'epic');
      }
    } else if (ph.kind === 'repulsor') {
      st.shedT -= dt;
      if (st.shedT <= 0 && d < ph.r * 2) {
        st.shedT = FX.repulse.every;
        W.loot.dropSalvage(3 + Math.ceil(dz / 4), _v.set(R.x, 0, R.z));
        const q = W.loot.drops[W.loot.drops.length - 1]; const a = Math.random() * 6.283;
        if (q) q.vel.set(Math.sin(a) * 160, 0, Math.cos(a) * 160);
      }
    } else if (ph.kind === 'comet') {
      st.shedT = (st.shedT ?? 6) - dt;
      if (st.shedT <= 0 && inTail(R, pl.position.x, pl.position.z) && (st.shed || 0) < 5) {
        st.shedT = 7; st.shed = (st.shed || 0) + 1;
        W.loot.dropSalvage(2 + Math.ceil(dz / 5), _v.copy(pl.position).add(_w.set(Math.sin(pl.heading) * 220, 0, Math.cos(pl.heading) * 220)));
      }
      if (d > FX.comet.tail * 2) st.shed = 0;
    }
  }

  // ---------------------------------------------------------------- radar and system map
  // radar: map(p) -> [x, y] in canvas pixels, k pixels per unit
  P.drawRadar = (c, map, k, center) => {
    if (!rts.length) return;
    for (const R of rts) {
      const ph = R.ph, K = R.K;
      if (ph.kind === 'quasar') {
        const [ax, ay] = map(_v.set(ph.x0, 0, ph.z0)), [bx, by] = map(_v.set(ph.x0 + ph.dx * ph.len, 0, ph.z0 + ph.dz * ph.len));
        c.strokeStyle = 'rgba(220,220,255,0.18)'; c.lineWidth = Math.max(2, ph.width * k); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        continue;
      }
      if (Math.hypot(R.x - center.x, R.z - center.z) > 1800 + R.reach + 400) continue;
      const [x, y] = map(_v.set(R.x, 0, R.z));
      if (ph.kind === 'asteroids') {
        c.fillStyle = 'rgba(190,170,140,0.55)';
        for (const o of R.solid) { const [rx, ry] = map(_v.set(o.x, 0, o.z)); const rr = Math.max(1, o.r * k); c.beginPath(); c.arc(rx, ry, rr, 0, Math.PI * 2); c.fill(); }
        continue;
      }
      const r = (ph.kind === 'comet' ? FX.comet.coma : ph.r) * k;
      c.globalAlpha = K.hazard ? 0.22 : 0.14; c.fillStyle = K.css; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.6; c.strokeStyle = K.css; c.lineWidth = 1.5; c.setLineDash(K.hazard ? [6, 4] : []); c.stroke(); c.setLineDash([]);
      if (ph.kind === 'blackhole') { c.globalAlpha = 1; c.fillStyle = '#000'; c.strokeStyle = '#ffae6a'; c.beginPath(); c.arc(x, y, Math.max(3, ph.r * FX.hole.core * k), 0, Math.PI * 2); c.fill(); c.stroke(); }
      if (ph.kind === 'pulsar') {
        const a = beamAngle(ph, game.engine.time), [bx, by] = map(_v.set(R.x + Math.sin(a) * ph.r, 0, R.z + Math.cos(a) * ph.r));
        c.globalAlpha = 0.8; c.strokeStyle = '#cfeaff'; c.lineWidth = 2; c.beginPath(); c.moveTo(2 * x - bx, 2 * y - by); c.lineTo(bx, by); c.stroke();
      }
      if (ph.kind === 'wormhole') { const [x2, y2] = map(_v.set(ph.x2, 0, ph.z2)); c.globalAlpha = 0.5; c.beginPath(); c.arc(x2, y2, r, 0, Math.PI * 2); c.stroke(); }
      c.globalAlpha = 1;
    }
    // dust: a captain inside sees only static past close range
    const pl = game.player;
    if (pl && pl.veiled) { c.fillStyle = 'rgba(40,30,50,0.35)'; c.fillRect(0, 0, c.canvas.width, c.canvas.height); }
  };
  // radar: hide ships the dust is hiding
  P.radarHides = (o) => { const pl = game.player; return o.veiled && pl && o.position.distanceTo(pl.position) > FX.dust.sight; };

  // system map: X(x), Y(z) to canvas, S pixels per unit
  P.drawMap = (c, X, Y, S) => {
    c.save();
    for (const R of rts) {
      const ph = R.ph, K = R.K;
      if (ph.kind === 'quasar') {
        c.strokeStyle = 'rgba(230,225,255,0.22)'; c.lineWidth = Math.max(3, ph.width * S); c.beginPath(); c.moveTo(X(ph.x0), Y(ph.z0)); c.lineTo(X(ph.x0 + ph.dx * ph.len), Y(ph.z0 + ph.dz * ph.len)); c.stroke();
        mark(c, X(ph.x), Y(ph.z), K);
        continue;
      }
      if (ph.kind === 'comet') {
        // its orbit, dotted, and where it is now
        c.strokeStyle = 'rgba(190,234,255,0.25)'; c.setLineDash([2, 5]); c.lineWidth = 1; c.beginPath();
        for (let i = 0; i <= 64; i++) { cometPos(ph, i / 64 * ph.period, _c); i ? c.lineTo(X(_c.x), Y(_c.z)) : c.moveTo(X(_c.x), Y(_c.z)); }
        c.stroke(); c.setLineDash([]);
        mark(c, X(R.x), Y(R.z), K);
        continue;
      }
      const draw = (x, z) => {
        c.globalAlpha = K.hazard ? 0.2 : 0.12; c.fillStyle = K.css; c.beginPath(); c.arc(X(x), Y(z), Math.max(4, ph.r * S), 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.55; c.strokeStyle = K.css; c.lineWidth = 1; c.setLineDash(K.hazard ? [5, 3] : []); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        mark(c, X(x), Y(z), K);
      };
      draw(R.x, R.z);
      if (ph.kind === 'wormhole') {
        draw(ph.x2, ph.z2);
        c.strokeStyle = 'rgba(200,154,255,0.3)'; c.setLineDash([3, 6]); c.beginPath(); c.moveTo(X(ph.x), Y(ph.z)); c.lineTo(X(ph.x2), Y(ph.z2)); c.stroke(); c.setLineDash([]);
      }
    }
    c.restore();
  };
  function mark(c, x, y, K) {
    c.font = '600 13px Rajdhani, sans-serif'; c.textAlign = 'center';
    c.lineWidth = 3; c.strokeStyle = 'rgba(4,8,20,0.8)'; c.strokeText(K.glyph, x, y + 4);
    c.fillStyle = K.css; c.fillText(K.glyph, x, y + 4);
  }
  // map legend entries ([glyph, name])
  P.legend = () => {
    const seen = new Set(), out = [];
    for (const p of P.list) if (!seen.has(p.kind)) { seen.add(p.kind); out.push([KINDS[p.kind].glyph, KINDS[p.kind].name.toLowerCase(), KINDS[p.kind].css]); }
    return out;
  };
  // what's at a map point (for hover)
  P.at = (x, z, slack = 0) => {
    for (const R of rts) {
      const ph = R.ph;
      if (ph.kind === 'quasar') { if (laneAt(ph, x, z) >= 0) return R; continue; }
      const r = ph.kind === 'comet' ? FX.comet.coma : ph.r;
      if (Math.hypot(x - R.x, z - R.z) < r + slack) return R;
      if (ph.kind === 'wormhole' && Math.hypot(x - ph.x2, z - ph.z2) < r + slack) return R;
    }
    return null;
  };
}
