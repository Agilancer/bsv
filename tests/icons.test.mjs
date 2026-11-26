// The installable app: the web manifest and the page's icon links point at files that exist, each PNG is the size it
// claims, the desktop and maskable sets are both there, and the iOS home-screen icon is opaque (iOS paints any
// transparency black). The art is built by tools/icons/build_icons.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));

// width, height and colour type from a PNG's IHDR chunk
function png(path) {
  const b = readFileSync(join(ROOT, path));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${path} is a PNG`);
  assert.equal(b.toString('latin1', 12, 16), 'IHDR', `${path} starts with IHDR`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colour: b[25] };
}
const links = (rel) => [...html.matchAll(/<link\s[^>]*>/g)].map((m) => m[0])
  .filter((t) => new RegExp(`rel="${rel}"`).test(t))
  .map((t) => ({ href: /href="([^"]+)"/.exec(t)[1], sizes: (/sizes="([^"]+)"/.exec(t) || [])[1] }));

test('the page links the manifest and its icons', () => {
  const [m] = links('manifest');
  assert.equal(m?.href, 'manifest.webmanifest');
  for (const rel of ['icon', 'apple-touch-icon']) {
    assert.ok(links(rel).length, `a ${rel} link`);
    for (const l of links(rel)) assert.ok(existsSync(join(ROOT, l.href)), `${l.href} exists`);
  }
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="[^"]{1,12}">/, 'a home-screen name iOS will not truncate');
});

test('the manifest makes an installable app', () => {
  assert.ok(manifest.name && manifest.short_name && manifest.short_name.length <= 12);
  assert.equal(manifest.start_url, './', 'relative, so it works under the Pages subpath');
  assert.ok(['standalone', 'fullscreen'].includes(manifest.display));
  for (const n of [192, 512]) {
    for (const purpose of ['any', 'maskable']) {
      const i = manifest.icons.find((x) => x.sizes === `${n}x${n}` && x.purpose === purpose);
      assert.ok(i, `${purpose} ${n}x${n} icon`);
      assert.equal(i.type, 'image/png');
    }
  }
  for (const i of manifest.icons) {
    assert.ok(existsSync(join(ROOT, i.src)), `${i.src} exists`);
    const { w, h, colour } = png(i.src);
    assert.equal(`${w}x${h}`, i.sizes, `${i.src} is the size the manifest says`);
    // a mask cuts the corners off, so a maskable icon must be full bleed
    if (i.purpose === 'maskable') assert.equal(colour, 2, `${i.src} is opaque RGB`);
  }
});

test('the iOS home-screen icon is 180 px and opaque', () => {
  for (const l of links('apple-touch-icon')) {
    const { w, h, colour } = png(l.href);
    assert.equal(w, 180); assert.equal(h, 180);
    assert.equal(colour, 2, 'RGB with no alpha channel');
    assert.equal(l.sizes, '180x180');
  }
});
