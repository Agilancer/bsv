// First-session objectives: a short chain that walks a new captain through the loop —
// fight, loot, equip, dock and sell, take a contract, jump — with a reward per step.
// Also stages an early pirate skirmish so the first minute isn't empty.
import * as THREE from 'three/webgpu';
import { ENEMIES } from './data/enemies.js';
import { RARITY } from './data/items.js';

const STEPS = [
  // the guns fire on their own; a full broadside is the captain's call — make the first lesson that
  { k: 'volley', title: 'Fire a broadside', hint: 'Tab to target a pirate · turn side-on · Space fires every gun on that flank', mhint: 'Tap a pirate to target · turn side-on · ability 1 fires the broadside', done: (g) => g._tut.volley },
  { k: 'kill', title: 'Destroy a pirate ship', hint: 'Keep your strong flank toward them · the shield rose shows each facing', done: (g) => g.data.kills >= 1 },
  { k: 'loot', title: 'Recover a loot drop', hint: 'Sail near the light pillar — the tractor beam does the rest', done: (g) => g._tut.looted },
  { k: 'equip', title: 'Fit an upgrade', hint: 'I opens Cargo · items marked ▲ beat what you have', mhint: 'Menu → Cargo · tap an item marked ▲', done: (g) => g._tut.equipped },
  { k: 'dock', title: 'Dock and sell your spare gear', hint: 'G near the station · Market tab · click to sell', mhint: 'Tap “Tap to dock”, then sell in the Market tab', done: (g) => g._tut.sold },
  { k: 'contract', title: 'Take a quest', hint: 'Quests tab on the station board · J opens your quest log', mhint: 'Quests tab on the station board · Menu → Quests is your log', done: (g) => (g.data.contracts || []).length > 0 || ((g.data.questLog || {}).done || 0) > 0 },
  { k: 'jump', title: 'Jump to a new system', hint: 'M opens the galaxy map · double-click a neighbour', mhint: 'Menu → Galaxy · double-tap a neighbour', done: (g) => (g.data.visited || []).length >= 2 },
];

export function installOnboarding(game) {
  game._tut = { looted: false, equipped: false, sold: false, volley: false };
  const useAbility = game.useAbility.bind(game);
  game.useAbility = (k, ...a) => { const r = useAbility(k, ...a); if (r && k === 'volley' && !(game.autoplay && game.autoplay.active)) game._tut.volley = true; return r; };
  const equip = game.equip.bind(game);
  game.equip = (...a) => { const r = equip(...a); if (r) game._tut.equipped = true; return r; };

  game.start = ((start) => (fresh) => {
    start(fresh);
    const P = game.data;
    if (P.tutorial == null) P.tutorial = P.kills > 0 ? STEPS.length : 0;
    if (!P.tutorialV2) { if (P.tutorial > 0 && P.tutorial < STEPS.length) P.tutorial++; P.tutorialV2 = 1; }   // the broadside lesson was added first
    game.world.events.on('collect', (d) => { if (d.type === 'item') game._tut.looted = true; });
    const sell = game.sellItem;
    if (sell) game.sellItem = (...a) => { game._tut.sold = true; return sell(...a); };
    const sellNon = game.sellNonUpgrades;
    if (sellNon) game.sellNonUpgrades = (...a) => { const n = sellNon(...a); if (n) game._tut.sold = true; return n; };
    document.getElementById('ui').insertAdjacentHTML('beforeend', '<div id="objectives" class="holo"></div>');
    if (P.tutorial < STEPS.length && P.system === 0 && P.kills === 0) stageSkirmish();
    if (document.body.classList.contains('mobile')) {
      const ci = document.getElementById('chatIn'); if (ci) ci.placeholder = 'Chat';
    }
  })(game.start.bind(game));

  // two pirate cutters jump in away from the station's guns
  function stageSkirmish() {
    game.world.schedule(12, () => {
      const P = game.player; if (!P || !P.alive || game.data.kills > 0) return;
      const st = game.stations && game.stations[0];
      const away = st ? P.position.clone().sub(st.position).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
      const at = P.position.clone().addScaledVector(away, 700);
      const pool = ENEMIES.filter((e) => e.faction === 'pirate' && e.size === 'small' && ['interceptor', 'gunboat'].includes(e.role));
      for (let i = 0; i < 2; i++) game.world.spawnDesign(pool[i % pool.length], 1, at.clone().add(new THREE.Vector3((i - 0.5) * 160, 0, (i - 0.5) * 120)), Math.atan2(-away.x, -away.z));
      game.ui.toast('Pirates inbound — clear them out', 'warn');
    });
  }

  let shown = -1;
  game.engine.add({
    update() {
      if (!game.data || !game.ui || game.mode !== 'space') return;
      const P = game.data, el = document.getElementById('objectives');
      if (!el) return;
      while (P.tutorial < STEPS.length && STEPS[P.tutorial].done(game)) {
        const i = P.tutorial++;
        const credits = 150 + i * 120;
        P.credits += credits; game.gainXp(60 + i * 50);
        game.ui.toast(`Objective complete: ${STEPS[i].title} (+${credits} ¢)`, 'epic');
        if (game.audio) game.audio.play('loot', null, 0.6);
      }
      if (P.tutorial >= STEPS.length) { if (shown !== -2) { el.style.display = 'none'; shown = -2; } return; }
      if (shown === P.tutorial) return;
      shown = P.tutorial;
      const st = STEPS[P.tutorial];
      const mobile = document.body.classList.contains('mobile');
      el.style.display = 'block';
      el.innerHTML = `<div class="ob"><b>${P.tutorial + 1}/${STEPS.length}</b><span>${st.title}</span></div><div class="hint">${mobile && st.mhint ? st.mhint : st.hint}</div>`;
    },
  });
}
