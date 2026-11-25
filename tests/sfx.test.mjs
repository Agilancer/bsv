// The interface sound bank: every file built from the sci-fi UI pack is used by a cue, every cue's files exist,
// every cue is played from somewhere in the game, and every cue the game asks for is in the bank.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CUES, SFX_DIR, pickFile, keyIndex } from '../src/engine/sfxBank.js';

const ROOT = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const onDisk = walk(join(ROOT, SFX_DIR)).filter((p) => p.endsWith('.mp3')).map((p) => relative(join(ROOT, SFX_DIR), p).replace(/\\/g, '/').replace(/\.mp3$/, ''));
const src = walk(join(ROOT, 'src')).filter((p) => p.endsWith('.js')).map((p) => readFileSync(p, 'utf8')).join('\n');

test('the whole pack is in the bank, once', () => {
  assert.equal(onDisk.length, 393, 'all 393 files of the SCI-FI UI SFX pack are built');
  const used = new Map();
  for (const [name, c] of Object.entries(CUES)) for (const f of c.f) { assert.ok(!used.has(f), `${f} is in both ${used.get(f)} and ${name}`); used.set(f, name); }
  const missing = onDisk.filter((f) => !used.has(f));
  assert.deepEqual(missing, [], 'files no cue plays');
  const absent = [...used.keys()].filter((f) => !onDisk.includes(f));
  assert.deepEqual(absent, [], 'cue files that are not on disk');
});

test('cues are well formed', () => {
  for (const [name, c] of Object.entries(CUES)) {
    assert.ok(c.v > 0 && c.v <= 1, `${name} volume`);
    assert.ok(!c.with || CUES[c.with], `${name} layers a cue that exists`);
    if (c.f.length > 1) assert.ok(['any', 'tier', 'key', 'cycle'].includes(c.pick), `${name} says how it picks among ${c.f.length} files`);
  }
});

test('every cue is played somewhere, and everything played is a cue', () => {
  const asked = new Set([...src.matchAll(/\bcue\(\s*'([A-Za-z]+)'/g)].map((m) => m[1]));
  for (const m of src.matchAll(/\bcue\(\s*([a-z][^,)]*\?[^,)]*)[,)]/g)) for (const q of m[1].slice(m[1].indexOf('?')).matchAll(/'([A-Za-z]+)'/g)) asked.add(q[1]);   // cue(a ? 'x' : 'y'): the branches
  const layered = new Set(Object.values(CUES).map((c) => c.with).filter(Boolean));
  for (const name of Object.keys(CUES)) assert.ok(asked.has(name) || layered.has(name), `cue ${name} is never played`);
  for (const name of asked) assert.ok(CUES[name], `the game plays '${name}', which is not in the bank`);
});

test('picking', () => {
  const st = {};
  const c = CUES.notice;
  const seq = [0, 1, 2, 3, 4].map(() => pickFile(c, st, {}));
  assert.deepEqual(seq, [c.f[0], c.f[1], c.f[2], c.f[3], c.f[0]], 'cycle walks the registers');
  assert.equal(pickFile(CUES.pickup, {}, { tier: 9 }), CUES.pickup.f[3], 'tier clamps');
  assert.equal(pickFile(CUES.pickup, {}, { tier: -2 }), CUES.pickup.f[0]);
  assert.equal(pickFile(CUES.winOpen, {}, { key: 'inventory' }), pickFile(CUES.winOpen, {}, { key: 'inventory' }), 'a key keeps its pitch');
  assert.equal(keyIndex('x', 1), 0);
  const any = {};
  let prev = null;
  for (let i = 0; i < 50; i++) { const f = pickFile(CUES.denied, any, {}); assert.notEqual(f, prev, 'any never repeats back to back'); prev = f; }
});
