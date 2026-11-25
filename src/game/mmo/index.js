// The simulated MMO: other "players" sailing the system, fighting pirates beside you,
// docking, warping in and out; world/trade/LFG/guild chat; world events; group invites.
import * as THREE from 'three/webgpu';
import { CHASSIS_BY_ID, YARDS } from '../data/chassis.js';
import { starterLoadout } from '../Player.js';
import { RARITY, BASES } from '../data/items.js';
import { galaxy } from '../galaxy.js';
import { RNG, rng as R } from '../../engine/rng.js';
import { ENEMIES } from '../data/enemies.js';
import { PLAYER_NAMES, GUILDS, CHAT, WEAPON_WORDS, PIRATE_FIRST, PIRATE_SHIP } from '../data/names.js';

const fill = (s, game) => s.replace('{sys}', R.pick(galaxy().systems.slice(0, 20)).name).replace('{station}', game.stations && game.stations[0] ? game.stations[0].name : 'Port Velscour').replace('{weapon}', R.pick(WEAPON_WORDS));

export function installMMO(game) {
  const pop = { ships: [], chatT: 4, eventT: 40, inviteT: 90, raidT: 420, raid: null, online: 1100 + Math.floor(Math.random() * 600), party: [] };
  game.mmo = pop;

  function say(channel, who, text, cls = '', c = 'all') { game.ui.chat(channel, who, text, cls, c); }
  const handle = () => R.pick(PLAYER_NAMES);

  // o: {name, level, chassis, guild, pos} to bring a known captain back (undocking)
  function spawnCaptain(near, o = {}) {
    const W = game.world, sys = game.sector.sys;
    const rng = new RNG(Math.random() * 1e9);
    const name = o.name || handle();
    if (W.ships.some((s) => s.name === name)) return null;
    const level = o.level || Math.max(1, Math.min(60, sys.danger + rng.int(-2, 9)));
    const yard = rng.pick(['velscour', 'aurelian', 'tidewright', 'ironhold', 'velscour', 'corsair']);
    const tier = Math.max(1, Math.min(10, Math.floor(level / 6) + 1 + rng.int(0, 1)));
    const chassis = o.chassis ? CHASSIS_BY_ID[o.chassis] : CHASSIS_BY_ID[`${yard}_${tier}`];
    const loadout = starterLoadout(chassis, level, rng, () => rng.weighted([['uncommon', 3], ['rare', 4], ['epic', 2], ['legendary', 0.4]]));
    const a = Math.random() * Math.PI * 2, d = 700 + Math.random() * 1600;
    const pos = o.pos ? o.pos.clone() : near.clone().add(new THREE.Vector3(Math.sin(a) * d, 0, Math.cos(a) * d));
    const s = W.addShip({ chassis, loadout, team: 1, faction: 'player', name, level, heading: o.heading ?? Math.random() * 6.28 }, { aggro: 1500, flee: 0.18 });
    s.npcPlayer = true;
    s.guild = o.guild !== undefined ? o.guild : rng.chance(0.75) ? rng.pick(GUILDS) : null;
    s.factionName = s.guild ? `<${s.guild}> captain` : 'Independent captain';
    s.dmgScale = 0.7;
    s.refit();
    s.position.copy(pos);
    s.ai.home.copy(pos);
    s.life = 120 + Math.random() * 300;
    if (!o.pos) W.fx.column(pos, 0x58c8ff, 140, 40);
    pop.ships.push(s);
    return s;
  }

  // --- station traffic: captains put in, sit docked a while, undock and head out ---
  pop.docked = [];
  function trafficTick(dt) {
    const W = game.world, P = game.player;
    if (!game.stations || !game.stations.length || !game.nearestStation) return;
    pop.trafficT = (pop.trafficT ?? 6) - dt;
    if (pop.trafficT <= 0) {
      pop.trafficT = 12 + Math.random() * 14;
      const n = game.nearestStation(P.position);
      if (n && n.dist < 5000) {
        const ready = pop.docked.filter((d) => d.st === n.station && d.t <= 0);
        if (ready.length && Math.random() < 0.55) undock(ready[0]);
        else {
          const c = pop.ships.find((x) => x.alive && !x.partyMember && !x.traffic && !x.target && !x.ai.follow);
          if (c) { c.traffic = { phase: 'in', st: n.station, t: 0 }; c.ai.leash = 1e9; c.life += 240; }
        }
      }
    }
    for (const d of pop.docked) d.t -= dt;
    for (const s of pop.ships.slice()) {
      const T = s.traffic; if (!T || !s.alive) continue;
      T.t += dt;
      if (T.phase === 'in') {
        if (s.target) continue;                          // a fight comes first
        s.ai.home.copy(T.st.dockPoint(s.position));
        if (s.position.distanceTo(s.ai.home) < s.dims.L * 0.6 + 90 || T.t > 80) dock(s, T.st);
      }
    }
  }
  function dock(s, st) {
    const W = game.world;
    W.beams.add(st.position, s.position, 0x58c8ff, 2, 0.4);
    W.fx.ring(s.position, s.dims.L * 0.8, 0x58ffd8, 40);
    if (Math.random() < 0.35) say('LOCAL', s.name, R.pick([`docking at ${st.name}, anyone selling repair drones?`, 'putting in for repairs', `${st.name} has the cheapest refits in the sector fyi`, 'hold is full, offloading before the next run', 'o7 station crew']), '');
    pop.docked.push({ name: s.name, guild: s.guild, level: s.level, chassis: s.chassis.id, st, t: 25 + Math.random() * 60 });
    pop.ships.splice(pop.ships.indexOf(s), 1); W.removeShip(s);
  }
  function undock(d) {
    pop.docked.splice(pop.docked.indexOf(d), 1);
    const pos = d.st.dockPoint(game.player.position);
    const s = spawnCaptain(pos, { name: d.name, guild: d.guild, level: d.level, chassis: d.chassis, pos, heading: Math.atan2(pos.x - d.st.position.x, pos.z - d.st.position.z) });
    if (!s) return;
    game.world.fx.ring(pos, s.dims.L * 0.8, 0x58ffd8, 40);
    const away = pos.clone().sub(d.st.position).setY(0).setLength(2200).add(pos);
    s.ai.home.copy(away); s.ai.leash = 1e9;
    s.traffic = { phase: 'out', t: 0 }; s.life = 30 + Math.random() * 20;   // sails clear, then warps out
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
    if (pop.party.length >= pop.partyCap || pop.party.includes(s)) return;
    pop.party.push(s);
    s.ai.follow = game.player;
    s.life = Infinity;
    s.partyMember = true;
    game.ui.toast(`${s.name} joined your group`, 'epic');
    say('PARTY', s.name, R.pick(['hey! lets go', 'o7 ready', 'lead the way captain', 'need anything from the drops? im good', 'nice ship']), 'guild', 'all');
  }
  Object.assign(pop, { spawnCaptain, joinParty, partyCap: 3 });   // the guild module calls members to your side
  // party XP bonus: +10% per member, they cheer on kills
  game.statProviders.push(() => ({ xp: pop.party.filter((s) => s.alive).length * 0.1 }));

  game.start = ((start) => (fresh) => {
    start(fresh);
    document.querySelector('#chat .tabs').insertAdjacentHTML('beforeend', '<span class="online" id="onlineCount"></span>');
    const ev = game.world.events;
    ev.on('legendaryDrop', (d) => { if (Math.random() < 0.9) game.world.schedule(1 + Math.random() * 2, () => say('GLOBAL', handle(), R.pick(CHAT.loot))); });
    ev.on('kill', ({ ship, killer }) => {
      if (ship === game.player) {
        game.world.schedule(1.5, () => say('LOCAL', handle(), R.pick(['saw that, captain. hard luck', 'they got the captain. anyone near enough to cover?', 'o7 captain', 'that one hits hard, keep your distance', 'unlucky'])));
        return;
      }
      if (ship.npcPlayer) {
        const i = pop.ships.indexOf(ship); if (i >= 0) pop.ships.splice(i, 1);
        const j = pop.party.indexOf(ship); if (j >= 0) pop.party.splice(j, 1);
        game.world.schedule(1, () => say('LOCAL', ship.name, R.pick(['ugh died', 'brb repairing', 'they focused me', 'lost the hull, crew got to the pods', 'drive tripped, couldnt break away'])));
      }
      if (ship.elite === 2 && ship.playerTagged) game.world.schedule(2, () => say('WORLD', null, `${game.data.name} and allies defeated ${ship.name} in ${game.sector.sys.name}!`, 'sys'));
      if (killer && killer.partyMember && Math.random() < 0.25) say('PARTY', killer.name, R.pick(['got him', 'nice', 'next!', 'splash one', 'loot is yours']), 'guild');
    });
    // a jump leaves the party behind... they follow you through the gate
    const enter = game.enterSystem;
    game.enterSystem = (id) => {
      const party = pop.party.filter((s) => s.alive).map((s) => ({ name: s.name, guild: s.guild, level: s.level, chassis: s.chassis.id, loadout: s.loadout }));
      pop.ships = []; pop.party = []; pop.docked = []; pop.raid = null; pop.raidPending = null; game.raidMarker = null;
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
      if (/\b(hi|hello|hey|yo|sup)\b/.test(t)) line = R.pick(['hey!', 'o7', 'hi captain', 'sup', 'good hunting']);
      else if (t.includes('?')) line = R.pick(CHAT.help);
      else if (/lfg|group|party/.test(t)) { line = 'sure, sending invite'; const s = pop.ships.find((x) => x.alive && !x.partyMember); if (s) game.world.schedule(2, () => offerInvite(s)); }
      else if (/wts|sell|selling/.test(t)) line = R.pick(['how much?', 'pst', 'not interested', 'what level?']);
      else if (Math.random() < 0.5) line = R.pick(CHAT.banter);
      if (line) game.world.schedule(1 + Math.random() * 2.5, () => say('LOCAL', handle(), fill(line, game)));
    },
  };

  // world event: a Dread Armada warps into one of the system's battle zones
  function startRaid(zone) {
    const W = game.world, sec = game.sector, P = game.player;
    // never on top of the captain: the zone furthest away
    const z = zone || sec.detail.zones.reduce((b, z) => (!b || Math.hypot(z.x - P.position.x, z.z - P.position.z) > Math.hypot(b.x - P.position.x, b.z - P.position.z) ? z : b), null);
    const at = new THREE.Vector3(z.x, 0, z.z);
    const danger = sec.sys.danger;
    const size = danger >= 26 ? 'gargantuan' : danger >= 18 ? 'legendary' : danger >= 10 ? 'epic' : 'large';
    const factions = ['pirate', 'rustborn', danger >= 6 ? 'brood' : 'pirate', danger >= 8 ? 'covenant' : 'rustborn', danger >= 12 ? 'silent' : 'pirate'];
    const faction = factions[Math.floor(Math.random() * factions.length)];
    const pool = ENEMIES.filter((e) => e.faction === faction && e.size === size);
    const d = pool[Math.floor(Math.random() * pool.length)];
    const lvl = danger + 4;
    const boss = W.spawnDesign(d, lvl, at.clone(), Math.random() * 6.28);
    if (size === 'large' || size === 'epic') { boss.maxHull *= 2; boss.hull = boss.maxHull; }
    boss.raidBoss = true; boss.persistent = true;
    boss.ai.aggro = 1800;
    const escorts = [];
    const escortSize = size === 'gargantuan' ? 'epic' : size === 'legendary' ? 'large' : 'mid';
    const epool = ENEMIES.filter((e) => e.faction === faction && e.size === escortSize);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2, r = d.len * 0.7 + 200;
      const e = W.spawnDesign(epool[Math.floor(Math.random() * epool.length)], lvl - 1, at.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r)), a);
      e.persistent = true; escorts.push(e);
    }
    for (const s of [boss, ...escorts]) { W.fx.column(s.position, s.yard.glow, 260, 80); W.fx.ring(s.position, s.dims.L * 1.4, s.yard.glow, 60); }
    pop.raid = { boss, escorts, at, t: 0 };
    say('WORLD', null, `A Dread Armada has warped into ${sec.sys.name}! The ${d.fullName} ${boss.name} leads ${escorts.length} warships. All captains respond!`, 'sys');
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
        if (!s.ai.follow && !s.traffic && Math.random() < dt * 0.05) {
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
        let ch = { banter: R.pick(['GLOBAL', 'LOCAL', 'GUILD']), lfg: 'LFG', trade: 'TRADE', help: 'HELP' }[kind];
        // guild chat is your own guild talking (guild module): a member speaks, or the line goes to global
        const member = ch === 'GUILD' && pop.guildSpeaker ? pop.guildSpeaker() : null;
        if (ch === 'GUILD' && pop.guildSpeaker && !member) ch = 'GLOBAL';
        const who = member || handle();
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
      if (pop.raidT <= 0 && !pop.raid && !pop.raidPending && !game.docked) {
        pop.raidT = 480 + Math.random() * 300;
        const P = game.player, z = game.sector.detail.zones.reduce((b, z) => (!b || Math.hypot(z.x - P.position.x, z.z - P.position.z) > Math.hypot(b.x - P.position.x, b.z - P.position.z) ? z : b), null);
        pop.raidPending = { t: 60, z };
        game.raidMarker = new THREE.Vector3(z.x, 0, z.z);
        say('WORLD', null, `Long-range sensors: a Dread Armada will arrive in ${game.sector.sys.name} in 60 seconds. All captains, rally at the marked zone.`, 'sys');
        game.ui.toast('Dread Armada inbound in 60s — marked on your radar and system map', 'legend');
      }
      if (pop.raidPending) { pop.raidPending.t -= dt; if (pop.raidPending.t <= 0) { const z = pop.raidPending.z; pop.raidPending = null; startRaid(z); } }
      raidTick(dt);
      trafficTick(dt);
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
