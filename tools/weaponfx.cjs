// Weapon effects review: frames of shots, beams and detonations, stepped in game time (the engine is paused
// for each capture, so a slow software renderer still shows the moment asked for). Dev server on PORT (8420).
//   node tools/weaponfx.cjs gallery <outPrefix>            every shot style in flight, side by side
//   node tools/weaponfx.cjs boom <outPrefix> [dets] [R]    detonations one at a time (comma list; default all)
//   node tools/weaponfx.cjs fight <outPrefix> "prow=photicSpread,turret=phaser,broadside=lance|none" [ms,ms,...]
// Pictures use WebGL (headless WebGPU canvases screenshot black). Sounds: tools/sfx.html.
const { chromium } = require('playwright');
const C = { burst: 0xff8040, flak: 0xffe0a0, plasma: 0x6affc8, ion: 0x58a8ff, nova: 0xd8ecff, photic: 0xff4a1a, quantal: 0x6ab4ff, implode: 0x48ff60, chronal: 0xffc030, phase: 0xff48d0, rift: 0xb46cff };
(async () => {
  const [, , mode = 'gallery', out = 'wfx', a3 = '', a4 = ''] = process.argv;
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&dynres=0`);
  await page.waitForTimeout(10000);
  // a quiet stage far out, interface hidden, camera parked
  await page.evaluate(([mode, dist]) => {
    const g = __game, W = g.world;
    if (g.docked && g.undock) g.undock();
    g.sector.director.update = () => {}; if (g.npcs) g.npcs.update = () => {}; if (g.story) g.story.update = () => {};
    if (g.autoplay) g.toggleAutoplay();
    for (const s of W.ships.slice()) if (s !== g.player) W.removeShip(s);
    const P = g.player; P.position.set(30000, 0, 30000); P.velocity.set(0, 0, 0); P.speed = 0; P.throttle = 0; P.heading = Math.PI / 2;
    if (mode !== 'fight') P.root.visible = false;
    const c = W.cam; c.distTarget = c.distance = dist; c.manualT = 1e9; c.userZoomed = true; c.distFloor = 0;
    c.follow = { position: P.position.clone().add({ x: mode === 'fight' ? 230 : 0, y: 0, z: 0 }) };
    const keep = __engine.renderer.domElement;
    for (const el of document.querySelectorAll('body *')) if (el !== keep && !el.contains(keep) && el.tagName !== 'SCRIPT') el.style.visibility = 'hidden';
  }, [mode, mode === 'gallery' ? 560 : mode === 'boom' ? 320 : 340]);
  await page.waitForTimeout(2500);
  const shot = async (sec, name) => {
    await page.evaluate((s) => { __engine.paused = false; if (window.__hold) __hold(); __engine.simulate(s); __engine.paused = true; }, sec);
    await page.screenshot({ path: `${out}_${name}.png` });
  };
  const run = (fn, arg) => page.evaluate(fn, arg);
  if (mode === 'gallery') {
    await run(async () => {
      const W = __game.world, P = __game.player;
      const { SHOT } = await import('./src/game/data/ordnance.js');
      const col = { tracer: 0xffd080, heavyShell: 0xffb060, flak: 0xffe0a0, nova: 0xfff0a0, laserBolt: 0xff5a7a, plasmaBolt: 0x6affc8, slug: 0xc8b4ff, ionBolt: 0x6ab0ff, missile: 0xffc040, warhead: 0xff7030,
        photic: 0xff4a1a, quantal: 0x6ab4ff, plasmic: 0x48ff60, plasma: 0x6affc8, chronal: 0xffc030, tricore: 0xd8ecff, phase: 0xff48d0, polaric: 0xb46cff, rift: 0xb07aff, antimatter: 0xff60ff };
      Object.keys(SHOT).forEach((k, i) => {
        const orb = SHOT[k].body === 'orb' || k === 'warhead', kind = orb ? 'torpedo' : k === 'missile' ? 'missile' : 'shell';
        const pos = P.position.clone().add({ x: -150 + (i % 2) * 170, y: 0, z: -230 + Math.floor(i / 2) * 46 });
        const p = W.projectiles.spawn({ pos, vel: pos.clone().set(70, 0, 0), kind, team: 9, owner: null, life: 60, color: col[k] || 0xffffff, size: 1.4 * (orb ? 2.4 : k === 'missile' ? 1.1 : 1), len: 12, style: k });
        if (p) p.age = 1;
      });
    });
    await shot(0.6, 'shots');
  } else if (mode === 'boom') {
    const kinds = (a3 || Object.keys(C).join(',')).split(',');
    for (const k of kinds) {
      await run(([k, R, c]) => { __engine.paused = false; const W = __game.world; W.fx.detonate(k, W.player.position, R, c, 0xffffff); }, [k, +(a4 || 45), C[k] || 0xffffff]);
      let last = 0;
      for (const t of [0.02, 0.08, 0.2, 0.45]) { await shot(t - last, `${k}_${t}`); last = t; }
      await run(() => { __engine.paused = false; __engine.simulate(2); });
    }
  } else {
    await run(async ([spec]) => {
      const g = __game, W = g.world;
      const { makeItem, BASES } = await import('./src/game/data/items.js');
      const { ENEMIES } = await import('./src/game/data/enemies.js');
      const want = Object.fromEntries(spec.split(',').filter(Boolean).map((x) => x.split('=')));
      const lo = g.data.ship.loadout;
      for (const k of Object.keys(lo)) { const it = lo[k]; if (!it) continue; const slot = BASES[it.base].slot; if (want[slot] === 'none') delete lo[k]; else if (want[slot]) lo[k] = makeItem(want[slot], 20, 'rare'); }
      const P = g.swapPlayerShip(); P.invuln = true; P.position.set(30000, 0, 30000); P.heading = Math.PI / 2; P.throttle = 0; P.autoFire = true;
      const d = ENEMIES.find((e) => e.faction === 'pirate' && e.sizeIndex === 1);
      const ens = [0, 1, 2].map((k) => { const e = W.spawnDesign(d, 20, P.position.clone().add({ x: 380 + k * 60, y: 0, z: (k - 1) * 160 }), 0); e.persistent = true; e.target = P; return e; });
      window.__hold = () => { for (const e of ens) e.hull = e.maxHull; P.target = ens[0]; };   // targets that never die
    }, [a3]);
    let last = 0;
    for (const t of (a4 || '1000,1500,2000,2500,3000,3500').split(',').map(Number)) { await shot((t - last) / 1000, String(t)); last = t; }
  }
  if (logs.length) console.log([...new Set(logs)].slice(0, 20).join('\n'));
  await browser.close();
})();
