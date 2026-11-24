// Orbit side of exploration: spot a landable world under the ship, scan it (a holographic sweep
// over the planet, pulses from the hull, a sensor beam), read the survey (hazard, resources,
// landing sites), drop an orbital probe, and launch the explorer in a drop pod.
import * as THREE from 'three/webgpu';
import { vec3, float, positionLocal, normalize, smoothstep, abs, sin, fract, uniform, max, dot, normalView, positionViewDirection, asin, atan } from 'three/tsl';
import { surveyPlanet, planetKey, featureName, RESOURCES, RES_KEYS, ORBITAL_PROBE_COST, orbitalProbeYield, affordable, pay, addResources } from './economy.js';
import { ensureExplorer, explorerStats } from './explorerItems.js';
import { biomeFor } from './biomes.js';
import { PlanetMode } from './PlanetMode.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const SCAN_TIME = 3.2;

function scanMaterial(engine) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const prog = uniform(-1.2), fade = uniform(1);
  const p = normalize(positionLocal);
  const lat = asin(p.y), lon = atan(p.z, p.x);
  const grid = smoothstep(0.93, 1.0, abs(sin(lat.mul(18)))).add(smoothstep(0.93, 1.0, abs(sin(lon.mul(18)))));
  const band = smoothstep(0.08, 0.0, abs(p.y.sub(prog)));
  const revealed = smoothstep(prog.add(0.02), prog.sub(0.02), p.y);
  const rim = float(1).sub(abs(dot(normalView, positionViewDirection))).pow(2);
  const flick = sin(engine.uRealTime.mul(30).add(p.x.mul(40))).mul(0.1).add(0.9);
  m.colorNode = vec3(0.35, 0.8, 1.6).mul(band.mul(4).add(grid.mul(revealed).mul(0.9)).add(rim.mul(0.6))).mul(fade).mul(flick)
    .add(vec3(0.9, 0.5, 1.8).mul(grid.mul(band).mul(2)).mul(fade));
  m.userData = { prog, fade };
  return m;
}

export class Scanner {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.t = 0;
    this.enabled = true;
  }
  get engine() { return this.game.engine; }

  ensureDom() {
    if (this.prompt) return;
    const ui = document.getElementById('ui');
    this.prompt = h(`<div id="pScanPrompt" class="holo"></div>`);
    this.prompt.addEventListener('click', () => this.scan());
    this.panel = h(`<div id="pScanPanel" class="win holo scan"><div class="wtitle"><span>Planetary survey</span><span class="close">✕</span></div><div class="wbody"></div></div>`);
    this.panel.querySelector('.close').addEventListener('click', () => this.close());
    this.entry = h(`<div id="pEntry"><div class="streaks"></div><div class="et">ATMOSPHERIC ENTRY</div><div class="es" id="pEntrySub"></div></div>`);
    ui.append(this.prompt, this.panel);
    document.body.append(this.entry);
  }

  // nearest landable world whose surface lies under the ship
  nearby() {
    const G = this.game;
    if (!G.sector || !G.player) return null;
    const p = G.player.position;
    let best = null, bd = Infinity;
    for (const g of G.sector.planets) {
      const info = g.userData.info;
      if (!info || !info.landable) continue;
      const r = info.radius;
      const d = Math.hypot(g.position.x - p.x, g.position.z - p.z);
      if (d < r * 1.6 + 250 && d < bd) { bd = d; best = g; }
    }
    return best;
  }

  update(dt) {
    const G = this.game;
    if (!G.data || !G.ui) return;
    this.ensureDom();
    const space = G.mode === 'space' && !G.hudHidden;
    const near = space ? this.nearby() : null;
    if (this.state === 'scanning') this.animate(dt);
    else if (this.state === 'drop') this.animateDrop(dt);
    if (near && this.state === 'idle') {
      const info = near.userData.info, key = planetKey(G.data.system, info);
      const known = ensureExplorer(G.data).scanned[key];
      const txt = `◈ ${info.name} · ${(info.moon ? 'moon · ' : '') + biomeFor(info.type).name} — <b>[V]</b> ${known ? 'survey report' : 'scan'}`;
      if (this.prompt._t !== txt) { this.prompt.innerHTML = txt; this.prompt._t = txt; }
      this.prompt.style.display = '';
    } else this.prompt.style.display = 'none';
    if (this.state === 'panel' && (!space || !this.target || this.nearby() !== this.target)) this.close();
  }

  scan() {
    const G = this.game;
    if (G.mode !== 'space' || this.state === 'scanning' || this.state === 'drop') return;
    this.ensureDom();
    const g = this.nearby();
    if (!g) { G.ui.toast('No landable world under the ship — fly over a planet or moon', 'warn'); this.pingEmpty(); return; }
    const info = g.userData.info, key = planetKey(G.data.system, info);
    this.target = g;
    this.survey = surveyPlanet(info, G.sector.sys);
    if (ensureExplorer(G.data).scanned[key]) { this.showPanel(); return; }
    this.state = 'scanning'; this.t = 0;
    const mat = scanMaterial(this.engine);
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(info.radius * 1.035, 64, 32), mat);
    g.add(this.sphere);
    this.camSave = G.cam.distTarget;
    G.cam.distTarget = Math.min(G.cam.maxDist, Math.max(G.cam.distTarget, info.radius * 2.4));
    G.ui.chat('SYS', null, `Scanning ${info.name}…`, 'sys');
  }
  pingEmpty() { const G = this.game; if (G.player) { G.world.fx.ring(G.player.position, 300, 0x58c8ff, 64); } }

  animate(dt) {
    const G = this.game, g = this.target, info = g.userData.info, fx = G.world.fx;
    this.t += dt;
    const k = this.t / SCAN_TIME;
    this.sphere.material.userData.prog.value = -1.15 + k * 2.3;
    const s = G.player.position;
    if (Math.floor(this.t * 2.5) !== Math.floor((this.t - dt) * 2.5)) { fx.ring(s, 180 + k * 140, k > 0.5 ? 0x9a6bff : 0x58c8ff, 72); fx.ring(_v.copy(g.position).setY(g.position.y + info.radius * 1.02), info.radius * 0.9, 0x58c8ff, 96); }
    // sensor beam: motes streaming from the hull down to the surface
    const top = _w.copy(g.position).add(_v.set(0, info.radius, 0));
    for (let i = 0; i < 3; i++) {
      const u = Math.random();
      const px = s.x + (top.x - s.x) * u + (Math.random() - 0.5) * 20, py = s.y + (top.y - s.y) * u, pz = s.z + (top.z - s.z) * u + (Math.random() - 0.5) * 20;
      fx.glow.emit(px, py, pz, (top.x - s.x) * 0.4, (top.y - s.y) * 0.4, (top.z - s.z) * 0.4, 0.5, 0.6, 1.6, 3, 0.8, 18, 4, 0, 0);
    }
    if (Math.random() < 0.4) fx.column(_v.copy(s), 0x58c8ff, 80, 6);
    if (this.t >= SCAN_TIME) {
      const key = planetKey(G.data.system, info);
      const ex = ensureExplorer(G.data);
      ex.scanned[key] = { name: info.name, type: this.survey.type, hazard: this.survey.hazard, sys: G.data.system, at: Math.round(G.data.playtime) };
      this.sphere.material.userData.fade.value = 0.35;
      G.ui.toast(`Survey complete: ${info.name}`, 'epic');
      this.showPanel();
    }
  }

  markers(on) {
    const g = this.target;
    if (this.markerGroup) { this.markerGroup.removeFromParent(); this.markerGroup = null; }
    if (!on || !g) return;
    const body = g.userData.body, r = g.userData.info.radius;
    const grp = new THREE.Group();
    this.survey.sites.forEach((s, i) => {
      const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const sel = i === this.siteIdx;
      m.colorNode = vec3(sel ? 2.5 : 0.6, sel ? 1.6 : 1.4, sel ? 0.6 : 2.6);
      const sp = new THREE.Sprite(m);
      sp.scale.setScalar(r * (sel ? 0.12 : 0.08));
      sp.position.set(Math.cos(s.lat) * Math.cos(s.lon), Math.sin(s.lat), Math.cos(s.lat) * Math.sin(s.lon)).multiplyScalar(r * 1.03);
      grp.add(sp);
    });
    body.add(grp);
    this.markerGroup = grp;
  }

  showPanel() {
    const G = this.game, S = this.survey, ex = ensureExplorer(G.data), info = this.target.userData.info;
    this.state = 'panel';
    this.siteIdx = this.siteIdx != null && this.siteIdx < S.sites.length ? this.siteIdx : 0;
    this.markers(true);
    const st = explorerStats(ex);
    const B = biomeFor(S.type);
    const op = ex.orbital && ex.orbital[S.key];
    const opYield = op ? orbitalProbeYield(S, op, G.data.playtime) : null;
    const opN = opYield ? Object.values(opYield).reduce((a, b) => a + b, 0) : 0;
    const body = this.panel.querySelector('.wbody');
    const hz = '▮'.repeat(S.hazard) + '▯'.repeat(5 - S.hazard);
    body.innerHTML = `
      <div class="title" style="color:var(--cyan);font-size:15px">${info.name}</div>
      <div class="label" style="margin:2px 0 10px">${info.moon ? 'Moon' : 'Planet'} · ${B.name} · radius ${Math.round(info.radius * 10)} km · system danger ${S.danger}</div>
      <div class="hz hz${S.hazard}">HAZARD <b>${hz}</b> ${S.hazardName}</div>
      <div class="label" style="margin:10px 0 4px">Resource richness</div>
      <div class="rich">${RES_KEYS.map((k) => `<div class="rrow"><span style="color:${RESOURCES[k].color}">${RESOURCES[k].name}</span><div class="bar"><i style="width:${(S.richness[k] * 100).toFixed(0)}%;background:${RESOURCES[k].color};box-shadow:0 0 8px ${RESOURCES[k].color}"></i></div></div>`).join('')}</div>
      <div class="label" style="margin:10px 0 4px">Landing sites detected · ${S.sites.length}</div>
      <div class="sites">${S.sites.map((s, i) => `<div class="site ${i === this.siteIdx ? 'on' : ''}" data-i="${i}"><b>${String.fromCharCode(65 + i)} · ${s.name}</b><span class="label">threat ${s.level}</span><div class="feat">${s.features.map(featureName).join(' · ')}</div></div>`).join('')}</div>
      <div class="label" style="margin:10px 0 2px">Explorer: ${st.chassis.fullName} · level ${ex.level} · hull ${Math.round(st.maxHp)} · cargo ${st.cargo}</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn violet deploy" id="pDeploy">Deploy explorer</button>
        ${op ? `<button class="btn" id="pProbeRecover">Recover probe haul (${opN})</button>` : `<button class="btn" id="pProbeDrop" title="${Object.entries(ORBITAL_PROBE_COST).map(([k, v]) => `${v} ${k}`).join(', ')}">Drop orbital probe</button>`}
        <button class="btn" id="pBay">Explorer bay</button>
      </div>`;
    body.querySelectorAll('.site').forEach((el) => el.addEventListener('click', () => { this.siteIdx = +el.dataset.i; this.showPanel(); }));
    body.querySelector('#pDeploy').onclick = () => this.deploy();
    body.querySelector('#pBay').onclick = () => G.planet.windows.toggle('explorer', true);
    const drop = body.querySelector('#pProbeDrop');
    if (drop) drop.onclick = () => {
      if (!pay(G.data, ORBITAL_PROBE_COST)) { G.ui.toast('Orbital probe needs 40 ore, 15 crystal, 250 ¢', 'warn'); return; }
      ex.orbital ||= {};
      ex.orbital[S.key] = { t: G.data.playtime, cap: 60 };
      G.world.fx.column(G.player.position, 0x58e0ff, 200, 40);
      G.ui.toast('Orbital probe away — it will mine until full', 'epic');
      this.showPanel();
    };
    const rec = body.querySelector('#pProbeRecover');
    if (rec) rec.onclick = () => {
      const y = orbitalProbeYield(S, op, G.data.playtime);
      const n = addResources(G.data, y);
      op.t = G.data.playtime;
      G.ui.toast(n ? `Probe haul recovered: ${n} units` : 'The probe has nothing yet', n ? 'epic' : 'warn');
      this.showPanel();
    };
    this.panel.classList.add('open');
  }

  close() {
    this.panel && this.panel.classList.remove('open');
    if (this.sphere) { this.sphere.removeFromParent(); this.sphere.geometry.dispose(); this.sphere = null; }
    this.markers(false);
    if (this.camSave !== undefined) { this.game.cam.distTarget = this.camSave; this.camSave = undefined; }
    if (this.state === 'panel' || this.state === 'scanning') this.state = 'idle';
  }

  // drop pod from the ship to the chosen site, then planetfall
  deploy() {
    const G = this.game, S = this.survey, site = S.sites[this.siteIdx || 0];
    const g = this.target, r = g.userData.info.radius;
    this.panel.classList.remove('open');
    if (this.sphere) { this.sphere.removeFromParent(); this.sphere = null; }
    const local = new THREE.Vector3(Math.cos(site.lat) * Math.cos(site.lon), Math.sin(site.lat), Math.cos(site.lat) * Math.sin(site.lon)).multiplyScalar(r);
    g.userData.body.updateMatrixWorld(true);
    this.dropTo = g.userData.body.localToWorld(local.clone());
    if (this.dropTo.y < g.position.y) this.dropTo.copy(g.position).add(new THREE.Vector3(0, r, 0));
    this.dropFrom = G.player.position.clone();
    this.state = 'drop'; this.t = 0; this.site = site;
    G.ui.toast(`Drop pod away — ${site.name}`, 'epic');
    G.world.fx.ring(G.player.position, 120, 0x9a6bff, 64);
  }
  animateDrop(dt) {
    const G = this.game, fx = G.world.fx;
    this.t += dt;
    const k = Math.min(1, this.t / 1.6);
    const p = _v.lerpVectors(this.dropFrom, this.dropTo, k * k);
    p.y += Math.sin(k * Math.PI) * 120;
    fx.engineTrail(p, _w.set(0, 1, 0), 0xffb060, 1.2, 14);
    fx.engineTrail(p, _w.set(0, 1, 0), 0x9a6bff, 0.8, 22);
    if (k >= 1 && this.state === 'drop') {
      this.state = 'entering';
      fx.explosion(this.dropTo, 1.2, 0xffd090);
      this.markers(false);
      this.planetfall(this.target.userData.info, this.survey, this.site);
    }
  }

  // build the surface behind the entry overlay, then hand over to PlanetMode
  planetfall(info, survey, site) {
    const G = this.game;
    this.ensureDom();
    this.entry.querySelector('#pEntrySub').textContent = `${info.name} · ${site.name}`;
    this.entry.classList.add('show');
    G.planet.windows.closeAll(); G.ui.closeAll();
    setTimeout(() => {
      try {
        const mode = new PlanetMode(G, { info, sys: G.sector ? G.sector.sys : { id: 0, danger: 1 }, survey, site });
        mode.enter();
        G.planet.current = mode;
      } catch (e) { console.error('planetfall failed', e); G.ui.toast('Planetfall aborted: ' + e.message, 'bad'); }
      this.state = 'idle';
      this.close();
      setTimeout(() => this.entry.classList.remove('show'), 700);
    }, 450);
  }
}
