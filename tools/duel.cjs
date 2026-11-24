// In-engine duel harness: a captain at rank L in the expected hull with rare gear fights
// one enemy of each size class; prints how long each side takes to kill the other.
// expDps is the contract's effective DPS (what enemy pools are sized from), sheetDps its paper DPS.
//   node tools/duel.cjs [levels=5,15,30,50]       (dev server on PORT, default 8420)
const { chromium } = require('playwright');
(async () => {
  const levels = (process.argv[2] || '5,15,30,50').split(',').map(Number);
  const stat = process.argv.includes('--static');   // player holds position, guns only (sustained output)
  const SAMPLES_ARG = +((process.argv.find((a) => a.startsWith('--samples=')) || '--samples=5').split('=')[1]);
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
    const { SHIP_UPGRADES } = await import('./src/game/planet/economy.js');
    g.sector.director.update = () => {}; if (g.npcs) g.npcs.update = () => {};
    const { ABILITIES } = await import('./src/game/data/abilities.js');
    const out = [];
    for (const L of levels) {
      const E = expectedPlayer(L);
      for (let si = 0; si < 6; si++) for (let sample = 0; sample < SAMPLES; sample++) {
        if (!ONLY.includes(si)) continue;
        for (const s of W.ships.slice()) if (s !== g.player) W.removeShip(s);
        g.data.level = L; g.data.ship.level = L; g.data.ship.chassis = `velscour_${E.tier}`;
        g.data.ship.loadout = starterLoadout({ ...(await import('./src/game/data/chassis.js')).CHASSIS_BY_ID[`velscour_${E.tier}`] }, L, new RNG(L + si + sample * 101), 'rare');
        g.data.talents = standardTalents(L).talents;     // the contract's captain has the standard build
        // ...and the refinery ranks balance.expectedExtras assumes (crew comes from the live crew)
        g.data.refinery = g.data.refinery || { ranks: {}, probe: {} };
        g.data.refinery.ranks = Object.fromEntries(SHIP_UPGRADES.map((u) => [u.k, Math.min(u.max, Math.floor(L * 0.2))]));
        if (g.autoplay) g.toggleAutoplay(); if (g.cancelWarp) g.cancelWarp(); g.moveTarget = null;
        const P = g.swapPlayerShip(); P.invuln = false; P.position.set(40000, 0, 40000); P.heading = 0; P.speed = 0; P.velocity.set(0, 0, 0);
        // deterministic: every duel draws from its own seeded stream (crits, AI choices, specials),
        // so the gate gives the same answer for the same code
        { let a = (L * 7919 + si * 104729 + sample * 1299709) >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
        // warm start: abilities mid-cycle (seeded), as in the middle of real play — a fresh duel would
        // otherwise open with every cooldown ready and delete mid-size ships before they fire
        g.cooldowns = {};
        for (const a of ABILITIES) g.cooldowns[a.k] = __engine.time + Math.random() * g.abilityCd(a);
        // samples: the brawler, then other pirate designs of the size (different roles)
        const pool = ENEMIES.filter((e) => e.faction === 'pirate' && e.sizeIndex === si).sort((a, b) => (b.ai === 'brawler') - (a.ai === 'brawler'));
        const d = pool[sample % pool.length];
        // small ships come in packs: three of them (targets scale: you kill all three, they share the kill)
        const N = si === 0 ? 3 : 1;
        const ens = [];
        for (let k = 0; k < N; k++) { const e = W.spawnDesign(d, L, P.position.clone().add({ x: 500, y: 0, z: (k - (N - 1) / 2) * 120 }), 0); e.persistent = true; e.target = P; ens.push(e); }
        P.target = ens[0]; g.autoplay = null;
        if (!stat) { g.toggleAutoplay(); g.data.autoplay = { mode: 'combat' }; } else { P.throttle = 0; P.autoFire = true; }
        // 75 s window; time-to-kill extrapolated from the damage rates both ways.
        //   gross: damage the enemies land on the captain (after armour/shields), net: minus his regen
        const startHp = P.maxHull + P.maxShield * 1.2 * 0.6;
        const poolOf = (e) => e.maxHull + e.maxShield * 1.2, hpOf = (e) => (e.alive ? e.hull + e.shieldTotal() : 0);
        const enPool = ens.reduce((a, e) => a + poolOf(e), 0);
        let gross = 0;
        const hook = W.combat.damage.bind(W.combat);
        W.combat.damage = (ship, a, ty, pt, src, ws) => { const r = hook(ship, a, ty, pt, src, ws); if (ship === P && r > 0) gross += r; return r; };
        let t = 0, net = 0, lastP = P.hull + P.shieldTotal(), killedAt = 0, firing = 0;
        const WIN = 75;
        while (t < WIN && P.alive) {
          __engine.simulate(1); t += 1;
          const nowP = P.hull + P.shieldTotal(); if (nowP < lastP) net += lastP - nowP; lastP = nowP;
          if (ens.some((e) => e.alive)) firing = t;                     // seconds the enemy side was still in the fight
          if (!P.target || !P.target.alive) P.target = ens.find((e) => e.alive) || null;
          if (ens.every((e) => !e.alive)) { killedAt = t; break; }
          if (P.hull < P.maxHull * 0.3) { P.hull = P.maxHull; lastP = P.hull + P.shieldTotal(); }   // keep the duel going
        }
        W.combat.damage = hook;
        const left = ens.reduce((a, e) => a + hpOf(e), 0);
        const pk = killedAt || +(enPool / Math.max(1e-3, (enPool - left) / t)).toFixed(1);
        // the enemy side's reading only counts the time it was alive; under 3 s there is none
        const span = Math.max(1, firing);
        const reading = span >= 3;
        const bd = ens.reduce((a, e) => a + (e.balanceDps || 0), 0);
        out.push({ L, size: SIZES[si].k, design: d.name + (N > 1 ? ' x' + N : ''), enPool: Math.round(enPool), playerKillsIt: pk, itKillsPlayer: reading ? +(startHp / Math.max(1e-3, net / span)).toFixed(1) : null, grossTTK: reading ? +(startHp / Math.max(1e-3, gross / span)).toFixed(1) : null, landed: reading ? +((gross / span) / Math.max(1, bd)).toFixed(2) : null, armor: Math.round(P.armor), regen: Math.round(P.maxHull * (P.hullRegen || 0)), expDps: Math.round(E.effDps), sheetDps: Math.round(E.dps), N });
        if (!stat) g.toggleAutoplay();
      }
    }
    return out;
  }, [levels, stat, SAMPLES_ARG, SIZES_ARG]);
  // one row per (level, size): the median of its samples
  const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
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
    const N = r.N || 1;
    r.wantP = TTK.playerKills[si] * N; r.wantE = +(TTK.enemyKills[si] / N).toFixed(1);
    r.rP = +(r.playerKillsIt / r.wantP).toFixed(2); r.rE = r.itKillsPlayer == null ? null : +(r.itKillsPlayer / r.wantE).toFixed(2);
    r.rel = (SIZES_MIN[si] || 0) <= r.L + 6;
    r.ok = r.rel ? '' : 'n/a';
  }
  const gm = (a) => Math.exp(a.reduce((x, v) => x + Math.log(Math.max(1e-3, v)), 0) / a.length);
  for (const size of Object.keys(SIZE_I)) {
    const rs = rows.filter((r) => r.size === size && r.rel);
    if (!rs.length) continue;
    const rE = rs.filter((r) => r.rE != null);   // died before its guns came to bear: no reading
    if (!rE.length) { bad.push(`${size}: no enemy-side reading at any level (they die before firing)`); continue; }
    const mP = gm(rs.map((r) => r.rP)), mE = gm(rE.map((r) => r.rE));
    const line = `${size}: you kill it at ${mP.toFixed(2)}x the target time, it kills you at ${mE.toFixed(2)}x`;
    console.log((Math.abs(Math.log(mP)) <= Math.log(1 + tol) && Math.abs(Math.log(mE)) <= Math.log(1 + tol) ? '  ok   ' : '  OUT  ') + line);
    if (Math.abs(Math.log(mP)) > Math.log(1 + tol) || Math.abs(Math.log(mE)) > Math.log(1 + tol)) bad.push(line);
    for (const r of rs) { const far = r.rP > 3 || r.rP < 1 / 3 || (r.rE != null && (r.rE > 3 || r.rE < 1 / 3)); r.ok = far ? 'FAR' : r.rE == null ? 'no reading' : 'ok'; if (far) bad.push(`L${r.L} ${size}: you ${r.playerKillsIt}s (want ${r.wantP}), it ${r.itKillsPlayer}s (want ${r.wantE})`); }
  }
  console.table(rows.map(({ L, size, design, playerKillsIt, wantP, rP, itKillsPlayer, grossTTK, wantE, rE, landed, armor, regen, ok }) => ({ L, size, design, playerKillsIt, wantP, rP, itKillsPlayer, grossTTK, wantE, rE, landed, armor, regen, ok })));
  await b.close();
  if (process.argv.includes('--gate')) {
    if (bad.length) { console.log('GATE FAIL (±35% of balance.TTK):\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('GATE PASS');
  }
})();
