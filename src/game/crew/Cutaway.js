// The ship in side profile, Star-Trek-cutaway style, drawn as a glowing holo-blueprint on a 2D canvas: the outline is the
// hull's own silhouette (ship/hullPlan.js sideProfile: ram, castle tiers, spires, keel), decks and labelled rooms laid
// out from the chassis (src/game/crew/layout.js) and fitted inside it, the reactor column in engineering, gun ports, the
// bridge on the crown of the superstructure, and every crew member as a little figure walking their post, coloured by
// department.
// Rooms whose section is burning flash red; recent hull hits flare where they landed.
import { DEPTS, OFFICER_POSTS, skillOf, rankAbbr } from './data.js';
import { SECTIONS } from './layout.js';
import { YARDS } from '../data/chassis.js';
import { sideProfile, profileAt } from '../ship/hullPlan.js';

const TAU = Math.PI * 2;
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
const OFFICER_ROOM = { xo: 'bridge', helm: 'bridge', tactical: 'bridge', eng: 'engineering', science: 'sensors', medical: 'medical', flight: 'hangar' };

export class Cutaway {
  constructor(canvas, sys, { onPick, onHover } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sys = sys;
    this.onPick = onPick; this.onHover = onHover;
    this.figs = new Map();     // member id -> figure
    this.sel = null;           // selected section key
    this.hoverRoom = null; this.hoverFig = null;
    this.t = 0;
    this.layoutKey = '';
    canvas.addEventListener('pointermove', (e) => this.pointer(e, false));
    canvas.addEventListener('pointerdown', (e) => this.pointer(e, true));
    canvas.addEventListener('pointerleave', () => { this.hoverRoom = this.hoverFig = null; this.onHover && this.onHover(null, null); });
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.layoutKey = '';
  }

  // Pixel geometry of the plan. The outline is the hull's own side profile (ship/hullPlan.js
  // sideProfile: the loft sections, castle tiers, ram, spires, keel), stretched to fit the decks:
  // the main hull maps linearly onto the deck rows, each castle room row onto one castle tier,
  // and whatever stands higher (bridge, forward spire, masts) is compressed above it.
  layout() {
    const ch = this.sys.chassis, plan = this.sys.deckPlan();
    const key = `${ch.id}:${this.w}x${this.h}`;
    if (key === this.layoutKey) return this.g;
    this.layoutKey = key;
    const y = YARDS[ch.yard];
    const prof = sideProfile(ch);
    const W = this.w, H = this.h, D = plan.decks, C = plan.castleRows;
    const narrow = W < 560;
    const x0 = narrow ? 34 : 78, x1 = W - (narrow ? 14 : 34);
    const Lh = prof.L, Ht = prof.Ht, Hb = prof.Hb, depth = Ht + Hb;
    // horizontal: the stern at x0, the furthest reach of the bow (bowsprit, blades, tines) at x1
    const zFar = Math.max(prof.zMax, ...prof.lines.map((l) => Math.max(l.z0, l.z1)));
    const uHi = Math.max(1, zFar / Lh + 0.5);
    const L = x1 - x0;
    const X = (u) => x0 + (u / uHi) * L;
    const XZ = (z) => X(z / Lh + 0.5);
    // vertical, in deck heights above the hull's top line: piecewise through the castle tiers
    const towers = prof.castle.towers, br = prof.castle.bridge;
    const kHull = D / depth;                           // deck heights per hull unit inside the main hull
    const brk = [[Ht, 0]];
    let f = 0;
    if (towers[0].y0 > Ht + 1e-6) { f += (towers[0].y0 - Ht) * kHull; brk.push([towers[0].y0, f]); }
    const castleBase = f;
    for (let i = 0; i < C - 1; i++) { f += 0.8; brk.push([towers[i].y1, f]); }
    f += 0.8; brk.push([towers[towers.length - 1].y1, f]);
    if (br) { f += 0.36; brk.push([br.y1, f]); }
    const crownF = f, aboveK = 0.32 / Ht;              // higher than the crown: about a third of a deck per Ht
    const up = (yy) => {                               // deck heights above the hull's top line
      if (yy <= Ht) return 0;
      for (let i = 1; i < brk.length; i++) {
        const [ya, fa] = brk[i - 1], [yb, fb] = brk[i];
        if (yy <= yb) return fa + (fb - fa) * (yy - ya) / Math.max(1e-6, yb - ya);
      }
      return crownF + (yy - brk[brk.length - 1][0]) * aboveK;
    };
    const keelDepth = Math.max(1e-6, -Hb - Math.min(...prof.bottom.map((p) => p[1])));
    const kKeel = Math.min(kHull, 0.6 / keelDepth);
    const down = (yy) => (yy >= -Hb ? (Ht - yy) * kHull : D + (-Hb - yy) * kKeel);   // deck heights below the top line
    // fit: everything above the top line, the decks and the keel, plus room for spires and masts
    const above = Math.max(crownF + 0.9, ...prof.top.map((p) => up(p[1])), ...prof.lines.map((l) => up(Math.max(l.y0, l.y1)))) + 0.3;
    const below = Math.max(D, ...prof.bottom.map((p) => down(p[1]))) + 0.2;
    const dh = Math.max(16, Math.min(78, (H - 92) / (above + below), L / uHi / (D * 3.2)));
    const cdh = dh * 0.8;
    const top = Math.max(56 + above * dh, (H - (above + below) * dh) / 2 + above * dh + 18);
    const bottom = top + D * dh;
    const Y = (yy) => (yy >= Ht ? top - up(yy) * dh : top + down(yy) * dh);
    // the outline, and the main hull's own deck and bilge lines where other parts stand over them
    const hull = new Path2D();
    prof.outline.forEach(([z, yy], i) => (i ? hull.lineTo(XZ(z), Y(yy)) : hull.moveTo(XZ(z), Y(yy))));
    hull.closePath();
    const inner = new Path2D();
    for (const line of [prof.hullTop, prof.hullBottom]) line.forEach(([z, yy], i) => (i ? inner.lineTo(XZ(z), Y(yy)) : inner.moveTo(XZ(z), Y(yy))));
    // each main deck runs as far forward as the hull is deep enough for it; rooms forward of
    // engineering close up proportionally, so every compartment keeps its place in the row
    const span = deckSpans(prof, D, Ht, depth);
    const pivot = 0.17;
    const rowExt = new Map();
    for (const r of plan.rooms) { const e = rowExt.get(r.row) || [1, 0]; rowExt.set(r.row, [Math.min(e[0], r.u0), Math.max(e[1], r.u1)]); }
    const remap = (row, u) => {
      const [a, b] = rowExt.get(row);
      if (row >= 0) {
        const b2 = Math.max(pivot + 0.12, Math.min(b, span[row][1]));
        return u <= pivot ? u : pivot + (u - pivot) * (b2 - pivot) / (b - pivot);
      }
      // castle rows: into the run of their own tier (the top row: the narrowest tier above it)
      const i = -1 - row, t = towers[Math.min(towers.length - 1, i === C - 1 ? towers.length - 1 : i)];
      const a2 = t.z0 / Lh + 0.5, b2 = t.z1 / Lh + 0.5;
      return a2 + (u - a) / (b - a) * (b2 - a2);
    };
    const rooms = plan.rooms.map((r) => {
      const u0 = remap(r.row, r.u0), u1 = remap(r.row, r.u1);
      const yr = r.row >= 0 ? top + r.row * dh : top - (castleBase - r.row * 0.8) * dh;
      return { ...r, x: X(u0), y: yr, w: X(u1) - X(u0), h: r.row >= 0 ? dh : cdh, color: secColor(r.sec) };
    });
    const crown = br ? { x: XZ(br.z0), w: XZ(br.z1) - XZ(br.z0), y: Y(br.y1) } : { x: XZ(towers[towers.length - 1].z0), w: XZ(towers[towers.length - 1].z1) - XZ(towers[towers.length - 1].z0), y: Y(towers[towers.length - 1].y1) };
    this.g = { plan, ch, yard: y, prof, x0, x1, L, X, XZ, Y, top, bottom, dh, cdh, D, C, rooms, narrow, hull, inner, crown, castleBase, remap, span };
    this.g.engines = 1 + Math.floor((ch.tier + 1) / 3);
    this.figs.clear();
    return this.g;
  }

  // keep one figure per crew member, placed in a room of their post
  syncFigures(now) {
    const g = this.g, st = this.sys.state;
    const seen = new Set();
    const shift = Math.floor(now / 75);
    for (const m of st.members) {
      seen.add(m.id);
      let f = this.figs.get(m.id);
      const roomSec = m.status === 'wounded' ? 'medical'
        : m.officer ? OFFICER_ROOM[m.officer]
          : ((shift + m.id) % 4 === 0 && m.section !== 'command' && m.section !== 'helm') ? 'quarters'
            : DEPTS[m.section].section;
      const pool = g.rooms.filter((r) => r.sec === roomSec);
      const rooms = pool.length ? pool : g.rooms.filter((r) => r.sec === 'quarters');
      const want = rooms.length ? rooms[Math.floor(hash(m.id * 7 + (roomSec === 'quarters' ? shift : 0)) * rooms.length)] : g.rooms[0];
      if (!f) {
        f = { m, room: null, x: 0, tx: 0, pause: hash(m.id) * 3, speed: 10 + hash(m.id * 3) * 12, phase: hash(m.id * 5) * TAU, alpha: 0, lying: false };
        this.figs.set(m.id, f);
      }
      f.m = m;
      if (f.room !== want) {
        f.room = want;
        f.x = want.x + 8 + hash(m.id * 11 + shift) * Math.max(1, want.w - 16);
        f.tx = f.x; f.alpha = 0;
      }
      f.lying = m.status === 'wounded';
      f.roam = m.section === 'damage' && !f.lying;
    }
    for (const id of [...this.figs.keys()]) if (!seen.has(id)) this.figs.delete(id);
  }

  pointer(e, click) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = this.pick(x, y);
    this.hoverFig = hit.fig; this.hoverRoom = hit.room;
    this.canvas.style.cursor = hit.fig || hit.room ? 'pointer' : 'default';
    if (this.onHover) this.onHover(hit, e);
    if (click && this.onPick) this.onPick(hit, e);
  }

  pick(x, y) {
    if (!this.g) return {};
    let best = null, bd = (this.g.narrow ? 16 : 10) ** 2;
    for (const f of this.figs.values()) {
      const s = this.figSize();
      const fy = f.room.y + f.room.h - (f.lying ? 4 : s * 0.55);
      const d = (f.x - x) ** 2 + (fy - y) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    let room = null;
    for (const r of this.g.rooms) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) room = r;
    return { fig: best, member: best && best.m, room: best ? best.room : room };
  }

  figSize() { return Math.max(8, Math.min(21, this.g.dh * 0.42)); }

  draw(realDt, now) {
    this.resize();
    const g = this.layout();
    this.t += realDt;
    this.syncFigures(now);
    const c = this.ctx, t = this.t;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    this.drawGrid(c);
    const rep = this.sys.report();
    const st = this.sys.state;
    const fires = st.fires || {};
    const s = this.sys.game.player;
    const hullF = s ? Math.max(0, s.hull / s.maxHull) : 1;

    // engines (behind the hull)
    this.drawEngines(c, g, t);
    // hull body: the ship's own side silhouette
    c.save();
    c.fillStyle = grad(c, 0, g.crown.y, 0, g.bottom + g.dh, [[0, 'rgba(24,44,96,0.55)'], [1, 'rgba(8,14,36,0.75)']]);
    c.fill(g.hull);
    c.strokeStyle = 'rgba(88,200,255,0.22)'; c.lineWidth = 1; c.stroke(g.inner);
    c.restore();
    // rooms (clipped to the hull's silhouette)
    c.save();
    c.clip(g.hull);
    for (const r of g.rooms) this.drawRoom(c, r, rep, fires, now);
    this.drawCore(c, g, t);
    // battle damage: scorch marks grow as the hull fails
    if (hullF < 0.85) {
      const n = Math.floor((1 - hullF) * 14);
      for (let i = 0; i < n; i++) {
        const r = g.rooms[Math.floor(hash(i * 97 + 13) * g.rooms.length)]; if (r.row < 0) continue;
        const x = r.x + hash(i * 31) * r.w, y = r.y + hash(i * 53) * r.h, rad = 6 + hash(i) * 14;
        c.fillStyle = grad2(c, x, y, rad, 'rgba(255,90,40,0.28)', 'rgba(255,60,30,0)'); c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
      }
    }
    c.restore();
    // hull outline glow
    c.save();
    c.strokeStyle = '#58c8ff'; c.lineWidth = 1.6; c.shadowColor = '#58c8ff'; c.shadowBlur = 12;
    c.stroke(g.hull);
    c.restore();
    this.drawFittings(c, g, t);
    // crew
    this.drawFigures(c, g, realDt, t);
    // hits (inside the hull's outline)
    c.save();
    c.clip(g.hull);
    for (const h of this.sys.hits) {
      const age = this.sys.game.engine.realTime - h.t; if (age > 1.6) continue;
      const r = g.rooms[h.room]; if (!r) continue;
      const a = 1 - age / 1.6;
      c.fillStyle = `rgba(255,${120 + 100 * a | 0},90,${0.45 * a})`; c.fillRect(r.x, r.y, r.w, r.h);
      c.strokeStyle = `rgba(255,220,180,${a})`; c.lineWidth = 2; c.beginPath(); c.arc(r.x + r.w / 2, r.y + r.h / 2, 6 + age * 40, 0, TAU); c.stroke();
    }
    c.restore();
    this.drawLabels(c, g, st, rep);
  }

  drawGrid(c) {
    c.save();
    c.strokeStyle = 'rgba(88,160,255,0.06)'; c.lineWidth = 1;
    c.beginPath();
    for (let x = 0.5; x < this.w; x += 24) { c.moveTo(x, 0); c.lineTo(x, this.h); }
    for (let y = 0.5; y < this.h; y += 24) { c.moveTo(0, y); c.lineTo(this.w, y); }
    c.stroke();
    c.strokeStyle = 'rgba(88,160,255,0.1)';
    c.beginPath();
    for (let x = 0.5; x < this.w; x += 120) { c.moveTo(x, 0); c.lineTo(x, this.h); }
    c.stroke();
    c.restore();
  }

  drawEngines(c, g, t) {
    const n = g.engines, span = (g.bottom - g.top) * 0.9, eh = Math.min(g.dh * 0.9, span / n * 0.8);
    const col = '#' + YARDS[g.ch.yard].engine.toString(16).padStart(6, '0');
    const thr = this.sys.game.player ? Math.max(0.2, Math.abs(this.sys.game.player.speed) / this.sys.game.player.maxSpeed) : 0.3;
    for (let i = 0; i < n; i++) {
      const cy = g.top + (g.bottom - g.top) * (n === 1 ? 0.5 : 0.12 + 0.76 * i / (n - 1));
      const x = g.x0;
      c.beginPath(); c.moveTo(x + 2, cy - eh * 0.4); c.lineTo(x - eh * 0.7, cy - eh * 0.5); c.lineTo(x - eh * 0.7, cy + eh * 0.5); c.lineTo(x + 2, cy + eh * 0.4); c.closePath();
      c.fillStyle = 'rgba(14,24,56,0.9)'; c.fill(); c.strokeStyle = 'rgba(88,200,255,0.6)'; c.lineWidth = 1; c.stroke();
      const fl = (28 + 40 * thr) * (0.9 + 0.1 * Math.sin(t * 30 + i));
      const gr = c.createLinearGradient(x - eh * 0.7, 0, x - eh * 0.7 - fl, 0);
      gr.addColorStop(0, hexA(col, 0.9)); gr.addColorStop(1, hexA(col, 0));
      c.fillStyle = gr; c.beginPath(); c.moveTo(x - eh * 0.7, cy - eh * 0.42); c.lineTo(x - eh * 0.7 - fl, cy); c.lineTo(x - eh * 0.7, cy + eh * 0.42); c.closePath(); c.fill();
    }
  }

  drawRoom(c, r, rep, fires, now) {
    const sel = this.sel && r.sec === this.sel, hov = this.hoverRoom === r;
    const col = r.color;
    c.fillStyle = hexA(col, sel ? 0.2 : hov ? 0.15 : 0.075);
    c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    c.strokeStyle = sel ? hexA(col, 0.95) : 'rgba(88,180,255,0.32)';
    c.lineWidth = sel ? 1.6 : 1;
    c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    // floor
    c.fillStyle = 'rgba(88,180,255,0.22)'; c.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1.5);
    if (fires[r.sec] > 0) {
      const a = 0.18 + 0.14 * Math.sin(this.t * 7 + r.id);
      c.fillStyle = `rgba(255,50,40,${a})`; c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      for (let i = 0; i < Math.max(2, r.w / 26); i++) {
        const fx = r.x + 6 + hash(r.id * 13 + i) * (r.w - 12), ph = this.t * (5 + hash(i) * 3) + i;
        const fh = r.h * (0.25 + 0.2 * Math.abs(Math.sin(ph)));
        const gr = c.createLinearGradient(0, r.y + r.h, 0, r.y + r.h - fh);
        gr.addColorStop(0, 'rgba(255,200,80,0.9)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
        c.fillStyle = gr; c.beginPath(); c.moveTo(fx - 5, r.y + r.h - 2); c.quadraticCurveTo(fx + Math.sin(ph * 1.3) * 3, r.y + r.h - fh * 1.3, fx + 5, r.y + r.h - 2); c.fill();
      }
    }
    this.drawProps(c, r);
  }

  // a few props per kind of room, in thin holo lines
  drawProps(c, r) {
    const t = this.t, fl = r.y + r.h - 2;
    c.save();
    c.strokeStyle = hexA(r.color, 0.5); c.fillStyle = hexA(r.color, 0.35); c.lineWidth = 1;
    const k = r.sec;
    if (k === 'teleporter') {
      const n = Math.max(1, Math.min(4, Math.floor(r.w / 22)));
      for (let i = 0; i < n; i++) {
        const x = r.x + r.w * (i + 0.5) / n;
        c.beginPath(); c.ellipse(x, fl - 1, 7, 2, 0, 0, TAU); c.stroke();
        const a = 0.15 + 0.15 * Math.sin(t * 3 + i * 1.7);
        c.fillStyle = hexA(r.color, a); c.fillRect(x - 6, r.y + 4, 12, r.h - 7);
      }
    } else if (k === 'medical' || (k === 'quarters' && r.w > 40)) {
      const n = Math.max(1, Math.floor(r.w / 30));
      for (let i = 0; i < n; i++) { const x = r.x + 5 + i * (r.w - 10) / n; c.strokeRect(x + 2, fl - 5, Math.min(18, (r.w - 10) / n - 4), 4); }
    } else if (k === 'sensors' && r.u1 > 0.9) {
      const x = r.x + r.w - 10, y = r.y + r.h / 2;
      for (let i = 1; i <= 3; i++) { c.globalAlpha = 0.3 + 0.7 * ((t * 1.2 + i / 3) % 1); c.beginPath(); c.arc(x, y, i * 4 + (t * 8 % 4), -0.9, 0.9); c.stroke(); }
      c.globalAlpha = 1;
    } else if (k === 'shields') {
      const x = r.x + r.w / 2, y = r.y + r.h / 2, rad = Math.min(r.h, r.w) * 0.3;
      c.fillStyle = grad2(c, x, y, rad, hexA(r.color, 0.5 + 0.2 * Math.sin(t * 2)), hexA(r.color, 0)); c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
      c.beginPath(); c.arc(x, y, rad * 0.6, 0, TAU); c.stroke();
    } else if (k === 'hangar') {
      const x = r.x + r.w * 0.55, y = fl - 4, s = Math.min(16, r.h * 0.3);
      c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y - s * 0.25); c.lineTo(x + s * 0.4, y - s * 0.5); c.lineTo(x - s * 0.7, y - s * 0.4); c.closePath(); c.stroke();
    } else if (k === 'cargo') {
      const n = Math.max(1, Math.floor(r.w / 14));
      for (let i = 0; i < n; i++) { const h = 5 + hash(r.id + i) * 6; c.strokeRect(r.x + 4 + i * 13, fl - h, 10, h); }
    } else if (k === 'weapons') {
      // magazine racks
      const n = Math.max(1, Math.floor(r.w / 18));
      for (let i = 0; i < n; i++) { const x = r.x + 6 + i * (r.w - 12) / n; c.beginPath(); c.moveTo(x, fl); c.lineTo(x, fl - 6); c.stroke(); }
    } else if (k === 'bridge' && r.name === 'Main Bridge') {
      c.fillStyle = hexA('#58c8ff', 0.55); c.fillRect(r.x + r.w - 5, r.y + 4, 3, r.h - 8);
    }
    c.restore();
  }

  drawCore(c, g, t) {
    const eng = g.rooms.filter((r) => r.sec === 'engineering');
    if (!eng.length) return;
    const x = eng[0].x + eng[0].w * 0.62, y0 = g.top + 3, y1 = g.bottom - 3, w = Math.max(6, g.dh * 0.22);
    const gr = c.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, 'rgba(120,90,255,0)'); gr.addColorStop(0.5, 'rgba(150,200,255,0.55)'); gr.addColorStop(1, 'rgba(120,90,255,0)');
    c.fillStyle = gr; c.fillRect(x - w, y0, w * 2, y1 - y0);
    const n = Math.max(3, Math.floor((y1 - y0) / 9));
    for (let i = 0; i < n; i++) {
      const p = ((i / n) - t * 0.6) % 1, py = y0 + ((p + 1) % 1) * (y1 - y0);
      c.fillStyle = `rgba(200,230,255,${0.25 + 0.5 * Math.abs(Math.sin(t * 4 + i))})`;
      c.fillRect(x - w * 0.55, py, w * 1.1, 2);
    }
    c.strokeStyle = 'rgba(180,160,255,0.7)'; c.lineWidth = 1; c.strokeRect(x - w * 0.6, y0, w * 1.2, y1 - y0);
  }

  // outside fittings: gun ports along the gun decks, turrets, prow guns, masts, spires and bowsprit
  drawFittings(c, g, t) {
    const ch = g.ch, s = ch.slots, prof = g.prof;
    c.save();
    c.strokeStyle = 'rgba(160,220,255,0.75)'; c.fillStyle = 'rgba(10,20,46,0.95)'; c.lineWidth = 1;
    const rows = g.plan.gunRows.length ? g.plan.gunRows : [g.D - 1];
    const nb = s.broadside;
    for (let i = 0; i < nb; i++) {
      const u = nb === 1 ? 0.5 : 0.24 + (i / (nb - 1)) * 0.46;
      for (const row of rows) {
        const y = g.top + row * g.dh + g.dh * 0.42, x = g.X(g.remap(row, u)), r = Math.max(2.5, g.dh * 0.11);
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
        c.beginPath(); c.arc(x, y, r * 0.45, 0, TAU); c.fillStyle = 'rgba(255,180,90,0.8)'; c.fill(); c.fillStyle = 'rgba(10,20,46,0.95)';
      }
    }
    // dorsal turrets sit on the hull's own deck line
    const nt = Math.ceil(s.turret * 0.7);
    for (let i = 0; i < nt; i++) {
      const u = g.remap(0, nt === 1 ? 0.58 : 0.44 + (i / Math.max(1, nt - 1)) * 0.34), z = (u - 0.5) * prof.L;
      const x = g.X(u), y = g.Y(profileAt(prof.hullTop, z) ?? prof.Ht);
      c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x - 5, y - 6); c.lineTo(x + 5, y - 6); c.lineTo(x + 7, y); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x + 2, y - 4); c.lineTo(x + 13, y - 7); c.stroke();
    }
    // spires on the crown, then the masts and the bowsprit from the hull's own lines
    const top = g.crown;
    const sp = Math.min(5, prof.spires);
    for (let i = 0; i < sp; i++) {
      const x = top.x + top.w * (0.15 + 0.7 * (i + 0.5) / sp), h = g.cdh * (0.8 + hash(i + ch.tier) * 0.9);
      c.beginPath(); c.moveTo(x - 3, top.y); c.lineTo(x, top.y - h); c.lineTo(x + 3, top.y); c.stroke();
    }
    for (const l of prof.lines) {
      const ax = g.XZ(l.z0), ay = g.Y(l.y0), bx = g.XZ(l.z1), by = g.Y(l.y1);
      if (l.kind === 'sail') {
        // a solar sail on its mast: a faint panel aft of the mast, three yards across it
        const sw = g.XZ(l.z0) - g.XZ(l.z0 - l.sw), s0 = ay + (by - ay) * 0.15, s1 = ay + (by - ay) * 0.95;
        c.fillStyle = 'rgba(88,200,255,0.07)'; c.fillRect(ax - sw * 0.6, s1, sw, s0 - s1);
        c.strokeStyle = 'rgba(88,200,255,0.3)'; c.strokeRect(ax - sw * 0.6, s1, sw, s0 - s1);
        for (let k = 0; k < 3; k++) { const yy = ay + (by - ay) * (0.2 + k * 0.33); c.beginPath(); c.moveTo(ax - sw * 0.62, yy); c.lineTo(ax + sw * 0.42, yy); c.stroke(); }
        c.strokeStyle = 'rgba(160,220,255,0.75)';
      }
      c.lineWidth = l.kind === 'bowsprit' ? 2 : 1.2;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      if (l.kind !== 'bowsprit') { c.fillStyle = `rgba(255,90,90,${0.5 + 0.5 * Math.sin(t * 3 + l.z0)})`; c.beginPath(); c.arc(bx, by, 2, 0, TAU); c.fill(); }
    }
    c.lineWidth = 1;
    // deflector glow in the bow
    const defl = g.rooms.find((r) => r.name === 'Deflector') || g.rooms.find((r) => r.row === g.D - 1 && r.sec === 'shields');
    const bx = defl ? defl.x + defl.w * 0.7 : g.X(g.remap(g.D - 1, 0.93)), by = defl ? defl.y + defl.h * 0.5 : g.top + (g.bottom - g.top) * 0.62;
    c.fillStyle = grad2(c, bx, by, g.dh * 0.5, `rgba(120,200,255,${0.45 + 0.15 * Math.sin(t * 2)})`, 'rgba(120,200,255,0)');
    c.beginPath(); c.arc(bx, by, g.dh * 0.5, 0, TAU); c.fill();
    c.restore();
  }

  drawFigures(c, g, dt, t) {
    const s = this.figSize();
    c.save();
    c.lineCap = 'round';
    for (const f of this.figs.values()) {
      const r = f.room; if (!r) continue;
      f.alpha = Math.min(1, f.alpha + dt * 2);
      const minX = r.x + 5, maxX = r.x + r.w - 5;
      let walking = false;
      if (!f.lying) {
        if (f.pause > 0) f.pause -= dt;
        else {
          const d = f.tx - f.x;
          if (Math.abs(d) < 1) { f.pause = 1 + hash(f.m.id + Math.floor(t)) * 5; f.tx = minX + Math.random() * (maxX - minX); }
          else { f.x += Math.sign(d) * Math.min(Math.abs(d), f.speed * dt * (f.roam ? 1.6 : 1)); walking = true; }
        }
        f.x = Math.max(minX, Math.min(maxX, f.x));
      }
      const col = DEPTS[f.m.dept].color;
      const fl = r.y + r.h - 2.5, x = f.x;
      const hl = this.hoverFig === f;
      c.globalAlpha = f.alpha;
      c.strokeStyle = col; c.fillStyle = col;
      c.lineWidth = Math.max(1.2, s * 0.13);
      if (hl || f.m.officer) { c.shadowColor = hl ? '#fff' : col; c.shadowBlur = hl ? 10 : 6; }
      if (f.lying) {
        c.globalAlpha = f.alpha * (0.6 + 0.4 * Math.sin(t * 2 + f.phase));
        c.beginPath(); c.moveTo(x - s * 0.45, fl - 3); c.lineTo(x + s * 0.3, fl - 3); c.stroke();
        c.beginPath(); c.arc(x + s * 0.45, fl - 3.5, s * 0.15, 0, TAU); c.fill();
        c.fillStyle = '#ff5468'; c.fillRect(x - 1, fl - s * 0.6, 2, 5); c.fillRect(x - 2.5, fl - s * 0.6 + 1.5, 5, 2);
      } else {
        const ph = walking ? Math.sin(t * 9 + f.phase) : 0;
        const hip = fl - s * 0.42, sh = fl - s * 0.78;
        c.beginPath();
        c.moveTo(x, hip); c.lineTo(x + ph * s * 0.2, fl);
        c.moveTo(x, hip); c.lineTo(x - ph * s * 0.2, fl);
        c.moveTo(x, hip); c.lineTo(x, sh);
        c.moveTo(x, sh + 1); c.lineTo(x - ph * s * 0.16 - (walking ? 0 : s * 0.08), hip + 1);
        c.moveTo(x, sh + 1); c.lineTo(x + ph * s * 0.16 + (walking ? 0 : s * 0.08), hip + 1);
        c.stroke();
        c.beginPath(); c.arc(x, sh - s * 0.14, s * 0.14, 0, TAU); c.fill();
        if (f.m.officer) { c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.arc(x, sh - s * 0.14, s * 0.22, 0, TAU); c.stroke(); }
      }
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1;
    c.restore();
  }

  drawLabels(c, g, st, rep) {
    c.save();
    c.textBaseline = 'top';
    // room names + one readout per section
    const shown = new Set();
    for (const r of g.rooms) {
      if (r.w < 46 || r.h < 18) continue;
      const fs = Math.max(8, Math.min(10.5, r.h * 0.22));
      c.font = `600 ${fs}px Orbitron, Rajdhani, sans-serif`;
      c.fillStyle = 'rgba(220,236,255,0.82)';
      let name = r.name.toUpperCase();
      if (c.measureText(name).width > r.w - 8) name = shortName(r.name).toUpperCase();
      if (c.measureText(name).width < r.w - 8) c.fillText(name, r.x + 4, r.y + 3);
      const depts = SECTIONS[r.sec].depts;
      if (depts.length && !shown.has(r.sec) && r.h > 28 && depts.some((d) => rep[d].req)) {
        shown.add(r.sec);
        let n = 0, req = 0, eff = 0, k = 0;
        for (const d of depts) { const x = rep[d]; n += x.n; req += x.req; if (x.req) { eff += x.perf; k++; } }
        const txt = `${n}/${req} · ${Math.round((k ? eff / k : 0) * 100)}%`;
        c.font = `500 ${fs}px Rajdhani, sans-serif`;
        c.fillStyle = n < req ? '#ff8a9a' : 'rgba(150,230,190,0.9)';
        if (c.measureText(txt).width < r.w - 8) c.fillText(txt, r.x + 4, r.y + 3 + fs + 2);
      }
    }
    // deck numbers
    c.font = `600 9px Orbitron, sans-serif`; c.fillStyle = 'rgba(120,170,230,0.6)'; c.textAlign = 'right';
    if (!g.narrow) {
      for (let i = 0; i < g.C; i++) { const y = g.top - (g.castleBase + (g.C - i) * 0.8) * g.dh + g.cdh / 2 - 4; c.fillText(`D${i + 1}`, g.x0 - 30, y); }
      for (let i = 0; i < g.D; i++) c.fillText(`D${g.C + i + 1}`, g.x0 - 30, g.top + i * g.dh + g.dh / 2 - 4);
    }
    c.textAlign = 'left';
    // title block
    const P = this.sys.game.data;
    c.font = '700 12px Orbitron, sans-serif'; c.fillStyle = '#e8f0ff';
    c.fillText(`${P.ship.name.toUpperCase()}`, 12, 10);
    c.font = '500 12px Rajdhani, sans-serif'; c.fillStyle = 'rgba(160,190,230,0.85)';
    c.fillText(`${g.ch.fullName} · ${g.ch.len * 10} m · ${g.D + g.C} decks · ${st.members.length}/${g.ch.crew[1]} crew`, 12, 26);
    // scale bar
    if (!g.narrow) {
      const px = g.L / (g.ch.len * 10) * 100, bx = this.w - 24 - px, by = this.h - 18;
      c.strokeStyle = 'rgba(120,180,255,0.6)'; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + px, by); c.moveTo(bx, by - 4); c.lineTo(bx, by + 4); c.moveTo(bx + px, by - 4); c.lineTo(bx + px, by + 4); c.stroke();
      c.font = '500 10px Rajdhani, sans-serif'; c.fillStyle = 'rgba(160,190,230,0.8)'; c.fillText('100 m', bx + px / 2 - 12, by - 14);
    }
    c.restore();
  }
}

export function memberTip(m, sys) {
  const d = DEPTS[m.dept], sec = DEPTS[m.section];
  const post = m.officer ? OFFICER_POSTS[m.officer].name : sec.name;
  return `<div class="tn" style="color:${d.color}">${rankAbbr(m)} ${esc(m.name)}</div>`
    + `<div class="tb">${post} · level ${m.lvl} · skill ${skillOf(m)}${m.section !== m.dept ? ` (trained ${d.name})` : ''}</div>`
    + `<div class="tl">Morale ${Math.round(m.morale)}%${m.status === 'wounded' ? ' · <span style="color:#ff8a9a">wounded</span>' : ''}</div>`;
}

const SHORT = { 'Shield Generators': 'Shields', 'Shield Generator': 'Shields', 'Teleporter Room': 'Teleport', 'Damage Control': 'DC', 'DC Station': 'DC', 'Crew Quarters': 'Quarters', 'Observation Lounge': 'Lounge', 'Torpedo Room': 'Torpedo', 'Torpedo Magazine': 'Magazine', 'Sensor Array': 'Sensors', 'Shuttle Bay': 'Shuttles', 'Flight Deck': 'Flight', 'Main Engineering': 'Engineering', 'Science Labs': 'Labs', 'Officers\' Quarters': 'Officers', 'Ready Room': 'Ready Rm', 'Main Bridge': 'Bridge', 'Cargo Hold': 'Cargo' };
function shortName(n) { return SHORT[n] || n.split(' ')[0]; }
function secColor(sec) {
  const d = SECTIONS[sec].depts[0];
  return d ? DEPTS[d].color : sec === 'cargo' ? '#8a9ab8' : sec === 'lounge' ? '#b8a0ff' : '#7aa0d8';
}
// how far forward each main deck fits inside the hull's own sections (u, stern -> bow)
function deckSpans(prof, D, Ht, depth) {
  const d = depth / D;
  return Array.from({ length: D }, (_, r) => {
    const yHi = Ht - r * d, yLo = yHi - d;
    let a = 1, b = 0;
    prof.hullTop.forEach(([z, top], i) => {
      if (top >= yHi - 0.25 * d && prof.hullBottom[i][1] <= yLo + 0.12 * d) { const u = z / prof.L + 0.5; a = Math.min(a, u); b = Math.max(b, u); }
    });
    return b > a ? [a, b] : [0, 1];
  });
}
function grad(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
function grad2(c, x, y, r, a, b) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
