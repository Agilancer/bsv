// Boot: renderer, assets, title screen, then the game.
import { Engine } from './engine/Engine.js';
import { Input } from './engine/Input.js';
import { IsoCamera } from './engine/IsoCamera.js';
import { preload, progress } from './engine/Assets.js';
import { initMaterials } from './fx/materials.js';
import { Game } from './game/Game.js';
import { load } from './game/Player.js';
import { Audio } from './engine/Audio.js';
import { TitleScene } from './fx/TitleScene.js';

export const VERSION = '0.1.0';
const $ = (s) => document.querySelector(s);
const loadBar = $('#titleLoad .bar i'), loadTxt = $('#titleLoad .ltxt');
$('#ver').textContent = `v${VERSION}`;

const TEXTURES = ['hull_naval', 'hull_graphite', 'hull_gold', 'hull_glacier', 'hull_dropship', 'hull_apc', 'hull_mech', 'hull_alien', 'glow_alien',
  'pl_dune', 'pl_redsand', 'pl_clay', 'pl_salt', 'pl_canyon', 'pl_basalt', 'pl_scrub', 'pl_gypsum', 'pl_volcanic', 'pl_ochre', 'pl_shale', 'pl_granite', 'pl_banded', 'pl_grass', 'pl_rock'];

async function boot() {
  const engine = await new Engine(document.body).init();
  window.__engine = engine;
  loadTxt.textContent = `${engine.backend} online · loading textures`;
  progress.onChange = (d, n, name) => { loadBar.style.width = `${(d / n) * 100}%`; loadTxt.textContent = `Loading ${name}`; };
  await preload(TEXTURES);
  initMaterials(engine);
  const input = engine.add(new Input(engine.renderer.domElement));
  const cam = new IsoCamera(engine.camera, input);
  const game = new Game(engine, input, cam);
  game.audio = new Audio();
  window.__game = game;
  // optional modules register themselves on the game (autoplay, stations, crew, planets...)
  await import('./game/modules.js').then((m) => m.install(game)).catch((e) => console.warn('modules', e));
  loadTxt.textContent = 'Systems nominal';
  $('#titleLoad').style.display = 'none';
  $('#titleMenu').style.display = 'flex';
  const hasSave = !!load();
  $('#btnContinue').style.display = hasSave ? '' : 'none';
  const title = new TitleScene(engine);
  const go = (fresh) => {
    $('#title').classList.add('gone');
    title.dispose();
    game.start(fresh);
    engine.start();
    setTimeout(() => $('#title').remove(), 900);
  };
  $('#btnContinue').onclick = () => go(false);
  $('#btnNew').onclick = () => go(true);
  // render the title backdrop while waiting
  engine.start();
  const auto = new URLSearchParams(location.search);
  if (auto.has('play')) go(auto.has('new') || !hasSave);
}

boot().catch((e) => {
  console.error(e);
  loadTxt.textContent = 'Failed to start: ' + e.message;
});
