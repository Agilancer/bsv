// In-game review shots of hangar wings: the captain in a big carrier of one yard against enemy carriers.
//   node tools/craftscene.cjs <out.png> [yard=velscour] [tier=9] [faction=pirate] [dist=260] [secs=14] [w=1600] [h=900]
// The captain's hull carries fighter, bomber and drone bays; two enemy carriers of the faction launch their own
// wings. Nothing else runs (director, npcs frozen); the captain is invulnerable. Dev server on PORT (8420).
const { chromium } = require('playwright');
(async () => {
  const [, , out = 'craftscene.png', yard = 'velscour', tier = '9', faction = 'pirate', dist = '260', secs = '14', w = '1600', h = '900'] = process.argv;
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&dynres=0`);
  await page.waitForTimeout(14000);
  const info = await page.evaluate(async ([yard, tier, faction, dist]) => {
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
    const bays = ['fighters', 'bombers', 'drones', 'fighters'];
    for (let i = 0; i < (ch.slots.hangar || 0); i++) lo[`hangar:${i}`] = makeItem(bays[i % bays.length], L, 'rare', new RNG(9 + i));
    g.data.ship.loadout = lo;
    if (g.autoplay) g.toggleAutoplay();
    const P = g.swapPlayerShip(); P.invuln = true; P.position.set(40000, 0, 40000); P.heading = 0.4; P.speed = 0; P.velocity.set(0, 0, 0);
    const pool = ENEMIES.filter((e) => e.faction === faction && e.weapons.hangar && e.weapons.hangar.length && e.sizeIndex <= 3)
      .sort((a, b) => (b.ai === 'carrier') - (a.ai === 'carrier') || b.sizeIndex - a.sizeIndex);
    const ens = [];
    pool.slice(0, 2).forEach((d, k) => {
      const e = W.spawnDesign(d, L, P.position.clone().add({ x: 520 + k * 160, y: 0, z: -200 + k * 380 }), 0);
      e.persistent = true; e.invuln = true; e.target = P; ens.push(e);
    });
    P.target = ens[0];
    P.throttle = 0; P.autoFire = false;   // the wings fight; the guns hold so the scene lasts
    g.cam.distTarget = g.cam.distance = +dist; g.cam.manualT = 1e9;
    // hold the view on the captain's ship (no framing pull toward the fight)
    Object.defineProperty(g.cam, 'frameWith', { get: () => null, set: () => {} });
    return { player: id, len: P.dims.L, enemies: ens.map((e) => `${e.name} ${e.dims.L.toFixed(0)} long (${e.chassis.yard})`) };
  }, [yard, tier, faction, dist]);
  console.log(JSON.stringify(info));
  // let the wings launch and close in: step the sim (headless frames are slow), in chunks so timers fire
  for (let t = 0; t < +secs; t += 2) await page.evaluate(() => __engine.simulate(2));
  // the interface off: just the scene
  await page.addStyleTag({ content: 'body > *:not(canvas):not(#game):not(#gl){display:none!important} #ui,#hud,#overlay,.win,.toast,#ticker{display:none!important}' });
  await page.waitForTimeout(2500);
  const n = await page.evaluate(() => { const c = __game.world.hangars.craft; const k = {}; for (const x of c) k[x.line + '/' + x.kind] = (k[x.line + '/' + x.kind] || 0) + 1; return k; });
  console.log(JSON.stringify(n));
  await page.screenshot({ path: out, timeout: 180000 });
  console.log(logs.slice(0, 20).join('\n'));
  await browser.close();
})();
