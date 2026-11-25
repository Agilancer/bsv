// Review renders of a yard's kit hulls (docs/ships/kit-spec.md section 9), from one page load of the viewer:
//   node tools/kitshots.cjs <out dir> [yard=velscour] [flags=&guns]
// Writes lineup.png (all classes, lit), lineup_black.png / sides_black.png (flat black thumbnails from the
// play camera and from the side), and t<N>_play.png, t<N>_side.png per class. Dev server on PORT (8420).
const { chromium } = require('playwright');
(async () => {
  const [, , out = 'kitshots', yard = 'velscour', flags = '&guns'] = process.argv;
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${process.env.PORT || 8420}/tools/viewer.html?yard=${yard}&fit&webgl&cols=5${flags}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  await page.waitForTimeout(6000);
  const snap = async (name, ms = 1800) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${out}/${name}.png` }); };
  const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
  const hulls = await page.evaluate('window.__viewer.hulls()');
  if (!only) {
    const X = hulls.map((h) => h.x), Z = hulls.map((h) => h.z), mx = (Math.min(...X) + Math.max(...X)) / 2, mz = (Math.min(...Z) + Math.max(...Z)) / 2;
    await page.evaluate(`window.__viewer.cam(${mx}, 0, ${mz + 20}, ${(Math.max(...X) - Math.min(...X)) * 0.8 + 150}, 0, ${53 * Math.PI / 180})`);
    await snap('lineup');
    await page.evaluate('window.__viewer.black(true)');
    await snap('lineup_black');
    // the same two rows from the side
    const xs = hulls.map((h) => h.x), zs = hulls.map((h) => h.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    for (const [k, z] of [...new Set(zs)].entries()) {
      await page.evaluate(`window.__viewer.row(${z})`);
      const row = hulls.filter((h) => h.z === z), r0 = Math.min(...row.map((h) => h.x - h.len / 2)), r1 = Math.max(...row.map((h) => h.x + h.len / 2));
      await page.evaluate(`window.__viewer.cam(${(r0 + r1) / 2}, 0, ${z}, ${(r1 - r0) * 0.62 + 20}, 0, 0.02)`);
      await snap(`sides_black_${k + 1}`);
    }
    await page.evaluate('window.__viewer.only(null); window.__viewer.black(false)');
  }
  for (const h of hulls) {
    const n = h.i + 1;
    if (only && !only.includes(n)) continue;
    await page.evaluate(`window.__viewer.only(${h.i})`);
    await page.evaluate(`window.__viewer.cam(${h.x}, 0, ${h.z}, ${h.len * 1.3 + 14}, 0.8, ${53 * Math.PI / 180})`);
    await snap(`t${n}_play`);
    await page.evaluate(`window.__viewer.cam(${h.x}, ${h.top * 0.2}, ${h.z}, ${h.len * 0.95 + 10}, 0, 0.04)`);
    await snap(`t${n}_side`);
    if (process.env.EXTRA) {
      await page.evaluate(`window.__viewer.cam(${h.x}, 0, ${h.z}, ${h.len * 0.75 + 8}, 2.2, 0.5)`);
      await snap(`t${n}_bow`);
      await page.evaluate(`window.__viewer.cam(${h.x}, 0, ${h.z}, ${h.len * 0.9 + 10}, -0.9, -0.45)`);
      await snap(`t${n}_under`);
    }
  }
  console.log(logs.slice(0, 20).join('\n'));
  await browser.close();
})();
