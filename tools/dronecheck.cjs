// Drone model guard: every drone part must have size in game (quantized GLB parts once collapsed to a point and hid the swarm).
//   node tools/dronecheck.cjs   (dev server on PORT, default 8420); exits 1 if a drone collapsed
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl&dynres=0`);
  await p.waitForTimeout(8000);
  const r = await p.evaluate(async () => {
    const g = __game, E = __engine; if (g.docked && g.undock) g.undock();
    const X = await import('./src/game/planet/explorerItems.js'); const VG = await import('./src/game/planet/vehicleGLB.js');
    await Promise.all([VG.loadVehicle('ex_seraph_10'), VG.loadParts()]);
    const M = g.planet.debugDeploy('desert', { hazard: 1, level: 30 });
    const ex = M.ex; ex.level = 30; ex.owned.push('ex_seraph_10'); X.setExChassis(ex, 'ex_seraph_10');
    ex.loadout = { 'hp:0': X.makeExItem('arc', 30, 'rare') }; ['sparrow', 'scarab', 'mender', 'aegis', 'magpie'].forEach((k, i) => { ex.loadout[`hp:${i + 1}`] = X.makeExItem(k, 30, 'rare'); });
    M.rebuildVehicle();
    const out = {};
    for (const [t, list] of Object.entries(M.drones.meshes)) out[t] = list.map((im) => { im.geometry.computeBoundingBox(); const s = im.geometry.boundingBox.getSize(new (im.geometry.boundingBox.min.constructor)()); return +Math.max(s.x, s.y, s.z).toFixed(2); });
    return out;
  });
  console.log(JSON.stringify(r));
  const bad = Object.entries(r).filter(([, sizes]) => Math.max(...sizes.slice(0, -1)) < 0.3);   // collapsed: even the drone's biggest part is a point (the last is the nav light)
  console.log(bad.length ? 'COLLAPSED: ' + bad.map((x) => x[0]).join(',') : 'all drone parts have size');
  await b.close();
  process.exit(bad.length ? 1 : 0);
})();
