// node resolve hook: maps the browser import-map names onto the vendored three build so
// pure-logic modules that touch THREE math types can be tested headless
const ROOT = new URL('../../vendor/three/', import.meta.url);
const MAP = { three: 'three.webgpu.js', 'three/webgpu': 'three.webgpu.js', 'three/tsl': 'three.tsl.js' };
export async function resolve(spec, ctx, next) {
  if (MAP[spec]) return { url: new URL(MAP[spec], ROOT).href, shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: new URL('addons/' + spec.slice(13), ROOT).href, shortCircuit: true };
  return next(spec, ctx);
}
