// In-engine duel harness: a captain at rank L in the expected hull with rare gear fights
// one enemy of each size class; prints how long each side takes to kill the other.
// expDps is the contract's effective DPS (what enemy pools are sized from), sheetDps its paper DPS.
//   node tools/duel.cjs [levels=5,15,30,50]       (dev server on PORT, default 8420)
const { chromium } = require('playwright');
(async () => {
  const levels = (process.argv[2] || '5,15,30,50').split(',').map(Number);
  const stat = process.argv.includes('--static');   // player holds position, guns only (sustained output)
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  await p.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&q=low`);
  await p.waitForTimeout(12000);
  const rows = await p.evaluate(async ([levels, stat]) => {
    const g = __game, W = g.world;
    const { ENEMIES, SIZES } = await import('./src/game/data/enemies.js');
    const { expectedPlayer } = await import('./src/game/data/balance.js');
    const { starterLoadout } = await import('./src/game/Player.js');
    const { RNG } = await import('./src/engine/rng.js');
    g.sector.director.update = () => {}; if (g.npcs) g.npcs.update = () => {};
    const out = [];
    for (const L of levels) {
      const E = expectedPlayer(L);
      for (let si = 0; si < 6; si++) {
        for (const s of W.ships.slice()) if (s !== g.player) W.removeShip(s);
        g.data.level = L; g.data.ship.level = L; g.data.ship.chassis = `velscour_${E.tier}`;
        g.data.ship.loadout = starterLoadout({ ...(await import('./src/game/data/chassis.js')).CHASSIS_BY_ID[`velscour_${E.tier}`] }, L, new RNG(L + si), 'rare');
        g.data.talents = {};
        if (g.autoplay) g.toggleAutoplay(); if (g.cancelWarp) g.cancelWarp(); g.moveTarget = null;
        const P = g.swapPlayerShip(); P.invuln = false; P.position.set(40000, 0, 40000); P.heading = 0; P.speed = 0; P.velocity.set(0, 0, 0);
        const d = ENEMIES.find((e) => e.faction === 'pirate' && e.sizeIndex === si && e.ai === 'brawler') || ENEMIES.find((e) => e.faction === 'pirate' && e.sizeIndex === si);
        const en = W.spawnDesign(d, L, P.position.clone().add({ x: 500, y: 0, z: 0 }), 0);
        en.persistent = true;
        P.target = en; en.target = P; g.autoplay = null;
        if (!stat) { g.toggleAutoplay(); g.data.autoplay = { mode: 'combat' }; } else { P.throttle = 0; P.autoFire = true; }
        // measure: how long the player takes to kill it, and how long it takes to kill an invulnerable-ish player
        const startHp = P.maxHull + P.shieldTotal();
        let t = 0, dmgToPlayer = 0, lastHull = P.hull + P.shieldTotal();
        while (en.alive && P.alive && t < 360) {
          __engine.simulate(1);
          t += 1;
          const now = P.hull + P.shieldTotal(); if (now < lastHull) dmgToPlayer += lastHull - now; lastHull = now;
          if (P.hull < P.maxHull * 0.3) { P.hull = P.maxHull; lastHull = P.hull + P.shieldTotal(); }   // keep the duel going
        }
        const pdps = dmgToPlayer / Math.max(1, t);
        out.push({ L, size: SIZES[si].k, design: d.name, enPool: Math.round(en.maxHull + en.maxShield * 1.2), playerKillsIt: en.alive ? '>' + t : t, playerDps: Math.round((en.maxHull + en.maxShield * 1.2) / Math.max(1, t)), enDps: Math.round(pdps), wantDps: Math.round(en.balanceDps), itKillsPlayer: +(startHp / Math.max(1, pdps)).toFixed(1), expDps: Math.round(E.effDps), sheetDps: Math.round(E.dps) });
        if (!stat) g.toggleAutoplay();
      }
    }
    return out;
  }, [levels, stat]);
  // contract check: both directions within ±35% of balance.TTK (sizes that can appear at that rank)
  const { TTK, SIZES_MIN } = await p.evaluate(async () => { const B = await import('./src/game/data/balance.js'); const E = await import('./src/game/data/enemies.js'); return { TTK: B.TTK, SIZES_MIN: E.SIZES.map((x) => x.minDanger || 0) }; });
  const SIZE_I = { small: 0, mid: 1, large: 2, epic: 3, legendary: 4, gargantuan: 5 };
  const tol = 0.35, bad = [];
  for (const r of rows) {
    const si = SIZE_I[r.size];
    r.wantP = TTK.playerKills[si]; r.wantE = TTK.enemyKills[si];
    const pk = typeof r.playerKillsIt === 'number' ? r.playerKillsIt : 999;
    r.rP = +(pk / r.wantP).toFixed(2); r.rE = +(r.itKillsPlayer / r.wantE).toFixed(2);
    const relevant = (SIZES_MIN[si] || 0) <= r.L + 6;
    r.ok = !relevant ? 'n/a' : (Math.abs(r.rP - 1) <= tol && Math.abs(r.rE - 1) <= tol ? 'ok' : 'OUT');
    if (r.ok === 'OUT') bad.push(`L${r.L} ${r.size}: you kill it in ${pk}s (want ${r.wantP}), it kills you in ${r.itKillsPlayer}s (want ${r.wantE})`);
  }
  console.table(rows.map(({ L, size, design, playerKillsIt, wantP, rP, itKillsPlayer, wantE, rE, ok }) => ({ L, size, design, playerKillsIt, wantP, rP, itKillsPlayer, wantE, rE, ok })));
  await b.close();
  if (process.argv.includes('--gate')) {
    if (bad.length) { console.log('GATE FAIL (±35% of balance.TTK):\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('GATE PASS');
  }
})();
