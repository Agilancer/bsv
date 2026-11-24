// What the bridge officers say, and the orders the captain can give them. Lines are built from the live game: hull and
// shields, hostiles on sensors, loot drifting nearby, the crew's state, the star system. Every order does something real.
import * as THREE from 'three/webgpu';
import { DEPTS, OFFICER_POSTS, avgMorale, deptReport } from '../crew/data.js';
import { RARITY } from '../data/items.js';
import { ABILITY_BY_KEY } from '../data/abilities.js';
import { THROTTLE_STEPS } from '../ship/Ship.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pct = (f) => `${Math.round(f * 100)}%`;
const _v = new THREE.Vector3();
const PLANET_WORDS = { terran: 'a temperate world', desert: 'a desert world', arid: 'an arid world', ice: 'an ice world', lava: 'a molten world', barren: 'a barren rock', toxic: 'a toxic world', crystal: 'a crystal world', gas: 'a gas giant', gasblue: 'a blue gas giant', gaspurple: 'a violet gas giant' };

export function situation(game) {
  const s = game.player, W = game.world;
  const out = { s, hostiles: [], threat: null, hullF: 1, shieldF: 1, drops: [], best: null, alert: false };
  if (!s || !W) return out;
  out.hullF = Math.max(0, s.hull / s.maxHull);
  out.shieldF = s.shieldTotal() / (s.maxShield * 1.2);
  let ts = -1;
  for (const o of W.ships) {
    if (!o.alive || o === s || !W.hostile(s, o)) continue;
    const d = o.position.distanceTo(s.position);
    if (d > 2400) continue;
    out.hostiles.push(o);
    const score = o.level * (1 + o.elite * 2.5) * (1 + o.chassis.tier * 0.4) * (d < 1200 ? 1.3 : 1);
    if (score > ts) { ts = score; out.threat = o; }
  }
  out.hostiles.sort((a, b) => a.position.distanceToSquared(s.position) - b.position.distanceToSquared(s.position));
  out.alert = out.hostiles.some((o) => o.position.distanceTo(s.position) < 1700 && (o.faction !== 'rival' || o.provoked));
  for (const d of W.loot.drops) if (d.type === 'item' && d.pos.distanceTo(s.position) < 2000) { out.drops.push(d); if (!out.best || RARITY[d.item.rarity].i > RARITY[out.best.item.rarity].i) out.best = d; }
  return out;
}

function shipWord(o) { return `${o.elite === 2 ? 'the dread ship ' : o.elite ? 'a champion ' : ''}${o.chassis.cls.toLowerCase()} ${o.elite === 2 ? o.name.split(',')[0] : ''}`.trim(); }
function bearing(s, o) {
  _v.copy(o.position).sub(s.position);
  const a = Math.atan2(_v.x, _v.z) - s.heading;
  const deg = ((a * 180 / Math.PI) % 360 + 540) % 360 - 180;
  const side = Math.abs(deg) < 30 ? 'dead ahead' : Math.abs(deg) > 150 ? 'astern' : deg > 0 ? 'off the port bow' : 'off the starboard bow';
  return `${side}, ${Math.round(o.position.distanceTo(s.position) / 10) * 10} out`;
}

// ---------------------------------------------------------------- per post
// talk(post, game, bridge) -> { line, options: [{ label, run() -> reply | undefined, cd }] }
export function talk(post, game, bridge) {
  const sit = situation(game), s = sit.s, crew = game.crew, st = crew.state, ch = crew.chassis;
  const rep = deptReport(st, ch);
  const cd = (k, sec) => { const left = (bridge.cd[k] || 0) - game.engine.time; if (left > 0) return `Still recharging — ${Math.ceil(left)} seconds, Captain.`; bridge.cd[k] = game.engine.time + sec; return null; };
  const can = (k) => ABILITY_BY_KEY[k] && game.data.level >= ABILITY_BY_KEY[k].unlock;
  const opts = [];
  let line = '';
  const dead = !s || !s.alive;
  switch (post) {
    case 'xo': {
      const m = avgMorale(st), wounded = st.members.filter((x) => x.status === 'wounded').length;
      const short = Object.values(rep).filter((d) => d.req && d.n < d.req).sort((a, b) => a.n / a.req - b.n / b.req);
      const sys = game.sector && game.sector.sys;
      line = `${st.members.length} souls aboard, morale ${Math.round(m)}%${wounded ? `, ${wounded} in sickbay` : ''}. `
        + (short.length ? `We're short-handed in ${short.slice(0, 2).map((d) => DEPTS[d.key].name).join(' and ')}.` : 'Every station is manned.')
        + (sys ? ` ${sys.name} is rated danger ${sys.danger}; ${game.data.kills} kills logged so far.` : '');
      opts.push({ label: 'Rally the crew', run: () => cd('rally', 120) || (crew.rally(10), `Aye, Captain. A word from you goes a long way — morale is up across the ship.`) });
      opts.push({ label: 'Department report', run: () => Object.values(rep).filter((d) => d.req).sort((a, b) => a.perf - b.perf).slice(0, 3).map((d) => `${DEPTS[d.key].name} at ${pct(d.perf)} (${d.n}/${d.req})`).join(', ') + '. Those want attention first.' });
      opts.push({ label: 'Show me the crew roster', run: () => { bridge.openCrew('roster'); return 'Bringing up the roster.'; } });
      opts.push({ label: 'Show me the deck plan', run: () => { bridge.openCrew('decks'); return 'On your display, Captain.'; } });
      break;
    }
    case 'helm': {
      if (dead) { line = 'Helm is dead, Captain. We are adrift.'; break; }
      const step = THROTTLE_STEPS.reduce((b, t) => (Math.abs(t - s.throttle) < Math.abs(b - s.throttle) ? t : b), 0);
      line = `Making ${Math.round(Math.abs(s.speed))} of ${Math.round(s.maxSpeed)}, ${step > 0 ? `${Math.round(step * 100)}% ahead` : step < 0 ? 'astern' : 'all stop'}. `
        + (sit.threat ? `I can put us broadside-on to the ${shipWord(sit.threat)} — it's ${bearing(s, sit.threat)}.` : 'Course is clear.');
      if (can('evasive')) opts.push({ label: 'Evasive pattern!', run: () => game.useAbility('evasive') ? 'Evasive pattern delta — hold on to something!' : 'Engines are still cycling from the last one.' });
      opts.push({ label: 'All ahead full', run: () => { s.throttle = 1; game.moveTarget = null; return 'All ahead full, aye.'; } });
      opts.push({ label: 'All stop', run: () => { s.throttle = 0; game.moveTarget = null; return 'Answering all stop.'; } });
      if (sit.threat) opts.push({ label: 'Bring our broadside to bear', run: () => { bridge.broadsideOn = sit.threat; return 'Coming about to present the port battery.'; } });
      else opts.push({ label: 'Bring us about', run: () => { game.moveTarget = s.position.clone().addScaledVector(_v.set(-Math.sin(s.heading), 0, -Math.cos(s.heading)), s.dims.L * 4); return 'Coming about, one-eighty.'; } });
      break;
    }
    case 'tactical': {
      if (dead) { line = 'Weapons are offline.'; break; }
      const tg = s.target && s.target.alive ? s.target : null;
      line = sit.hostiles.length
        ? `${sit.hostiles.length} hostile${sit.hostiles.length > 1 ? 's' : ''} on the board. ${sit.threat ? `Biggest threat: ${sit.threat.name}, level ${sit.threat.level}, ${bearing(s, sit.threat)}.` : ''} ${tg ? `Locked on ${tg.name} — hull at ${pct(tg.hull / tg.maxHull)}.` : 'No firing solution yet.'}`
        : `Weapons ready, nothing on the board. Auto-fire is ${s.autoFire ? 'on' : 'off'}.`;
      if (sit.threat) opts.push({ label: 'Concentrate fire on the biggest threat', run: () => { s.target = sit.threat; return `Target locked: ${sit.threat.name}. All batteries.`; } });
      if (sit.hostiles.length) opts.push({ label: 'Target the nearest hostile', run: () => { s.target = sit.hostiles[0]; return `Nearest hostile locked — ${sit.hostiles[0].name}.`; } });
      opts.push({ label: 'Broadside volley!', run: () => game.useAbility('volley') ? 'Broadside — fire!' : (tg ? 'No battery bears on the target yet.' : 'We need a target first.') });
      if (can('torpspread')) opts.push({ label: 'Torpedo spread', run: () => game.useAbility('torpspread') ? 'Five fish away.' : 'Tubes aren\'t ready.' });
      opts.push({ label: s.autoFire ? 'Hold fire' : 'Weapons free', run: () => { s.autoFire = !s.autoFire; return s.autoFire ? 'Weapons free. Gun crews firing at will.' : 'Holding fire.'; } });
      break;
    }
    case 'eng': {
      if (dead) { line = 'The core is cold, Captain.'; break; }
      const fires = Object.keys(st.fires || {}).length;
      line = `Hull integrity ${pct(sit.hullF)}, shields ${pct(Math.min(1, sit.shieldF))}. Reactor ${rep.engineering.perf > 0.8 ? 'running sweet' : rep.engineering.perf > 0.5 ? 'holding' : 'struggling — I need more hands down here'}.`
        + (fires ? ` Fires on ${fires} section${fires > 1 ? 's' : ''}; damage control is on it.` : '');
      opts.push({ label: 'Reroute power to shields', run: () => cd('reroute', 45) || (bridge.reroute(), 'Pulling power from the drive — shields coming up. Speed will suffer for a bit.') });
      opts.push({ label: 'Emergency repairs', run: () => cd('repair', 75) || (s.repair(s.maxHull * (0.05 + rep.damage.perf * 0.05)), game.crew.douse(), 'Patch teams sealing breaches now.') });
      if (can('overcharge')) opts.push({ label: 'Overcharge the batteries', run: () => game.useAbility('overcharge') ? 'Overcharging. The guns will run hot.' : 'Capacitors are still recovering.' });
      else opts.push({ label: 'Squeeze more out of the guns', run: () => cd('squeeze', 60) || (s.buffs.overcharge = game.engine.time + 4, 'A few seconds of overcharge — that\'s all she\'ll give.') });
      break;
    }
    case 'science': {
      const d = game.sector && game.sector.detail, sys = game.sector && game.sector.sys;
      line = d ? `${sys.name}: a ${d.star.k || 'yellow'} star, ${d.planets.length} planets${d.belts.length ? ', an asteroid belt' : ''}${d.stations.length ? `, ${d.stations.length} station${d.stations.length > 1 ? 's' : ''}` : ''}. ${sit.best ? `I read a ${RARITY[sit.best.item.rarity].name.toLowerCase()} signature in the debris.` : 'No notable salvage on sensors.'}` : 'Sensors nominal.';
      opts.push({ label: 'Scan the system', run: () => d ? d.planets.slice(0, 5).map((p) => `${p.name} — ${PLANET_WORDS[p.type] || p.type}${p.landable ? `, landable, resources ${'▮'.repeat(p.resources)}` : ''}${p.moons.length ? `, ${p.moons.length} moon${p.moons.length > 1 ? 's' : ''}` : ''}`).join('; ') + '.' : 'Nothing to scan.' });
      const tg = s && s.target && s.target.alive ? s.target : null;
      if (tg) opts.push({ label: 'Analyse the target', run: () => `${tg.name}: ${tg.chassis.fullName}, level ${tg.level}. Shields ${pct(tg.shieldTotal() / (tg.maxShield * 1.2))}, hull ${pct(tg.hull / tg.maxHull)}. ${tg.shieldsUp() ? 'Energy weapons will strip those shields; save the torpedoes for bare hull.' : 'Shields are down — kinetic and explosive rounds will tell.'}` });
      opts.push({ label: bridge.viewMode === 'tactical' ? 'Forward view on screen' : 'Tactical plot on screen', run: () => { bridge.viewMode = bridge.viewMode === 'tactical' ? 'forward' : 'tactical'; return 'On screen.'; } });
      if (sit.best) opts.push({ label: 'Where is that signature?', run: () => `${sit.best.item.name}, ${bearing(s, { position: sit.best.pos })}.` });
      break;
    }
    case 'medical': {
      const wounded = st.members.filter((x) => x.status === 'wounded');
      const lost = st.log.filter((l) => /killed|did not reach/.test(l.text)).length;
      line = wounded.length ? `${wounded.length} in sickbay${wounded.length > 2 ? ' — we are stretched thin' : ''}. ${lost ? 'We\'ve lost people this tour, Captain. They feel it.' : 'No one I can\'t save, so far.'}` : `Sickbay is quiet. Crew morale reads ${Math.round(avgMorale(st))}%.`;
      if (wounded.length) opts.push({ label: 'Prioritise the critically wounded', run: () => cd('triage', 90) || (crew.triage(), 'Triage protocol — the worst cases first. Most will be back on duty shortly.') });
      opts.push({ label: 'How is the crew holding up?', run: () => { const low = st.members.filter((x) => x.morale < 45).length; return low ? `${low} of them are close to breaking. Shore leave, a win, a word from you — anything helps.` : 'Tired, but steady. They trust you.'; } });
      opts.push({ label: 'Send stims to the gun decks', run: () => cd('stims', 120) || (crew.rally(4, 'tactical'), 'The gun crews will keep their edge a while longer.') });
      break;
    }
    case 'flight': {
      const craft = s ? s.weapons.filter((w) => w.hp.type === 'hangar').reduce((n, w) => n + (w.wing ? w.wing.length : 0), 0) : 0;
      line = `${s && s.weapons.some((w) => w.hp.type === 'hangar') ? `${craft} craft in flight.` : 'No hangar bays on this hull — just the shuttles.'} ${sit.drops.length ? `${sit.drops.length} salvage pod${sit.drops.length > 1 ? 's' : ''} drifting within range.` : 'Nothing to recover out there.'}`;
      if (can('launch')) opts.push({ label: 'Scramble the wings', run: () => game.useAbility('launch') ? 'All wings, launch launch launch!' : 'Deck crews are still rearming.' });
      if (sit.drops.length || game.world.loot.drops.length) opts.push({ label: 'Send shuttles for the salvage', run: () => cd('shuttles', 40) || (bridge.recover(), 'Shuttles away. They\'ll tow everything in.') });
      opts.push({ label: 'Status of the flight deck', run: () => `Deck crew at ${pct(rep.hangar.perf || 0)} efficiency, ${rep.hangar.n} hands.` });
      break;
    }
  }
  opts.push({ label: 'Carry on', close: true });
  return { line, options: opts };
}

// unprompted remarks: the most pressing thing any officer would raise. Returns { post, line } or null.
export function chatter(game, bridge, officers) {
  const sit = situation(game), s = sit.s, now = game.engine.time;
  if (!s || !s.alive) return null;
  const have = (p) => officers[p];
  const said = bridge.said;
  const once = (k, gap) => { if ((said[k] || -1e9) + gap > now) return false; said[k] = now; return true; };
  const cands = [];
  if (sit.hullF < 0.35 && have('eng') && once('hull', 25)) cands.push(['eng', pick([`Hull at ${pct(sit.hullF)}! She can't take much more of this!`, `We're venting atmosphere on three decks — hull ${pct(sit.hullF)}.`])]);
  if (sit.shieldF < 0.15 && sit.alert && have('tactical') && once('shields', 20)) cands.push(['tactical', pick(['Shields are failing!', 'Our shields are down — turn a fresh facing to them!'])]);
  if (sit.alert && sit.threat && have('tactical') && once('contact:' + sit.threat.id, 60)) cands.push(['tactical', `Contact — ${sit.threat.name}, ${bearing(s, sit.threat)}.${sit.threat.elite === 2 ? ' That\'s a dread captain, sir.' : ''}`]);
  if (sit.best && RARITY[sit.best.item.rarity].i >= 3 && have('science') && once('loot:' + sit.best.item.uid, 600)) cands.push(['science', `Reading a ${RARITY[sit.best.item.rarity].name.toLowerCase()} signature in the wreckage — ${sit.best.item.name}.`]);
  if (!sit.alert && sit.hostiles.length === 0 && have('helm') && once('quiet', 90)) cands.push(['helm', pick(['Quiet out here, Captain.', 'Holding course. Nice view of the nebula from up here.', 'Helm standing by.'])]);
  const wounded = game.crew.state.members.filter((m) => m.status === 'wounded').length;
  if (wounded >= 3 && have('medical') && once('wounded', 45)) cands.push(['medical', `${wounded} wounded in sickbay. I could use a few more hands down there.`]);
  if (!sit.alert && have('xo') && once('xo', 120)) cands.push(['xo', pick([`Morale's at ${Math.round(avgMorale(game.crew.state))}%, Captain.`, 'The crew is ready for whatever you have in mind.', `We've ${game.data.kills} kills logged this commission.`])]);
  if (!sit.alert && have('eng') && once('engidle', 150)) cands.push(['eng', pick(['Reactor\'s purring, Captain.', 'If you keep her out of trouble I might finally recalibrate the drive.'])]);
  if (!cands.length) return null;
  const [post, line] = cands[0];
  return { post, line };
}

export function postName(post) { return OFFICER_POSTS[post] ? OFFICER_POSTS[post].name : post; }
