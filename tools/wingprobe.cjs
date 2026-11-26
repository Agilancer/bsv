// Hangar wing behaviour, measured: the captain in a big carrier (fighter, bomber and drone bays) fights a target
// that does not die, then sails on with nothing to shoot. Prints, per craft kind, how far it keeps from what it
// works round (the target in a fight; its carrier otherwise), how fast it swings round that ship (deg/s of
// bearing in that ship's own frame: an orbit shows here), its speed relative to it, and the wing's damage; then
// engages the drive and times the recall (`recall`: craft out, s until the last is aboard, s until the spool starts).
//   node tools/wingprobe.cjs [yard=velscour] [tier=9] [fight=40] [idle=40] [--trace=out.png] [--bays=fighters,bombers,drones]
//   (dev server on PORT, default 8420; the hull's hangar slots take the bays in order, repeating)
// --trace draws every craft's track top-down (fight, then idle), coloured by kind, with the carrier and the target.
const { chromium } = require('playwright');
(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const [yard = 'velscour', tier = '9', fight = '40', idle = '40'] = args;
  const trace = (process.argv.find((a) => a.startsWith('--trace=')) || '').split('=')[1];
  const bays = ((process.argv.find((a) => a.startsWith('--bays=')) || '--bays=fighters,bombers,drones,fighters').split('=')[1]).split(',');
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.addInitScript(() => { let a = 0x9E3779B9 >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await page.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&q=low&dynres=0`);
  await page.waitForTimeout(12000);
  await page.evaluate(async ([yard, tier, bays]) => {
    const g = __game, W = g.world;
    if (g.docked && g.undock) g.undock();
    g.sector.director.update = () => {}; if (g.npcs) g.npcs.update = () => {};
    const { ENEMIES } = await import('./src/game/data/enemies.js');
    const { CHASSIS_BY_ID } = await import('./src/game/data/chassis.js');
    const { makeItem } = await import('./src/game/data/items.js');
    const { starterLoadout } = await import('./src/game/Player.js');
    const { RNG } = await import('./src/engine/rng.js');
    for (const s of W.ships.slice()) if (s !== g.player) W.removeShip(s);
    W.hangars.clear();
    const L = 40, id = `${yard}_${tier}`, ch = CHASSIS_BY_ID[id];
    g.data.level = L; g.data.ship.level = L; g.data.ship.chassis = id;
    const lo = starterLoadout({ ...ch }, L, new RNG(5), 'rare');
    for (let i = 0; i < (ch.slots.hangar || 0); i++) lo[`hangar:${i}`] = makeItem(bays[i % bays.length], L, 'rare', new RNG(9 + i));
    g.data.ship.loadout = lo;
    if (g.autoplay) g.toggleAutoplay();
    const P = g.swapPlayerShip(); P.invuln = true; P.position.set(40000, 0, 40000); P.heading = 0.4; P.speed = 0; P.velocity.set(0, 0, 0);
    P.throttle = 0; P.autoFire = false;
    for (const w of P.weapons) if (w.hp.type !== 'hangar') w.cd = 1e9;   // the guns hold: only the wings fight
    const d = ENEMIES.filter((e) => e.sizeIndex === 2 && !(e.weapons.hangar && e.weapons.hangar.length))[0];
    const e = W.spawnDesign(d, L, P.position.clone().add({ x: 600, y: 0, z: 250 }), 0);
    e.persistent = true; e.provoked = true; e.target = P; e.maxHull = e.hull = 1e9;
    P.target = e;
    window.__probe = { e, dmg: {}, rows: {}, tr: [], id: 0, k: 0 };
    const dmg = W.combat.damage.bind(W.combat);
    W.combat.damage = (ship, amount, type, point, source, ws) => {
      const r = dmg(ship, amount, type, point, source, ws);
      if (ws && ws.craft && source === P) __probe.dmg[ws.craft] = (__probe.dmg[ws.craft] || 0) + (r || 0);
      return r;
    };
  }, [yard, tier, bays]);
  // one sample every 0.1 s of sim: bearing of each craft in its reference ship's frame
  const run = async (secs, phase) => {
    for (let t = 0; t < secs; t += 2) {
      await page.evaluate(([phase]) => {
        const g = __game, W = g.world, P = g.player, pr = __probe;
        for (let k = 0; k < 20; k++) {
          __engine.simulate(0.1);
          for (const c of W.hangars.craft) {
            if (!c.alive || c.owner !== P) continue;
            const ref = phase === 'fight' && !['drone', 'tender', 'decoy'].includes(c.kind) && pr.e.alive ? pr.e : P;
            const dx = c.pos.x - ref.position.x, dz = c.pos.z - ref.position.z;
            const s = Math.sin(-ref.heading), co = Math.cos(-ref.heading);
            const rx = dx * co + dz * s, rz = -dx * s + dz * co;
            const ang = Math.atan2(rx, rz), dist = Math.hypot(dx, dz);
            const rv = Math.hypot(c.vel.x - ref.velocity.x, c.vel.z - ref.velocity.z);
            const key = phase + ':' + c.kind;
            const row = pr.rows[key] ||= { n: 0, dist: 0, rate: 0, rv: 0, fast: 0 };
            if (c._pa != null && c._pref === ref) {
              const da = Math.abs(Math.atan2(Math.sin(ang - c._pa), Math.cos(ang - c._pa))) / 0.1 * 180 / Math.PI;
              row.n++; row.dist += dist; row.rate += da; row.rv += rv; if (da > 30 && dist < 400) row.fast++;
            }
            c._pa = ang; c._pref = ref;
          }
          if (++pr.k % 2 === 0) {
            const row = [phase, P.position.x, P.position.z, P.heading, pr.e.alive ? pr.e.position.x : null, pr.e.alive ? pr.e.position.z : null];
            for (const c of W.hangars.craft) if (c.alive && c.owner === P) { c._id ??= ++pr.id; row.push([c._id, c.kind, +c.pos.x.toFixed(1), +c.pos.z.toFixed(1), c.state]); }
            pr.tr.push(row);
          }
        }
      }, [phase]);
    }
  };
  await run(+fight, 'fight');
  const mid = await page.evaluate(() => { const c = __game.world.hangars.craft.filter((x) => x.owner === __game.player); return c.length; });
  await page.evaluate(() => { const g = __game; __probe.e.persistent = false; g.world.removeShip(__probe.e); g.player.target = null; g.player.throttle = 0.6; g.player.rudder = 0; });
  await run(+idle / 2, 'idle');
  await page.evaluate(() => { __game.player.rudder = 0.6; });
  await run(+idle / 2, 'idle');
  const out = await page.evaluate(([fight]) => {
    const pr = __probe, rows = {};
    for (const [k, r] of Object.entries(pr.rows)) if (r.n) rows[k] = { samples: r.n, dist: +(r.dist / r.n).toFixed(0), degPerS: +(r.rate / r.n).toFixed(1), relSpeed: +(r.rv / r.n).toFixed(0), fastShare: +(r.fast / r.n).toFixed(2) };
    const dps = {}; for (const [k, v] of Object.entries(pr.dmg)) dps[k] = +(v / fight).toFixed(1);
    const left = __game.world.hangars.craft.filter((x) => x.owner === __game.player).map((x) => x.kind + ':' + (x.state || ''));
    return { rows, dps, left, tr: pr.tr };
  }, [+fight]);
  // the drive engaged: how long the wing takes to come aboard before the spool starts
  const recall = await page.evaluate(() => {
    const g = __game, P = g.player, H = g.world.hangars, out = H.airborne(P), t0 = __engine.time;
    if (!g.warpTo(P.position.clone().add({ x: 9000, y: 0, z: 9000 }))) return { out, refused: true };
    let aboard = null;
    for (let i = 0; i < 160; i++) {
      __engine.simulate(0.25);
      if (aboard == null && !H.airborne(P)) aboard = +(__engine.time - t0).toFixed(1);
      const w = g.warpState();
      if (!w || w.phase !== 'align') return { out, aboard, spool: +(__engine.time - t0).toFixed(1) };
    }
    return { out, aboard, spool: null };
  });
  const tr = out.tr; delete out.tr;
  console.log(JSON.stringify({ craftAfterFight: mid, ...out, recall }, null, 1));
  if (trace) await draw(browser, tr, trace);
  if (logs.length) console.log(logs.slice(0, 10).join('\n'));
  await browser.close();
})();

// two panels (fight, idle), each fitted to what moved in it; a track fades in from its start
async function draw(browser, tr, file) {
  const COL = { fighter: '#5fb0ff', bomber: '#ffa040', drone: '#7affb0', decoy: '#c08cff', gunship: '#ffe060', torpboat: '#ff6080', tender: '#40e0c0', frigate: '#ffffff' };
  const panels = [];
  for (const phase of ['fight', 'idle']) {
    let rows = tr.filter((r) => r[0] === phase);
    if (!rows.length) continue;
    // the fight is drawn in the target's frame (centred on it, north up): runs read as passes through it
    if (phase === 'fight') rows = rows.filter((r) => r[4] != null).map((r) => { const ox = r[4], oz = r[5]; return [r[0], r[1] - ox, r[2] - oz, r[3], 0, 0, ...r.slice(6).map((c) => [c[0], c[1], c[2] - ox, c[3] - oz, c[4]])]; });
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    const grow = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    for (const r of rows) { grow(r[1], r[2]); if (r[4] != null) grow(r[4], r[5]); for (const c of r.slice(6)) grow(c[2], c[3]); }
    const pad = 40, S = 760 / Math.max(x1 - x0, z1 - z0, 200);
    const X = (x) => pad + (x - x0) * S, Y = (z) => pad + (z1 - z) * S;
    const tracks = {}, el = [];
    for (const r of rows) for (const c of r.slice(6)) (tracks[c[0]] ||= { kind: c[1], pts: [] }).pts.push([c[2], c[3]]);
    const line = (pts, col, w, op) => `<polyline fill="none" stroke="${col}" stroke-width="${w}" stroke-opacity="${op}" points="${pts.map((p) => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}"/>`;
    el.push(line(rows.map((r) => [r[1], r[2]]), '#8090a0', 6, 0.5));
    const tp = rows.filter((r) => r[4] != null).map((r) => [r[4], r[5]]);
    if (tp.length) el.push(line(tp, '#ff4040', 6, 0.5));
    for (const t of Object.values(tracks)) el.push(line(t.pts, COL[t.kind] || '#fff', 1.2, 0.85));
    const last = rows[rows.length - 1];
    el.push(`<circle cx="${X(last[1])}" cy="${Y(last[2])}" r="5" fill="#8090a0"/>`);
    el.push(`<text x="12" y="22" fill="#cde" font-family="monospace" font-size="16">${phase === 'fight' ? 'fight, relative to the target' : 'idle, world frame'} (${(rows.length * 0.2).toFixed(0)} s, ${(1 / S).toFixed(2)} u/px)</text>`);
    panels.push(`<svg xmlns="http://www.w3.org/2000/svg" width="840" height="840" style="background:#0a0e16">${el.join('')}</svg>`);
  }
  const legend = Object.entries(COL).map(([k, c]) => `<span style="color:${c};margin-right:14px">${k}</span>`).join('') + '<span style="color:#8090a0">carrier</span> <span style="color:#ff4040">target</span>';
  const page = await browser.newPage({ viewport: { width: 1700, height: 900 } });
  await page.setContent(`<body style="margin:0;background:#05070b;font:14px monospace"><div style="padding:6px 10px">${legend}</div><div style="display:flex;gap:10px">${panels.join('')}</div></body>`);
  await page.screenshot({ path: file, fullPage: true });
}
