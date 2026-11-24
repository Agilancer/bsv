// Stalemate sweep: one design per AI archetype and size class duels a level-matched captain for
// 60 s (autoplay manoeuvring, and static with guns only). Flags any duel where a side deals no
// damage — the "nobody shoots" failure. Exits non-zero with --gate when one is found.
//   node tools/stalemate.cjs [levels=2,8,20] [--gate]     (dev server on PORT, default 8420)
const { chromium } = require('playwright');
(async () => {
  const levels = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '2,8,20').split(',').map(Number);
  const gate = process.argv.includes('--gate');
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&q=low`);
  await p.waitForTimeout(12000);
  const rows = await p.evaluate(async (levels) => {
    const g = __game, W = g.world;
    if (g.docked && g.undock) g.undock();   // a new captain starts docked at the home station: cast off before measuring
    const { ENEMIES } = await import('./src/game/data/enemies.js');
    const { expectedPlayer } = await import('./src/game/data/balance.js');
    const { starterLoadout } = await import('./src/game/Player.js');
    const { CHASSIS_BY_ID } = await import('./src/game/data/chassis.js');
    const { RNG } = await import('./src/engine/rng.js');
    g.sector.director.update = () => {}; if (g.npcs) g.npcs.update = () => {};
    if (g.planetAuto) g.planetAuto.score = () => 0;
    const archetypes = [...new Set(ENEMIES.map((e) => e.ai))];
    const out = [];
    for (const L of levels) {
      const E = expectedPlayer(L);
      for (const a of archetypes) for (const size of ['small', 'mid', 'large', 'epic']) {
        const d = ENEMIES.find((e) => e.ai === a && e.size === size);
        if (!d) continue;
        for (const stat of [false, true]) {
          for (const s of W.ships.slice()) if (s !== g.player) W.removeShip(s);
          W.projectiles && W.projectiles.clear && W.projectiles.clear();
          g.data.level = L; g.data.ship.level = L; g.data.ship.chassis = `velscour_${E.tier}`;
          g.data.ship.loadout = starterLoadout(CHASSIS_BY_ID[`velscour_${E.tier}`], L, new RNG(L * 7 + 3), 'rare');
          g.data.talents = {};
          if (g.autoplay) g.toggleAutoplay();
          if (g.cancelWarp) g.cancelWarp(); g.moveTarget = null;
          const P = g.swapPlayerShip(); P.invuln = false; P.position.set(40000, 0, 40000); P.heading = 0; P.speed = 0; P.velocity.set(0, 0, 0);
          const en = W.spawnDesign(d, L, P.position.clone().add({ x: 650, y: 0, z: 250 }), Math.PI);
          en.persistent = true; en.target = P; P.target = en;
          if (!stat) { g.toggleAutoplay(); g.data.autoplay = { mode: 'combat' }; } else { P.throttle = 0; P.autoFire = true; }
          let toEnemy = 0, toPlayer = 0, lastE = en.hull + en.shieldTotal(), lastP = P.hull + P.shieldTotal(), firstHitE = -1, firstHitP = -1;
          for (let t = 0; t < 60 && en.alive && P.alive; t += 0.5) {
            __engine.simulate(0.5);
            if (stat) { P.throttle = 0; P.target = en; }
            const e = en.hull + en.shieldTotal(), pp = P.hull + P.shieldTotal();
            if (e < lastE) { toEnemy += lastE - e; if (firstHitE < 0) firstHitE = t; }
            if (pp < lastP) { toPlayer += lastP - pp; if (firstHitP < 0) firstHitP = t; }
            lastE = e; lastP = pp;
            if (P.hull < P.maxHull * 0.3) { P.hull = P.maxHull; lastP = P.hull + P.shieldTotal(); }
            if (en.hull < en.maxHull * 0.05 && t < 20) { en.hull = en.maxHull; lastE = en.hull + en.shieldTotal(); }   // keep it alive long enough to judge
          }
          out.push({ L, ai: a, size, design: d.name, mode: stat ? 'static' : 'move', toEnemy: Math.round(toEnemy), toPlayer: Math.round(toPlayer), firstHitE, firstHitP, dist: Math.round(en.position.distanceTo(P.position)) });
          if (g.autoplay) g.toggleAutoplay();
        }
      }
    }
    return out;
  }, levels);
  // static duels may legitimately be one-sided (artillery and carriers out-range a captain who
  // won't move); the gate is on manoeuvring duels, where both sides must trade fire
  const bad = rows.filter((r) => r.mode === 'move' && (r.toEnemy === 0 || r.toPlayer === 0));
  console.table(rows.map((r) => ({ ...r, flag: r.toEnemy === 0 ? 'PLAYER SILENT' : r.toPlayer === 0 ? 'ENEMY SILENT' : '' })));
  if (errs.length) console.log('errors:', [...new Set(errs)].slice(0, 6).join('\n'));
  await b.close();
  console.log(`${bad.length} silent manoeuvring duels (of ${rows.filter((r) => r.mode === 'move').length}); ${rows.filter((r) => r.mode === 'static' && (r.toEnemy === 0 || r.toPlayer === 0)).length} one-sided static duels (info)`);
  if (gate && bad.length) process.exit(1);
})();
