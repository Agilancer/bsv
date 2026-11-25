// Names in play: rename the captain or any owned hull, and name a hull when it is bought or built.
// Rules and random names are pure data in data/naming.js. Prompts never block: the game runs on
// behind them, a default is already in place, and the autopilot simply picks a name.
//   game.renameCaptain(text) · game.renameShip(text, fleetIndex?) · game.namesPanel(el)
import { cleanName, captainName, shipName, randomCaptain, randomShip, CAPTAIN_MAX, SHIP_FULL_MAX } from './data/naming.js';
import { CHASSIS_BY_ID } from './data/chassis.js';
import { save } from './Player.js';

export function installNaming(game) {
  let el = null, onOk = null;
  const prefix = () => game.shipPrefix || 'DSV';

  game.renameCaptain = (v) => {
    const name = cleanName(v, CAPTAIN_MAX);
    if (!name) return false;
    game.data.name = name;
    game.ui.toast(`Captain ${name}`);
    game.ui.refresh(); save(game.data);
    return true;
  };
  // fleetIndex: a hull in the hangar; omitted: the flagship
  game.renameShip = (v, fleetIndex) => {
    const name = cleanName(v, SHIP_FULL_MAX);
    if (!name) return false;
    const P = game.data, ship = fleetIndex == null ? P.ship : P.fleet[fleetIndex];
    if (!ship) return false;
    ship.name = name; ship.named = 1;
    if (fleetIndex == null && game.player) game.player.name = name;
    game.ui.toast(`Registered: ${name}`);
    game.ui.refresh(); save(P);
    return true;
  };

  function build() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'namePrompt'; el.className = 'holo';
    el.innerHTML = '<div class="np-h"></div><div class="np-sub"></div><div class="nrow"><input class="name-in" autocomplete="off" spellcheck="false"><button class="btn violet name-dice" title="Random name">⚄</button></div><div class="np-foot"><button class="btn violet np-no">Keep as is</button><button class="btn np-ok">Register</button></div>';
    document.body.append(el);
    const inp = el.querySelector('input');
    inp.onfocus = () => { game.input.blocked = true; };
    inp.onblur = () => { game.input.blocked = false; };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') el.querySelector('.np-ok').click(); if (e.key === 'Escape') close(); };
    el.querySelector('.np-no').onclick = close;
    el.querySelector('.np-ok').onclick = () => { const f = onOk; const v = inp.value; close(); if (f) f(v); };
  }
  function close() { if (!el) return; el.classList.remove('show'); el.querySelector('input').blur(); game.input.blocked = false; onOk = null; }
  // a small non-modal panel: title, one line of text, an input with a dice button
  function prompt(title, sub, value, max, random, ok) {
    build();
    el.querySelector('.np-h').textContent = title; el.querySelector('.np-sub').textContent = sub;
    const inp = el.querySelector('input');
    inp.value = value; inp.maxLength = max;
    el.querySelector('.name-dice').onclick = () => { inp.value = random(); };
    onOk = ok;
    el.classList.add('show');
  }
  game.namePrompt = prompt;

  // the Ship window: who commands, what she is called
  game.namesPanel = (box) => {
    if (!box) return;
    box.className = 'names';
    box.innerHTML = '<div class="nrow"><button class="btn violet" data-n="captain">Rename captain</button><button class="btn violet" data-n="ship">Rename ship</button></div>';
    box.querySelector('[data-n="captain"]').onclick = () => prompt('Captain\'s name', 'As entered in the fleet registry.', game.data.name || '', CAPTAIN_MAX, randomCaptain, (v) => game.renameCaptain(captainName(v)));
    box.querySelector('[data-n="ship"]').onclick = () => prompt('Rename the flagship', 'Renaming a ship is held to be bad luck. The registry will record the change.', game.data.ship.name || '', SHIP_FULL_MAX, () => `${prefix()} ${randomShip()}`, (v) => game.renameShip(v));
  };

  // a hull straight from the yard carries the yard's name for it: ask for a better one
  const swap = game.swapPlayerShip.bind(game);
  game.swapPlayerShip = (...a) => {
    const r = swap(...a);
    const P = game.data, ship = P.ship, c = CHASSIS_BY_ID[ship.chassis];
    if (c && !ship.named && ship.name === `${prefix()} ${c.name}`) {
      ship.named = 1;
      if (game.autoplay) {
        // the autopilot never waits on a prompt
        ship.name = shipName(randomShip(), prefix());
        if (game.player) game.player.name = ship.name;
        game.autoplay.log(`New hull registered as ${ship.name}`);
        game.ui.refresh();
      } else prompt('Name your new hull', `${c.fullName || c.name}, fresh from the yard. She answers to "${ship.name}" until you say otherwise.`, `${prefix()} ${randomShip()}`, SHIP_FULL_MAX, () => `${prefix()} ${randomShip()}`, (v) => game.renameShip(v));
    }
    return r;
  };
}
