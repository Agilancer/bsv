// The Crew window (K): roster, bridge officers, the deck cutaway and recruiting. Holo panels in the game's style
// (.holo .win .btn .label from css/ui.css, the rest in css/crew.css). Single column with big tap targets on phones.
import {
  DEPTS, DEPT_KEYS, OFFICER_POSTS, OFFICER_KEYS, TRAITS, RANKS, LOOKS, SPECIES, skillOf, rankAbbr, rankName, canPromote,
  crewXpFor, promoteCost, complement,
} from './data.js';
import { Cutaway, memberTip } from './Cutaway.js';
import { SECTIONS } from './layout.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DIV_ROW = { command: 0, tactical: 1, ops: 2, science: 3 };
const LOOK_COL = Object.fromEntries(LOOKS.map((l, i) => [l.k, i]));
const SPECIES_NAME = Object.fromEntries(SPECIES.map((s) => [s.k, s.name]));
const STAT_NAMES = { dmg: 'Weapon damage', crit: 'Critical chance', range: 'Weapon range', speed: 'Speed', turn: 'Turn rate', shield: 'Shield capacity', shieldRegen: 'Shield regen', hull: 'Hull integrity', hullRegen: 'Hull repair /s', armor: 'Armour', cdr: 'Cooldowns', xp: 'Experience', lootFind: 'Loot quality', credits: 'Credits found', salvage: 'Repair on kill', pickup: 'Tractor reach' };

export const touchUI = () => matchMedia('(pointer: coarse)').matches || innerWidth < 900;

// portrait from the sheet: column = body, row = uniform division
export function face(m, cls = '') {
  const col = LOOK_COL[m.look] ?? 0, row = DIV_ROW[DEPTS[m.dept].div] ?? 0;
  return `<div class="cw-face ${cls}" style="--dc:${DEPTS[m.dept].color};background-position:calc(var(--s) * -${col}) calc(var(--s) * -${row})"></div>`;
}
export function fmtStat(k, v) {
  if (k === 'armor') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
  if (k === 'hullRegen' || k === 'salvage') return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
  if (k === 'cdr') return `${v >= 0 ? '-' : '+'}${Math.abs(v * 100).toFixed(1)}%`;
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
}

export class CrewUI {
  constructor(game, sys) {
    this.game = game; this.sys = sys;
    this.tab = 'roster';
    this.filter = 'all';      // department key, 'all', 'wounded', 'officers'
    this.sort = 'dept';
    this.selId = null;
    this.secSel = null;
    this.confirm = null;
    this.el = h(`<div id="crewWin" class="win holo scan">
      <div class="wtitle"><span>Crew <span class="sub" id="cwSub"></span></span><span class="close">✕</span></div>
      <div class="cw-tabs">${['roster', 'officers', 'decks', 'hire'].map((t) => `<button data-t="${t}">${{ roster: 'Roster', officers: 'Officers', decks: 'Decks', hire: 'Recruit' }[t]}</button>`).join('')}<span class="sp"></span><button id="cwAuto" title="Let the first officer sort it out: fill vacant bridge posts, move hands to short-handed departments, promote whoever has earned it and, at a station, sign recruits for the empty posts (spends up to half your credits).">Auto-manage crew</button></div>
      <div class="cw-body"></div></div>`);
    game.ui.root.append(this.el);
    this.body = this.el.querySelector('.cw-body');
    this.el.querySelector('.close').addEventListener('click', () => this.toggle(false));
    this.el.querySelectorAll('.cw-tabs button[data-t]').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.t)));
    this.el.querySelector('#cwAuto').addEventListener('click', () => {
      const r = sys.autoManage({ budget: Math.floor(game.data.credits * 0.5) });
      if (!r.text) game.ui.toast(sys.canHire() ? 'The crew is in good order' : 'The crew is in good order — dock at a station to sign recruits');
      else game.ui.toast(r.text, 'epic');
      this.render();
    });
    this.dirtyT = 0; this.subT = 0;
    sys.on((type) => { if (type === 'changed' || type === 'recruits' || type === 'death') this.dirtyT = Math.max(this.dirtyT, 0.25); });
  }

  isOpen() { return this.el.classList.contains('open'); }
  toggle(on) {
    const open = on ?? !this.isOpen();
    this.el.classList.toggle('open', open);
    document.querySelectorAll('#menubar button[data-w="crew"]').forEach((b) => b.classList.toggle('on', open));
    if (open) this.render(); else { this.game.ui.hideTip(); this.cut = null; }
    return open;
  }
  show(tab) { this.tab = tab; this.confirm = null; this.render(); }

  render() {
    if (!this.isOpen()) return;
    this.el.querySelectorAll('.cw-tabs button[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
    this.updateSub();
    this.game.ui.hideTip();
    const st = this.sys.state;
    if (this.tab !== 'decks') this.cut = null;
    if (this.tab === 'roster') this.renderRoster(st);
    else if (this.tab === 'officers') this.renderOfficers(st);
    else if (this.tab === 'decks') this.renderDecks(st);
    else this.renderHire(st);
  }

  updateSub() {
    const st = this.sys.state, ch = this.sys.chassis;
    const wounded = st.members.filter((m) => m.status === 'wounded').length;
    this.el.querySelector('#cwSub').innerHTML = `· <b>${esc(this.game.data.ship.name)}</b> · ${st.members.length} / ${ch.crew[1]} aboard · morale <b>${Math.round(this.sys.morale())}%</b>${wounded ? ` · <span style="color:var(--bad)">${wounded} wounded</span>` : ''} · <b style="color:#ffd66a">${Math.round(this.game.data.credits)} ¢</b>`;
  }

  // ---------------- roster ----------------
  deptList(rep, sel, onPick) {
    const all = this.sys.state.members.length;
    let s = `<div class="cw-dept ${sel === 'all' ? 'on' : ''}" data-d="all" style="--dc:#58c8ff"><i class="cw-dot"></i><span class="nm">All crew</span><span class="ct">${all}</span></div>`;
    for (const k of DEPT_KEYS) {
      const d = rep[k], D = DEPTS[k];
      const low = d.req && d.n < d.req;
      s += `<div class="cw-dept ${sel === k ? 'on' : ''}" data-d="${k}" style="--dc:${D.color}" title="${esc(D.blurb)}"><i class="cw-dot"></i><span class="nm">${D.name}</span><span class="ct ${low ? 'low' : ''}">${d.n}/${d.req || '—'}</span><div class="eff"><i style="width:${Math.min(100, d.perf * 100 / 1.15).toFixed(0)}%"></i></div></div>`;
    }
    const wrap = h(`<div class="cw-deptlist">${s}</div>`);
    wrap.querySelectorAll('.cw-dept').forEach((e) => e.addEventListener('click', () => onPick(e.dataset.d)));
    return wrap;
  }

  bonusPanel() {
    const st = this.sys.stats();
    const keys = Object.keys(st).filter((k) => STAT_NAMES[k] && Math.abs(st[k]) > 0.0001);
    if (!keys.length) return '<div class="cw-empty" style="padding:6px">No effect yet</div>';
    return `<div class="cw-bonus">${keys.map((k) => `<span>${STAT_NAMES[k]}</span><b class="${(k === 'cdr' ? st[k] >= 0 : st[k] >= 0) ? 'pos' : 'neg'}">${fmtStat(k, st[k])}</b>`).join('')}</div>`;
  }

  sorted(list) {
    const by = {
      dept: (a, b) => DEPT_KEYS.indexOf(a.section) - DEPT_KEYS.indexOf(b.section) || (b.officer ? 1 : 0) - (a.officer ? 1 : 0) || b.rank - a.rank || b.lvl - a.lvl,
      rank: (a, b) => b.rank - a.rank || b.lvl - a.lvl,
      level: (a, b) => b.lvl - a.lvl || b.xp - a.xp,
      skill: (a, b) => skillOf(b) - skillOf(a),
      morale: (a, b) => a.morale - b.morale,
      name: (a, b) => a.name.localeCompare(b.name),
    }[this.sort];
    return list.slice().sort(by);
  }

  renderRoster(st) {
    const rep = this.sys.report();
    const B = this.body; B.innerHTML = '';
    const left = h(`<div class="cw-col cw-depts"><div class="cw-panel cw-scroll" style="flex:1"><div class="cw-h">Departments</div></div><div class="cw-panel"><div class="cw-h">Crew effect on the ship</div>${this.bonusPanel()}</div></div>`);
    left.querySelector('.cw-panel').append(this.deptList(rep, this.filter, (d) => { this.filter = d; this.render(); }));
    B.append(left);
    let list = st.members;
    if (this.filter === 'wounded') list = list.filter((m) => m.status === 'wounded');
    else if (this.filter === 'officers') list = list.filter((m) => m.officer);
    else if (this.filter !== 'all') list = list.filter((m) => m.section === this.filter);
    list = this.sorted(list);
    const main = h(`<div class="cw-col cw-main"><div class="cw-tools"><span class="label">Sort</span>${['dept', 'rank', 'level', 'skill', 'morale', 'name'].map((s) => `<button class="cw-chip ${this.sort === s ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')}
      <span class="label" style="margin-left:10px">Show</span><button class="cw-chip ${this.filter === 'officers' ? 'on' : ''}" data-f="officers">Officers</button><button class="cw-chip ${this.filter === 'wounded' ? 'on' : ''}" data-f="wounded">Wounded</button></div>
      <div class="cw-scroll cw-rows" style="flex:1"></div></div>`);
    main.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { this.sort = b.dataset.s; this.render(); }));
    main.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { this.filter = this.filter === b.dataset.f ? 'all' : b.dataset.f; this.render(); }));
    const rows = main.querySelector('.cw-rows');
    if (!list.length) rows.innerHTML = '<div class="cw-empty">Nobody here.</div>';
    const frag = document.createDocumentFragment();
    for (const m of list) {
      const d = DEPTS[m.dept];
      const off = m.section !== m.dept;
      const r = h(`<div class="cw-row ${m.id === this.selId ? 'sel' : ''} ${m.status === 'wounded' ? 'wounded' : ''}" data-id="${m.id}" style="--dc:${d.color}">
        <i class="bar4"></i>${face(m)}
        <div class="nm"><small>${rankAbbr(m)}</small>${esc(m.name)}${m.officer ? `<span class="cw-tag off">${OFFICER_POSTS[m.officer].short}</span>` : ''}${m.status === 'wounded' ? '<span class="cw-tag w">WND</span>' : ''}</div>
        <div class="sec ${off ? 'off' : ''}">${DEPTS[m.section].name}${off ? ` · ${d.short}` : ''}</div>
        <div class="num">L${m.lvl}</div><div class="num">${skillOf(m)}</div>
        <div class="mor"><div class="cw-mbar"><i style="width:${m.morale.toFixed(0)}%"></i></div></div>
        <div class="tr">${m.traits.map((t) => TRAITS[t].name).join(' · ')}</div></div>`);
      r.addEventListener('click', () => { this.selId = this.selId === m.id ? null : m.id; this.confirm = null; this.render(); });
      frag.append(r);
    }
    rows.append(frag);
    B.append(main);
    const sel = st.members.find((m) => m.id === this.selId);
    if (sel) B.append(this.detail(sel));
    if (this.scrollTo !== undefined) { rows.scrollTop = this.scrollTo; this.scrollTo = undefined; }
    rows.addEventListener('scroll', () => { this.lastScroll = rows.scrollTop; });
    if (this.lastScroll) rows.scrollTop = this.lastScroll;
  }

  detail(m) {
    const d = DEPTS[m.dept], P = this.game.data;
    const next = RANKS[m.rank + 1];
    const pc = promoteCost(m.rank);
    const posts = OFFICER_KEYS.filter((p) => OFFICER_POSTS[p].dept === m.section && m.officer !== p);
    const el = h(`<div class="cw-col cw-detail"><div class="cw-panel cw-scroll" style="flex:1;display:flex;flex-direction:column;gap:10px">
      <div class="who">${face(m, 'big')}<div><div class="nm">${esc(m.name)}</div><div class="rk">${rankName(m)}${m.officer ? ` · ${OFFICER_POSTS[m.officer].name}` : ''}</div><div class="rk">${SPECIES_NAME[m.species]} · age ${m.age} · ${m.kills} kills</div></div></div>
      <div><div class="label">Level ${m.lvl}${m.lvl < 20 ? ` · ${Math.round(m.xp)} / ${crewXpFor(m.lvl)} xp` : ' · max'}</div><div class="bar xp" style="margin-top:3px"><i style="width:${m.lvl < 20 ? (m.xp / crewXpFor(m.lvl) * 100).toFixed(1) : 100}%"></i></div></div>
      <div class="cw-kv"><span>Trained</span><b style="color:${d.color}">${d.name}</b><span>Posted to</span><b>${DEPTS[m.section].name}</b>
        <span>Skill at post</span><b>${skillOf(m)}${m.section !== m.dept ? ` <span style="color:var(--warn)">(${skillOf(m, m.dept)} in trade)</span>` : ''}</b>
        <span>Morale</span><b>${Math.round(m.morale)}%</b><span>Status</span><b>${m.status === 'wounded' ? `<span style="color:var(--bad)">Wounded · ${Math.ceil(m.wound)}s</span>` : 'Fit for duty'}</b></div>
      <div class="cw-traits"><div class="label">Traits</div>${m.traits.map((t) => `<div class="${['clumsy', 'homesick'].includes(t) ? 'bad' : ''}"><b>${TRAITS[t].name}</b> — ${TRAITS[t].desc}</div>`).join('')}</div>
      <div><div class="label" style="margin-bottom:4px">Reassign</div><select class="cw-sel" id="cwRe">${DEPT_KEYS.map((k) => `<option value="${k}" ${k === m.section ? 'selected' : ''}>${DEPTS[k].name}${k === m.dept ? ' (trade)' : ''}</option>`).join('')}</select></div>
      <div class="cw-actions">
        <button class="btn" id="cwPro" ${canPromote(m) ? '' : 'disabled'} title="${next ? `${next.name}: needs level ${next.lvl}` : 'Highest rank'}">${next ? `Promote · ${pc} ¢` : 'Top rank'}</button>
        ${posts.map((p) => `<button class="btn violet" data-post="${p}">Appoint ${OFFICER_POSTS[p].short}</button>`).join('')}
        <button class="btn bad" id="cwDis">${this.confirm === m.id ? 'Confirm dismiss' : 'Dismiss'}</button>
      </div></div></div>`);
    el.querySelector('#cwRe').addEventListener('change', (e) => { this.sys.reassign(m, e.target.value); this.render(); });
    el.querySelector('#cwPro').addEventListener('click', () => { if (this.sys.promote(m)) this.render(); });
    el.querySelectorAll('[data-post]').forEach((b) => b.addEventListener('click', () => { this.sys.appoint(b.dataset.post, m); this.render(); }));
    el.querySelector('#cwDis').addEventListener('click', () => {
      if (this.confirm !== m.id) { this.confirm = m.id; this.render(); return; }
      this.confirm = null; this.selId = null; this.sys.dismiss(m); this.render();
    });
    void P;
    return el;
  }

  // ---------------- officers ----------------
  renderOfficers(st) {
    const B = this.body; B.innerHTML = '';
    const grid = h('<div class="cw-officers cw-scroll"></div>');
    for (const post of OFFICER_KEYS) {
      const P = OFFICER_POSTS[post], m = this.sys.officer(post), D = DEPTS[P.dept];
      const card = h(`<div class="cw-ocard ${m ? '' : 'vacant'}" style="--dc:${D.color}"></div>`);
      if (m) {
        const bon = P.stats(m.lvl);
        card.innerHTML = `${face(m, 'big')}<div><div class="post">${P.name}</div><div class="nm">${esc(m.name)}</div><div class="rk">${rankName(m)} · L${m.lvl} · skill ${skillOf(m, P.dept)}${m.status === 'wounded' ? ' · <span style="color:var(--bad)">wounded</span>' : ''}</div>
          <div class="oab"><b>${P.ability}</b> — ${P.desc}</div><div class="bon">${Object.entries(bon).map(([k, v]) => `${STAT_NAMES[k] || k} ${fmtStat(k, v)}`).join(' · ')}</div>
          <div class="cw-mbar" style="margin-top:6px" title="Morale"><i style="width:${m.morale.toFixed(0)}%"></i></div></div>
          <div class="acts"><button class="btn" data-a="view">Record</button><button class="btn" data-a="replace">Replace</button></div>`;
        card.querySelector('[data-a=view]').addEventListener('click', () => { this.selId = m.id; this.filter = 'all'; this.show('roster'); });
      } else {
        card.innerHTML = `<div class="cw-face big" style="--dc:${D.color};background-image:none;display:flex;align-items:center;justify-content:center;font-family:var(--head);color:var(--text-dim)">—</div><div><div class="post">${P.name}</div><div class="nm">Post vacant</div><div class="oab"><b>${P.ability}</b> — ${P.desc}</div></div>
          <div class="acts"><button class="btn violet" data-a="replace">Appoint</button></div>`;
      }
      card.querySelector('[data-a=replace]').addEventListener('click', () => {
        const old = card.querySelector('.cw-cands'); if (old) { old.remove(); return; }
        const cands = st.members.filter((x) => !x.officer && (x.dept === P.dept || x.section === P.dept)).sort((a, b) => skillOf(b, P.dept) - skillOf(a, P.dept)).slice(0, 5);
        const list = h(`<div class="cw-cands">${cands.length ? '' : '<div>No one in that department</div>'}</div>`);
        for (const c of cands) {
          const row = h(`<div><span>${rankAbbr(c)} ${esc(c.name)}</span><span>L${c.lvl} · skill ${skillOf(c, P.dept)}</span></div>`);
          row.addEventListener('click', () => { this.sys.appoint(post, c); this.render(); });
          list.append(row);
        }
        card.append(list);
      });
      grid.append(card);
    }
    B.append(grid);
  }

  // ---------------- decks (cutaway) ----------------
  renderDecks(st) {
    const B = this.body; B.innerHTML = '';
    const wrap = h(`<div class="cw-decks"><canvas></canvas><div class="hint">${touchUI() ? 'Tap a figure or a room' : 'Hover the crew · click a room to see who works there'}</div></div>`);
    B.append(wrap);
    const side = h('<div class="cw-col cw-sec"><div class="cw-panel cw-scroll" style="flex:1"></div></div>');
    B.append(side);
    this.secPanel = side.querySelector('.cw-panel');
    this.cut = new Cutaway(wrap.querySelector('canvas'), this.sys, {
      onHover: (hit, e) => {
        if (touchUI()) return;
        if (hit && hit.member) this.game.ui.showTip(memberTip(hit.member, this.sys), e);
        else if (hit && hit.room) this.game.ui.showTip(`<div class="tn" style="color:${hit.room.color}">${esc(hit.room.name)}</div><div class="tb">${SECTIONS[hit.room.sec].name}</div>`, e);
        else this.game.ui.hideTip();
      },
      onPick: (hit, e) => {
        if (hit.member) { if (touchUI()) this.game.ui.showTip(memberTip(hit.member, this.sys), e); this.secSel = hit.room ? hit.room.sec : this.secSel; this.pickedMember = hit.member.id; }
        else if (hit.room) { this.secSel = hit.room.sec; this.pickedMember = null; if (touchUI()) this.game.ui.hideTip(); }
        else { this.secSel = null; this.game.ui.hideTip(); }
        this.cut.sel = this.secSel;
        this.renderSecPanel();
      },
    });
    this.cut.sel = this.secSel;
    this.renderSecPanel();
  }

  renderSecPanel() {
    const el = this.secPanel; if (!el) return;
    const st = this.sys.state, rep = this.sys.report();
    const sec = this.secSel;
    if (!sec) {
      let s = '<div class="cw-h">Ship\'s company</div>';
      for (const k of DEPT_KEYS) {
        const d = rep[k], D = DEPTS[k];
        s += `<div class="cw-dept" data-d="${k}" style="--dc:${D.color}"><i class="cw-dot"></i><span class="nm">${D.name}</span><span class="ct ${d.req && d.n < d.req ? 'low' : ''}">${d.n}/${d.req || '—'} · ${Math.round(d.perf * 100)}%</span><div class="eff"><i style="width:${Math.min(100, d.perf * 100 / 1.15).toFixed(0)}%"></i></div></div>`;
      }
      s += `<div class="cw-h" style="margin-top:10px">Effect on the ship</div>${this.bonusPanel()}`;
      el.innerHTML = s;
      el.querySelectorAll('.cw-dept').forEach((e) => e.addEventListener('click', () => { this.secSel = DEPTS[e.dataset.d].section; this.cut.sel = this.secSel; this.renderSecPanel(); }));
      return;
    }
    const S = SECTIONS[sec];
    const depts = S.depts;
    const people = st.members.filter((m) => (depts.includes(m.section)) || (sec === 'medical' && m.status === 'wounded'));
    let s = `<div class="big">${S.name.toUpperCase()}</div>`;
    for (const k of depts) {
      const d = rep[k];
      s += `<div class="stat"><span style="color:${DEPTS[k].color}">${DEPTS[k].name}</span><b>${d.n} / ${d.req || '—'}</b></div>
        <div class="stat"><span>Efficiency</span><b>${Math.round(d.perf * 100)}%</b></div><div class="cw-dept" style="--dc:${DEPTS[k].color};padding:0"><div class="eff" style="grid-column:1/4"><i style="width:${Math.min(100, d.perf * 100 / 1.15).toFixed(0)}%"></i></div></div>
        <div class="stat"><span>Average skill</span><b>${Math.round(d.quality * 100)}</b></div>${d.wounded ? `<div class="stat"><span>Wounded</span><b style="color:var(--bad)">${d.wounded}</b></div>` : ''}
        ${d.fire ? '<div class="stat"><span style="color:var(--bad)">FIRE — damage control responding</span></div>' : ''}
        <div style="font-size:12px;color:var(--text-dim);margin:4px 0 8px">${DEPTS[k].blurb}</div>`;
    }
    if (!depts.length) s += `<div style="font-size:12px;color:var(--text-dim);margin:4px 0 8px">${sec === 'quarters' ? 'Off-watch crew rest here between shifts.' : sec === 'cargo' ? 'Salvage and stores.' : 'Where the crew gather off duty.'}</div>`;
    s += `<div class="cw-h" style="margin-top:6px">${people.length} aboard</div><div class="cw-mini"></div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn" id="cwSecAll">All sections</button>${depts[0] ? '<button class="btn" id="cwSecRoster">Open in roster</button>' : ''}</div>`;
    el.innerHTML = s;
    const mini = el.querySelector('.cw-mini');
    for (const m of this.sorted(people).slice(0, 80)) {
      const row = h(`<div class="${m.status === 'wounded' ? 'w' : ''}" style="--dc:${DEPTS[m.dept].color}${m.id === this.pickedMember ? ';outline:1px solid var(--cyan)' : ''}">${face(m)}<span>${rankAbbr(m)} ${esc(m.name)}${m.officer ? ` · ${OFFICER_POSTS[m.officer].short}` : ''}</span><em>L${m.lvl} · ${skillOf(m)}</em></div>`);
      row.addEventListener('click', () => { this.selId = m.id; this.filter = 'all'; this.show('roster'); });
      mini.append(row);
    }
    el.querySelector('#cwSecAll').addEventListener('click', () => { this.secSel = null; this.cut.sel = null; this.renderSecPanel(); });
    const ro = el.querySelector('#cwSecRoster');
    if (ro) ro.addEventListener('click', () => { this.filter = depts[0]; this.show('roster'); });
  }

  // ---------------- hire ----------------
  renderHire(st) {
    const B = this.body; B.innerHTML = '';
    const ch = this.sys.chassis, can = this.sys.canHire();
    const full = st.members.length >= ch.crew[1];
    const req = complement(ch), rep = this.sys.report();
    const short = DEPT_KEYS.filter((k) => req[k] && rep[k].n < req[k]).map((k) => `<span style="color:${DEPTS[k].color}">${DEPTS[k].name} ${rep[k].n}/${req[k]}</span>`).join(' · ');
    const col = h(`<div class="cw-col cw-main"><div class="cw-tools" style="justify-content:space-between">
        <div><div class="label">Berths ${st.members.length} / ${ch.crew[1]} · complement ${ch.crew[0]}–${ch.crew[1]}</div>${short ? `<div style="font-size:12px;margin-top:3px">Short-handed: ${short}</div>` : ''}${!can ? '<div class="cw-note">Dock at a station to sign recruits.</div>' : full ? '<div class="cw-note">Every berth is taken.</div>' : ''}</div>
        <div style="display:flex;gap:8px;align-items:center"><span class="label">New faces in ${Math.max(0, Math.ceil((300 - (st.recruitT || 0)) / 60))} min</span><button class="btn" id="cwReroll">Post notice · ${40 * ch.tier} ¢</button></div></div>
      <div class="cw-hire cw-scroll" style="flex:1"></div></div>`);
    const grid = col.querySelector('.cw-hire');
    for (const r of st.recruits) {
      const d = DEPTS[r.dept];
      const card = h(`<div class="cw-rcard" style="--dc:${d.color}">${face(r, 'big')}<div><div class="nm">${esc(r.name)}</div><div class="rk">${rankName(r)} · ${SPECIES_NAME[r.species]}</div>
        <div class="rk"><span style="color:${d.color}">${d.name}</span> · L${r.lvl} · skill ${skillOf(r, r.dept)}</div><div class="cost">${r.cost} ¢</div></div>
        <div class="tr">${r.traits.map((t) => `<b style="color:${['clumsy', 'homesick'].includes(t) ? '#ff8a9a' : '#8fb8ff'}">${TRAITS[t].name}</b>`).join(' · ')}</div>
        <button class="btn" ${!can || full || this.game.data.credits < r.cost ? 'disabled' : ''}>Sign on</button></div>`);
      card.querySelector('button').addEventListener('click', () => { if (this.sys.hire(r)) this.render(); });
      grid.append(card);
    }
    col.querySelector('#cwReroll').addEventListener('click', () => { if (this.sys.rerollRecruits()) this.render(); });
    B.append(col);
  }

  // ---------------- per frame ----------------
  update(realDt) {
    if (!this.isOpen()) return;
    if (this.cut) this.cut.draw(realDt, this.game.data.playtime);
    this.subT -= realDt;
    if (this.subT <= 0) {
      this.subT = 1.5;
      this.updateSub();
      if (this.tab === 'decks' && this.secPanel && !this.secPanel.matches(':hover')) this.renderSecPanel();
    }
    if (this.dirtyT > 0) {
      this.dirtyT -= realDt;
      if (this.dirtyT <= 0 && this.tab !== 'decks') this.render();
    }
  }
}
