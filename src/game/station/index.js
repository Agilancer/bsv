// Stations in each system, docking, and the station window (market, shipyard, fleet,
// services, the quest board — see quests/). Installs onto the game through modules.js.
import * as THREE from 'three/webgpu';
import { Station } from './Station.js';
import { marketStock, shipyardStock, buyPrice, sellPrice, acquireShip, switchShip, repairCost, makeBlueprint, canFly, kindOf, reforge, overhaul, reforgeCost, overhaulCost } from './services.js';
import { CHASSIS_BY_ID, CHASSIS, YARDS } from '../data/chassis.js';
import { RARITY } from '../data/items.js';
import { INV_SIZE, itemScore, save } from '../Player.js';
import { icon } from '../../ui/icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString();

export function installStations(game) {
  game.stations = [];
  game.docked = null;
  game.atStation = null;   // crew recruiting and other services need a station
  let docking = null;
  let tab = 'market';
  let stock = null, yardStock = null;

  // build stations whenever a system loads
  const enter = game.enterSystem.bind(game);
  game.enterSystem = (id) => {
    for (const st of game.stations) st.dispose();
    game.stations = [];
    game.docked = null; docking = null;
    enter(id);
    const D = game.sector.detail;
    D.stations.forEach((info, i) => {
      const pl = game.sector.planets.filter((p) => !p.userData.info.moon)[info.planet] || game.sector.planets[0];
      const a = info.ang;
      const pos = new THREE.Vector3(pl.position.x + Math.cos(a) * info.offset, 0, pl.position.z + Math.sin(a) * info.offset);
      game.stations.push(new Station(game.world, info, pos, game.sector.sys.seed + i * 131));
    });
    // a new captain starts beside the home station
    if (game.stations.length && id === 0 && game.data.kills === 0) {
      const st = game.stations[0];
      game.player.position.copy(st.position).add(new THREE.Vector3(1300, 0, 800));   // outside the turrets' reach
      game.cam.focus.copy(game.player.position);
    }
  };
  // respawn at the nearest station after losing the ship
  const entry = () => (game.stations.length ? game.stations[0].position.clone().add(new THREE.Vector3(450, 0, 250)) : null);
  game.respawnPoint = entry;

  game.nearestStation = (pos = game.player && game.player.position) => {
    let best = null, bd = Infinity;
    for (const st of game.stations) { const d = st.position.distanceTo(pos); if (d < bd) { bd = d; best = st; } }
    return best ? { station: best, dist: bd } : null;
  };

  game.modes.dock = () => {
    if (game.docked) return undock();
    const n = game.nearestStation();
    if (!n || n.dist > 900) { game.ui.toast(n ? `Too far from ${n.station.name}` : 'No station in this system', 'warn'); return; }
    if (game.world.ships.some((o) => o.alive && game.world.hostile(game.player, o) && o.position.distanceTo(game.player.position) < 500)) { game.ui.toast('Cannot dock under fire', 'bad'); return; }
    docking = { station: n.station, point: n.station.dockPoint(game.player.position) };
    game.dockingTarget = docking;
    game.ui.toast(`Docking clearance granted · ${n.station.name}`);
  };

  function dockNow(st) {
    const s = game.player;
    docking = null;
    game.docked = st; game.atStation = st;
    if (game.cue) game.cue('dock');
    s.invuln = true; s.throttle = 0; s.speed = 0; s.velocity.set(0, 0, 0);
    // free repairs to the shields, and contracts tick in
    for (let i = 0; i < 4; i++) s.shields[i] = s.maxShield * 0.3;
    const danger = game.sector.sys.danger;
    stock = marketStock(st.seed, danger, game.data, st.kind);
    yardStock = shipyardStock(st.seed, danger, game.data, st.kind);
    tab = tab || 'market';
    game.ui.toggle('station', true);
    if (game.quests) game.quests.onDock(st);   // courier jobs land here
    game.world.fx.ring(s.position, 120, 0x58ffd8, 64);
    game.ui.chat('STATION', null, `Docked at ${st.name}. Welcome, Captain${game.data.name && game.data.name !== 'Captain' ? ' ' + game.data.name : ''}.`, 'sys');
    save(game.data);
  }
  function undock() {
    const s = game.player;
    game.docked = null; game.atStation = null;
    if (game.cue) game.cue('undock');
    if (s) { s.invuln = false; s.throttle = 0.5; }
    game.ui.toggle('station', false);
    game.ui.toast('Undocked');
  }
  game.undock = undock;
  game.dockNow = dockNow;
  game.openStationTab = (name) => { if (!game.docked) return; tab = name; if (game.onStationTab) game.onStationTab(tab); game.ui.toggle('station', true); };

  // station window
  game.start = ((start) => (fresh) => {
    start(fresh);
    game.ui.windows.station = game.ui.addWindow('station', 'Station');
    game.ui.renderers.station = render;
    // blueprint drops from champions and bosses
    game.world.events.on('kill', ({ ship }) => {
      if (!ship.playerTagged || !ship.elite) return;
      if (Math.random() < (ship.elite === 2 ? 0.5 : 0.12)) {
        const yard = YARDS[ship.chassis.yard] && !YARDS[ship.chassis.yard].enemyOnly ? ship.chassis.yard : ['velscour', 'aurelian', 'tidewright', 'ironhold', 'corsair'][Math.floor(Math.random() * 5)];
        const tier = Math.max(1, Math.min(10, ship.chassis.tier + (ship.elite ? 1 : 0)));
        const bp = makeBlueprint(CHASSIS_BY_ID[`${yard}_${tier}`] || CHASSIS[0]);
        game.world.loot.dropItem(bp, ship.position);
      }
    });
  })(game.start.bind(game));

  // per-frame: stations, docking approach, prompt
  game.engine.add({
    update(dt, t) {
      if (game.mode !== 'space' || !game.world) return;
      for (const st of game.stations) st.update(dt, t);
      const s = game.player;
      if (!s || !s.alive) return;
      if (docking) {
        game.moveTarget = docking.point;   // the helm sails us in
        if (game.autoplay && game.autoplay.active) s.steerTo(docking.point, 40, 0.7);
        // after a few seconds on approach the station's tractor beam takes over (big hulls
        // otherwise circle the berth on their turning radius)
        docking.t = (docking.t || 0) + dt;
        const d = s.position.distanceTo(docking.point);
        if (docking.t > 4 && d < 1100) {
          if (Math.random() < dt * 8) game.world.beams.add(docking.station.position, s.position, 0x58c8ff, 2, 0.25);
          s.position.lerp(docking.point, Math.min(1, dt * 0.6)); s.throttle = Math.min(s.throttle, 0.2);
        }
        if (d < s.dims.L * 0.6 + 60) { game.moveTarget = null; game.dockingTarget = null; dockNow(docking.station); }
      }
      if (game.docked) {
        s.throttle = 0; s.rudder = 0; s.invuln = true;
        s.position.lerp(game.docked.dockPoint(s.position), Math.min(1, dt * 0.8));
        if (game.sector) game.sector.spawnT = Math.max(game.sector.spawnT, 4);
        if (s.hull < s.maxHull) s.repair(s.maxHull * 0.01 * dt);
      }
      const n = game.nearestStation();
      const prompt = document.getElementById('dockPrompt');
      if (prompt) {
        const show = n && n.dist < 900 && !game.docked && !docking;
        if (show && prompt.style.display !== 'block' && game.cue && !(game.autoplay && game.autoplay.active)) game.cue('prompt', { key: 'dock' });
        prompt.style.display = show ? 'block' : 'none';
        if (show) prompt.textContent = document.body.classList.contains('mobile') ? `Tap to dock at ${n.station.name}` : `[G] Dock at ${n.station.name}`;
      }
    },
  });
  document.getElementById('ui').insertAdjacentHTML('beforeend', '<div id="dockPrompt" class="toast" style="position:fixed;left:50%;bottom:96px;transform:translateX(-50%);display:none;animation:none;cursor:pointer"></div>');
  document.getElementById('dockPrompt').onclick = () => game.modes.dock();

  function render() {
    const W = game.ui.windows.station; if (!W) return;
    const P = game.data, st = game.docked;
    const body = W.querySelector('.wbody');
    if (!st) { body.innerHTML = '<div class="label">Not docked.</div>'; return; }
    const K = kindOf(st.kind);
    W.querySelector('.wtitle span').textContent = `${st.name} · ${K.name || st.kind}`;
    const tabs = ['market', 'shipyard', 'refit', 'fleet', 'services', 'quests'];
    let h = K.blurb ? `<div class="label" style="margin:-4px 0 10px;color:var(--cyan)">${K.name} — ${K.blurb}</div>` : '';
    h += `<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">${tabs.map((t) => `<button class="btn ${t === tab ? '' : 'violet'}" data-tab="${t}">${t}</button>`).join('')}<span style="flex:1"></span><span class="val" style="color:#ffd66a;align-self:center">${fmt(P.credits)} ¢</span><button class="btn bad" id="stUndock">Undock</button></div>`;
    if (tab === 'market') {
      h += `<div class="label" style="margin-bottom:6px">For sale</div><div class="grid">${stock.map((it, i) => `<div class="cell named" data-buy="${i}">${itemEl(it)}<span class="nm" style="color:${RARITY[it.rarity].color}">${esc(it.name)}</span><span class="price">${fmt(buyPrice(P, it, st.kind))}</span></div>`).join('')}</div>`;
      h += `<div class="label" style="margin:12px 0 6px">Your hold · click to sell</div><div class="grid">${P.inventory.map((it, i) => `<div class="cell named" data-sell="${i}">${itemEl(it)}<span class="nm" style="color:${RARITY[it.rarity].color}">${esc(it.name)}</span><span class="price">${fmt(sellPrice(P, it, st.kind))}</span></div>`).join('')}</div>
        <div style="margin-top:10px;display:flex;gap:8px"><button class="btn violet" id="sellJunk">Sell all below rare</button><button class="btn violet" id="sellNonUp">Sell everything that is not an upgrade</button></div>`;
    } else if (tab === 'shipyard') {
      const bps = P.inventory.filter((i) => i.slot === 'blueprint');
      h += `<div class="label" style="margin-bottom:6px">Hulls on offer · your rank ${P.level}</div><div class="yard">`;
      for (const { chassis: c, price } of yardStock) {
        const bp = bps.find((b) => b.bp === c.id);
        const cost = bp ? Math.round(price * 0.4) : price;
        const ok = canFly(P, c), cur = P.ship.chassis === c.id;
        h += `<div class="hull ${ok ? '' : 'locked'}"><div class="hn">${c.name} <span class="label">${c.cls}</span></div><div class="label">${YARDS[c.yard].name} · rank ${c.level}</div>
          <div class="hs">Hull ${fmt(c.hull)} · Shields ${fmt(c.shield)} · Speed ${c.speed} · Crew ${c.crew[0]}–${c.crew[1]}</div>
          <div class="hs">Slots: ${c.slots.broadside * 2} broadside · ${c.slots.turret} turret · ${c.slots.prow} prow · ${c.slots.hangar} hangar · ${c.slots.module} module</div>
          <button class="btn" data-hull="${c.id}" data-cost="${cost}" ${ok && !cur && P.credits >= cost ? '' : 'disabled'}>${cur ? 'Current' : (bp ? 'Build from blueprint ' : 'Buy ') + fmt(cost) + ' ¢'}</button></div>`;
      }
      h += `</div>`;
    } else if (tab === 'fleet') {
      const c = CHASSIS_BY_ID[P.ship.chassis];
      h += `<div class="label">Flagship</div><div class="hull"><div class="hn">${esc(P.ship.name)}</div><div class="label">${c.fullName} · ship level ${P.ship.level}</div>
        <div style="display:flex;gap:6px;margin-top:6px"><input id="shipName" class="name-in" value="${esc(P.ship.name)}" maxlength="28"><button class="btn" id="rename">Rename</button></div></div>
        <div class="label" style="margin:12px 0 6px">Hangar · ${P.fleet.length} ships</div><div class="yard">`;
      P.fleet.forEach((f, i) => { const fc = CHASSIS_BY_ID[f.chassis]; h += `<div class="hull"><div class="hn">${esc(f.name)}</div><div class="label">${fc.fullName} · level ${f.level}</div><div style="display:flex;gap:6px;margin:6px 0"><input class="name-in" data-fname="${i}" value="${esc(f.name)}" maxlength="28"><button class="btn violet" data-frename="${i}">Rename</button></div><button class="btn" data-fleet="${i}" ${canFly(P, fc) ? '' : 'disabled'}>Make flagship</button> <button class="btn bad" data-scrap="${i}">Sell ${fmt(Math.round(fc.price * 0.35))} ¢</button></div>`; });
      h += `</div>`;
    } else if (tab === 'services') {
      const s = game.player, cost = s ? repairCost(s, st.kind) : 0;
      h += `<div class="svc"><div><div class="title">Drydock</div><div class="label">Hull ${fmt(s.hull)} / ${fmt(s.maxHull)}</div></div><button class="btn" id="repair" ${cost > 0 && P.credits >= cost ? '' : 'disabled'}>Full repair ${fmt(cost)} ¢</button></div>
        <div class="svc"><div><div class="title">Crew quarters</div><div class="label">Hire officers and ratings</div></div><button class="btn" id="hire" ${game.modes.crew ? '' : 'disabled'}>Open crew</button></div>
        <div class="svc"><div><div class="title">Refinery</div><div class="label">Turn planet resources into upgrades</div></div><button class="btn" id="refine" ${game.modes.refinery ? '' : 'disabled'}>Open refinery</button></div>
        <div class="svc"><div><div class="title">Cartography</div><div class="label">Star charts of nearby systems</div></div><button class="btn" id="charts">Galaxy map</button></div>`;
    } else if (tab === 'refit') {
      // the refit yard: reforge (reroll affixes) or overhaul (rebuild at your rank) — gear keeps its mastery
      const gear = [...Object.entries(P.ship.loadout).filter(([, it]) => it).map(([k, it]) => ({ it, where: k })), ...P.inventory.filter((it) => it && it.slot !== 'blueprint' && RARITY[it.rarity].i >= 2).map((it) => ({ it, where: 'hold' }))];
      h += `<div class="label" style="margin-bottom:8px">Reforge rerolls an item's affixes (named legendaries keep their powers). Overhaul rebuilds it at your rank ${P.level}. Mastery is kept.</div>`;
      h += gear.map(({ it, where }) => {
        const rc = reforgeCost(it), oc = it.ilvl < P.level ? overhaulCost(it, P.level) : 0;
        return `<div class="svc"><div style="display:flex;gap:10px;align-items:center">${itemEl(it)}<div><div class="title" style="color:${RARITY[it.rarity].color}">${esc(it.name)}</div><div class="label">${where === 'hold' ? 'In the hold' : 'Fitted · ' + where.replace(':', ' ')} · item level ${it.ilvl} · mastery ${it.lvl || 1}</div></div></div>
          <div style="display:flex;gap:6px"><button class="btn violet" data-reforge="${it.uid}" ${P.credits >= rc ? '' : 'disabled'}>Reforge ${fmt(rc)} ¢</button>${oc ? `<button class="btn" data-overhaul="${it.uid}" ${P.credits >= oc ? '' : 'disabled'}>Overhaul → ${P.level} · ${fmt(oc)} ¢</button>` : ''}</div></div>`;
      }).join('') || '<div class="label">Nothing fitted or rare+ in the hold.</div>';
    } else if (tab === 'quests') {
      h += game.quests ? game.quests.boardHtml(st) : '<div class="label">The board is empty.</div>';
    }
    body.innerHTML = h;
    const $ = (s) => body.querySelector(s);
    body.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; if (game.onStationTab) game.onStationTab(tab); render(); });
    $('#stUndock').onclick = undock;
    body.querySelectorAll('.item').forEach((el) => {
      const it = [...stock, ...P.inventory].find((x) => x.uid === el.dataset.uid);
      if (!it) return;
      el.onmouseenter = el.onmousemove = (e) => game.ui.showTip(game.ui.itemTip(it, game.worstEquipped(it.slot)), e);
      el.onmouseleave = () => game.ui.hideTip();
    });
    body.querySelectorAll('[data-buy]').forEach((c) => c.onclick = () => {
      const it = stock[+c.dataset.buy], price = buyPrice(P, it, game.docked && game.docked.kind);
      if (P.credits < price) return game.ui.toast('Not enough credits', 'warn');
      if (P.inventory.length >= INV_SIZE) return game.ui.toast('Cargo hold full', 'warn');
      P.credits -= price; P.inventory.push(it); stock.splice(+c.dataset.buy, 1); if (game.cue) game.cue('trade'); game.ui.hideTip(); render();
    });
    body.querySelectorAll('[data-sell]').forEach((c) => c.onclick = () => { sell(P.inventory[+c.dataset.sell]); game.ui.hideTip(); render(); });
    if ($('#sellJunk')) $('#sellJunk').onclick = () => { for (const it of P.inventory.slice()) if (it.slot !== 'blueprint' && RARITY[it.rarity].i < 2) sell(it, true); render(); };
    if ($('#sellNonUp')) $('#sellNonUp').onclick = () => { game.sellNonUpgrades(); render(); };
    body.querySelectorAll('[data-hull]').forEach((b) => b.onclick = () => {
      const id = b.dataset.hull, cost = +b.dataset.cost;
      const bp = P.inventory.find((i) => i.slot === 'blueprint' && i.bp === id);
      const r = acquireShip(P, id, cost);
      game.ui.toast(r.msg, r.ok ? 'epic' : 'warn');
      if (r.ok) { if (game.cue) game.cue('trade'); if (bp) P.inventory.splice(P.inventory.indexOf(bp), 1); game.swapPlayerShip(); }
      render();
    });
    body.querySelectorAll('[data-fleet]').forEach((b) => b.onclick = () => { const r = switchShip(P, +b.dataset.fleet); if (r.msg) game.ui.toast(r.msg, r.ok ? 'epic' : 'warn'); if (r.ok) game.swapPlayerShip(); render(); });
    body.querySelectorAll('[data-scrap]').forEach((b) => b.onclick = () => { const f = P.fleet[+b.dataset.scrap]; P.credits += Math.round(CHASSIS_BY_ID[f.chassis].price * 0.35); P.fleet.splice(+b.dataset.scrap, 1); if (game.cue) game.cue('scrap'); render(); });
    if ($('#rename')) $('#rename').onclick = () => { game.renameShip($('#shipName').value); render(); };
    body.querySelectorAll('[data-frename]').forEach((b) => b.onclick = () => { game.renameShip(body.querySelector(`[data-fname="${b.dataset.frename}"]`).value, +b.dataset.frename); render(); });
    body.querySelectorAll('.name-in').forEach((inp) => { inp.onfocus = () => { game.input.blocked = true; }; inp.onblur = () => { game.input.blocked = false; }; inp.onkeydown = (e) => e.stopPropagation(); });
    if ($('#repair')) $('#repair').onclick = () => { const s = game.player, c = repairCost(s, game.docked && game.docked.kind); if (P.credits >= c) { P.credits -= c; s.hull = s.maxHull; if (game.cue) game.cue('repair'); } render(); };
    if ($('#hire')) $('#hire').onclick = () => game.modes.crew && game.modes.crew();
    if ($('#refine')) $('#refine').onclick = () => game.modes.refinery && game.modes.refinery();
    if ($('#charts')) $('#charts').onclick = () => game.command('galaxy');
    const findGear = (uid) => Object.values(P.ship.loadout).find((x) => x && x.uid === uid) || P.inventory.find((x) => x && x.uid === uid);
    body.querySelectorAll('[data-reforge]').forEach((b) => b.onclick = () => { const it = findGear(b.dataset.reforge); const r = reforge(P, it); game.ui.toast(r.ok ? `Reforged: ${it.name}` : r.msg, r.ok ? 'epic' : 'warn'); if (r.ok) { game.refitPlayer(); if (game.cue) game.cue('craft'); } render(); });
    body.querySelectorAll('[data-overhaul]').forEach((b) => b.onclick = () => { const it = findGear(b.dataset.overhaul); const r = overhaul(P, it); game.ui.toast(r.ok ? `Overhauled: ${it.name} (item level ${it.ilvl})` : r.msg, r.ok ? 'epic' : 'warn'); if (r.ok) { game.refitPlayer(); if (game.cue) game.cue('craft'); } render(); });
    if (tab === 'quests' && game.quests) game.quests.bindBoard(body, render);
  }

  function sell(it, quiet) {
    const P = game.data, i = P.inventory.indexOf(it); if (i < 0) return;
    P.inventory.splice(i, 1); const v = sellPrice(P, it, game.docked && game.docked.kind); P.credits += v;
    if (game.cue) game.cue('trade');
    if (game.quests) game.quests.onSell(it);
    if (!quiet) game.ui.chat('TRADE', null, `Sold ${it.name} for ${v} ¢`, 'loot', 'loot');
  }
  game.sellItem = sell;
  game.sellNonUpgrades = () => {
    const P = game.data;
    let n = 0, total = 0;
    for (const it of P.inventory.slice()) {
      if (it.slot === 'blueprint' || RARITY[it.rarity].i >= 4) continue;
      const cur = game.worstEquipped(it.slot);
      if (cur && itemScore(it) <= itemScore(cur)) { total += sellPrice(P, it, game.docked && game.docked.kind); sell(it, true); n++; }
    }
    if (n) game.ui.toast(`Sold ${n} items for ${fmt(total)} ¢`);
    return n;
  };

  // ▲ marks an upgrade over what's fitted (same rule as the cargo window)
  function itemEl(it) {
    let up = '';
    if (it.slot !== 'blueprint') { const cur = game.worstEquipped(it.slot); if (!cur || itemScore(it) > itemScore(cur)) up = '<span class="up">▲</span>'; }
    return `<div class="item r-${it.rarity}" data-uid="${it.uid}">${icon(it.slot === 'blueprint' ? 'hangar' : (describeIcon(it)))}<span class="il">${it.ilvl}</span>${up}</div>`;
  }
  function describeIcon(it) { return { macrocannon: 'cannon', lance: 'lance', plasma: 'plasma', railgun: 'rail', carronade: 'cannon', autocannon: 'turret', laser: 'laser', missile: 'missile', flak: 'flak', ion: 'ion', torpedo: 'torpedo', nova: 'nova', spinal: 'lance', fighters: 'hangar', bombers: 'hangar', drones: 'drone', shieldgen: 'shield', armor: 'armor', reactor: 'reactor', thrusters: 'engine', targeting: 'sensor', tractor: 'tractor', repair: 'repair' }[it.base]; }
}
