// Review renders of the hangar craft from one page load of tools/craft_viewer.html:
//   node tools/craftshots.cjs <out dir> [flags]   (dev server on PORT, default 8420)
// Writes lineup_<team>.png (every craft, play camera), <kind>_<team>.png (close, play camera) and
// <kind>_<team>_low.png (close, a low rear three-quarter view) for the captain's and a hostile wing.
const { chromium } = require('playwright');
(async () => {
  const [, , out = 'craftshots', flags = ''] = process.argv;
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${process.env.PORT || 8420}/tools/craft_viewer.html?webgl${flags}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  await page.waitForTimeout(5000);
  const snap = async (name, ms = 1500) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${out}/${name}.png` }); };
  const list = await page.evaluate('window.__viewer.list()');
  const teams = [...new Set(list.map((c) => c.team))];
  for (const team of teams) {
    const row = list.filter((c) => c.team === team);
    const X = row.map((c) => c.x), Z = row.map((c) => c.z);
    const mx = (Math.min(...X) + Math.max(...X)) / 2, mz = (Math.min(...Z) + Math.max(...Z)) / 2;
    await page.evaluate('window.__viewer.only(null)');
    await page.evaluate(`window.__viewer.cam(${mx}, 0, ${mz}, ${(Math.max(...X) - Math.min(...X)) * 1.05 + 40}, 0.35, 0.92)`);
    await snap(`lineup_${team}`);
    if (process.env.LINEUP) continue;
    for (const c of row) {
      await page.evaluate(`window.__viewer.only(${JSON.stringify(c.kind)})`);
      await page.evaluate(`window.__viewer.cam(${c.x}, 0, ${c.z}, ${c.L * 1.25 + 4}, 0.75, 0.92)`);
      await snap(`${c.kind}_${team}`, 900);
      await page.evaluate(`window.__viewer.cam(${c.x}, 0, ${c.z}, ${c.L * 1.1 + 4}, 2.45, 0.28)`);
      await snap(`${c.kind}_${team}_low`, 900);
    }
  }
  console.log(logs.slice(0, 20).join('\n'));
  await browser.close();
})();
