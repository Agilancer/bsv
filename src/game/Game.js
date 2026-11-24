// Ties it together: the captain's data, the space World, the UI, the helm, rewards.
import * as THREE from 'three/webgpu';
import { World } from './World.js';
import { Sector } from './Sector.js';
import { UI } from '../ui/UI.js';
import { CHASSIS_BY_ID } from './data/chassis.js';
import { ABILITIES, ABILITY_BY_KEY } from './data/abilities.js';
import { RARITY, rollItem, grantItemXp, BASES } from './data/items.js';
import { newPlayer, load, save, wipe, xpForLevel, shipXpForLevel, MAX_LEVEL, INV_SIZE, slotKeys, slotType, itemScore } from './Player.js';
import { THROTTLE_STEPS } from './ship/Ship.js';
import { galaxy } from './galaxy.js';
import { talentStats, talentWeaponMod, rank, canLearn, TALENT_BY_KEY } from './data/talents.js';
import { RNG, clamp } from '../engine/rng.js';
import { PLAYER_NAMES, CHAT } from './data/names.js';
import { Audio } from '../engine/Audio.js';

const _v = new THREE.Vector3();

export class Game {
  constructor(engine, input, cam) {
    this.engine = engine; this.input = input; this.cam = cam;
    this.cooldowns = {};
    this.showArcs = true;
    this.autoplay = null;
    this.saveT = 20;
    this.moveTarget = null;
    this.mode = 'space';
    this.activeMode = null;      // {update(dt,t,realDt), exit()} for non-space modes (planet, bridge...)
    this.statProviders = [];     // fns(game) -> {stat: value}, merged into the player's ship
  }

  // Enter a full-screen mode with its own scene (planet surface, bridge). Space sim pauses.
  enterMode(name, mode) {
    if (this.activeMode && this.activeMode.exit) this.activeMode.exit();
    this.mode = name; this.activeMode = mode;
    this.ui.setHud(name === 'space');
  }
  exitMode() {
    if (this.activeMode && this.activeMode.exit) this.activeMode.exit();
    this.activeMode = null; this.mode = 'space';
    this.engine.setView(this.spaceScene, this.spaceCamera);
    this.ui.setHud(true);
  }
  extraStats() {
    const out = {};
    for (const f of this.statProviders) for (const [k, v] of Object.entries(f(this) || {})) out[k] = (out[k] || 0) + v;
    return out;
  }

  start(fresh = false) {
    this.data = (!fresh && load()) || newPlayer();
    this.statProviders.push((g) => talentStats(g.data));
    this.spaceScene = this.engine.scene; this.spaceCamera = this.engine.camera;
    this.world = new World(this.engine, this.cam);
    this.world.game = this;
    this.audio = this.audio || new Audio();
    this.world.audio = this.audio;
    this.ui = new UI(this);
    this.wireEvents();
    this.enterSystem(this.data.system || 0);
    this.engine.add(this);
    this.ui.chat('SYS', null, `Welcome aboard, Captain. ${this.engine.backend} renderer online.`, 'sys');
    this.ui.chat('SYS', null, 'W/S throttle · A/D rudder · R/F altitude · Right-click sail · Tab target · 1-8 abilities · I cargo', 'sys');
  }

  enterSystem(id) {
    const W = this.world;
    W.clearAll(false);
    this.player = null; W.player = null;
    const sys = galaxy().systems[id];
    this.data.system = id;
    this.sector = new Sector(W, sys);
    document.getElementById('sysName').textContent = `${sys.name.toUpperCase()} · DANGER ${sys.danger}`;
    this.spawnPlayer(this.sector.entryPoint());
    this.ui.toast(`Entering ${sys.name}`, 'epic');
  }

  spawnPlayer(pos) {
    const P = this.data;
    const s = this.world.addShip({ chassis: CHASSIS_BY_ID[P.ship.chassis], loadout: P.ship.loadout, team: 1, isPlayer: true, name: P.ship.name, level: P.ship.level, faction: 'player' }, false);
    s.position.copy(pos);
    s.persistent = true;
    s.extraStats = this.extraStats(); s.weaponMod = talentWeaponMod(P); s.refit(); s.hull = s.maxHull;
    this.player = s; this.world.player = s;
    this.cam.follow = s;
    this.cam.focus.copy(pos);
    this.world.fx.column(pos, 0x58b8ff, 140, 60);
    return s;
  }

  // the flagship changed (bought, swapped): rebuild the ship in place
  swapPlayerShip() {
    const old = this.player;
    const pos = old ? old.position.clone() : this.sector.entryPoint();
    const heading = old ? old.heading : 0;
    if (old) this.world.removeShip(old);
    const s = this.spawnPlayer(pos);
    s.heading = heading;
    if (this.docked) s.invuln = true;
    this.ui.refresh();
    return s;
  }

  wireEvents() {
    const W = this.world, ev = W.events;
    ev.on('damage', (d) => {
      if (d.source === this.player || (d.source && d.source.team === 1 && d.source.isPlayer)) d.ship.playerTagged = true;
      if (d.ship === this.player || d.source === this.player || d.ship.playerTagged) {
        if (d.amount >= 1 && this.world.camNear(d.point, 200)) this.ui.damageNumber(d.point, d.amount, d.crit, d.shield);
      }
      if (d.ship === this.player && !d.shield && d.amount > this.player.maxHull * 0.04) { this.engine.flash(0.18, 0xff3020); this.cam.addShake(2); }
    });
    ev.on('kill', ({ ship, killer }) => {
      if (ship === this.player) return this.onPlayerDeath();
      if (ship.team !== 1 && (ship.playerTagged || (killer && killer.isPlayer))) this.reward(ship);
    });
    ev.on('collect', (d) => this.collect(d));
    ev.on('destroyed', ({ ship }) => this.audio.play('explosion', ship.position, Math.min(1.5, 0.6 + ship.dims.L / 120)));
    ev.on('damage', (d) => { if (d.ship === this.player || d.source === this.player) this.audio.play(d.shield ? 'shield' : 'hit', d.point, 0.7); });
    ev.on('toast', ({ msg, kind }) => this.ui.toast(msg, kind));
    ev.on('legendaryDrop', (d) => this.ui.toast(`${RARITY[d.item.rarity].name} drop: ${d.item.name}`, 'legend'));
  }

  // ---------------- rewards ----------------
  reward(ship) {
    const P = this.data, W = this.world, s = this.player;
    const eliteMul = [1, 3.5, 12][ship.elite];
    const st = s ? s.stats : {};
    const xp = Math.round(28 * ship.level * (1 + ship.chassis.tier * 0.3) * eliteMul * (1 + (st.xp || 0)));
    P.kills++;
    if (ship.elite === 2) P.bossKills++;
    this.gainXp(xp);
    if (s && st.salvage) s.repair(s.maxHull * st.salvage);
    // loot
    const rng = new RNG(Math.random() * 1e9);
    const luck = (st.lootFind || 0) + ship.elite * 0.6;
    let n = rng.chance(0.45 + ship.chassis.tier * 0.03) ? 1 : 0;
    if (ship.elite === 1) n += rng.int(2, 3);
    if (ship.elite === 2) n += rng.int(4, 6);
    if (ship.faction === 'covenant') n += 1;
    for (let i = 0; i < n; i++) {
      const it = rollItem(ship.level, rng, { luck, rarity: ship.elite === 2 && i === 0 ? rng.pick(['legendary', 'legendary', 'mythic']) : null });
      W.loot.dropItem(it, ship.position);
    }
    W.loot.dropCredits(Math.round((12 + ship.level * 6) * ship.chassis.tier * eliteMul * (1 + (st.credits || 0))), ship.position);
    if (rng.chance(0.5)) W.loot.dropSalvage(ship.chassis.tier * (1 + ship.elite), ship.position);
    this.ui.chat('COMBAT', null, `${ship.name} destroyed (+${xp} XP)`, 'sys', 'combat');
  }

  gainXp(xp) {
    const P = this.data;
    if (P.level < MAX_LEVEL) {
      P.xp += xp;
      while (P.level < MAX_LEVEL && P.xp >= xpForLevel(P.level)) {
        P.xp -= xpForLevel(P.level); P.level++;
        const ab = ABILITIES.find((a) => a.unlock === P.level);
        this.audio.play('levelup', null);
        this.ui.levelUp(P.level, 'COMMANDER RANK', ab ? `NEW ABILITY · ${ab.name.toUpperCase()}` : 'ALL SYSTEMS STRENGTHENED');
        this.ui.chat('SYS', null, `Promoted to rank ${P.level}${ab ? ' — ' + ab.name + ' unlocked' : ''}`, 'sys');
        if (this.player) { this.world.fx.column(this.player.position, 0x9a6bff, 200, 80); this.world.fx.ring(this.player.position, 200, 0x9a6bff, 80); }
      }
    }
    // ship xp
    const sh = P.ship;
    sh.xp += Math.round(xp * 0.8);
    let shipUp = false;
    while (sh.level < MAX_LEVEL && sh.xp >= shipXpForLevel(sh.level)) { sh.xp -= shipXpForLevel(sh.level); sh.level++; shipUp = true; }
    if (shipUp && this.player) {
      this.player.level = sh.level; this.player.refit();
      this.player.hull = this.player.maxHull;
      this.ui.toast(`${sh.name} reached ship level ${sh.level}`, 'epic');
    }
    // gear mastery
    for (const it of Object.values(sh.loadout)) if (it && grantItemXp(it, Math.round(xp * 0.5))) {
      this.ui.chat('LOOT', null, `${it.name} mastery ${it.lvl}`, 'loot', 'loot');
      if (this.player) this.player.refit();
    }
    this.ui.refresh();
  }

  canCollect(d) { return d.type !== 'item' || this.data.inventory.length < INV_SIZE; }
  collect(d) {
    const P = this.data;
    if (d.type === 'credits') { P.credits += d.amount; return; }
    if (d.type === 'salvage') { P.salvage += d.amount; P.credits += d.amount * 15; return; }
    if (P.inventory.length >= INV_SIZE) { this.ui.toast('Cargo hold full', 'warn'); return; }
    P.inventory.push(d.item);
    const r = RARITY[d.item.rarity];
    this.ui.chat('LOOT', null, `Recovered ${d.item.name}`, 'loot', 'loot');
    if (r.i >= 3) this.ui.toast(`${r.name}: ${d.item.name}`, r.i >= 4 ? 'legend' : 'epic');
    if (r.i >= 2) this.audio.play('loot', null, 0.5 + r.i * 0.15);
    if (this.autoplay) this.autoplay.onLoot(d.item);
    this.ui.refresh();
  }

  // ---------------- equipment ----------------
  worstEquipped(slot) {
    const L = this.data.ship.loadout;
    let worst = null, ws = Infinity, empty = false;
    for (const k of slotKeys(CHASSIS_BY_ID[this.data.ship.chassis])) {
      if (slotType(k) !== slot) continue;
      const it = L[k];
      if (!it) { empty = true; continue; }
      const sc = itemScore(it);
      if (sc < ws) { ws = sc; worst = it; }
    }
    return empty ? null : worst;
  }
  equip(item, slotKey) {
    const P = this.data, L = P.ship.loadout;
    const keys = slotKeys(CHASSIS_BY_ID[P.ship.chassis]).filter((k) => slotType(k) === item.slot);
    if (!keys.length) { this.ui.toast(`This hull has no ${item.slot} slot`, 'warn'); return false; }
    let key = slotKey && keys.includes(slotKey) ? slotKey : keys.find((k) => !L[k]);
    if (!key) key = keys.reduce((a, b) => (itemScore(L[a]) <= itemScore(L[b]) ? a : b));
    const idx = P.inventory.indexOf(item);
    if (idx >= 0) P.inventory.splice(idx, 1);
    if (L[key]) P.inventory.push(L[key]);
    L[key] = item;
    this.refitPlayer();
    return true;
  }
  unequip(key) {
    const P = this.data;
    if (P.inventory.length >= INV_SIZE) { this.ui.toast('Cargo hold full', 'warn'); return; }
    P.inventory.push(P.ship.loadout[key]);
    delete P.ship.loadout[key];
    this.refitPlayer();
  }
  equipBest() {
    const P = this.data;
    let changed = true, guard = 0;
    while (changed && guard++ < 50) {
      changed = false;
      for (const it of P.inventory.slice().sort((a, b) => itemScore(b) - itemScore(a))) {
        const cur = this.worstEquipped(it.slot);
        const hasSlot = slotKeys(CHASSIS_BY_ID[P.ship.chassis]).some((k) => slotType(k) === it.slot);
        if (hasSlot && (!cur || itemScore(it) > itemScore(cur) * 1.02)) { this.equip(it); changed = true; break; }
      }
    }
    this.refitPlayer();
  }
  salvage(item) {
    const P = this.data;
    const i = P.inventory.indexOf(item); if (i < 0) return;
    P.inventory.splice(i, 1);
    const v = Math.round(item.value * 0.35);
    P.credits += v;
    this.ui.chat('LOOT', null, `Salvaged ${item.name} for ${v} ¢`, 'loot', 'loot');
    this.ui.refresh();
  }
  salvageWhere(pred) {
    const P = this.data; let total = 0, n = 0;
    for (const it of P.inventory.slice()) if (pred(it)) { P.inventory.splice(P.inventory.indexOf(it), 1); total += Math.round(it.value * 0.35); n++; }
    P.credits += total;
    if (n) this.ui.toast(`Salvaged ${n} items for ${total} ¢`);
    this.ui.refresh();
  }
  refitPlayer() {
    if (this.player) { const p = this.player; p.loadout = this.data.ship.loadout; p.extraStats = this.extraStats(); p.weaponMod = talentWeaponMod(this.data); p.refit(); }
    this.ui.refresh();
  }

  // ---------------- abilities ----------------
  abilityCd(a) {
    let cd = a.cd * (1 - Math.min(0.5, (this.player && this.player.stats.cdr) || 0));
    if (a.k === 'volley') cd *= 1 - 0.15 * rank(this.data, 'broadMaster');
    if (a.k === 'evasive') cd *= 1 - 0.2 * rank(this.data, 'evasivePro');
    return cd;
  }
  learnTalent(k) {
    if (!canLearn(this.data, k)) return false;
    this.data.talents[k] = (this.data.talents[k] || 0) + 1;
    this.refitPlayer();
    this.ui.toast(`${TALENT_BY_KEY[k].name} ${this.data.talents[k]}/${TALENT_BY_KEY[k].max}`);
    return true;
  }
  resetTalents() {
    const cost = 200 * this.data.level;
    if (this.data.credits < cost) { this.ui.toast(`Respec costs ${cost} ¢`, 'warn'); return; }
    this.data.credits -= cost; this.data.talents = {}; this.refitPlayer();
  }
  useAbility(k) {
    const a = ABILITY_BY_KEY[k], s = this.player;
    if (!a || !s || !s.alive) return false;
    if (this.data.level < a.unlock) { this.ui.toast(`${a.name} unlocks at rank ${a.unlock}`, 'warn'); return false; }
    const now = this.engine.time;
    if ((this.cooldowns[k] || 0) > now) return false;
    if (a.run(this.world, s)) { this.cooldowns[k] = now + this.abilityCd(a); return true; }
    return false;
  }

  // ---------------- commands from the menu bar / keys ----------------
  command(name) {
    if (name === 'auto') return this.toggleAutoplay();
    if (this.ui.windows[name]) return this.ui.toggle(name);
    if (this.modes && this.modes[name]) return this.modes[name]();
    this.ui.toast(`${name.toUpperCase()} comes online in a later refit`, 'warn');
  }
  toggleAutoplay() {
    if (!this.Autoplay) { this.ui.toast('Autopilot module not installed yet', 'warn'); return; }
    this.autoplay = this.autoplay ? null : new this.Autoplay(this);
    document.querySelector('#menubar .auto').classList.toggle('on', !!this.autoplay);
    this.ui.toast(this.autoplay ? 'Autoplay engaged' : 'Autoplay disengaged', this.autoplay ? 'epic' : '');
  }
  saveNow() { save(this.data); }
  wipeSave() { this.saveT = 1e9; wipe(); }
  playerChat(text) {
    this.ui.chat('LOCAL', this.data.name, text, 'guild');
    if (this.npcChat) this.npcChat.reply(text);
  }

  onPlayerDeath() {
    this.ui.death(true);
    this.autoplayWasOn = !!this.autoplay;
    const lost = Math.round(this.data.credits * 0.08);
    this.data.credits -= lost;
    this.ui.chat('SYS', null, `Hull lost. Insurance deductible: ${lost} ¢`, 'sys');
    this.world.schedule(3.5, () => {
      this.ui.death(false);
      // hostiles near the wreck lose interest
      for (const o of this.world.ships.slice()) if (o.team !== 1 && !o.persistent) this.world.removeShip(o);
      this.spawnPlayer((this.respawnPoint && this.respawnPoint()) || this.sector.entryPoint());
      save(this.data);
    });
  }

  // ---------------- helm (per frame) ----------------
  helm(dt) {
    const s = this.player, inp = this.input, m = inp.mouse;
    if (!s || !s.alive) return;
    if (this.autoplay && this.autoplay.active) {
      // manual input takes the wheel for a moment
      if (inp.held('turnLeft') || inp.held('turnRight') || inp.hit('throttleUp') || inp.hit('throttleDown') || m.clicked[2]) this.autoplay.yield(4);
      else return;
    }
    let ti = THROTTLE_STEPS.findIndex((t) => Math.abs(t - s.throttle) < 0.01);
    if (ti < 0) ti = THROTTLE_STEPS.reduce((b, t, i) => (Math.abs(t - s.throttle) < Math.abs(THROTTLE_STEPS[b] - s.throttle) ? i : b), 0);
    if (inp.hit('throttleUp')) { ti = Math.min(THROTTLE_STEPS.length - 1, ti + 1); s.throttle = THROTTLE_STEPS[ti]; this.moveTarget = null; }
    if (inp.hit('throttleDown')) { ti = Math.max(0, ti - 1); s.throttle = THROTTLE_STEPS[ti]; this.moveTarget = null; }
    if (inp.hit('fullStop')) { s.throttle = 0; this.moveTarget = null; }
    const manualTurn = (inp.held('turnLeft') ? 1 : 0) - (inp.held('turnRight') ? 1 : 0);
    if (manualTurn) { this.moveTarget = null; s.rudder = manualTurn; }
    else if (!this.moveTarget) s.rudder = 0;
    if (inp.held('climb')) s.altTarget = Math.min(80, s.altTarget + dt * 40);
    if (inp.held('dive')) s.altTarget = Math.max(-80, s.altTarget - dt * 40);
    if (inp.hit('autoFire')) { s.autoFire = !s.autoFire; this.ui.toast(`Auto-fire ${s.autoFire ? 'on' : 'off'}`); }
    // mouse: right click sails, left click targets
    if (m.clicked[2] && !inp.blocked) {
      const p = this.cam.pick(m.nx, m.ny, s.position.y, _v);
      if (p) { this.moveTarget = p.clone(); this.ui.marker = { p: p.clone(), t: 1 }; }
    }
    if (m.clicked[0] && !inp.blocked) this.clickTarget(m.x, m.y);
    if (this.moveTarget) {
      const d = s.steerTo(this.moveTarget, s.dims.L * 0.6, 1);
      if (d < s.dims.L * 0.6) this.moveTarget = null;
    }
    if (inp.hit('nextTarget')) this.cycleTarget();
    if (inp.hit('fire')) this.useAbility('volley');
    for (let i = 0; i < 8; i++) if (inp.hit('ab' + (i + 1))) this.useAbility(ABILITIES[i].k);
    // keep a target: if none, take the nearest hostile that is shooting at us
    if ((!s.target || !s.target.alive) && s.lastAttacker && s.lastAttacker.alive) s.target = s.lastAttacker;
  }

  clickTarget(x, y) {
    let best = null, bd = 60 * 60;
    for (const o of this.world.ships) {
      if (!o.alive || o === this.player) continue;
      this.cam.project(o.position, _v);
      const d = (_v.x - x) ** 2 + (_v.y - y) ** 2;
      const r = Math.max(30, o.dims.L * 0.4 * innerHeight / (2 * Math.tan(this.engine.camera.fov * Math.PI / 360) * this.cam.distance));
      if (d < Math.max(bd, r * r) && d < r * r * 1.5) { bd = d; best = o; }
    }
    if (best) this.player.target = best;
  }
  cycleTarget() {
    const s = this.player;
    const list = this.world.ships.filter((o) => o.alive && this.world.hostile(s, o) && o.position.distanceTo(s.position) < 2000).sort((a, b) => a.position.distanceTo(s.position) - b.position.distanceTo(s.position));
    if (!list.length) return;
    const i = list.indexOf(s.target);
    s.target = list[(i + 1) % list.length];
  }

  talentTick(dt, t) {
    const s = this.player; if (!s || !s.alive || dt === 0) return;
    if (rank(this.data, 'lastStand') && s.hull < s.maxHull * 0.25 && t > (this.lastStandT || 0)) {
      this.lastStandT = t + 60;
      for (let i = 0; i < 4; i++) s.shields[i] = s.maxShield * 0.3;
      this.world.fx.ring(s.position, s.dims.L, 0x58b8ff, 80);
      this.ui.toast('Last Stand: shields restored', 'epic');
    }
    if (rank(this.data, 'ram') && s.speed > s.maxSpeed * 0.6) {
      const bow = _v.set(Math.sin(s.heading), 0, Math.cos(s.heading)).multiplyScalar(s.dims.L * 0.5).add(s.position);
      for (const o of this.world.ships) {
        if (!o.alive || !this.world.hostile(s, o) || o.position.distanceTo(bow) > o.dims.W * 2.5 + s.dims.W) continue;
        if ((o._rammedT || 0) > t) continue;
        o._rammedT = t + 1;
        this.world.combat.damage(o, s.maxHull * 0.12 * (s.speed / s.maxSpeed), 'kinetic', bow, s, null);
        this.world.fx.explosion(bow, 0.6, 0xffc080); this.cam.addShake(5);
      }
    }
  }

  update(dt, t, realDt) {
    const inp = this.input;
    if (inp.hit('escape')) { if (!this.ui.closeAll() && this.player) this.player.target = null; }
    if (inp.hit('inventory')) this.command('inventory');
    if (inp.hit('character')) this.command('character');
    if (inp.hit('skills')) this.command('skills');
    if (inp.hit('autoplay')) this.command('auto');
    if (inp.hit('map')) this.command('galaxy');
    if (inp.hit('crew')) this.command('crew');
    if (inp.hit('bridge')) this.command('bridge');
    if (inp.hit('dock')) this.command('dock');
    if (inp.hit('scan')) this.command('scan');
    if (this.mode === 'space') {
      this.talentTick(dt, t);
      this.helm(dt);
      if (this.autoplay) this.autoplay.update(dt, t);
      this.sector.update(dt);
      this.world.update(dt, t);
      if (this.npcs) this.npcs.update(dt, t);
    }
    else if (this.activeMode) this.activeMode.update(dt, t, realDt);
    if (this.mode === 'space') this.cam.update(dt, t, realDt);
    if (this.audio) {
      this.audio.setListener(this.cam.focus);
      const s = this.player;
      const hot = s && s.alive && this.world.ships.some((o) => o.alive && this.world.hostile(s, o) && o.position.distanceTo(s.position) < 1300);
      this.audio.intensity += ((hot ? 1 : 0) - this.audio.intensity) * Math.min(1, realDt * (hot ? 0.8 : 0.15));
    }
    this.ui.update(dt, realDt);
    this.data.playtime += realDt;
    this.playtime = (this.playtime || 0) + dt;
    this.saveT -= realDt;
    if (this.saveT <= 0) { this.saveT = 20; save(this.data); }
  }
}
