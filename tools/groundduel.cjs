// Ground duel harness: the expected explorer (groundBalance.expectedBuild) at level L against one
// creature at a time, sampled per size class x AI archetype, measured two ways:
//   kite   — the planet autopilot fights it (PlanetPilot in duel mode: guns + manoeuvring, no abilities)
//   static — the explorer holds still and fires at it
// Each pairing runs twice: once to time the explorer killing it, once with the explorer's guns off
// to time it killing the explorer (gross damage, hull refilled to keep the duel going).
// Prints measured vs groundBalance.GROUND_TTK and the per-archetype landed share both ways.
//   node tools/groundduel.cjs [levels=5,15,30,50] [--modes=kite,static] [--sizes=0,1,2,3,4,5]
//        [--arch=melee,charger,...] [--samples=1] [--window=24] [--gate] [--json=out.json]
// Dungeon variant: the expected explorer at level L (site level L) runs a dungeon of each depth with
// the full autopilot, and reports kill times against the creatures' paper TTK and damage taken
// against what the engaged creatures' contract dps would deal:
//   node tools/groundduel.cjs 5,15,30 --dungeon[=2,3] [--secs=90] [--gate]
// (dev server on PORT, default 8420)
const { chromium } = require('playwright');
const fs = require('fs');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };

// ---- dungeon variant ----
async function dungeonRuns(cfg) {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  // determinism: one seeded stream from before the first page script (crew, names, everything)
  await p.addInitScript(() => { let a = 0x9E3779B9 >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await p.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&q=low&dynres=0`);
  await p.waitForTimeout(12000);
  const rows = [];
  for (const L of cfg.levels) for (const depth of cfg.dungeon) {
    const r = await p.evaluate(async ({ L, depth, secs }) => {
      const g = __game, E = __engine;
    if (g.docked && g.undock) g.undock();   // a new captain starts docked at the home station: cast off before measuring
      const GB = await import('./src/game/planet/groundBalance.js');
      if (g.sector && g.sector.director) g.sector.director.update = () => {};
    // only the game (which steps the planet mode) and the particle layers keep running: the always-on
    // modules (simulated population, crew, bridge...) tick on timers set by however many real frames this
    // machine drew before now, and they draw from the same Math.random stream as the duel
    for (const s of E.systems) if (s !== g && s.capacity === undefined) { if (s.update) s.update = () => {}; if (s.lateUpdate) s.lateUpdate = () => {}; }
      if (g.autoplay) g.toggleAutoplay();
      if (g.mode === 'planet' && g.planet.current) { g.planet.current.state = 'play'; g.exitMode && g.exitMode(); }
      const M = g.planet.debugDeploy('barren', { hazard: 2, level: L, features: ['nest'] });
      E.simulate(6, 1 / 20);
      const ex = M.ex, B = GB.expectedBuild(L);
      ex.level = L; ex.chassis = B.chassis; if (!ex.owned.includes(B.chassis)) ex.owned.push(B.chassis);
      ex.loadout = B.loadout; ex.inventory = []; M.rebuildVehicle();
      const V = M.vehicle, P = GB.expectedExplorer(L), ehp = V.stats.maxHp + V.stats.maxShield * 0.8;
      const mouth = M.dungeons[0]; mouth.depth = depth;
      M.enterDungeon(mouth);
      await new Promise((res) => setTimeout(res, 1500));
      if (!M.dungeon) return { L, depth, err: 'no dungeon' };
      M.hud.update = () => {};
      let gross = 0, deaths = 0, expected = 0;
      const vdmg = V.damage.bind(V);
      V.damage = (a, pt, src, o) => { const h0 = V.hp, s0 = V.shield, d0 = deaths; const r = vdmg(a, pt, src, o); gross += deaths > d0 ? h0 + s0 * 0.8 : (h0 - V.hp) + (s0 - V.shield) * 0.8; return r; };
      M.onVehicleDestroyed = () => { deaths++; V.alive = true; V.setVisible(true); V.hp = V.stats.maxHp; V.shield = V.stats.maxShield; };
      const first = new Map(), kills = [];
      const hit = M.hitEnemy.bind(M);
      M.hitEnemy = (e, d, pt, o = {}) => { if (!o.selfDestruct && !first.has(e)) first.set(e, E.time); return hit(e, d, pt, o); };
      const kill = M.kill.bind(M);
      M.kill = (e, o = {}) => { const t0 = first.get(e); if (t0 != null && !o.selfDestruct) kills.push({ si: e.def.size, ttk: Math.max(0.1, E.time - t0), paper: e.maxHp / P.dps }); return kill(e, o); };
      g.autoplay = g.autoplay || {}; M.pilot.duel = false; M.pilot.t = 0; M.pilot.runT = 0; M.driver = null;
      let t = 0;
      while (t < secs && M.dungeon) {
        E.simulate(0.5, 1 / 20); t += 0.5;
        for (const e of M.creatures.list) {
          if (!e.alive || e.mode !== 'hunt' || e.under) continue;
          if (Math.hypot(e.pos.x - V.position.x, e.pos.z - V.position.z) > 55) continue;
          // what this creature's contract says it deals per second, against the explorer of its own level
          expected += 0.5 * GB.groundTargets(e.def.size, e.level).dps * e.def.dmgRel / GB.expectedExplorer(e.level).ehp * ehp;
        }
      }
      g.autoplay = null;
      const med = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
      return { L, depth, dLevel: M.dungeon ? M.dungeon.level : null, secs: t, kills: kills.length, deaths,
        ttkRatio: +med(kills.map((k) => k.ttk / k.paper)).toFixed(2), bySize: [0, 1, 2, 3, 4, 5].map((si) => kills.filter((k) => k.si === si).length).join('/'), hullPerMin: +(gross / ehp / t * 60).toFixed(2),
        landed: expected > 0 ? +(gross / expected).toFixed(2) : null };
    }, { L, depth, secs: cfg.secs });
    console.log(JSON.stringify(r));
    rows.push(r);
  }
  await b.close();
  // trivial = the dungeon barely scratches the explorer (under 15% of hull + shield a minute, no
  // deaths); kill times must stay within 3x of the paper TTK either way
  const bad = rows.filter((r) => r.err || (r.hullPerMin < 0.15 && !r.deaths) || r.ttkRatio > 3 || r.ttkRatio < 1 / 3);
  console.table(rows);
  console.log('ttkRatio: median measured kill time (first hit to death, abilities and turrets included) / the creature\'s paper TTK vs this explorer; landed: damage taken / the engaged creatures\' contract dps; hullPerMin: hull+shield lost per minute');
  if (process.argv.includes('--gate')) {
    if (bad.length) { console.log('DUNGEON GATE FAIL:', JSON.stringify(bad)); process.exit(1); }
    console.log('DUNGEON GATE PASS');
  }
}
(async () => {
  const levels = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '5,15,30,50').split(',').map(Number);
  const cfg = {
    levels, modes: arg('modes', 'kite,static').split(','), sizes: arg('sizes', '0,1,2,3,4,5').split(',').map(Number),
    arch: arg('arch', '') ? arg('arch', '').split(',') : null, samples: +arg('samples', 1), win: +arg('window', 24),
    dungeon: process.argv.some((a) => a.startsWith('--dungeon')) ? (arg('dungeon', '2,3') || '2,3').split(',').map(Number) : null,
    secs: +arg('secs', 90),
  };
  if (cfg.dungeon) return dungeonRuns(cfg);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  // determinism: one seeded stream from before the first page script (crew, names, everything)
  await p.addInitScript(() => { let a = 0x9E3779B9 >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await p.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&q=low&dynres=0`);
  await p.waitForTimeout(12000);
  const out = await p.evaluate(async (cfg) => {
    const g = __game, E = __engine;
    if (g.docked && g.undock) g.undock();   // a new captain starts docked at the home station: cast off before measuring
    const { ENEMIES } = await import('./src/game/planet/enemies.js');
    const GB = await import('./src/game/planet/groundBalance.js');
    if (g.sector && g.sector.director) g.sector.director.update = () => {};
    // only the game (which steps the planet mode) and the particle layers keep running: the always-on
    // modules (simulated population, crew, bridge...) tick on timers set by however many real frames this
    // machine drew before now, and they draw from the same Math.random stream as the duel
    for (const s of E.systems) if (s !== g && s.capacity === undefined) { if (s.update) s.update = () => {}; if (s.lateUpdate) s.lateUpdate = () => {}; }
    if (g.autoplay) g.toggleAutoplay();
    const M = g.planet.debugDeploy('barren', { hazard: 1, features: ['nest'] });
    E.simulate(5, 1 / 20);
    // a quiet arena: no camps, lairs, waves, dungeons, crates, lander repairs, HUD redraws
    M.camps.forEach((c) => { c.spawned = true; }); M.lairs.forEach((l) => { l.spawned = true; });
    M.updateThreat = () => {}; M.updateCamps = () => {}; M.updateMouths = () => {}; M.hud.update = () => {};
    M.dungeons.length = 0; M.level.crates.forEach((c) => { c.opened = true; });
    M.lander.position.set(4000, 0, 4000);
    // a flat arena: terrain occlusion is real play, but it makes single duels too noisy to calibrate on
    M.S = M.surfaceS = Object.assign({}, M.S, { height: () => 0, ground: () => 0, fluidLevel: -1e9 });
    const V = M.vehicle, ex = M.ex;
    // gross damage on the explorer, in the contract's units (hull + 0.8 x shield)
    let gross = 0;
    const vdmg = V.damage.bind(V);
    V.damage = (a, pt, src, o) => { const h0 = V.hp, s0 = V.shield; const r = vdmg(a, pt, src, o); gross += (h0 - V.hp) + (s0 - V.shield) * 0.8; return r; };
    let dealt = 0, target = null;
    const hit = M.hitEnemy.bind(M);
    M.hitEnemy = (e, d, pt, o = {}) => { if (e === target && !o.selfDestruct) dealt += Math.min(d, Math.max(0, e.hp)); return hit(e, d, pt, o); };
    M.onVehicleDestroyed = () => { V.hp = V.stats.maxHp; };
    const groups = { melee: 'melee', charger: 'charger', brute: 'brute', kamikaze: 'kamikaze', ranged: 'ranged', support: 'support', sniper: 'sniper', artillery: 'artillery', strafe: 'strafe', burrow: 'burrow', summoner: 'summoner', static: 'static' };
    const rows = [];
    for (const L of cfg.levels) {
      const B = GB.expectedBuild(L);
      ex.level = L; ex.chassis = B.chassis; if (!ex.owned.includes(B.chassis)) ex.owned.push(B.chassis);
      ex.loadout = B.loadout; ex.inventory = [];
      M.rebuildVehicle();
      const P = GB.expectedExplorer(L);
      for (const si of cfg.sizes) {
        const pool = ENEMIES.filter((e) => e.size === si);
        const byAi = {};
        for (const e of pool) (byAi[groups[e.ai] || e.ai] ||= []).push(e);
        for (const [ai, list] of Object.entries(byAi)) {
          if (cfg.arch && !cfg.arch.includes(ai)) continue;
          for (let k = 0; k < cfg.samples; k++) {
            const d = list[(k * 7 + L) % list.length];
            for (const mode of cfg.modes) {
              const run = (shoot, secs) => {
                // every run draws from its own seeded stream (same code => same answer)
                { let a = (L * 7919 + si * 104729 + k * 1299709 + (shoot ? 1 : 2) * 15485863 + mode.length * 32452843) >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
                // ...and from the same clock: the page ran a machine-dependent number of real frames before this
                // script, so game time carries an arbitrary fraction that flips cooldown comparisons by a frame
                E.time = Math.ceil((E.time + 1) / 1000) * 1000; E.uTime.value = E.time;
                M.creatures.list.length = 0; M.shots.clear(); M.timers.length = 0; M.ground.clear();
                // nothing carried over from the previous duel: gun spin and cooldowns, the pilot's stuck/wiggle
                // memory, deployed turrets, buffs, threat
                M.arsenal = new M.arsenal.constructor(M); M.pilot = new M.pilot.constructor(M);
                M.cooldowns = {}; M.dmgBuff = 1; M.threat = 0; M.strikes.length = 0;
                for (const T of M.turrets) M.scene.remove(T.g); M.turrets.length = 0;
                // ...and nothing lying on the ground from the last one: the pilot drives to gear drops in reach, and a
                // field of old loot pulled it out of the fight (the kill time then depended on which duels came before)
                M.level.drops.length = 0; if (M.site && M.site !== M.level) M.site.drops.length = 0;
                V.velocity.set(0, 0, 0);
                if (M.warnings) M.warnings.length = 0;
                V.alive = true; V.setVisible(true); M.state = 'play';
                V.hp = V.stats.maxHp; V.shield = V.stats.maxShield; V.invuln = 0; V.bubble = 0; V.boostT = 0;
                V.place(0, 0, 0);
                const a = Math.random() * Math.PI * 2;
                const spawn = () => { const e = M.creatures.spawn(d, V.position.x + Math.cos(a) * 42, V.position.z + Math.sin(a) * 42, L, { awake: true }); e.mode = 'hunt'; return e; };
                target = spawn();
                M.pilot.duel = true; M.pilot.t = 0;
                if (mode === 'kite') { g.autoplay = g.autoplay || { duel: true }; M.driver = shoot ? null : (ctl) => { ctl.fire = false; }; }
                else {
                  g.autoplay = null;
                  M.driver = (ctl) => { ctl.mx = ctl.mz = 0; ctl.fire = shoot; if (target && target.alive) { M.aimEnemy = target; M.aimPoint.copy(target.pos); } };
                }
                gross = 0; dealt = 0;
                let t = 0, killedAt = 0, spawns = 1, lastSpawn = 0, attacks = 0, dSum = 0, dN = 0;
                const tsp = M.shots.spawn.bind(M.shots), ttel = M.telegraph.bind(M);
                M.shots.spawn = (o) => { if (o.src === target) attacks++; return tsp(o); };
                M.telegraph = (...a) => { attacks += 0.001; return ttel(...a); };
                const step = shoot ? 0.1 : 0.5;
                while (t < secs - 1e-6) {
                  E.simulate(step, 1 / 20); t += step;
                  if (target.alive) { dSum += Math.hypot(target.pos.x - V.position.x, target.pos.z - V.position.z); dN++; }
                  if (V.hp < V.stats.maxHp * 0.35) { V.hp = V.stats.maxHp; V.shield = V.stats.maxShield; }
                  if (!target.alive) {
                    if (shoot && !killedAt && dealt > 0) { killedAt = +t.toFixed(1); break; }
                    // kamikazes: the next one comes in, no sooner than the contract's one per 4 s
                    if (d.ai === 'kamikaze' && t - lastSpawn < 4) continue;
                    target = spawn(); spawns++; lastSpawn = t;
                  }
                }
                M.shots.spawn = tsp; M.telegraph = ttel;
                return { t, killedAt, gross, dealt, maxHp: target.maxHp, spawns, attacks: +attacks.toFixed(3), dist: +(dSum / Math.max(1, dN)).toFixed(1), dodges: M.pilot.dodges || 0 };
              };
              const kWin = Math.min(60, GB.GROUND_TTK.playerKills[si] * 4 + 6);
              const kr = run(true, kWin);
              const er = run(false, si <= 1 ? Math.max(cfg.win, 40) : cfg.win);   // small things hit rarely: a longer look
              const ehp = V.stats.maxHp + V.stats.maxShield * 0.8;
              rows.push({
                L, si, ai, mode, design: d.name, arch: d.archetype, hpRel: d.hpRel,
                you: kr.killedAt || +(kr.maxHp / Math.max(1e-3, kr.dealt / kr.t)).toFixed(1),
                it: er.gross > 0 ? +(ehp / (er.gross / er.t)).toFixed(1) : null,
                wantYou: GB.GROUND_TTK.playerKills[si], wantIt: GB.GROUND_TTK.enemyKills[si],
                dbg: { shots: er.attacks, dist: er.dist, spawns: er.spawns, killDist: kr.dist, killDealt: Math.round(kr.dealt), hp: Math.round(kr.maxHp) },
              });
            }
          }
        }
      }
    }
    M.driver = null; g.autoplay = null;
    return { rows };
  }, cfg);
  const rows = out.rows;
  const SIZES = ['small', 'mid', 'large', 'epic', 'legendary', 'gargantuan'];
  const gm = (a) => (a.length ? Math.exp(a.reduce((x, v) => x + Math.log(Math.max(1e-3, v)), 0) / a.length) : NaN);
  const tol = 0.35, bad = [];
  for (const r of rows) { r.rYou = +(r.you / r.wantYou).toFixed(2); r.rIt = r.it == null ? null : +(r.it / r.wantIt).toFixed(2); }
  console.log('\nPer size (geometric mean of measured/target across levels, archetypes and modes):');
  for (let si = 0; si < 6; si++) {
    const rs = rows.filter((r) => r.si === si);
    if (!rs.length) continue;
    const line = (m) => { const q = rs.filter((r) => !m || r.mode === m); return `you ${gm(q.map((r) => r.rYou)).toFixed(2)}x, it ${gm(q.filter((r) => r.rIt != null).map((r) => r.rIt)).toFixed(2)}x`; };
    const mY = gm(rs.map((r) => r.rYou)), mI = gm(rs.filter((r) => r.rIt != null).map((r) => r.rIt));
    const ok = Math.abs(Math.log(mY)) <= Math.log(1 + tol) && Math.abs(Math.log(mI)) <= Math.log(1 + tol);
    console.log(`  ${ok ? 'ok ' : 'OUT'} ${SIZES[si].padEnd(10)} both: ${line()}   | kite: ${line('kite')}   | static: ${line('static')}`);
    if (!ok) bad.push(`${SIZES[si]}: you ${mY.toFixed(2)}x, it ${mI.toFixed(2)}x of target`);
  }
  // landed share per archetype: contract time / measured time (1 = lands as designed)
  console.log('\nPer archetype (target/measured enemy-kills time, i.e. landed share; kite | static):');
  const ais = [...new Set(rows.map((r) => r.ai))];
  for (const ai of ais) {
    const k = rows.filter((r) => r.ai === ai && r.mode === 'kite' && r.rIt != null), s = rows.filter((r) => r.ai === ai && r.mode === 'static' && r.rIt != null);
    const z = rows.filter((r) => r.ai === ai && r.rIt == null).length;
    console.log(`  ${ai.padEnd(10)} kite ${(1 / gm(k.map((r) => r.rIt))).toFixed(2)}  static ${(1 / gm(s.map((r) => r.rIt))).toFixed(2)}  you-kill ${gm(rows.filter((r) => r.ai === ai).map((r) => r.rYou)).toFixed(2)}x${z ? `  ZERO-DAMAGE x${z}` : ''}`);
  }
  console.log('\nPer design archetype (landed share kite | static | geometric mean -> LANDED multiplier):');
  for (const a of [...new Set(rows.map((r) => r.arch))]) {
    const k = rows.filter((r) => r.arch === a && r.mode === 'kite' && r.rIt != null), s = rows.filter((r) => r.arch === a && r.mode === 'static' && r.rIt != null);
    const kk = 1 / gm(k.map((r) => r.rIt)), ss = 1 / gm(s.map((r) => r.rIt));
    console.log(`  ${a.padEnd(12)} kite ${kk.toFixed(2)}  static ${ss.toFixed(2)}  both ${Math.sqrt(kk * ss).toFixed(2)}`);
  }
  for (const r of rows) {
    const flags = [];
    if (r.it == null && r.ai !== 'support') flags.push('ZERO');
    if (r.mode === 'static' && r.rIt != null && r.rIt < 1 / 4) flags.push('DELETES');
    if (r.mode === 'kite' && r.rIt != null && r.rIt > 4) flags.push('TOOTHLESS');
    // kill time against the design's own target (the size contract x its health share: brutes and
    // turrets are meant to take longer)
    const rD = r.you / (r.wantYou * (r.hpRel || 1));
    // A kiting boss fight is the noisiest cell there is: 60 s of a 75-180 s fight with long legs out of gun
    // range. The same cell (L50 The Last Precursor, same seed) read 134.8 s and 373.7 s depending only on
    // which duels ran before it, so the outlier band for those cells is 4x; everything else stays at 3x.
    // (The balance contract itself is the per-size mean above, which this does not touch.)
    const far = r.mode === 'kite' && r.si >= 4 ? 4 : 3;
    if (rD > far || rD < 1 / far) flags.push('TTK-FAR');
    r.flag = flags.join(' ');
    if (flags.includes('ZERO') || flags.includes('DELETES') || flags.includes('TTK-FAR')) bad.push(`L${r.L} ${SIZES[r.si]} ${r.ai} ${r.mode} (${r.design}): you ${r.you}s/${r.wantYou}, it ${r.it}s/${r.wantIt} ${r.flag}`);
  }
  console.table(rows.map((r) => ({ L: r.L, size: SIZES[r.si], ai: r.ai, mode: r.mode, design: r.design.slice(0, 22), you: r.you, wantYou: r.wantYou, rYou: r.rYou, it: r.it, wantIt: r.wantIt, rIt: r.rIt, flag: r.flag, ...(process.argv.includes('--debug') ? r.dbg : {}) })));
  const jf = arg('json', ''); if (jf) fs.writeFileSync(jf, JSON.stringify(rows, null, 1));
  await b.close();
  if (process.argv.includes('--gate')) {
    if (bad.length) { console.log('GATE FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('GATE PASS');
  }
})();
