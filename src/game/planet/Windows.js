// The Explorer Bay (vehicle loadout, gear bay, hangar of 60 chassis, fabricator) and the Refinery
// (resources -> permanent warship upgrades, gear workshop, probe upgrades). Usable from orbit and
// from the planet HUD; exposed as game.modes.explorer / game.modes.refinery.
import { icon } from '../../ui/icons.js';
import { RARITY } from '../data/items.js';
import { EXPLORERS, EXPLORER_BY_ID, EXPLORER_FRAMES } from '../data/chassis.js';
import { slotKeys, slotType } from '../Player.js';
import { CHASSIS_BY_ID } from '../data/chassis.js';
import {
  EX_BASES, EX_INV_SIZE, EX_SLOT_LABEL, exSlotKeys, exDescribe, exItemScore, explorerStats, ensureExplorer, equipExItem, unequipExItem,
  equipBestEx, setExChassis, scrapYield, explorerXpForLevel,
} from './explorerItems.js';
import {
  RESOURCES, RES_KEYS, SHIP_UPGRADES, upgradeCost, buyShipUpgrade, refineryShipStats, reforgeCost, empowerCost, overchargeCost, imbueCost,
  workshop, canImbue, chassisCost, buyChassis, fabricateCost, fabricate, addResources, affordable, PROBE_UPGRADES, buyProbeUpgrade, probeStats, EMPOWER_MAX,
} from './economy.js';
import { ITEM_MAX_LVL, AFFIXES } from '../data/items.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString();

export class PlanetWindows {
  constructor(game) {
    this.game = game;
    this.wins = {};
    this.tab = 'ship';
    this.sel = null;
  }
  ensure() {
    if (this.wins.explorer) return;
    const ui = document.getElementById('ui');
    for (const [id, title] of [['explorer', 'Explorer Bay'], ['refinery', 'Refinery']]) {
      const w = h(`<div id="p_${id}" class="win holo scan pwin"><div class="wtitle"><span>${title}</span><span class="close">✕</span></div><div class="wbody"></div></div>`);
      w.querySelector('.close').addEventListener('click', () => this.toggle(id, false));
      w.addEventListener('keydown', (e) => e.stopPropagation());
      ui.append(w);
      this.wins[id] = w;
    }
  }
  isOpen(id) { return this.wins[id] && this.wins[id].classList.contains('open'); }
  toggle(id, on) {
    this.ensure();
    const w = this.wins[id];
    const open = on ?? !w.classList.contains('open');
    w.classList.toggle('open', open);
    if (open) this.render(id); else this.game.ui.hideTip();
    return open;
  }
  closeAll() { let any = false; for (const id of Object.keys(this.wins)) if (this.isOpen(id)) { this.toggle(id, false); any = true; } return any; }
  refresh() { for (const id of Object.keys(this.wins)) if (this.isOpen(id)) this.render(id); }
  render(id) { ensureExplorer(this.game.data); if (id === 'explorer') this.renderExplorer(); else this.renderRefinery(); }
  mode() { return this.game.mode === 'planet' && this.game.activeMode && this.game.activeMode.vehicle ? this.game.activeMode : null; }
  changed() {
    const M = this.mode();
    if (M) M.rebuildVehicle();
    this.refresh();
  }

  costHtml(cost) {
    const D = this.game.data;
    return Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => {
      const have = k === 'credits' ? D.credits : (D.resources[k] || 0);
      const col = k === 'credits' ? '#ffd66a' : RESOURCES[k].color;
      return `<span class="cost ${have < v ? 'short' : ''}" style="color:${col}">${fmt(v)} ${k === 'credits' ? '¢' : RESOURCES[k].short}</span>`;
    }).join('');
  }
  bankHtml() {
    const D = this.game.data;
    return `<div class="pbank">${RES_KEYS.map((k) => `<span title="${RESOURCES[k].name} — ${RESOURCES[k].blurb}" style="color:${RESOURCES[k].color}">${RESOURCES[k].short} <b>${fmt(D.resources[k] || 0)}</b></span>`).join('')}<span style="color:#ffd66a">¢ <b>${fmt(D.credits)}</b></span></div>`;
  }
  exItemEl(item, extra = '') { return `<div class="item r-${item.rarity}" data-uid="${item.uid}">${icon(EX_BASES[item.base].icon)}<span class="il">${item.ilvl}</span>${extra}</div>`; }
  exTip(item) {
    const d = exDescribe(item);
    let s = `<div class="tn" style="color:${d.rarity.color}">${esc(d.title)}</div><div class="tb">${d.rarity.name} ${d.base} · item level ${item.ilvl}</div>`;
    s += d.lines.map((l) => `<div class="tl">${l}</div>`).join('');
    s += d.affixes.map((a) => `<div class="ta">${a}</div>`).join('');
    s += d.uniques.map((u) => `<div class="tu"><b>${u.name}:</b> ${u.desc}</div>`).join('');
    const y = scrapYield(item);
    s += `<div class="tx">Explorer ${EX_SLOT_LABEL[item.slot]} · scraps for ${Object.entries(y).map(([k, v]) => `${v} ${RESOURCES[k].short}`).join(', ')}</div>`;
    return s;
  }

  // ---------------------------------------------------------------- Explorer Bay
  renderExplorer() {
    const G = this.game, D = G.data, ex = ensureExplorer(D);
    const st = explorerStats(ex), ch = st.chassis;
    const body = this.wins.explorer.querySelector('.wbody');
    const M = this.mode();
    const canSwap = !M || M.atLander;
    const keys = exSlotKeys(ch);
    let slots = '';
    for (const t of ['gun', 'tool', 'module']) {
      slots += `<div class="label" style="margin:8px 0 4px">${EX_SLOT_LABEL[t]}s</div><div class="slots">`;
      for (const k of keys.filter((x) => x.startsWith(t))) { const it = ex.loadout[k]; slots += `<div class="slot" data-slot="${k}">${it ? this.exItemEl(it) : ''}</div>`; }
      slots += '</div>';
    }
    let inv = `<div class="label" style="margin:8px 0 4px">Gear bay · ${ex.inventory.length}/${EX_INV_SIZE}</div><div class="grid">`;
    for (let i = 0; i < EX_INV_SIZE; i++) {
      const it = ex.inventory[i];
      let up = '';
      if (it) { const same = keys.filter((k) => k.startsWith(it.slot)); const worst = same.length ? Math.min(...same.map((k) => exItemScore(ex.loadout[k]))) : Infinity; if (exItemScore(it) > worst) up = '<span class="up">▲</span>'; }
      inv += `<div class="cell" data-i="${i}">${it ? this.exItemEl(it, up) : ''}</div>`;
    }
    inv += '</div>';
    const dps = st.guns.reduce((a, g) => a + g.ws.dmg * g.ws.pellets * g.ws.barrels * g.ws.rof * st.dmgMul, 0);
    const mine = st.tools.reduce((a, t) => a + t.ts.power, 0) * st.mineMul;
    const row = (k, v) => `<span>${k}</span><b>${v}</b>`;
    const xpN = explorerXpForLevel(ex.level);
    // hangar
    let hangar = '<div class="hangar">';
    for (const [fk, f] of Object.entries(EXPLORER_FRAMES)) {
      hangar += `<div class="hrow"><div class="hname" title="${esc(f.blurb)}">${f.name}</div>`;
      for (let m = 1; m <= 10; m++) {
        const c = EXPLORER_BY_ID[`ex_${fk}_${m}`];
        const owned = ex.owned.includes(c.id), active = ex.chassis === c.id;
        const next = !owned && (m === 1 || ex.owned.includes(`ex_${fk}_${m - 1}`));
        hangar += `<div class="hmk ${owned ? 'owned' : ''} ${active ? 'active' : ''} ${next ? 'next' : ''}" data-ch="${c.id}">${m}</div>`;
      }
      hangar += '</div>';
    }
    hangar += '</div>';
    const fab = ['gun', 'tool', 'module'].map((s) => `<button class="btn fab" data-fab="${s}">Fabricate ${EX_SLOT_LABEL[s]}<div class="costs">${this.costHtml(fabricateCost(s, ex.level))}</div></button>`).join('');
    body.innerHTML = `${this.bankHtml()}
      <div class="pcols"><div>
        <div class="title" style="color:var(--cyan)">${esc(ch.fullName)}</div>
        <div class="label" style="margin:2px 0 6px">Explorer level ${ex.level} · ${EXPLORER_FRAMES[ch.frame].blurb}</div>
        <div class="bar xp" style="margin-bottom:8px"><i style="width:${(ex.xp / xpN * 100).toFixed(1)}%"></i></div>
        <div class="statgrid">${row('Hull', fmt(st.maxHp))}${row('Shield', fmt(st.maxShield))}${row('Armour', st.armor.toFixed(0))}${row('Speed', st.speed.toFixed(0))}${row('Cargo', st.cargo)}${row('Weapon DPS', fmt(dps))}${row('Mining', mine.toFixed(1) + '/s')}${row('Pickup radius', st.pickup.toFixed(0))}${row('Runs · kills', `${ex.runs || 0} · ${ex.kills || 0}`)}</div>
        ${slots}
      </div><div>
        ${inv}
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" id="exBest">Equip best</button><button class="btn violet" id="exScrap">Scrap commons</button></div>
        <div class="label" style="margin-top:6px">Click: equip / unequip · Right-click: scrap for resources</div>
      </div></div>
      <div class="title" style="margin-top:14px">Hangar <span class="label">${canSwap ? 'click an owned mark to deploy it · next mark to build it' : 'swap vehicles at the lander or in orbit'}</span></div>
      ${hangar}
      <div id="exChassisInfo" class="label" style="min-height:18px;margin-top:6px"></div>
      <div class="title" style="margin-top:12px">Fabricator <span class="label">random gear at item level ${ex.level}</span></div>
      <div class="fabrow">${fab}</div>`;
    const find = (uid) => ex.inventory.find((x) => x.uid === uid) || Object.values(ex.loadout).find((x) => x && x.uid === uid);
    body.querySelectorAll('.item').forEach((el) => {
      const it = find(el.dataset.uid);
      el.addEventListener('mouseenter', (e) => G.ui.showTip(this.exTip(it), e));
      el.addEventListener('mousemove', (e) => G.ui.showTip(this.exTip(it), e));
      el.addEventListener('mouseleave', () => G.ui.hideTip());
    });
    body.querySelectorAll('.cell').forEach((c) => {
      c.addEventListener('click', () => { const it = ex.inventory[+c.dataset.i]; if (it && equipExItem(ex, it)) { G.ui.hideTip(); this.changed(); } });
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); const it = ex.inventory[+c.dataset.i]; if (it) this.scrap(it); });
    });
    body.querySelectorAll('.slot').forEach((s) => s.addEventListener('click', () => { if (unequipExItem(ex, s.dataset.slot)) { G.ui.hideTip(); this.changed(); } }));
    body.querySelector('#exBest').onclick = () => { equipBestEx(ex); this.changed(); };
    body.querySelector('#exScrap').onclick = () => { for (const it of ex.inventory.slice()) if (it.rarity === 'common') this.scrap(it, true); this.refresh(); };
    const info = body.querySelector('#exChassisInfo');
    body.querySelectorAll('.hmk').forEach((el) => {
      const c = EXPLORER_BY_ID[el.dataset.ch];
      el.addEventListener('mouseenter', () => { info.innerHTML = `<b style="color:var(--white)">${c.fullName}</b> · hull ${c.hp} · speed ${c.speed} · cargo ${c.cargo} · slots ${c.slots.gun}G/${c.slots.tool}T/${c.slots.module}M · requires level ${c.level}${ex.owned.includes(c.id) ? '' : ' · ' + this.costHtml(chassisCost(c))}`; });
      el.addEventListener('click', () => {
        if (ex.owned.includes(c.id)) {
          if (!canSwap) { G.ui.toast('Swap vehicles at the lander', 'warn'); return; }
          setExChassis(ex, c.id); G.ui.toast(`${c.fullName} deployed`, 'epic'); this.changed();
        } else {
          const r = buyChassis(D, c.id);
          if (r.ok) { G.ui.toast(`${c.fullName} built`, 'epic'); this.refresh(); } else G.ui.toast(r.why, 'warn');
        }
      });
    });
    body.querySelectorAll('[data-fab]').forEach((b) => b.addEventListener('click', () => {
      const r = fabricate(D, b.dataset.fab, ex.level);
      if (r.ok) { G.ui.toast(`Fabricated ${r.item.name}`, RARITY[r.item.rarity].i >= 3 ? 'epic' : ''); this.refresh(); } else G.ui.toast(r.why, 'warn');
    }));
  }
  scrap(item, quiet) {
    const ex = this.game.data.explorer;
    const i = ex.inventory.indexOf(item); if (i < 0) return;
    ex.inventory.splice(i, 1);
    const y = scrapYield(item);
    addResources(this.game.data, y);
    if (!quiet) { this.game.ui.chat('LOOT', null, `Scrapped ${item.name} for ${Object.entries(y).map(([k, v]) => `${v} ${RESOURCES[k].short}`).join(', ')}`, 'loot', 'loot'); this.game.ui.hideTip(); this.refresh(); }
  }

  // ---------------------------------------------------------------- Refinery
  renderRefinery() {
    const G = this.game, D = G.data;
    D.refinery ||= { ranks: {} };
    const body = this.wins.refinery.querySelector('.wbody');
    const tabs = [['ship', 'Warship upgrades'], ['workshop', 'Gear workshop'], ['probes', 'Probes']];
    let html = `${this.bankHtml()}<div class="ptabs">${tabs.map(([k, n]) => `<b class="${this.tab === k ? 'on' : ''}" data-tab="${k}">${n}</b>`).join('')}</div>`;
    if (this.tab === 'ship') {
      const st = refineryShipStats(D);
      html += `<div class="label" style="margin:4px 0 8px">Planet resources refined into permanent upgrades for your warship. Current bonus: ${Object.entries(st).map(([k, v]) => `${k} +${v < 1 ? (v * 100).toFixed(1) + '%' : v.toFixed(0)}`).join(' · ') || 'none yet'}</div>`;
      for (const up of SHIP_UPGRADES) {
        const r = D.refinery.ranks[up.k] || 0, max = r >= up.max;
        const cost = upgradeCost(up, r);
        const eff = (x) => up.stat === 'armor' ? `+${(up.per * x).toFixed(0)}` : `+${(up.per * x * 100).toFixed(1)}%`;
        html += `<div class="uprow"><div><div class="un">${up.name} <span class="label">rank ${r}/${up.max}</span></div><div class="ud">${up.desc} <span style="color:var(--good)">${eff(r)} → ${eff(Math.min(up.max, r + 1))} ${up.stat}</span></div></div>
          <div class="costs">${max ? '<span class="label">MAX</span>' : this.costHtml(cost)}</div><button class="btn" data-up="${up.k}" ${max || !affordable(D, cost) ? 'disabled' : ''}>Refine</button></div>`;
      }
    } else if (this.tab === 'probes') {
      const ps = probeStats(D);
      D.refinery.probe ||= {};
      html += `<div class="label" style="margin:4px 0 8px">Probes: ${ps.count} at once · haul ${ps.cap} · speed ${ps.speed.toFixed(0)} · ${ps.rate.toFixed(1)} units/s · ${ps.hp.toFixed(0)} hp${ps.uplink ? ' · Haul Uplink' : ''}</div>`;
      for (const up of PROBE_UPGRADES) {
        const r = D.refinery.probe[up.k] || 0, max = r >= up.max, cost = upgradeCost(up, r);
        html += `<div class="uprow"><div><div class="un">${up.name} <span class="label">rank ${r}/${up.max}</span></div><div class="ud">${up.desc}</div></div>
          <div class="costs">${max ? '<span class="label">MAX</span>' : this.costHtml(cost)}</div><button class="btn" data-pup="${up.k}" ${max || !affordable(D, cost) ? 'disabled' : ''}>Upgrade</button></div>`;
      }
    } else {
      const L = D.ship.loadout, ch = CHASSIS_BY_ID[D.ship.chassis];
      const items = [...slotKeys(ch).map((k) => L[k]).filter(Boolean), ...D.inventory];
      if (!this.sel || !items.includes(this.sel)) this.sel = items[0] || null;
      html += `<div class="pcols"><div><div class="label" style="margin:4px 0">Equipped & hold</div><div class="grid wk">${items.map((it) => `<div class="cell ${it === this.sel ? 'sel' : ''}" data-uid="${it.uid}"><div class="item r-${it.rarity}">${icon(BASE_ICON(it))}<span class="il">${it.ilvl}</span></div></div>`).join('')}</div></div><div id="wkDetail">`;
      const it = this.sel;
      if (it) {
        html += G.ui.itemTip(it, null);
        const act = (kind, label, cost, ok, extra = '') => `<div class="uprow"><div><div class="un">${label}</div>${extra}</div><div class="costs">${ok ? this.costHtml(cost) : '<span class="label">—</span>'}</div><button class="btn" data-wk="${kind}" ${!ok || !affordable(D, cost) ? 'disabled' : ''}>${kind}</button></div>`;
        html += `<div style="margin-top:10px">`;
        it.affixes.forEach((a, i) => { html += `<div class="uprow"><div><div class="un">Reforge</div><div class="ud">${AFFIXES[a.k].fmt(a.v)}</div></div><div class="costs">${this.costHtml(reforgeCost(it))}</div><button class="btn violet" data-reforge="${i}" ${!affordable(D, reforgeCost(it)) ? 'disabled' : ''}>Reroll</button></div>`; });
        html += act('empower', `Empower <span class="label">item level ${it.ilvl} → ${it.ilvl + 1}</span>`, empowerCost(it), it.ilvl < EMPOWER_MAX);
        html += act('overcharge', `Overcharge <span class="label">mastery ${it.lvl}/${ITEM_MAX_LVL}</span>`, overchargeCost(it), it.lvl < ITEM_MAX_LVL);
        html += act('imbue', `Imbue <span class="label">add an affix (${it.affixes.length} now)</span>`, imbueCost(it), canImbue(it));
        html += '</div>';
      } else html += '<div class="label">No gear to work on.</div>';
      html += '</div></div>';
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render('refinery'); }));
    body.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => {
      const r = buyShipUpgrade(D, b.dataset.up);
      if (r.ok) { G.refitPlayer(); G.ui.toast(`Refined: ${b.parentElement.querySelector('.un').firstChild.textContent.trim()} rank ${r.rank}`, 'epic'); } else G.ui.toast(r.why, 'warn');
      this.render('refinery');
    }));
    body.querySelectorAll('[data-pup]').forEach((b) => b.addEventListener('click', () => { const r = buyProbeUpgrade(D, b.dataset.pup); if (!r.ok) G.ui.toast(r.why, 'warn'); this.render('refinery'); }));
    body.querySelectorAll('.wk .cell').forEach((c) => c.addEventListener('click', () => { this.sel = [...Object.values(D.ship.loadout), ...D.inventory].find((x) => x && x.uid === c.dataset.uid); this.render('refinery'); }));
    const run = (kind, arg) => { const r = workshop(D, this.sel, kind, arg); if (r.ok) { G.refitPlayer(); G.ui.toast(`${kind[0].toUpperCase() + kind.slice(1)}: ${this.sel.name}`, 'epic'); } else G.ui.toast(r.why || 'Failed', 'warn'); this.render('refinery'); };
    body.querySelectorAll('[data-reforge]').forEach((b) => b.addEventListener('click', () => run('reforge', +b.dataset.reforge)));
    body.querySelectorAll('[data-wk]').forEach((b) => b.addEventListener('click', () => run(b.dataset.wk)));
  }
}

import { BASES } from '../data/items.js';
const BASE_ICON = (it) => BASES[it.base] ? BASES[it.base].icon : 'reactor';
