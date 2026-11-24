// Surface screenshot after a fast-forward: node tools/pshot.cjs "<query e.g. play&new&webgl&planet=terran>" out.png ["js to eval after 6 s of sim"] [postwait ms]  (PORT env; EVAL2 runs after the shot)
// Without planet= it waits 12 s instead. In the eval: __game, __engine (engine.simulate(seconds) steps the sim without drawing).
const { chromium } = require('playwright');
(async () => {
  const [, , q, out, ev = '', post = '2500'] = process.argv;
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  await page.goto(`http://localhost:${process.env.PORT || 8420}/index.html?${q}`);
  if (/planet=/.test(q)) { await page.waitForFunction(() => window.__game && __game.planet && __game.planet.current, null, { timeout: 90000 }).catch((e) => logs.push('no planet')); console.log('sim', await page.evaluate(() => { __engine.simulate(6); return __game.planet.current.state; }).catch((e) => 'SIM ERR ' + e.message)); }
  else await page.waitForTimeout(12000);
  if (ev) console.log(await page.evaluate(ev).catch((e) => 'EVAL ERR ' + e.message));
  await page.waitForTimeout(+post);
  await page.screenshot({ path: out, timeout: 90000 });
  if (process.env.EVAL2) console.log(await page.evaluate(process.env.EVAL2).catch((e) => 'EVAL ERR ' + e.message));
  console.log([...new Set(logs)].slice(0, 12).join('\n'));
  await browser.close();
})();
