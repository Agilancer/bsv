// Guilds, alliances and PvP (everything simulated: the other "players" are NPC captains).
//   game.guild      — the runtime: found/rename/invite/promote/kick, bank, upgrades, diplomacy
//   game.guild.zones — contested Voidglass fields in the open galaxy (zones.js)
//   game.guild.arena — instanced PvP modes (arena.js)
// Save data: game.data.guild (null until founded), game.data.pvp, game.data.diplo.
// Rules and numbers live in data.js (pure); this file wires them to the world.
import { RNG, hashStr, rng as R } from '../../engine/rng.js';
import { GALAXY_SEED } from '../galaxy.js';
import { CHASSIS_BY_ID } from '../data/chassis.js';
import * as D from './data.js';
import { installZones } from './zones.js';
import { installArena } from './arena.js';
import { installGuildUI } from './ui.js';

const LINES = {
  welcome: ['welcome aboard!', 'o7 new blood', 'glad to have you', 'welcome! guild runs are fridays'],
  joined: ['happy to be here o7', 'thanks for the invite captain', 'finally a proper guild', 'reporting in'],
  boss: ['gz on the kill', 'nice one captain', 'big kill! screenshot or it didnt happen', 'thats our guildmaster'],
  loot: ['grats on the drop', 'link it!', 'jealous', 'gz'],
  death: ['rip captain', 'need backup? say the word', 'we avenge you later o7', 'unlucky'],
  idle: ['anyone running arenas tonight?', 'the glass fields are hot right now', 'bank is looking healthy', 'who needs an escort?', 'saw rival colours two systems over', 'need one more for relay capture', 'o7 all'],
  win: ['GG! we take those', 'that was clean', 'rating go up', 'gg wp'],
  loss: ['gg, next one', 'unlucky, they had the better comp', 'we go again', 'close one'],
  capture: ['extractor is ours', 'glass is flowing', 'hold that point!', 'nice cap'],
  ally: ['new friends, new enemies', 'about time we picked a side', 'allies on the board o7'],
};

export function installGuild(game) {
  const guilds = D.genNpcGuilds(GALAXY_SEED);
  const byTag = Object.fromEntries(guilds.map((g) => [g.tag, g]));
  const G = game.guild = { guilds, byTag, ladder: D.duelLadder(GALAXY_SEED), asked: {}, feed: [], D };
  const pt = () => game.data.playtime || 0;

  // save fields with safe defaults (old saves have none of this)
  function ensure() {
    const P = game.data; if (!P) return;
    if (P.guild === undefined) P.guild = null;
    const fresh = D.newPvp();
    if (!P.pvp) P.pvp = fresh; else for (const k of Object.keys(fresh)) if (P.pvp[k] === undefined) P.pvp[k] = fresh[k];
    if (!P.diplo || !Array.isArray(P.diplo.blocs)) P.diplo = D.newDiplomacy(GALAXY_SEED, guilds);
    for (const g of guilds) if (P.diplo.standing[g.tag] === undefined) P.diplo.standing[g.tag] = 0;
  }
  Object.defineProperties(G, {
    g: { get: () => (game.data ? game.data.guild : null) },
    pvp: { get: () => { if (!game.data.pvp) ensure(); return game.data.pvp; } },
    diplo: { get: () => { if (!game.data.diplo) ensure(); return game.data.diplo; } },
  });
  G.ensure = ensure;
  G.tier = () => D.tierFor(G.pvp.rating);
  G.level = () => (G.g ? D.guildLevel(G.g.xp).level : 0);
  G.strength = () => D.playerStrength(G.g, game.data.level);
  // the side the captain fights for in contested space: the alliance, else the guild alone, else nobody
  G.side = () => (G.diplo.player && D.playerBloc(G.diplo) ? G.diplo.player : G.g ? 'own' : null);
  G.emblemColor = () => (G.g ? (D.EMBLEM_BY_KEY[G.g.emblem] || D.EMBLEMS[0]).color : '#58c8ff');
  G.sideColor = (side) => {
    if (!side) return '#6a7a9a';
    if (side === 'own') return G.emblemColor();
    const b = G.diplo.blocs.find((x) => x.id === side);
    return b ? b.color : '#6a7a9a';
  };
  G.sideName = (side) => (side === 'own' ? (G.g ? G.g.name : 'You') : (G.diplo.blocs.find((x) => x.id === side) || {}).name || 'Unclaimed');
  G.chat = (who, text) => game.ui.chat('GUILD', who, text, 'guild');
  G.note = (text) => game.ui.chat('GUILD', null, text, 'sys');
  const someone = () => { const g = G.g; return g && g.members.length ? R.pick(g.members).name : null; };
  G.react = (kind, chance = 1, delay = 1.5) => {
    const who = someone(); if (!who || Math.random() > chance) return;
    const line = R.pick(LINES[kind]);
    game.world.schedule(delay + Math.random() * 2, () => G.chat(who, line));
  };
  G.dirty = () => { if (game.ui) game.ui.refresh(); };
  if (game.mmo) game.mmo.guildSpeaker = someone;

  // ---- guild level and perks
  game.statProviders.push((g) => D.guildPerks(g.data && g.data.guild));
  G.addXp = (n) => {
    const g = G.g; if (!g || !n) return;
    const before = D.guildLevel(g.xp).level;
    g.xp += n;
    const after = D.guildLevel(g.xp).level;
    if (after > before) {
      game.ui.toast(`${g.name} reached guild level ${after}`, 'epic');
      G.note(`The guild is now level ${after}: +${(after * 0.5).toFixed(1)}% XP and credits, ${D.rosterCap(g)} berths.`);
      game.refitPlayer();
    }
  };

  // ---- founding, naming
  G.suggestName = () => D.genGuildName(new RNG((Math.random() * 1e9) >>> 0));
  G.found = (name, tag, emblem = 'azure', auto = false) => {
    if (G.g) return false;
    ensure();
    name = D.cleanName(name);
    if (name.length < 3) { game.ui.toast('A guild needs a name of at least 3 letters', 'warn'); return false; }
    game.data.guild = D.newGuild(name, tag, emblem, pt());
    const g = G.g;
    game.ui.toast(`Guild founded: <${g.tag}> ${g.name}`, 'legend');
    game.ui.chat('WORLD', null, `${game.data.name} has founded the guild <${g.tag}> ${g.name}.`, 'sys');
    G.note(auto ? `Your crew chartered a guild in your name: ${g.name}. Rename it any time in the Guild window.` : `Charter signed. Recruit captains from the Guild window.`);
    game.refitPlayer();
    return true;
  };
  G.rename = (name, tag) => {
    const g = G.g; if (!g) return false;
    name = D.cleanName(name);
    if (name.length < 3) { game.ui.toast('A guild needs a name of at least 3 letters', 'warn'); return false; }
    g.name = name; g.tag = D.cleanTag(tag) || D.tagFromName(name);
    for (const s of game.world.ships) if (s.guildMember || s.ownGuild) { s.guild = g.tag; s.factionName = `<${g.tag}> captain`; }
    game.ui.toast(`The guild is now <${g.tag}> ${g.name}`, 'epic');
    G.note(`The guild sails as <${g.tag}> ${g.name} from today.`);
    G.dirty();
    return true;
  };
  G.setEmblem = (k) => {
    const g = G.g, e = D.EMBLEM_BY_KEY[k]; if (!g || !e) return false;
    if (e.exclusive && !G.pvp.owned.includes('emblem_' + k)) { game.ui.toast('That emblem is sold by the PvP quartermaster', 'warn'); return false; }
    g.emblem = k; G.dirty(); return true;
  };

  // ---- recruiting
  const liveShip = (m) => game.world.ships.find((s) => s.alive && s.guildMember === m.id) || null;
  G.liveShip = liveShip;
  // who could be asked: party members and local captains first, then the recruiting board
  G.recruits = () => {
    const g = G.g, out = [], names = new Set(g ? g.members.map((m) => m.name) : []);
    const pop = game.mmo;
    if (pop) for (const s of pop.ships) {
      if (!s.alive || s.guildMember || names.has(s.name)) continue;
      names.add(s.name);
      out.push({ name: s.name, level: s.level, chassis: s.chassis.id, cha: (hashStr(s.name) % 100) / 100, seed: hashStr(s.name), ship: s, inParty: !!s.partyMember, otherGuild: s.guild && byTag[s.guild] ? s.guild : null, where: s.partyMember ? 'In your group' : 'Here' });
    }
    const slot = Math.floor(pt() / 600), lvl = game.data.level;
    for (let i = 0; i < 4; i++) {
      const c = D.genCaptain(hashStr(`board|${slot}|${i}`), Math.max(1, lvl + (i - 2) * 2 + (slot + i) % 3), names);
      names.add(c.name);
      out.push({ ...c, where: 'Recruiting board' });
    }
    for (const c of out) c.chance = G.inviteChance(c);
    return out;
  };
  G.inviteChance = (c) => {
    const g = G.g; if (!g) return 0;
    return D.inviteChance({ guildLevel: G.level(), tier: G.tier().index, playerLevel: game.data.level, capLevel: c.level, cha: c.cha, inParty: c.inParty, otherGuild: c.otherGuild, members: g.members.length, cap: D.rosterCap(g) });
  };
  G.invite = (c) => {
    const g = G.g; if (!g) return { ok: false, reason: 'Found a guild first' };
    if (g.members.some((m) => m.name === c.name)) return { ok: false, reason: 'Already a member' };
    if (g.members.length >= D.rosterCap(g)) { game.ui.toast('The roster is full — raise the guild level or build a Recruiting Office', 'warn'); return { ok: false, reason: 'Roster full' }; }
    const a = G.asked[c.name];
    if (a && pt() - a.t < 180) { game.ui.toast(`${c.name} is still thinking it over`, 'warn'); return { ok: false, reason: 'Asked recently' }; }
    const n = a ? a.n + 1 : 0;
    G.asked[c.name] = { t: pt(), n };
    const chance = G.inviteChance(c), ok = D.inviteRoll(c.name, g.name, n) < chance;
    if (!ok) {
      game.ui.chat('WHISPER', c.name, R.pick(['thanks, but not right now', 'maybe when your guild is bigger', 'happy where i am, sorry', 'ask me again later']), '');
      game.ui.toast(`${c.name} declined the invitation`, 'warn');
      return { ok: false, chance, reason: 'Declined' };
    }
    const m = D.memberFrom(g, c, pt());
    if (c.otherGuild) D.shiftStanding(G.diplo, c.otherGuild, -2);   // poaching is noticed
    const s = c.ship && c.ship.alive ? c.ship : null;
    if (s) { s.guild = g.tag; s.guildMember = m.id; s.factionName = `<${g.tag}> captain`; game.world.fx.ring(s.position, s.dims.L, 0x9a6bff, 40); }
    game.ui.toast(`${c.name} joined <${g.tag}>`, 'epic');
    G.note(`${c.name} (rank ${c.level}) has joined the guild.`);
    game.world.schedule(1.2, () => G.chat(c.name, R.pick(LINES.joined)));
    G.react('welcome', 0.8, 2.5);
    G.addXp(D.DEEDS.recruit);
    G.dirty();
    return { ok: true, chance, member: m };
  };
  G.kick = (id) => {
    const g = G.g, i = g ? g.members.findIndex((m) => m.id === id) : -1; if (i < 0) return false;
    const [m] = g.members.splice(i, 1), s = liveShip(m);
    if (s) { s.guild = null; s.guildMember = null; s.factionName = 'Independent captain'; }
    G.note(`${m.name} has been struck from the roster.`);
    G.dirty(); return true;
  };
  G.promote = (id, dir = 1) => {
    const g = G.g, m = g && g.members.find((x) => x.id === id); if (!m) return false;
    const to = Math.max(0, Math.min(D.RANKS.length - 1, m.rank + dir)); if (to === m.rank) return false;
    m.rank = to;
    G.note(`${m.name} is now ${D.RANKS[to]}.`);
    if (dir > 0) game.world.schedule(1, () => G.chat(m.name, R.pick(['honoured o7', 'wont let you down', 'thanks captain!'])));
    G.dirty(); return true;
  };
  // bring a member to your side (the existing group: same follow AI, same cap)
  G.call = (id) => {
    const g = G.g, m = g && g.members.find((x) => x.id === id), pop = game.mmo; if (!m || !pop || !pop.spawnCaptain) return false;
    if (game.docked || game.mode !== 'space' || G.arena.match) { game.ui.toast('Call them once you are under way', 'warn'); return false; }
    if (pop.party.length >= (pop.partyCap || 3)) { game.ui.toast('Your group is full', 'warn'); return false; }
    let s = liveShip(m);
    if (!s) s = spawnMember(m);
    if (!s) { game.ui.toast(`${m.name} cannot break away right now`, 'warn'); return false; }
    s.traffic = null;
    pop.joinParty(s);
    return true;
  };
  function spawnMember(m) {
    const pop = game.mmo, g = G.g;
    if (!pop || !pop.spawnCaptain || !game.player) return null;
    const s = pop.spawnCaptain(game.player.position, { name: m.name, level: m.level, chassis: CHASSIS_BY_ID[m.chassis] ? m.chassis : undefined, guild: g.tag });
    if (s) s.guildMember = m.id;
    return s;
  }

  // ---- bank and upgrades
  G.deposit = (n) => { const g = G.g, P = game.data; n = Math.floor(Math.min(n, P.credits)); if (!g || n <= 0) return false; P.credits -= n; g.bank += n; G.dirty(); return true; };
  G.withdraw = (n) => { const g = G.g; n = Math.floor(Math.min(n, g ? g.bank : 0)); if (!g || n <= 0) return false; g.bank -= n; game.data.credits += n; G.dirty(); return true; };
  G.buyUpgrade = (k) => {
    const g = G.g, u = D.UPGRADE_BY_KEY[k]; if (!g || !u) return false;
    const r = g.upgrades[k] || 0; if (r >= u.max) return false;
    const c = D.upgradeCost(k, r);
    if (G.pvp.voidglass < c.glass) { game.ui.toast(`${u.name} needs ${c.glass} ${D.RESOURCE.name}`, 'warn'); return false; }
    if (g.bank < c.credits) { game.ui.toast(`${u.name} needs ${c.credits} ¢ in the guild bank`, 'warn'); return false; }
    G.pvp.voidglass -= c.glass; g.bank -= c.credits; g.upgrades[k] = r + 1;
    game.ui.toast(`${u.name} rank ${r + 1} built`, 'epic');
    G.note(`${u.name} raised to rank ${r + 1}.`);
    game.refitPlayer();
    return true;
  };

  // ---- diplomacy
  G.allianceChance = (tag) => {
    const d = G.diplo, g = byTag[tag];
    if (!G.g || d.player || (!D.blocOf(d, tag) && d.blocs.length >= D.MAX_BLOCS)) return 0;
    return D.allianceChance({ standing: d.standing[tag], mine: G.strength(), theirs: g.strength, temperament: g.temperament, bank: G.g.bank });
  };
  G.propose = (tag, name) => {
    if (!G.g) { game.ui.toast('Found a guild first', 'warn'); return { ok: false }; }
    const d = G.diplo, a = d.asked && d.asked[tag];
    if (a && pt() - a < 240) { game.ui.toast(`${byTag[tag].name} have only just heard your envoy`, 'warn'); return { ok: false, reason: 'Asked recently' }; }
    (d.asked ||= {})[tag] = pt();
    const r = D.proposeAlliance(d, guilds, tag, { mine: G.strength(), bank: G.g.bank, name });
    if (!r.ok) { game.ui.toast(r.reason, 'warn'); G.note(`Envoy to ${byTag[tag].name}: ${r.reason}.`); G.dirty(); return r; }
    game.ui.toast(`Alliance sworn: ${r.bloc.name}`, 'legend');
    game.ui.chat('WORLD', null, `<${G.g.tag}> ${G.g.name} has sworn to ${r.bloc.name} alongside ${r.bloc.guilds.map((t) => byTag[t].name).join(', ')}.`, 'sys');
    logDiplo(`You swore to ${r.bloc.name}.`);
    G.addXp(D.DEEDS.alliance);
    G.react('ally', 0.9);
    G.dirty();
    return r;
  };
  G.leaveAlliance = () => {
    const b = D.leaveAlliance(G.diplo); if (!b) return false;
    game.ui.toast(`You have left ${b.name}`, 'warn');
    logDiplo(`You broke with ${b.name}.`);
    G.dirty(); return true;
  };
  G.renameAlliance = (name) => {
    const b = D.playerBloc(G.diplo); name = D.cleanName(name);
    if (!b || b.founder !== 'player' || name.length < 3) return false;
    b.name = name; G.dirty(); return true;
  };
  function logDiplo(line) { const d = G.diplo; d.log.unshift(line); if (d.log.length > 8) d.log.length = 8; }
  G.logDiplo = logDiplo;
  // fighting beside a guild's captains, or against them, is remembered (rate-limited per guild)
  const stT = {};
  G.standing = (tag, delta, every = 0) => {
    if (!byTag[tag]) return;
    if (every) { if ((stT[tag] || -1e9) + every > pt()) return; stT[tag] = pt(); }
    D.shiftStanding(G.diplo, tag, delta);
  };

  // ---- timers: members' deeds, members in space, the map drifting, autoplay management
  let deedT = 30, presT = 12, driftT = 200 + Math.random() * 120, autoT = 6, autoRecruitT = 0, autoAllyT = 0;
  function memberTick() {
    const g = G.g; if (!g || !g.members.length) return;
    const m = R.pick(g.members), slot = Math.floor(pt() / 300);
    if (!liveShip(m) && !D.memberStatus(m, slot).online) return;
    m.deeds += R.int(1, 2);
    g.bank += D.dues(m);
    G.addXp(D.DEEDS.memberDeed);
    if (m.level < Math.min(60, game.data.level + 3) && R.chance(0.08)) { m.level++; G.note(`${m.name} reached rank ${m.level}.`); }
    if (R.chance(0.22)) G.chat(m.name, R.pick(LINES.idle));
  }
  function presenceTick() {
    const g = G.g, pop = game.mmo; if (!g || !pop) return;
    // captains coming back out of dock keep their name and tag: re-link them to the roster
    for (const s of pop.ships) if (!s.guildMember && s.guild === g.tag) { const m = g.members.find((x) => x.name === s.name); if (m) s.guildMember = m.id; }
    if (game.docked || !g.members.length || pop.ships.length >= 9) return;
    let here = 0;
    for (const s of pop.ships) if (s.alive && s.guildMember) here++;
    if (here >= Math.min(2, g.members.length)) return;
    const slot = Math.floor(pt() / 300);
    const away = g.members.filter((m) => !liveShip(m) && D.memberStatus(m, slot).online);
    if (away.length) spawnMember(R.pick(away));
  }
  function driftTick() {
    const d = G.diplo, mine = d.player;
    const line = D.diplomacyDrift(d, guilds, new RNG((Math.random() * 1e9) >>> 0));
    if (!line) return;
    game.ui.chat('WORLD', null, `Diplomacy: ${line}`, 'sys');
    logDiplo(line);
    if (mine && !D.playerBloc(d)) d.player = null;
    G.dirty();
  }
  // the autoplay captain runs the guild too: charter, recruiting, ranks, upgrades, alliances
  function autoManage() {
    const P = game.data, ap = game.autoplay;
    if (!G.g) { G.found(D.genGuildName(new RNG(hashStr(`${P.name}|${Math.floor(P.playtime)}`))), null, R.pick(D.EMBLEMS.filter((e) => !e.exclusive)).k, true); ap.log('Chartered a guild'); return; }
    const g = G.g;
    if (g.members.length < D.rosterCap(g) && pt() >= autoRecruitT) {
      autoRecruitT = pt() + 45;
      const c = G.recruits().filter((x) => !(G.asked[x.name] && pt() - G.asked[x.name].t < 180)).sort((a, b) => b.chance - a.chance)[0];
      if (c && c.chance >= 0.25) { const r = G.invite(c); ap.log(r.ok ? `Recruited ${c.name} into the guild` : `${c.name} turned the guild down`); }
    }
    for (const m of g.members) if (D.promotionDue(m)) { G.promote(m.id, 1); ap.log(`Promoted ${m.name} to ${D.RANKS[m.rank]}`); }
    for (const u of D.UPGRADES) {
      const r = g.upgrades[u.k] || 0; if (r >= u.max) continue;
      const c = D.upgradeCost(u.k, r);
      if (G.pvp.voidglass < c.glass) continue;
      if (g.bank < c.credits && P.credits > (c.credits - g.bank) * 5) G.deposit(c.credits - g.bank);   // top the bank up only when it is small change
      if (g.bank >= c.credits && G.buyUpgrade(u.k)) { ap.log(`Guild upgrade: ${u.name}`); break; }
    }
    if (!G.diplo.player && G.level() >= 2 && pt() >= autoAllyT) {
      autoAllyT = pt() + 300;
      let best = null, bc = 0;
      for (const o of guilds) { const c = G.allianceChance(o.tag); if (c > bc) { bc = c; best = o; } }
      if (best && bc >= 0.3) { const r = G.propose(best.tag); ap.log(r.ok ? `Alliance sworn with ${best.name}` : `${best.name} refused an alliance`); }
    }
  }
  G.autoManage = autoManage;
  G.update = (dt) => {
    if (!game.data) return;
    if ((deedT -= dt) <= 0) { deedT = 40 + Math.random() * 15; memberTick(); }
    if ((presT -= dt) <= 0) { presT = 25 + Math.random() * 10; presenceTick(); }
    if ((driftT -= dt) <= 0) { driftT = 240 + Math.random() * 180; driftTick(); }
    if ((autoT -= dt) <= 0) { autoT = 12; if (game.autoplay && game.autoplay.active && game.mode === 'space') autoManage(); }
  };

  installZones(game, G);
  installArena(game, G);
  installGuildUI(game, G);

  // ---- the autoplay goal: PvP in moderation. A sortie is one arena match or one visit to a contested
  // field, bounded in time, then a long cooldown (PvE stays the main course).
  const SORTIE_EVERY = 840, FIRST_SORTIE = 240, ZONE_VISIT_MAX = 200;
  const ROTA = ['skirmish', 'duel', 'capture', 'convoy'];
  game.autoplayGoals.push((ap) => {
    let nextAt = (game.playtime || 0) + FIRST_SORTIE, act = null;
    const now = () => game.playtime || 0;
    const done = (delay = SORTIE_EVERY) => { act = null; G.sortie = null; nextAt = now() + delay; };
    return {
      name: 'PvP sortie',
      score() {
        if (G.arena.match) return 6;
        if (act && act.kind === 'match') { done(); return 0; }
        if (act && act.kind === 'zone') {
          if (now() - act.t0 < ZONE_VISIT_MAX && G.zones.worthStaying()) return 3;
          done(); return 0;
        }
        if (!game.player || game.docked || game.mode !== 'space' || !G.g) return 0;
        if (game.data.level < D.PVP_AUTO_MIN_LEVEL) return 0;
        return now() >= nextAt ? 0.8 : 0;
      },
      update() {
        if (G.arena.match) { act = act || { kind: 'match' }; return false; }     // the arena steers the ship
        if (act && act.kind === 'match') { done(); return true; }
        if (!act) {
          const pvp = G.pvp, zone = pvp.autoN++ % 2 === 1 && G.zones.canVisit();
          if (zone) { act = G.sortie = { kind: 'zone', t0: now() }; ap.log(`Sailing for the ${G.zones.cur.zone.name}`); return false; }
          const mode = ROTA[(pvp.autoM = (pvp.autoM || 0) + 1) % ROTA.length];
          if (!G.arena.start(mode, { quiet: true })) { done(45); return true; }
          act = { kind: 'match' }; ap.log(`Queued for ${D.MODES[mode].name}`);
          return false;
        }
        if (now() - act.t0 >= ZONE_VISIT_MAX || !G.zones.worthStaying()) { done(); return true; }
        G.zones.autoSteer(game.player);
        return false;
      },
    };
  });

  // ---- start: defaults, world events, the tick
  game.start = ((start) => (fresh) => {
    start(fresh);
    ensure();
    const ev = game.world.events;
    ev.on('kill', ({ ship, killer }) => {
      const g = G.g;
      if (ship === game.player) { G.react('death', 0.6, 2); return; }
      if (killer && killer.guildMember && g) { const m = g.members.find((x) => x.id === killer.guildMember); if (m) { m.deeds++; G.addXp(1); } }
      if (ship.pvp || ship.team === 1) return;                       // zones and arenas keep their own books
      if (!(ship.playerTagged || (killer && killer.isPlayer))) return;
      const boss = ship.elite === 2 || (ship.design && ship.design.sizeIndex >= 3);
      if (g) { G.addXp(boss ? D.DEEDS.bossKill : D.DEEDS.kill); if (boss) G.react('boss', 0.7); }
      // guild captains who fought beside you remember it
      for (const o of game.world.ships) if (o.alive && o.npcPlayer && o.team === 1 && o.guild && byTag[o.guild] && o.position.distanceToSquared(ship.position) < 1500 * 1500) G.standing(o.guild, boss ? 3 : 0.5, boss ? 0 : 15);
    });
    ev.on('legendaryDrop', () => G.react('loot', 0.5));
    const upd = game.npcs.update;
    game.npcs.update = (dt, t) => {
      if (G.arena.match) return;                                     // the instance is sealed off from the system
      upd(dt, t);
      G.update(dt);
      G.zones.update(dt);
    };
  })(game.start.bind(game));
}
