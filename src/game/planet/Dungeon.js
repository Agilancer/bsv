// An enterable dungeon level: walls, floor, props and torchlight built from a generated layout,
// stocked with denser packs, elites, a vault or two, rare deposits and an apex at the far end.
// Lives far from the surface in the same planet scene; PlanetMode swaps the ground sampler,
// creature list, interactables and lighting when the explorer goes in or comes back out.
import * as THREE from 'three/webgpu';
import { texture, positionWorld, normalWorld, vec2, vec3, float, abs, smoothstep, mix, sin, fract, max, uv } from 'three/tsl';
import { noiseTexture } from './noiseTex.js';
import { tex } from './ptex.js';
import { RNG } from '../../engine/rng.js';
import { GeoBuilder, rockGeometry } from './geo.js';
import { generateDungeon, DungeonNav, DUNGEON_THEMES, CELL, DUNGEON_ORIGIN } from './dungeonGen.js';
import { Interactables, NODE_AMOUNT } from './Site.js';
import { texturedMat } from './siteModels.js';
import { pickPack, pickBoss, pickEpic } from './enemies.js';

const WALL_H = 12;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const C = (hex, m = 1) => { const c = new THREE.Color(hex); return vec3(c.r * m, c.g * m, c.b * m); };

function propGeo(kind, glow) {
  const b = new GeoBuilder();
  const R = rockGeometry(1, 1.9);
  switch (kind) {
    case 'stalagmite': b.cone(1.2, 6, 0, 0, 0, { color: 0xb0a8a0 }, 7); b.cone(0.7, 3.5, 1.2, 0, 0.5, { color: 0xa09890 }, 6); break;
    case 'crystal': for (let i = 0; i < 4; i++) { const a = i * 1.6; b.cyl(0.4, 0.45, 3 + i * 0.5, Math.cos(a) * 0.6, 1.5 + i * 0.25, Math.sin(a) * 0.6, { color: glow, emit: 1.4 }, 'y', 6, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); } break;
    case 'obelisk': b.box(1.6, 7, 1.6, 0, 3.5, 0, { color: 0x605868 }); for (let i = 0; i < 4; i++) b.box(0.9, 0.15, 0.05, 0, 1.5 + i * 1.3, 0.82, { color: glow, emit: 3 }); b.box(2.2, 0.5, 2.2, 0, 0.25, 0, { color: 0x484050 }); break;
    case 'brazier': b.cyl(0.8, 0.5, 2.2, 0, 1.1, 0, { color: 0x7a6a50 }, 'y', 8); b.cyl(1.0, 0.85, 0.4, 0, 2.3, 0, { color: 0x8a7a58 }, 'y', 10); b.sphere(0.7, 0, 2.6, 0, { color: glow, emit: 4 }, 1, 0.6, 1, 1); break;
    case 'debris': b.box(4, 1.2, 2, 0, 0.6, 0, { color: 0x8a8e98 }, 0.1, 0.4, 0.2); b.box(2.5, 0.8, 3, 1.5, 0.4, 1.5, { color: 0x6a6e78 }, -0.3, 1.1, 0.4); b.box(0.15, 0.15, 2.4, 0, 1.25, 0, { color: glow, emit: 2.5 }, 0.1, 0.4, 0.2); break;
    case 'console': b.box(2.4, 2.2, 1.2, 0, 1.1, 0, { color: 0x50545c }); b.box(2.0, 1.0, 0.05, 0, 1.6, 0.62, { color: glow, emit: 2.4 }, -0.2, 0, 0); break;
    case 'egg': for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; b.sphere(0.9, Math.cos(a) * 1.2, 0.9, Math.sin(a) * 1.2, { color: 0x6a7a40, emit: 0.6 }, 1, 1.3, 1, 1); } b.sphere(0.5, 0, 0.6, 0, { color: glow, emit: 3 }, 1, 1, 1, 1); break;
    case 'mushroom': b.cyl(0.25, 0.35, 3, 0, 1.5, 0, { color: 0xd0c8a8 }, 'y', 6); b.add(new THREE.SphereGeometry(1.4, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), { color: 0x6a4a8a, emit: 0.4 }, b.xf(0, 2.9, 0, 0, 0, 0, 1, 0.5, 1)); b.cyl(1.35, 1.35, 0.08, 0, 2.88, 0, { color: glow, emit: 2.6 }, 'y', 10); break;
    default: b.add(R.clone(), { color: 0xa8a0a0 }, b.xf(0, 0.6, 0, 0, 0, 0, 1.8, 1.2, 1.6));
  }
  return b.build();
}

export class Dungeon {
  constructor(mode, entrance) {
    this.mode = mode;
    this.entrance = entrance;
    this.theme = DUNGEON_THEMES[entrance.theme];
    this.layout = generateDungeon(entrance.seed, entrance.depth);
    this.nav = new DungeonNav(this.layout);
    const B = mode.biome;
    this.glow = this.theme.glow || B.glow;
    this.S = { height: () => 0, ground: () => 0, fluidLevel: -1e9, biome: B, base: () => 0 };
    this.group = new THREE.Group();
    mode.scene.add(this.group);
    this.level = Math.max(1, mode.siteInfo.level + 2 + entrance.depth + Math.floor(mode.survey.hazard / 2));
    this.build();
  }

  build() {
    const M = this.mode, E = M.engine, L = this.layout, nav = this.nav, T = this.theme, B = M.biome;
    const W = L.W, H = L.H;
    const wallTex = T.wall === 'cliff' ? B.tex.cliff : T.wall, floorTex = T.floor === 'flat' ? B.tex.flat : T.floor;
    // floor
    const fg = new THREE.PlaneGeometry(W * CELL, H * CELL, 1, 1); fg.rotateX(-Math.PI / 2);
    const fm = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: T.floor.startsWith('hull') ? 0.4 : 0.05 });
    const p = positionWorld;
    const ft = texture(tex(floorTex), p.xz.mul(0.12)).rgb, ft2 = texture(tex(floorTex), p.xz.mul(0.031).add(0.3)).rgb;
    const n = texture(noiseTexture(), p.xz.mul(0.008)).r;
    fm.colorNode = mix(ft, ft2, 0.4).mul(n.mul(0.4).add(0.85)).mul(T.floor === 'flat' ? C(B.tint) : vec3(1));
    // glowing floor lines for built places
    let fe = M.ground.node(p);
    if (T.glow && T.name !== 'Hive Tunnels') {
      const gx = abs(fract(p.x.mul(1 / 16)).sub(0.5)), gz = abs(fract(p.z.mul(1 / 16)).sub(0.5));
      const lines = smoothstep(0.492, 0.5, max(gx, gz));
      fe = fe.add(C(T.glow, 0.45).mul(lines).mul(sin(E.uTime.mul(1.5).add(p.x.mul(0.05))).mul(0.3).add(0.7)));
    } else if (T.glow) fe = fe.add(C(T.glow, 0.7).mul(smoothstep(0.72, 0.8, n)));
    fm.emissiveNode = fe;
    const floor = new THREE.Mesh(fg, fm);
    floor.position.set(DUNGEON_ORIGIN.x, 0, DUNGEON_ORIGIN.z);
    floor.receiveShadow = true;
    this.group.add(floor);
    // walls: every rock cell that touches a floor cell
    const walls = [];
    const isFloor = (x, y) => x >= 0 && y >= 0 && x < W && y < H && L.grid[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (L.grid[y * W + x]) continue;
      if (isFloor(x + 1, y) || isFloor(x - 1, y) || isFloor(x, y + 1) || isFloor(x, y - 1) || isFloor(x + 1, y + 1) || isFloor(x - 1, y - 1) || isFloor(x - 1, y + 1) || isFloor(x + 1, y - 1)) walls.push([x, y]);
    }
    const wg = new THREE.BoxGeometry(CELL, WALL_H, CELL); wg.translate(0, WALL_H / 2, 0);
    const wm = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: T.wall.startsWith('hull') ? 0.35 : 0.05 });
    let bf = abs(normalWorld).pow(vec3(3)); bf = bf.div(bf.x.add(bf.y).add(bf.z));
    const wt = tex(wallTex), sc = T.wall.startsWith('hull') ? 0.08 : 0.1;
    const tri = texture(wt, p.yz.mul(sc)).rgb.mul(bf.x).add(texture(wt, p.zx.mul(sc)).rgb.mul(bf.y)).add(texture(wt, p.xy.mul(sc)).rgb.mul(bf.z));
    const top = smoothstep(0.5, 0.9, normalWorld.y);
    const wn = texture(noiseTexture(), vec2(p.x.add(p.z).mul(0.012), p.y.mul(0.02))).g;
    wm.colorNode = tri.mul(T.wall === 'cliff' ? C(B.cliffTint) : vec3(1)).mul(wn.mul(0.4).add(0.6)).mul(float(1).sub(top.mul(0.85))).mul(smoothstep(0, 3, p.y).mul(0.4).add(0.6));
    let we = C(this.glow, 0.0);
    if (T.glow) {
      const band = smoothstep(0.08, 0.0, abs(p.y.sub(WALL_H * 0.62))).mul(float(1).sub(top));
      we = C(T.glow, 1.6).mul(band).mul(sin(E.uTime.mul(2).add(p.x.mul(0.1)).add(p.z.mul(0.1))).mul(0.3).add(0.7));
    }
    wm.emissiveNode = we;
    const wmesh = new THREE.InstancedMesh(wg, wm, walls.length);
    walls.forEach(([x, y], i) => {
      const jitter = T.wall === 'cliff' || T.name === 'Hive Tunnels' ? 1 + ((x * 7 + y * 13) % 5) * 0.08 : 1;
      _m.compose(_p.set(nav.worldX(x), 0, nav.worldZ(y)), _q.identity(), _s.set(1, jitter, 1));
      wmesh.setMatrixAt(i, _m);
    });
    wmesh.castShadow = true; wmesh.receiveShadow = true;
    this.group.add(wmesh);
    // natural tunnels: boulders heaped along the wall line break up the block silhouette
    if (T.wall === 'cliff' || T.name === 'Hive Tunnels') {
      const edge = walls.filter(([x, y]) => isFloor(x + 1, y) || isFloor(x - 1, y) || isFloor(x, y + 1) || isFloor(x, y - 1));
      const rm = new THREE.InstancedMesh(rockGeometry(1, 1.7), wm, edge.length);
      const rr = new RNG(L.seed + 3);
      edge.forEach(([x, y], i) => {
        let fx = 0, fz = 0;
        if (isFloor(x + 1, y)) fx += 1; if (isFloor(x - 1, y)) fx -= 1; if (isFloor(x, y + 1)) fz += 1; if (isFloor(x, y - 1)) fz -= 1;
        const s = rr.float(2.6, 4.6);
        _m.compose(_p.set(nav.worldX(x) + fx * 1.2, rr.float(-0.5, 3) , nav.worldZ(y) + fz * 1.2), _q.setFromEuler(_e.set(rr.float(0, 3), rr.float(0, 6), rr.float(0, 3))), _s.set(s, s * rr.float(0.8, 1.6), s));
        rm.setMatrixAt(i, _m);
      });
      rm.castShadow = true; rm.receiveShadow = true;
      this.group.add(rm);
    }
    // props
    const rng = new RNG(L.seed + 5);
    this.torches = [];
    const kinds = T.props;
    const per = {};
    for (const k of kinds) per[k] = [];
    for (const r of L.rooms) {
      const c = nav.roomCenter(r);
      const hw = r.w * CELL / 2 - 3, hh = r.h * CELL / 2 - 3;
      // torches at the corners
      const tk = kinds.includes('brazier') ? 'brazier' : kinds.includes('crystal') ? 'crystal' : kinds[0];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = c.x + sx * hw, z = c.z + sz * hh;
        per[tk].push([x, z, rng.float(0, 6), 1]);
        this.torches.push(new THREE.Vector3(x, 3, z));
      }
      for (let i = 0; i < rng.int(2, 6); i++) {
        const k = rng.pick(kinds);
        const x = c.x + rng.float(-hw, hw) * 0.85, z = c.z + rng.float(-hh, hh) * 0.85;
        if (Math.hypot(x - c.x, z - c.z) < 10) continue;
        per[k].push([x, z, rng.float(0, 6), rng.float(0.8, 1.4)]);
      }
    }
    this.obstacles = [];
    for (const k of kinds) {
      if (!per[k].length) continue;
      const mat = texturedMat(E, k === 'debris' || k === 'console' ? 'hull_graphite' : k === 'obelisk' ? 'pl_granite' : wallTex, 0.25, { tint: 1.2 });
      const mesh = new THREE.InstancedMesh(propGeo(k, this.glow), mat, per[k].length);
      per[k].forEach(([x, z, r, s], i) => { _m.compose(_p.set(x, 0, z), _q.setFromEuler(_e.set(0, r, 0)), _s.setScalar(s)); mesh.setMatrixAt(i, _m); this.obstacles.push({ x, z, r: 1.3 * s }); });
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    // exit portals
    this.exits = [];
    const sc0 = nav.roomCenter(L.start);
    this.exits.push(this.addPortal(sc0.x, sc0.z, 0x58c8ff));
    this.startPos = new THREE.Vector3(sc0.x, 0, sc0.z + 10);
  }

  addPortal(x, z, hex) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.35, 8, 40), new THREE.MeshStandardNodeMaterial({ color: 0x485060, metalness: 0.6, roughness: 0.4, emissive: hex, emissiveIntensity: 0.6 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.8, 40), portalMaterial(this.mode.engine, hex));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.35;
    g.add(ring, disc);
    g.position.set(x, 0, z);
    this.group.add(g);
    return { pos: new THREE.Vector3(x, 0, z), mesh: g, hex };
  }

  // stock the rooms
  populate() {
    const M = this.mode, L = this.layout, nav = this.nav, T = this.theme;
    const rng = new RNG(L.seed + 11);
    const hz = M.survey.hazard, type = M.type;
    const fam = T.families;
    this.site = new Interactables(M);
    this.site.group.visible = true;
    const spawned = [];
    for (const r of L.rooms) {
      const c = nav.roomCenter(r);
      if (r.kind === 'start') continue;
      const hw = r.w * CELL / 2 - 6, hh = r.h * CELL / 2 - 6;
      const at = () => ({ x: c.x + rng.float(-hw, hw), z: c.z + rng.float(-hh, hh) });
      if (r.kind === 'boss') {
        const boss = pickBoss(rng, type, Math.min(5, hz + Math.floor(this.entrance.depth / 2)), 'dungeon', fam);
        const e = M.creatures.spawn(boss, c.x, c.z, this.level + 2);
        if (e) { e.dungeonBoss = true; this.boss = e; spawned.push(e); }
        for (let i = 0; i < 2; i++) { const pk = pickPack(rng, type, hz, 'dungeon', this.level, fam); if (pk) for (let k = 0; k < Math.min(3, pk.count); k++) { const q = at(); spawned.push(M.creatures.spawn(pk.entry, q.x, q.z, pk.level, { elite: pk.elite })); } }
        this.site.addCrate(c.x + 8, c.z - 8, 3);
        this.bossRoom = c;
        continue;
      }
      if (r.kind === 'vault') {
        const ep = pickEpic(rng, type, fam);
        if (ep) spawned.push(M.creatures.spawn(ep, c.x, c.z, this.level + 1));
        this.site.addCrate(c.x - 6, c.z + 4, 2); this.site.addCrate(c.x + 6, c.z + 4, rng.chance(0.3) ? 3 : 2);
        const res = rng.pick(['relic', 'datacore', 'isotope', 'crystal']);
        const a = NODE_AMOUNT[res];
        this.site.addNode(res, c.x, c.z - 8, Math.round(rng.int(a[0], a[1]) * 1.5));
        continue;
      }
      const packs = 1 + (rng.chance(0.35 + hz * 0.08) ? 1 : 0);
      for (let i = 0; i < packs; i++) {
        const pk = pickPack(rng, type, hz, 'dungeon', this.level, fam);
        if (!pk) continue;
        const q = at();
        for (let k = 0; k < pk.count; k++) spawned.push(M.creatures.spawn(pk.entry, q.x + rng.float(-6, 6), q.z + rng.float(-6, 6), pk.level, { elite: pk.elite && k === 0 }));
        if (pk.escort) for (let k = 0; k < pk.escort.count; k++) spawned.push(M.creatures.spawn(pk.escort.entry, q.x + rng.float(-8, 8), q.z + rng.float(-8, 8), pk.level));
      }
      if (rng.chance(0.55)) { const q = at(); this.site.addCrate(q.x, q.z, rng.weighted([[0, 3], [1, 3], [2, 1]])); }
      if (rng.chance(0.6)) {
        const res = rng.weighted([['ore', 3], ['crystal', 3], ['isotope', 2], ['datacore', 1.5], ['relic', 0.8], ['biomass', 1]]);
        const q = at(), a = NODE_AMOUNT[res];
        this.site.addNode(res, q.x, q.z, rng.int(a[0], a[1]));
      }
    }
    for (const e of spawned) if (e) e.home.copy(e.pos);
    this.total = spawned.filter(Boolean).length;
  }

  // navigation helpers (walls, line of sight, flow field toward the explorer)
  steer(p, tx, tz, out) { return this.nav.steer(p, tx, tz, out); }
  collide(p, r) {
    for (const o of this.obstacles) {
      const dx = p.x - o.x, dz = p.z - o.z, R = o.r + r, d2 = dx * dx + dz * dz;
      if (d2 < R * R && d2 > 1e-6) { const d = Math.sqrt(d2); p.x += dx / d * (R - d); p.z += dz / d * (R - d); }
    }
    return this.nav.collide(p, r);
  }
  solid(x, z) { return this.nav.solid(x, z); }

  onBossDown() {
    if (this.cleared) return;
    this.cleared = true;
    const c = this.bossRoom;
    this.exits.push(this.addPortal(c.x, c.z + 12, 0xffd060));
    this.mode.toast(`${this.entrance.name} cleared — exit portal open`, 'epic');
  }

  // keep the room torches near the explorer lit
  update(dt, lights) {
    const V = this.mode.vehicle.position;
    this.lightT = (this.lightT || 0) - dt;
    if (this.lightT <= 0) {
      this.lightT = 0.4;
      const near = this.torches.slice().sort((a, b) => a.distanceToSquared(V) - b.distanceToSquared(V)).slice(0, lights.length);
      lights.forEach((l, i) => { if (near[i]) { l.position.copy(near[i]); l.color.set(this.glow); l.intensity = 90; l.distance = 70; } else l.intensity = 0; });
    }
    for (const x of this.exits) if (Math.random() < 0.3) this.mode.pfx.pillar(x.pos, x.hex, 10, 4, 2);
    if (Math.random() < 0.3) { const t = this.torches[(Math.random() * this.torches.length) | 0]; if (t.distanceToSquared(V) < 90 * 90) this.mode.pfx.ember(_p.copy(t).setY(2.8), this.glow); }
  }

  dispose() { this.mode.scene.remove(this.group); if (this.site) this.site.dispose(); }
}

export function portalMaterial(engine, hex) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const u = uv().sub(0.5), r = u.length().mul(2);
  const swirl = sin(r.mul(18).sub(engine.uTime.mul(5))).mul(0.5).add(0.5);
  m.colorNode = C(hex, 2.2).mul(swirl.mul(0.6).add(0.4)).mul(smoothstep(1.0, 0.2, r)).add(C(0xffffff, 1.5).mul(smoothstep(0.25, 0, r)));
  return m;
}
