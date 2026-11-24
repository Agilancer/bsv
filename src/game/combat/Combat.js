// Hit detection and the damage model.
//  - Ships are capsules along their keel; with shields up the capsule is fattened to the bubble.
//  - Four shield facings (fore, aft, port, starboard) like a ship-of-the-line: turn a fresh
//    side toward the enemy.
//  - Damage types: kinetic (good vs hull), energy (good vs shields), explosive (great vs hull,
//    poor vs shields), ion (strips shields, barely scratches hull).
import * as THREE from 'three/webgpu';
import { dpsCapVs } from '../data/balance.js';
import { DMG_TYPES as TYPE } from '../data/items.js';

const RETRIBUTION_R = 300;
export const FACINGS = ['fore', 'aft', 'port', 'starboard'];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3(), _l = new THREE.Vector3();

// closest points between segments p1-q1 and p2-q2 (returns squared distance, fills c1/c2)
function segSeg(p1, q1, p2, q2, c1, c2) {
  const d1 = _a.subVectors(q1, p1), d2 = _b.subVectors(q2, p2), r = _l.subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-8 && e <= 1e-8) { c1.copy(p1); c2.copy(p2); return c1.distanceToSquared(c2); }
  if (a <= 1e-8) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-8) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  c1.copy(p1).addScaledVector(d1, s); c2.copy(p2).addScaledVector(d2, t);
  return c1.distanceToSquared(c2);
}

// every shield facing of s above frac of its cap?
function shieldsAbove(s, frac) {
  const min = s.maxShield * 0.3 * frac, sh = s.shields;
  return !!sh && sh[0] > min && sh[1] > min && sh[2] > min && sh[3] > min;
}

const _s0 = new THREE.Vector3(), _s1 = new THREE.Vector3(), _fw = new THREE.Vector3();
export function shipCapsule(ship, outA, outB) {
  const r = ship.hitRadius();
  const half = Math.max(0, ship.dims.L * (ship.shieldsUp() ? 0.58 : 0.5) - r * 0.6);
  _fw.set(Math.sin(ship.heading), 0, Math.cos(ship.heading));
  outA.copy(ship.position).addScaledVector(_fw, -half);
  outB.copy(ship.position).addScaledVector(_fw, half);
  return r;
}

const hitResult = { ship: null, point: new THREE.Vector3() };
export function hitShipsAlong(world, p0, p1, team, ignore) {
  let best = null, bestD = Infinity;
  for (const s of world.ships) {
    if (!s.alive || s.team === team || s === ignore) continue;
    const dx = s.position.x - p1.x, dz = s.position.z - p1.z;
    const reach = s.dims.L * 0.7 + 30;
    if (dx * dx + dz * dz > reach * reach) continue;
    const r = shipCapsule(s, _s0, _s1);
    const d2 = segSeg(p0, p1, _s0, _s1, _c1, _c2);
    if (d2 < r * r) {
      const d = p0.distanceToSquared(_c1);
      if (d < bestD) { bestD = d; best = s; hitResult.point.copy(_c2).addScaledVector(_c1.sub(_c2).normalize(), r * 0.95); }
    }
  }
  if (!best) return null;
  hitResult.ship = best;
  return hitResult;
}

export class Combat {
  constructor(world) { this.world = world; }

  // which shield facing an impact from `from` strikes
  facingFor(ship, from) {
    const dx = from.x - ship.position.x, dz = from.z - ship.position.z;
    const a = Math.atan2(dx, dz) - ship.heading;
    const s = Math.sin(a), c = Math.cos(a);
    if (Math.abs(c) > Math.abs(s)) return c > 0 ? 0 : 1;
    return s > 0 ? 2 : 3;
  }

  projectileHit(p, ship, point) {
    p.hitAlready = true;
    // Brood Mother: warheads burst into six homing bomblets
    if (!p.isBomblet && p.ws && p.ws.unique && p.ws.unique.includes('clusterTorp')) {
      const W = this.world;
      for (let i = 0; i < 6; i++) {
        let tg = null, bd = 600 * 600;
        for (const s of W.ships) if (s.alive && s.team !== p.team) { const d = s.position.distanceToSquared(point) + Math.random() * 40000; if (d < bd) { bd = d; tg = s; } }
        const a = (i / 6) * Math.PI * 2;
        W.projectiles.spawn({ pos: point, vel: new THREE.Vector3(Math.sin(a) * 160, 0, Math.cos(a) * 160), kind: 'missile', team: p.team, owner: p.owner, target: tg, homing: 1, dmg: p.dmg * 0.22, dmgType: 'explosive', ws: { crit: 0, unique: [] }, life: 2.5, splash: 14, color: 0xffc040, size: 0.8, len: 3, trail: 1, turn: 4, isBomblet: true });
      }
    }
    if (p.splash > 0) this.splash(p, point, ship);
    else this.damage(ship, p.dmg, p.dmgType, point, p.owner, p.ws);
  }

  splash(p, point, direct) {
    const W = this.world;
    const r = p.splash || 20;
    W.fx.explosion(point, Math.max(0.25, r / 90), p.kind === 'torpedo' ? 0xff8a40 : p.color.getHex());
    if (W.audio) W.audio.play(r > 40 ? 'explosion' : 'hit', point, Math.min(1, 0.3 + r / 80));
    if (r > 40) W.cam.addShake(r / 40 * (W.player && point.distanceTo(W.player.position) < 400 ? 1 : 0.2));
    for (const s of W.ships) {
      if (!s.alive || s.team === p.team) continue;
      const d = s.position.distanceTo(point) - s.dims.W;
      if (s === direct || d < r) {
        const f = s === direct ? 1 : Math.max(0.25, 1 - d / r);
        this.damage(s, p.dmg * f, p.dmgType, point, p.owner, p.ws);
      }
    }
    // splash also detonates enemy missiles/torpedoes nearby (flak)
    const curtain = p.ws && p.ws.unique && p.ws.unique.includes('ironCurtain');
    const pdR2 = r * r * (curtain ? 8 : 2);
    if (p.pd) for (const q of W.projectiles.list) {
      if (q.team !== p.team && (q.kind === 'missile' || q.kind === 'torpedo') && q.pos.distanceToSquared(point) < pdR2) { q.age = q.life; q.pos.copy(q.pos); }
    }
    // Iron Curtain: the burst shreds strike craft too
    if (curtain && W.hangars) W.hangars.damageNear(point, r * 1.5, p.team, p.dmg * 3 * ((p.owner && p.owner.stats && p.owner.stats.dmgMul) || 1));
  }

  // Core damage entry. Returns damage dealt.
  damage(ship, amount, type, point, source, ws) {
    if (!ship.alive || ship.invuln) return 0;
    const W = this.world;
    const T = TYPE[type] || TYPE.kinetic;
    let crit = false;
    let dmg = amount;
    const srcStats = source && source.stats ? source.stats : null;
    const U = ws && ws.unique && ws.unique.length ? ws.unique : null;   // the weapon's own powers
    if (ws) {
      const critChance = (ws.crit || 0) + (srcStats ? srcStats.crit || 0 : 0) + 0.05;
      if (Math.random() < critChance) { crit = true; dmg *= 1.6 + (ws.critDmg || 0) + (srcStats ? srcStats.critDmg || 0 : 0); }
    }
    if (srcStats) dmg *= srcStats.dmgMul || 1;
    const now = W.engine.time;
    if (source && source.buffs && source.buffs.command > now) dmg *= 1.25;     // command aura
    if (source && source.clipper && source.speed > source.maxSpeed * 0.7) dmg *= 1.25;   // Clipper Doctrine
    if (ship.spottedUntil > now) dmg *= 1.2;                                     // painted by a spotter
    if (U && U.includes('executioner') && ship.hull < ship.maxHull * 0.3) dmg *= 1.75;   // Coup de Grace
    if (srcStats && srcStats.u_sovereign && shieldsAbove(source, 0.5)) dmg *= 1.2;          // Sovereign
    // Phantom Flight: a decoy craft takes a quarter of the hits meant for its carrier
    if (ship.stats && ship.stats.u_decoy && W.hangars && Math.random() < 0.25) {
      const dc = W.hangars.decoyFor(ship);
      if (dc) {
        dc.hp -= dmg;
        W.fx.impact(dc.pos, 0xd0a0ff, 0.8, true);
        if (dc.hp <= 0) W.hangars.destroy(dc);
        return 0;
      }
    }
    // boss contract: no single enemy can take the captain down faster than MIN_TTK
    if (ship.isPlayer && source && source.team !== ship.team) {
      const ehp = ship.maxHull + ship.maxShield * 1.2 * 0.5;
      const w = source._dmgWin || (source._dmgWin = { t: now, sum: 0 });
      if (now - w.t > 1) { w.t = now; w.sum = 0; }
      const allowed = Math.max(0, dpsCapVs(ehp) - w.sum);
      if (dmg > allowed) dmg = allowed;
      w.sum += dmg;
      if (dmg <= 0) return 0;
    }
    const fi = this.facingFor(ship, point);
    let shieldDealt = 0, hullDealt = 0;
    const ignoreShield = U && U.includes('shieldbreak') ? 0.4 : 0;
    // shields
    const sh = ship.shields[fi];
    if (sh > 0 && !ignoreShield) {
      const sMul = T.shield * (1 + (ws ? ws.shieldDmg || 0 : 0)) * (source && source.trait === 'covenant' ? 1.25 : 1);
      const want = dmg * sMul;
      const take = Math.min(sh, want);
      ship.shields[fi] -= take; shieldDealt = take;
      dmg = (want - take) / sMul; // leftover goes to hull at hull rate
      ship.onShieldHit(point, fi);
      W.fx.impact(point, ship.shieldColor, 1, true);
    } else if (sh > 0 && ignoreShield) {
      const sMul = T.shield * (1 + (ws.shieldDmg || 0));
      const take = Math.min(sh, dmg * sMul * (1 - ignoreShield));
      ship.shields[fi] -= take; shieldDealt = take;
      dmg = dmg * ignoreShield;
      ship.onShieldHit(point, fi);
    }
    // Retribution: a collapsing facing bursts outward and re-forms
    if (sh > 0 && ship.shields[fi] <= 0 && ship.stats && ship.stats.u_retribution && now > (ship._retributionT || 0)) this.retribution(ship, fi, now);
    if (dmg > 0.01) {
      const hMul = T.hull * (1 + (ws ? ws.hullDmg || 0 : 0));
      let h = dmg * hMul;
      if (ship.yardTrait === 'ironhold' && fi >= 2) h *= 0.8;   // armoured broadside facings
      const breached = ship.breachT > now ? ship.breachN : 0;   // Breach strips armour
      h *= 100 / (100 + Math.max(0, ship.armor - breached));
      if (ship.stats && ship.stats.u_stonewall) h = Math.min(h, ship.maxHull * 0.04);   // Stonewall
      ship.hull -= h; hullDealt = h;
      ship.lastHullHit = W.engine.time;
      W.fx.impact(point, 0xffb060, 1, false);
      if (U && U.includes('inferno')) ship.ignite(h * 0.6, 4, source);
      if (U && U.includes('breach')) { ship.breachN = Math.min(30, breached + 3); ship.breachT = now + 8; }
    }
    // ion disruption, Tidelock snare
    if (ws && ws.disrupt) ship.buffs.disrupted = Math.max(ship.buffs.disrupted || 0, now + ws.disrupt);
    if (U && U.includes('stasis')) ship.buffs.slowed = Math.max(ship.buffs.slowed || 0, now + 2);
    ship.lastHit = W.engine.time;
    ship.lastAttacker = source;
    if (source && source.team === 1 && ship.faction === 'rival' && !ship.provoked) { ship.provoked = true; W.toast(`${ship.name} turns hostile`, 'warn'); }
    const total = shieldDealt + hullDealt;
    if (crit && U && U.includes('overload')) {
      W.fx.explosion(point, 0.5, 0xffe070);
      for (const s of W.ships) if (s !== ship && s.alive && s.team === ship.team && s.position.distanceTo(point) < 60) this.damage(s, amount * 0.8, 'explosive', point, source, null);
    }
    if (crit && U && U.includes('hairTrigger') && ws.weapon) ws.weapon.cd = Math.min(ws.weapon.cd, 0.1);   // Hair Trigger
    if (crit && srcStats && srcStats.u_paint) ship.spottedUntil = Math.max(ship.spottedUntil || 0, now + 4);   // Choir's Gaze
    if (source && source.alive && source.stats && (source.stats.u_vampiric || (U && U.includes('vampiric')))) source.repair(total * 0.04);
    if (source && source.alive && source.trait === 'covenant') source.repair(total * 0.08);   // the Covenant feed
    ship.recentDmg = (ship.recentDmg || 0) + total;
    W.events.emit('damage', { ship, amount: total, crit, shield: hullDealt < 0.01, point, source });
    if (ship.hull <= 0) W.kill(ship, source);
    return total;
  }

  // Retribution (module power): the collapsing facing's stored charge bursts outward
  retribution(ship, fi, now) {
    const W = this.world;
    ship._retributionT = now + 12;
    const cap = ship.maxShield * 0.3;
    ship.shields[fi] = cap * 0.25;
    const dmg = cap / ((ship.stats && ship.stats.dmgMul) || 1);   // the full facing, whatever the ship's damage bonus
    W.fx.ring(ship.position, RETRIBUTION_R, ship.shieldColor, 64);
    for (const s of W.ships) {
      if (!s.alive || !W.hostile(ship, s) || s.position.distanceToSquared(ship.position) > RETRIBUTION_R * RETRIBUTION_R) continue;
      this.damage(s, dmg, 'energy', s.position, ship, null);
    }
  }

  beam(owner, ws, from, target, color, width) {
    const W = this.world;
    const to = _c1.copy(target.position);
    to.x += (Math.random() - 0.5) * target.dims.W; to.z += (Math.random() - 0.5) * target.dims.L * 0.4;
    // end the beam at the bubble or hull surface
    const r = target.hitRadius();
    const dir = _c2.copy(to).sub(from); const len = dir.length(); dir.normalize();
    const end = _l.copy(from).addScaledVector(dir, Math.max(0, len - r * 0.8));
    W.beams.add(from, end, color, width, ws.kind === 'beam' && ws.dmg > 150 ? 0.6 : 0.3);
    this.damage(target, ws.dmg, ws.dmgType, end, owner, ws);
    W.fx.impact(end, color, 1.3, target.shieldsUp());
    if (ws.unique && ws.unique.includes('chainLance')) {
      let from2 = end.clone(), hit = new Set([target]);
      for (let k = 0; k < 2; k++) {
        let best = null, bd = 260 * 260;
        for (const s of W.ships) if (s.alive && s.team !== owner.team && !hit.has(s)) { const d = s.position.distanceToSquared(from2); if (d < bd) { bd = d; best = s; } }
        if (!best) break;
        hit.add(best);
        W.beams.add(from2, best.position, 0xbfe8ff, width * 0.6, 0.3);
        this.damage(best, ws.dmg * 0.5, ws.dmgType, best.position, owner, null);
        from2 = best.position.clone();
      }
    }
  }
}
