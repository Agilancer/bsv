// The Explorer Bay (vehicle loadout, gear bay, hangar of 60 chassis, fabricator) and the Refinery
// (resources -> permanent warship upgrades, gear workshop, probe upgrades). Usable from orbit and
// from the planet HUD; exposed as game.modes.explorer / game.modes.refinery.
import { icon } from '../../ui/icons.js';
import { RARITY } from '../data/items.js';
import { EXPLORER_BY_ID, EXPLORER_FRAMES, CHASSIS_BY_ID } from '../data/chassis.js';
import { slotKeys } from '../Player.js';
import {
  EX_BASES, EX_INV_SIZE, EX_SLOT_LABEL, exSlotKeys, exDescribe, exItemScore, explorerStats, ensureExplorer, equipExItem, unequipExItem,
  equipBestEx, setExChassis, scrapYield, explorerXpForLevel, SLOT_OF, exDroneStats, droneSheetDps, exAffixPool, EX_AFFIXES, hpWhy, exWeaponStats,
} from './explorerItems.js';
import {
  RESOURCES, RES_KEYS, SHIP_UPGRADES, upgradeCost, buyShipUpgrade, refineryShipStats, reforgeCost, empowerCost, overchargeCost, imbueCost,
  workshop, canImbue, chassisCost, buyChassis, fabricateCost, fabricate, addResources, affordable, PROBE_UPGRADES, buyProbeUpgrade, probeStats, EMPOWER_MAX, empowerCap, fmtShipStat, SHIP_STAT_LABELS,
  BLUEPRINTS, craftCost, craftItem, knowsBlueprint, exWorkshop, exWorkshopCost, exEmpowerCap,
} from './economy.js';
import { EX_MARKS } from '../data/chassis.js';
import { vehicleReady, loadVehicle } from './vehicleGLB.js';
import { drawSchematic } from './schematic.js';
import { fitExplorer, exAutoScore } from './autoCraft.js';
import { ITEM_MAX_LVL, AFFIXES, BASES } from '../data/items.js';

const BASE_ICON = (it) => (BASES[it.base] ? BASES[it.base].icon : 'reactor');

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
  exItemEl(item, extra = '') {
    const b = EX_BASES[item.base], bay = b.slot === 'bay' ? `<span class="baybadge" style="--bc:#${b.color.toString(16).padStart(6, '0')}">◈</span>` : '';
    return `<div class="item r-${item.rarity}${b.slot === 'bay' ? ' bayitem' : ''}" data-uid="${item.uid}">${icon(b.icon)}${bay}<span class="il">${item.ilvl}</span>${extra}</div>`;
  }
  exTip(item, ch = null) {
    const d = exDescribe(item, item.slot === 'bay' && ch ? ch.droneBonus || 0 : 0);
    let s = `<div class="tn" style="color:${d.rarity.color}">${esc(d.title)}</div><div class="tb">${d.rarity.name} ${d.base} · item level ${item.ilvl}</div>`;
    s += d.lines.map((l) => `<div class="tl">${l}</div>`).join('');
    // the number on the mount tile: base dps times this explorer's damage (level, modules, refinery)
    const exd = this.game.data.explorer, mul = exd ? explorerStats(exd).dmgMul : 1;
    if (item.slot === 'gun') { const w = exWeaponStats(item); s += `<div class="tl" style="color:var(--good)">On this explorer: ${fmt(w.dmg * w.pellets * w.barrels * w.rof * mul)} dps</div>`; }
    else if (item.slot === 'bay') { const ds = exDroneStats(item, ch ? ch.droneBonus || 0 : 0), v = droneSheetDps(ds); if (v) s += `<div class="tl" style="color:var(--good)">On this explorer: ${fmt(v * mul)} dps</div>`; }
    s += d.affixes.map((a) => `<div class="ta">${a}</div>`).join('');
    s += d.uniques.map((u) => `<div class="tu"><b>${u.name}:</b> ${u.desc}</div>`).join('');
    const y = scrapYield(item);
    s += `<div class="tx">Explorer ${EX_SLOT_LABEL[item.slot]} · scraps for ${Object.entries(y).map(([k, v]) => `${v} ${RESOURCES[k].short}`).join(', ')}</div>`;
    return s;
  }

  // ---------------------------------------------------------------- Explorer Bay
  // tabs: Loadout (mounts, gear bay) · Hangar (7 frames x 12 marks) · Fabricator (blueprints) · Workshop
  renderExplorer() {
    const G = this.game, D = G.data, ex = ensureExplorer(D);
    const st = explorerStats(ex), ch = st.chassis;
    const body = this.wins.explorer.querySelector('.wbody');
    const M = this.mode();
    const canSwap = !M || M.atLander;
    const keys = exSlotKeys(ch);
    this.exTab ||= 'loadout';
    const tabs = [['loadout', 'Loadout'], ['hangar', 'Hangar'], ['fab', 'Fabricator'], ['shop', 'Workshop']];
    const xpN = explorerXpForLevel(ex.level);
    const head = `${this.bankHtml()}<div class="exhead"><div><div class="title" style="color:var(--cyan)">${esc(ch.fullName)}</div>
      <div class="label">Explorer level ${ex.level} · ${EXPLORER_FRAMES[ch.frame].blurb}</div></div></div>
      <div class="bar xp" style="margin:4px 0 8px"><i style="width:${(ex.xp / xpN * 100).toFixed(1)}%"></i></div>
      <div class="ptabs">${tabs.map(([k, n]) => `<b class="${this.exTab === k ? 'on' : ''}" data-extab="${k}">${n}</b>`).join('')}</div>`;
    let html = '';
    if (this.exTab === 'loadout') html = this.exLoadoutHtml(ex, st, ch, keys);
    else if (this.exTab === 'hangar') html = this.exHangarHtml(ex, ch, canSwap);
    else if (this.exTab === 'fab') html = this.exFabHtml(ex, st, ch, keys);
    else html = this.exShopHtml(ex, ch, keys);
    body.innerHTML = head + html;
    body.querySelectorAll('[data-extab]').forEach((b) => b.addEventListener('click', () => { this.exTab = b.dataset.extab; G.ui.hideTip(); this.refresh(); }));
    const find = (uid) => ex.inventory.find((x) => x.uid === uid) || Object.values(ex.loadout).find((x) => x && x.uid === uid);
    body.querySelectorAll('.item').forEach((el) => {
      const it = find(el.dataset.uid);
      if (!it) return;
      el.addEventListener('mouseenter', (e) => G.ui.showTip(this.exTip(it, ch), e));
      el.addEventListener('mousemove', (e) => G.ui.showTip(this.exTip(it, ch), e));
      el.addEventListener('mouseleave', () => G.ui.hideTip());
    });
    const cv = body.querySelector('#exSchem');
    const mounts = keys.filter((k) => k.startsWith('hp:')).map((k) => ({ kind: ex.loadout[k] ? ex.loadout[k].slot : null }));
    if (cv) {
      const gl = vehicleReady(ch.id);
      const ppm = this.exTab === 'hangar' ? 9 : Infinity;   // hangar: one scale so the marks compare; loadout: fill the panel
      if (gl) { try { drawSchematic(cv, ch.id, gl, mounts, ppm); } catch (e) { cv.style.display = 'none'; } }
      else { cv.style.display = 'none'; loadVehicle(ch.id).then((g) => { if (g && this.isOpen('explorer')) this.refresh(); }); }
    }
    if (this.exTab === 'loadout') {
      body.querySelectorAll('.cell').forEach((c) => {
        c.addEventListener('click', () => {
          const it = ex.inventory[+c.dataset.i];
          if (!it) return;
          if (SLOT_OF[it.slot] === 'hp') {
            const mountKeys = keys.filter((k) => k.startsWith('hp:'));
            const same = mountKeys.filter((k) => ex.loadout[k] && ex.loadout[k].slot === it.slot);
            const weakest = (list) => list.reduce((a, b) => (exAutoScore(ex.loadout[a]) <= exAutoScore(ex.loadout[b]) ? a : b));
            const target = this.selMount && mountKeys.includes(this.selMount) ? this.selMount
              : mountKeys.find((k) => !ex.loadout[k]) || (same.length ? weakest(same) : weakest(mountKeys));
            const why = hpWhy(ex, ch, it, ex.loadout[target]);
            if (why) { G.ui.toast(why, 'warn'); return; }
            if (equipExItem(ex, it, target)) { this.selMount = null; G.ui.hideTip(); this.changed(); }
          } else if (equipExItem(ex, it)) { G.ui.hideTip(); this.changed(); }
        });
        c.addEventListener('contextmenu', (e) => { e.preventDefault(); const it = ex.inventory[+c.dataset.i]; if (it) this.scrap(it); });
      });
      body.querySelectorAll('.slot').forEach((s) => s.addEventListener('click', () => {
        const k = s.dataset.slot;
        if (k.startsWith('hp:') && this.selMount !== k) { this.selMount = k; this.refresh(); return; }
        const it = ex.loadout[k], mounts = keys.filter((x) => x.startsWith('hp:'));
        if (it && it.slot === 'gun' && mounts.some((x) => ex.loadout[x] && ex.loadout[x].slot === 'bay') && !mounts.some((x) => x !== k && ex.loadout[x] && ex.loadout[x].slot === 'gun')) { G.ui.toast('One mount must keep a gun while drone bays fly', 'warn'); return; }
        if (unequipExItem(ex, k)) { this.selMount = null; G.ui.hideTip(); this.changed(); }
      }));
      body.querySelector('#exBest').onclick = () => { fitExplorer(ex); this.changed(); };   // by what the gear does, a gun always fitted
      body.querySelector('#exScrap').onclick = () => { for (const it of ex.inventory.slice()) if (it.rarity === 'common') this.scrap(it, true); this.refresh(); };
    } else if (this.exTab === 'hangar') {
      const info = body.querySelector('#exChassisInfo');
      body.querySelector('.hangar').addEventListener('mouseleave', () => { const g = vehicleReady(ch.id); if (g && cv) { cv.style.display = ''; drawSchematic(cv, ch.id, g, mounts); } });
      body.querySelectorAll('.hmk').forEach((el) => {
        const c = EXPLORER_BY_ID[el.dataset.ch];
        el.addEventListener('mouseenter', () => { if (cv) this.previewMark(cv, c); info.innerHTML = this.markInfo(ex, c); });
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
    } else if (this.exTab === 'fab') {
      body.querySelectorAll('[data-bp]').forEach((b) => b.addEventListener('click', () => { this.bp = b.dataset.bp; this.bpAffix = ''; this.refresh(); }));
      const sel = body.querySelector('#bpAffix');
      if (sel) sel.addEventListener('change', () => { this.bpAffix = sel.value; this.refresh(); });
      body.querySelectorAll('[data-craft]').forEach((b) => b.addEventListener('click', () => {
        const master = b.dataset.craft === '1';
        const r = craftItem(D, this.bp, ex.level, master, undefined, master ? this.bpAffix || null : null);
        if (r.ok) { G.ui.toast(`Crafted ${r.item.name}`, RARITY[r.item.rarity].i >= 3 ? 'epic' : ''); G.quests && G.quests.emit && G.quests.emit('craft', { n: 1, kind: r.item.slot }); this.refresh(); } else G.ui.toast(r.why, 'warn');
      }));
      body.querySelectorAll('[data-fab]').forEach((b) => b.addEventListener('click', () => {
        const r = fabricate(D, b.dataset.fab, ex.level);
        if (r.ok) { G.ui.toast(`Fabricated ${r.item.name}`, RARITY[r.item.rarity].i >= 3 ? 'epic' : ''); this.refresh(); } else G.ui.toast(r.why, 'warn');
      }));
    } else {
      body.querySelectorAll('[data-wsel]').forEach((c) => c.addEventListener('click', () => { this.wsel = c.dataset.wsel; this.refresh(); }));
      body.querySelectorAll('[data-ws]').forEach((b) => b.addEventListener('click', () => {
        const it = find(this.wsel); if (!it) return;
        const r = exWorkshop(D, it, b.dataset.ws, +(b.dataset.i || 0));
        if (r.ok) { G.ui.toast(b.dataset.ws === 'empower' ? `${it.name} empowered to item level ${it.ilvl}` : `${it.name} reforged`, ''); this.changed(); } else G.ui.toast(r.why, 'warn');
      }));
    }
  }
  exLoadoutHtml(ex, st, ch, keys) {
    let slots = '';
    for (const t of ['hp', 'tool', 'module']) {
      const label = t === 'hp' ? `Hardpoints <span class="label">· a gun or a drone bay on each mount (${ch.slots.hp} on this mark)</span>` : `${EX_SLOT_LABEL[t]}s`;
      slots += `<div class="label" style="margin:8px 0 4px">${label}</div><div class="slots${t === 'hp' ? ' hps' : ''}">`;
      for (const k of keys.filter((x) => x.startsWith(t + ':'))) {
        const it = ex.loadout[k];
        let sub = '';
        if (t === 'hp' && it) {
          const g = st.guns.find((x) => x.key === k), b = st.bays.find((x) => x.key === k);
          const ds = b && b.ds;
          sub = g ? `${fmt(g.ws.dmg * g.ws.pellets * g.ws.barrels * g.ws.rof * st.dmgMul)} dps`
            : !ds ? '' : ds.type === 'sparrow' || ds.type === 'scarab' ? `${ds.count}× · ${fmt(droneSheetDps(ds) * st.dmgMul)} dps`
            : ds.type === 'mender' ? `${ds.count}× · ${(ds.power * ds.count * 100).toFixed(1)}%/s` : ds.type === 'aegis' ? `${ds.count}× · ${ds.count * ds.charges} catches` : `${ds.count}× · ${(ds.power * ds.count).toFixed(1)}/s ore`;
        }
        slots += `<div class="slot${t === 'hp' ? ' hp' : ''}${it && it.slot === 'bay' ? ' bay' : ''}${this.selMount === k ? ' selm' : ''}" data-slot="${k}">${it ? this.exItemEl(it) : ''}${t === 'hp' ? `<span class="hpn">${+k.split(':')[1] + 1}</span>` : ''}${sub ? `<span class="hpi">${sub}</span>` : ''}</div>`;
      }
      slots += '</div>';
    }
    let inv = `<div class="label" style="margin:8px 0 4px">Gear bay · ${ex.inventory.length}/${EX_INV_SIZE}</div><div class="grid">`;
    for (let i = 0; i < EX_INV_SIZE; i++) {
      const it = ex.inventory[i];
      let up = '';
      if (it) { const same = keys.filter((k) => k.startsWith(SLOT_OF[it.slot] + ':')); const worst = same.length ? Math.min(...same.map((k) => exAutoScore(ex.loadout[k]))) : Infinity; if (exAutoScore(it) > worst) up = '<span class="up">▲</span>'; }
      inv += `<div class="cell" data-i="${i}">${it ? this.exItemEl(it, up) : ''}</div>`;
    }
    inv += '</div>';
    const dps = st.guns.reduce((a, g) => a + g.ws.dmg * g.ws.pellets * g.ws.barrels * g.ws.rof * st.dmgMul, 0) + st.bays.reduce((a, b) => a + droneSheetDps(b.ds) * st.dmgMul, 0);
    const drones = st.bays.reduce((a, b) => a + b.ds.count, 0);
    const mine = st.tools.reduce((a, t) => a + t.ts.power, 0) * st.mineMul;
    const row = (k, v) => `<span>${k}</span><b>${v}</b>`;
    return `<div class="pcols"><div>
        <div class="statgrid">${row('Hull', fmt(st.maxHp))}${row('Shield', fmt(st.maxShield))}${row('Armour', st.armor.toFixed(0))}${row('Speed', st.speed.toFixed(0))}${row('Cargo', st.cargo)}${row('Firepower', fmt(dps) + ' dps')}${row('Drones', drones ? `${drones} in ${st.bays.length} bay${st.bays.length > 1 ? 's' : ''}` : '—')}${row('Mining', mine.toFixed(1) + '/s')}${row('Pickup radius', st.pickup.toFixed(0))}${row('Runs · kills', `${ex.runs || 0} · ${ex.kills || 0}`)}</div>
        <canvas class="schem" id="exSchem" width="340" height="220" title="Top view of the deployed vehicle: numbered mounts, amber = gun, green = drone bay"></canvas>
        ${slots}
      </div><div>
        ${inv}
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" id="exBest">Equip best</button><button class="btn violet" id="exScrap">Scrap commons</button></div>
        <div class="label" style="margin-top:6px">${this.selMount ? `Mount ${+this.selMount.split(':')[1] + 1} selected: the next gun or bay you click goes there · click it again to unequip` : 'Click a mount to choose where the next gun or bay goes · click an item to fit it · right-click scraps'}</div>
      </div></div>`;
  }
  markInfo(ex, c) {
    const prev = EXPLORER_BY_ID[`ex_${c.frame}_${c.tier - 1}`];
    const gain = prev ? [c.slots.hp > prev.slots.hp ? '+1 hardpoint' : '', c.slots.tool > prev.slots.tool ? '+1 tool' : '', c.slots.module > prev.slots.module ? '+1 module' : ''].filter(Boolean).join(' · ') : '';
    return `<b style="color:var(--white)">${c.fullName}</b>${c.adds ? ` · <span style="color:var(--cyan)">${c.tier > 1 ? 'adds' : 'is'}: ${esc(c.adds)}</span>` : ''}<br>hull ${c.hp} · speed ${c.speed} · cargo ${c.cargo} · ${c.slots.hp} hardpoints · ${c.slots.tool} tools · ${c.slots.module} modules${gain ? ` · <span style="color:var(--good)">${gain}</span>` : ''} · requires level ${c.level}${ex.owned.includes(c.id) ? '' : '<br>' + this.costHtml(chassisCost(c))}`;
  }
  exHangarHtml(ex, ch, canSwap) {
    let hangar = '<div class="hangar">';
    for (const [fk, f] of Object.entries(EXPLORER_FRAMES)) {
      hangar += `<div class="hrow"><div class="hname" title="${esc(f.blurb)}">${f.name}</div>`;
      for (let m = 1; m <= EX_MARKS; m++) {
        const c = EXPLORER_BY_ID[`ex_${fk}_${m}`];
        const owned = ex.owned.includes(c.id), active = ex.chassis === c.id;
        const next = !owned && (m === 1 || ex.owned.includes(`ex_${fk}_${m - 1}`));
        hangar += `<div class="hmk ${owned ? 'owned' : ''} ${active ? 'active' : ''} ${next ? 'next' : ''}" data-ch="${c.id}">${m}</div>`;
      }
      hangar += '</div>';
    }
    hangar += '</div>';
    return `<div class="label" style="margin:6px 0">${canSwap ? 'Hover a mark to see it at scale · click an owned mark to deploy it · the next mark to build it' : 'Swap vehicles at the lander or in orbit'}</div>
      ${hangar}
      <div class="hprev"><canvas class="schem" id="exSchem" width="340" height="220"></canvas><div id="exChassisInfo" class="label">${this.markInfo(ex, ch)}</div></div>`;
  }
  exFabHtml(ex, st, ch, keys) {
    this.bp ||= 'sparrow';
    const known = (k) => knowsBlueprint(ex, k);
    const bpRow = (k) => `<div class="bp ${this.bp === k ? 'on' : ''} ${EX_BASES[k].slot} ${known(k) ? '' : 'locked'}" data-bp="${k}" title="${esc(EX_BASES[k].blurb || EX_BASES[k].name)}">${icon(EX_BASES[k].icon)}<span>${esc(EX_BASES[k].name.replace(/ (Gun Drones|Crawlers|Swarm|Wing|Harvesters)$/, ''))}</span>${known(k) ? '' : '<i class="lock">🔒</i>'}</div>`;
    const bpKeys = Object.keys(BLUEPRINTS);
    const sel = EX_BASES[this.bp], sample = this.bpSample(this.bp, ex.level), d = exDescribe(sample, sel.slot === 'bay' ? ch.droneBonus || 0 : 0);
    // the common roll against the weakest fitted mount
    const mountsK = keys.filter((k) => k.startsWith('hp:'));
    const worst = mountsK.length ? Math.min(...mountsK.map((k) => (ex.loadout[k] ? exAutoScore(ex.loadout[k]) : 0))) : 0;
    const vs = worst > 0 ? exAutoScore(sample) / worst : null;
    const vsTxt = vs == null ? 'fills an empty mount' : `${vs >= 1 ? '+' : ''}${Math.round((vs - 1) * 100)}% vs your weakest mount (common roll)`;
    const pool = exAffixPool(this.bp);
    // a chosen affix, shown at its average roll for this item level
    const mid = { float: (a, b) => (a + b) / 2, int: (a, b) => Math.round((a + b) / 2), pick: (a) => a[0], chance: () => false, range: (a, b) => (a + b) / 2 };
    const label = (k) => { try { return EX_AFFIXES[k].fmt(EX_AFFIXES[k].v(ex.level, mid)); } catch (e) { return k; } };
    const opts = `<option value="">random affixes</option>${pool.map((k) => `<option value="${k}" ${this.bpAffix === k ? 'selected' : ''}>${esc(label(k))}</option>`).join('')}`;
    const ok = known(this.bp);
    const fab = ['tool', 'module'].map((s) => `<button class="btn fab" data-fab="${s}">Random ${EX_SLOT_LABEL[s]}<div class="costs">${this.costHtml(fabricateCost(s, ex.level))}</div></button>`).join('');
    const nKnown = bpKeys.filter(known).length;
    return `<div class="label" style="margin:6px 0">Blueprints ${nKnown}/${bpKeys.length} · more are recovered from war machines, supply crates, derelicts, missions and explorer level-ups</div>
      <div class="bps">${bpKeys.filter((k) => EX_BASES[k].slot === 'gun').map(bpRow).join('')}</div><div class="bps">${bpKeys.filter((k) => EX_BASES[k].slot === 'bay').map(bpRow).join('')}</div>
      <div class="bpinfo"><div class="bptext"><b style="color:var(--white)">${esc(sel.name)}</b> <span class="label">· ${sel.slot === 'bay' ? 'drone bay' : 'gun'} · item level ${ex.level}</span>
        <div class="bpdesc">${d.lines.map(esc).join('<br>')}</div>
        <div class="bpvs" style="color:${vs == null || vs >= 1 ? 'var(--good)' : 'var(--warn)'}">${ok ? vsTxt : 'Blueprint not recovered yet'}</div>
        ${sel.slot === 'bay' && ok && hpWhy(ex, ch, sample, null) ? `<div class="bpvs" style="color:var(--warn)">${esc(hpWhy(ex, ch, sample, null))}: it would wait in the gear bay</div>` : ''}</div>
      <div class="bpbtns"><button class="btn" data-craft="0" ${ok ? '' : 'disabled'}>Craft<div class="costs">${this.costHtml(craftCost(this.bp, ex.level))}</div></button>
        <div class="mwork"><select id="bpAffix" ${ok ? '' : 'disabled'}>${opts}</select><button class="btn violet" data-craft="1" ${ok ? '' : 'disabled'}>Masterwork <span class="label">rare+</span><div class="costs">${this.costHtml(craftCost(this.bp, ex.level, true, this.bpAffix || null))}</div></button></div></div></div>
      <div class="label" style="margin-top:12px">Tools and modules come off the fabricator at random, at item level ${ex.level}</div>
      <div class="fabrow">${fab}</div>`;
  }
  exShopHtml(ex, ch, keys) {
    const items = [...keys.map((k) => ex.loadout[k]).filter(Boolean), ...ex.inventory];
    if (!this.wsel || !items.some((x) => x.uid === this.wsel)) this.wsel = items[0] ? items[0].uid : null;
    const it = items.find((x) => x.uid === this.wsel);
    let h = `<div class="pcols"><div><div class="label" style="margin:6px 0">Fitted and in the bay</div><div class="grid wk">${items.map((x) => `<div class="cell ${x.uid === this.wsel ? 'sel' : ''}" data-wsel="${x.uid}">${this.exItemEl(x)}</div>`).join('')}</div></div><div>`;
    if (it) {
      h += this.exTip(it, ch);
      const cap = exEmpowerCap(ex), ce = exWorkshopCost(it, 'empower'), cr = exWorkshopCost(it, 'reforge');
      h += `<div class="uprow"><div><div class="un">Empower</div><div class="ud">Item level ${it.ilvl} → ${Math.min(cap, it.ilvl + 1)} (cap: explorer level + 3 = ${cap})</div></div><div class="costs">${this.costHtml(ce)}</div><button class="btn" data-ws="empower" ${it.ilvl >= cap ? 'disabled' : ''}>Empower</button></div>`;
      it.affixes.forEach((a, i) => { h += `<div class="uprow"><div><div class="un">Reforge</div><div class="ud">${esc(EX_AFFIXES[a.k].fmt(a.v))}</div></div><div class="costs">${this.costHtml(cr)}</div><button class="btn violet" data-ws="reforge" data-i="${i}">Reforge</button></div>`; });
      h += `<div class="label" style="margin-top:6px">Mastery ${it.lvl} (+${Math.round((it.lvl - 1) * 4)}% to its numbers, +4% a level): fitted guns and bays earn it with every kill</div>`;
    } else h += '<div class="label">Nothing to work on.</div>';
    return h + '</div></div>';
  }
  // hangar hover: the schematic of that mark at the same scale, so the growth reads
  previewMark(cv, c) {
    const draw = (g) => { if (!g) return; cv.style.display = ''; try { drawSchematic(cv, c.id, g, []); } catch (e) { /* model without triangles */ } };
    const g = vehicleReady(c.id);
    if (g) draw(g); else loadVehicle(c.id).then((x) => { if (this.isOpen('explorer')) draw(x); });
  }
  // a fixed-roll sample of a blueprint for its description line (common, no affixes)
  bpSample(base, ilvl) { return { uid: 'bp', ex: true, base, slot: EX_BASES[base].slot, rarity: 'common', ilvl, affixes: [], unique: [], xp: 0, lvl: 1, name: EX_BASES[base].name }; }
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
      html += `<div class="label" style="margin:4px 0 8px">Planet resources refined into permanent upgrades for your warship. Current bonus: ${Object.entries(st).map(([k, v]) => fmtShipStat(k, v)).join(' · ') || 'none yet'}</div>`;
      // the value part of a formatted stat ('+0.08% of hull / s'), after its label
      const val = (stat, v) => fmtShipStat(stat, v).slice((SHIP_STAT_LABELS[stat] || stat).length + 1);
      for (const up of SHIP_UPGRADES) {
        const r = D.refinery.ranks[up.k] || 0, max = r >= up.max;
        const cost = upgradeCost(up, r);
        const now = `${SHIP_STAT_LABELS[up.stat] || up.stat} ${val(up.stat, up.per * r)}`;
        html += `<div class="uprow"><div><div class="un">${up.name} <span class="label">rank ${r}/${up.max}</span></div><div class="ud">${up.desc} <span style="color:var(--good)">${max ? now : `${now} → ${val(up.stat, up.per * (r + 1))}`}</span></div></div>
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
        const cap = empowerCap(D);
        html += act('empower', `Empower <span class="label">${it.ilvl < cap ? `item level ${it.ilvl} → ${it.ilvl + 1}` : `item level ${it.ilvl}`} · limit ${cap}</span>`, empowerCost(it), it.ilvl < cap,
          `<div class="ud">${it.ilvl < cap ? `Up to commander rank + 3 (rank ${D.level || 1}).` : it.ilvl >= EMPOWER_MAX ? 'Fully empowered.' : `At the limit: rank up (commander rank ${D.level || 1} + 3) to empower further.`}</div>`);
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
