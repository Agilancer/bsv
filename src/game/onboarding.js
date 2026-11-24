// A new captain's first few minutes: the game opens docked at the home station with a short
// arrival scene, then a guided chain — read the station board, undock, take the helm, fire a
// broadside, kill, loot, equip, dock and sell, take a quest — and ends by pointing at the galaxy
// map, crew, bridge and planets. Every step has a keyboard hint and a touch hint, the chain can be
// skipped, and the autopilot is waved straight through. Saves from before this chain are not put
// through it. The campaign (quests/story.js) starts when this ends.
import * as THREE from 'three/webgpu';
import { ENEMIES } from './data/enemies.js';
import { ARRIVAL } from './quests/story.js';

const STEPS = [
  { k: 'board', docked: true, title: 'Look over the station board', hint: 'Tabs along the top · open Services (repairs, crew) and Quests (paid work)', mhint: 'Tap the Services tab, then the Quests tab', done: (g) => g._tut.tabs.services && g._tut.tabs.quests },
  { k: 'undock', docked: true, title: 'Undock', hint: 'The Undock button, top right of the station board (G also works)', mhint: 'Tap Undock, top right of the station board', done: (g) => !g.docked },
  { k: 'helm', title: 'Take the helm', hint: 'W/S throttle · A/D rudder · or right-click open space to sail there', mhint: 'Left stick steers · or tap open space to sail there', done: (g) => g._tut.helm },
  // the guns fire on their own; a full broadside is the captain's call — make that the first lesson in gunnery
  { k: 'volley', title: 'Target a pirate and fire a broadside', hint: 'Tab targets · turn side-on · Space fires every gun on that flank', mhint: 'Tap a pirate to target · turn side-on · ability 1 fires the broadside', done: (g) => g._tut.volley },
  { k: 'kill', title: 'Destroy a pirate ship', hint: 'Keep your strong flank toward them · the shield rose shows each facing', mhint: 'Keep your strong flank toward them · watch the shield rose', done: (g) => g.data.kills >= 1 },
  { k: 'loot', title: 'Recover a loot drop', hint: 'Sail near the light pillar — the tractor beam does the rest', mhint: 'Sail near the light pillar — the tractor beam does the rest', done: (g) => g._tut.looted },
  { k: 'equip', title: 'Fit an upgrade', hint: 'I opens Cargo · items marked ▲ beat what you have', mhint: 'Menu → Cargo · tap an item marked ▲', done: (g) => g._tut.equipped },
  { k: 'dock', title: 'Dock and sell your spare gear', hint: 'G near the station · Market tab · click an item in your hold to sell it', mhint: 'Tap “Tap to dock”, then sell in the Market tab', done: (g) => g._tut.sold },
  { k: 'quest', title: 'Take a quest', hint: 'Quests tab on the station board · J opens your quest log', mhint: 'Quests tab on the station board · Menu → Quests is your log', done: (g) => (g.data.contracts || []).length > 0 || ((g.data.questLog || {}).done || 0) > 0 },
  { k: 'next', title: 'Where next? (optional)', hint: 'M galaxy map: jump to new systems · K crew · B walk your bridge · N system map: scan a planet and land', mhint: 'Menu → Galaxy to jump · Crew · Bridge · System: scan a planet and land', done: (g) => g._tut.next },
];
const UNDOCK = STEPS.findIndex((s) => s.k === 'undock'), VOLLEY = STEPS.findIndex((s) => s.k === 'volley');
export const TUTORIAL_STEPS = STEPS.length;

export function installOnboarding(game) {
  game._tut = { looted: false, equipped: false, sold: false, volley: false, helm: false, next: false, tabs: {} };
  const useAbility = game.useAbility.bind(game);
  game.useAbility = (k, ...a) => { const r = useAbility(k, ...a); if (r && k === 'volley' && !(game.autoplay && game.autoplay.active)) game._tut.volley = true; return r; };
  const equip = game.equip.bind(game);
  game.equip = (...a) => { const r = equip(...a); if (r) game._tut.equipped = true; return r; };
  game.onStationTab = (tab) => { game._tut.tabs[tab] = true; };
  game.tutorialDone = () => !game.data || game.data.tutorial == null || game.data.tutorial >= STEPS.length;
  game.skipTutorial = () => { if (game.data) { game.data.tutorial = STEPS.length; if (game.ui) game.ui.toast('Tutorial skipped — the quest log (J) has your orders'); } };

  let arrive = false, staged = false, autoT = 0, nextT = 0;
  game.start = ((start) => (fresh) => {
    start(fresh);
    const P = game.data;
    // only a brand-new captain is walked through it; older saves (and the older, shorter chain) are done
    if (!P.tutorialV3) { P.tutorial = P.tutorial == null && P.kills === 0 && (P.playtime || 0) < 5 ? 0 : STEPS.length; P.tutorialV3 = 1; }
    game.world.events.on('collect', (d) => { if (d.type === 'item') game._tut.looted = true; });
    const sell = game.sellItem;
    if (sell) game.sellItem = (...a) => { game._tut.sold = true; return sell(...a); };
    const sellNon = game.sellNonUpgrades;
    if (sellNon) game.sellNonUpgrades = (...a) => { const n = sellNon(...a); if (n) game._tut.sold = true; return n; };
    document.getElementById('ui').insertAdjacentHTML('beforeend', '<div id="objectives" class="holo"></div>');
    // a new game opens alongside at the home station: who you are, and why this ship is yours
    const st = game.stations && game.stations[0];
    if (P.tutorial === 0 && P.system === 0 && st && game.player && game.dockNow) {
      game.player.position.copy(st.dockPoint(game.player.position));
      game.cam.focus.copy(game.player.position);
      game.dockNow(st);
      if (game.openStationTab) game.openStationTab('market');
      arrive = true;
    }
    if (document.body.classList.contains('mobile')) {
      const ci = document.getElementById('chatIn'); if (ci) ci.placeholder = 'Chat';
    }
  })(game.start.bind(game));

  // two pirate cutters jump in away from the station's guns: the first fight
  function stageSkirmish(delay) {
    if (staged) return;
    staged = true;
    game.world.schedule(delay, () => {
      const P = game.player; if (!P || !P.alive || game.data.kills > 0) return;
      if (game.docked) { staged = false; return; }
      const st = game.stations && game.stations[0];
      const away = st ? P.position.clone().sub(st.position).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
      const at = P.position.clone().addScaledVector(away, 700);
      const pool = ENEMIES.filter((e) => e.faction === 'pirate' && e.size === 'small' && ['interceptor', 'gunboat'].includes(e.role));
      for (let i = 0; i < 2; i++) game.world.spawnDesign(pool[i % pool.length], 1, at.clone().add(new THREE.Vector3((i - 0.5) * 160, 0, (i - 0.5) * 120)), Math.atan2(-away.x, -away.z));
      game.ui.toast('Pirates inbound — clear them out', 'warn');
    });
  }

  let shown = -1, wasDocked = null;
  game.engine.add({
    update(dt) {
      if (!game.data || !game.ui) return;
      const P = game.data, el = document.getElementById('objectives');
      if (!el) return;
      if (arrive && game.story) { arrive = false; game.story.say(ARRIVAL, { head: 'CITADEL VELSCOUR · ARRIVAL', title: 'An inheritance', obj: 'Look over the station board, then undock. The objectives panel will walk you through it.', close: 'To work ✓' }); }
      if (game.mode !== 'space') return;
      if (P.tutorial < STEPS.length) {
        const auto = !!(game.autoplay && game.autoplay.active), k = STEPS[P.tutorial].k, inp = game.input;
        if (k === 'helm' && !game.docked && (inp.held('turnLeft') || inp.held('turnRight') || inp.hit('throttleUp') || inp.hit('throttleDown') || game.moveTarget || (game.stick && game.stick.active))) game._tut.helm = true;
        if (k === 'next') { nextT += dt; if (nextT > 45 || game.ui.isOpen('galaxy') || game.ui.isOpen('system') || game.ui.isOpen('crew') || (P.visited || []).length >= 2) game._tut.next = true; }
        if (P.tutorial >= VOLLEY && !game.docked && P.kills === 0) stageSkirmish(P.tutorial === VOLLEY ? 4 : 8);
        // the autopilot does not need the lesson: it is waved through a step at a time, and never left parked
        if (auto) {
          autoT += dt;
          if (game.docked && P.tutorial <= UNDOCK && autoT > 1.5) { game.undock(); stageSkirmish(8); }
          if (autoT > 1.2 && !STEPS[P.tutorial].done(game)) { autoT = 0; P.tutorial++; shown = -1; if (!game.docked && P.kills === 0) stageSkirmish(8); }
        } else autoT = 0;
      }
      while (P.tutorial < STEPS.length && STEPS[P.tutorial].done(game)) {
        const i = P.tutorial++;
        const credits = 100 + i * 60;
        P.credits += credits; game.gainXp(40 + i * 25);
        game.ui.toast(`Objective complete: ${STEPS[i].title} (+${credits} ¢)`, 'epic');
        if (game.audio) game.audio.play('loot', null, 0.6);
        if (P.tutorial >= STEPS.length) game.ui.toast('Tutorial complete — your orders are in the quest log (J)', 'epic');
      }
      const dk = !!game.docked; if (dk !== wasDocked) { wasDocked = dk; el.classList.toggle('docked', dk); }
      if (P.tutorial >= STEPS.length) { if (shown !== -2) { el.style.display = 'none'; el.classList.remove('docked'); shown = -2; } return; }
      if (shown === P.tutorial) return;
      shown = P.tutorial;
      const st = STEPS[P.tutorial];
      const mobile = document.body.classList.contains('mobile');
      el.style.display = 'block';
      el.innerHTML = `<div class="ob"><b>${P.tutorial + 1}/${STEPS.length}</b><span>${st.title}</span></div><div class="hint">${mobile && st.mhint ? st.mhint : st.hint}</div><span class="skip">Skip tutorial</span>`;
      el.querySelector('.skip').onclick = (e) => { e.stopPropagation(); game.skipTutorial(); };
    },
  });
}
