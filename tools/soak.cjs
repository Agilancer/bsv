// Autoplay soak: a fresh captain on autoplay for N simulated minutes. Reports kills per minute,
// time share per autoplay state, the longest a single goal ran, and errors. Exits non-zero when
// the pacing contract is broken (used as a gate: `node tools/soak.cjs 10 --gate`).
//   node tools/soak.cjs [minutes=10] [--gate] [--space]   (dev server on PORT, default 8420)
//   the shipped configuration (planet runs included); --space removes the planet goal
const { chromium } = require('playwright');
(async () => {
  const minutes = +(process.argv[2] || 10);
  const gate = process.argv.includes('--gate');
  const keepPlanet = !process.argv.includes('--space');
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 240)); });
  await p.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&q=low`);
  await p.waitForTimeout(12000);
  await p.evaluate((keepPlanet) => {
    const g = __game;
    if (!keepPlanet && g.planetAuto) g.planetAuto.score = () => 0;
    g.toggleAutoplay();
    window.__soak = { states: {}, goalRun: {}, goalMax: {}, kills0: g.data.kills, perMin: [], lastKills: g.data.kills, t: 0, warps: 0, warping: false, chase: 0 };
  }, keepPlanet);
  const step = 5;
  for (let t = 0; t < minutes * 60; t += step) {
    await p.evaluate((step) => {
      const g = __game, S = window.__soak;
      for (let k = 0; k < step * 4; k++) {
        __engine.simulate(0.25);
        const A = g.autoplay; if (!A) continue;
        // the drive is for real distances: count the autopilot's warps; and time spent trailing a ship that is running
        const wp = !!(g.isWarping && g.isWarping()); if (wp && !S.warping) { S.warps++; const ws = g.warpState && g.warpState(); const why = (ws && ws.kind === 'jump' ? 'jump · ' : '') + (A.state === 'goal' && A.goal ? A.goal.name : A.state); S.warpWhy = S.warpWhy || {}; S.warpWhy[why] = (S.warpWhy[why] || 0) + 1; } S.warping = wp;
        const tg = g.player && g.player.target; if (g.mode === 'space' && A.state === 'combat' && tg && tg._run && !tg._atk && tg.position.distanceTo(g.player.position) > 700) S.chase += 0.25;
        const st = g.mode !== 'space' ? g.mode : A.state === 'goal' && A.goal ? 'goal:' + A.goal.name : A.state === 'patrol' && A.waiting ? 'wave-gap' : A.state === 'patrol' && A.travel ? 'travel' : A.state;
        S.states[st] = (S.states[st] || 0) + 0.25;
        if (st === 'patrol') {
          // why patrolling: no live zone (all cooling) or still on the way to one
          const D = g.sector.director, live = D && D.nearestLive({ pos: g.player.position, game: g });
          const why = !live ? 'none-live' : g.isWarping && g.isWarping() ? 'warping' : 'to-zone ' + (live.pos.distanceTo(g.player.position) > 3200 ? '>3.2k' : live.pos.distanceTo(g.player.position) > 1800 ? '1.8-3.2k' : '<1.8k') + (live.active ? ' active' : '');
          S.patrol = S.patrol || {}; S.patrol[why] = (S.patrol[why] || 0) + 0.25;
        }
        const gn = A.state === 'goal' && A.goal ? A.goal.name : null;
        for (const k2 of Object.keys(S.goalRun)) if (k2 !== gn) { S.goalMax[k2] = Math.max(S.goalMax[k2] || 0, S.goalRun[k2]); delete S.goalRun[k2]; }
        if (gn) S.goalRun[gn] = (S.goalRun[gn] || 0) + 0.25;
      }
      S.t += step;
      if (S.t % 60 === 0) { S.perMin.push(g.data.kills - S.lastKills); S.lastKills = g.data.kills; }
    }, step);
    await p.waitForTimeout(30);   // let real-time timers (planetfall, toasts) run
  }
  const r = await p.evaluate(() => {
    const g = __game, S = window.__soak;
    for (const [k, v] of Object.entries(S.goalRun)) S.goalMax[k] = Math.max(S.goalMax[k] || 0, v);
    return { warps: S.warps, warpWhy: S.warpWhy, chase: S.chase, patrol: S.patrol, kills: g.data.kills - S.kills0, perMin: S.perMin, states: S.states, goalMax: S.goalMax, level: g.data.level, credits: g.data.credits, system: g.data.system, deaths: g.data.deaths || 0 };
  });
  const total = Object.values(r.states).reduce((a, b) => a + b, 0) || 1;
  console.log(`soak ${minutes} min · kills ${r.kills} (${(r.kills / minutes).toFixed(1)}/min) · rank ${r.level} · ${r.credits} ¢ · system ${r.system} · deaths ${r.deaths}`);
  console.log('kills per minute:', r.perMin.join(' '));
  console.log(`warps: ${r.warps} (${(r.warps / minutes).toFixed(2)} per minute) ${JSON.stringify(r.warpWhy || {})} · trailing a runner: ${Math.round(r.chase)} s`);
  console.log('time share:', Object.entries(r.states).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / total).toFixed(0)}%`).join(' · '));
  if (r.patrol) console.log('patrol breakdown (s):', JSON.stringify(Object.fromEntries(Object.entries(r.patrol).map(([k, v]) => [k, Math.round(v)]))));
  console.log('longest goal run (s):', JSON.stringify(Object.fromEntries(Object.entries(r.goalMax).map(([k, v]) => [k, Math.round(v)]))));
  if (errs.length) console.log('errors:\n ' + [...new Set(errs)].slice(0, 8).join('\n '));
  await b.close();
  if (gate) {
    const bad = [];
    // patrol = idle (nothing to do); travel = warping or sailing to a fight, signal or waking zone.
    // Space pacing is judged on space time; the ground gets its own share check.
    const ground = (r.states.planet || 0) / total, spaceT = Math.max(1, total - (r.states.planet || 0));
    const patrol = (r.states.patrol || 0) / spaceT, between = patrol + (r.states.travel || 0) / spaceT;
    const kpm = r.kills / (spaceT / 60);
    // the drive is used sparingly (under one warp a minute), and the captain does not trail runners across the system
    if (r.warps / minutes > 1) bad.push(`${(r.warps / minutes).toFixed(2)} warps per minute > 1`);
    if (r.chase / spaceT > 0.08) bad.push(`trailing a fleeing ship ${(100 * r.chase / spaceT).toFixed(0)}% of space time > 8%`);
    if (kpm < 2) bad.push(`kills per space-minute ${kpm.toFixed(1)} < 2`);
    if (patrol > 0.25) bad.push(`idle patrol ${(100 * patrol).toFixed(0)}% of space time > 25%`);
    if (between > 0.4) bad.push(`patrol+travel ${(100 * between).toFixed(0)}% of space time > 40%`);
    if (ground > 0.3) bad.push(`planet share ${(100 * ground).toFixed(0)}% > 30%`);
    for (const [k, v] of Object.entries(r.goalMax)) if (v > 240) bad.push(`goal "${k}" ran ${Math.round(v)} s > 240`);
    if (errs.length) bad.push(`${errs.length} page errors`);
    if (bad.length) { console.log('GATE FAIL: ' + bad.join('; ')); process.exit(1); }
    console.log('GATE PASS');
  }
})();
