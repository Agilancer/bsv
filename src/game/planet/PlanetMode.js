// The planet-surface game mode: its own scene, camera, lights, sky/fog and FX; the heightfield,
// the explorer, creatures, shots, probes, loot; the descent and the extraction; dungeons.
// Registered with game.enterMode('planet', mode) — Game calls update(dt, t, realDt) while active
// and exit() when it ends (game.exitMode()).
import * as THREE from 'three/webgpu';
import { damp, clamp, RNG } from '../../engine/rng.js';
import { RARITY } from '../data/items.js';

import { biomeFor } from './biomes.js';
import { heightSampler } from './terrainHeight.js';
import { Terrain } from './Terrain.js';
import { PlanetFX } from './PlanetFX.js';
import { GroundFX } from './groundFX.js';
import { Vehicle } from './Vehicle.js';
import { Shots, Arsenal } from './Weapons.js';
import { Creatures } from './Creatures.js';
import { Interactables, planSurface, buildSurface } from './Site.js';
import { Probes } from './Probes.js';
import { Dungeon, portalMaterial } from './Dungeon.js';
import { DUNGEON_THEMES } from './dungeonGen.js';
import { landerGroup, beaconMaterial, texturedMat } from './siteModels.js';
import { GeoBuilder, rockGeometry } from './geo.js';
import { RESOURCES, bankCargo, loseCargo, cargoTotal, addResources, planetKey, groundKillReward } from './economy.js';
import { ensureExplorer, explorerStats, grantExplorerXp, EX_INV_SIZE, scrapYield, rollExItem } from './explorerItems.js';
import { pickPack } from './enemies.js';
import { PlanetHUD } from './PlanetHUD.js';
import { PLANET_ABILITIES } from './abilities.js';
import { buildGun, uRoverRim } from './vehicleModels.js';
import { uCreatureRim } from './creatureModels.js';
import { uSeeThrough } from './props.js';
import { PlanetPilot } from './Autopilot.js';
import { TouchControls } from './Touch.js';
import { setCheapTextures } from './ptex.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Ray(), _a = new THREE.Vector3();

// isometric follow camera with aim look-ahead
export class PlanetCamera {
  constructor(input) {
    this.input = input;
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 2400);
    this.yaw = Math.PI * 0.25; this.yawTarget = this.yaw; this.pitch = 0.94;
    this.distance = 80; this.distTarget = 80; this.minDist = 40; this.maxDist = 230; this.extra = 0;
    this.focus = new THREE.Vector3(); this.shake = 0;
    this.raycaster = new THREE.Raycaster();
    this._o = new THREE.Vector3();
  }
  addShake(a) { this.shake = Math.min(this.shake + a, 6); }
  update(realDt, target, look) {
    const inp = this.input, m = inp.mouse;
    if (!inp.blocked) {
      if (m.wheel) this.distTarget = clamp(this.distTarget * Math.pow(1.12, m.wheel), this.minDist, this.maxDist);
      if (m.dragDX) this.yawTarget -= m.dragDX * 0.006;
      if (inp.held('camLeft')) this.yawTarget += realDt * 1.6;
      if (inp.held('camRight')) this.yawTarget -= realDt * 1.6;
    }
    this.yaw = damp(this.yaw, this.yawTarget, 8, realDt);
    this.distance = damp(this.distance, this.distTarget + this.extra, 4, realDt);
    const k = 1 - Math.exp(-6 * realDt);
    this.focus.x += (target.x + look.x - this.focus.x) * k;
    this.focus.y += (target.y + look.y - this.focus.y) * k;
    this.focus.z += (target.z + look.z - this.focus.z) * k;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._o.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).multiplyScalar(this.distance);
    this.camera.position.copy(this.focus).add(this._o);
    if (this.shake > 0.01) {
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s; this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake = damp(this.shake, 0, 6, realDt);
    }
    this.camera.lookAt(this.focus);
  }
  project(v, out) { out.copy(v).project(this.camera); out.x = (out.x * 0.5 + 0.5) * innerWidth; out.y = (-out.y * 0.5 + 0.5) * innerHeight; return out; }
}

export class PlanetMode {
  // ctx: { info, sys, survey, site }
  constructor(game, ctx) {
    this.game = game; this.engine = game.engine; this.input = game.input; this.data = game.data;
    this.ex = ensureExplorer(this.data);
    setCheapTextures(this.engine.quality === 'low');
    this.ctx = ctx; this.survey = ctx.survey; this.siteInfo = ctx.site; this.sys = ctx.sys;
    this.type = ctx.survey.type; this.biome = biomeFor(this.type);
    this.timers = []; this.cargo = {};
    this.runStats = { kills: 0, xp: 0, items: 0, credits: 0, banked: 0, bosses: 0, probe: 0, dungeons: 0, gathered: {} };
    this.threat = 0; this.waveT = 70; this.state = 'descent'; this.stateT = 0; this.dmgBuff = 1;
    this.cooldowns = {}; this.turrets = []; this.strikes = []; this.mining = false; this.dungeon = null; this.warnings = [];
    this.aimPoint = new THREE.Vector3(); this.aimEnemy = null; this.toastT = 0;
    this.plan = planSurface(this.survey, this.siteInfo);
    this.hasOutpost = this.plan.outposts.length > 0;
    this.S = heightSampler(this.type, this.siteInfo.seed, this.plan.pois);
    this.surfaceS = this.S;
    const B = this.biome;
    this.dustHex = new THREE.Color(B.tint).multiplyScalar(0.75).getHex();
    this.headlightI = B.sunI < 2.6 || this.type === 'barren' ? 60 : 28;
    this.buildScene();
  }

  buildScene() {
    const B = this.biome, E = this.engine;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(B.fog);
    scene.fog = new THREE.Fog(B.fog, 120, 330);
    this.cam = new PlanetCamera(this.input);
    // lights: star, sky fill, and torch lights for dungeons (fixed count: materials never recompile)
    const sun = this.sun = new THREE.DirectionalLight(B.sun, B.sunI);
    sun.castShadow = this.engine.quality !== 'low';
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
    this.sunDir = new THREE.Vector3(0.55, 1, 0.35).normalize();
    this.hemi = new THREE.HemisphereLight(B.hemi[0], B.hemi[1], B.hemi[2]);
    scene.add(sun, sun.target, this.hemi);
    this.torchLights = [];   // added only inside dungeons (light count changes recompile materials)
    this.pfx = new PlanetFX(E, scene);
    this.pfx.dustHex = this.dustHex;
    const boom = this.pfx.explode.bind(this.pfx);
    this.pfx.explode = (p, s = 1, hex) => { boom(p, s, hex); this.sfx(s > 1.6 ? 'heavy' : 'explosion', p, Math.min(1.3, 0.25 + s * 0.35)); };
    this.ground = new GroundFX(E);
    this.terrain = new Terrain(this, this.S, this.siteInfo.seed);
    scene.add(this.terrain.group);
    this.terrain.update(0, 0, true);
    this.site = new Interactables(this);
    this.level = this.site;
    this.vehicle = new Vehicle(this);
    this.shots = new Shots(this);
    this.arsenal = new Arsenal(this);
    this.creatures = new Creatures(this);
    this.probes = new Probes(this);
    // lander + beacon
    this.lander = landerGroup(E);
    this.landerHome = new THREE.Vector3(0, this.S.height(0, 0), 0);
    this.lander.position.copy(this.landerHome).add(new THREE.Vector3(-9, 0, -9));
    this.lander.rotation.y = Math.PI * 0.25;
    scene.add(this.lander);
    const bg = new THREE.CylinderGeometry(0.7, 0.7, 1, 12, 1, true); bg.translate(0, 0.5, 0);
    this.beacon = new THREE.Mesh(bg, beaconMaterial(E, 0x58c8ff));
    this.beacon.scale.set(1, 160, 1); this.beacon.renderOrder = 18;
    this.beacon.position.copy(this.lander.position); this.beacon.position.y += 11.5;
    scene.add(this.beacon);
    buildSurface(this, this.plan);
    this.camps = this.plan.camps;
    this.lairs = this.plan.lairs;
    this.dungeons = this.plan.dungeons;
    this.hud = new PlanetHUD(this);
    this.pilot = new PlanetPilot(this);
    this.touch = TouchControls.wanted() ? new TouchControls(this) : null;
  }

  // ---------------- helpers used by subsystems ----------------
  nearPoi(x, z, clear) {
    for (const p of this.plan.pois) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.15 + clear) return true;
    for (const d of this.plan.dungeons || []) if (Math.hypot(x - d.x, z - d.z) < 20 + clear) return true;
    return false;
  }
  later(delay, fn) { this.timers.push({ t: this.engine.time + delay, fn }); }
  // procedural audio, attenuated by distance to the explorer (the shared listener follows the space camera)
  sfx(kind, pos, mul = 1) {
    const A = this.game.audio;
    if (!A) return;
    const d = pos ? Math.hypot(pos.x - this.vehicle.position.x, pos.z - this.vehicle.position.z) : 0;
    const g = mul * Math.max(0, 1 - d / 260);
    if (g > 0.03) A.play(kind, null, g);
  }
  // every telegraphed attack registers a warning: drawn on the ground, read by the autopilot to dodge
  telegraph(p, r, hex, time, follow = null) {
    this.ground.telegraph(p, r, hex, time, follow);
    this.warnings.push({ kind: 'circle', pos: new THREE.Vector3(p.x, p.y || 0, p.z), r, t0: this.engine.time, dur: time, follow, n: this.warnSeq = (this.warnSeq || 0) + 1 });
  }
  // a straight danger lane (charges, sniper locks, the opening line of a beam sweep)
  warnLine(from, dir, len, width, time, hex = 0xff3020) {
    this.warnings.push({ kind: 'line', pos: new THREE.Vector3(from.x, 0, from.z), dir: new THREE.Vector3(dir.x, 0, dir.z).normalize(), len, width, t0: this.engine.time, dur: time, hex, n: this.warnSeq = (this.warnSeq || 0) + 1 });
  }
  updateWarnings() {
    const now = this.engine.time, fx = this.pfx;
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      const f = (now - w.t0) / w.dur;
      if (f >= 1) { this.warnings.splice(i, 1); continue; }
      if (w.kind !== 'line') continue;
      // a pulsing lane on the ground: edges plus a brightening core
      const y = this.S.ground(w.pos.x, w.pos.z) + 0.35;
      _a.set(w.pos.x, y, w.pos.z); _w.copy(_a).addScaledVector(w.dir, w.len); _w.y = this.S.ground(_w.x, _w.z) + 0.35;
      const px = -w.dir.z * w.width, pz = w.dir.x * w.width, I = 0.8 + f * 1.6 + Math.sin(now * 18) * 0.3;
      fx.beam(_a, _w, 0.12 + f * 0.25, w.hex, I);
      _a.x += px; _a.z += pz; _w.x += px; _w.z += pz; fx.beam(_a, _w, 0.08, w.hex, I * 0.7);
      _a.x -= 2 * px; _a.z -= 2 * pz; _w.x -= 2 * px; _w.z -= 2 * pz; fx.beam(_a, _w, 0.08, w.hex, I * 0.7);
    }
  }
  toast(msg, kind = '') { this.game.ui.toast(msg, kind); }
  itemLevel() { return Math.max(1, this.siteInfo.level + (this.dungeon ? 2 + this.dungeon.entrance.depth : 0) + Math.floor(Math.random() * 3)); }
  noise(n) { this.threat = Math.min(1, this.threat + n); }
  groundAlong(a, b, out) {
    const n = Math.ceil(a.distanceTo(b) / 2);
    for (let i = 1; i <= n; i++) {
      out.lerpVectors(a, b, i / n);
      if (out.y < this.S.ground(out.x, out.z) || (this.dungeon && this.dungeon.nav.solid(out.x, out.z))) return out;
    }
    return null;
  }
  get stats() { return this.vehicle.stats; }

  addCargo(res, n, force = false) {
    const room = force ? n : Math.max(0, this.vehicle.stats.cargo - cargoTotal(this.cargo));
    const k = Math.min(n, room);
    if (k > 0) {
      this.cargo[res] = (this.cargo[res] || 0) + k;
      this.runStats.gathered[res] = (this.runStats.gathered[res] || 0) + k;
      this.hud.cargoPop(res, k);
    }
    if (k < n && this.engine.time > this.toastT) { this.toastT = this.engine.time + 4; this.toast('Cargo hold full — return to the lander to bank it', 'warn'); }
    return k;
  }
  pickupItem(item) {
    const ex = this.ex, r = RARITY[item.rarity];
    if (ex.inventory.length >= EX_INV_SIZE) {
      const y = scrapYield(item); addResources(this.data, y);
      this.toast(`Explorer bay full — ${item.name} scrapped`, 'warn');
      return;
    }
    ex.inventory.push(item);
    this.runStats.items++;
    this.sfx('loot', null, 0.4 + r.i * 0.15);
    this.game.ui.chat('LOOT', null, `Explorer recovered ${item.name}`, 'loot', 'loot');
    if (r.i >= 3) this.toast(`${r.name}: ${item.name}`, r.i >= 4 ? 'legend' : 'epic');
    this.hud.refreshWindows();
  }

  // ---------------- combat callbacks ----------------
  hitEnemy(e, dmg, point, o = {}) {
    if (!e.alive) return;
    const C = this.creatures;
    let d = dmg;                  // crits are rolled by the shooter; o.crit only flags the number
    const crit = !!o.crit;
    if (e.shielded > 0) d *= 0.45;
    const weak = o.weak;
    if (weak && weak.alive) {
      d *= 2.5; weak.hp -= d;
      if (weak.hp <= 0) {
        weak.alive = false; e.stun = 2.2; e.flash = 1;
        this.pfx.explode(weak.w, 1.4, 0xffa040); this.cam.addShake(2);
        this.toast(`${e.name}: weak point destroyed!`, 'epic');
      }
    }
    e.hp -= d; e.flash = 1; e.lastHit = this.engine.time;
    if (e.mode !== 'hunt') C.aggro(e);
    if (o.burn) { e.burnT = 3; e.burnDps = Math.max(e.burnDps, dmg * o.burn / 3); }
    if (o.leech) this.vehicle.heal(d * o.leech);
    if (!o.dot && !o.quiet && point) this.hud.damageNumber(point, d, crit, weak ? 'weak' : e.shielded > 0 ? 'shield' : null);
    if (!o.dot && point) {
      if (e.def.mech || e.def.vis.plan === 'golem' || e.def.vis.plan === 'sentinel') { if (Math.random() < 0.5) this.pfx.sparks(point, 3, o.color || 0xffc070, 12, 0.25, 0.25); }
      else if (Math.random() < 0.5) this.pfx.ichor(point, e.def.ichor, 3);
    }
    if (e.hp <= 0) this.kill(e, o);
  }

  kill(e, o = {}) {
    e.alive = false; e.dying = 0; e.hp = 0;
    const def = e.def, p = _v.copy(e.pos).setY(e.pos.y + e.height * 0.4), fx = this.pfx;
    const big = def.size >= 4;
    // death throes by body plan
    const plan = def.vis.plan;
    if (def.mech || plan === 'drone' || plan === 'turret' || plan === 'mech') fx.explode(p, 0.4 + e.scale * 0.35, 0xff8a30);
    else if (plan === 'sentinel') { fx.sparks(p, 24, def.vis.glow, 26, 0.7, 0.5); fx.ring(p, 6 * e.scale, def.vis.glow, 32); fx.glowBurst(p, def.vis.glow, 5 * e.scale, 0.25, 2); }
    else if (plan === 'golem' || plan === 'elemental') { fx.rocks(p, 14 + e.scale * 4, 0x4a3a30, 14 + e.scale * 4); fx.glowBurst(p, def.vis.glow, 4 * e.scale, 0.3, 1.5); fx.dust(p, 3 * e.scale, this.dustHex, 3, 6); }
    else { fx.ichor(p, def.ichor, 14 + e.scale * 6); fx.glowBurst(p, def.ichor, 3 * e.scale, 0.25, 1.2); fx.dust(p, 2 * e.scale, this.dustHex, 2, 4); }
    if (big) {
      for (let i = 0; i < 8; i++) this.later(i * 0.18, () => { _a.copy(e.pos).add(_w.set((Math.random() - 0.5) * e.radius * 2, Math.random() * e.height, (Math.random() - 0.5) * e.radius * 2)); fx.explode(_a, 0.6 + Math.random() * 0.8, def.vis.glow); this.cam.addShake(1); });
      this.later(1.6, () => { fx.explode(e.pos, 2.5, 0xffa050); fx.ring(e.pos, 30, def.vis.glow, 80); this.cam.addShake(4); this.engine.flash(0.25, 0xffd0a0); });
    }
    if (o.chainreact) { const r = 6, g0 = this.vehicle.stats.guns[0], cd = (g0 ? g0.ws.dmg : 10) * 1.2 * this.vehicle.stats.dmgMul; this.creatures.forInRadius(e.pos, r, (x) => { if (x !== e) this.hitEnemy(x, cd, _a.copy(x.pos), { quiet: true }); }); fx.explode(e.pos, 0.8, 0xffa040); }
    // rewards
    const st = this.vehicle.stats;
    const xp = Math.round(def.xp * (1 + 0.12 * (e.level - 1)) * (e.elite ? 2.5 : 1) * st.xpMul);
    this.gainXp(xp);
    // the commander's share: ~70% of a comparable space kill, at the commander's own rank
    const G = this.game, sst = (G.player && G.player.stats) || {};
    const cr = groundKillReward(def.size, this.data.level, !!e.elite);
    G.gainXp(Math.round(cr.xp * (1 + (sst.xp || 0))));
    this.runStats.kills++; this.ex.kills = (this.ex.kills || 0) + 1;
    // ground bestiary (Codex · Ground): first kill of a creature catalogues it
    const gc = (this.data.groundCodex ||= {});
    if (!gc[def.id]) this.toast(`Codex: ${def.name} catalogued`, def.boss ? 'legend' : '');
    gc[def.id] = (gc[def.id] || 0) + 1;
    const rng = new RNG(Math.random() * 1e9);
    const sizeMul = [1, 2, 5, 12, 30, 60][def.size] * (e.elite ? 2.5 : 1);
    for (const [res, ev] of Object.entries(def.drops)) {
      const n = ev * sizeMul * (0.5 + Math.random());
      const k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      if (k > 0) this.level.dropRes(res, k, p);
    }
    const itemChance = [0.03, 0.08, 0.25, 0.8, 1, 1][def.size] + (e.elite ? 0.6 : 0) + st.lootFind * 0.3;
    let items = rng.chance(Math.min(1, itemChance)) ? 1 : 0;
    if (def.size >= 4) items = rng.int(2, 3) + (def.size === 5 ? 2 : 0);
    for (let i = 0; i < items; i++) {
      const rar = def.size >= 4 && i === 0 ? rng.pick(['legendary', 'epic', 'legendary', 'mythic']) : null;
      this.level.dropItem(rollExItem(this.itemLevel(), rng, { luck: st.lootFind + def.size * 0.4 + (e.elite ? 0.8 : 0), rarity: rar }), p);
    }
    this.level.dropCredits(Math.round(cr.credits * (1 + (sst.credits || 0))), p);
    if (e.boss) {
      this.runStats.bosses++;
      this.toast(`${e.name} has fallen!`, 'legend');
      this.game.ui.chat('SYS', null, `Apex creature slain: ${e.name} (+${xp} XP)`, 'sys');
      if (e.dungeonBoss && this.dungeon) this.dungeon.onBossDown();
      for (const l of this.lairs) if (l.boss === def && !l.cleared) l.cleared = true;
      if (this.hud.boss === e) this.later(2, () => { if (this.hud.boss === e) this.hud.boss = null; });
    }
  }

  gainXp(xp) {
    const ex = this.ex;
    this.runStats.xp += xp;
    const ups = grantExplorerXp(ex, xp);
    if (ups) {
      const ab = PLANET_ABILITIES.find((a) => a.unlock === ex.level);
      this.sfx('levelup', null, 1);
      this.game.ui.levelUp(ex.level, 'EXPLORER LEVEL', ab ? `NEW ABILITY · ${ab.name.toUpperCase()}` : 'VEHICLE SYSTEMS UPGRADED');
      this.pfx.pillar(this.vehicle.position, 0x9a6bff, 30, 3, 40); this.pfx.ring(this.vehicle.position, 18, 0x9a6bff, 64);
      this.refreshStats();
      this.vehicle.hp = this.vehicle.stats.maxHp;
    }
  }
  refreshStats() {
    const V = this.vehicle;
    const f = V.hp / V.stats.maxHp;
    V.stats = explorerStats(this.ex);
    V.hp = Math.min(V.stats.maxHp, f * V.stats.maxHp);
  }
  // loadout or chassis changed from the explorer bay
  rebuildVehicle() {
    const V = this.vehicle;
    const pos = V.position.clone(), h = V.heading;
    V.build();
    V.place(pos.x, pos.z, h);
    this.refreshStats();
  }

  onPlayerHit(amount, point, shield) {
    this.sfx(shield ? 'shield' : 'hit', null, 0.6);
    if (amount >= 1) this.hud.damageNumber(point || this.vehicle.position, amount, false, shield ? 'pshield' : 'player');
    if (!shield && amount > this.vehicle.stats.maxHp * 0.06) { this.engine.flash(0.15, 0xff3020); this.cam.addShake(1); }
  }
  onVehicleDestroyed() {
    const V = this.vehicle;
    V.alive = false;
    this.pfx.explode(V.position, 2.2, 0xffa050); this.pfx.explode(V.position, 1.2, 0x9fd8ff);
    this.cam.addShake(4); this.engine.flash(0.3, 0xff6030);
    V.setVisible(false);
    const lost = loseCargo(this.cargo, 0.5);
    const n = Object.values(lost).reduce((a, b) => a + b, 0);
    this.ex.deaths = (this.ex.deaths || 0) + 1;
    this.toast(`Explorer destroyed${n ? ` — ${n} cargo units lost` : ''}`, 'bad');
    this.probes.recallAll(false);
    this.state = 'dead'; this.stateT = 4;
    this.hud.death(true);
  }
  respawn() {
    const V = this.vehicle;
    this.hud.death(false);
    V.alive = true; V.setVisible(true);
    V.hp = V.stats.maxHp; V.shield = V.stats.maxShield; V.invuln = 2;
    const p = this.dungeon ? this.dungeon.startPos : _v.set(this.lander.position.x + 10, 0, this.lander.position.z + 10);
    V.place(p.x, p.z, 0);
    this.pfx.pillar(V.position, 0x58c8ff, 40, 3, 40); this.pfx.ring(V.position, 10, 0x58c8ff, 48);
    this.state = 'play';
  }
  onBossAggro(e) {
    this.hud.boss = e;
    this.toast(`${e.def.sizeClass === 'gargantuan' ? 'GARGANTUAN' : 'APEX'}: ${e.name}`, 'legend');
    this.game.ui.chat('SYS', null, `${e.name} — ${e.def.role}`, 'sys');
    if (e.def.size >= 5) this.cam.extra = 45;
  }
  onBossPhase(e) { this.toast(`${e.name} enters phase ${e.phase}!`, 'epic'); }
  onCrateOpened(c) { this.noise(0.01); }
  onNodeDepleted(n) {
    this.pfx.rocks(n.pos, 14, 0x5a4a40, 16); this.pfx.glowBurst(_v.copy(n.pos).setY(n.pos.y + 1.5), RESOURCES[n.res].hex, 6, 0.3, 2);
    this.pfx.ring(n.pos, 6, RESOURCES[n.res].hex, 30);
    this.gainXp(6 + this.siteInfo.level * 2);
  }
  onProbeLaunched() {}

  // ---------------- dungeon mouths ----------------
  buildDungeonMouth(d, group) {
    const E = this.engine, S = this.S, T = DUNGEON_THEMES[d.theme];
    const b = new GeoBuilder();
    const R = rockGeometry(1, 1.5);
    const hex = T.glow || this.biome.glow;
    if (d.theme === 'cave' || d.theme === 'hive') {
      for (let i = 0; i < 9; i++) { const a = Math.PI * (i / 8); b.add(R.clone(), { color: d.theme === 'hive' ? 0x6a7a50 : 0xb0a8a0 }, b.xf(Math.cos(a) * 9, Math.sin(a) * 8, 0, 0, i, 0, 3.2, 3.2, 3.6)); }
      if (d.theme === 'hive') for (let i = 0; i < 6; i++) b.sphere(0.6, (i - 2.5) * 2.6, 12 + Math.sin(i) * 1.5, 1.5, { color: hex, emit: 3 }, 1, 1.3, 1, 1);
    } else if (d.theme === 'hulk') {
      b.box(26, 14, 10, 0, 7, -3, { color: 0x8a8e98 }, 0.2, 0, 0.25);
      b.box(10, 11, 1, 0, 5.5, 2.4, { color: 0x50545c });
      b.box(10.5, 0.4, 0.4, 0, 11, 2.8, { color: hex, emit: 3 });
      for (let i = 0; i < 4; i++) b.cyl(1.2, 1.6, 5, -10 + i * 6.5, 14.5, -4, { color: 0x6a6e78 }, 'y', 8, 0.2, 0, 0.3);
    } else { // vault / reliquary gates
      const gothic = d.theme === 'reliquary';
      for (const sx of [-1, 1]) {
        b.box(3, 18, 3, sx * 8, 9, 0, { color: gothic ? 0x6a6058 : 0x605868 });
        b.cone(2.2, gothic ? 9 : 4, sx * 8, 18, 0, { color: gothic ? 0x8a7a50 : 0x605868 }, gothic ? 6 : 4);
        b.box(0.3, 12, 0.3, sx * 6.4, 8, 1.6, { color: hex, emit: 3 });
      }
      b.box(19, 3, 3.4, 0, 17, 0, { color: gothic ? 0x6a6058 : 0x504858 });
      b.box(12, 0.4, 0.4, 0, 15.6, 1.8, { color: hex, emit: 3 });
    }
    const m = new THREE.Mesh(b.build(), texturedMat(E, d.theme === 'cave' ? this.biome.tex.cliff : d.theme === 'hulk' ? 'hull_graphite' : d.theme === 'hive' ? 'hull_alien' : 'pl_granite', 0.2, { tint: 1.1 }));
    m.castShadow = true; m.receiveShadow = true;
    const g = new THREE.Group(); g.add(m);
    const portal = new THREE.Mesh(new THREE.CircleGeometry(6.5, 40), portalMaterial(E, hex));
    portal.position.set(0, 6.5, 0.8);
    g.add(portal);
    g.position.set(d.x, S.height(d.x, d.z) - 0.5, d.z);
    g.rotation.y = Math.atan2(-d.x, -d.z);    // facing the landing pad
    group.add(g);
    d.hex = hex;
    return g;
  }

  enterDungeon(d) {
    if (this.dungeon || this.transition) return;
    this.transition = true;
    this.hud.flashOverlay(`Entering ${d.name}`, () => {
      this.probes.recallAll(true);
      this.shots.clear();
      this.surfaceList = this.creatures.list;
      this.creatures.list = d.creatures || [];
      if (!d.dungeon) {
        d.dungeon = new Dungeon(this, d);
        this.S = d.dungeon.S;
        d.dungeon.populate();
        d.creatures = this.creatures.list;
        this.runStats.dungeons++;
      } else { d.dungeon.group.visible = true; d.dungeon.site.group.visible = true; }
      const D = this.dungeon = d.dungeon;
      this.S = D.S;
      this.level = D.site;
      this.site.group.visible = false; this.terrain.group.visible = false; this.lander.visible = false; this.beacon.visible = false;
      this.dungeonEntrance = d;
      this.vehicle.place(D.startPos.x, D.startPos.z, Math.PI);
      this.cam.focus.copy(this.vehicle.position);
      const T = D.theme;
      for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffa040, 0, 60, 1.6); this.scene.add(l); this.torchLights.push(l); }
      this.scene.fog.color.set(T.fog); this.scene.background.set(T.fog);
      this.sun.intensity = 1.3; this.sun.color.set(T.hemi[0]); this.hemi.color.set(T.hemi[0]); this.hemi.groundColor.set(T.hemi[1]); this.hemi.intensity = T.hemi[2] * 3;
      this.headlightSave = this.headlightI; this.headlightI = 120;
      // tighter framing and rim-lit silhouettes: corridors are dark and busy
      this.camSave = { d: this.cam.distTarget, min: this.cam.minDist };
      this.cam.minDist = 30; this.cam.distTarget = 52;
      uRoverRim.value = 2.4; uCreatureRim.value = 1.5;
      this.engine.renderer.toneMappingExposure = 1.15;
      this.game.ui.chat('SYS', null, `${d.name} — ${T.name}, depth ${d.depth}. Apex lurks at the far end.`, 'sys');
      this.transition = false;
    });
  }
  exitDungeon() {
    if (!this.dungeon || this.transition) return;
    this.transition = true;
    const d = this.dungeonEntrance;
    this.hud.flashOverlay('Returning to the surface', () => {
      this.probes.recallAll(true);
      this.shots.clear();
      d.creatures = this.creatures.list;
      this.creatures.list = this.surfaceList || [];
      this.dungeon.group.visible = false; this.dungeon.site.group.visible = false;
      this.dungeon = null;
      this.S = this.surfaceS; this.level = this.site;
      this.site.group.visible = true; this.terrain.group.visible = true; this.lander.visible = true; this.beacon.visible = true;
      for (const l of this.torchLights) this.scene.remove(l);
      this.torchLights = [];
      this.applyAtmosphere();
      this.headlightI = this.headlightSave || 30;
      if (this.camSave) { this.cam.minDist = this.camSave.min; this.cam.distTarget = this.camSave.d; }
      uRoverRim.value = 0.5; uCreatureRim.value = 0.35;
      const out = _v.set(d.x, 0, d.z).add(_w.set(-d.x, 0, -d.z).normalize().multiplyScalar(16));
      this.vehicle.place(out.x, out.z, Math.atan2(-d.x, -d.z));
      this.cam.focus.copy(this.vehicle.position);
      this.transition = false;
    });
  }
  applyAtmosphere() {
    const B = this.biome;
    this.scene.fog.color.set(B.fog); this.scene.background.set(B.fog);
    this.sun.color.set(B.sun); this.sun.intensity = B.sunI;
    this.hemi.color.set(B.hemi[0]); this.hemi.groundColor.set(B.hemi[1]); this.hemi.intensity = B.hemi[2];
    this.engine.renderer.toneMappingExposure = 1.05 * (B.exposure || 1);
  }

  // ---------------- lifecycle ----------------
  enter() {
    const G = this.game, E = this.engine;
    this.savedExposure = E.renderer.toneMappingExposure;
    this.savedShadows = E.renderer.shadowMap.enabled;
    if (this.sun.castShadow) { E.renderer.shadowMap.enabled = true; E.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    G.enterMode('planet', this);
    E.setView(this.scene, this.cam.camera);
    document.body.classList.add('planet-mode');
    document.body.classList.toggle('planet-touch', !!this.touch);   // no keyboard hints on touch
    this.applyAtmosphere();
    this.hud.show();
    // descent: the lander drops from orbit on retro-thrusters
    this.state = 'descent'; this.stateT = 0;
    this.lander.position.y = this.landerHome.y + 160;
    this.vehicle.setVisible(false);
    this.vehicle.place(this.lander.position.x + 9, this.lander.position.z + 9, Math.PI * 0.25);
    this.cam.focus.set(this.lander.position.x, this.landerHome.y, this.lander.position.z);
    this.cam.distance = 150; this.cam.distTarget = 80;
    this.ex.runs = (this.ex.runs || 0) + 1;
    this.sfx('jump', null, 0.8);
    G.ui.chat('SYS', null, `Explorer deploying to ${this.survey.name} · ${this.siteInfo.name} · hazard ${this.survey.hazardName}`, 'sys');
    G.ui.chat('SYS', null, 'WASD drive · Mouse aim · LMB fire · RMB/F mine · Shift boost · 1-4 abilities · X probe · R interact · L explorer bay · U refinery', 'sys');
  }

  exit() {
    const E = this.engine;
    this.probes.recallAll(true);
    this.hud.destroy();
    document.body.classList.remove('planet-mode', 'planet-touch');
    uRoverRim.value = 0.5; uCreatureRim.value = 0.35;
    for (const l of [this.pfx.G, this.pfx.S, this.pfx.K]) E.remove(l);
    E.renderer.toneMappingExposure = this.savedExposure || 1.05;
    E.renderer.shadowMap.enabled = !!this.savedShadows;
    this.terrain.dispose();
    this.disposed = true;
  }

  // lift off from the lander (banks the cargo); far away, call the dropship down to you first
  returnToOrbit() {
    if (this.state !== 'play' || this.transition) return;
    if (this.dungeon) { this.toast('Leave the dungeon first', 'warn'); return; }
    const V = this.vehicle;
    const dist = Math.hypot(V.position.x - this.lander.position.x, V.position.z - this.lander.position.z);
    if (dist < 22) { this.ascend(); return; }
    this.state = 'extract'; this.stateT = 8;
    this.extractAt = V.position.clone();
    this.toast('Dropship inbound — hold out for 8 seconds!', 'epic');
    this.spawnWave(true);
  }
  ascend() {
    const V = this.vehicle;
    this.bank();
    V.setVisible(false); this.probes.recallAll(true);
    this.pfx.pillar(V.position, 0x58c8ff, 30, 3, 30);
    this.state = 'ascent'; this.stateT = 0;
    this.lander.visible = true;
    this.sfx('jump', null, 0.8);
  }
  bank() {
    const n = bankCargo(this.data, this.cargo);
    if (n) {
      this.runStats.banked += n;
      this.toast(`Banked ${n} resource units`, 'epic');
      this.pfx.timedBeam(_v.copy(this.lander.position).setY(this.lander.position.y + 8), _w.copy(this.vehicle.position).setY(this.vehicle.position.y + 1), 1.2, 0x58c8ff, 2.2, 0.6);
      this.pfx.ring(this.vehicle.position, 8, 0x58c8ff, 40);
    }
    return n;
  }
  finish() {
    const G = this.game, R = this.runStats;
    // the survey record remembers what each world has given (shown on the system map)
    const rec = this.ex.scanned && this.ctx.info && this.ex.scanned[planetKey(this.sys.id ?? G.data.system, this.ctx.info)];
    if (rec) { rec.runs = (rec.runs || 0) + 1; rec.banked = (rec.banked || 0) + R.banked; rec.kills = (rec.kills || 0) + R.kills; rec.dungeons = (rec.dungeons || 0) + R.dungeons; }
    G.exitMode();
    const got = Object.entries(R.gathered).map(([k, v]) => `${v} ${RESOURCES[k].short}`).join(' · ');
    G.ui.toast(`Explorer recovered · ${R.banked} units banked`, 'epic');
    G.ui.chat('SYS', null, `Survey of ${this.survey.name} complete: ${R.kills} kills, ${R.items} items, ${R.banked} banked${got ? ` (${got})` : ''}, ${R.xp} XP.`, 'sys');
    if (G.planet && G.planet.onRunFinished) G.planet.onRunFinished(this);
  }

  // ---------------- per frame ----------------
  update(dt, t, realDt) {
    if (this.disposed) return;
    const V = this.vehicle, inp = this.input, fx = this.pfx;
    fx.beginFrame();
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; if (t >= tm.t) { this.timers.splice(i, 1); tm.fn(); } }
    // ---- controls ----
    const ctl = this.readControls(dt);
    this.stateT -= dt;
    if (this.state === 'descent') this.updateDescent(dt);
    else if (this.state === 'ascent') this.updateAscent(dt);
    else if (this.state === 'dead') { if (this.stateT <= 0) this.respawn(); }
    else if (this.state === 'extract') this.updateExtract(dt);
    const live = (this.state === 'play' || this.state === 'extract') && V.alive;
    if (live) {
      V.update(dt, ctl);
      this.arsenal.update(dt, ctl.fire, this.aimPoint, this.aimEnemy);
      this.updateMining(dt, ctl.mine);
      this.updateAbilities(dt, ctl);
      if (ctl.probe) this.probes.launch();
      if (ctl.interact) this.interact();
    } else { this.mining = false; }
    this.probes.update(dt);
    if (this.dungeon) this.dungeon.nav.updateFlow(V.position.x, V.position.z);
    this.creatures.update(dt);
    this.shots.update(dt);
    this.level.update(dt);
    this.updateTurrets(dt);
    if (!this.dungeon) {
      this.terrain.update(V.position.x, V.position.z);
      this.updateCamps(dt);
      this.updateThreat(dt);
      this.updateLander(dt);
      this.updateMouths(dt);
    } else {
      this.dungeon.update(dt, this.torchLights);
    }
    this.ambient(dt);
    this.ground.update(dt);
    this.updateWarnings();
    // aim reticle on the ground
    if (V.alive && this.state === 'play') this.ground.set(0, this.aimPoint.x, this.aimPoint.z, this.aimEnemy ? this.aimEnemy.radius + 1 : 1.6, this.aimEnemy ? 1.4 : 0.8, this.aimEnemy ? 0xff5a6a : 0x58c8ff);
    else this.ground.set(0, 0, 0, 1, 0);
    // camera: follow with a little look toward the cursor
    _w.set(0, 0, 0);
    if (V.alive && this.state === 'play') { _w.subVectors(this.aimPoint, V.position).multiplyScalar(0.18); _w.y = 0; if (_w.length() > 14) _w.setLength(14); }
    const focusTarget = this.state === 'descent' || this.state === 'ascent' ? _a.copy(this.lander.position).setY(Math.max(this.lander.position.y * 0.6, this.landerHome.y)) : V.position;
    if (this.hud.boss && (!this.hud.boss.alive || this.hud.boss.def.size < 5)) this.cam.extra = damp(this.cam.extra, 0, 1, realDt);
    this.cam.update(realDt, focusTarget, _w);
    // fog tracks zoom so the play area stays crisp
    const B = this.biome, D = this.cam.distance;
    this.scene.fog.near = D * (this.dungeon ? 0.9 : B.fogNear);
    this.scene.fog.far = D * (this.dungeon ? 2.2 : B.fogFar);
    // the key light (and its shadow frustum) follows the explorer
    const f = this.cam.focus;
    this.sun.position.copy(f).addScaledVector(this.sunDir, 160);
    this.sun.target.position.copy(f);
    uSeeThrough.value.copy(V.position);
    fx.update(dt); fx.flush();
    this.hud.update(dt, realDt);
  }

  readControls(dt) {
    const inp = this.input, m = inp.mouse, V = this.vehicle;
    const ctl = { mx: 0, mz: 0, fire: false, mine: false, boost: false, abil: [false, false, false, false], probe: false, interact: false };
    // aim: cursor ray onto the ground (raymarch the heightfield)
    const auto = this.game.autoplay && this.pilot;
    if (this.touch && this.touch.active) this.touch.read(ctl);
    else if (!inp.blocked) {
      const k = (c) => inp.down.has(c), h = (c) => inp.pressed.has(c);
      const fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      const right = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
      const y = this.cam.yaw;
      ctl.mx = -Math.sin(y) * fwd + Math.cos(y) * right;
      ctl.mz = -Math.cos(y) * fwd - Math.sin(y) * right;
      ctl.fire = !!(m.buttons & 1);
      ctl.mine = !!(m.buttons & 2) || k('KeyF');
      ctl.boost = k('ShiftLeft') || k('ShiftRight');
      for (let i = 0; i < 4; i++) ctl.abil[i] = h('Digit' + (i + 1));
      ctl.probe = h('KeyX'); ctl.interact = h('KeyR');
      this.pickAim(m.nx, m.ny);
    }
    if (auto) { this.pilot.control(ctl, dt); }
    if (this.driver) this.driver(ctl, dt);   // tools (groundduel) take the controls
    return ctl;
  }

  pickAim(nx, ny) {
    const cam = this.cam;
    cam.raycaster.setFromCamera({ x: nx, y: ny }, cam.camera);
    const r = cam.raycaster.ray;
    // march along the ray until it dips under the ground, then bisect
    let tPrev = 0, hit = null;
    const S = this.S;
    for (let t = 10; t < 900; t += 3) {
      r.at(t, _v);
      if (_v.y < S.ground(_v.x, _v.z)) {
        let a = tPrev, b = t;
        for (let i = 0; i < 6; i++) { const mid = (a + b) / 2; r.at(mid, _v); if (_v.y < S.ground(_v.x, _v.z)) b = mid; else a = mid; }
        hit = r.at(b, _v); break;
      }
      tPrev = t;
    }
    if (hit) this.aimPoint.copy(hit);
    // aim assist: snap to a creature near the cursor
    this.aimEnemy = this.creatures.nearestTo(this.aimPoint, 5);
    if (!this.aimEnemy) {
      // creatures standing tall: test their screen-space bounds
      let best = null, bd = 1e9;
      const mx = (nx * 0.5 + 0.5) * innerWidth, my = (-ny * 0.5 + 0.5) * innerHeight;
      for (const e of this.creatures.list) {
        if (!e.alive || e.under) continue;
        this.creatures.center(e, _w);
        cam.project(_w, _a);
        const d = Math.hypot(_a.x - mx, _a.y - my);
        const rpx = Math.max(18, e.radius * innerHeight / (2 * Math.tan(cam.camera.fov * Math.PI / 360) * cam.distance));
        if (d < rpx && d < bd) { bd = d; best = e; }
      }
      this.aimEnemy = best;
    }
  }

  // ---------------- mining ----------------
  updateMining(dt, on) {
    const V = this.vehicle, tools = V.stats.tools;
    this.mining = false;
    if (!on || !tools.length) { this.mineNode = null; this.ground.set(2, 0, 0, 1, 0); return; }
    const maxR = Math.max(...tools.map((t) => t.ts.range)) + V.radius + 3;
    let n = this.level.nearestNode(this.aimPoint, 12);
    if (!n || Math.hypot(n.pos.x - V.position.x, n.pos.z - V.position.z) > maxR) n = this.level.nearestNode(V.position, maxR);
    this.mineNode = n;
    if (!n) { this.ground.set(2, 0, 0, 1, 0); if (this.engine.time > (this.mineHintT || 0)) { this.mineHintT = this.engine.time + 3; this.toast('No deposit in tool range', 'warn'); } return; }
    if (cargoTotal(this.cargo) >= V.stats.cargo) { this.addCargo(n.res, 1); return; }
    this.mining = true;
    const fx = this.pfx, col = RESOURCES[n.res].hex;
    let rate = 0;
    V.toolPoint(_v);
    tools.forEach((t, i) => {
      rate += t.ts.power * (t.ts.bonus[n.res] || 1);
      const tgt = _w.copy(n.pos).add(_a.set(Math.sin(this.engine.time * 3 + i) * 0.8, 1.4 + Math.cos(this.engine.time * 4 + i) * 0.4, Math.cos(this.engine.time * 2.3 + i) * 0.8));
      fx.beam(_v, tgt, 0.18 + 0.06 * Math.sin(this.engine.time * 40 + i), t.ts.color, 1.6);
      fx.beam(_v, tgt, 0.06, 0xffffff, 1.2);
      if (Math.random() < 0.6) fx.sparks(tgt, 2, t.ts.color, 14, 0.3, 0.3);
    });
    rate *= V.stats.mineMul;
    // ore streams back into the hold
    if (Math.random() < 0.7) { const s = n.pos.clone().setY(n.pos.y + 1.5); const d = _a.subVectors(V.position, s); const l = d.length(); fx.G.emit(s.x, s.y, s.z, d.x / l * l * 1.6, d.y / l * l * 1.6 + 3, d.z / l * l * 1.6, 0.6, ...fx.col(col, 2), 0.9, 0.5, 0.15, 1.6, 0); }
    if (Math.random() < 0.2) fx.flash(_w, col, 10, 0.1, 10);
    this.ground.set(2, n.pos.x, n.pos.z, 4.5, 1.2, col, 0.2);
    n.acc += rate * dt;
    const motherlode = V.stats.tools.some((t) => t.ts.unique.includes('motherlode'));
    while (n.acc >= 1 && n.alive) {
      n.acc -= 1;
      const k = this.level.mine(n, 1);
      let got = k;
      if (Math.random() < V.stats.yieldMul - 1) got++;
      if (motherlode && Math.random() < 0.25) got++;
      if (this.addCargo(n.res, got) < got) break;
      this.noise(0.0006);
    }
  }

  // ---------------- abilities ----------------
  updateAbilities(dt, ctl) {
    for (let i = 0; i < 4; i++) if (ctl.abil[i]) this.useAbility(i);
    if (ctl.boost && this.vehicle.boostT <= 0.05) this.vehicle.boostT = 0.1;
  }
  abilityCd(a) { return a.cd * (1 - this.vehicle.stats.cdr); }
  useAbility(i) {
    const a = PLANET_ABILITIES[i];
    if (!a || this.state !== 'play' || !this.vehicle.alive) return false;
    if (this.ex.level < a.unlock) { this.toast(`${a.name} unlocks at explorer level ${a.unlock}`, 'warn'); return false; }
    const now = this.engine.time;
    if ((this.cooldowns[a.k] || 0) > now) return false;
    if (a.run(this)) { this.cooldowns[a.k] = now + this.abilityCd(a); return true; }
    return false;
  }
  spawnTurret(pos) {
    const g = new THREE.Group();
    const gun = this.vehicle.stats.guns[0];
    const m = buildGun(gun ? gun.item : { base: 'chaingun' }, this.vehicle.v.mats, 1.1);
    const base = new GeoBuilder();
    base.cyl(0.9, 1.2, 0.5, 0, 0.25, 0, { color: 0xb0b4c0 }, 'y', 8);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; base.limb(0, 0.4, 0, Math.cos(a) * 1.6, -0.6, Math.sin(a) * 1.6, 0.12, 0.08, { color: 0x808490 }); }
    base.sphere(0.25, 0, 1.6, -0.6, { color: 0x58e0ff, emit: 3 }, 1, 1, 1, 0);
    const bm = new THREE.Mesh(base.build(), this.vehicle.v.mats.dark); bm.castShadow = true;
    m.group.position.y = 1.2;
    g.add(bm, m.group);
    g.position.copy(pos);
    this.scene.add(g);
    this.turrets.push({ g, head: m.group, muzzle: m.muzzle, t: 16, cd: 0, ws: gun ? gun.ws : null });
    this.pfx.pillar(pos, 0x58e0ff, 18, 1.5, 20); this.pfx.ring(pos, 5, 0x58e0ff, 24);
  }
  updateTurrets(dt) {
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const T = this.turrets[i];
      T.t -= dt; T.cd -= dt;
      if (T.t <= 0) { this.pfx.explode(T.g.position, 0.4, 0x58e0ff); this.scene.remove(T.g); this.turrets.splice(i, 1); continue; }
      const e = this.creatures.nearestTo(T.g.position, 55);
      if (!e) { T.head.rotation.y += dt; continue; }
      const yaw = Math.atan2(e.pos.x - T.g.position.x, e.pos.z - T.g.position.z);
      T.head.rotation.y = yaw;
      if (T.cd <= 0) {
        T.cd = 0.11;
        const mz = _v.copy(T.muzzle).applyAxisAngle(_w.set(0, 1, 0), yaw).add(T.head.position).add(T.g.position);
        const tgt = _a.copy(e.pos); tgt.y += Math.min(e.height * 0.5, e.radius);
        const dir = tgt.sub(mz).normalize();
        const dmg = 5 * (1 + (this.ex.level - 1) * 0.08) * this.vehicle.stats.dmgMul;
        this.shots.spawn({ pos: mz, vel: dir.clone().multiplyScalar(170), team: 0, dmg, kind: 'bullet', color: 0x58e0ff, size: 0.15, len: 3.5, life: 0.5 });
        this.pfx.muzzle(mz, dir, 0x58e0ff, 0.8);
      }
    }
  }

  // ---------------- surface systems ----------------
  updateCamps() {
    const V = this.vehicle.position;
    for (const c of this.camps) {
      if (c.spawned || Math.hypot(c.x - V.x, c.z - V.z) > 230) continue;
      c.spawned = true;
      const rng = new RNG((c.x * 13 + c.z * 7) | 0);
      if (c.outpost) {
        for (let i = 0; i < 2; i++) { const pk = pickPack(rng, this.type, this.survey.hazard, 'surface', this.siteInfo.level, { corsair: 10 }); if (pk) for (let k = 0; k < pk.count; k++) this.creatures.spawn(pk.entry, c.x + rng.float(-14, 14), c.z + rng.float(-14, 14), pk.level, { camp: c }); }
        continue;
      }
      const pk = c.pack;
      if (!pk || !pk.entry) continue;
      for (let k = 0; k < pk.count; k++) this.creatures.spawn(pk.entry, c.x + rng.float(-8, 8), c.z + rng.float(-8, 8), pk.level, { camp: c, elite: pk.elite && k === 0 });
      if (pk.escort) for (let k = 0; k < pk.escort.count; k++) this.creatures.spawn(pk.escort.entry, c.x + rng.float(-10, 10), c.z + rng.float(-10, 10), pk.level, { camp: c });
    }
    for (const l of this.lairs) {
      if (l.spawned || Math.hypot(l.x - V.x, l.z - V.z) > 300) continue;
      l.spawned = true;
      l.e = this.creatures.spawn(l.boss, l.x, l.z, this.siteInfo.level + 3);
      const rng = new RNG((l.x * 3) | 0);
      for (let i = 0; i < 2; i++) { const pk = pickPack(rng, this.type, this.survey.hazard, 'lair', this.siteInfo.level + 1); if (pk) for (let k = 0; k < Math.min(4, pk.count); k++) this.creatures.spawn(pk.entry, l.x + rng.float(-25, 25), l.z + rng.float(-25, 25), pk.level, { camp: l }); }
    }
  }
  updateThreat(dt) {
    if (this.state !== 'play') return;
    this.threat = Math.min(1, this.threat + dt / 480);
    this.waveT -= dt;
    if (this.waveT <= 0) { this.waveT = 85 - this.threat * 45; this.spawnWave(false); }
  }
  spawnWave(extraction) {
    const V = this.vehicle.position, rng = new RNG(Math.random() * 1e9);
    if (this.creatures.count() > 40) return;
    const n = extraction ? 2 : 1 + (this.threat > 0.5 ? 1 : 0);
    for (let w = 0; w < n; w++) {
      const pk = pickPack(rng, this.type, this.survey.hazard, 'surface', this.siteInfo.level + Math.floor(this.threat * 3));
      if (!pk || pk.entry.ai === 'static') continue;
      const a = rng.float(0, Math.PI * 2), d = rng.float(75, 95);
      const x = V.x + Math.cos(a) * d, z = V.z + Math.sin(a) * d;
      for (let k = 0; k < pk.count; k++) {
        const e = this.creatures.spawn(pk.entry, x + rng.float(-8, 8), z + rng.float(-8, 8), pk.level, { awake: true, elite: pk.elite && k === 0 });
        if (e && pk.entry.ai === 'burrow') e.under = true;
      }
    }
    if (!extraction) this.toast(this.threat > 0.6 ? 'Seismic readings spiking — the swarm is coming' : 'Hostiles inbound', 'warn');
  }
  updateLander(dt) {
    const V = this.vehicle, L = this.lander;
    const d = Math.hypot(V.position.x - L.position.x, V.position.z - L.position.z);
    this.ground.set(1, L.position.x, L.position.z, 18, d < 18 ? 1.6 : 0.9, 0x58c8ff, d < 18 ? 0.25 : 0);
    this.atLander = d < 18 && this.state === 'play' && V.alive;
    if (this.atLander) {
      if (cargoTotal(this.cargo) > 0) this.bank();
      V.heal(V.stats.maxHp * 0.25 * dt);
      V.shield = Math.min(V.stats.maxShield, V.shield + V.stats.maxShield * 0.3 * dt);
      if (Math.random() < 0.3) this.pfx.beam(_v.copy(L.position).setY(L.position.y + 7), _w.copy(V.position).setY(V.position.y + 1), 0.2, 0x58c8ff, 0.8);
    }
    const eng = L.userData.engines;
    if (Math.random() < 0.15) { _v.copy(eng[0]).applyMatrix4(L.matrixWorld); this.pfx.smoke(_v, 1.2, 0.08); }
  }
  updateMouths() {
    const V = this.vehicle;
    this.nearMouth = null;
    for (const d of this.dungeons) {
      const dist = Math.hypot(V.position.x - d.x, V.position.z - d.z);
      if (dist < 14 && V.alive && this.state === 'play') this.nearMouth = d;
      if (dist < 200 && Math.random() < 0.2) this.pfx.pillar(_v.set(d.x, this.S.height(d.x, d.z), d.z), d.hex, 14, 5, 2);
    }
  }
  interact() {
    if (this.dungeon) { const x = this.dungeon.exits.find((e) => e.pos.distanceTo(_v.copy(this.vehicle.position).setY(0)) < 14); if (x) this.exitDungeon(); return; }
    if (this.nearMouth) return this.enterDungeon(this.nearMouth);
    if (this.atLander) return this.returnToOrbit();
  }

  // ---------------- sequences ----------------
  updateDescent(dt) {
    const L = this.lander, H = this.landerHome;
    const t = (this.stateT0 = (this.stateT0 || 0) + dt);
    const k = Math.min(1, t / 3.2);
    const ease = 1 - Math.pow(1 - k, 3);
    L.position.y = H.y + 160 * (1 - ease);
    const fx = this.pfx;
    for (const e of L.userData.engines) { _v.copy(e).applyMatrix4(L.matrixWorld); fx.thruster(_v, _w.set(0, -1, 0), 0x58c8ff, 1.6, 2.2); }
    if (L.position.y - H.y < 25) for (let i = 0; i < 3; i++) fx.dust(_v.set(L.position.x + (Math.random() - 0.5) * 20, H.y, L.position.z + (Math.random() - 0.5) * 20), 5, this.dustHex, 2, 14);
    if (k >= 1 && !this.touched) {
      this.touched = true;
      fx.ring(L.position, 26, this.dustHex, 80); fx.ring(L.position, 18, 0x58c8ff, 60);
      for (let i = 0; i < 10; i++) fx.dust(_v.set(L.position.x + (Math.random() - 0.5) * 24, H.y, L.position.z + (Math.random() - 0.5) * 24), 7, this.dustHex, 3, 16);
      this.cam.addShake(3);
      this.later(0.7, () => {
        const V = this.vehicle;
        V.setVisible(true);
        V.place(L.position.x + 9, L.position.z + 9, Math.PI * 0.25);
        V.velocity.set(Math.sin(Math.PI * 0.25) * 18, 0, Math.cos(Math.PI * 0.25) * 18);
        fx.pillar(V.position, 0x58c8ff, 20, 2, 24);
        this.ground.pulse(V.position.x, V.position.z, 0x58c8ff, 1);
        this.state = 'play';
        this.toast(`${this.siteInfo.name} · ${this.biome.name}`, 'epic');
      });
    }
  }
  updateExtract(dt) {
    const L = this.lander, P = this.extractAt;
    if (!this.vehicle.alive) { this.state = 'dead'; this.stateT = 4; return; }
    const k = 1 - Math.max(0, this.stateT) / 8;
    L.position.set(P.x - 9, this.S.ground(P.x, P.z) + 140 * (1 - k * k * (3 - 2 * k)), P.z - 9);
    this.beacon.position.copy(L.position); this.beacon.position.y = L.position.y + 11.5;
    for (const e of L.userData.engines) { _v.copy(e).applyMatrix4(L.matrixWorld); this.pfx.thruster(_v, _w.set(0, -1, 0), 0x58c8ff, 1.4, 2); }
    this.ground.set(1, P.x, P.z, 14, 1.6, 0xffd060, k);
    if (this.stateT <= 0) { this.state = 'play'; this.ascend(); }
  }
  updateAscent(dt) {
    const L = this.lander;
    const t = (this.ascT = (this.ascT || 0) + dt);
    L.position.y += dt * (8 + t * 40);
    for (const e of L.userData.engines) { _v.copy(e).applyMatrix4(L.matrixWorld); this.pfx.thruster(_v, _w.set(0, -1, 0), 0x58c8ff, 2, 3); }
    if (t < 1) for (let i = 0; i < 2; i++) this.pfx.dust(_v.set(L.position.x + (Math.random() - 0.5) * 20, this.S.ground(L.position.x, L.position.z), L.position.z + (Math.random() - 0.5) * 20), 6, this.dustHex, 3, 14);
    if (t > 2.4 && !this.finishing) { this.finishing = true; this.hud.flashOverlay('Returning to orbit', () => this.finish()); }
  }

  // ambient particles: pollen, dust, snow, embers, motes, spores, crystal glints
  ambient(dt) {
    const f = this.cam.focus, fx = this.pfx, kind = this.dungeon ? 'motes' : this.biome.ambient;
    const n = Math.random() < dt * 30 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const x = f.x + (Math.random() - 0.5) * 160, z = f.z + (Math.random() - 0.5) * 160;
      const y = this.S.ground(x, z);
      switch (kind) {
        case 'snow': fx.S.emit(x, y + 30, z, 3, -6, 1, 6, 2.2, 2.4, 2.6, 0.9, 0.35, 0.3, 0.1, 0); break;
        case 'embers': fx.ember(_v.set(x, y + 0.5, z), 0xff6020); break;
        case 'spores': fx.G.emit(x, y + 2, z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 6, 0.8, 1.6, 0.4, 0.7, 0.4, 0.2, 0.2, 0.3); break;
        case 'glints': fx.S.emit(x, y + 1 + Math.random() * 6, z, 0, 0.5, 0, 1.5, 2.4, 1.6, 3.2, 1, 0.5, 0.05, 0, 0); break;
        case 'pollen': fx.G.emit(x, y + 2 + Math.random() * 4, z, 1.5, 0.3, 0.6, 5, 1.6, 1.8, 0.9, 0.5, 0.25, 0.25, 0.1, 0); break;
        case 'motes': fx.G.emit(x, y + 1 + Math.random() * 5, z, (Math.random() - 0.5), 0.4, (Math.random() - 0.5), 4, 0.9, 1.0, 1.4, 0.5, 0.25, 0.25, 0.1, 0); break;
        default: fx.dust(_v.set(x, y + 0.5, z), 4, this.dustHex, 0.5, 8); break;
      }
    }
    if (this.terrain.emitters && !this.dungeon) for (const e of this.terrain.emitters) {
      if (Math.random() > dt * 6) continue;
      if (Math.abs(e.x - f.x) > 120 || Math.abs(e.z - f.z) > 120) continue;
      if (e.kind === 'vent') { fx.smoke(_v.set(e.x, e.y, e.z), 2 * e.s, 0.05); if (Math.random() < 0.5) fx.ember(_v, 0xff6020); }
    }
  }
}
