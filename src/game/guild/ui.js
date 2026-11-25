// Guild and PvP interface: the Guild window (roster, perks & bank, recruiting, diplomacy), the PvP
// window (queue, contested zones, ladder, quartermaster), and the in-space HUD for zones and
// matches (score, capture bars, timer, kill feed, result screen). Styles: css/guild.css.
import * as THREE from 'three/webgpu';
import { RNG } from '../../engine/rng.js';
import { galaxy } from '../galaxy.js';
import { CHASSIS_BY_ID } from '../data/chassis.js';
import { makeItem, RARITY, BASES } from '../data/items.js';
import { INV_SIZE } from '../Player.js';
import * as D from './data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => `${Math.round(v * 100)}%`;
const mmss = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const _p = new THREE.Vector3();

export function installGuildUI(game, G) {
  if (typeof document === 'undefined') return;
  if (!document.querySelector('link[data-guild]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/guild.css'; l.dataset.guild = '1';
    document.head.append(l);
  }
  const S = galaxy().systems, sym = D.RESOURCE.sym;
  let gTab = 'roster', pTab = 'queue', renaming = false;
  const draft = { name: '', tag: '', emblem: 'azure' };
  let hud, marks, result, board, showBoard = false;
  const sig = { guild: '', pvp: '' };

  const typing = (el) => { const a = document.activeElement; return !!(a && el.contains(a) && a.tagName === 'INPUT'); };
  const tag = (t) => (t ? `<span class="g-tag">&lt;${esc(t)}&gt;</span> ` : '');
  const tabs = (cur, list, act) => `<div class="g-tabs">${list.map(([k, n]) => `<button class="btn${cur === k ? ' on' : ''}" data-act="${act}" data-arg="${k}">${n}</button>`).join('')}</div>`;
  const swatches = (cur) => `<div class="g-sw">${D.EMBLEMS.filter((e) => !e.exclusive || G.pvp.owned.includes('emblem_' + e.k)).map((e) => `<button class="sw${cur === e.k ? ' on' : ''}" data-act="emblem" data-arg="${e.k}" title="${e.name}" style="--c:${e.color}"></button>`).join('')}</div>`;

  // ------------------------------------------------------------------ guild window
  function renderGuild() {
    const win = game.ui.windows.guild, body = win.querySelector('.wbody');
    if (typing(body)) return;
    const top = win.scrollTop, btop = body.scrollTop, g = G.g;
    if (!g) {
      if (!draft.name) { draft.name = G.suggestName(); draft.tag = D.tagFromName(draft.name); }
      body.innerHTML = `<div class="g-found">
        <div class="label">Found a guild</div>
        <p class="g-note">A charter costs nothing. Captains you meet can be invited to sail under your colours; the guild grows from their deeds and yours, and can swear alliances to fight over ${D.RESOURCE.name}. Left alone, an autoplay captain's crew will charter one in your name — you can rename it whenever you like.</p>
        <div class="g-form"><label>Name<input id="gName" maxlength="28" value="${esc(draft.name)}"></label><label>Tag<input id="gTag" maxlength="4" value="${esc(draft.tag)}"></label></div>
        <div class="label">Emblem colour</div>${swatches(draft.emblem)}
        <div class="g-row"><button class="btn" data-act="found">Found guild</button><button class="btn violet" data-act="suggest">Suggest a name</button></div></div>`;
      return;
    }
    const lv = D.guildLevel(g.xp), cap = D.rosterCap(g), d = G.diplo, bloc = D.playerBloc(d), em = D.EMBLEM_BY_KEY[g.emblem] || D.EMBLEMS[0];
    let h = `<div class="g-head"><div class="g-emblem" style="--c:${em.color}"></div><div class="g-id">
      <div class="g-name">${tag(g.tag)}${esc(g.name)}</div>
      <div class="g-sub">Guildmaster ${esc(game.data.name)}${G.pvp.title ? ', ' + esc(G.pvp.title) : ''} · ${g.members.length}/${cap} captains${bloc ? ` · <span style="color:${bloc.color}">${esc(bloc.name)}</span>` : ' · no alliance'}</div>
      <div class="bar xp"><i style="width:${lv.need ? Math.round(100 * lv.into / lv.need) : 100}%"></i><span>GUILD LEVEL ${lv.level}${lv.need ? ` · ${lv.into}/${lv.need}` : ' · MAX'}</span></div></div>
      <button class="btn" data-act="rename-open">${renaming ? 'Cancel' : 'Rename'}</button></div>`;
    if (renaming) h += `<div class="g-form"><label>Name<input id="gName" maxlength="28" value="${esc(g.name)}"></label><label>Tag<input id="gTag" maxlength="4" value="${esc(g.tag)}"></label><button class="btn" data-act="rename-save">Save</button></div>`;
    h += tabs(gTab, [['roster', 'Roster'], ['perks', 'Perks & Bank'], ['recruit', 'Recruit'], ['diplo', 'Diplomacy']], 'gtab');
    if (gTab === 'roster') h += roster(g);
    else if (gTab === 'perks') h += perks(g, lv);
    else if (gTab === 'recruit') h += recruit(g, cap);
    else h += diplomacy(g, d, bloc);
    body.innerHTML = h;
    win.scrollTop = top; body.scrollTop = btop;   // the body scrolls under a fixed title bar on desktop, the window on phones
  }
  function roster(g) {
    const slot = Math.floor((game.data.playtime || 0) / 300), pop = game.mmo;
    if (!g.members.length) return '<p class="g-note">No captains yet. Open the Recruit tab: local captains, your group and the recruiting board can all be asked.</p>';
    const rows = g.members.slice().sort((a, b) => b.rank - a.rank || b.level - a.level).map((m) => {
      const live = G.liveShip(m), st = live ? { online: true, text: live.partyMember ? 'Sailing with you' : `Here in ${game.sector.sys.name}` } : D.memberStatus(m, slot);
      const c = CHASSIS_BY_ID[m.chassis];
      return `<div class="g-mem"><div class="who"><b class="${st.online ? 'on' : 'off'}">●</b> ${esc(m.name)}<span class="rk">${D.RANKS[m.rank]}</span></div>
        <div class="meta">Rank ${m.level} · ${c ? esc(c.cls) : '—'} · ${m.deeds} deeds</div><div class="where">${esc(st.text)}</div>
        <div class="acts"><button class="btn" data-act="call" data-arg="${m.id}" ${live && live.partyMember || (pop && pop.party.length >= (pop.partyCap || 3)) ? 'disabled' : ''}>Call</button><button class="btn" data-act="up" data-arg="${m.id}" title="Promote" ${m.rank >= D.RANKS.length - 1 ? 'disabled' : ''}>▲</button><button class="btn" data-act="down" data-arg="${m.id}" title="Demote" ${m.rank <= 0 ? 'disabled' : ''}>▼</button><button class="btn bad" data-act="kick" data-arg="${m.id}">Kick</button></div></div>`;
    }).join('');
    return `<div class="g-list">${rows}</div><p class="g-note">Called captains join your group (up to ${(pop && pop.partyCap) || 3}) and follow you through jump gates. Members also turn up on their own, crew your side in contested zones and fill your team in the arenas.</p>`;
  }
  function perks(g, lv) {
    const p = D.guildPerks(g), pvp = G.pvp;
    let h = `<div class="g-cols"><div><div class="label">Guild perks (level ${lv.level})</div>
      <div class="g-perk">+${(100 * (p.xp || 0)).toFixed(1)}% commander XP</div><div class="g-perk">+${(100 * (p.credits || 0)).toFixed(1)}% credits from kills</div><div class="g-perk">+${(100 * (p.salvage || 0)).toFixed(1)}% hull patched per kill</div>
      <div class="label" style="margin-top:10px">Emblem</div>${swatches(g.emblem)}</div>
      <div><div class="label">Guild bank</div><div class="g-big">${Math.round(g.bank).toLocaleString()} ¢</div><div class="g-note">Members pay dues as they log deeds. Upgrades draw on the bank.</div>
      <div class="g-row"><button class="btn" data-act="dep" data-arg="1000">Deposit 1,000</button><button class="btn" data-act="dep" data-arg="10000">Deposit 10,000</button><button class="btn" data-act="wd" data-arg="1000">Withdraw 1,000</button><button class="btn" data-act="wd" data-arg="all">Withdraw all</button></div>
      <div class="g-note">You carry ${Math.round(game.data.credits).toLocaleString()} ¢ · ${pvp.voidglass} ${sym} ${D.RESOURCE.name}</div></div></div>
      <div class="label" style="margin-top:10px">Upgrades (${D.RESOURCE.name} + bank credits)</div><div class="g-list">`;
    for (const u of D.UPGRADES) {
      const r = g.upgrades[u.k] || 0, c = D.upgradeCost(u.k, r), max = r >= u.max;
      h += `<div class="g-mem"><div class="who">${u.name}<span class="rk">${r}/${u.max}</span></div><div class="meta">${u.desc}</div><div class="where">${max ? 'Complete' : `${c.glass} ${sym} · ${c.credits.toLocaleString()} ¢`}</div>
        <div class="acts"><button class="btn violet" data-act="upg" data-arg="${u.k}" ${max || pvp.voidglass < c.glass || g.bank < c.credits ? 'disabled' : ''}>${max ? 'Max' : 'Build'}</button></div></div>`;
    }
    return h + '</div>';
  }
  function recruit(g, cap) {
    const list = G.recruits(), now = game.data.playtime || 0;
    return `<p class="g-note">${g.members.length}/${cap} berths filled. Captains weigh your guild's level, your arena tier, how their rank compares with yours, and whether they already wear another guild's tag. An answer stands for three minutes.</p><div class="g-list">${list.map((c) => {
      const a = G.asked[c.name], wait = a && now - a.t < 180;
      const ch = CHASSIS_BY_ID[c.chassis];
      return `<div class="g-mem"><div class="who">${tag(c.otherGuild)}${esc(c.name)}</div><div class="meta">Rank ${c.level} · ${ch ? esc(ch.cls) : '—'}</div><div class="where">${esc(c.where)} · ${pct(c.chance)} likely</div>
        <div class="acts"><button class="btn" data-act="invite" data-arg="${esc(c.name)}" ${wait || g.members.length >= cap ? 'disabled' : ''}>${wait ? 'Asked' : 'Invite'}</button></div></div>`;
    }).join('')}</div>`;
  }
  function diplomacy(g, d, bloc) {
    const mine = G.strength();
    let h = `<div class="g-note">Your guild's strength: <b>${mine}</b>. ${bloc ? `Sworn to <b style="color:${bloc.color}">${esc(bloc.name)}</b> — its captains fight beside you in contested zones; every other alliance's captains are hostile there.` : 'Unaligned: propose an alliance to a guild. They answer by standing, by your strength against theirs, and by temperament.'}</div>`;
    if (bloc) h += `<div class="g-row">${bloc.founder === 'player' ? `<div class="g-form"><label>Alliance name<input id="gBloc" maxlength="28" value="${esc(bloc.name)}"></label><button class="btn" data-act="bloc-save">Rename</button></div>` : ''}<button class="btn bad" data-act="leave">Leave alliance</button></div>`;
    const groups = d.blocs.map((b) => ({ b, tags: b.guilds })).concat([{ b: null, tags: G.guilds.filter((x) => !D.blocOf(d, x.tag)).map((x) => x.tag) }]);
    for (const { b, tags } of groups) {
      if (!tags.length && !b) continue;
      h += `<div class="g-bloc" style="--c:${b ? b.color : '#6a7a9a'}"><div class="g-bloc-h">${b ? esc(b.name) : 'Independent guilds'}${b ? `<span>strength ${D.blocStrength(d, G.guilds, b, mine)}${b.id === d.player ? ' · YOUR ALLIANCE' : ''}</span>` : ''}</div>`;
      if (b && b.id === d.player) h += `<div class="g-mem"><div class="who">${tag(g.tag)}${esc(g.name)}</div><div class="meta">Your guild · strength ${mine}</div><div class="where"></div><div class="acts"></div></div>`;
      for (const t of tags) {
        const o = G.byTag[t], st = d.standing[t] || 0, ch = G.allianceChance(t);
        h += `<div class="g-mem"><div class="who">${tag(t)}${esc(o.name)}</div><div class="meta">${D.TEMPERAMENTS[o.temperament].name} · strength ${o.strength} · home ${esc(S[o.home].name)}</div>
          <div class="where"><span class="st ${st >= 25 ? 'good' : st <= -15 ? 'bad' : ''}">${D.standingWord(st)} (${st > 0 ? '+' : ''}${Math.round(st)})</span></div>
          <div class="acts">${d.player ? '' : `<button class="btn violet" data-act="propose" data-arg="${t}" title="${esc(D.TEMPERAMENTS[o.temperament].note)}" ${ch <= 0 ? 'disabled' : ''}>Propose · ${pct(ch)}</button>`}</div></div>`;
      }
      h += '</div>';
    }
    if (d.log.length) h += `<div class="label" style="margin-top:10px">Recent</div><div class="g-log">${d.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
    return h;
  }
  function guildAct(act, arg, el) {
    const win = game.ui.windows.guild, val = (id) => { const i = win.querySelector('#' + id); return i ? i.value : ''; };
    const g = G.g;
    switch (act) {
      case 'gtab': gTab = arg; break;
      case 'suggest': draft.name = G.suggestName(); draft.tag = D.tagFromName(draft.name); break;
      case 'found': if (G.found(val('gName'), val('gTag'), draft.emblem)) draft.name = ''; break;
      case 'emblem': if (g) G.setEmblem(arg); else draft.emblem = arg; break;
      case 'rename-open': renaming = !renaming; break;
      case 'rename-save': if (G.rename(val('gName'), val('gTag'))) renaming = false; break;
      case 'invite': { const c = G.recruits().find((x) => x.name === arg); if (c) G.invite(c); break; }
      case 'call': G.call(+arg); break;
      case 'up': G.promote(+arg, 1); break;
      case 'down': G.promote(+arg, -1); break;
      case 'kick': if (el.dataset.sure) G.kick(+arg); else { el.dataset.sure = '1'; el.textContent = 'Sure?'; return; } break;
      case 'dep': G.deposit(+arg); break;
      case 'wd': G.withdraw(arg === 'all' ? g.bank : +arg); break;
      case 'upg': G.buyUpgrade(arg); break;
      case 'propose': G.propose(arg); break;
      case 'leave': if (el.dataset.sure) G.leaveAlliance(); else { el.dataset.sure = '1'; el.textContent = 'Break the oath?'; return; } break;
      case 'bloc-save': G.renameAlliance(val('gBloc')); break;
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    renderGuild();
  }

  // ------------------------------------------------------------------ PvP window
  function renderPvp() {
    const win = game.ui.windows.pvp, body = win.querySelector('.wbody'), top = win.scrollTop, btop = body.scrollTop;
    const pvp = G.pvp, tier = G.tier();
    let h = `<div class="g-head"><div class="g-emblem tier" style="--c:${tier.color}"></div><div class="g-id">
      <div class="g-name">${tier.name} · ${pvp.rating}</div>
      <div class="g-sub">${pvp.wins}W ${pvp.losses}L · ${pvp.honour} honour · ${pvp.voidglass} ${sym} ${D.RESOURCE.name}${pvp.title ? ' · ' + esc(pvp.title) : ''}</div>
      <div class="bar xp"><i style="width:${Math.round(tier.progress * 100)}%"></i><span>${tier.next ? `${tier.next.min - pvp.rating} TO ${tier.next.name.toUpperCase()}` : 'TOP TIER'}</span></div></div></div>`;
    h += tabs(pTab, [['queue', 'Arenas'], ['zones', 'Zones'], ['ladder', 'Ladder'], ['vendor', 'Quartermaster']], 'ptab');
    if (pTab === 'queue') h += queue(pvp);
    else if (pTab === 'zones') h += zones(pvp);
    else if (pTab === 'ladder') h += ladder(pvp, tier);
    else h += vendor(pvp, tier);
    body.innerHTML = h;
    win.scrollTop = top; body.scrollTop = btop;
  }
  function queue(pvp) {
    const A = G.arena, why = A.blocked(), M = A.match, last = A.last;
    let h = `<p class="g-note">Arenas load you into a sealed instance from anywhere outside combat and put you back where you were. Teammates and opponents fly hulls of your class at your rank; who you meet follows your rating. Losing costs rating only — no insurance, no hull damage carried out.</p>`;
    if (M) h += `<div class="g-row"><b>In ${M.mode.name}</b><button class="btn bad" data-act="forfeit">Forfeit match</button></div>`;
    else if (why) h += `<div class="g-warn">${esc(why)}</div>`;
    h += '<div class="g-modes">';
    for (const m of Object.values(D.MODES)) {
      const ms = pvp.modes[m.k] || { w: 0, l: 0, d: 0 }, ar = A.arenas[m.k];
      h += `<div class="g-mode"><div class="t">${m.name}</div><div class="s">${m.sub}</div><div class="s">${esc(ar.name)} · ${mmss(m.time)} · ${m.respawn ? `respawn ${m.respawn}s` : 'no respawns'}</div>
        <div class="s">${m.k === 'duel' ? `Ladder ${pvp.duel.rating} · ` : ''}${ms.w}W ${ms.l}L${ms.d ? ' ' + ms.d + 'D' : ''}</div><button class="btn" data-act="queue" data-arg="${m.k}" ${why ? 'disabled' : ''}>Queue</button></div>`;
    }
    h += '</div>';
    if (last) h += `<div class="g-note">Last match: ${D.MODES[last.key].name} — ${last.result >= 1 ? 'victory' : last.result <= 0 ? 'defeat' : 'draw'} ${last.score[0]}–${last.score[1]}, rating ${last.delta >= 0 ? '+' : ''}${last.delta}, +${last.rewards.honour} honour, +${last.rewards.glass} ${sym}, +${last.rewards.credits} ¢.</div>`;
    return h;
  }
  function zones() {
    const Z = G.zones, my = G.side(), here = game.data.system, now = game.data.playtime || 0;
    let h = `<p class="g-note">${D.RESOURCE.name} ${sym} forms only in contested fields. Each has three extractors; hold them during a battle and they pay every ${D.CONTROL_TICK}s (${D.CONTROL_PAY.slice(1).join(' / ')} ${sym} for one / two / all three). Fields change hands while you are away; your alliance banks a trickle for your next visit. ${my ? '' : '<b>Found a guild to claim extractors.</b>'}</p><div class="g-list">`;
    for (const id of Z.ids) {
      const s = S[id], st = Z.state(id), z = Z.zone(id), cur = id === here, C = cur ? Z.cur : null;
      const pips = st.own.map((o, i) => `<i class="pip" style="--c:${G.sideColor(o)}" title="${esc(G.sideName(o))}">${'ABC'[i]}</i>`).join('');
      const holder = D.zoneHolder(st);
      h += `<div class="g-mem${cur ? ' cur' : ''}"><div class="who">${sym} ${esc(z.name)}</div><div class="meta">${esc(s.name)} · danger ${s.danger}${cur ? ' · YOU ARE HERE' : ''}</div>
        <div class="where">${pips} <span style="color:${G.sideColor(holder)}">${holder ? esc(G.sideName(holder)) : 'Contested'}</span>${st.income >= 1 && my ? ` · ${Math.floor(st.income)} ${sym} banked` : ''}${C && C.phase === 'battle' ? ' · BATTLE' : st.cool > now ? ` · quiet ${mmss(st.cool - now)}` : ''}</div>
        <div class="acts">${cur ? '<button class="btn" data-act="zwarp">Warp to field</button>' : `<button class="btn" data-act="zjump" data-arg="${id}">Set course</button>`}</div></div>`;
    }
    return h + '</div>';
  }
  function ladder(pvp, tier) {
    let h = '<div class="g-cols"><div><div class="label">Arena tiers</div><div class="g-list">';
    for (let i = D.TIERS.length - 1; i >= 0; i--) {
      const t = D.TIERS[i];
      h += `<div class="g-tier${i === tier.index ? ' cur' : ''}" style="--c:${t.color}"><i></i><b>${t.name}</b><span>${t.min}+</span>${i === tier.index ? `<em>YOU · ${pvp.rating}</em>` : ''}</div>`;
    }
    h += `</div><p class="g-note">Skirmish, Relay Capture and Convoy share this rating. Higher tiers add ${D.RESOURCE.name} to every win and unlock quartermaster stock.</p></div><div><div class="label">Duel ladder</div><div class="g-list tight">`;
    const rows = G.ladder.map((e) => ({ ...e })).concat([{ name: game.data.name, guild: G.g ? G.g.tag : null, rating: pvp.duel.rating, you: true }]).sort((a, b) => b.rating - a.rating);
    rows.forEach((e, i) => { h += `<div class="g-lad${e.you ? ' cur' : ''}"><span>${i + 1}</span><b>${tag(e.guild)}${esc(e.name)}</b><em>${e.rating}</em></div>`; });
    return h + `</div><p class="g-note">Duels: ${pvp.duel.wins}W ${pvp.duel.losses}L. You are matched against the duelists nearest your rating.</p></div></div>`;
  }
  const rotation = () => Math.floor((game.data.playtime || 0) / D.VENDOR_PERIOD);
  function vendor(pvp, tier) {
    const rot = rotation(), stock = D.vendorStock(G.diplo.seed, rot, game.data.level);
    let h = `<p class="g-note">Stock turns over in ${mmss((rot + 1) * D.VENDOR_PERIOD - (game.data.playtime || 0))}. Prices in ${D.RESOURCE.name} ${sym} and honour. You hold ${pvp.voidglass} ${sym} and ${pvp.honour} honour.</p><div class="label">Voidforged gear (rank ${game.data.level})</div><div class="g-list">`;
    for (const e of stock.gear) {
      const b = BASES[e.base], r = RARITY[e.rarity], sold = pvp.bought[e.id], why = sold ? 'Sold' : D.canBuy(pvp, e, tier.index);
      h += `<div class="g-mem"><div class="who" style="color:${r.color}">Voidforged ${esc(b.name)}</div><div class="meta">${r.name} ${esc(b.slot)} · item level ${e.ilvl}</div><div class="where">${e.glass} ${sym} · ${e.honour} honour${why && !sold ? ` · <span class="st bad">${esc(why)}</span>` : ''}</div>
        <div class="acts"><button class="btn violet" data-act="buy-gear" data-arg="${e.id}" ${why ? 'disabled' : ''}>${sold ? 'Sold' : 'Buy'}</button></div></div>`;
    }
    h += '</div><div class="label" style="margin-top:10px">Colours & titles</div><div class="g-list">';
    for (const e of stock.cosmetics) {
      const owned = pvp.owned.includes(e.k), why = owned ? null : D.canBuy(pvp, e, tier.index);
      h += `<div class="g-mem"><div class="who">${esc(e.name)}</div><div class="meta">${e.type === 'title' ? 'Worn after your name' : 'A guild emblem colour'}</div><div class="where">${owned ? 'Owned' : `${e.glass} ${sym} · ${e.honour} honour${why ? ` · <span class="st bad">${esc(why)}</span>` : ''}`}</div>
        <div class="acts">${owned ? (e.type === 'title' ? `<button class="btn" data-act="title" data-arg="${e.k}">${pvp.title === e.value ? 'Remove' : 'Wear'}</button>` : `<button class="btn" data-act="wear-emblem" data-arg="${e.value}">Fly</button>`) : `<button class="btn violet" data-act="buy-cos" data-arg="${e.k}" ${why ? 'disabled' : ''}>Buy</button>`}</div></div>`;
    }
    const mine = D.COSMETICS.filter((c) => pvp.owned.includes(c.k) && !stock.cosmetics.includes(c));
    if (mine.length) h += mine.map((e) => `<div class="g-mem"><div class="who">${esc(e.name)}</div><div class="meta">Owned</div><div class="where"></div><div class="acts">${e.type === 'title' ? `<button class="btn" data-act="title" data-arg="${e.k}">${pvp.title === e.value ? 'Remove' : 'Wear'}</button>` : `<button class="btn" data-act="wear-emblem" data-arg="${e.value}">Fly</button>`}</div></div>`).join('');
    return h + '</div>';
  }
  G.buy = (id) => {
    const pvp = G.pvp, tier = G.tier(), stock = D.vendorStock(G.diplo.seed, rotation(), game.data.level);
    const gear = stock.gear.find((e) => e.id === id), cos = D.COSMETICS.find((e) => e.k === id && stock.cosmetics.some((c) => c.k === id));
    const e = gear || cos; if (!e) return false;
    if (gear ? pvp.bought[id] : pvp.owned.includes(id)) return false;
    const why = D.canBuy(pvp, e, tier.index);
    if (why) { game.ui.toast(why, 'warn'); return false; }
    if (gear && game.data.inventory.length >= INV_SIZE) { game.ui.toast('Cargo hold full', 'warn'); return false; }
    pvp.voidglass -= e.glass; pvp.honour -= e.honour;
    if (gear) {
      const it = makeItem(gear.base, gear.ilvl, gear.rarity, new RNG(gear.seed));
      it.name = `Voidforged ${BASES[gear.base].name}`; it.pvp = true;
      game.data.inventory.push(it); pvp.bought[id] = 1;
      game.ui.toast(`Bought ${it.name}`, 'legend');
      if (game.autoplay) game.autoplay.onLoot(it);
    } else { pvp.owned.push(id); game.ui.toast(`Bought ${e.name}`, 'epic'); }
    game.ui.refresh();
    return true;
  };
  function pvpAct(act, arg) {
    const pvp = G.pvp;
    switch (act) {
      case 'ptab': pTab = arg; break;
      case 'queue': if (G.arena.start(arg)) return; break;
      case 'forfeit': G.arena.forfeit(); break;
      case 'zwarp': if (G.zones.warpToField()) game.ui.toggle('pvp', false); return;
      case 'zjump': if (game.jumpTo && game.jumpTo(+arg)) game.ui.toggle('pvp', false); return;
      case 'buy-gear': case 'buy-cos': G.buy(arg); break;
      case 'title': { const c = D.COSMETICS.find((x) => x.k === arg); pvp.title = pvp.title === c.value ? null : c.value; break; }
      case 'wear-emblem': if (G.g) G.setEmblem(arg); else game.ui.toast('Found a guild to fly an emblem', 'warn'); break;
    }
    renderPvp();
  }

  // ------------------------------------------------------------------ HUD
  function line(e) { return `<div class="${e.mine ? 'mine' : 'theirs'}"><b style="color:${e.ca || ''}">${esc(e.a)}</b> ${e.verb} <b style="color:${e.cb || ''}">${esc(e.b)}</b></div>`; }
  function capBar(p, mineKey, colorOf) {
    const c = colorOf(p.owner), cc = p.cap != null ? colorOf(p.cap) : c;
    return `<div class="cap${p.owner === mineKey ? ' mine' : ''}" style="--c:${c};--cc:${cc}"><b>${p.k}</b><i style="width:${Math.round((p.prog || 0) * 100)}%"></i></div>`;
  }
  function boardHtml(M, rows) {
    const side = (n, title) => `<div class="bside s${n}"><div class="bh">${title} · ${M.score[n]}</div>${rows.filter((r) => r.side === n).map((r) => `<div class="br${r.you ? ' you' : ''}${r.alive ? '' : ' dead'}"><span>${tag(r.guild)}${esc(r.name)}</span><em>${r.k} / ${r.d}</em></div>`).join('')}</div>`;
    return side(0, 'Your team') + side(1, 'Opponents');
  }
  // The match / field strip lives on the ticker (src/ui/ticker.js): a plate at the top-left of the screen with the
  // mode, the clock and the score, and the kill feed crawling along the bar beside it.
  let fedT = 0, subT = 0, pinnedHere = false;
  function drawHud() {
    const A = G.arena, M = A.match, C = G.zones.cur, now = game.engine.realTime, T = game.ticker;
    const watching = !!(game.autoplay && game.autoplay.active);
    let pin = null, sub = '';
    if (M) {
      const me = M.score[0], them = M.score[1], P = game.player;
      const unit = M.key === 'convoy' ? (M.convoy.role === 'escort' ? ['SAFE', 'LOST'] : ['SUNK', 'ESCAPED']) : ['YOU', 'THEM'];
      let mid = `<span class="me">${unit[0]} ${me}</span><em>${M.key === 'duel' ? 'vs' : `to ${M.key === 'convoy' ? 2 : M.mode.goal}`}</em><span class="them">${them} ${unit[1]}</span>`;
      if (M.points) mid += `<span class="ph-caps">${M.points.map((p) => capBar(p, '0', (o) => (o == null ? '#6a7a9a' : +o === 0 ? '#58c8ff' : '#ff5a8a'))).join('')}</span>`;
      pin = { tag: M.mode.name.toUpperCase(), time: M.phase === 'intro' ? 'READY' : M.phase === 'countdown' ? `IN ${Math.ceil(M.cd)}` : M.phase === 'over' ? 'OVER' : mmss(M.left), mid,
        act: watching || M.phase === 'over' ? '' : `<button class="mini" data-act="board">${showBoard ? 'hide' : 'scores'}</button>` };
      if (M.phase === 'live' && !P.alive && M.mode.respawn) sub = 'Hull lost · respawning';
      else if (M.key === 'duel' && M.opp) sub = `Duel against ${tag(M.opp.guild)}<b>${esc(M.opp.name)}</b> · rated ${M.opp.rating}`;
      else if (M.convoy) sub = `${M.convoy.role === 'escort' ? 'Escort the freighters to the jump point' : 'Sink the freighters before they jump'} · ${M.convoy.ships.filter((f) => f.alive).length} under way`;
      else if (M.phase === 'live') sub = `${M.pl.kills} kills · ${M.pl.deaths} deaths`;
      if (!M._said) { M._said = true; T.say(`${M.mode.name} at ${M.arena.name} · ${M.mode.sub}`, { cls: 'epic' }); subT = now + 5; }
      if (M.phase === 'over' && M.rewards && !M._res) {
        M._res = true;
        const rw = M.rewards, word = M.result >= 1 ? 'VICTORY' : M.result <= 0 ? 'DEFEAT' : 'DRAW';
        T.say(`<b>${word}</b> · ${esc(M.mode.name)} ${M.score[0]}–${M.score[1]} · rating ${M.delta >= 0 ? '+' : ''}${M.delta} (${M.newRating}) · +${rw.honour} honour · +${rw.glass} ${sym} · +${rw.credits} ¢`, { html: true, cls: M.result >= 1 ? 'win' : M.result <= 0 ? 'loss' : 'dim' });
      }
    } else if (C && (C.near || C.phase === 'battle')) {
      const my = G.side();
      let foes = 0, allies = 0;
      for (const sd of C.sides) { if (sd.ally) allies += sd.ships.length; else foes += sd.ships.length + sd.reserve; }
      pin = { tag: `${sym} ${C.zone.name.toUpperCase()}`, time: C.phase === 'battle' ? `PAYS ${Math.ceil(C.tickT)}s` : C.hotT > 0 ? `HOT ${Math.ceil(C.hotT)}s` : C.st.cool > (game.data.playtime || 0) ? 'QUIET' : 'OPEN',
        mid: `<span class="ph-caps">${C.pts.map((p) => capBar(p, my, G.sideColor)).join('')}</span>` };
      sub = `${C.phase === 'battle' ? `${foes} hostile captain${foes === 1 ? '' : 's'} · ${allies} all${allies === 1 ? 'y' : 'ies'}` : my ? 'Stand on an extractor to claim it' : 'Found a guild to claim extractors'}${C.earned ? ` · <b class="glass">+${C.earned} ${sym}</b>` : ''}`;
    }
    if (pin || pinnedHere) { T.pin(pin); pinnedHere = !!pin; }
    // the kill feed crawls along the bar; when it is quiet, the standing line (opponent, objective, tally) comes round
    while (G.feed.length > 12) G.feed.shift();
    if (pin) {
      for (const e of G.feed) if (e.t > fedT) { fedT = e.t; T.say(`<b style="color:${e.ca || ''}">${esc(e.a)}</b> ${e.verb} <b style="color:${e.cb || ''}">${esc(e.b)}</b>`, { html: true, cls: e.mine ? 'mine' : 'theirs' }); subT = now + 5; }
      if (sub && !T.busy && now > subT) { subT = now + 9; T.say(sub, { html: true, cls: 'dim' }); }
    } else fedT = Math.max(fedT, now - 1);
    // scoreboard / result
    const b = M && showBoard && M.phase !== 'over' ? boardHtml(M, A.board()) : '';
    if (board._h !== b) { board._h = b; board.innerHTML = b; board.style.display = b ? '' : 'none'; }
    let r = '';
    if (M && M.phase === 'over' && M.rewards && !watching) {
      const rw = M.rewards;
      // the word itself is the stamp over the screen (pvpfx.js); the card holds the reckoning
      r = `<div class="res-s">${M.mode.name} · ${esc(M.arena.name)} · ${M.score[0]}–${M.score[1]}</div>
        <div class="res-r"><div><b>${M.delta >= 0 ? '+' : ''}${M.delta}</b><span>rating (${M.newRating})</span></div><div><b>+${rw.honour}</b><span>honour</span></div><div><b>+${rw.glass} ${sym}</b><span>${D.RESOURCE.name}</span></div><div><b>+${rw.credits}</b><span>credits</span></div></div>
        <div class="res-b">${boardHtml(M, A.board())}</div><button class="btn" data-act="dismiss">Return to ${esc(game.sector.sys.name)}</button>`;
    }
    if (result._h !== r) { result._h = r; result.innerHTML = r; result.classList.toggle('open', !!r); }
  }
  function drawMarks() {
    const M = G.arena.match, C = G.zones.cur;
    const pts = M ? M.points : C && (C.near || C.dist < 9000) ? C.pts : null;
    for (let i = 0; i < 3; i++) {
      const el = marks.children[i], p = pts && pts[i];
      if (!p) { if (el._on) { el._on = false; el.style.display = 'none'; } continue; }
      game.cam.project(_p.copy(p.pos).setY(60), _p);
      const off = _p.z > 1 || _p.x < 20 || _p.x > innerWidth - 20 || _p.y < 20 || _p.y > innerHeight - 20;
      if (off) { if (el._on) { el._on = false; el.style.display = 'none'; } continue; }
      if (!el._on) { el._on = true; el.style.display = ''; }
      el.style.transform = `translate(${Math.round(_p.x)}px,${Math.round(_p.y)}px)`;
      const c = M ? (p.owner == null ? '#6a7a9a' : +p.owner === 0 ? '#58c8ff' : '#ff5a8a') : G.sideColor(p.owner);
      if (el._c !== c) { el._c = c; el.style.setProperty('--c', c); }
    }
  }
  // far from the field but in its system: a compass tag on the screen edge
  function drawPointer() {
    const C = G.zones.cur, el = marks.children[3], P = game.player;
    const show = !!(C && P && !G.arena.match && !C.near && game.mode === 'space');
    if (!show) { if (el._on) { el._on = false; el.style.display = 'none'; } return; }
    game.cam.project(_p.copy(C.center), _p);
    let x = _p.x, y = _p.y;
    if (_p.z > 1) { x = innerWidth - x; y = innerHeight - y; }
    const cx = innerWidth / 2, cy = innerHeight / 2, dx = x - cx, dy = y - cy, k = Math.min(1, (Math.min(cx, cy) - 70) / Math.max(1, Math.hypot(dx, dy)));
    if (!el._on) { el._on = true; el.style.display = ''; }
    el.style.transform = `translate(${Math.round(cx + dx * k)}px,${Math.round(cy + dy * k)}px)`;
    const txt = `${sym} ${(C.dist / 1000).toFixed(1)}k`;
    if (el._t !== txt) { el._t = txt; el.textContent = txt; }
  }

  // ------------------------------------------------------------------ wiring
  game.start = ((start) => (fresh) => {
    start(fresh);
    G.ensure();
    const ui = game.ui, root = ui.root;
    ui.windows.guild = ui.addWindow('guild', 'Guild');
    ui.windows.pvp = ui.addWindow('pvp', `PvP · Arenas & ${D.RESOURCE.name}`);
    ui.renderers.guild = renderGuild; ui.renderers.pvp = renderPvp;
    for (const id of ['guild', 'pvp']) {
      const w = ui.windows[id]; w.classList.add('g-win');
      w.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) (id === 'guild' ? guildAct : pvpAct)(b.dataset.act, b.dataset.arg, b); });
      w.addEventListener('focusin', (e) => { if (e.target.tagName === 'INPUT') game.input.blocked = true; });
      w.addEventListener('focusout', (e) => { if (e.target.tagName === 'INPUT') game.input.blocked = false; });
      w.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') { e.stopPropagation(); if (e.key === 'Enter') { const b = w.querySelector('[data-act="found"],[data-act="rename-save"]'); if (b) b.click(); } } });
      w.addEventListener('input', (e) => { if (e.target.id === 'gName' && !G.g) { draft.name = e.target.value; } if (e.target.id === 'gTag') { e.target.value = D.cleanTag(e.target.value); if (!G.g) draft.tag = e.target.value; } });
    }
    const mb = document.getElementById('menubar'), auto = mb && mb.querySelector('.auto');
    for (const [w, n, k] of [['guild', 'GUILD', 'O'], ['pvp', 'PVP', 'H']]) {
      const b = document.createElement('button'); b.dataset.w = w; b.title = `${n} [${k}]`; b.innerHTML = `${n} <i class="k">[${k}]</i>`;
      b.addEventListener('click', () => game.command(w));
      if (mb) mb.insertBefore(b, auto || null);
    }
    const mk = (id, cls = '') => { const el = document.createElement('div'); el.id = id; if (cls) el.className = cls; root.append(el); return el; };
    hud = game.ticker.el;
    board = mk('pvpBoard', 'holo'); board.style.display = 'none';
    result = mk('pvpResult', 'holo');
    marks = mk('pvpMarks');
    marks.innerHTML = '<i>A</i><i>B</i><i>C</i><i class="ptr"></i>';
    for (const el of marks.children) el.style.display = 'none';
    hud.addEventListener('click', (e) => { if (e.target.closest('[data-act="board"]')) showBoard = !showBoard; });
    result.addEventListener('click', (e) => { if (e.target.closest('[data-act="dismiss"]')) G.arena.dismiss(); });
  })(game.start.bind(game));

  addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (!game.data || !game.ui || game.input.blocked || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyO') game.command('guild');
    else if (e.code === 'KeyH' && game.mode !== 'planet') game.command('pvp');   // on the surface H is the lure pulse
  });

  let hudT = 0, winT = 0;
  game.engine.add({
    update(dt, t, realDt) {
      if (!hud || !game.data || !game.ui) return;
      const space = game.mode === 'space';
      if ((hudT -= realDt) <= 0) {
        hudT = 0.2;
        if (space) drawHud(); else if (pinnedHere) { pinnedHere = false; game.ticker.pin(null); }
      }
      if (space) { drawMarks(); drawPointer(); } else for (const el of marks.children) if (el._on) { el._on = false; el.style.display = 'none'; }
      // open windows follow the world (only when something they show has changed)
      if ((winT -= realDt) <= 0) {
        winT = 1;
        const g = G.g, pvp = G.pvp, d = G.diplo, M = G.arena.match, C = G.zones.cur, slot = Math.floor((game.data.playtime || 0) / 5);
        if (game.ui.isOpen('guild')) {
          const s = `${g ? `${g.name}|${g.tag}|${g.xp}|${g.members.length}|${Math.round(g.bank)}|${g.members.reduce((a, m) => a + m.deeds + m.level + m.rank, 0)}` : '-'}|${pvp.voidglass}|${d.player}|${d.blocs.map((b) => b.guilds.length).join()}|${Object.values(d.standing).reduce((a, b) => a + b, 0)}|${game.mmo ? game.mmo.ships.length + game.mmo.party.length * 100 : 0}|${gTab === 'recruit' || gTab === 'roster' ? Math.floor(slot / 6) : 0}`;
          if (s !== sig.guild) { sig.guild = s; renderGuild(); }
        }
        if (game.ui.isOpen('pvp')) {
          const s = `${pvp.rating}|${pvp.duel.rating}|${pvp.honour}|${pvp.voidglass}|${pvp.games}|${M ? M.phase : G.arena.blocked()}|${C ? C.phase : ''}|${pTab === 'zones' || pTab === 'vendor' ? slot : 0}|${pvp.owned.length}`;
          if (s !== sig.pvp) { sig.pvp = s; renderPvp(); }
        }
      }
    },
  });
}
