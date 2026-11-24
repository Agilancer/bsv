// Headless screenshot of a page on the dev server, with WebGPU via SwiftShader.
//   node tools/shot.cjs <path?query> <out.png> [waitMs] [width] [height]
// Prints the page's console errors so shader/pipeline failures are visible.
const { chromium } = require('playwright');
(async () => {
  const [, , path = 'index.html', out = 'shot.png', wait = '4000', w = '1280', h = '720'] = process.argv;
  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://localhost:${process.env.PORT || 8420}/${path}`);
  await page.waitForTimeout(+wait);
  if (process.env.EVAL) console.log(await page.evaluate(process.env.EVAL));
  if (process.env.POSTWAIT) await page.waitForTimeout(+process.env.POSTWAIT);
  await page.screenshot({ path: out });
  console.log(logs.slice(0, 30).join('\n'));
  await browser.close();
})();
