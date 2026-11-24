import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/game/guild/data.js';
import { RNG } from '../src/engine/rng.js';
import { galaxy, systemDetail } from '../src/game/galaxy.js';
import { CHASSIS_BY_ID } from '../src/game/data/chassis.js';
import { GUILDS } from '../src/game/data/names.js';
import { BASES } from '../src/game/data/items.js';
import { expectedPlayer, dpsCapVs } from '../src/game/data/balance.js';

test('NPC guilds and alliances generate deterministically', () => {
  const a = D.genNpcGuilds(7331), b = D.genNpcGuilds(7331), c = D.genNpcGuilds(99);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((g) => g.strength), c.map((g) => g.strength));
  assert.equal(a.length, GUILDS.length);
  assert.deepEqual(a.map((g) => g.tag), GUILDS);            // the tags the simulated captains already wear
  for (const g of a) {
    assert.ok(D.TEMPERAMENTS[g.temperament] && g.strength >= 30 && g.strength <= 95 && g.leader && g.name);
    assert.ok(galaxy().systems[g.home] && galaxy().systems[g.home].arm === g.arm);
  }
  const d1 = D.newDiplomacy(7331, a), d2 = D.newDiplomacy(7331, b);
  assert.deepEqual(d1, d2);
  assert.equal(d1.blocs.length, 3);
  const all = d1.blocs.flatMap((x) => x.guilds);
  assert.equal(new Set(all).size, all.length);               // nobody in two blocs
  assert.ok(new Set(d1.blocs.map((x) => x.name)).size === 3);
});

test('guild names, tags, levels, perks and berths', () => {
  const n = D.genGuildName(new RNG(5));
  assert.equal(n, D.genGuildName(new RNG(5)));
  assert.equal(D.tagFromName('Azure Wardens'), 'AWZ');
  assert.equal(D.cleanTag('a-b!c9xyz'), 'ABC9');
  assert.equal(D.cleanName('  <b>Hi</b>   there '), 'bHi/b there');
  const g = D.newGuild('Iron Lancers');
  assert.equal(g.tag.length >= 3 && g.tag.length <= 4, true);
  assert.equal(D.guildLevel(0).level, 1);
  assert.equal(D.guildLevel(D.guildXpFor(1)).level, 2);
  assert.equal(D.guildLevel(1e9).level, D.GUILD_MAX_LEVEL);
  // perks stay small: the ceiling is +8% XP, +8% credits, +1.5% hull per kill, and nothing else
  g.xp = 1e9; g.upgrades = { college: 9, quarter: 9, drydock: 9, barracks: 9 };
  const p = D.guildPerks(g);
  assert.deepEqual(Object.keys(p).sort(), ['credits', 'salvage', 'xp']);
  assert.ok(Math.abs(p.xp - 0.08) < 1e-9 && Math.abs(p.credits - 0.08) < 1e-9 && Math.abs(p.salvage - 0.015) < 1e-9);
  assert.deepEqual(D.guildPerks(null), {});
  assert.equal(D.rosterCap(D.newGuild('Abc')), 8);
  assert.equal(D.rosterCap(g), 6 + 20 + 12);
  assert.ok(D.upgradeCost('college', 1).glass > D.upgradeCost('college', 0).glass);
});

test('captains: generation, invitation rules, promotion', () => {
  const c = D.genCaptain(42, 17), c2 = D.genCaptain(42, 17);
  assert.deepEqual(c, c2);
  assert.ok(CHASSIS_BY_ID[c.chassis] && c.level === 17);
  const taken = new Set([c.name]);
  assert.notEqual(D.genCaptain(42, 17, taken).name, c.name);
  const base = { guildLevel: 3, tier: 1, playerLevel: 20, capLevel: 20, cha: 0.5, members: 2, cap: 10 };
  const p0 = D.inviteChance(base);
  assert.ok(p0 > 0.3 && p0 < 0.8);
  assert.ok(D.inviteChance({ ...base, inParty: true }) > p0);            // you already sail together
  assert.ok(D.inviteChance({ ...base, otherGuild: 'TIDE' }) < p0);        // wears other colours
  assert.ok(D.inviteChance({ ...base, capLevel: 30 }) < p0);              // outranks you
  assert.ok(D.inviteChance({ ...base, guildLevel: 8 }) > p0);             // renown
  assert.ok(D.inviteChance({ ...base, cha: 1 }) > D.inviteChance({ ...base, cha: 0 }));
  assert.equal(D.inviteChance({ ...base, members: 10 }), 0);              // roster full
  assert.equal(D.inviteRoll('Thorne', 'Iron Lancers', 0), D.inviteRoll('Thorne', 'Iron Lancers', 0));
  assert.notEqual(D.inviteRoll('Thorne', 'Iron Lancers', 0), D.inviteRoll('Thorne', 'Iron Lancers', 1));
  const g = D.newGuild('Iron Lancers'), m = D.memberFrom(g, c);
  assert.equal(g.members.length, 1); assert.equal(m.id, 1); assert.equal(m.rank, 0);
  assert.equal(D.promotionDue(m), false); m.deeds = 8; assert.equal(D.promotionDue(m), true);
  m.rank = 2; m.deeds = 999; assert.equal(D.promotionDue(m), false);     // Commander is the guildmaster's call
  const s = D.memberStatus(m, 3); assert.deepEqual(s, D.memberStatus(m, 3)); assert.equal(typeof s.text, 'string');
});

test('alliance proposals follow standing, strength and temperament', () => {
  const ctx = { standing: 0, mine: 50, theirs: 50, temperament: 'honourable' };
  assert.equal(D.allianceChance({ ...ctx, standing: -30 }), 0);                               // enemies do not treat
  assert.ok(D.allianceChance({ ...ctx, standing: 60 }) > D.allianceChance(ctx));
  assert.ok(D.allianceChance({ ...ctx, temperament: 'warlike', mine: 80 }) > D.allianceChance({ ...ctx, temperament: 'warlike', mine: 20 }));
  assert.ok(D.allianceChance({ ...ctx, temperament: 'mercantile', bank: 9000 }) > D.allianceChance({ ...ctx, temperament: 'mercantile', bank: 0 }));
  assert.ok(D.allianceChance({ ...ctx, temperament: 'reclusive' }) < D.allianceChance({ ...ctx, temperament: 'opportunist' }));
  assert.ok(D.allianceChance({ ...ctx, standing: 100, mine: 500 }) <= 0.95);

  const guilds = D.genNpcGuilds(), d = D.newDiplomacy(7331, guilds);
  const inBloc = d.blocs[0].guilds[0], free = guilds.find((g) => !D.blocOf(d, g.tag)).tag;
  // refused: the roll is above the chance; the attempt is counted
  let r = D.proposeAlliance(d, guilds, inBloc, { mine: 40 }, 0.999);
  assert.equal(r.ok, false); assert.equal(d.player, null); assert.equal(d.attempts[inBloc], 1);
  // accepted: you join the bloc that guild is in, and its members warm to you
  r = D.proposeAlliance(d, guilds, inBloc, { mine: 40 }, 0);
  assert.equal(r.ok, true); assert.equal(d.player, d.blocs[0].id); assert.equal(d.standing[inBloc], 15);
  assert.equal(D.proposeAlliance(d, guilds, free, {}, 0).ok, false);                          // already sworn
  const left = D.leaveAlliance(d);
  assert.equal(left.id, d.blocs[0].id); assert.equal(d.player, null); assert.equal(d.standing[inBloc], -5);
  // an independent guild founds a new, named bloc with you
  d.standing[free] = 50;
  r = D.proposeAlliance(d, guilds, free, { mine: 60, name: 'The Test Pact' }, 0);
  assert.equal(r.ok, true); assert.equal(r.bloc.name, 'The Test Pact'); assert.equal(d.blocs.length, 4); assert.equal(D.playerBloc(d), r.bloc);
  // a pact of one dissolves when you walk out
  D.leaveAlliance(d);
  assert.equal(d.blocs.length, 3);
  // no fifth bloc
  const d2 = D.newDiplomacy(7331, guilds);
  d2.blocs.push({ id: 'bx', name: 'X', color: '#fff', guilds: [] });
  assert.equal(D.proposeAlliance(d2, guilds, free, { mine: 99 }, 0).ok, false);
  assert.equal(D.shiftStanding(d2, inBloc, 500), 100); assert.equal(D.shiftStanding(d2, inBloc, -500), -100);
});

test('the diplomatic map drifts but always keeps 2-4 alliances and one home per guild', () => {
  const guilds = D.genNpcGuilds(), d = D.newDiplomacy(7331, guilds), rng = new RNG(11);
  let events = 0;
  const kinds = new Set();
  for (let i = 0; i < 600; i++) {
    const line = D.diplomacyDrift(d, guilds, rng);
    if (line) { events++; kinds.add(line.split(' ').slice(-2).join(' ')); }
    assert.ok(d.blocs.length >= D.MIN_BLOCS && d.blocs.length <= D.MAX_BLOCS, `blocs ${d.blocs.length} at step ${i}`);
    const all = d.blocs.flatMap((b) => b.guilds);
    assert.equal(new Set(all).size, all.length);
  }
  assert.ok(events > 300);
  // the captain's own alliance is never dissolved from under them
  const d2 = D.newDiplomacy(7331, guilds);
  D.proposeAlliance(d2, guilds, d2.blocs[1].guilds[0], { mine: 50 }, 0);
  const mine = d2.player, r2 = new RNG(3);
  for (let i = 0; i < 600; i++) { D.diplomacyDrift(d2, guilds, r2); assert.ok(d2.blocs.some((b) => b.id === mine)); }
});

test('contested zones: placement, capture and control ticks', () => {
  const ids = D.contestedSystems(), S = galaxy().systems;
  assert.deepEqual(ids, D.contestedSystems());
  assert.ok(ids.length >= 10 && ids.length <= 20 && !ids.includes(0));
  assert.ok(ids.some((id) => S[0].links.includes(id)));                 // one next door to home
  for (const id of ids) {
    const z = D.zoneFor(S[id]), det = systemDetail(S[id]);
    assert.equal(z.points.length, 3);
    for (const pz of det.zones) assert.ok(Math.hypot(pz.x - z.x, pz.z - z.z) > 3000, `${z.name} sits on a PvE zone`);
    assert.ok(Math.hypot(z.points[0].x - z.points[1].x, z.points[0].z - z.points[1].z) > D.POINT_RADIUS * 2);
  }
  // one ship takes CAPTURE_TIME; three take it faster; a contested point is frozen
  const pt = { owner: null, cap: null, prog: 0 };
  let t = 0; while (D.captureStep(pt, { a: 1, b: 0 }, 0.1) !== 'captured') { t += 0.1; assert.ok(t < 60); }
  assert.ok(Math.abs(t - D.CAPTURE_TIME) < 0.3); assert.equal(pt.owner, 'a');
  const p3 = { owner: null, cap: null, prog: 0 };
  let t3 = 0; while (D.captureStep(p3, { a: 3 }, 0.1) !== 'captured') t3 += 0.1;
  assert.ok(t3 < t * 0.65);
  assert.equal(D.captureStep(pt, { a: 1 }, 1), null); assert.equal(pt.prog, 0);       // the owner standing on it changes nothing
  for (let i = 0; i < 50; i++) D.captureStep(pt, { b: 1 }, 0.1);
  const mid = pt.prog; assert.ok(mid > 0.3 && pt.owner === 'a' && pt.cap === 'b');
  assert.equal(D.captureStep(pt, { a: 1, b: 1 }, 5), 'contested'); assert.equal(pt.prog, mid);
  for (let i = 0; i < 400; i++) D.captureStep(pt, {}, 0.1);                             // abandoned: the claim fades
  assert.equal(pt.prog, 0); assert.equal(pt.owner, 'a');
  // a's defender undoes b's half-made claim before anything else happens
  for (let i = 0; i < 50; i++) D.captureStep(pt, { b: 2 }, 0.1);
  assert.ok(pt.prog > 0); D.captureStep(pt, { a: 1 }, 0.1); assert.equal(pt.prog, 0);
  // payouts: holding all three is worth more than three singles
  assert.equal(D.controlTick(['x', 'x', null], 'x'), D.CONTROL_PAY[2]);
  assert.equal(D.controlTick(['x', 'y', null], 'z'), 0);
  assert.ok(D.CONTROL_PAY[3] > 3 * D.CONTROL_PAY[1]);
});

test('fields change hands while you are away and bank a capped trickle for your side', () => {
  const guilds = D.genNpcGuilds(), d = D.newDiplomacy(7331, guilds), sys = galaxy().systems[D.contestedSystems()[0]];
  const st = D.newZoneState();
  D.simulateZone(st, d, guilds, sys, new RNG(1), 40);
  assert.ok(st.own.every((o) => d.blocs.some((b) => b.id === o)));
  const st2 = D.newZoneState(); D.simulateZone(st2, d, guilds, sys, new RNG(1), 40);
  assert.deepEqual(st, st2);                                                 // same seed, same history
  assert.equal(st.income, 0);                                                // nobody's side: nothing banked
  d.player = d.blocs[0].id;
  D.simulateZone(st, d, guilds, sys, new RNG(2), 2000, 500);
  assert.ok(st.income > 0 && st.income <= D.ZONE_INCOME_CAP);
  const flips = new Set(); const r = new RNG(9);
  for (let i = 0; i < 200; i++) { D.simulateZone(st, d, guilds, sys, r, 1); flips.add(st.own.join()); }
  assert.ok(flips.size > 5);
  assert.equal(D.zoneHolder({ own: ['a', 'a', 'b'] }), 'a'); assert.equal(D.zoneHolder({ own: ['a', 'c', 'b'] }), null);
});

test('rating, tiers and matchmaking', () => {
  assert.equal(D.expectedScore(1000, 1000), 0.5);
  assert.ok(D.expectedScore(1200, 1000) > 0.75 && D.expectedScore(1200, 1000) < 0.77);
  assert.equal(D.ratingChange(1000, 1000, 1), 12); assert.equal(D.ratingChange(1000, 1000, 0), -12); assert.equal(D.ratingChange(1000, 1000, 0.5), 0);
  assert.equal(D.ratingChange(1000, 1000, 1, 3), 20);                         // placement games move faster
  assert.ok(D.ratingChange(1000, 1300, 1) > D.ratingChange(1000, 900, 1));    // beating the better captain pays more
  assert.equal(D.ratingChange(1000, 1200, 1) + D.ratingChange(1200, 1000, 0), 0);
  assert.equal(D.tierFor(1000).k, 'bronze'); assert.equal(D.tierFor(1080).k, 'silver'); assert.equal(D.tierFor(5000).k, 'void');
  assert.equal(D.tierFor(5000).next, null);
  const t = D.tierFor(1140); assert.ok(Math.abs(t.progress - 0.5) < 1e-9 && t.next.k === 'gold');
  for (let i = 1; i < D.TIERS.length; i++) assert.ok(D.TIERS[i].min > D.TIERS[i - 1].min);
  // opponents sit near your rating; a winning streak pulls stronger ones
  const rng = new RNG(4); let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 300; i++) { const o = D.opponentRating(1300, rng); lo = Math.min(lo, o); hi = Math.max(hi, o); }
  assert.ok(lo >= 1250 && hi <= 1350);
  assert.ok(D.opponentRating(1300, new RNG(1), 3) - D.opponentRating(1300, new RNG(1), -3) === 150);
  // power rises with rating and is exactly the calibration point at the start rating
  const p0 = D.botPower(D.START_RATING), p1 = D.botPower(1400), pl = D.botPower(700);
  assert.equal(p0.power, 1); assert.ok(p1.power > 1 && pl.power < 1);
  assert.ok(D.botPower(99999).power <= 1.7 && D.botPower(-99999).power >= 0.55);
  // pools and damage come from the balance contract: the expected captain needs BOT.kill seconds of
  // landed fire to sink a peer, and a peer needs BOT.die seconds to sink him — at every rank
  for (const L of [3, 15, 30, 55]) {
    const E = expectedPlayer(L), P = { ...E, ...E.full }, T = D.pvpTargets(L);
    assert.ok(Math.abs(T.pool / (P.dps * D.pvpEngage(L)) - D.BOT.kill) < 1e-6);
    assert.ok(T.dps * P.mit >= P.ehp / D.BOT.die && T.dps * P.mit < P.ehp / D.BOT.die * 1.6, `L${L}`);
    const hi = D.pvpTargets(L, D.BOT, p1.power), lo = D.pvpTargets(L, D.BOT, pl.power);
    assert.ok(hi.pool > T.pool && hi.dps > T.dps && lo.pool < T.pool && lo.dps < T.dps);
    const z = D.pvpTargets(L, D.ZONE_BOT);
    assert.ok(z.pool < T.pool && z.dps < T.dps);                           // open-space captains are the lighter fight
    // a single captain stays inside the per-source cap the captain is protected by (MIN_TTK)
    assert.ok(T.dps * P.mit < dpsCapVs(P.ehp));
  }
  const w = (p, k) => p.rarity.find((r) => r[0] === k)[1];
  assert.ok(w(p1, 'epic') > w(p0, 'epic') && w(p1, 'uncommon') < w(p0, 'uncommon') && w(p0, 'legendary') === 0);
  // the duel ladder
  const L = D.duelLadder(); assert.deepEqual(L, D.duelLadder()); assert.equal(L.length, 20);
  for (let i = 1; i < L.length; i++) assert.ok(L[i].rating <= L[i - 1].rating);
  assert.equal(D.ladderRank(L, 99999), 1); assert.equal(D.ladderRank(L, 0), 21);
  const opp = D.duelOpponent(L, 1000, new RNG(2)); assert.ok(Math.abs(opp.rating - 1000) < 150);
});

test('match rewards and the quartermaster', () => {
  for (const k of Object.keys(D.MODES)) {
    const win = D.matchRewards(k, 1, 20, 0, { kills: 3 }), loss = D.matchRewards(k, 0, 20, 0, { kills: 3 }), draw = D.matchRewards(k, 0.5, 20, 0, { kills: 3 });
    assert.ok(win.honour > draw.honour && draw.honour > loss.honour && loss.honour > 0, k);
    assert.ok(win.glass > draw.glass && draw.glass >= loss.glass && loss.glass === 1, k);
    assert.ok(win.credits > loss.credits && loss.credits > 0);
    assert.ok(D.matchRewards(k, 1, 20, 3).glass === win.glass + 3);          // higher tiers earn more Voidglass
    assert.ok(D.matchRewards(k, 1, 20, 0, { kills: 999 }).honour - D.matchRewards(k, 1, 20, 0, {}).honour === 50);   // kill bonus is capped
    // an arena win is not a better credit faucet than a few minutes of PvE at the same rank
    assert.ok(win.credits <= (150 + 60 * 20) * 1.3);
  }
  const a = D.vendorStock(1, 5, 30), b = D.vendorStock(1, 5, 30), c = D.vendorStock(1, 6, 30);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.gear.map((g) => g.base + g.seed), c.gear.map((g) => g.base + g.seed));   // it rotates
  assert.equal(a.gear.length, 3); assert.equal(a.cosmetics.length, 3);
  for (const g of a.gear) assert.ok(BASES[g.base] && g.ilvl === 30 && g.glass > 0 && g.honour > 0);
  assert.equal(a.gear.filter((g) => g.rarity === 'legendary').length, 1);
  const pvp = D.newPvp(), e = a.gear[0];
  assert.match(D.canBuy(pvp, e, 0), /Voidglass/);
  pvp.voidglass = 999; assert.match(D.canBuy(pvp, e, 0), /honour/);
  pvp.honour = 9999; assert.equal(D.canBuy(pvp, e, 0), null);
  assert.match(D.canBuy(pvp, a.gear[2], 0), /Gold/); assert.equal(D.canBuy(pvp, a.gear[2], 2), null);
  for (const cs of D.COSMETICS) assert.ok(cs.type === 'title' || D.EMBLEM_BY_KEY[cs.value].exclusive);
  assert.equal(pvp.rating, D.START_RATING);
});
