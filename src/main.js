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
import { captainName, shipName, cleanName, randomCaptain, randomShip, CAPTAIN_MAX, SHIP_MAX } from './game/data/naming.js';
import { startLogoSparks } from './ui/logoSparks.js';

// the logo is being welded back together from the first frame, loading bar and all
const titleLogo = document.querySelector('#title .logo');
const stopLogoSparks = titleLogo ? startLogoSparks(titleLogo) : () => {};

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
    setTimeout(() => { stopLogoSparks(); $('#title').remove(); }, 900);
  };
  $('#btnContinue').onclick = () => go(false);
  // New Captain: name the captain and the flagship first (typed text is cleaned, and only ever shown as text)
  const form = $('#titleCreate'), inC = $('#tcCaptain'), inS = $('#tcShip');
  const showCreate = (on) => { form.style.display = on ? 'flex' : 'none'; $('#titleMenu').style.display = on ? 'none' : 'flex'; const k = document.querySelector('#title .keys'); if (k) k.style.display = on ? 'none' : ''; };
  $('#btnNew').onclick = () => { inC.value = randomCaptain(); inS.value = randomShip(); showCreate(true); inC.focus(); inC.select(); };
  $('#tcBack').onclick = () => showCreate(false);
  $('#tcCaptainDice').onclick = () => { inC.value = randomCaptain(); };
  $('#tcShipDice').onclick = () => { inS.value = randomShip(); };
  const note = () => { const c = cleanName(inC.value, CAPTAIN_MAX), s = cleanName(inS.value, SHIP_MAX); $('#tcNote').textContent = `Captain ${captainName(c)} of the ${shipName(s)}.`; };
  inC.oninput = inS.oninput = note;
  for (const i of [inC, inS]) i.addEventListener('keydown', (e) => e.stopPropagation());
  form.onsubmit = (e) => {
    e.preventDefault();
    game.newCaptain = { name: captainName(inC.value), ship: shipName(inS.value) };
    go(true);
  };
  // render the title backdrop while waiting
  engine.start();
  const auto = new URLSearchParams(location.search);
  if (auto.has('play')) go(auto.has('new') || !hasSave);
}

boot().catch((e) => {
  console.error(e);
  loadTxt.textContent = 'Failed to start: ' + e.message;
});
