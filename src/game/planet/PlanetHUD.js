// Planet-mode interface: explorer status, objectives, cargo meter, ability bar, probe status,
// site minimap, boss bar, and an overlay canvas for health bars, damage numbers and markers.
// Collapses to a compact layout on touch / narrow screens and to a status strip when
// game.hudHidden is set (autoplay "hide interface").
import * as THREE from 'three/webgpu';
import { icon } from '../../ui/icons.js';
import { RESOURCES, RES_KEYS, cargoTotal } from './economy.js';
import { explorerXpForLevel } from './explorerItems.js';
import { PLANET_ABILITIES } from './abilities.js';
import { EX_BASES } from './explorerItems.js';
import { RARITY } from '../data/items.js';
import { SITE_R } from './terrainHeight.js';
import { CELL } from './dungeonGen.js';
import { featureName } from './economy.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmt = (n) => n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString();
const _p = new THREE.Vector3(), _q = new THREE.Vector3();
const CRATE_COL = ['#9fdcff', '#4f9dff', '#b46bff', '#ff9a2e'];

export class PlanetHUD {
  constructor(mode) {
    this.mode = mode;
    this.numbers = [];
    this.boss = null;
    const ui = document.getElementById('ui');
    const root = this.root = h(`<div id="planetHud"></div>`);
    root.append(h(`<div id="pStatus" class="holo scan">
      <div class="prow"><div class="plvl" id="pLvl">1</div><div style="flex:1;min-width:0"><div class="pname" id="pName">—</div><div class="psub" id="pSub">—</div></div><div class="pcred" id="pCred">0 ¢</div></div>
      <div class="label">Hull</div><div class="bar hull ghost" id="pHull"><b></b><i></i><span></span></div>
      <div class="label">Shield</div><div class="bar shield" id="pShield"><i></i><span></span></div>
      <div class="label">Explorer XP</div><div class="bar xp" id="pXp"><i></i><span></span></div>
      <div class="pthreat"><span class="label">Threat</span><div class="bar threat" id="pThreat"><i></i></div></div></div>`));
    root.append(h(`<div id="pBanner" class="holo"><div class="title" id="pPlanet"></div><div class="psite" id="pSite"></div><div id="pObj"></div></div>`));
    root.append(h(`<div id="pMap" class="holo"><canvas width="472" height="472"></canvas><div class="mlabel" id="pMapLabel"></div></div>`));
    root.append(h(`<div id="pCargo" class="holo scan"><div class="title">Cargo <span id="pCargoN" class="val"></span></div><div class="bar cargo" id="pCargoBar"><i></i><span></span></div><div class="cres" id="pCargoRes"></div><div class="label" style="margin-top:6px">Banked</div><div class="cres bank" id="pBank"></div></div>`));
    const ab = h(`<div id="pAbilities" class="holo"></div>`);
    PLANET_ABILITIES.forEach((a, i) => {
      const el = h(`<div class="ab pab" title="${a.name}">${icon(a.icon)}<div class="cd"></div><div class="cdt"></div><div class="key">${a.key}</div></div>`);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); mode.useAbility(i); });
      el.addEventListener('mouseenter', (e) => mode.game.ui.showTip(`<div class="tn" style="color:var(--cyan)">${a.name}</div><div class="tb">Explorer level ${a.unlock} · ${a.cd}s cooldown</div><div class="tl">${a.desc}</div>`, e));
      el.addEventListener('mouseleave', () => mode.game.ui.hideTip());
      ab.append(el);
    });
    const pr = h(`<div class="ab pab probe" title="Launch probe">${icon('drone')}<div class="cdt" id="pProbeN"></div><div class="key">X</div></div>`);
    pr.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); mode.probes.launch(); });
    pr.addEventListener('mouseenter', (e) => mode.game.ui.showTip(`<div class="tn" style="color:var(--cyan)">Resource Probe</div><div class="tl">Launches a mining drone that flies to the nearest deposit, mines it and brings the haul back. Creatures will hunt it.</div>`, e));
    pr.addEventListener('mouseleave', () => mode.game.ui.hideTip());
    ab.append(pr);
    root.append(ab);
    root.append(h(`<div id="pGear" class="holo"><div class="title">Systems</div><div id="pGuns"></div><div id="pProbes"></div></div>`));
    const btns = h(`<div id="pButtons"><button class="btn" data-a="bay">Explorer bay<kbd> L</kbd></button><button class="btn violet" data-a="refinery">Refinery<kbd> U</kbd></button><button class="btn" data-a="context" id="pCtx" style="display:none"></button><button class="btn bad" data-a="orbit" id="pOrbit">Return to orbit</button></div>`);
    btns.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'bay') mode.game.planet.windows.toggle('explorer');
      else if (a === 'refinery') mode.game.planet.windows.toggle('refinery');
      else if (a === 'orbit') mode.returnToOrbit();
      else mode.interact();
    }));
    root.append(btns);
    root.append(h(`<div id="pBoss"><div class="bname" id="pBossName"></div><div class="bar hull" id="pBossBar"><i></i><span></span></div><div class="bsub" id="pBossSub"></div></div>`));
    root.append(h(`<div id="pPrompt"></div>`));
    const strip = h(`<div id="pStrip" class="holo"><span id="pStripTxt"></span><button class="btn" data-p="show">Show</button><button class="btn bad" data-p="stop">Stop autoplay</button></div>`);
    strip.querySelector('[data-p=show]').onclick = () => { this.peekUntil = performance.now() + 20000; };
    strip.querySelector('[data-p=stop]').onclick = () => { if (mode.game.autoplay) mode.game.toggleAutoplay(); };
    root.append(strip);
    this.peekUntil = 0;
    // tapping the world while the interface is hidden peeks it for a few seconds
    this.onPeek = (e) => { if (this.hidden && (e.target.id === 'view' || e.target.id === 'pTouch')) this.peekUntil = performance.now() + 6000; };
    addEventListener('pointerdown', this.onPeek);
    root.append(h(`<div id="pFade"><div class="ft" id="pFadeTxt"></div><div class="streaks"></div></div>`));
    root.append(h(`<div id="pDeath"><div class="big">EXPLORER LOST</div><div class="label" style="margin-top:14px">Half the unbanked cargo is gone. A replacement drops from the lander…</div></div>`));
    ui.append(root);
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'pOverlay';
    document.body.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.mapCtx = root.querySelector('#pMap canvas').getContext('2d');
    this.el = {};
    for (const id of ['pLvl', 'pName', 'pSub', 'pCred', 'pHull', 'pShield', 'pXp', 'pThreat', 'pPlanet', 'pSite', 'pObj', 'pCargoN', 'pCargoBar', 'pCargoRes', 'pBank', 'pGuns', 'pProbes', 'pCtx', 'pOrbit', 'pBoss', 'pBossName', 'pBossBar', 'pBossSub', 'pPrompt', 'pProbeN', 'pMapLabel', 'pStripTxt', 'pFade', 'pFadeTxt', 'pDeath']) this.el[id] = root.querySelector('#' + id);
    this.abEls = [...root.querySelectorAll('#pAbilities .ab')];
    this.resize = () => {
      const dpr = Math.min(devicePixelRatio, 2); this.dpr = dpr;
      this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
      this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px';
      const compact = matchMedia('(pointer: coarse)').matches || innerWidth < 900;
      root.classList.toggle('compact', compact);
    };
    addEventListener('resize', this.resize);
    this.resize();
    this.slow = 0;
  }

  show() {
    this.root.style.display = '';
    this.canvas.style.display = '';
    const M = this.mode;
    this.el.pPlanet.textContent = `${M.survey.name} · ${M.biome.name}`;
    this.el.pSite.textContent = `${M.siteInfo.name} · Hazard ${M.survey.hazardName} · Threat level ${M.siteInfo.level}`;
    this.buildMap();
  }
  destroy() {
    removeEventListener('resize', this.resize);
    removeEventListener('pointerdown', this.onPeek);
    document.body.classList.remove('planet-hud-hidden');
    this.root.remove(); this.canvas.remove();
    this.mode.game.ui.hideTip();
  }
  refreshWindows() { const W = this.mode.game.planet && this.mode.game.planet.windows; if (W) W.refresh(); }

  // ---------------- feedback ----------------
  damageNumber(pos, amount, crit, kind) {
    if (this.numbers.length > 80) this.numbers.shift();
    this.numbers.push({ pos: pos.clone(), v: Math.max(1, Math.round(amount)), crit, kind, t: 0, dx: (Math.random() - 0.5) * 30 });
  }
  // free text that floats up from a world position (damage numbers, pickups and the like)
  floatText(pos, text, color = '#ffffff') {
    if (this.numbers.length > 80) this.numbers.shift();
    this.numbers.push({ pos: pos.clone(), text, color, t: 0, dx: 0, kind: 'text' });
  }
  cargoPop(res, k) { this.popT = 0.4; this.popRes = res; }
  death(on) { this.el.pDeath.classList.toggle('show', on); }
  flashOverlay(text, fn) {
    const f = this.el.pFade;
    this.el.pFadeTxt.textContent = text;
    f.classList.remove('out'); f.classList.add('in');
    setTimeout(() => { try { fn(); } finally { setTimeout(() => { f.classList.remove('in'); f.classList.add('out'); }, 250); } }, 650);
  }

  // ---------------- minimap background ----------------
  buildMap() {
    const M = this.mode, N = 192;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
    const S = M.surfaceS, B = M.biome;
    const lo = new THREE.Color(B.tint).multiplyScalar(0.35), hi = new THREE.Color(B.tint).lerp(new THREE.Color(0xffffff), 0.25);
    const fl = new THREE.Color(B.fluid ? { lava: 0xff5010, water: 0x1a5a90, toxic: 0x7ac020, ice: 0xb0d8f0, crystal: 0x9040e0 }[B.fluid.kind] : 0);
    const R = SITE_R, step = (2 * R) / N, col = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -R + i * step, z = -R + j * step;
      const hh = S.height(x, z), hx = S.height(x + step, z);
      const shade = Math.max(0.35, Math.min(1.3, 0.85 + (hh - hx) * 0.15));
      if (B.fluid && hh < S.fluidLevel) col.copy(fl).multiplyScalar(0.8);
      else col.copy(lo).lerp(hi, Math.max(0, Math.min(1, (hh + 25) / 50))).multiplyScalar(shade);
      const k = (j * N + i) * 4;
      img.data[k] = col.r * 255; img.data[k + 1] = col.g * 255; img.data[k + 2] = col.b * 255; img.data[k + 3] = Math.hypot(x, z) > R - 40 ? 90 : 235;
    }
    ctx.putImageData(img, 0, 0);
    this.mapImg = c;
  }
  dungeonMap(D) {
    if (D.mapImg) return D.mapImg;
    const L = D.layout, c = document.createElement('canvas'); c.width = L.W; c.height = L.H;
    const ctx = c.getContext('2d'), img = ctx.createImageData(L.W, L.H);
    const g = new THREE.Color(D.glow);
    for (let i = 0; i < L.W * L.H; i++) { const f = L.grid[i]; img.data[i * 4] = f ? 40 + g.r * 60 : 6; img.data[i * 4 + 1] = f ? 46 + g.g * 60 : 8; img.data[i * 4 + 2] = f ? 70 + g.b * 60 : 16; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    D.mapImg = c;
    return c;
  }

  drawMap() {
    const M = this.mode, c = this.mapCtx, W = 472, cx = W / 2, cy = W / 2, Rr = W / 2 - 8;
    const V = M.vehicle.position, yaw = M.cam.yaw;
    const range = M.dungeon ? 110 : 280, k = Rr / range;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(cx, cy, Rr, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(4,8,20,0.85)'; c.fillRect(0, 0, W, W);
    // world -> map: rotate so camera-forward is up
    c.translate(cx, cy);
    c.rotate(yaw - Math.PI);
    c.scale(k, k);
    c.translate(-V.x, -V.z);
    c.imageSmoothingEnabled = true;
    if (M.dungeon) {
      const D = M.dungeon, L = D.layout;
      c.drawImage(this.dungeonMap(D), D.nav.o.x - L.W / 2 * CELL, D.nav.o.z - L.H / 2 * CELL, L.W * CELL, L.H * CELL);
    } else if (this.mapImg) {
      c.globalAlpha = 0.95; c.drawImage(this.mapImg, -SITE_R, -SITE_R, SITE_R * 2, SITE_R * 2); c.globalAlpha = 1;
    }
    const dot = (x, z, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, z, r / k, 0, Math.PI * 2); c.fill(); };
    const L = M.level;
    for (const n of L.nodes) if (n.alive) dot(n.pos.x, n.pos.z, 4.5, RESOURCES[n.res].color);
    for (const cr of L.crates) if (!cr.opened) { c.fillStyle = CRATE_COL[cr.tier]; c.fillRect(cr.pos.x - 3 / k, cr.pos.z - 3 / k, 6 / k, 6 / k); }
    for (const d of L.drops) if (d.type === 'item') dot(d.pos.x, d.pos.z, 4, RARITY[d.item.rarity].color);
    if (!M.dungeon) {
      for (const d of M.dungeons) { c.strokeStyle = '#c080ff'; c.lineWidth = 3 / k; c.beginPath(); c.arc(d.x, d.z, 9 / k, Math.PI, 0); c.stroke(); dot(d.x, d.z, 3, '#e0b0ff'); }
      for (const l of M.lairs) if (!l.cleared) { dot(l.x, l.z, 8, 'rgba(255,90,60,0.35)'); dot(l.x, l.z, 4, '#ff9a2e'); }
      if (M.curios) for (const q of M.curios.list) {
        if (q.scanned) { dot(q.x, q.z, 3, 'rgba(180,140,255,0.35)'); continue; }
        dot(q.x, q.z, 7, 'rgba(180,140,255,0.3)'); dot(q.x, q.z, 3.5, '#d8b8ff');
      }
      const lp = M.lander.position; c.strokeStyle = '#58c8ff'; c.lineWidth = 3 / k; c.beginPath(); c.arc(lp.x, lp.z, 10 / k, 0, Math.PI * 2); c.stroke(); dot(lp.x, lp.z, 4, '#58c8ff');
    } else for (const x of M.dungeon.exits) { c.strokeStyle = '#' + new THREE.Color(x.hex).getHexString(); c.lineWidth = 3 / k; c.beginPath(); c.arc(x.pos.x, x.pos.z, 9 / k, 0, Math.PI * 2); c.stroke(); }
    for (const e of M.creatures.list) {
      if (!e.alive || (e.under && e.mode !== 'hunt')) continue;
      dot(e.pos.x, e.pos.z, e.boss ? 7 : e.def.size >= 2 ? 4.5 : 3, e.boss ? '#ff9a2e' : e.elite ? '#ffd66a' : e.mode === 'hunt' ? '#ff4a6a' : 'rgba(255,110,130,0.6)');
    }
    for (const p of M.probes.list) if (p.alive) { c.fillStyle = '#7af0ff'; c.save(); c.translate(p.pos.x, p.pos.z); c.rotate(Math.PI / 4); c.fillRect(-3.5 / k, -3.5 / k, 7 / k, 7 / k); c.restore(); }
    c.restore();
    // rings + player arrow
    c.strokeStyle = 'rgba(88,184,255,0.18)'; c.lineWidth = 1;
    for (let i = 1; i <= 2; i++) { c.beginPath(); c.arc(cx, cy, Rr * i / 2, 0, Math.PI * 2); c.stroke(); }
    // off-map markers for the lander / dungeon exits
    const edge = (x, z, col, label) => {
      const dx = x - V.x, dz = z - V.z, d = Math.hypot(dx, dz);
      if (d * k < Rr - 10) return;
      const a = Math.atan2(dx, dz) - (yaw - Math.PI);
      const ex = cx - Math.sin(a) * (Rr - 12), ey = cy - Math.cos(a) * (Rr - 12);
      c.fillStyle = col; c.beginPath(); c.arc(ex, ey, 7, 0, Math.PI * 2); c.fill();
      c.font = '700 18px Rajdhani, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(label, ex, ey - 12);
    };
    if (!M.dungeon) { edge(M.lander.position.x, M.lander.position.z, '#58c8ff', `LANDER ${Math.round(Math.hypot(M.lander.position.x - V.x, M.lander.position.z - V.z))}m`); for (const l of M.lairs) if (!l.cleared) edge(l.x, l.z, '#ff9a2e', 'LAIR'); }
    c.save(); c.translate(cx, cy); c.rotate(-(M.vehicle.heading - yaw) + Math.PI);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -11); c.lineTo(7, 8); c.lineTo(-7, 8); c.closePath(); c.fill(); c.restore();
    this.el.pMapLabel.textContent = M.dungeon ? `${M.dungeon.entrance.name}` : `${M.siteInfo.name}`;
  }

  // ---------------- per frame ----------------
  setBar(el, f, text, ghost) {
    f = Math.max(0, Math.min(1, f));
    const w = (f * 100).toFixed(1) + '%';
    const i = el.querySelector('i'); if (i.style.width !== w) i.style.width = w;
    if (ghost) { const b = el.querySelector('b'); if (b && b.style.width !== w) b.style.width = w; }
    const sp = el.querySelector('span'); if (sp && text !== undefined && sp.textContent !== text) sp.textContent = text;
  }

  update(dt, realDt) {
    const M = this.mode, V = M.vehicle, st = V.stats, ex = M.ex, el = this.el, G = M.game;
    // hide the interface while autoplay runs (the captain's "hide interface during autoplay" option)
    const set = G.settings ? G.settings() : {};
    const hidden = !!G.hudHidden || (!!G.autoplay && !!set.hideHudInAuto && performance.now() > this.peekUntil);
    if (hidden !== this.hidden) {
      this.hidden = hidden;
      this.root.classList.toggle('hudHidden', hidden);
      document.body.classList.toggle('planet-hud-hidden', hidden);
      if (hidden && G.planet) G.planet.windows.closeAll();
    }
    this.setBar(el.pHull, V.hp / st.maxHp, `${fmt(V.hp)} / ${fmt(st.maxHp)}`, true);
    this.setBar(el.pShield, V.shield / st.maxShield, V.bubble > 0 ? 'BUBBLE' : fmt(V.shield));
    const xpN = explorerXpForLevel(ex.level);
    this.setBar(el.pXp, ex.xp / xpN, `${fmt(ex.xp)} / ${fmt(xpN)}`);
    this.setBar(el.pThreat, M.threat);
    el.pLvl.textContent = ex.level;
    if (el.pName.textContent !== st.chassis.fullName) { el.pName.textContent = st.chassis.fullName; el.pName.title = st.chassis.fullName; }
    el.pSub.textContent = `Rank ${M.data.level}`;   // commander rank (class and mark are in the name)
    el.pCred.textContent = fmt(M.data.credits) + ' ¢';
    const tot = cargoTotal(M.cargo);
    this.setBar(el.pCargoBar, tot / st.cargo, `${tot} / ${st.cargo}`);
    el.pCargoBar.classList.toggle('full', tot >= st.cargo);
    el.pStripTxt.textContent = `Lv ${ex.level} · Hull ${Math.round(V.hp / st.maxHp * 100)}% · Cargo ${tot}/${st.cargo} · ${M.dungeon ? M.dungeon.entrance.name : M.siteInfo.name}`;
    // abilities
    const now = M.engine.time;
    PLANET_ABILITIES.forEach((a, i) => {
      const e = this.abEls[i];
      e.classList.toggle('locked', ex.level < a.unlock);
      const rem = Math.max(0, (M.cooldowns[a.k] || 0) - now), cd = M.abilityCd(a);
      e.querySelector('.cd').style.setProperty('--p', (rem > 0 ? rem / cd * 100 : 0) + '%');
      const txt = rem > 0 ? rem.toFixed(rem < 3 ? 1 : 0) : '';
      const ct = e.querySelector('.cdt'); if (ct.textContent !== txt) ct.textContent = txt;
    });
    const ps = M.probes.stats;
    el.pProbeN.textContent = `${ps.count - M.probes.active()}`;
    // boss bar
    const b = this.boss;
    el.pBoss.style.display = b && b.alive ? 'block' : 'none';
    this.root.classList.toggle('bossfight', !!(b && b.alive));
    if (b && b.alive) {
      el.pBossName.textContent = (b.def.sizeClass === 'gargantuan' ? '☠ ' : '★ ') + b.name;
      this.setBar(el.pBossBar, b.hp / b.maxHp, `${fmt(b.hp)} / ${fmt(b.maxHp)}`);
      const wk = b.weak ? b.weak.filter((w) => w.alive).length : 0;
      el.pBossSub.textContent = `${b.def.sizeClass.toUpperCase()} ${b.def.familyName} · Lv ${b.level} · Phase ${b.phase}/${b.def.phases}${b.weak ? ` · Weak points ${wk}/${b.weak.length}` : ''}`;
    }
    // context prompt (keyboard hints only where there is a keyboard; the buttons say what they do)
    let prompt = '', ctx = '';
    const key = M.touch ? '' : '[R] ';
    if (M.state === 'extract') prompt = `Dropship inbound · ${Math.max(0, M.stateT).toFixed(1)}s — survive!`;
    else if (M.dungeon) { if (M.dungeon.exits.some((x) => x.pos.distanceTo(_p.copy(V.position).setY(0)) < 14)) { prompt = `${key}Leave the dungeon`; ctx = 'Exit dungeon'; } }
    else if (M.nearMouth) { prompt = `${key}Enter ${M.nearMouth.name} — ${M.nearMouth.depth > 2 ? 'deep' : 'shallow'} ${M.nearMouth.theme}`; ctx = 'Enter dungeon'; }
    else if (M.atLander) prompt = `${key}Launch to orbit · cargo banked, hull repairing`;   // the orbit button already says Launch
    const sc = !M.dungeon && M.curios && M.curios.active;
    if (sc) prompt = `Scanning ${sc.def.name} · ${Math.round(sc.progress * 100)}%`;
    if (M.mining && M.mineNode) prompt = `Mining ${RESOURCES[M.mineNode.res].name} · ${M.mineNode.amount} left`;
    if (el.pPrompt.textContent !== prompt) el.pPrompt.textContent = prompt;
    el.pPrompt.style.display = prompt ? '' : 'none';
    el.pCtx.style.display = ctx ? '' : 'none';
    if (ctx && el.pCtx.textContent !== ctx) el.pCtx.textContent = ctx;
    el.pOrbit.textContent = M.atLander ? 'Launch to orbit' : 'Call extraction';
    el.pOrbit.style.display = M.dungeon ? 'none' : '';
    // slower panels
    this.slow -= realDt;
    if (this.slow <= 0) {
      this.slow = 0.25;
      el.pCargoN.textContent = '';
      el.pCargoRes.innerHTML = RES_KEYS.filter((k) => M.cargo[k]).map((k) => `<span style="color:${RESOURCES[k].color}">${RESOURCES[k].short} ${M.cargo[k]}</span>`).join('') || '<span class="label">empty</span>';
      el.pBank.innerHTML = RES_KEYS.map((k) => `<span style="color:${RESOURCES[k].color}" title="${RESOURCES[k].name}">${RESOURCES[k].short} ${fmt(M.data.resources[k] || 0)}</span>`).join('');
      el.pGuns.innerHTML = st.guns.map((g) => `<div class="grow"><span style="color:${RARITY[g.item.rarity].color}">${g.item.name}</span><span class="label">${EX_BASES[g.item.base].name}</span></div>`).join('')
        + st.tools.map((t) => `<div class="grow tool"><span style="color:${RARITY[t.item.rarity].color}">${t.item.name}</span><span class="label">${t.ts.power.toFixed(1)}/s</span></div>`).join('');
      el.pProbes.innerHTML = `<div class="label" style="margin-top:6px">Probes ${M.probes.active()}/${ps.count} · cap ${ps.cap}${ps.uplink ? ' · uplink' : ''}</div>` + M.probes.list.map((p) => `<div class="probe-row"><span>${p.state.toUpperCase()}</span><div class="bar"><i style="width:${(p.n / ps.cap * 100).toFixed(0)}%"></i></div><div class="bar hull mini"><i style="width:${(p.hp / p.maxHp * 100).toFixed(0)}%"></i></div></div>`).join('');
      el.pObj.innerHTML = this.objectives();
      this.drawMap();
    }
    this.drawOverlay(realDt);
  }

  objectives() {
    const M = this.mode, out = [];
    const tot = cargoTotal(M.cargo), cap = M.vehicle.stats.cargo;
    if (M.dungeon) {
      const D = M.dungeon, alive = M.creatures.list.filter((e) => e.alive).length;
      out.push(D.cleared ? '✓ Apex slain — take the golden portal out' : `◈ Slay the apex: ${D.boss ? D.boss.name : '???'}`);
      out.push(`◈ Hostiles remaining: ${alive}`);
    } else {
      out.push(tot >= cap ? '◈ Cargo full — return to the lander to bank it' : `◈ Mine deposits · cargo ${tot}/${cap}`);
      for (const l of M.lairs) out.push(l.cleared ? `✓ Apex slain: ${l.boss.name}` : `◈ Hunt the apex: ${l.boss.name} (${l.boss.sizeClass})`);
      const nd = M.dungeons.filter((d) => !(d.dungeon && d.dungeon.cleared)).length;
      if (M.curios) out.push(M.curios.done >= M.curios.total ? '✓ Every curiosity on site scanned' : `◈ Scan curiosities · ${M.curios.done}/${M.curios.total} <span class="label">(drive up to the violet beacons)</span>`);
      if (nd) out.push(`◈ ${nd} dungeon${nd > 1 ? 's' : ''} detected: ${M.dungeons.map((d) => d.name).join(', ')}`);
      out.push(`<span class="label">${M.siteInfo.features.map(featureName).join(' · ')}</span>`);
    }
    return out.map((s) => `<div>${s}</div>`).join('');
  }

  drawOverlay(realDt) {
    const ctx = this.ctx, M = this.mode, cam = M.cam;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (this.hidden) return;
    const camera = cam.camera;
    const proj = (v) => { _p.copy(v).project(camera); return _p.z < 1 ? { x: (_p.x * 0.5 + 0.5) * innerWidth, y: (-_p.y * 0.5 + 0.5) * innerHeight } : null; };
    const pxPerUnit = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360) * cam.distance);
    ctx.textAlign = 'center';
    // creature health bars + names
    for (const e of M.creatures.list) {
      if (!e.alive || e.under) continue;
      const recent = M.engine.time - e.lastHit < 5;
      const show = recent || e.elite || e.def.size >= 2 || e === M.aimEnemy;
      if (!show || e === this.boss) continue;
      _q.copy(e.pos); _q.y += e.def.float ? e.radius + 1 : e.height + 0.8;
      const sp = proj(_q); if (!sp) continue;
      if (sp.x < -50 || sp.x > innerWidth + 50 || sp.y < -50 || sp.y > innerHeight + 50) continue;
      const bw = Math.min(90, Math.max(34, e.radius * 2 * pxPerUnit));
      ctx.fillStyle = 'rgba(5,10,24,0.75)'; ctx.fillRect(sp.x - bw / 2 - 1, sp.y - 1, bw + 2, 6);
      ctx.fillStyle = e.shielded > 0 ? '#58b8ff' : e.elite ? '#ffd66a' : '#ff6a50'; ctx.fillRect(sp.x - bw / 2, sp.y, bw * Math.max(0, e.hp / e.maxHp), 4);
      if (e.elite || e.def.size >= 2 || e === M.aimEnemy) {
        ctx.font = '600 11px Rajdhani, sans-serif';
        ctx.fillStyle = e.elite ? '#ffd66a' : e.def.size >= 3 ? '#ffb070' : 'rgba(255,180,190,0.9)';
        ctx.fillText(`${e.name} · ${e.level}`, sp.x, sp.y - 5);
      }
    }
    // node label under the cursor
    const n = M.level.nearestNode(M.aimPoint, 6);
    if (n) {
      _q.copy(n.pos); _q.y += 4;
      const sp = proj(_q);
      if (sp) { ctx.font = '600 12px Rajdhani, sans-serif'; const t = `${RESOURCES[n.res].name} · ${n.amount}`; const w = ctx.measureText(t).width + 10; ctx.fillStyle = 'rgba(4,8,20,0.7)'; ctx.fillRect(sp.x - w / 2, sp.y - 14, w, 16); ctx.fillStyle = RESOURCES[n.res].color; ctx.fillText(t, sp.x, sp.y - 2); }
    }
    // loot labels
    ctx.font = '600 12px Rajdhani, sans-serif';
    for (const d of M.level.drops) {
      if (d.type !== 'item') continue;
      const sp = proj(d.pos); if (!sp) continue;
      const r = RARITY[d.item.rarity];
      const w = ctx.measureText(d.item.name).width + 10;
      ctx.fillStyle = 'rgba(4,8,20,0.7)'; ctx.fillRect(sp.x - w / 2, sp.y - 30, w, 15);
      ctx.fillStyle = r.color; ctx.fillText(d.item.name, sp.x, sp.y - 19);
    }
    // probes: haul pips
    for (const p of M.probes.list) {
      const sp = proj(p.pos); if (!sp) continue;
      const f = p.n / M.probes.stats.cap;
      ctx.strokeStyle = '#7af0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sp.x, sp.y - 14, 6, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
    }
    // edge arrow toward the lander when off screen
    if (!M.dungeon && M.state === 'play') {
      const sp = proj(_q.copy(M.lander.position).setY(M.lander.position.y + 6));
      if (sp && (sp.x < 0 || sp.x > innerWidth || sp.y < 0 || sp.y > innerHeight)) {
        const cx = innerWidth / 2, cy = innerHeight / 2, a = Math.atan2(sp.y - cy, sp.x - cx);
        const ex = cx + Math.cos(a) * (Math.min(cx, cy) - 70), ey = cy + Math.sin(a) * (Math.min(cx, cy) - 70);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.fillStyle = 'rgba(88,200,255,0.85)'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.font = '600 11px Orbitron, sans-serif'; ctx.fillStyle = '#9fdcff'; ctx.fillText('LANDER', ex, ey - 14);
      }
    }
    // damage numbers
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const d = this.numbers[i];
      d.t += realDt;
      if (d.t > 1.1) { this.numbers.splice(i, 1); continue; }
      const sp = proj(d.pos); if (!sp) continue;
      const a = d.t < 0.8 ? 1 : 1 - (d.t - 0.8) / 0.3;
      const scale = d.crit || d.kind === 'weak' ? 1.6 - Math.min(0.5, d.t * 2) : 1;
      ctx.font = `${d.crit ? 800 : 700} ${Math.round(14 * scale)}px Orbitron, Rajdhani, sans-serif`;
      ctx.fillStyle = d.kind === 'player' ? `rgba(255,90,90,${a})` : d.kind === 'pshield' ? `rgba(120,200,255,${a})` : d.kind === 'weak' ? `rgba(255,150,60,${a})` : d.kind === 'shield' ? `rgba(120,200,255,${a})` : d.crit ? `rgba(255,220,90,${a})` : `rgba(255,255,255,${a})`;
      ctx.strokeStyle = `rgba(0,0,0,${a * 0.8})`; ctx.lineWidth = 3;
      const y = sp.y - 16 - d.t * 40, x = sp.x + d.dx * d.t;
      if (d.kind === 'text') { ctx.font = '800 17px Orbitron, Rajdhani, sans-serif'; ctx.globalAlpha = a; ctx.fillStyle = d.color; ctx.strokeText(d.text, x, y); ctx.fillText(d.text, x, y); ctx.globalAlpha = 1; continue; }
      const txt = d.kind === 'weak' ? `${d.v} WEAK` : d.crit ? d.v + '!' : (d.kind === 'player' || d.kind === 'pshield' ? '-' : '') + d.v;
      ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
    }
  }
}
