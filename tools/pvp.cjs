// Arena harness: the autoplay captain plays N matches of each PvP mode; prints results and win rates.
// The captain is the balance contract's expected one at rank L (as in tools/duel.cjs): expected hull,
// rare gear, standard talents. With --fixed every match is played at the start rating (measures the
// calibration point data.BOT: about half should be wins); without it the rating moves between
// matches as in play and should settle.
//   node tools/pvp.cjs [matches=4] [--levels=5,20,40] [--modes=skirmish,capture,convoy,duel] [--fixed] [--gate]
//   (dev server on PORT, default 8420)
const { chromium } = require('playwright');
(async () => {
  const arg = (k, d) => ((process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1]);
  const N = +(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 4);
  const levels = arg('levels', '5,20,40').split(',').map(Number), modes = arg('modes', 'skirmish,capture,convoy,duel').split(',');
  const fixed = process.argv.includes('--fixed');
  const bot = arg('bot', '') ? arg('bot', '').split(',').map(Number) : null;   // calibration: override data.BOT {kill, die} seconds
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 240)); });
  await p.addInitScript(() => { let a = 0x9E3779B9 >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await p.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&q=low`);
  await p.waitForTimeout(12000);
  const rows = [];
  for (const L of levels) {
    await p.evaluate(async (L) => {
      const g = __game, G = g.guild;
      const { expectedPlayer } = await import('./src/game/data/balance.js');
      const { starterLoadout } = await import('./src/game/Player.js');
      const { CHASSIS_BY_ID } = await import('./src/game/data/chassis.js');
      const { RNG } = await import('./src/engine/rng.js');
      const { standardTalents } = await import('./src/game/data/talents.js');
      const { SHIP_UPGRADES } = await import('./src/game/planet/economy.js');
      g.sector.director.update = () => {};
      if (g.crew) { const i = g.statProviders.indexOf(g.crew.provider); if (i >= 0) g.statProviders[i] = () => ({ dmg: 0.02, hull: 0.03, shield: 0.02 }); }
      const E = expectedPlayer(L);
      for (const s of g.world.ships.slice()) if (s !== g.player) g.world.removeShip(s);
      g.data.level = L; g.data.ship.level = L; g.data.ship.chassis = `velscour_${E.tier}`;
      g.data.ship.loadout = starterLoadout(CHASSIS_BY_ID[`velscour_${E.tier}`], L, new RNG(L * 13 + 1), 'rare');
      g.data.talents = standardTalents(L).talents;
      g.data.refinery = g.data.refinery || { ranks: {}, probe: {} };
      g.data.refinery.ranks = Object.fromEntries(SHIP_UPGRADES.map((u) => [u.k, Math.min(u.max, Math.floor(L * 0.2))]));
      if (g.cancelWarp) g.cancelWarp();
      const P = g.swapPlayerShip(); P.invuln = false; P.position.set(-30000, 0, 30000);
      if (!G.g) G.found('Harness Wardens', 'HRN');
      Object.assign(g.data.pvp, G.D.newPvp());
      if (!g.autoplay) g.toggleAutoplay();
      g.autoplay.extra = g.autoplay.extra.filter((x) => x.name === 'PvP sortie');   // nothing else pulls the captain away
    }, L);
    for (const mode of modes) for (let i = 0; i < N; i++) {
      const r = await p.evaluate(async ([mode, i, L, fixed, bot]) => {
        const g = __game, G = g.guild, pvp = g.data.pvp;
        if (fixed) { pvp.rating = 1000; pvp.duel.rating = 1000; pvp.streak = 0; pvp.games = 20; pvp.duel.games = 20; }
        { let a = (L * 7919 + i * 104729 + mode.length * 1299709) >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
        // abilities mid-cycle (seeded), as when a captain queues between fights
        g.cooldowns = {};
        for (const a of (await import('./src/game/data/abilities.js')).ABILITIES) g.cooldowns[a.k] = __engine.time + Math.random() * 0.6 * g.abilityCd(a);
        if (g.cancelWarp) g.cancelWarp();
        if (bot) { G.D.BOT.kill = bot[0]; G.D.BOT.die = bot[1]; }
        const before = mode === 'duel' ? pvp.duel.rating : pvp.rating;
        const why = G.arena.blocked();
        if (!G.arena.start(mode, { fast: true, quiet: true, oppRating: fixed ? 1000 : undefined })) return { err: why };
        let t = 0; while (G.arena.match && t < 400) { __engine.simulate(1); t++; }
        const l = G.arena.last;
        return { mode, L, res: l.result, score: l.score.join('-'), t: Math.round(l.t), kills: l.pl.kills, deaths: l.pl.deaths, role: l.role || '', hp: l.hp ? l.hp.map((x) => x.toFixed(2)).join('/') : '', rating: before, opp: l.oppRating, delta: l.delta, honour: l.rewards.honour, glass: l.rewards.glass, credits: l.rewards.credits, hung: !!G.arena.match };
      }, [mode, i, L, fixed, bot]);
      rows.push(r);
      process.stdout.write(r.err ? `!${r.err} ` : r.res >= 1 ? 'W' : r.res <= 0 ? 'L' : 'D');
    }
    process.stdout.write(` L${L}\n`);
  }
  await b.close();
  console.table(rows);
  const bad = [];
  const rate = (rs) => rs.reduce((a, r) => a + r.res, 0) / Math.max(1, rs.length);
  for (const mode of modes) {
    const rs = rows.filter((r) => r.mode === mode && !r.err);
    console.log(`${mode.padEnd(9)} win rate ${(100 * rate(rs)).toFixed(0)}% over ${rs.length}  ` + levels.map((L) => `L${L}: ${(100 * rate(rs.filter((r) => r.L === L))).toFixed(0)}%`).join('  ') + `  avg ${Math.round(rs.reduce((a, r) => a + r.t, 0) / Math.max(1, rs.length))}s`);
    if (rs.some((r) => r.hung)) bad.push(`${mode}: a match never ended`);
  }
  const all = rows.filter((r) => !r.err);
  console.log(`overall   win rate ${(100 * rate(all)).toFixed(0)}% over ${all.length}${fixed ? ' (every match at the start rating)' : ' (rating moving)'}`);
  if (errs.length) { console.log('errors:\n ' + [...new Set(errs)].slice(0, 8).join('\n ')); bad.push(`${errs.length} page errors`); }
  if (rows.some((r) => r.err)) bad.push('a match failed to start');
  if (process.argv.includes('--gate')) {
    if (fixed && all.length >= 12 && (rate(all) < 0.3 || rate(all) > 0.7)) bad.push(`win rate ${(100 * rate(all)).toFixed(0)}% at equal rating is outside 30-70%`);
    if (bad.length) { console.log('GATE FAIL: ' + bad.join('; ')); process.exit(1); }
    console.log('GATE PASS');
  }
})();
