// Fast-forward the real story runtime to an ending: read every briefing, take a choice, wait for each set piece to stage,
// then credit the step. Checks the chain, the choices and the set pieces all run; it does not play the fights.
//   node tools/storyff.cjs [choice 0|1|2] [--gate]     (dev server on :8420; exit 1 on a stuck step, missing set piece or page error)
const { chromium } = require('playwright');
(async () => {
  const pickIdx = +(process.argv[2] || 0);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto('http://localhost:8420/index.html?play&new&webgl&q=low&dynres=0');
  await p.waitForFunction(() => window.__game && __game.player, null, { timeout: 120000 });
  await p.waitForTimeout(800);
  const out = await p.evaluate(async (pickIdx) => {
    const g = __game, log = [], story = await import('./src/game/quests/story.js');
    const brief = () => { const e = document.getElementById('storyBrief'); return e && e.classList.contains('show') ? e : null; };
    const read = () => { let n = 0; while (brief() && n++ < 40) { const e = brief(); if (e.classList.contains('choice')) { const o = [...e.querySelectorAll('.sb-opt')].filter((x) => !x.disabled); if (!o.length) return 'no options'; o[Math.min(pickIdx, o.length - 1)].click(); } else e.querySelector('.sb-next').click(); } return null; };
    g.skipTutorial(); if (g.docked) g.undock(); g.data.level = 60; g.data.credits = 1e6; g.sector.director.update = () => {};
    const s = g.story.state(); let guard = 0, setpieces = 0, steps = 0, stuck = null;
    while (!s.complete && guard++ < 500) {
      __engine.simulate(0.6); const r = read(); if (r) { stuck = r; break; }
      for (const o of g.world.ships.slice()) if (o.alive && o !== g.player && g.world.hostile(g.player, o) && !o.storyTag) g.world.removeShip(o);
      if (!s.q) continue;
      const st = story.resolveStep(s.cur, s.choices);
      if (st && st.setpiece && st.setpiece.type !== 'pursuit' && !s.q._ff) {
        // let the set piece stage (clear sea, not docked, in the right system), then credit the step
        let seen = false; if (st.in || st.at) { const sys = story.sysByName(st.in || (st.at && st.at.sys)); if (sys && g.data.system !== sys.id) { g.enterSystem(sys.id); if (g.docked) g.undock(); g.sector.director.update = () => {}; } }
        for (let i = 0; i < 60 && !seen; i++) { __engine.simulate(0.5); read(); for (const o of g.world.ships.slice()) if (o.alive && o !== g.player && g.world.hostile(g.player, o) && !o.storyTag) g.world.removeShip(o); seen = g.world.ships.some((o) => o.alive && o.storyTag === s.cur); }
        s.q && (s.q._ff = true); if (seen) setpieces++; else log.push('NO SET PIECE for ' + s.cur + ' (' + st.setpiece.type + ')');
        for (const o of g.world.ships.slice()) if (o.alive && o.storyTag) g.world.removeShip(o);
      }
      if (s.q) { const id = s.cur; s.q.progress = s.q.n; g.story.complete ? g.story.complete() : null; steps++; if (s.cur === id && s.q) { stuck = 'cannot complete ' + id; break; } }
    }
    return JSON.stringify({ steps, setpieces, ending: s.ending, complete: s.complete, done: s.done.length, choices: s.choices, cur: s.cur, wait: s.wait, stuck, guard, log });
  }, pickIdx);
  console.log(out); console.log(errs.slice(0, 5).join('\n') || 'no errors');
  await b.close();
  const r = JSON.parse(out);
  if (process.argv.includes('--gate') && (!r.complete || r.stuck || r.log.length || errs.length)) process.exit(1);
})();
