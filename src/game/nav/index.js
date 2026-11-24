// Navigation: the galaxy map (jump between systems along lanes), the system map
// (in-system warp), and the jump/warp drive with its spool-up, streaks and flash.
import * as THREE from 'three/webgpu';
import { galaxy, systemDetail, ARM_NAMES } from '../galaxy.js';
import { save } from '../Player.js';

const fmt = (n) => (n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString());
const STAR_HEX = { yellow: '#ffd890', orange: '#ffa060', red: '#ff5a40', white: '#e8f0ff', blue: '#80b0ff', violet: '#c080ff' };
const _v = new THREE.Vector3(), _fwd = new THREE.Vector3(), _side = new THREE.Vector3();

export function unlockedDanger(P) { return P.level + 6; }

// shortest lane route through systems the captain may enter
export function route(fromId, toId, P) {
  const S = galaxy().systems, max = unlockedDanger(P);
  const prev = new Map([[fromId, -1]]);
  const q = [fromId];
  while (q.length) {
    const c = q.shift();
    if (c === toId) break;
    for (const n of S[c].links) if (!prev.has(n) && S[n].danger <= max) { prev.set(n, c); q.push(n); }
  }
  if (!prev.has(toId)) return null;
  const path = [];
  for (let c = toId; c !== -1; c = prev.get(c)) path.unshift(c);
  return path;
}
export function jumpCost(path, P) {
  const slip = P.talents && P.talents.slipstream;
  return slip ? 0 : Math.max(0, (path.length - 1) * (40 + P.level * 6));
}

export function installNav(game) {
  let selected = null;
  let warp = null;            // {kind:'jump'|'local', phase, t, ...}
  const fade = document.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle,#fff,#9fd8ff 40%,#3a2a90);opacity:0;pointer-events:none;z-index:9;transition:opacity 0.35s';
  document.body.append(fade);

  game.start = ((start) => (fresh) => {
    start(fresh);
    const ui = game.ui;
    ui.windows.galaxy = ui.addWindow('galaxy', 'Galaxy · Velscour Reach');
    ui.windows.system = ui.addWindow('system', 'System');
    ui.renderers.galaxy = renderGalaxy;
    ui.renderers.system = renderSystem;
  })(game.start.bind(game));

  game.modes.systemMap = () => game.ui.toggle('system');
  const cmd = game.command.bind(game);
  game.command = (name) => (name === 'systemMap' ? game.ui.toggle('system') : cmd(name));
  // N opens the system map
  game.engine.add({ update() { if (game.input.hit('systemMap') && game.ui) game.ui.toggle('system'); } });

  const inCombat = () => game.world.ships.some((o) => o.alive && game.world.hostile(game.player, o) && o.position.distanceTo(game.player.position) < 900);

  game.jumpTo = (id) => {
    const P = game.data;
    if (warp) return false;
    if (id === P.system) return false;
    const path = route(P.system, id, P);
    if (!path) { game.ui.toast('No charted route (rank too low for the systems between)', 'warn'); return false; }
    const cost = jumpCost(path, P);
    if (P.credits < cost) { game.ui.toast(`Jump fuel costs ${cost} ¢`, 'warn'); return false; }
    if (inCombat()) { game.ui.toast('Cannot spool the jump drive in combat', 'bad'); return false; }
    if (game.docked) game.undock();
    P.credits -= cost;
    warp = { kind: 'jump', phase: 'spool', t: 0, target: id, hops: path.length - 1 };
    if (game.audio) game.audio.play('jump', null);
    game.ui.toggle('galaxy', false);
    game.ui.toast(`Jump drive spooling · ${galaxy().systems[id].name}`, 'epic');
    return true;
  };
  game.warpTo = (pos) => {
    if (warp || !game.player) return false;
    if (inCombat()) { game.ui.toast('Cannot warp in combat', 'bad'); return false; }
    if (game.docked) game.undock();
    const s = game.player;
    const d = _v.copy(pos).sub(s.position).setY(0);
    if (d.length() < 600) { game.moveTarget = pos.clone(); return true; }
    warp = { kind: 'local', phase: 'spool', t: 0, to: pos.clone().setY(0), from: s.position.clone() };
    if (game.audio) game.audio.play('jump', null, 0.6);
    game.ui.toggle('system', false);
    return true;
  };
  game.isWarping = () => !!warp;
  game.warpState = () => warp;   // debug/tools
  game.cancelWarp = () => { if (!warp) return; warp = null; fade.style.opacity = '0'; game.engine.camera.fov = 32; game.engine.camera.updateProjectionMatrix(); };

  // drive state machine
  game.engine.add({
    update(dt, t, realDt) {
      if (!warp || !game.player || game.mode !== 'space') return;
      const s = game.player, W = game.world, fx = W.fx;
      const slip = game.data.talents && game.data.talents.slipstream ? 2 : 1;
      warp.t += realDt * slip;
      const fwd = _fwd.set(Math.sin(s.heading), 0, Math.cos(s.heading));
      if (warp.phase === 'spool') {
        // turn toward the destination, charge the drive
        if (warp.kind === 'local') { s.steerHeading(Math.atan2(warp.to.x - s.position.x, warp.to.z - s.position.z), 0.2); game.moveTarget = null; }
        else s.throttle = 0.25;
        for (const e of s.engines) {
          const p = e.pos.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, s.heading).add(s.position);
          fx.trailPuff(p, 0x9fd8ff, e.r * 3 * Math.min(1, warp.t), 0.3);
        }
        if (Math.random() < realDt * 12) fx.ring(s.position, s.dims.L * (0.4 + warp.t * 0.3), 0x7ad8ff, 24);
        if (warp.t > 2) { warp.phase = 'go'; warp.t = 0; game.engine.flash(0.25, 0xbfe8ff); game.cam.addShake(4); }
      } else if (warp.phase === 'go') {
        // streaks race past
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 400;
          const side = _side.set(Math.cos(a) * r, Math.sin(a) * r * 0.4, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, s.heading);
          const p = s.position.clone().add(side).addScaledVector(fwd, 500);
          fx.spark.emit(p.x, p.y, p.z, -fwd.x * 2600, 0, -fwd.z * 2600, 0.35, 1.2, 1.6, 2.6, 1, 3, 1, 0, 0);
        }
        game.engine.camera.fov = 32 + Math.min(1, warp.t * 2) * 26;
        game.engine.camera.updateProjectionMatrix();
        if (warp.kind === 'local') {
          const k = Math.min(1, warp.t / 1.6);
          const e = k * k * (3 - 2 * k);
          s.position.lerpVectors(warp.from, warp.to, e);
          s.heading = Math.atan2(warp.to.x - warp.from.x, warp.to.z - warp.from.z);
          s.velocity.copy(fwd).multiplyScalar(s.maxSpeed);
          if (k >= 1) arrive();
        } else {
          s.position.addScaledVector(fwd, 3000 * realDt);
          if (warp.t > 0.8) fade.style.opacity = '1';
          if (warp.t > 1.3) {
            const id = warp.target;
            game.enterSystem(id);
            if (!game.data.visited.includes(id)) game.data.visited.push(id);
            save(game.data);
            arrive();
          }
        }
      }
    },
  });
  function arrive() {
    const s = game.player;
    fade.style.opacity = '0';
    game.engine.camera.fov = 32; game.engine.camera.updateProjectionMatrix();
    game.engine.flash(0.3, 0x9fd8ff);
    if (s) { game.world.fx.column(s.position, 0x9fd8ff, 220, 80); game.world.fx.ring(s.position, s.dims.L * 1.5, 0x9fd8ff, 80); s.throttle = 0.25; s.speed = s.maxSpeed * 0.4; }
    warp = null;
  }

  // ---------------- galaxy map ----------------
  let gCanvas = null, hover = null;
  function renderGalaxy() {
    const W = game.ui.windows.galaxy, body = W.querySelector('.wbody');
    if (!gCanvas) {
      const LEG = [['pirate', 'Corsair Pirates', '#ff6a5a'], ['rival', 'Rival Companies', '#ffb040'], ['rustborn', 'Rustborn', '#d89050'], ['covenant', 'Hollow Star Covenant', '#ff3b8a'], ['brood', 'Leviathan Brood', '#40ffd0'], ['silent', 'Silent Choir', '#bff0ff']];
      body.innerHTML = `<div class="gwrap"><canvas class="gmap"></canvas><div class="ginfo holo" id="gInfo"></div><div class="glegend holo"><div class="label">Held by</div>${LEG.map(([, n, col]) => `<span><i style="border-color:${col}"></i>${n}</span>`).join('')}</div></div>`;
      gCanvas = body.querySelector('canvas');
      gCanvas.addEventListener('mousemove', (e) => { hover = pick(e); drawGalaxy(); });
      gCanvas.addEventListener('click', (e) => { const p = pick(e); if (p) { selected = p.id; drawGalaxy(); info(); } });
      gCanvas.addEventListener('dblclick', (e) => { const p = pick(e); if (p) game.jumpTo(p.id); });
    }
    selected ??= game.data.system;
    loop();
    info();
  }
  function loop() { if (!game.ui.isOpen('galaxy')) return; drawGalaxy(); requestAnimationFrame(loop); }
  function layout() {
    const r = gCanvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 2);
    if (gCanvas.width !== Math.round(r.width * dpr)) { gCanvas.width = Math.round(r.width * dpr); gCanvas.height = Math.round(r.height * dpr); }
    const S = Math.min(r.width, r.height) / 1900;
    return { w: r.width, h: r.height, dpr, S, cx: r.width / 2, cy: r.height / 2 };
  }
  function pick(e) {
    const L = layout(), rect = gCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bd = 18 * 18;
    for (const s of galaxy().systems) { const x = L.cx + s.x * L.S, y = L.cy + s.y * L.S; const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function drawGalaxy() {
    const c = gCanvas.getContext('2d'), L = layout(), P = game.data, S = galaxy().systems, t = performance.now() / 1000;
    c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    c.clearRect(0, 0, L.w, L.h);
    // galactic glow
    const g = c.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, 1000 * L.S);
    g.addColorStop(0, 'rgba(255,220,180,0.35)'); g.addColorStop(0.15, 'rgba(160,110,255,0.18)'); g.addColorStop(0.6, 'rgba(40,80,200,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, L.w, L.h);
    // arm dust
    if (!drawGalaxy.dust) { drawGalaxy.dust = []; for (let i = 0; i < 2600; i++) { const arm = i % 3, tt = Math.random(); const r = 80 + tt * 900, a = arm * 2.094 + (1 - tt) * 4.2 + (Math.random() - 0.5) * 0.6; drawGalaxy.dust.push([Math.cos(a) * r + (Math.random() - 0.5) * 60, Math.sin(a) * r + (Math.random() - 0.5) * 60, Math.random()]); } }
    for (const [x, y, k] of drawGalaxy.dust) { c.fillStyle = `rgba(${150 + k * 100},${150 + k * 60},255,${0.08 + k * 0.12})`; c.fillRect(L.cx + x * L.S, L.cy + y * L.S, 1.5, 1.5); }
    const max = unlockedDanger(P);
    const rt = selected != null && selected !== P.system ? route(P.system, selected, P) : null;
    // territory: a soft wash of the holding power's colour under each system, then the arm names
    const FCT = { pirate: '255,106,90', rival: '255,176,64', rustborn: '216,144,80', covenant: '255,59,138', brood: '64,255,208', silent: '191,240,255' };
    for (const s of S) {
      const x = L.cx + s.x * L.S, y = L.cy + s.y * L.S, rr = 70 * L.S + 14;
      const gg = c.createRadialGradient(x, y, 0, x, y, rr);
      gg.addColorStop(0, `rgba(${FCT[s.control] || '150,150,150'},0.10)`); gg.addColorStop(1, `rgba(${FCT[s.control] || '150,150,150'},0)`);
      c.fillStyle = gg; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    c.save(); c.font = `600 ${Math.max(11, Math.round(15 * L.S * 2.2))}px Rajdhani, sans-serif`; c.textAlign = 'center';
    for (let arm = 0; arm < 3; arm++) {
      const tt = 0.86, r = 120 + tt * 820 + 70, a = arm * (Math.PI * 2 / 3) + tt * 4.2;
      c.fillStyle = 'rgba(190,200,255,0.22)'; c.fillText(ARM_NAMES[arm].toUpperCase(), L.cx + Math.cos(a) * r * L.S, L.cy + Math.sin(a) * r * L.S);
    }
    c.restore();
    // lanes
    c.lineWidth = 1;
    for (const s of S) for (const l of s.links) if (l > s.id) {
      const o = S[l];
      const open = s.danger <= max && o.danger <= max;
      c.strokeStyle = open ? 'rgba(88,184,255,0.28)' : 'rgba(120,100,160,0.12)';
      c.beginPath(); c.moveTo(L.cx + s.x * L.S, L.cy + s.y * L.S); c.lineTo(L.cx + o.x * L.S, L.cy + o.y * L.S); c.stroke();
    }
    if (rt) {
      c.strokeStyle = '#4ade80'; c.lineWidth = 2.5; c.shadowColor = '#4ade80'; c.shadowBlur = 10; c.setLineDash([6, 4]); c.lineDashOffset = -t * 20;
      c.beginPath(); rt.forEach((id, i) => { const s = S[id]; i ? c.lineTo(L.cx + s.x * L.S, L.cy + s.y * L.S) : c.moveTo(L.cx + s.x * L.S, L.cy + s.y * L.S); }); c.stroke();
      c.setLineDash([]); c.shadowBlur = 0;
    }
    // systems
    c.textAlign = 'center';
    for (const s of S) {
      const x = L.cx + s.x * L.S, y = L.cy + s.y * L.S;
      const star = systemDetail(s).star;
      const locked = s.danger > max;
      const r = 2.5 + Math.min(4, s.danger / 14);
      c.globalAlpha = locked ? 0.35 : 1;
      c.fillStyle = STAR_HEX[star.k]; c.shadowColor = STAR_HEX[star.k]; c.shadowBlur = 12;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
      const FCG = { pirate: '#ff6a5a', rival: '#ffb040', rustborn: '#d89050', covenant: '#ff3b8a', brood: '#40ffd0', silent: '#bff0ff' };
      c.strokeStyle = FCG[s.control] || '#888'; c.globalAlpha = locked ? 0.25 : 0.55; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 4, 0, Math.PI * 2); c.stroke(); c.globalAlpha = locked ? 0.35 : 1;
      if (P.visited.includes(s.id)) { c.strokeStyle = 'rgba(200,220,255,0.5)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r + 7, 0, Math.PI * 2); c.stroke(); }
      if (s.id === P.system) { c.strokeStyle = '#58c8ff'; c.lineWidth = 2; const pr = r + 6 + Math.sin(t * 3) * 2; c.beginPath(); c.arc(x, y, pr, 0, Math.PI * 2); c.stroke(); }
      if (s.id === selected) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(x - r - 7, y - r - 7, (r + 7) * 2, (r + 7) * 2); }
      const near = S[P.system].links.includes(s.id) || (selected != null && S[selected].links.includes(s.id));
      if (s === hover || s.id === selected || s.id === P.system || near || (P.visited.includes(s.id) && L.w > 900)) {
        c.font = `${s === hover || s.id === selected ? 600 : 500} 11px Rajdhani, sans-serif`;
        c.fillStyle = locked ? '#6a7a9a' : s.danger > P.level + 3 ? '#ffb040' : '#b8c6e0';
        c.fillText(s.name + (locked ? ' 🔒' : ''), x, y - r - 6);
      }
      c.globalAlpha = 1;
    }
  }
  function info() {
    const el = document.getElementById('gInfo'); if (!el) return;
    const P = game.data, s = galaxy().systems[selected];
    const d = systemDetail(s);
    const rt = s.id !== P.system ? route(P.system, s.id, P) : null;
    const locked = s.danger > unlockedDanger(P);
    el.innerHTML = `<div class="title" style="color:${STAR_HEX[d.star.k]}">${s.name}</div>
      <div class="label" style="margin:4px 0 8px">${d.star.k} star · danger ${s.danger} · ${ARM_NAMES[s.arm] || ''}</div>
      <div class="label" style="margin-bottom:8px">Held by: <span style="color:var(--white)">${({ pirate: 'Corsair Pirates', rival: 'Rival Companies', rustborn: 'Rustborn Scavengers', covenant: 'Hollow Star Covenant', brood: 'Leviathan Brood', silent: 'The Silent Choir' })[s.control]}</span></div>
      <div class="statgrid"><span>Planets</span><b>${d.planets.length}</b><span>Moons</span><b>${d.planets.reduce((a, p) => a + p.moons.length, 0)}</b><span>Stations</span><b>${d.stations.length}</b><span>Belts</span><b>${d.belts.length}</b><span>Visited</span><b>${P.visited.includes(s.id) ? 'yes' : 'no'}</b>
      ${rt ? `<span>Jumps</span><b>${rt.length - 1}</b><span>Fuel</span><b>${fmt(jumpCost(rt, P))} ¢</b>` : ''}</div>
      <div style="margin-top:10px">${s.id === P.system ? '<div class="label">You are here</div>' : locked ? `<div class="label" style="color:var(--warn)">Requires commander rank ${s.danger - 6}</div>` : rt ? '<button class="btn" id="gJump">Engage jump drive</button>' : '<div class="label">No charted route</div>'}</div>
      <div class="label" style="margin-top:12px">Double-click a system to jump · rings show who holds each system · higher danger, better loot</div>`;
    const b = document.getElementById('gJump'); if (b) b.onclick = () => game.jumpTo(s.id);
  }

  // ---------------- system map ----------------
  let sCanvas = null;
  function renderSystem() {
    const W = game.ui.windows.system, body = W.querySelector('.wbody');
    W.querySelector('.wtitle span').textContent = `${game.sector.sys.name} · danger ${game.sector.sys.danger}`;
    if (!sCanvas) {
      const LEG = [['⚔', 'patrol'], ['⛫', 'raider base'], ['◌', 'mining belt'], ['✕', 'wreck field'], ['⚑', 'contested'], ['☠', 'boss lair'], ['◆', 'derelict'], ['✚', 'distress'], ['✺', 'anomaly'], ['?', 'signal']];
      body.innerHTML = `<canvas class="smap"></canvas><div class="slegend"><span class="label">Click to warp</span>${LEG.map(([g, n]) => `<span><b>${g}</b>${n}</span>`).join('')}</div>`;
      sCanvas = body.querySelector('canvas');
      sCanvas.addEventListener('click', (e) => {
        const L = sLayout(), r = sCanvas.getBoundingClientRect();
        const x = (e.clientX - r.left - L.cx) / L.S, z = (e.clientY - r.top - L.cy) / L.S;
        game.warpTo(new THREE.Vector3(x, 0, z));
      });
    }
    sLoop();
  }
  function sLoop() { if (!game.ui.isOpen('system')) return; drawSystem(); requestAnimationFrame(sLoop); }
  function sLayout() {
    const r = sCanvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
    if (sCanvas.width !== Math.round(r.width * dpr)) { sCanvas.width = Math.round(r.width * dpr); sCanvas.height = Math.round(r.height * dpr); }
    const D = game.sector.detail;
    const ext = Math.max(...D.planets.map((p) => p.orbit + p.radius * 3)) * 1.05;
    return { w: r.width, h: r.height, dpr, S: Math.min(r.width, r.height) / 2 / ext, cx: r.width / 2, cy: r.height / 2 };
  }
  function drawSystem() {
    const c = sCanvas.getContext('2d'), L = sLayout(), D = game.sector.detail, t = performance.now() / 1000;
    c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); c.clearRect(0, 0, L.w, L.h);
    const X = (x) => L.cx + x * L.S, Y = (z) => L.cy + z * L.S;
    const sc = STAR_HEX[D.star.k];
    const g = c.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, 40); g.addColorStop(0, sc); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(L.cx, L.cy, 40, 0, Math.PI * 2); c.fill();
    for (const b of D.belts) { c.strokeStyle = 'rgba(160,150,140,0.25)'; c.setLineDash([2, 4]); c.lineWidth = Math.max(2, b.width * L.S); c.beginPath(); c.arc(L.cx, L.cy, (b.r0 + b.width / 2) * L.S, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
    c.textAlign = 'center'; c.font = '500 11px Rajdhani, sans-serif';
    const placed = [];
    const mkz = game.sector.director ? game.sector.director.markers() : { zones: D.zones, pois: [] };
    for (const z of mkz.zones) placed.push({ x: X(z.x), y: Y(z.z) + 4, w: 26 });   // keep labels off the zone glyphs
    for (const p of mkz.pois) if (!p.done) placed.push({ x: X(p.x), y: Y(p.z) + 4, w: 16 });
    const hit = (x, y, w) => placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - y) < 13);
    const label = (txt, x, y, color, alt) => {
      const w = c.measureText(txt).width + 6;
      let px = x, py = y;
      if (hit(px, py, w) && alt) { py = alt; if (hit(px, py, w)) { px = x + w / 2 + 10; py = (y + alt) / 2; } }
      if (hit(px, py, w)) return;
      placed.push({ x: px, y: py, w }); c.fillStyle = color; c.fillText(txt, px, py);
    };
    for (const st of game.stations) label(st.name, X(st.position.x), Y(st.position.z) + 18, '#9ff0e0');
    for (const pl of game.sector.planets) {
      const info = pl.userData.info;
      if (!info.moon) { c.strokeStyle = 'rgba(88,184,255,0.12)'; c.lineWidth = 1; c.beginPath(); c.arc(L.cx, L.cy, Math.hypot(pl.position.x, pl.position.z) * L.S, 0, Math.PI * 2); c.stroke(); }
      const r = Math.max(info.moon ? 2 : 4, info.radius * L.S);
      c.fillStyle = info.moon ? '#8890a8' : '#a8b8e0';
      c.beginPath(); c.arc(X(pl.position.x), Y(pl.position.z), r, 0, Math.PI * 2); c.fill();
      if (!info.moon) label(info.name, X(pl.position.x), Y(pl.position.z) - r - 4, '#b8c6e0', Y(pl.position.z) + r + 12);
      if (game.data.scanned && game.data.scanned[info.name]) { c.strokeStyle = '#4ade80'; c.beginPath(); c.arc(X(pl.position.x), Y(pl.position.z), r + 3, 0, Math.PI * 2); c.stroke(); }
    }
    const FC = { pirate: '#ff6a5a', rival: '#ffb040', rustborn: '#d89050', covenant: '#ff3b8a', brood: '#40ffd0', silent: '#bff0ff' };
    const ICON = { patrol: '⚔', base: '⛫', belt: '◌', wrecks: '✕', front: '⚑', lair: '☠' };
    const mk = mkz;
    c.font = '600 13px Rajdhani, sans-serif';
    for (const z of mk.zones) {
      const x = X(z.x), y = Y(z.z);
      c.globalAlpha = z.cooling ? 0.35 : 1;
      c.strokeStyle = FC[z.faction] || '#ff7a6a'; c.lineWidth = z.active ? 2.5 : 1.2;
      c.beginPath(); c.arc(x, y, z.active ? 11 + Math.sin(t * 5) * 2 : 9, 0, Math.PI * 2); c.stroke();
      c.fillStyle = FC[z.faction] || '#ff7a6a'; c.fillText(ICON[z.type] || '⚔', x, y + 4);
      c.globalAlpha = 1;
    }
    for (const p of mk.pois) {
      if (p.done) continue;
      const x = X(p.x), y = Y(p.z);
      c.fillStyle = p.revealed ? '#ffd66a' : 'rgba(180,200,255,0.5)';
      c.fillText(p.revealed ? ({ derelict: '◆', distress: '✚', anomaly: '✺' }[p.type]) : '?', x, y + 4);
    }
    if (game.raidMarker) { const x = X(game.raidMarker.x), y = Y(game.raidMarker.z); c.strokeStyle = '#ff9a2e'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 16 + Math.sin(t * 6) * 3, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#ff9a2e'; c.fillText('☠ ARMADA', x, y - 22); }
    c.font = '500 11px Rajdhani, sans-serif';
    for (const st of game.stations) { const x = X(st.position.x), y = Y(st.position.z); c.fillStyle = '#58ffd8'; c.shadowColor = '#58ffd8'; c.shadowBlur = 8; c.fillRect(x - 5, y - 5, 10, 10); c.shadowBlur = 0; }
    for (const o of game.world.ships) { if (!o.alive || o === game.player) continue; c.fillStyle = o.team === 1 ? '#58c8ff' : '#ff4a6a'; c.fillRect(X(o.position.x) - 1.5, Y(o.position.z) - 1.5, 3, 3); }
    const s = game.player;
    if (s) { c.save(); c.translate(X(s.position.x), Y(s.position.z)); c.rotate(-s.heading + Math.PI); c.fillStyle = '#fff'; c.shadowColor = '#58c8ff'; c.shadowBlur = 10; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(-6, 7); c.closePath(); c.fill(); c.restore(); }
  }
}
