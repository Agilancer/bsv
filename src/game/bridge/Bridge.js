// The bridge (B): a 3D command deck with the ship's officers at their stations. The battle goes on outside — the space
// sim keeps ticking while you're here, the main viewscreen shows it live (the space scene rendered into a texture from
// a chase camera or a tactical plot), and the helm keys still steer. Click an officer to talk and give orders; they
// speak up on their own when something needs the captain. Drag to look around from the captain's chair.
import * as THREE from 'three/webgpu';
import { texture, uv, vec2, vec3, float, smoothstep, sin, abs, length, mix } from 'three/tsl';
import { buildBridge, STATIONS, CAPTAIN, SCREEN } from './BridgeScene.js';
import { spawnCrew } from './crewmodels.js';
import { talk, chatter, situation } from './dialogue.js';
import { DEPTS, OFFICER_POSTS, OFFICER_KEYS, rankAbbr } from '../crew/data.js';
import { face, touchUI } from '../crew/CrewUI.js';
import { clamp, damp, wrapAngle } from '../../engine/rng.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const YAW_MAX = 2.05, PITCH_MIN = -0.5, PITCH_MAX = 0.42;

export class Bridge {
  constructor(game) {
    this.game = game;
    this.officers = {};          // post -> officer
    this.cd = {};                // order cooldowns (game time)
    this.said = {};              // chatter memory
    this.viewMode = 'forward';
    this.active = false;
    this.yaw = 0; this.pitch = -0.05; this.yawT = 0; this.pitchT = -0.05;
    this.intro = 0;
    this.shake = 0;
    this.chatT = 8;
    this.dlg = null;
    this.alertK = 0;
    this.buildHud();
  }

  async load() {
    const g = this.game, E = g.engine;
    const B = buildBridge(E);
    this.B = B;
    this.scene = B.scene;
    this.camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.05, 80);
    this.camera.position.copy(CAPTAIN.eye);
    // the viewscreen: the space scene rendered from its own camera into a texture
    this.vsCam = new THREE.PerspectiveCamera(52, SCREEN.w / SCREEN.h, 2, 60000);
    const q = E.quality === 'low' ? 0.6 : 1;
    this.rt = new THREE.RenderTarget(Math.round(1024 * q), Math.round(1024 * q * SCREEN.h / SCREEN.w), { type: THREE.HalfFloatType });
    const u = uv();
    // render-target textures come out top-down on both backends: flip to view
    const feed = texture(this.rt.texture, vec2(u.x, float(1).sub(u.y))).rgb;
    const edge = smoothstep(0.5, 0.47, abs(u.x.sub(0.5))).mul(smoothstep(0.5, 0.46, abs(u.y.sub(0.5))));
    const scan = sin(u.y.mul(700).sub(E.uRealTime.mul(4))).mul(0.035).add(0.965);
    const vign = float(1).sub(length(u.sub(0.5).mul(vec2(1.0, 1.3))).mul(0.5));
    B.screenMat.colorNode = mix(vec3(0.02, 0.05, 0.12), feed.mul(1.05).mul(scan).mul(vign), edge).add(vec3(0.03, 0.06, 0.14).mul(float(1).sub(edge)));
    // officers lost, appointed or reassigned: restaff the stations shortly after
    g.crew.on((type) => { if (type === 'changed' || type === 'death') this.restaffT = 1.5; });
    // hull hits shake the deck
    g.world.events.on('damage', (d) => {
      if (!this.active || d.ship !== g.player || d.shield) return;
      const f = d.amount / g.player.maxHull;
      if (f > 0.01) { this.shake = Math.min(1.5, this.shake + f * 25); this.flicker = 0.25; }
    });
    await this.spawnOfficers();
  }

  // ---------------- officers ----------------
  async spawnOfficers() {
    const crew = this.game.crew;
    const jobs = [];
    for (const post of OFFICER_KEYS) {
      const duty = crew.onDuty(post);
      const cur = this.officers[post];
      if (!duty) { if (cur) this.removeOfficer(post); continue; }
      if (cur && cur.member.id === duty.m.id && cur.dept === duty.m.dept) { cur.member = duty.m; cur.acting = duty.acting; continue; }
      if (cur) this.removeOfficer(post);
      jobs.push(this.spawnOfficer(post, duty.m, duty.acting));
    }
    await Promise.all(jobs);
    this.renderCrewList();
  }

  async spawnOfficer(post, m, acting) {
    const stn = STATIONS[post];
    const c = await spawnCrew(m.look, m.dept, { clip: stn.sit ? 'sit_idle' : 'idle' });
    const o = { post, member: m, acting, dept: m.dept, c, stn, root: c.root, yaw: stn.face, yawT: stn.face, state: 'idle', next: 3 + Math.random() * 6, talkT: 0, hover: false };
    c.root.position.set(stn.pos[0], stn.pos[1], stn.pos[2]);
    c.root.rotation.y = stn.face;
    if (stn.sit) {
      c.pose.play('sit_idle', { fade: 0, t: Math.random() * 2 });
      c.pose.apply();
      c.root.updateMatrixWorld(true);
      // sit the hips on the seat: the seat top is at 0.49 m
      const hips = c.rig.bones[c.rig.hips].getWorldPosition(new THREE.Vector3());
      const local = c.root.worldToLocal(hips.clone());
      c.root.position.y += 0.57 - hips.y;
      // and over the seat's centre, a little back
      const off = new THREE.Vector3(local.x, 0, local.z - 0.04).applyAxisAngle(THREE.Object3D.DEFAULT_UP, stn.face);
      c.root.position.x -= off.x; c.root.position.z -= off.z;
      o.base = c.root.position.clone();
      o.chair = this.B.chairs[post];
    } else {
      o.base = c.root.position.clone();
      c.pose.play(Math.random() < 0.5 ? 'idle' : 'look_around', { fade: 0, t: Math.random() * 10 });
    }
    this.scene.add(c.root);
    o.label = h(`<div class="bh-label" style="--dc:${DEPTS[m.dept].color}"></div>`);
    this.hud.querySelector('.bh-labels').append(o.label);
    this.officers[post] = o;
  }

  removeOfficer(post) {
    const o = this.officers[post]; if (!o) return;
    this.scene.remove(o.root);
    o.label.remove();
    delete this.officers[post];
  }

  // ---------------- enter / exit ----------------
  toggle() { if (this.active) this.game.exitMode(); else this.enter(); }

  async enter() {
    const g = this.game;
    if (this.active) return;
    g.ui.closeAll();
    if (g.crewUI && g.crewUI.isOpen()) g.crewUI.toggle(false);
    this.active = true;
    g.enterMode('bridge', this);
    g.engine.setView(this.scene, this.camera);
    // a lit interior wants a gentler bloom than space (setView rebuilt the post chain; space gets its own back on exit)
    g.engine.bloomStrength.value = 0.42;
    if (g.engine.bloomNode.threshold) g.engine.bloomNode.threshold.value = 0.9;
    g.engine.uVignette.value = 0.55;
    this.hud.classList.add('on');
    document.body.classList.add('on-bridge');
    document.querySelectorAll('#menubar button[data-w="bridge"]').forEach((b) => b.classList.add('on'));
    // the world's "is the camera near" test should look through the viewscreen while we're up here
    const W = g.world;
    this.world = W;
    W.camNear = (p, d) => this.vsCam.position.distanceToSquared(p) < (d + 700) * (d + 700);
    const cv = g.engine.renderer.domElement;
    this.listen(cv);
    this.intro = 0; this.introOn = !this.skipIntro;
    this.yaw = this.yawT = 0; this.pitch = this.pitchT = -0.06;
    this.chatT = 5;
    this.spawnOfficers();
    this.say(null, 'Captain on the bridge.', 2.5);
  }

  // called by game.exitMode() (and by enterMode if another mode takes over)
  exit() {
    const g = this.game;
    this.active = false;
    this.hud.classList.remove('on');
    document.body.classList.remove('on-bridge');
    this.closeDialog();
    document.querySelectorAll('#menubar button[data-w="bridge"]').forEach((b) => b.classList.remove('on'));
    if (this.world) delete this.world.camNear;
    this.unlisten();
    for (const k of ['KeyA', 'KeyD']) g.input.down.delete(k);
  }

  listen(cv) {
    let down = null;
    this.onDown = (e) => { down = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; this.introOn = false; };
    this.onMove = (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      if (down && e.pointerId === down.id) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        down.moved += Math.abs(dx) + Math.abs(dy);
        down.x = e.clientX; down.y = e.clientY;
        const k = touchUI() ? 0.006 : 0.0045;
        this.yawT = clamp(this.yawT + dx * k, -YAW_MAX, YAW_MAX);
        this.pitchT = clamp(this.pitchT + dy * k * 0.8, PITCH_MIN, PITCH_MAX);
      }
    };
    this.onUp = (e) => {
      if (down && e.pointerId === down.id && down.moved < 8) { const o = this.pickOfficer(e.clientX, e.clientY); if (o) this.openDialog(o.post); }
      down = null;
    };
    this.onWheel = (e) => { this.camera.fov = clamp(this.camera.fov + Math.sign(e.deltaY) * 4, 38, 72); this.camera.updateProjectionMatrix(); };
    cv.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    cv.addEventListener('wheel', this.onWheel, { passive: true });
    this.cv = cv;
    this.cvTouch = cv.style.touchAction; cv.style.touchAction = 'none';
  }
  unlisten() {
    const cv = this.cv; if (!cv) return;
    cv.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('wheel', this.onWheel);
    cv.style.touchAction = this.cvTouch || '';
    cv.style.cursor = '';
  }

  // officer nearest to a screen point (their chest projected), within reach
  pickOfficer(x, y) {
    let best = null, bd = (touchUI() ? 70 : 55) ** 2;
    for (const o of Object.values(this.officers)) {
      for (const hgt of [0.55, 0.85]) {
        const p = this.project(o, hgt); if (!p) continue;
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
    }
    return best;
  }
  project(o, f) {
    const c = o.c;
    _v.set(0, (o.stn.sit ? 1.15 : c.height) * f, 0);
    o.root.localToWorld(_v);
    _v.project(this.camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };
  }

  // ---------------- per frame (mode update) ----------------
  update(dt, t, realDt) {
    const g = this.game, inp = g.input;
    if (inp.hit('escape')) {
      if (this.dlg) this.closeDialog();
      else if (!this.hadWindow) { g.exitMode(); return; }
    }
    this.hadWindow = !!(g.crewUI && g.crewUI.isOpen()) || Object.keys(g.ui.windows).some((k) => g.ui.isOpen(k));
    // with an officer listening, number keys pick a reply instead of firing abilities
    if (this.dlg && this.dlgOpts) {
      for (let i = 1; i <= 8; i++) {
        if (!inp.hit('ab' + i)) continue;
        inp.pressed.delete('Digit' + i);
        const op = this.dlgOpts[i - 1];
        if (op) { this.choose(this.dlg.post, op); break; }
      }
    }
    // the battle carries on: helm keys steer (mouse clicks belong to the bridge), the sector and world tick
    const m = inp.mouse, c0 = m.clicked[0], c2 = m.clicked[2];
    m.clicked[0] = m.clicked[2] = false;
    g.helm(dt);
    m.clicked[0] = c0; m.clicked[2] = c2;
    if (g.autoplay) g.autoplay.update(dt, t);
    g.sector.update(dt);
    g.world.update(dt, t);
    if (g.npcs) g.npcs.update(dt, t);
    this.steer(dt);
    if (this.restaffT > 0 && (this.restaffT -= realDt) <= 0) this.spawnOfficers();
    this.sitT = (this.sitT || 0) - realDt;
    if (this.sitT <= 0 || !this.sit) { this.sitT = 0.2; this.sit = situation(g); }
    const sit = this.sit;
    this.updateAlert(sit, realDt);
    this.updateOfficers(dt, realDt);
    this.updateCamera(realDt);
    this.renderViewscreen();
    this.updateHud(realDt, sit);
    // officers speak up
    this.chatT -= realDt;
    if (this.chatT <= 0) {
      this.chatT = 12 + Math.random() * 16;
      if (!this.dlg && !g.hudHidden) {
        const c = chatter(g, this, this.officers);
        if (c) this.say(c.post, c.line, 5);
      }
    }
  }

  // "bring our broadside to bear": swing beam-on to the target for a few seconds unless the captain takes the wheel
  steer(dt) {
    const s = this.game.player, tg = this.broadsideOn;
    if (!tg || !s || !s.alive || !tg.alive) { this.broadsideOn = null; return; }
    this.bsT = (this.bsT || 9) - dt;
    const inp = this.game.input;
    if (this.bsT <= 0 || inp.held('turnLeft') || inp.held('turnRight')) { this.broadsideOn = null; this.bsT = 9; return; }
    const brg = Math.atan2(tg.position.x - s.position.x, tg.position.z - s.position.z);
    const a = wrapAngle(brg - Math.PI / 2 - s.heading), b = wrapAngle(brg + Math.PI / 2 - s.heading);
    s.steerHeading(s.heading + (Math.abs(a) < Math.abs(b) ? a : b), Math.max(0.35, s.throttle));
  }

  updateAlert(sit, realDt) {
    const B = this.B;
    const want = sit.alert ? 1 : 0;
    this.alertK = damp(this.alertK, want, 3, realDt);
    B.alertK.value = this.alertK;
    const hullLow = sit.hullF < 0.3 ? 1 : 0;
    B.alert.value.setRGB(0.35 + 0.65 * this.alertK, 0.72 * (1 - this.alertK) + 0.12, 1.0 * (1 - this.alertK) + 0.12);
    const pulse = this.alertK * (0.5 + 0.5 * Math.sin(this.game.engine.realTime * 5));
    const L = B.lights;
    L.ceilLight.color.setRGB(0.6 + 0.4 * this.alertK, 0.72 * (1 - this.alertK * 0.7), 1 - this.alertK * 0.75);
    L.ceilLight.intensity = 6 * (1 - pulse * 0.45) * (this.flicker > 0 && Math.random() < 0.5 ? 0.3 : 1) * (hullLow && Math.random() < 0.03 ? 0.2 : 1);
    L.rear.color.setRGB(0.35 + 0.65 * this.alertK, 0.78 * (1 - this.alertK * 0.8), 1 - this.alertK * 0.8);
    if (this.flicker > 0) this.flicker -= realDt;
  }

  updateOfficers(dt, realDt) {
    const cam = this.camera.position;
    for (const o of Object.values(this.officers)) {
      const p = o.c.pose;
      const talking = (this.dlg && this.dlg.post === o.post) || o.talkT > 0;
      if (o.talkT > 0) o.talkT -= realDt;
      // face / swivel toward the captain while talking
      const toCam = Math.atan2(cam.x - o.root.position.x, cam.z - o.root.position.z);
      if (o.stn.sit) {
        const turn = talking ? clamp(wrapAngle(toCam - o.stn.face), -1.25, 1.25) * (o.post === 'xo' ? 0.55 : 0.8) : 0;
        o.yaw = damp(o.yaw, o.stn.face + turn, 4, realDt);
      } else {
        o.yaw = damp(o.yaw, talking ? toCam : o.yawT, 3.5, realDt);
      }
      // swivel the officer (and their chair) about the seat
      o.root.rotation.y = o.yaw;
      if (o.chair) o.chair.rotation.y = o.yaw;
      if (o.stn.sit) {
        const d = o.yaw - o.stn.face;
        _v.copy(o.base).sub(_w.set(o.stn.pos[0], o.base.y, o.stn.pos[2]));
        _v.applyAxisAngle(THREE.Object3D.DEFAULT_UP, d);
        o.root.position.set(o.stn.pos[0] + _v.x, o.base.y, o.stn.pos[2] + _v.z);
      }
      // where the head looks: at the captain when talking, else about the station
      const rel = wrapAngle(toCam - o.yaw);
      if (talking) { p.wantYaw = clamp(rel, -1.1, 1.1); p.wantPitch = clamp(Math.atan2((o.stn.sit ? 1.15 : o.c.height * 0.93) + o.root.position.y - cam.y, Math.hypot(cam.x - o.root.position.x, cam.z - o.root.position.z)) * 0.8, -0.4, 0.4); }
      else if (o.lookT > 0) o.lookT -= realDt;
      else { o.lookT = 2 + Math.random() * 5; p.wantYaw = Math.random() < 0.6 ? 0 : (Math.random() - 0.5) * 1.1; p.wantPitch = o.stn.sit ? 0.12 : (Math.random() - 0.3) * 0.25; }
      // what the body does
      if (talking) {
        if (o.state !== 'talk') {
          o.state = 'talk';
          if (o.stn.sit) p.layer('talk', { from: 'Spine1', weight: 0.85 }); else p.play('talk', { fade: 0.4 });
        }
      } else if (o.state === 'talk') {
        o.state = 'idle'; o.next = 2 + Math.random() * 4; o.yawT = o.stn.face;
        if (o.stn.sit) p.layer(null); else p.play('idle', { fade: 0.5 });
      } else {
        o.next -= realDt;
        if (o.state === 'report' && o.next <= 0) {
          // back to the console
          o.state = 'idle'; o.next = 3 + Math.random() * 6; o.yawT = o.stn.face;
          p.play('idle', { fade: 0.5 });
        } else if (o.state === 'idle' && o.next <= 0 && !o.stn.sit && Math.random() < 0.35) {
          // wall stations: now and then turn to report toward the command chair (so you see faces)
          o.state = 'report'; o.next = 3 + Math.random() * 3;
          o.yawT = Math.atan2(0 - o.root.position.x, 0.6 - o.root.position.z);
          p.play(Math.random() < 0.5 ? 'talk' : 'nod', { fade: 0.5, restart: true });
        } else if (o.state === 'work' && (o.stn.sit ? o.next < 0 : p.done)) {
          o.state = 'idle'; o.next = 4 + Math.random() * 8;
          if (o.stn.sit) p.layer(null); else p.play(Math.random() < 0.7 ? 'idle' : 'look_around', { fade: 0.5 });
        } else if (o.state === 'idle' && o.next <= 0) {
          o.state = 'work'; o.next = 2.2;
          if (o.stn.sit) p.layer('interact', { from: 'LeftShoulder,RightShoulder', weight: 0.6, speed: 0.8 });
          else p.play(Math.random() < 0.75 ? 'interact' : 'nod', { fade: 0.4, restart: true });
        }
      }
      p.step(realDt);
      p.apply();
    }
  }

  updateCamera(realDt) {
    const c = this.camera;
    // a slow establishing sweep when you arrive, then the captain's chair
    if (this.introOn) {
      this.intro += realDt / 3.2;
      if (this.intro >= 1) this.introOn = false;
    }
    const k = this.introOn ? 1 - easeInOut(Math.min(1, this.intro)) : 0;
    this.yaw = damp(this.yaw, this.yawT, 7, realDt);
    this.pitch = damp(this.pitch, this.pitchT, 7, realDt);
    const eye = CAPTAIN.eye;
    const orbit = 0.4 + k * 2.2;
    c.position.set(eye.x + Math.sin(orbit) * 5.2 * k, eye.y + k * 1.9, eye.z + Math.cos(orbit) * 4.5 * k);
    if (this.shake > 0.01) {
      c.position.x += (Math.random() - 0.5) * this.shake * 0.05; c.position.y += (Math.random() - 0.5) * this.shake * 0.04;
      this.shake = damp(this.shake, 0, 4, realDt);
    }
    // look direction: yaw 0 faces the viewscreen (-z)
    const yaw = this.yaw * (1 - k) + k * (orbit * 0.5), pitch = this.pitch * (1 - k) - k * 0.35;
    _v.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    if (k > 0) { _w.set(0, 1.2, -2.2); _v.lerp(_w.sub(c.position).normalize(), k).normalize(); }
    c.lookAt(_v.add(c.position));
  }

  renderViewscreen() {
    const g = this.game, s = g.player, cam = this.vsCam;
    if (g.engine.simulating) return;   // fast-forward: no pictures
    if (s) {
      const L = s.dims.L;
      if (this.viewMode === 'tactical') {
        cam.fov = 45;
        cam.position.set(s.position.x, s.position.y + 1500, s.position.z + 420);
        cam.lookAt(s.position);
      } else {
        // over our shoulder; with a target in reach, frame both ships so the screen shows the fight
        cam.fov = 50;
        const tg = s.target && s.target.alive && s.target.position.distanceTo(s.position) < 2600 ? s.target : null;
        if (tg) _f.copy(tg.position).sub(s.position).setY(0).normalize();
        else _f.set(Math.sin(s.heading), 0, Math.cos(s.heading));
        this.vsDir = this.vsDir || _f.clone();
        this.vsDir.lerp(_f, this.vsInit ? 0.06 : 1).normalize();
        const back = tg ? L * 1.9 + 40 : L * 1.55;
        _v.copy(s.position).addScaledVector(this.vsDir, -back).add(_w.set(0, L * 0.45 + (tg ? 30 : 18), 0));
        cam.position.lerp(_v, this.vsInit ? 0.15 : 1); this.vsInit = true;
        if (tg) _v.copy(s.position).lerp(tg.position, 0.42); else _v.copy(s.position).addScaledVector(this.vsDir, L * 2.2);
        this.vsLook = this.vsLook || _v.clone();
        this.vsLook.lerp(_v, 0.12);
        cam.lookAt(this.vsLook);
      }
      cam.updateProjectionMatrix();
    }
    const W = g.world;
    if (W.backdrop && W.backdrop.dome) W.backdrop.dome.position.copy(cam.position);
    const r = g.engine.renderer;
    r.setRenderTarget(this.rt);
    r.render(g.spaceScene, cam);
    r.setRenderTarget(null);
  }

  // ---------------- orders with effects ----------------
  reroute() {
    const s = this.game.player; if (!s) return;
    for (let i = 0; i < 4; i++) s.shields[i] = Math.min(s.maxShield * 0.3, s.shields[i] + s.maxShield * 0.3 * 0.3);
    s.shieldMat.userData.hitTime.value = this.game.engine.time;
    s.throttle = Math.min(s.throttle, 0.5);
    this.game.world.fx.ring(s.position, s.dims.L * 0.7, 0x58b8ff, 48);
  }
  recover() {
    const g = this.game, s = g.player; if (!s) return;
    for (const d of g.world.loot.drops) {
      if (d.pos.distanceTo(s.position) > 2200 || (d.type === 'item' && !g.canCollect(d))) continue;
      _v.copy(s.position).sub(d.pos).normalize();
      d.vel.copy(_v).multiplyScalar(260); d.pulled = true;
      g.world.beams.add(s.position, d.pos, 0x9a6bff, 0.8, 0.4);
    }
  }
  openCrew(tab) {
    const ui = this.game.crewUI; if (!ui) return;
    this.closeDialog();
    if (!ui.isOpen()) ui.toggle(true);
    ui.show(tab);
  }

  // ---------------- HUD ----------------
  buildHud() {
    const el = h(`<div id="bridgeHud"><div class="bh-labels"></div>
      <button class="btn bh-back">◀ Space view [B]</button>
      <div class="bh-top holo"><div class="t" id="bhTitle">BRIDGE</div><div class="s" id="bhSub"></div></div>
      <div class="bh-crewl holo scan"><div class="label">Bridge officers</div><div id="bhOff"></div></div>
      <div class="bh-status holo scan" id="bhStatus"></div>
      <div class="bh-sub" id="bhSubt"></div>
      <div class="bh-dlg holo scan" id="bhDlg"></div>
      <div class="bh-hint">Drag to look · click an officer to talk · W/S/A/D/R/F helm · Space: broadside · 1–8 abilities · Esc or B to leave</div>
      <div class="bh-touch" id="bhTouch">
        <span></span><button data-k="KeyW" data-tap="1">▲<span class="lab">AHEAD</span></button><span></span>
        <button data-k="KeyA">◀<span class="lab">PORT</span></button><button data-k="KeyX" data-tap="1">■<span class="lab">STOP</span></button><button data-k="KeyD">▶<span class="lab">STBD</span></button>
        <button data-k="Space" data-tap="1">✸<span class="lab">VOLLEY</span></button><button data-k="KeyS" data-tap="1">▼<span class="lab">ASTERN</span></button><button data-k="Tab" data-tap="1">◎<span class="lab">TARGET</span></button>
      </div></div>`);
    document.body.append(el);
    this.hud = el;
    el.querySelector('.bh-back').addEventListener('click', () => this.game.exitMode());
    // touch helm: taps are key presses, holds are held keys (the helm reads them like the keyboard)
    const inp = this.game.input;
    for (const b of el.querySelectorAll('#bhTouch button')) {
      const k = b.dataset.k, tap = !!b.dataset.tap;
      const on = (e) => { e.preventDefault(); b.classList.add('on'); if (tap) inp.pressed.add(k); else inp.down.add(k); };
      const off = (e) => { e.preventDefault(); b.classList.remove('on'); if (!tap) inp.down.delete(k); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
    }
    this.hudT = 0;
  }

  renderCrewList() {
    const box = this.hud.querySelector('#bhOff');
    box.innerHTML = '';
    for (const post of OFFICER_KEYS) {
      const o = this.officers[post]; if (!o) continue;
      const m = o.member, P = OFFICER_POSTS[post];
      const row = h(`<div class="bh-off" style="--dc:${DEPTS[m.dept].color}">${face(m)}<div><div class="p">${P.short}${o.acting ? ' · ACTING' : ''}</div><div class="n">${rankAbbr(m)} ${esc(m.name)}</div></div></div>`);
      row.addEventListener('click', () => this.openDialog(post));
      box.append(row);
      o.row = row;
    }
  }

  updateHud(realDt, sit) {
    const g = this.game, s = g.player;
    // labels over the officers
    let hover = null;
    if (this.mouse && !touchUI()) hover = this.pickOfficer(this.mouse.x, this.mouse.y);
    if (this.cv) this.cv.style.cursor = hover ? 'pointer' : 'grab';
    for (const o of Object.values(this.officers)) {
      const p = this.project(o, o.stn.sit ? 1.2 : 1.1);
      const show = p && p.x > -50 && p.x < innerWidth + 50 && p.y > 0 && p.y < innerHeight;
      o.label.style.display = show ? '' : 'none';
      if (show) {
        o.label.style.left = p.x.toFixed(0) + 'px'; o.label.style.top = p.y.toFixed(0) + 'px';
        const txt = `${OFFICER_POSTS[o.post].short} · ${rankAbbr(o.member)} ${o.member.name.split(' ').pop()}`;
        if (o.label.textContent !== txt) o.label.textContent = txt;
        o.label.style.opacity = hover === o || (this.dlg && this.dlg.post === o.post) ? '1' : '0.65';
      }
      if (o.row) o.row.classList.toggle('on', !!(this.dlg && this.dlg.post === o.post));
    }
    this.hudT -= realDt;
    if (this.hudT > 0) return;
    this.hudT = 0.25;
    const sys = g.sector && g.sector.sys;
    this.hud.querySelector('#bhTitle').innerHTML = sit.alert ? '<span style="color:#ff5468;text-shadow:0 0 12px #ff2040">RED ALERT</span>' : `BRIDGE · ${esc(g.data.ship.name.toUpperCase())}`;
    this.hud.querySelector('#bhSub').textContent = `${sys ? sys.name : ''} · ${sit.hostiles.length ? `${sit.hostiles.length} contacts` : 'no contacts'} · viewscreen ${this.viewMode}`;
    if (s) {
      const tg = s.target && s.target.alive ? s.target : null;
      const bar = (cls, f, txt) => `<div class="bar ${cls}"><i style="width:${(clamp(f, 0, 1) * 100).toFixed(1)}%"></i><span>${txt}</span></div>`;
      this.hud.querySelector('#bhStatus').innerHTML = `<div class="label">Hull</div>${bar('hull', s.hull / s.maxHull, `${Math.round(Math.max(0, s.hull))} / ${Math.round(s.maxHull)}`)}
        <div class="label">Shields</div>${bar('shield', s.shieldTotal() / (s.maxShield * 1.2), Math.round(s.shieldTotal()))}
        <div class="label" style="display:flex;justify-content:space-between"><span>Speed ${Math.round(Math.abs(s.speed))} / ${Math.round(s.maxSpeed)}</span><span>${s.autoFire ? 'Weapons free' : 'Holding fire'}</span></div>
        <div class="label" style="margin-top:4px;color:${tg ? '#ff8a9a' : 'var(--text-dim)'}">${tg ? `Target · ${esc(tg.name)} · ${Math.round(tg.hull / tg.maxHull * 100)}%` : 'No target'}</div>`;
    }
    if (this.dlg && this.dlg.t !== undefined) { this.dlg.t -= 0.25; }
  }

  // subtitles for unprompted remarks (and the officer gestures as they speak)
  say(post, line, secs = 4) {
    if (this.game.hudHidden) return;
    const el = this.hud.querySelector('#bhSubt');
    const o = post && this.officers[post];
    el.style.setProperty('--dc', o ? DEPTS[o.member.dept].color : 'var(--cyan)');
    el.innerHTML = o ? `<b>${OFFICER_POSTS[post].short}</b>${esc(line)}` : `<b>COMPUTER</b>${esc(line)}`;
    el.style.opacity = '1';
    clearTimeout(this.subTimer);
    this.subTimer = setTimeout(() => { el.style.opacity = '0'; }, secs * 1000);
    if (o) o.talkT = Math.min(secs, 3.5);
  }

  openDialog(post, reply = null) {
    const o = this.officers[post]; if (!o) return;
    this.dlg = { post };
    const g = this.game, m = o.member, P = OFFICER_POSTS[post];
    const t = talk(post, g, this);
    const el = this.hud.querySelector('#bhDlg');
    el.style.setProperty('--dc', DEPTS[m.dept].color);
    el.innerHTML = `${face(m, 'big')}<div><div class="who">${P.name}${o.acting ? ' (acting)' : ''} · ${rankAbbr(m)} ${esc(m.name)}</div>
      <div class="line">${esc(reply || t.line)}</div><div class="opts"></div></div><span class="x">✕</span>`;
    const opts = el.querySelector('.opts');
    this.dlgOpts = t.options;
    t.options.forEach((op, i) => {
      const b = h(`<button><i>${i + 1}</i>${esc(op.label)}</button>`);
      b.addEventListener('click', () => this.choose(post, op));
      opts.append(b);
    });
    el.querySelector('.x').addEventListener('click', () => this.closeDialog());
    el.classList.add('on');
    document.body.classList.add('bridge-dlg');
    this.hud.querySelector('#bhSubt').style.opacity = '0';
  }
  choose(post, op) {
    if (op.close) { this.closeDialog(); return; }
    const reply = op.run && op.run();
    const o = this.officers[post];
    if (o) o.talkT = 2.5;
    if (this.dlg && this.dlg.post === post) this.openDialog(post, reply);
  }
  closeDialog() {
    this.dlg = null;
    const el = this.hud && this.hud.querySelector('#bhDlg');
    if (el) el.classList.remove('on');
    document.body.classList.remove('bridge-dlg');
  }
}

function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2; }
