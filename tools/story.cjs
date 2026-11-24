// Story / naming / tutorial walk-through (dev server on PORT, default 8420).
//   node tools/story.cjs manual [outDir]   title → name the captain → docked start → each tutorial step by hand →
//                                          Act I from real events → a choice → save → reload → still remembered
//   node tools/story.cjs auto [minutes=6]  ?play&new, autoplay on at once: tutorial waved through, story followed
//   node tools/story.cjs mobile [outDir]   360x740 touch viewport: creation form, briefing, Story tab
// Exits non-zero when a check fails.
const { chromium } = require('playwright');
const mode = process.argv[2] || 'manual';
const base = `http://localhost:${process.env.PORT || 8420}/index.html`;
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`); if (!ok) fails.push(what); };

// helpers that run in the page
const lib = () => {
  window.T = {
    sim(s) { __engine.simulate(s); },
    tut() { return __game.data.tutorial; },
    brief() { const e = document.getElementById('storyBrief'); return e && e.classList.contains('show') ? { kind: e.querySelector('.sb-kind').textContent, title: e.querySelector('.sb-title').textContent, who: e.querySelector('.sb-who b').textContent, text: e.querySelector('.sb-text').textContent, choice: e.classList.contains('choice'), opts: [...e.querySelectorAll('.sb-opt b')].map((b) => b.textContent) } : null; },
    readAll() { const out = []; let g = 0; while (T.brief() && !T.brief().choice && g++ < 30) { out.push(T.brief().who + ': ' + T.brief().text.slice(0, 60)); document.querySelector('#storyBrief .sb-next').click(); } return out; },
    story() { const s = __game.story.state(); return { cur: s.cur, wait: s.wait, pending: s.pending, done: s.done.slice(), choices: { ...s.choices }, prog: s.q ? `${s.q.progress}/${s.q.n}` : null, obj: s.q && s.q.obj, act: s.act }; },
    // destroy hostile ships with real damage so every kill goes through the game's own events
    killAll(pred, max = 99) { const g = __game, W = g.world; let n = 0; for (const o of W.ships.slice()) { if (!o.alive || o.team === 1 || n >= max || (pred && !pred(o))) continue; W.combat.damage(o, 1e9, 'kinetic', o.position.clone(), g.player, null); if (!o.alive) n++; } return n; },
    spawn(name, n = 1) { const g = __game, d = g.world.constructor && null; const E = g.world.ships; const des = window.__designs[name]; for (let i = 0; i < n; i++) g.world.spawnDesign(des, 1, g.player.position.clone().add({ x: 500 + i * 90, y: 0, z: 300 }), 0); },
    dockAt(i) { const g = __game, st = g.stations[i]; if (g.docked === st) return true; if (g.docked) g.undock(); g.player.position.copy(st.dockPoint(g.player.position)); g.dockNow(st); return g.docked === st; },
  };
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const mobile = mode === 'mobile';
  const ctx = await browser.newContext(mobile ? { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 640 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  const shot = async (name) => { const dir = process.argv[3] && isNaN(+process.argv[3]) ? process.argv[3] : '.'; await page.screenshot({ path: `${dir}/${name}.png`, timeout: 120000 }).catch((e) => console.log('shot failed', name, e.message)); };
  const ev = (f, a) => page.evaluate(f, a);
  const ready = async () => { await page.waitForFunction(() => window.__game && __game.data && __game.story && __game.player, null, { timeout: 240000 }); await page.addScriptTag({ content: `(${lib.toString()})()` }); await page.evaluate(async () => { const m = await import('./src/game/data/enemies.js'); window.__designs = Object.fromEntries(m.ENEMIES.map((e) => [e.name, e])); }); };

  if (mode === 'auto') {
    const minutes = +(process.argv[3] || 6);
    await page.goto(`${base}?play&new&webgl&q=low`);
    await ready();
    const first = await ev(() => { const g = __game; return { docked: !!g.docked, tut: g.data.tutorial, name: g.data.name, ship: g.data.ship.name }; });
    check(first.docked && first.tut === 0, `?play&new starts docked, tutorial at step 1 (${JSON.stringify(first)})`);
    check(first.name === 'Captain' && first.ship === 'DSV Velscour', 'default names kept for ?play&new');
    await ev(() => __game.toggleAutoplay());
    const log = [];
    for (let t = 0; t < minutes * 60; t += 10) {
      const r = await ev(() => { T.sim(10); const g = __game, s = g.story.state(); return { tut: g.data.tutorial, docked: !!g.docked, cur: s.cur, wait: s.wait, done: s.done.length, pend: s.pending, kills: g.data.kills, lvl: g.data.level, mode: g.mode, goal: g.autoplay && g.autoplay.goal ? g.autoplay.goal.name : g.autoplay && g.autoplay.state, sys: g.data.system, ch: JSON.stringify(s.choices) }; });
      const line = `t=${t + 10}s tut=${r.tut} docked=${r.docked} story=${r.cur || '(wait ' + r.wait + ')'} done=${r.done} pend=${r.pend} kills=${r.kills} lvl=${r.lvl} sys=${r.sys} ${r.mode}/${r.goal} ${r.ch}`;
      if (log[log.length - 1] !== line) console.log(line);
      log.push(r);
      await page.waitForTimeout(20);
    }
    const end = log[log.length - 1];
    check(log.find((r) => r.tut >= 10), 'autoplay is waved through the tutorial');
    check(!log.slice(3).every((r) => r.docked), 'autoplay does not sit docked');
    check(end.done >= 2, `autoplay completes story steps (${end.done} done, on ${end.cur || end.wait})`);
    check(end.kills >= minutes * 2, `kills keep coming (${end.kills})`);
  } else {
    // ---------------------------------------------------------------- title and creation
    await page.goto(`${base}?webgl&q=low`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('#titleMenu', { state: 'visible', timeout: 240000 });
    if (mobile) await page.tap('#btnNew'); else await page.click('#btnNew');
    await page.waitForSelector('#titleCreate', { state: 'visible' });
    const pre = await ev(() => ({ c: document.getElementById('tcCaptain').value, s: document.getElementById('tcShip').value }));
    check(pre.c.length > 2 && pre.s.length > 2, `creation step pre-fills a suggestion (${pre.c} / ${pre.s})`);
    await page.click('#tcShipDice');
    await page.fill('#tcCaptain', '<b>Ada</b>   Merrow<script>');
    await page.fill('#tcShip', 'Reasonable Doubt');
    await page.dispatchEvent('#tcCaptain', 'input');
    console.log('  note:', await ev(() => document.getElementById('tcNote').textContent));
    await shot('01-creation');
    await page.fill('#tcCaptain', 'Ada Merrow');
    await page.click('#tcGo');
    await ready();
    const st0 = await ev(() => { const g = __game; return { name: g.data.name, ship: g.data.ship.name, docked: g.docked && g.docked.name, tut: g.data.tutorial, hud: document.querySelector('#status .name') && document.querySelector('#status .name').textContent, pname: g.player.name }; });
    check(st0.name === 'Ada Merrow' && st0.ship === 'DSV Reasonable Doubt', `names taken: ${st0.name} / ${st0.ship}`);
    check(st0.docked === 'Citadel Velscour' && st0.tut === 0, `new game starts docked at ${st0.docked}`);
    await ev(() => T.sim(1));
    const b0 = await ev(() => T.brief());
    check(b0 && /ARRIVAL/.test(b0.kind) && /Ada Merrow/.test(b0.text), `arrival briefing names the captain: ${b0 && b0.who + ': ' + b0.text.slice(0, 70)}`);
    await page.waitForTimeout(1500);
    await shot('02-docked-arrival');
    if (mobile) {
      await ev(() => T.readAll());
      await ev(() => { __game.skipTutorial(); T.sim(6); });
      await page.waitForTimeout(800);
      const b = await ev(() => T.brief());
      check(b && /NEW ORDERS/.test(b.kind), `story briefing on a phone: ${b && b.title}`);
      await shot('03-briefing');
      const fit = await ev(() => { const r = document.getElementById('storyBrief').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
      check(fit, 'briefing panel fits 360 px');
      await ev(() => { T.readAll(); __game.undock(); __game.quests.openStory(); });
      await page.waitForTimeout(600);
      await shot('04-story-tab');
      const fit2 = await ev(() => { const w = document.getElementById('quests'); return w.scrollWidth <= w.clientWidth + 2; });
      check(fit2, 'Story tab has no horizontal overflow at 360 px');
    } else {
      console.log('  arrival:', (await ev(() => T.readAll())).length, 'pages');
      // ---------------------------------------------------------------- tutorial, by hand
      const step = async (label, act, want) => { await ev(act); await ev(() => T.sim(0.5)); const t = await ev(() => T.tut()); check(t >= want, `tutorial ${want}/10 ← ${label} (now ${t})`); };
      check((await ev(() => document.getElementById('objectives').textContent)).includes('station board'), 'objectives panel shows step 1 while docked');
      await page.waitForTimeout(500);
      await shot('03-tutorial-station');
      await step('open Services and Quests tabs', () => { document.querySelector('#station [data-tab="services"]').click(); document.querySelector('#station [data-tab="quests"]').click(); }, 1);
      await step('Undock button', () => document.getElementById('stUndock').click(), 2);
      await step('take the helm (sail order)', () => { const g = __game; g.moveTarget = g.player.position.clone().add({ x: 400, y: 0, z: 300 }); }, 3);
      // the staged skirmish arrives a few seconds after the helm lesson
      // (two are staged; the station's guns and our own may sink one before we look, so watch the whole window)
      const pir = await ev(() => { let most = 0; for (let i = 0; i < 16; i++) { T.sim(0.5); most = Math.max(most, __game.world.ships.filter((o) => o.alive && o.faction === 'pirate').length); } return most; });
      check(pir >= 2, `pirate skirmish staged (${pir} pirates on the scope at once)`);
      await step('broadside', () => { const g = __game, s = g.player; let ok = false; for (let i = 0; i < 400 && !ok; i++) { g.cycleTarget(); if (s.target) { const t = s.target.position; s.heading = Math.atan2(t.x - s.position.x, t.z - s.position.z) + Math.PI / 2; } ok = g.useAbility('volley'); if (!ok) T.sim(0.1); } }, 4);
      await step('kill a pirate', () => T.killAll((o) => o.faction === 'pirate', 1), 5);
      await step('loot', () => { const g = __game; T.killAll((o) => o.faction === 'pirate'); for (let i = 0; i < 120 && !g._tut.looted; i++) { const d = g.world.loot.drops.find((x) => x.type === 'item'); if (d) { g.player.position.copy(d.pos); } else { T.spawn('Cutthroat', 1); T.sim(0.3); T.killAll((o) => o.faction === 'pirate'); } T.sim(0.3); } }, 6);
      await step('equip an item from the hold', () => { const g = __game; g.equip(g.data.inventory[0]); }, 7);
      await step('dock and sell', () => { const g = __game; T.dockAt(0); g.sellItem(g.data.inventory[0]); }, 8);
      await step('accept a quest from the board', () => { const g = __game; g.openStationTab('quests'); document.querySelector('#station [data-qtake]').click(); }, 9);
      await step('open the galaxy map', () => { __game.command('galaxy'); T.sim(0.2); __game.ui.toggle('galaxy', false); }, 10);
      // ---------------------------------------------------------------- Act I from real events
      await ev(() => { __game.undock(); T.sim(6); });
      let s = await ev(() => T.story());
      check(s.cur === 'a1_fees', `story begins after the tutorial: ${s.cur} — ${s.obj}`);
      await page.waitForTimeout(1200);
      await shot('04-briefing');
      console.log('  brief:', JSON.stringify(await ev(() => T.readAll())));
      // six pirates, killed two at a time
      // (an ally or a station gun can beat us to one of them, and that kill is rightly not ours: keep going until six are)
      for (let i = 0; i < 6 && !(await ev(() => T.story().done.includes('a1_fees'))); i++) await ev(() => { T.spawn('Cutthroat', 2); T.sim(0.3); T.killAll((o) => o.faction === 'pirate'); T.sim(0.3); });
      s = await ev(() => T.story());
      if (!s.done.includes('a1_fees')) console.log('  state:', JSON.stringify(s), JSON.stringify(await ev(() => ({ kills: __game.data.kills, docked: !!__game.docked, mode: __game.mode, brief: !!T.brief(), busy: __game.story.busy(), pirates: __game.world.ships.filter((o) => o.alive && o.faction === 'pirate').length, tut: __game.data.tutorial }))));
      check(s.done.includes('a1_fees'), `a1_fees completes on 6 real pirate kills (${JSON.stringify(s.done)})`);
      console.log('  debrief:', JSON.stringify(await ev(() => T.readAll())));
      s = await ev(() => { T.sim(6); T.readAll(); return T.story(); });
      check(s.cur === 'a1_hum', `next step: ${s.cur}`);
      await ev(() => __game.modes.bridge());   // the bridge loads on first use
      await page.waitForFunction(() => __game.mode === 'bridge', null, { timeout: 240000 });
      await ev(() => { T.sim(1); __game.exitMode(); T.sim(1); T.readAll(); T.sim(6); T.readAll(); });
      s = await ev(() => T.story());
      check(s.done.includes('a1_hum') && s.cur === 'a1_crate', `bridge visit completes a1_hum → ${s.cur}`);
      await ev(() => { T.dockAt(1); T.sim(1); T.readAll(); __game.undock(); T.sim(6); T.readAll(); });
      s = await ev(() => T.story());
      check(s.done.includes('a1_crate') && s.cur === 'a1_saltwound', `docking at the Waypoint completes a1_crate → ${s.cur}`);
      // the named boss is staged for the step
      // (a set piece holds off while another fight is on, so clear the sea first; the named ship is an ordinary
      // hull now, so step in short hops and catch it before the guns do)
      const boss = await ev(() => { T.killAll((o) => !o.storyTag); let o = null; for (let i = 0; i < 40 && !o; i++) { T.sim(0.5); o = __game.world.ships.find((x) => x.alive && x.storyTag === 'a1_saltwound'); if (!o) T.killAll((x) => !x.storyTag); } if (o) { o.invuln = true; } return o ? { name: o.name, elite: o.elite, lvl: o.level } : null; });
      check(boss && /Salt Wound/.test(boss.name), `set piece: ${boss && boss.name} (elite ${boss && boss.elite}, level ${boss && boss.lvl})`);
      const other = await ev(() => { T.killAll((o) => !o.storyTag); T.sim(0.3); const p = T.story().prog; const o = __game.world.ships.find((x) => x.alive && x.storyTag === 'a1_saltwound'); if (o) o.invuln = false; return p; });
      check(other === '0/1', 'escorts do not count for the boss step');
      await ev(() => { T.killAll((o) => o.storyTag === 'a1_saltwound'); T.sim(0.5); T.readAll(); T.sim(1); });
      const c = await ev(() => T.brief());
      check(c && c.choice && c.opts.length === 2, `a choice is offered: ${c && c.opts.join(' | ')}`);
      await page.waitForTimeout(600);
      await shot('05-choice');
      await ev(() => [...document.querySelectorAll('#storyBrief .sb-opt')].find((b) => /Keep it/.test(b.textContent)).click());
      s = await ev(() => { T.readAll(); return T.story(); });
      check(s.choices.ledger === 'keep' && s.wait === 'a1_fence', `choice recorded: ${JSON.stringify(s.choices)}, next ${s.wait}`);
      // rename, then save and reload
      await ev(() => { const g = __game; g.renameCaptain('  Ada <i>Merrow</i> II '); g.renameShip('DSV Forty Credits'); g.saveNow(); });
      await page.goto(`${base}?play&webgl&q=low`);
      await ready();
      s = await ev(() => { T.sim(8); return { ...T.story(), name: __game.data.name, ship: __game.data.ship.name, tut: T.tut(), docked: !!__game.docked }; });
      check(s.choices.ledger === 'keep' && s.cur === 'a1_fence' && s.done.length === 4, `after reload: choice remembered, on ${s.cur} (${s.obj})`);
      check(s.name === 'Ada i Merrow /i II' || !/[<>]/.test(s.name), `renamed captain is clean: "${s.name}", ship "${s.ship}"`);
      check(s.tut >= 10 && !s.docked, 'a loaded save is not put through the tutorial or docked');
      await ev(() => { T.readAll(); __game.quests.openStory(); document.querySelector('#quests details.sj').open = true; });
      await page.waitForTimeout(600);
      await shot('06-story-tab');
      const tab = await ev(() => document.querySelector('#quests .wbody').innerText.slice(0, 3000));   // (innerText follows the CSS: headings come back in capitals)
      console.log('  story tab:', tab.replace(/\n+/g, ' | ').slice(0, 420));
      check(/keep it/i.test(tab) && /off the books/i.test(tab), 'Story tab shows the current chapter and the decision');
      // the other branch of a variant, straight from data
      await ev(() => { __game.ui.toggle('quests', false); __game.command('character'); });
      await page.waitForTimeout(300);
      await shot('07-ship-window');
    }
  }
  if (errs.length) { console.log('page errors:\n ' + [...new Set(errs)].slice(0, 8).join('\n ')); fails.push('page errors'); }
  await browser.close();
  console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
