// The crew aboard the player's ship, alive in the game: their work feeds the ship's stats (a stat provider), they learn
// from every kill, get hurt when the hull is holed, heal in sickbay, and grumble or cheer.
// Lives in game.data.crew (plain JSON, created lazily) so it saves with the captain.
import * as THREE from 'three/webgpu';
import { CHASSIS_BY_ID } from '../data/chassis.js';
import {
  DEPTS, OFFICER_POSTS, generateCrew, fitToChassis, crewStats, deptReport, tickCrew, casualties, awardXp,
  changeMorale, rollRecruits, recruitCost, removeMember, promote, appoint, officerOf, avgMorale, skillOf, rankName, canPromote,
} from './data.js';
import { deckPlan, roomAt } from './layout.js';

const _v = new THREE.Vector3();
const RECRUIT_REFRESH = 300;   // seconds of game time between fresh recruit lists

export class CrewSystem {
  constructor(game) {
    this.game = game;
    this.acc = 0;
    this.applied = null;     // stats last pushed to the ship
    this.cache = null;       // current stats
    this.refitT = 0;
    this.dirty = true;
    this.hits = [];          // recent hull hits for the cutaway: {room, t}
    this.listeners = new Set();
    this.provider = () => this.stats();
  }

  get data() { return this.game.data; }
  get chassis() { return CHASSIS_BY_ID[this.data.ship.chassis]; }

  // the crew state, created or fitted to the current hull on first use
  get state() {
    const P = this.data;
    if (!P) return null;
    if (!P.crew) {
      P.crew = generateCrew(this.chassis, (Math.random() * 1e9) >>> 0);
      this.dirty = true;
    }
    if (P.crew.chassis !== P.ship.chassis) {
      const { removed, added } = fitToChassis(P.crew, this.chassis);
      this.plan = null;
      this.dirty = true;
      if (this.game.ui && (removed.length || added.length)) this.game.ui.chat('CREW', null, `Crew fitted to the new hull: ${added.length} joined, ${removed.length} transferred ashore`, 'sys');
    }
    return P.crew;
  }

  deckPlan() {
    const ch = this.chassis;
    if (!this.plan || this.plan.chassis !== ch.id) { this.plan = deckPlan(ch); this.plan.chassis = ch.id; }
    return this.plan;
  }

  stats() {
    const st = this.state;
    if (!st) return {};
    if (this.dirty || !this.cache) { this.cache = crewStats(st, this.chassis); this.dirty = false; }
    return this.cache;
  }
  report() { return deptReport(this.state, this.chassis); }

  // wire into the world once the game has started (world and ui exist)
  attach() {
    const g = this.game;
    if (this.attached === g.world) return;
    this.attached = g.world;
    const ev = g.world.events;
    ev.on('damage', (d) => this.onDamage(d));
    ev.on('kill', ({ ship, killer }) => {
      if (ship === g.player) this.onShipLost();
      else if (ship.team !== 1 && (ship.playerTagged || (killer && killer.isPlayer))) {
        const st = this.state; if (!st) return;
        changeMorale(st, 0.6 + ship.elite * 2.5);
        for (const m of st.members) if (m.section === 'tactical' && m.status === 'ok' && Math.random() < 0.15) m.kills++;
      }
    });
    void this.state;       // make sure there is a crew
    this.changed(true);
  }

  // called when the commander gains xp (Game.gainXp is wrapped in install)
  onXp(xp) {
    const st = this.state; if (!st || !xp) return;
    const ups = awardXp(st, xp);
    if (ups.length) {
      this.dirty = true;
      const off = ups.filter((m) => m.officer);
      for (const m of off) this.say(`${OFFICER_POSTS[m.officer].short} ${m.name} reached level ${m.lvl}`, 'sys');
      if (ups.length > off.length) this.say(`${ups.length - off.length} crew advanced a level`, 'sys');
    }
  }

  onDamage(d) {
    const g = this.game, s = g.player;
    if (!s || d.ship !== s || d.shield || !(d.amount > 0)) return;
    const st = this.state; if (!st) return;
    // every ~5% of the hull holed costs the crew something, in the section that was hit
    st.dmgAcc = (st.dmgAcc || 0) + d.amount / s.maxHull;
    if (st.dmgAcc < 0.05) return;
    const sev = Math.min(2.5, st.dmgAcc / 0.05);
    st.dmgAcc = 0;
    _v.copy(d.point).sub(s.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -s.heading);
    const plan = this.deckPlan();
    // (shots strike the flanks at about the waterline: spread the hit over the decks)
    const room = roomAt(plan, s.dims, _v.x, _v.y + (Math.random() - 0.4) * (s.dims.Ht + s.dims.Hb) * 1.1, _v.z);
    const r = casualties(st, this.chassis, room.sec, sev * 0.8);
    this.hits.push({ room: room.id, t: g.engine.realTime });
    if (this.hits.length > 20) this.hits.shift();
    if (r.killed.length) this.say(`Casualties in ${room.name}: ${r.killed.map((m) => m.name).join(', ')} killed${r.wounded.length ? `, ${r.wounded.length} wounded` : ''}`, 'bad');
    else if (r.wounded.length) this.say(`${room.name} hit: ${r.wounded.length} wounded`, 'warn');
    for (const m of r.killed) this.emit('death', m);
    if (r.killed.length || r.wounded.length) this.changed();
    else { this.dirty = true; this.emit('hit', room); }
  }

  onShipLost() {
    const st = this.state; if (!st) return;
    const lost = [];
    for (const m of st.members.slice()) {
      const r = Math.random();
      if (r < (m.officer ? 0.05 : 0.14)) { removeMember(st, m); lost.push(m); }
      else if (r < 0.5) { m.status = 'wounded'; m.wound = 60 + Math.random() * 120; }
    }
    changeMorale(st, -18);
    st.fires = {};
    if (lost.length) this.say(`${lost.length} crew did not reach the escape pods`, 'bad');
    this.changed();
  }

  say(text, kind = 'sys') {
    const ui = this.game.ui;
    if (!ui) return;
    ui.chat('CREW', null, text, kind === 'bad' ? 'loot' : 'sys');
    const st = this.state;
    st.log.push({ t: Math.round(this.data.playtime), text });
    if (st.log.length > 40) st.log.shift();
  }

  on(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit(type, d) { for (const f of this.listeners) f(type, d); }

  // something about the crew changed: recompute bonuses and refit the ship (throttled; refit rebuilds weapon meshes)
  changed(force = false) {
    this.dirty = true; this.check = true;
    this.emit('changed');
    if (force) this.refitT = 0;
  }

  update(dt, t, realDt) {
    const g = this.game;
    if (!g.data || !g.world) return;
    this.refitT -= realDt;
    this.acc += dt;
    if (this.acc >= 1) {
      const step = Math.min(this.acc, 5);
      this.acc = 0;
      const st = this.state;
      if (tickCrew(st, this.chassis, step)) this.changed();
      this.dirty = true; this.check = true;
      st.recruitT = (st.recruitT || 0) + step;
      if (st.recruitT > RECRUIT_REFRESH || !st.recruits.length) { st.recruitT = 0; st.recruits = rollRecruits(st, this.chassis); this.emit('recruits'); }
    }
    // push new bonuses to the ship when they moved enough, at most every 4 s
    if (this.check && this.refitT <= 0 && g.player) {
      this.check = false;
      const s = this.stats();
      if (!same(s, this.applied)) {
        this.applied = { ...s };
        this.refitT = 4;
        g.refitPlayer();
      }
    }
  }

  // ---------------- captain's orders (from the Crew window and the bridge) ----------------
  canHire() {
    // TODO(stations): hiring belongs at starbases. Until stations land, `game.atStation` is undefined and hiring is
    // allowed anywhere; once it exists (bool or fn), only allow it while docked.
    const a = this.game.atStation;
    const v = typeof a === 'function' ? a.call(this.game) : a;
    return v === undefined || !!v;
  }
  hire(recruit) {
    const st = this.state, P = this.data, ch = this.chassis;
    if (!this.canHire()) return this.fail('Recruits can only be signed at a station');
    if (st.members.length >= ch.crew[1]) return this.fail(`Quarters are full (${ch.crew[1]} berths)`);
    const cost = recruit.cost ?? recruitCost(recruit, ch);
    if (P.credits < cost) return this.fail(`Not enough credits (${cost} ¢)`);
    P.credits -= cost;
    st.recruits.splice(st.recruits.indexOf(recruit), 1);
    delete recruit.cost;
    recruit.morale = Math.max(recruit.morale, 75);
    st.members.push(recruit);
    this.say(`${recruit.name} signed on as ${rankName(recruit)}, ${DEPTS[recruit.dept].name}`);
    this.changed(true);
    return true;
  }
  rerollRecruits() {
    const P = this.data, cost = 40 * this.chassis.tier;
    if (P.credits < cost) return this.fail(`Not enough credits (${cost} ¢)`);
    P.credits -= cost;
    const st = this.state; st.recruits = rollRecruits(st, this.chassis); st.recruitT = 0;
    this.emit('recruits');
    return true;
  }
  dismiss(m) {
    const st = this.state;
    if (st.members.length <= 1) return this.fail('Someone has to fly the ship');
    removeMember(st, m);
    changeMorale(st, -1.5, (x) => x.section === m.section);
    this.say(`${m.name} dismissed from service`);
    this.changed(true);
    return true;
  }
  reassign(m, dept) {
    if (!DEPTS[dept] || m.section === dept) return false;
    m.section = dept;
    if (m.officer && OFFICER_POSTS[m.officer].dept !== dept) { delete this.state.officers[m.officer]; m.officer = null; }
    this.changed(true);
    return true;
  }
  promote(m) {
    const P = this.data;
    if (!canPromote(m)) return this.fail(`${m.name} needs more experience`);
    const cost = Math.round(80 * Math.pow(m.rank + 1, 2.1));
    if (P.credits < cost) return this.fail(`Promotion costs ${cost} ¢`);
    P.credits -= cost;
    promote(this.state, m);
    this.say(`${m.name} promoted to ${rankName(m)}`);
    this.changed(true);
    return true;
  }
  appoint(post, m) {
    appoint(this.state, post, m);
    if (m.section !== OFFICER_POSTS[post].dept) m.section = OFFICER_POSTS[post].dept;
    this.say(`${m.name} appointed ${OFFICER_POSTS[post].name}`);
    this.changed(true);
    return true;
  }
  // orders from the bridge
  rally(amount, dept = null) { changeMorale(this.state, amount, dept ? (m) => m.section === dept : null); this.changed(); }
  douse() { const f = this.state.fires; for (const k of Object.keys(f)) f[k] = Math.min(f[k], 2); this.changed(); }
  triage() { for (const m of this.state.members) if (m.status === 'wounded') m.wound *= 0.4; this.changed(); }

  officer(post) { return officerOf(this.state, post); }
  // whoever stands the watch at a post: the officer, or the best hand in that department
  onDuty(post) {
    const o = officerOf(this.state, post); if (o) return { m: o, acting: false };
    const dept = OFFICER_POSTS[post].dept;
    let best = null;
    for (const m of this.state.members) if (m.section === dept && m.status === 'ok' && (!best || skillOf(m) > skillOf(best))) best = m;
    return best ? { m: best, acting: true } : null;
  }
  morale() { return avgMorale(this.state); }
  skill(m, dept) { return skillOf(m, dept); }
  fail(msg) { if (this.game.ui) this.game.ui.toast(msg, 'warn'); return false; }
}

function same(a, b) {
  if (!b) return false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (Math.abs((a[k] || 0) - (b[k] || 0)) > (k === 'armor' ? 0.5 : k === 'hullRegen' ? 0.0002 : 0.006)) return false;
  return true;
}
