// The simulated MMO: other "players" sailing the system, fighting pirates beside you,
// docking, warping in and out; world/trade/LFG/guild chat; world events; group invites.
import * as THREE from 'three/webgpu';
import { CHASSIS_BY_ID, YARDS } from '../data/chassis.js';
import { starterLoadout } from '../Player.js';
import { RARITY, BASES } from '../data/items.js';
import { galaxy } from '../galaxy.js';
import { RNG, rng as R } from '../../engine/rng.js';
import { PLAYER_NAMES, GUILDS, CHAT, WEAPON_WORDS, PIRATE_FIRST, PIRATE_SHIP } from '../data/names.js';

const fill = (s, game) => s.replace('{sys}', R.pick(galaxy().systems.slice(0, 20)).name).replace('{station}', game.stations && game.stations[0] ? game.stations[0].name : 'Port Velscour').replace('{weapon}', R.pick(WEAPON_WORDS));

export function installMMO(game) {
  const pop = { ships: [], chatT: 4, eventT: 40, inviteT: 90, raidT: 420, raid: null, online: 1100 + Math.floor(Math.random() * 600), party: [] };
  game.mmo = pop;

  function say(channel, who, text, cls = '', c = 'all') { game.ui.chat(channel, who, text, cls, c); }
  const handle = () => R.pick(PLAYER_NAMES);

  function spawnCaptain(near) {
    const W = game.world, sys = game.sector.sys;
    const rng = new RNG(Math.random() * 1e9);
    const name = handle();
    if (W.ships.some((s) => s.name === name)) return null;
    const level = Math.max(1, Math.min(60, sys.danger + rng.int(-2, 9)));
    const yard = rng.pick(['velscour', 'aurelian', 'tidewright', 'ironhold', 'velscour', 'corsair']);
    const tier = Math.max(1, Math.min(10, Math.floor(level / 6) + 1 + rng.int(0, 1)));
    const chassis = CHASSIS_BY_ID[`${yard}_${tier}`];
    const loadout = starterLoadout(chassis, level, rng, () => rng.weighted([['uncommon', 3], ['rare', 4], ['epic', 2], ['legendary', 0.4]]));
    const a = Math.random() * Math.PI * 2, d = 700 + Math.random() * 1600;
    const pos = near.clone().add(new THREE.Vector3(Math.sin(a) * d, 0, Math.cos(a) * d));
    const s = W.addShip({ chassis, loadout, team: 1, faction: 'player', name, level, heading: Math.random() * 6.28 }, { aggro: 1500, flee: 0.18 });
    s.npcPlayer = true;
    s.guild = rng.chance(0.75) ? rng.pick(GUILDS) : null;
    s.factionName = s.guild ? `<${s.guild}> captain` : 'Independent captain';
    s.dmgScale = 0.7;
    s.refit();
    s.position.copy(pos);
    s.ai.home.copy(pos);
    s.life = 120 + Math.random() * 300;
    W.fx.column(pos, 0x58c8ff, 140, 40);
    pop.ships.push(s);
    return s;
  }

  function warpOut(s) {
    const W = game.world;
    W.fx.column(s.position, 0x58c8ff, 200, 50);
    W.fx.ring(s.position, s.dims.L, 0x9fd8ff, 40);
    W.removeShip(s);
  }

  // --- invites / party ---
  function offerInvite(from) {
    const id = 'inv' + Date.now();
    const el = document.createElement('div');
    el.className = 'holo invite';
    el.innerHTML = `<div class="title">${from.guild ? '&lt;' + from.guild + '&gt; ' : ''}${from.name}</div><div class="label" style="margin:4px 0 8px">invites you to a group · Lv ${from.level} ${from.chassis.cls}</div><button class="btn" data-a="1">Accept</button> <button class="btn bad" data-a="0">Decline</button>`;
    document.getElementById('ui').append(el);
    const close = (ok) => {
      el.remove();
      if (ok && from.alive) joinParty(from);
      else say('PARTY', from.name, R.pick(['np', 'ok maybe later', 'kk', 'all good o7']), '');
    };
    el.querySelectorAll('button').forEach((b) => b.onclick = () => close(b.dataset.a === '1'));
    setTimeout(() => el.isConnected && close(false), 20000);
    // autoplay accepts invites
    if (game.autoplay && game.autoplay.active) setTimeout(() => el.isConnected && close(true), 1500);
  }
  function joinParty(s) {
    if (pop.party.length >= 3 || pop.party.includes(s)) return;
    pop.party.push(s);
    s.ai.follow = game.player;
    s.life = Infinity;
    s.partyMember = true;
    game.ui.toast(`${s.name} joined your group`, 'epic');
    say('PARTY', s.name, R.pick(['hey! lets go', 'o7 ready', 'lead the way captain', 'need anything from the drops? im good', 'nice ship']), 'guild', 'all');
  }
  // party XP bonus: +10% per member, they cheer on kills
  game.statProviders.push(() => ({ xp: pop.party.filter((s) => s.alive).length * 0.1 }));

  game.start = ((start) => (fresh) => {
    start(fresh);
    document.querySelector('#chat .tabs').insertAdjacentHTML('beforeend', '<span class="online" id="onlineCount"></span>');
    const ev = game.world.events;
    ev.on('legendaryDrop', (d) => { if (Math.random() < 0.9) game.world.schedule(1 + Math.random() * 2, () => say('GLOBAL', handle(), R.pick(CHAT.loot))); });
    ev.on('kill', ({ ship, killer }) => {
      if (ship === game.player) {
        game.world.schedule(1.5, () => say('LOCAL', handle(), R.pick(['rip', 'F', 'o7 captain', 'that boss is no joke', 'unlucky'])));
        return;
      }
      if (ship.npcPlayer) {
        const i = pop.ships.indexOf(ship); if (i >= 0) pop.ships.splice(i, 1);
        const j = pop.party.indexOf(ship); if (j >= 0) pop.party.splice(j, 1);
        game.world.schedule(1, () => say('LOCAL', ship.name, R.pick(['ugh died', 'brb repairing', 'they focused me', 'rip my legendary', 'lag killed me'])));
      }
      if (ship.elite === 2 && ship.playerTagged) game.world.schedule(2, () => say('WORLD', null, `${game.data.name} and allies defeated ${ship.name} in ${game.sector.sys.name}!`, 'sys'));
      if (killer && killer.partyMember && Math.random() < 0.25) say('PARTY', killer.name, R.pick(['got him', 'nice', 'next!', 'ez', 'loot is yours']), 'guild');
    });
    // a jump leaves the party behind... they follow you through the gate
    const enter = game.enterSystem;
    game.enterSystem = (id) => {
      const party = pop.party.filter((s) => s.alive).map((s) => ({ name: s.name, guild: s.guild, level: s.level, chassis: s.chassis.id, loadout: s.loadout }));
      pop.ships = []; pop.party = []; pop.raid = null; game.raidMarker = null;
      enter(id);
      for (const p of party) {
        const s = game.world.addShip({ chassis: CHASSIS_BY_ID[p.chassis], loadout: p.loadout, team: 1, faction: 'player', name: p.name, level: p.level }, { aggro: 1500, flee: 0.18 });
        s.npcPlayer = true; s.guild = p.guild; s.factionName = s.guild ? `<${s.guild}> captain` : 'Independent captain'; s.dmgScale = 0.7; s.refit();
        s.position.copy(game.player.position).add(new THREE.Vector3((Math.random() - 0.5) * 400, 0, (Math.random() - 0.5) * 400));
        s.life = Infinity; s.partyMember = true; s.ai.follow = game.player;
        pop.ships.push(s); pop.party.push(s);
      }
      pop.spawnT = 3;
    };
  })(game.start.bind(game));

  game.npcChat = {
    reply(text) {
      const t = text.toLowerCase();
      let line = null;
      if (/\b(hi|hello|hey|yo|sup)\b/.test(t)) line = R.pick(['hey!', 'o7', 'hi captain', 'sup', 'hello there']);
      else if (t.includes('?')) line = R.pick(CHAT.help);
      else if (/lfg|group|party/.test(t)) { line = 'sure, sending invite'; const s = pop.ships.find((x) => x.alive && !x.partyMember); if (s) game.world.schedule(2, () => offerInvite(s)); }
      else if (/wts|sell|selling/.test(t)) line = R.pick(['how much?', 'pst', 'not interested', 'what level?']);
      else if (Math.random() < 0.5) line = R.pick(CHAT.banter);
      if (line) game.world.schedule(1 + Math.random() * 2.5, () => say('LOCAL', handle(), fill(line, game)));
    },
  };

  // world event: a Dread Armada warps into one of the system's battle zones
  function startRaid() {
    const W = game.world, sec = game.sector, P = game.player;
    const z = sec.detail.zones.reduce((b, z) => (!b || Math.hypot(z.x - P.position.x, z.z - P.position.z) < Math.hypot(b.x - P.position.x, b.z - P.position.z) ? z : b), null);
    const at = new THREE.Vector3(z.x, 0, z.z);
    const faction = sec.sys.danger >= 12 && Math.random() < 0.5 ? 'covenant' : 'pirate';
    const lvl = sec.sys.danger + 4;
    const boss = sec.makeEnemy(faction, lvl, at.clone(), Math.random() * 6.28, 2);
    boss.name = faction === 'covenant' ? `The Hollow Choir, Hive-Dreadnought` : `${boss.name.split(',')[0]}, Armada Lord`;
    boss.maxHull *= 1.6; boss.hull = boss.maxHull; boss.raidBoss = true; boss.persistent = true;
    boss.ai.aggro = 1600;
    const escorts = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const e = sec.makeEnemy(faction, lvl, at.clone().add(new THREE.Vector3(Math.sin(a) * 280, 0, Math.cos(a) * 280)), a, i === 0 ? 1 : 0);
      e.persistent = true; escorts.push(e);
    }
    for (const s of [boss, ...escorts]) { W.fx.column(s.position, s.yard.glow, 260, 80); W.fx.ring(s.position, s.dims.L * 1.4, s.yard.glow, 60); }
    pop.raid = { boss, escorts, at, t: 0 };
    say('WORLD', null, `A Dread Armada has warped into ${sec.sys.name}! ${boss.name} leads ${escorts.length} warships. All captains respond!`, 'sys');
    game.ui.toast(`World event: ${boss.name}`, 'legend');
    if (game.audio) game.audio.play('jump', null, 1);
    // the population answers the call
    for (const s of pop.ships) if (!s.partyMember) { s.ai.home.copy(at); s.ai.aggro = 2200; }
    for (let i = 0; i < 3; i++) spawnCaptain(at);
    game.raidMarker = at;
  }
  function raidTick(dt) {
    const r = pop.raid; if (!r) return;
    r.t += dt;
    if (!r.boss.alive) {
      say('WORLD', null, `${r.boss.name} has fallen in ${game.sector.sys.name}! Glory to the captains who fought.`, 'sys');
      if (r.boss.playerTagged) {
        const rng = new RNG(Math.random() * 1e9);
        game.world.loot.dropCredits(2000 * game.sector.sys.danger, r.boss.position);
        game.gainXp(800 * game.sector.sys.danger);
        game.ui.toast('Raid victory! The Armada\'s treasury spills into space', 'legend');
      }
      for (const e of r.escorts) e.persistent = false;
      pop.raid = null; game.raidMarker = null;
      for (let i = 0; i < 4; i++) game.world.schedule(1 + i, () => say('GLOBAL', handle(), R.pick(['GG!!', 'that was epic', 'grats all', 'who got the mythic?', 'gg wp', 'o7 o7'])));
    } else if (r.t > 600) {
      say('WORLD', null, `${r.boss.name} has jumped away.`, 'sys');
      for (const s of [r.boss, ...r.escorts]) if (s.alive) game.world.removeShip(s);
      pop.raid = null; game.raidMarker = null;
    }
  }
  game.startRaid = startRaid;

  pop.spawnT = 2;
  game.npcs = {
    update(dt) {
      const W = game.world, P = game.player;
      if (!P || !W) return;
      // population in this system
      pop.spawnT -= dt;
      const want = 3 + (game.stations.length ? 2 : 0) + Math.min(3, Math.floor(game.sector.sys.danger / 15));
      if (pop.spawnT <= 0) {
        pop.spawnT = 8 + Math.random() * 12;
        if (pop.ships.filter((s) => s.alive).length < want) spawnCaptain(P.position);
      }
      for (const s of pop.ships.slice()) {
        if (!s.alive) { pop.ships.splice(pop.ships.indexOf(s), 1); continue; }
        s.life -= dt;
        if (s.life <= 0 && !s.target) { pop.ships.splice(pop.ships.indexOf(s), 1); warpOut(s); continue; }
        // drift toward the action: wander homes move near the captain or a zone
        if (!s.ai.follow && Math.random() < dt * 0.05) {
          const z = R.pick(game.sector.detail.zones);
          s.ai.home.set(R.chance(0.6) ? P.position.x + (Math.random() - 0.5) * 1500 : z.x, 0, R.chance(0.6) ? P.position.z + (Math.random() - 0.5) * 1500 : z.z);
        }
        if (s.position.distanceTo(P.position) > 5000 && !s.partyMember) { pop.ships.splice(pop.ships.indexOf(s), 1); W.removeShip(s); }
      }
      // chatter
      pop.chatT -= dt;
      if (pop.chatT <= 0) {
        pop.chatT = 4 + Math.random() * 10;
        const kind = R.weighted([['banter', 5], ['lfg', 2], ['trade', 2], ['help', 1]]);
        const ch = { banter: R.pick(['GLOBAL', 'LOCAL', 'GUILD']), lfg: 'LFG', trade: 'TRADE', help: 'HELP' }[kind];
        const who = handle();
        say(ch, (ch === 'GUILD' ? '' : '') + who, fill(R.pick(CHAT[kind]), game), ch === 'GUILD' ? 'guild' : '');
      }
      pop.eventT -= dt;
      if (pop.eventT <= 0) {
        pop.eventT = 40 + Math.random() * 60;
        const sys = R.pick(galaxy().systems);
        const ev = R.pick([
          () => `${handle()} looted a Legendary ${R.pick(WEAPON_WORDS)} in ${sys.name}!`,
          () => `Dread Captain ${R.pick(PIRATE_FIRST)} has been sighted in ${sys.name}.`,
          () => `A Hollow Star hive-fleet is massing near ${sys.name}. All captains advised.`,
          () => `<${R.pick(GUILDS)}> has claimed the bounty on ${R.pick(PIRATE_FIRST)}'s ${R.pick(PIRATE_SHIP)}.`,
          () => `${handle()} reached commander rank ${R.int(20, 60)}!`,
          () => `${handle()} found a Velscour Mythic relic on a moon of ${sys.name}!`,
        ])();
        say('WORLD', null, ev, 'sys');
      }
      pop.raidT -= dt;
      if (pop.raidT <= 0 && !pop.raid && !game.docked) { pop.raidT = 480 + Math.random() * 300; startRaid(); }
      raidTick(dt);
      pop.inviteT -= dt;
      if (pop.inviteT <= 0) {
        pop.inviteT = 120 + Math.random() * 180;
        const s = pop.ships.find((x) => x.alive && !x.partyMember && x.position.distanceTo(P.position) < 2500);
        if (s && pop.party.length < 2) offerInvite(s);
      }
      pop.online += Math.round((Math.random() - 0.5) * 4);
      const el = document.getElementById('onlineCount');
      if (el) el.textContent = `${pop.online.toLocaleString()} online`;
    },
  };
}
