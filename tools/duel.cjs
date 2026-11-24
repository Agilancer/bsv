// In-engine duel harness: a captain at rank L in the expected hull with rare gear fights
// one enemy of each size class; prints how long each side takes to kill the other.
// expDps is the contract's effective DPS (what enemy pools are sized from), sheetDps its paper DPS.
//   node tools/duel.cjs [levels=5,15,30,50]       (dev server on PORT, default 8420)
const { chromium } = require('playwright');
(async () => {
  const levels = (process.argv[2] || '5,15,30,50').split(',').map(Number);
  const stat = process.argv.includes('--static');   // player holds position, guns only (sustained output)
  const SAMPLES_ARG = +((process.argv.find((a) => a.startsWith('--samples=')) || '--samples=3').split('=')[1]);
  const SIZES_ARG = ((process.argv.find((a) => a.startsWith('--sizes=')) || '--sizes=0,1,2,3,4,5').split('=')[1]).split(',').map(Number);   // e.g. --sizes=4,5 for bosses only
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  await p.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&q=low`);
  await p.waitForTimeout(12000);
  const raw = await p.evaluate(async ([levels, stat, SAMPLES, ONLY]) => {
    const g = __game, W = g.world;
    const { ENEMIES, SIZES } = await import('./src/game/data/enemies.js');
    const { expectedPlayer } = await import('./src/game/data/balance.js');
    const { starterLoadout } = await import('./src/game/Player.js');
    const { RNG } = await import('./src/engine/rng.js');
    const { standardTalents } = await import('./src/game/data/talents.js');
    g.sector.director.update = () => {}; if (g.npcs) g.npcs.update = () => {};
    const out = [];
    for (const L of levels) {
      const E = expectedPlayer(L);
      for (let si = 0; si < 6; si++) for (let sample = 0; sample < SAMPLES; sample++) {
        if (!ONLY.includes(si)) continue;
        for (const s of W.ships.slice()) if (s !== g.player) W.removeShip(s);
        g.data.level = L; g.data.ship.level = L; g.data.ship.chassis = `velscour_${E.tier}`;
        g.data.ship.loadout = starterLoadout({ ...(await import('./src/game/data/chassis.js')).CHASSIS_BY_ID[`velscour_${E.tier}`] }, L, new RNG(L + si + sample * 101), 'rare');
        g.data.talents = standardTalents(L).talents;     // the contract's captain has the standard build
        if (g.autoplay) g.toggleAutoplay(); if (g.cancelWarp) g.cancelWarp(); g.moveTarget = null;
        const P = g.swapPlayerShip(); P.invuln = false; P.position.set(40000, 0, 40000); P.heading = 0; P.speed = 0; P.velocity.set(0, 0, 0);
        // samples: the brawler, then other pirate designs of the size (different roles)
        const pool = ENEMIES.filter((e) => e.faction === 'pirate' && e.sizeIndex === si).sort((a, b) => (b.ai === 'brawler') - (a.ai === 'brawler'));
        const d = pool[sample % pool.length];
        const en = W.spawnDesign(d, L, P.position.clone().add({ x: 500, y: 0, z: 0 }), 0);
        en.persistent = true;
        P.target = en; en.target = P; g.autoplay = null;
        if (!stat) { g.toggleAutoplay(); g.data.autoplay = { mode: 'combat' }; } else { P.throttle = 0; P.autoFire = true; }
        // 90 s window; time-to-kill extrapolated from the damage rates both ways.
        //   gross: damage the enemy lands on the captain (after armour/shields), net: minus his regen
        const startHp = P.maxHull + P.maxShield * 1.2 * 0.6;
        const enPool = en.maxHull + en.maxShield * 1.2;
        let gross = 0;
        const hook = W.combat.damage.bind(W.combat);
        W.combat.damage = (ship, a, ty, pt, src, ws) => { const r = hook(ship, a, ty, pt, src, ws); if (ship === P && r > 0) gross += r; return r; };
        let t = 0, net = 0, toEnemy = 0, lastP = P.hull + P.shieldTotal(), lastE = en.hull + en.shieldTotal(), killedAt = 0;
        const WIN = 75;
        while (t < WIN && P.alive) {
          __engine.simulate(1); t += 1;
          const nowP = P.hull + P.shieldTotal(); if (nowP < lastP) net += lastP - nowP; lastP = nowP;
          if (en.alive) { const nowE = en.hull + en.shieldTotal(); if (nowE < lastE) toEnemy += lastE - nowE; lastE = nowE; }
          else if (!killedAt) { killedAt = t; toEnemy += lastE; }
          if (!en.alive) break;
          if (P.hull < P.maxHull * 0.3) { P.hull = P.maxHull; lastP = P.hull + P.shieldTotal(); }   // keep the duel going
        }
        W.combat.damage = hook;
        const pk = killedAt || +(enPool / Math.max(1e-3, toEnemy / t)).toFixed(1);
        out.push({ L, size: SIZES[si].k, design: d.name, enPool: Math.round(enPool), playerKillsIt: pk, itKillsPlayer: +(startHp / Math.max(1e-3, net / t)).toFixed(1), grossTTK: +(startHp / Math.max(1e-3, gross / t)).toFixed(1), landed: +((gross / t) / Math.max(1, en.balanceDps)).toFixed(2), armor: Math.round(P.armor), regen: Math.round(P.maxHull * (P.hullRegen || 0)), expDps: Math.round(E.effDps), sheetDps: Math.round(E.dps) });
        if (!stat) g.toggleAutoplay();
      }
    }
    return out;
  }, [levels, stat, SAMPLES_ARG, SIZES_ARG]);
  // one row per (level, size): the median of its samples
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const rows = [];
  for (const r of raw) {
    let row = rows.find((x) => x.L === r.L && x.size === r.size);
    if (!row) { row = { ...r, design: r.design, _p: [], _e: [], _g: [], _l: [] }; rows.push(row); } else row.design += ' / ' + r.design;
    row._p.push(r.playerKillsIt); row._e.push(r.itKillsPlayer); row._g.push(r.grossTTK); row._l.push(r.landed);
  }
  for (const row of rows) { row.playerKillsIt = med(row._p); row.itKillsPlayer = med(row._e); row.grossTTK = med(row._g); row.landed = med(row._l); row.design = row.design.slice(0, 40); }
  // contract check: both directions within ±35% of balance.TTK (sizes that can appear at that rank)
  const { TTK, SIZES_MIN } = await p.evaluate(async () => { const B = await import('./src/game/data/balance.js'); const E = await import('./src/game/data/enemies.js'); return { TTK: B.TTK, SIZES_MIN: E.SIZES.map((x) => x.minDanger || 0) }; });
  const SIZE_I = { small: 0, mid: 1, large: 2, epic: 3, legendary: 4, gargantuan: 5 };
  // Single duels are noisy (one design, one seed), so the contract is held per size class: the
  // geometric mean of measured/target across levels within ±35%, and no single duel off by 3x.
  const tol = 0.35, bad = [];
  for (const r of rows) {
    const si = SIZE_I[r.size];
    r.wantP = TTK.playerKills[si]; r.wantE = TTK.enemyKills[si];
    r.rP = +(r.playerKillsIt / r.wantP).toFixed(2); r.rE = +(r.itKillsPlayer / r.wantE).toFixed(2);
    r.rel = (SIZES_MIN[si] || 0) <= r.L + 6;
    r.ok = r.rel ? '' : 'n/a';
  }
  const gm = (a) => Math.exp(a.reduce((x, v) => x + Math.log(Math.max(1e-3, v)), 0) / a.length);
  for (const size of Object.keys(SIZE_I)) {
    const rs = rows.filter((r) => r.size === size && r.rel);
    if (!rs.length) continue;
    const rE = rs.filter((r) => r.playerKillsIt >= 3);   // died before its guns came to bear: no reading
    const mP = gm(rs.map((r) => r.rP)), mE = rE.length ? gm(rE.map((r) => r.rE)) : 1;
    const line = `${size}: you kill it at ${mP.toFixed(2)}x the target time, it kills you at ${mE.toFixed(2)}x`;
    console.log((Math.abs(Math.log(mP)) <= Math.log(1 + tol) && Math.abs(Math.log(mE)) <= Math.log(1 + tol) ? '  ok   ' : '  OUT  ') + line);
    if (Math.abs(Math.log(mP)) > Math.log(1 + tol) || Math.abs(Math.log(mE)) > Math.log(1 + tol)) bad.push(line);
    for (const r of rs) { const far = r.rP > 3 || r.rP < 1 / 3 || (r.playerKillsIt >= 3 && (r.rE > 3 || r.rE < 1 / 3)); r.ok = far ? 'FAR' : 'ok'; if (far) bad.push(`L${r.L} ${size}: you ${r.playerKillsIt}s (want ${r.wantP}), it ${r.itKillsPlayer}s (want ${r.wantE})`); }
  }
  console.table(rows.map(({ L, size, design, playerKillsIt, wantP, rP, itKillsPlayer, grossTTK, wantE, rE, landed, armor, regen, ok }) => ({ L, size, design, playerKillsIt, wantP, rP, itKillsPlayer, grossTTK, wantE, rE, landed, armor, regen, ok })));
  await b.close();
  if (process.argv.includes('--gate')) {
    if (bad.length) { console.log('GATE FAIL (±35% of balance.TTK):\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('GATE PASS');
  }
})();
