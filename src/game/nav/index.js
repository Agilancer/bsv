// Navigation: the galaxy map (jump between systems along lanes), the system map
// (in-system warp), and the jump/warp drive with its spool-up, streaks and flash.
import * as THREE from 'three/webgpu';
import { galaxy, systemDetail, ARM_NAMES } from '../galaxy.js';
import { save } from '../Player.js';
import { TwoFinger } from '../../engine/gestures.js';

const fmt = (n) => (n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString());
const STAR_HEX = { yellow: '#ffd890', orange: '#ffa060', red: '#ff5a40', white: '#e8f0ff', blue: '#80b0ff', violet: '#c080ff' };
const _v = new THREE.Vector3(), _fwd = new THREE.Vector3(), _side = new THREE.Vector3();

export const __views = { g: { k: 1, ox: 0, oy: 0, moved: false }, s: { k: 1, ox: 0, oy: 0, moved: false } };   // map pan / zoom (read by tools)

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
  // The autopilot's use of the drive: sparingly. Short and middling legs are sailed (at cruise); the drive is for
  // real distances, and never back to back. False = sail there instead.
  const AUTO_WARP_MIN = 7500, AUTO_WARP_GAP = 100;   // world units; seconds of space time between the autopilot's warps
  let autoWarpAt = -1e9;
  game.autoWarp = (pos) => {
    const s = game.player; if (!s || warp) return false;
    const now = game.engine.time, d = Math.hypot(pos.x - s.position.x, pos.z - s.position.z);
    if (d < AUTO_WARP_MIN || (now >= autoWarpAt && now - autoWarpAt < AUTO_WARP_GAP)) return false;
    if (!game.warpTo(pos)) return false;
    autoWarpAt = now; return true;
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
  // Map views: wheel or pinch zooms about the cursor / fingers, a drag pans (one finger or the
  // mouse). k = zoom (1 = the whole map fits), ox / oy = pan in px. `moved` tells the click that
  // follows a drag to do nothing.
  const gView = __views.g, sView = __views.s;
  function panZoom(cv, V, maxK) {
    const pts = new Map(), two = new TwoFinger();
    let travel = 0;
    const zoomAt = (px, py, f) => {
      const r = cv.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
      const k = Math.max(1, Math.min(maxK, V.k * f)), g = k / V.k;
      // keep the map point under (px, py) where it is
      V.ox = (px - r.left - cx) - ((px - r.left - cx) - V.ox) * g; V.oy = (py - r.top - cy) - ((py - r.top - cy) - V.oy) * g;
      V.k = k; clampView(r);
    };
    const clampView = (r) => { const mx = r.width / 2 * (V.k - 1) + 40 * (V.k > 1), my = r.height / 2 * (V.k - 1) + 40 * (V.k > 1); V.ox = Math.max(-mx, Math.min(mx, V.ox)); V.oy = Math.max(-my, Math.min(my, V.oy)); };
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.pow(1.15, -Math.sign(e.deltaY))); }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { travel = 0; V.moved = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; two.start(a.x, a.y, b.x, b.y); V.moved = true; }
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers cannot be captured */ }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size >= 2 && two.active) {
        const [a, b] = [...pts.values()];
        two.move(a.x, a.y, b.x, b.y);
        if (two.zoom !== 1) zoomAt(two.cx, two.cy, 1 / two.zoom);
        if (two.panX || two.panY) { V.ox += two.panX; V.oy += two.panY; clampView(cv.getBoundingClientRect()); }
      } else if (pts.size === 1) {
        travel += Math.abs(dx) + Math.abs(dy);
        if (travel > 8) { V.moved = true; V.ox += dx; V.oy += dy; clampView(cv.getBoundingClientRect()); }
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) two.end(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  function renderGalaxy() {
    const W = game.ui.windows.galaxy, body = W.querySelector('.wbody');
    if (!gCanvas) {
      const LEG = [['pirate', 'Corsair Pirates', '#ff6a5a'], ['rival', 'Rival Companies', '#ffd640'], ['rustborn', 'Rustborn', '#b06236'], ['covenant', 'Hollow Star Covenant', '#ff3b8a'], ['brood', 'Leviathan Brood', '#40ffd0'], ['silent', 'Silent Choir', '#bff0ff']];
      body.innerHTML = `<div class="gwrap"><canvas class="gmap"></canvas><div class="ginfo holo" id="gInfo"></div><div class="glegend holo"><div class="label">Held by</div>${LEG.map(([, n, col]) => `<span><i style="border-color:${col}"></i>${n}</span>`).join('')}</div></div>`;
      gCanvas = body.querySelector('canvas');
      gCanvas.addEventListener('mousemove', (e) => { hover = pick(e); drawGalaxy(); });
      gCanvas.addEventListener('click', (e) => { if (gView.moved) return; const p = pick(e); if (p) { selected = p.id; drawGalaxy(); info(); } });
      gCanvas.addEventListener('dblclick', (e) => { const p = pick(e); if (p) game.jumpTo(p.id); });
      panZoom(gCanvas, gView, 6);
    }
    selected ??= game.data.system;
    info();
    if (document.body.classList.contains('mobile') && gView.k === 1 && !gView.ox && !gView.oy) {
      const me = galaxy().systems[game.data.system], r = gCanvas.getBoundingClientRect(), k = 2.2, S = Math.min(r.width, r.height) / 1900 * k;
      if (r.width > 0) { gView.k = k; gView.ox = -me.x * S; gView.oy = -me.y * S; }
    }
    loop();
  }
  function loop() { if (!game.ui.isOpen('galaxy')) return; drawGalaxy(); requestAnimationFrame(loop); }
  function layout() {
    const r = gCanvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 2);
    if (gCanvas.width !== Math.round(r.width * dpr) || gCanvas.height !== Math.round(r.height * dpr)) { gCanvas.width = Math.round(r.width * dpr); gCanvas.height = Math.round(r.height * dpr); }
    const S = Math.min(r.width, r.height) / 1900 * gView.k;
    return { w: r.width, h: r.height, dpr, S, cx: r.width / 2 + gView.ox, cy: r.height / 2 + gView.oy };
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
    const FCT = { pirate: '255,106,90', rival: '255,214,64', rustborn: '176,98,54', covenant: '255,59,138', brood: '64,255,208', silent: '191,240,255' };
    for (const s of S) {
      const x = L.cx + s.x * L.S, y = L.cy + s.y * L.S, rr = 70 * L.S + 14;
      const gg = c.createRadialGradient(x, y, 0, x, y, rr);
      gg.addColorStop(0, `rgba(${FCT[s.control] || '150,150,150'},0.10)`); gg.addColorStop(1, `rgba(${FCT[s.control] || '150,150,150'},0)`);
      c.fillStyle = gg; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    c.save(); c.font = `600 ${Math.max(11, Math.round(15 * L.S * 2.2))}px Rajdhani, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let arm = 0; arm < 3; arm++) {
      // just outside the arm's outer systems, outlined so a nearby dot never hides it
      // mid-arm, just outside it: away from the canvas edges the info panels cover
      const tt = 0.6, r = 120 + tt * 820 + 130, a = arm * (Math.PI * 2 / 3) + tt * 4.2;
      const x = L.cx + Math.cos(a) * r * L.S, y = L.cy + Math.sin(a) * r * L.S;
      c.lineWidth = 4; c.strokeStyle = 'rgba(4,8,20,0.85)'; c.strokeText(ARM_NAMES[arm].toUpperCase(), x, y);
      c.fillStyle = 'rgba(190,200,255,0.42)'; c.fillText(ARM_NAMES[arm].toUpperCase(), x, y);
    }
    c.restore();
    // the lane web: every jump lane in the galaxy, drawn to be read. Open lanes are solid, lanes into
    // space above the captain's rank are dashed, and the lanes out of the current system (and the
    // selected one) are lit, with a pulse running outward along them.
    const here = P.system, PX = (o) => L.cx + o.x * L.S, PY = (o) => L.cy + o.y * L.S;
    for (const s of S) for (const l of s.links) if (l > s.id) {
      const o = S[l];
      const open = s.danger <= max && o.danger <= max;
      const mine = s.id === here || l === here, sel = selected != null && (s.id === selected || l === selected);
      if (mine || sel) continue;
      c.lineWidth = open ? 1.4 : 1.1; c.setLineDash(open ? [] : [4, 4]);
      c.strokeStyle = open ? 'rgba(96,190,255,0.6)' : 'rgba(180,160,235,0.5)';
      c.beginPath(); c.moveTo(PX(s), PY(s)); c.lineTo(PX(o), PY(o)); c.stroke();
    }
    c.setLineDash([]);
    const lit = (from, col, glow) => {
      for (const l of S[from].links) {
        const o = S[l], open = S[from].danger <= max && o.danger <= max;
        c.strokeStyle = open ? col : 'rgba(200,170,255,0.55)'; c.lineWidth = 2; c.shadowColor = glow; c.shadowBlur = open ? 8 : 0; c.setLineDash(open ? [] : [4, 5]);
        c.beginPath(); c.moveTo(PX(S[from]), PY(S[from])); c.lineTo(PX(o), PY(o)); c.stroke();
        c.shadowBlur = 0; c.setLineDash([]);
        if (open) { const k = (t * 0.55 + l * 0.37) % 1, x = PX(S[from]) + (PX(o) - PX(S[from])) * k, y = PY(S[from]) + (PY(o) - PY(S[from])) * k; c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill(); }
      }
    };
    if (selected != null && selected !== here) lit(selected, 'rgba(255,255,255,0.6)', '#ffffff');
    lit(here, 'rgba(88,220,255,0.95)', '#58c8ff');
    if (rt) {
      c.strokeStyle = '#4ade80'; c.lineWidth = 2.5; c.shadowColor = '#4ade80'; c.shadowBlur = 10; c.setLineDash([6, 4]); c.lineDashOffset = -t * 20;
      c.beginPath(); rt.forEach((id, i) => { const s = S[id]; i ? c.lineTo(L.cx + s.x * L.S, L.cy + s.y * L.S) : c.moveTo(L.cx + s.x * L.S, L.cy + s.y * L.S); }); c.stroke();
      c.setLineDash([]); c.shadowBlur = 0;
    }
    // systems (the current one, its neighbours and the selection are labelled first)
    c.textAlign = 'center';
    const labels = [];
    const order = [...S].sort((a, b) => (b.id === P.system || b.id === selected) - (a.id === P.system || a.id === selected) || S[P.system].links.includes(b.id) - S[P.system].links.includes(a.id));
    for (const s of order) {
      const x = L.cx + s.x * L.S, y = L.cy + s.y * L.S;
      const star = systemDetail(s).star;
      const locked = s.danger > max;
      const r = 3.5 + Math.min(4, s.danger / 14);
      c.globalAlpha = locked ? 0.35 : 1;
      c.fillStyle = STAR_HEX[star.k]; c.shadowColor = STAR_HEX[star.k]; c.shadowBlur = 12;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;
      const FCG = { pirate: '#ff6a5a', rival: '#ffd640', rustborn: '#b06236', covenant: '#ff3b8a', brood: '#40ffd0', silent: '#bff0ff' };
      c.strokeStyle = FCG[s.control] || '#888'; c.globalAlpha = locked ? 0.25 : 0.55; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 4, 0, Math.PI * 2); c.stroke(); c.globalAlpha = locked ? 0.35 : 1;
      if (P.visited.includes(s.id)) { c.strokeStyle = 'rgba(200,220,255,0.5)'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, r + 7, 0, Math.PI * 2); c.stroke(); }
      if (s.id === P.system) { c.strokeStyle = '#58c8ff'; c.lineWidth = 2; const pr = r + 6 + Math.sin(t * 3) * 2; c.beginPath(); c.arc(x, y, pr, 0, Math.PI * 2); c.stroke(); }
      if (s.id === selected) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(x - r - 7, y - r - 7, (r + 7) * 2, (r + 7) * 2); }
      const near = S[P.system].links.includes(s.id) || (selected != null && S[selected].links.includes(s.id));
      const must = s === hover || s.id === selected || s.id === P.system || near;
      if (must || P.visited.includes(s.id) || L.w > 700 || gView.k >= 1.6) {
        // every system is named when there is room: the ones that matter first, the rest where they fit
        const txt = `${s.name} · ${s.danger}${locked ? ' 🔒' : ''}`, ly = y - r - (s.id === selected ? 11 : 6);
        c.font = `${must ? 600 : 500} ${must ? 12 : 10.5}px Rajdhani, sans-serif`;
        const tw = c.measureText(txt).width + 8;
        if (must || !labels.some((q) => Math.abs(q.x - x) < (q.w + tw) / 2 && Math.abs(q.y - ly) < 12)) {
          labels.push({ x, y: ly, w: tw });
          c.lineWidth = 3; c.strokeStyle = 'rgba(4,8,20,0.8)'; c.strokeText(txt, x, ly);
          c.fillStyle = locked ? '#7a86a8' : s.id === P.system ? '#8fe4ff' : s.danger > P.level + 3 ? '#ffb040' : must ? '#e6eeff' : '#a8b6d4';
          c.fillText(txt, x, ly);
        }
      }
      c.globalAlpha = 1;
    }
    if (game.mapExtras) game.mapExtras.galaxy(c, L);   // guild module: contested zones
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
      <div class="label ghint" style="margin-top:12px">${document.body.classList.contains('mobile') ? 'Pinch to zoom · drag to pan' : 'Double-click a system to jump · wheel zooms, drag pans'} · rings show who holds each system · higher danger, better loot</div>`;
    // the lanes out of this system: where each leads, and whether the captain may follow it
    const max = unlockedDanger(P), S = galaxy().systems;
    const lanes = s.links.map((id) => S[id]).sort((a, b) => a.danger - b.danger);
    el.insertAdjacentHTML('beforeend', `<div class="label" style="margin-top:12px">Jump lanes from ${s.name} (${lanes.length})</div><div class="glanes">${lanes.map((o) => `<button class="glane${o.danger > max ? ' locked' : ''}${o.id === P.system ? ' here' : ''}" data-sys="${o.id}"><span>${o.name}</span><b>${o.id === P.system ? 'you are here' : o.danger > max ? 'rank ' + (o.danger - 6) : 'danger ' + o.danger}</b></button>`).join('')}</div>${s.id === P.system ? '<button class="btn violet" id="gSys" style="margin-top:10px;width:100%">Open system map</button>' : ''}`);
    el.querySelectorAll('.glane').forEach((x) => x.onclick = () => { selected = +x.dataset.sys; drawGalaxy(); info(); });
    const gs = document.getElementById('gSys'); if (gs) gs.onclick = () => { game.ui.toggle('galaxy', false); game.ui.toggle('system', true); };
    const b = document.getElementById('gJump'); if (b) b.onclick = () => game.jumpTo(s.id);
  }

  // ---------------- system map ----------------
  let sCanvas = null;
  function renderSystem() {
    const W = game.ui.windows.system, body = W.querySelector('.wbody');
    W.querySelector('.wtitle span').textContent = `${game.sector.sys.name} · danger ${game.sector.sys.danger}`;
    if (!sCanvas) {
      const LEG = [['⚔', 'patrol'], ['⛫', 'raider base'], ['◌', 'mining belt'], ['✕', 'wreck field'], ['⚑', 'contested'], ['☠', 'boss lair'], ['◆', 'derelict'], ['✚', 'distress'], ['✺', 'anomaly'], ['?', 'signal']];
      body.innerHTML = `<canvas class="smap"></canvas><div class="slegend"><button class="btn violet" id="sGalaxy">Galaxy map</button><span class="label">${document.body.classList.contains('mobile') ? 'Tap to warp · tap a gate twice to jump · pinch to zoom' : 'Click to warp · click a gate twice to jump · wheel zooms'}</span><span><b>◎</b> jump gate</span>${LEG.map(([g, n]) => `<span><b>${g}</b>${n}</span>`).join('')}</div>`;
      sCanvas = body.querySelector('canvas');
      body.querySelector('#sGalaxy').onclick = () => { game.ui.toggle('system', false); game.ui.toggle('galaxy', true); };
      panZoom(sCanvas, sView, 8);
      sCanvas.addEventListener('click', (e) => {
        if (sView.moved) return;
        const L = sLayout(), r = sCanvas.getBoundingClientRect();
        // a jump gate on the rim: select it first (its lane lights up), a second click engages the drive
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const gate = gates(L).find((q) => Math.hypot(q.x - mx, q.y - my) < 30);
        if (gate) {
          if (gateSel === gate.id) { gateSel = null; if (game.jumpTo(gate.id)) game.ui.toggle('system', false); }
          else { gateSel = gate.id; if (gate.locked) game.ui.toast(`${gate.sys.name} requires commander rank ${gate.sys.danger - 6}`, 'warn'); }
          return;
        }
        gateSel = null;
        const x = (e.clientX - r.left - L.cx) / L.S, z = (e.clientY - r.top - L.cy) / L.S;
        game.warpTo(new THREE.Vector3(x, 0, z));
      });
    }
    sLoop();
  }
  function sLoop() { if (!game.ui.isOpen('system')) return; drawSystem(); requestAnimationFrame(sLoop); }
  // The lanes out of this system, as gates on the rim of the map: each sits on the bearing of the system
  // it leads to (as the galaxy map draws them), fixed to the frame however the map is panned or zoomed.
  let gateSel = null;
  game.navGates = () => (sCanvas ? gates(sLayout()).map((q) => ({ id: q.id, name: q.sys.name, x: q.x, y: q.y, locked: q.locked })) : []);   // for tools
  function gates(L) {
    const P = game.data, S = galaxy().systems, me = S[P.system], max = unlockedDanger(P);
    const hx = L.w / 2 - 70, hy = L.h / 2 - 34;
    const tall = L.h > L.w * 1.2, wide = L.w > L.h * 1.2;
    const out = me.links.map((id) => {
      const o = S[id], a = Math.atan2(o.y - me.y, o.x - me.x);
      // where the bearing meets the frame (inset so the label fits)
      const kx = hx / Math.max(1e-6, Math.abs(Math.cos(a))), ky = hy / Math.max(1e-6, Math.abs(Math.sin(a))), k = Math.min(kx, ky);
      let x = L.w / 2 + Math.cos(a) * k, y = L.h / 2 + Math.sin(a) * k, side = kx < ky;
      // a frame much taller or wider than the system (phones): gates take the spare edges, clear of the orbits
      if (tall) { x = L.w / 2 + Math.cos(a) * hx; y = L.h / 2 + (Math.sin(a) >= 0 ? hy : -hy); side = false; }
      else if (wide) { x = L.w / 2 + (Math.cos(a) >= 0 ? hx : -hx); y = L.h / 2 + Math.sin(a) * hy; side = true; }
      return { id, sys: o, a, x, y, side, locked: o.danger > max, cost: jumpCost([P.system, id], P) };
    });
    // neighbours on nearly the same bearing would sit on top of each other: slide them apart along the edge
    const GAP_X = 118, GAP_Y = 46;
    for (let pass = 0; pass < 8; pass++) for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const p = out[i], q = out[j];
      if (Math.abs(p.x - q.x) >= GAP_X || Math.abs(p.y - q.y) >= GAP_Y) continue;
      if (p.side && q.side) { const d = (GAP_Y - Math.abs(p.y - q.y)) / 2 + 1, sg = p.y <= q.y ? -1 : 1; p.y += sg * d; q.y -= sg * d; }
      else { const d = (GAP_X - Math.abs(p.x - q.x)) / 2 + 1, sg = p.x <= q.x ? -1 : 1; p.x += sg * d; q.x -= sg * d; }
    }
    for (const p of out) { p.x = Math.max(L.w / 2 - hx, Math.min(L.w / 2 + hx, p.x)); p.y = Math.max(L.h / 2 - hy, Math.min(L.h / 2 + hy, p.y)); }
    return out;
  }
  function sLayout() {
    const r = sCanvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
    if (sCanvas.width !== Math.round(r.width * dpr) || sCanvas.height !== Math.round(r.height * dpr)) { sCanvas.width = Math.round(r.width * dpr); sCanvas.height = Math.round(r.height * dpr); }
    const D = game.sector.detail;
    const ext = Math.max(...D.planets.map((p) => p.orbit + p.radius * 3)) * 1.05;
    return { w: r.width, h: r.height, dpr, S: Math.min(r.width, r.height) / 2 / ext * sView.k, cx: r.width / 2 + sView.ox, cy: r.height / 2 + sView.oy };
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
    for (const q of gates(L)) {                                                      // and off the jump-gate plates
      const ly = q.y + (q.y < L.h / 2 ? 27 : -30), pw = Math.max(q.sys.name.length * 7.5, 96) + 16;
      placed.push({ x: q.x, y: q.y + 4, w: 34 }, { x: q.x, y: ly - 2, w: pw }, { x: q.x, y: ly + 12, w: pw });
    }
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
      // surveyed worlds: a green ring, and what landings there have brought home
      const rec = game.data.explorer && game.data.explorer.scanned && game.data.explorer.scanned[`${game.data.system}:${info.name}`];
      if (rec) {
        c.strokeStyle = '#4ade80'; c.lineWidth = 1.2; c.beginPath(); c.arc(X(pl.position.x), Y(pl.position.z), r + 3, 0, Math.PI * 2); c.stroke();
        const txt = rec.runs ? `◈ ${rec.runs} landing${rec.runs > 1 ? 's' : ''} · ${rec.banked || 0}u${rec.dungeons ? ' · ' + rec.dungeons + ' dungeon' + (rec.dungeons > 1 ? 's' : '') : ''}` : '◈ surveyed';
        c.font = '500 10px Rajdhani, sans-serif'; label(txt, X(pl.position.x), Y(pl.position.z) + r + 13, '#7ee8a8', Y(pl.position.z) + r + 25); c.font = '500 11px Rajdhani, sans-serif';
      }
    }
    const FC = { pirate: '#ff6a5a', rival: '#ffd640', rustborn: '#b06236', covenant: '#ff3b8a', brood: '#40ffd0', silent: '#bff0ff' };
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
    if (game.mapExtras) game.mapExtras.system(c, X, Y, t);   // guild module: contested zone
    // jump gates: a lane from the star out to each neighbouring system
    c.save(); c.textAlign = 'center';
    for (const q of gates(L)) {
      const sel = gateSel === q.id, col = q.locked ? '#8a7ab8' : sel ? '#ffffff' : '#58dcff';
      c.strokeStyle = q.locked ? 'rgba(170,150,220,0.3)' : sel ? 'rgba(255,255,255,0.7)' : 'rgba(88,220,255,0.38)';
      c.lineWidth = sel ? 2 : 1.2; c.setLineDash(q.locked ? [3, 6] : [8, 6]); c.lineDashOffset = q.locked ? 0 : -t * 24;
      c.beginPath(); c.moveTo(L.cx, L.cy); c.lineTo(q.x, q.y); c.stroke(); c.setLineDash([]);
      // the gate: a ring with a chevron pointing out along the lane
      c.shadowColor = col; c.shadowBlur = q.locked ? 0 : 10; c.strokeStyle = col; c.lineWidth = 2;
      c.beginPath(); c.arc(q.x, q.y, sel ? 13 + Math.sin(t * 6) * 1.5 : 11, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0;
      c.save(); c.translate(q.x, q.y); c.rotate(q.a); c.fillStyle = col; c.beginPath(); c.moveTo(6, 0); c.lineTo(-3, -5); c.lineTo(-3, 5); c.closePath(); c.fill(); c.restore();
      const up = q.y < L.h / 2, ly = q.y + (up ? 27 : -30);
      c.font = '600 12px Rajdhani, sans-serif'; c.lineWidth = 3; c.strokeStyle = 'rgba(4,8,20,0.85)';
      const name = `${q.sys.name}${q.locked ? ' 🔒' : ''}`;
      // a plate behind the two lines, so the gate reads over planets and their labels
      const pw = Math.max(c.measureText(name).width, 96) + 12; c.fillStyle = 'rgba(4,8,20,0.78)'; c.fillRect(q.x - pw / 2, ly - 11, pw, 27);
      c.strokeText(name, q.x, ly); c.fillStyle = q.locked ? '#8a94b4' : '#e6eeff'; c.fillText(name, q.x, ly);
      c.font = '500 10.5px Rajdhani, sans-serif';
      const sub = q.locked ? `rank ${q.sys.danger - 6} · danger ${q.sys.danger}` : sel ? `click again to jump · ${fmt(q.cost)} ¢` : `danger ${q.sys.danger} · ${fmt(q.cost)} ¢`;
      c.strokeText(sub, q.x, ly + 12); c.fillStyle = q.locked ? '#7a86a8' : sel ? '#8fe4ff' : q.sys.danger > game.data.level + 3 ? '#ffb040' : '#9fb4d8'; c.fillText(sub, q.x, ly + 12);
    }
    c.restore();
    c.font = '500 11px Rajdhani, sans-serif';
    for (const st of game.stations) { const x = X(st.position.x), y = Y(st.position.z); c.fillStyle = '#58ffd8'; c.shadowColor = '#58ffd8'; c.shadowBlur = 8; c.fillRect(x - 5, y - 5, 10, 10); c.shadowBlur = 0; }
    for (const o of game.world.ships) { if (!o.alive || o === game.player) continue; c.fillStyle = o.team === 1 ? '#58c8ff' : '#ff4a6a'; c.fillRect(X(o.position.x) - 1.5, Y(o.position.z) - 1.5, 3, 3); }
    const s = game.player;
    if (s) { c.save(); c.translate(X(s.position.x), Y(s.position.z)); c.rotate(-s.heading + Math.PI); c.fillStyle = '#fff'; c.shadowColor = '#58c8ff'; c.shadowBlur = 10; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(-6, 7); c.closePath(); c.fill(); c.restore(); }
  }
}
