// The interface: HUD panels (DOM), a 2D overlay canvas for in-world markers
// (brackets, health bars, damage numbers, loot labels, weapon arcs), and the windows.
import * as THREE from 'three/webgpu';
import { icon } from './icons.js';
import { drawHullPlan } from './hullPlan.js';
import { installWindows } from './winman.js';
import { paintPanel } from './paint.js';
import { ABILITIES } from '../game/data/abilities.js';
import { MINE_TYPES, MINE_BY_KEY, LAY } from '../game/data/mines.js';
import { BASES, RARITY, describe, itemShipStats, weaponStats, SHIELD_HIT } from '../game/data/items.js';
import { slotKeys, slotType, xpForLevel, shipXpForLevel, itemScore, INV_SIZE } from '../game/Player.js';
// HUD panels the camera frames around (hidden ones measure 0 and drop out)
const SAFE_IDS = ['status', 'helm', 'radar', 'weapons', 'target', 'abilities', 'menubar', 'chat', 'objectives', 'hudPeek', 'stick', 'mStop', 'mDown', 'mAuto'];
import { CHASSIS_BY_ID, YARDS, YARD_TRAITS } from '../game/data/chassis.js';
import { sheetDps } from '../game/data/balance.js';
import { THROTTLE_STEPS } from '../game/ship/Ship.js';
import { TREES, TALENTS, talentPoints, spentPoints, canLearn, treePoints } from '../game/data/talents.js';
import { ENEMIES, SIZES, ENEMY_FACTIONS } from '../game/data/enemies.js';
import { ENEMIES as GROUND, SIZE_CLASSES as GSIZES, FAMILIES as GFAM } from '../game/planet/enemies.js';
import { FAUNA, CURIOS, CURIO_KINDS } from '../game/planet/lifeData.js';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString();
const _p = new THREE.Vector3(), _q = new THREE.Vector3();
const _c3 = new THREE.Color(), _c4 = new THREE.Color();
const SLOT_LABEL = { broadside: 'Broadside', turret: 'Turret', prow: 'Prow', hangar: 'Hangar', module: 'Module', blueprint: 'Shipyard' };

export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#ui');
    this.canvas = $('#overlay');
    this.ctx = this.canvas.getContext('2d');
    this.numbers = [];
    this.marker = null;
    this.windows = {};
    this.renderers = {};   // id -> fn, for windows owned by feature modules
    this.buildHUD();
    this.wm = installWindows(this);   // drag windows by their title bars, size them from their edges and corners
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio, 2);
    this.dpr = dpr;
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px';
  }

  buildHUD() {
    const R = this.root;
    R.append(h(`<div id="status" class="holo scan">
      <div class="row" style="margin-top:0"><div class="lvl" id="hLvl">1</div><div style="flex:1"><div class="name" id="hName">—</div><div class="sub" id="hClass">—</div></div><div class="credits" id="hCred">0 ¢</div></div>
      <div class="row"><canvas id="shieldRose" width="184" height="184"></canvas><div class="bars">
        <div class="label">Hull</div><div class="bar hull ghost" id="hHull"><b></b><i></i><span></span></div>
        <div class="label">Shields</div><div class="bar shield" id="hShield"><i></i><span></span></div>
        <div class="label">Commander XP</div><div class="bar xp" id="hXp"><i></i><span></span></div>
      </div></div></div>`));
    // key hints sit in <i class="k"> so narrower screens can drop them (they stay in the tooltip)
    const mb = [['character', 'SHIP', 'C'], ['inventory', 'CARGO', 'I'], ['skills', 'SKILLS', 'T'], ['crew', 'CREW', 'K'], ['bridge', 'BRIDGE', 'B'], ['galaxy', 'GALAXY', 'M'], ['codex', 'CODEX', ''], ['auto', 'AUTO', 'P'], ['options', '⚙', '']];
    R.append(h(`<div id="menubar">${mb.map(([w, n, k]) => `<button data-w="${w}"${w === 'auto' ? ' class="auto"' : ''} title="${n}${k ? ' [' + k + ']' : ''}">${n}${k ? ` <i class="k">[${k}]</i>` : ''}</button>`).join('')}</div>`));
    R.querySelectorAll('#menubar button').forEach((b) => b.addEventListener('click', () => this.game.command(b.dataset.w)));
    R.append(h(`<div id="target" class="holo"><div class="tname" id="tName"></div><div class="tsub" id="tSub"></div>
      <div class="bar shield" id="tShield"><i></i><span></span></div><div class="bar hull" id="tHull"><i></i><span></span></div></div>`));
    const ab = h(`<div id="abilities" class="holo"></div>`);
    for (const a of ABILITIES) {
      const el = h(`<div class="ab" data-k="${a.k}" title="${a.name}">${icon(a.icon)}<div class="cd"></div><div class="cdt"></div><div class="key">${a.key}</div>${a.k === 'mines' ? '<div class="mt"></div>' : ''}</div>`);
      el.addEventListener('click', () => this.game.useAbility(a.k));
      // the Mine Rack: right-click (a long hold on a phone) loads the next kind
      if (a.k === 'mines') el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.game.cycleMine(); });
      el.addEventListener('mouseenter', (e) => this.showTip(`<div class="tn" style="color:var(--cyan)">${a.name}</div><div class="tb">Unlocks at rank ${a.unlock} · ${a.cd}s cooldown</div><div class="tl">${a.desc}</div>`, e));
      el.addEventListener('mouseleave', () => this.hideTip());
      ab.append(el);
    }
    R.append(ab);
    R.append(h(`<div id="weapons" class="holo"><div class="title">Weapon Groups</div><div id="wRows"></div></div>`));
    R.append(h(`<div id="helm" class="holo"><div class="title">Helm</div>
      <div class="thr" id="thr">${THROTTLE_STEPS.map((s) => `<i class="${s < 0 ? 'rev' : ''}"></i>`).join('')}</div>
      <div class="spd"><span class="label">Speed</span><span class="val" id="spd">0</span></div>
      <div class="spd"><span class="label">Altitude</span><span class="val" id="alt">0</span></div>
      <div class="spd"><span class="label">Auto-fire</span><span class="val" id="afire">ON</span></div></div>`));
    R.append(h(`<div id="radar" class="holo"><canvas width="472" height="472"></canvas><div class="sys" id="sysName"></div></div>`));
    R.append(h(`<div id="chat" class="holo"><div class="tabs"><b class="on" data-c="all">ALL</b><b data-c="combat">COMBAT</b><b data-c="loot">LOOT</b></div><div class="log"></div><input id="chatIn" placeholder="Press Enter to chat" maxlength="120"></div>`));
    this.chatLog = $('#chat .log');
    this.chatFilter = 'all';
    R.querySelectorAll('#chat .tabs b').forEach((b) => b.addEventListener('click', () => {
      R.querySelectorAll('#chat .tabs b').forEach((x) => x.classList.toggle('on', x === b));
      this.chatFilter = b.dataset.c;
      this.chatLog.querySelectorAll('div').forEach((d) => { d.style.display = this.chatFilter === 'all' || d.dataset.c === this.chatFilter ? '' : 'none'; });
    }));
    const ci = $('#chatIn');
    ci.addEventListener('focus', () => { this.game.input.blocked = true; });
    ci.addEventListener('blur', () => { this.game.input.blocked = false; });
    ci.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const v = ci.value.trim(); if (v) this.game.playerChat(v); ci.value = ''; ci.blur(); }
      if (e.key === 'Escape') ci.blur();
      e.stopPropagation();
    });
    addEventListener('keydown', (e) => { if (e.key === 'Enter' && document.activeElement !== ci && !this.game.input.blocked) { ci.focus(); e.preventDefault(); } });
    R.append(h(`<div id="toasts"></div>`));
    R.append(h(`<div id="autoStatus"></div>`));
    R.append(h(`<div id="levelup"><div class="small" id="luSmall">COMMANDER RANK</div><div class="big" id="luBig">2</div><div class="small" id="luSub"></div></div>`));
    R.append(h(`<div id="tooltip" class="holo"></div>`));
    R.append(h(`<div id="death"><div class="big">HULL LOST</div><div class="label" style="margin-top:14px">The crew made it to the escape pods. Respawning at the nearest station…</div></div>`));
    // windows
    this.windows.inventory = this.addWindow('inventory', 'Cargo & Loadout');
    this.windows.character = this.addWindow('character', 'Ship');
    this.windows.skills = this.addWindow('skills', 'Captain Abilities');
    this.windows.options = this.addWindow('options', 'Options');
    this.windows.codex = this.addWindow('codex', 'Codex · Known Hostiles');
    this.renderers.codex = () => this.renderCodex();
    this.renderers.options = () => this.renderOptions();
    this.hud = { hull: $('#hHull'), shield: $('#hShield'), xp: $('#hXp'), lvl: $('#hLvl'), name: $('#hName'), cls: $('#hClass'), cred: $('#hCred'), rose: $('#shieldRose').getContext('2d'), thr: [...document.querySelectorAll('#thr i')], spd: $('#spd'), alt: $('#alt'), afire: $('#afire'), target: $('#target'), radar: $('#radar canvas').getContext('2d') };
    this.abEls = Object.fromEntries([...document.querySelectorAll('#abilities .ab')].map((e) => [e.dataset.k, e]));
  }

  // hide the space HUD while another mode (planet, bridge) owns the screen
  setHud(on) {
    for (const id of ['status', 'target', 'abilities', 'weapons', 'helm', 'radar']) { const el = document.getElementById(id); if (el) el.style.visibility = on ? '' : 'hidden'; }
    this.canvas.style.display = on ? '' : 'none';
  }

  addWindow(id, title) {
    const w = h(`<div id="${id}" class="win holo scan"><div class="wtitle"><span>${title}</span><span class="close">✕</span></div><div class="wbody"></div></div>`);
    w.querySelector('.close').addEventListener('click', () => this.toggle(id, false));
    this.root.append(w);
    return w;
  }
  isOpen(id) { return this.windows[id] && this.windows[id].classList.contains('open'); }
  toggle(id, on) {
    const w = this.windows[id]; if (!w) return false;
    const open = on ?? !w.classList.contains('open');
    w.classList.toggle('open', open);
    document.body.classList.toggle('win-open', Object.values(this.windows).some((x) => x.classList.contains('open')));
    document.querySelectorAll(`#menubar button[data-w="${id}"]`).forEach((b) => b.classList.toggle('on', open));
    if (open) this.render(id);
    else this.hideTip();
    return open;
  }
  closeAll() { let any = false; for (const id of Object.keys(this.windows)) if (this.isOpen(id)) { this.toggle(id, false); any = true; } return any; }
  render(id) { if (this.renderers[id]) return this.renderers[id](); if (id === 'inventory') this.renderInventory(); if (id === 'character') this.renderCharacter(); if (id === 'skills') this.renderSkills(); }
  refresh() { for (const id of Object.keys(this.windows)) if (this.isOpen(id)) this.render(id); }

  // ---------------- toasts, chat, level up ----------------
  toast(msg, kind = '') {
    // interface hidden for autoplay: the toast would not be seen, so it crawls along the ticker instead
    const g = this.game;
    if (g && g.hudHidden && g.ticker) { g.ticker.say(msg, { cls: kind || 'dim' }); return; }
    const t = h(`<div class="toast ${kind}"></div>`); t.textContent = msg;
    $('#toasts').append(t);
    setTimeout(() => t.remove(), 3200);
    while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
  }
  chat(channel, who, text, cls = '', c = 'all') {
    const d = document.createElement('div');
    d.dataset.c = c;
    const ch = document.createElement('span'); ch.className = 'ch'; ch.textContent = `[${channel}] `;
    d.append(ch);
    if (who) { const w = document.createElement('span'); w.className = 'who ' + cls; w.textContent = who + ': '; d.append(w); }
    const tx = document.createElement('span'); tx.textContent = text; if (!who) tx.className = cls; d.append(tx);
    if (this.chatFilter !== 'all' && c !== this.chatFilter) d.style.display = 'none';
    this.chatLog.append(d);
    while (this.chatLog.children.length > 60) this.chatLog.firstChild.remove();
  }
  levelUp(big, small, sub = '') {
    // interface hidden for autoplay: the banner would sit over the ship, so the news crawls along the ticker instead
    if (this.game.hudHidden && this.game.ticker) { this.game.ticker.say(`${small} ${big}${sub ? ' · ' + sub : ''}`, { cls: 'gold' }); return; }
    const el = $('#levelup'); $('#luBig').textContent = big; $('#luSmall').textContent = small; $('#luSub').textContent = sub;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  death(show) { $('#death').classList.toggle('show', show); }

  // ---------------- tooltip ----------------
  showTip(html, e) {
    const t = $('#tooltip'); t.innerHTML = html; t.style.display = 'block';
    const r = t.getBoundingClientRect();
    let x = e.clientX + 18, y = e.clientY + 12;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 18;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  hideTip() { $('#tooltip').style.display = 'none'; }
  itemTip(item, compareTo) {
    const d = describe(item);
    let s = `<div class="tn" style="color:${d.rarity.color}">${esc(d.title)}</div><div class="tb">${d.rarity.name} ${d.base} · item level ${item.ilvl} · mastery ${item.lvl}</div>`;
    s += d.lines.map((l) => `<div class="tl">${l}</div>`).join('');
    s += d.affixes.map((a) => `<div class="ta">${a}</div>`).join('');
    s += d.uniques.map((u) => `<div class="tu"><b>${u.name}:</b> ${u.desc}</div>`).join('');
    if (d.flavor) s += `<div class="tx" style="font-style:italic;color:#d8b890">“${d.flavor}”</div>`;
    s += `<div class="tx">Fits: ${SLOT_LABEL[item.slot]} · Value ${fmt(item.value)} ¢</div>`;
    if (compareTo && compareTo !== item) {
      const a = itemScore(item), b = itemScore(compareTo);
      const diff = Math.round(a - b), rel = b > 0 ? Math.round((a / b - 1) * 100) : 0;
      s += `<div class="cmp">vs equipped <span style="color:${RARITY[compareTo.rarity].color}">${esc(compareTo.name)}</span>: <span class="${diff >= 0 ? 'better' : 'worse'}">${diff >= 0 ? '▲ +' : '▼ '}${diff} gear score (${rel >= 0 ? '+' : ''}${rel}%)</span></div>`;
    }
    return s;
  }

  // ---------------- windows ----------------
  itemEl(item, extra = '') {
    const b = BASES[item.base];
    return `<div class="item r-${item.rarity}" data-uid="${item.uid}">${icon(b.icon)}<span class="il">${item.ilvl}</span>${extra}</div>`;
  }

  renderInventory() {
    const g = this.game, P = g.data, ship = g.player;
    const chassis = CHASSIS_BY_ID[P.ship.chassis];
    const body = this.windows.inventory.querySelector('.wbody');
    const keys = slotKeys(chassis);
    const groups = {};
    for (const k of keys) (groups[slotType(k)] ||= []).push(k);
    // the hull itself, mounts where they sit: hover for what's fitted, click to filter the hold
    let left = ship ? `<div class="hplan"><canvas></canvas><div class="label">${chassis.fullName} · ${document.body.classList.contains('mobile') ? 'tap' : 'click'} a mount to see what fits${this.slotFilter ? ` · <a href="#" id="hpClear">show all</a>` : ''}</div></div>` : '';
    for (const [t, ks] of Object.entries(groups)) {
      left += `<div class="label" style="margin:8px 0 4px">${SLOT_LABEL[t]}s</div><div class="slots">`;
      for (const k of ks) {
        const it = P.ship.loadout[k];
        const side = t === 'broadside' ? (k.includes(':p') ? 'Port' : 'Stbd') : '';
        left += `<div class="slot" data-slot="${k}"><span class="st">${side}</span>${it ? this.itemEl(it) : ''}</div>`;
      }
      left += `</div>`;
    }
    let right = `<div class="label" style="margin:8px 0 4px">Hold · ${P.inventory.length}/${INV_SIZE}</div><div class="grid">`;
    for (let i = 0; i < INV_SIZE; i++) {
      const it = P.inventory[i];
      let up = '';
      if (it) { const cur = g.worstEquipped(it.slot); if (!cur || itemScore(it) > itemScore(cur)) up = '<span class="up">▲</span>'; }
      const off = this.slotFilter && it && it.slot !== this.slotFilter;
      right += `<div class="cell${off ? ' off' : ''}" data-i="${i}">${it ? this.itemEl(it, up) : ''}</div>`;
    }
    right += `</div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn" id="invBest">Equip best</button><button class="btn violet" id="invSalvage">Salvage commons</button><button class="btn bad" id="invSellJunk">Sell below rare</button></div>
      <div class="label" style="margin-top:10px">${document.body.classList.contains('mobile') ? 'Tap: equip / unequip · Hold: details, salvage · tap a mount on the plan, then an item, to fit it there' : 'Click: equip / unequip · Right-click: salvage for credits · Drag to a slot, or pick a mount on the plan first'}</div>`;
    body.innerHTML = `<div class="cols"><div>${left}</div><div>${right}</div></div>`;
    const cv = body.querySelector('.hplan canvas');
    if (cv && ship) {
      const hits = drawHullPlan(cv, ship, P.ship.loadout, this.slotFilter);
      const at = (e) => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return hits.find((h) => (h.x - x) ** 2 + (h.y - y) ** 2 < h.r * h.r); };
      cv.addEventListener('mousemove', (e) => {
        const h = at(e); cv.style.cursor = h ? 'pointer' : 'default';
        if (!h) return this.hideTip();
        const it = P.ship.loadout[h.key];
        this.showTip(it ? this.itemTip(it) : `<div class="tn">Empty ${SLOT_LABEL[h.type] || h.type} mount</div><div class="tl">Click to show what fits</div>`, e);
      });
      cv.addEventListener('mouseleave', () => this.hideTip());
      cv.addEventListener('click', (e) => {
        const h = at(e); if (!h) return;
        // the mount tapped is also where the next item of that kind goes (drag-to-slot without a drag)
        this.slotKey = this.slotFilter === h.type && this.slotKey === h.key ? null : h.key;
        this.slotFilter = this.slotKey ? h.type : null;
        const sl = body.querySelector(`.slot[data-slot="${h.key}"]`); if (sl) sl.classList.add('pulse');
        this.renderInventory();
      });
      const clr = body.querySelector('#hpClear'); if (clr) clr.onclick = (e) => { e.preventDefault(); this.slotFilter = this.slotKey = null; this.renderInventory(); };
    }
    const find = (uid) => P.inventory.find((x) => x && x.uid === uid) || Object.values(P.ship.loadout).find((x) => x && x.uid === uid);
    body.querySelectorAll('.item').forEach((el) => {
      const it = find(el.dataset.uid);
      el.addEventListener('mouseenter', (e) => this.showTip(this.itemTip(it, g.worstEquipped(it.slot)), e));
      el.addEventListener('mousemove', (e) => this.showTip(this.itemTip(it, g.worstEquipped(it.slot)), e));
      el.addEventListener('mouseleave', () => this.hideTip());
      el.parentElement.draggable = true;
      el.parentElement.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', it.uid); this.hideTip(); });
    });
    body.querySelectorAll('.cell').forEach((c) => {
      c.addEventListener('click', () => { const it = P.inventory[+c.dataset.i]; if (it) { g.equip(it, this.slotFilter === it.slot ? this.slotKey : undefined); this.hideTip(); } });
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); const it = P.inventory[+c.dataset.i]; if (it) { g.salvage(it); this.hideTip(); } });
    });
    body.querySelectorAll('.slot').forEach((s) => {
      s.addEventListener('click', () => { if (P.ship.loadout[s.dataset.slot]) { g.unequip(s.dataset.slot); this.hideTip(); } });
      s.addEventListener('dragover', (e) => { e.preventDefault(); s.classList.add('drop'); });
      s.addEventListener('dragleave', () => s.classList.remove('drop'));
      s.addEventListener('drop', (e) => { e.preventDefault(); s.classList.remove('drop'); const it = P.inventory.find((x) => x && x.uid === e.dataTransfer.getData('text/plain')); if (it) g.equip(it, s.dataset.slot); });
    });
    $('#invBest').onclick = () => g.equipBest();
    $('#invSalvage').onclick = () => g.salvageWhere((it) => it.rarity === 'common');
    $('#invSellJunk').onclick = () => g.salvageWhere((it) => RARITY[it.rarity].i < 2);
  }

  renderCharacter() {
    const g = this.game, P = g.data, s = g.player;
    const ch = CHASSIS_BY_ID[P.ship.chassis], y = YARDS[ch.yard];
    const body = this.windows.character.querySelector('.wbody');
    const dps = s ? sheetDps(s.weapons, s.stats) : 0;   // one flank, turrets and prow, with crit (the balance contract's measure)
    const row = (k, v) => `<span>${k}</span><b>${v}</b>`;
    body.innerHTML = `
      <div class="title" style="color:var(--cyan)">${esc(P.ship.name)}</div>
      <div class="label" style="margin:2px 0 10px">${ch.fullName} · ${y.name} · Captain ${esc(P.name || 'Captain')}${P.title ? ', ' + esc(P.title) : ''}</div>
      <div id="charNames"></div>
      <div id="charPaint"></div>
      <div style="font-size:13px;margin-bottom:6px">${y.blurb}</div>
      <div style="font-size:13px;margin-bottom:10px;color:var(--cyan)">${YARD_TRAITS[ch.yard] || ''}</div>
      <div class="label">Ship level ${P.ship.level}</div><div class="bar xp" style="margin:4px 0 12px"><i style="width:${(P.ship.xp / shipXpForLevel(P.ship.level) * 100).toFixed(1)}%"></i></div>
      <div class="statgrid">
        ${row('Commander rank', P.level)}
        ${row('Hull integrity', s ? fmt(s.maxHull) : '-')}
        ${row('Shield capacity', s ? fmt(s.maxShield) + ' (4 facings)' : '-')}
        ${row('Shield regen', s ? fmt(s.shieldRegen) + '/s' : '-')}
        ${row('Armour', s ? s.armor.toFixed(0) : '-')}
        ${row('Top speed', s ? s.maxSpeed.toFixed(0) : '-')}
        ${row('Turn rate', s ? (s.turnRate * 57.3).toFixed(1) + '°/s' : '-')}
        ${row('Weapon damage', s ? '+' + (((s.stats.dmgMul || 1) - 1) * 100).toFixed(0) + '%' : '-')}
        ${row('Critical chance', s ? (5 + (s.stats.crit || 0) * 100).toFixed(1) + '%' : '-')}
        ${row('DPS (one flank)', fmt(dps))}
        ${row('Crew complement', `${ch.crew[0]}–${ch.crew[1]}`)}
        ${row('Hull length', ch.len * 10 + ' m')}
        ${row('Kills', P.kills)}
        ${row('Credits', fmt(P.credits) + ' ¢')}
      </div>`;
    if (g.namesPanel) g.namesPanel(body.querySelector('#charNames'));
    paintPanel(g, body.querySelector('#charPaint'));
  }

  renderSkills() {
    const g = this.game, P = g.data;
    const body = this.windows.skills.querySelector('.wbody');
    const tab = this.skillTab || 'talents';
    const free = talentPoints(P) - spentPoints(P);
    let html = `<div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn ${tab === 'talents' ? '' : 'violet'}" data-tab="talents">Talents · ${free} free</button><button class="btn ${tab === 'abilities' ? '' : 'violet'}" data-tab="abilities">Abilities</button><button class="btn ${tab === 'mines' ? '' : 'violet'}" data-tab="mines">Mine Rack</button>
      <span style="flex:1"></span><button class="btn bad" id="respec">Respec (${200 * P.level} ¢)</button></div>`;
    if (tab === 'abilities') {
      html += ABILITIES.map((a) => `<div class="abl"><div class="ab ${P.level < a.unlock ? 'locked' : ''}">${icon(a.icon)}<div class="key">${a.key}</div></div>
        <div><div class="an">${a.name} <span class="label">· rank ${a.unlock} · ${Math.round(g.abilityCd(a))}s</span></div><div class="ad">${a.desc}</div></div></div>`).join('');
    } else if (tab === 'mines') {
      const cur = MINE_BY_KEY[P.mineType] || MINE_BY_KEY.contact;
      const hex = (c) => '#' + c.toString(16).padStart(6, '0');
      const ABSORB = { blast: 'Shields absorb the blast by its damage type', shrapnel: 'A holding facing stops every fragment', ion: 'Feeds on shields: regeneration locked', burn: 'Burns only through a breached facing', snare: 'Passes the bubble: shields cannot stop it' };
      html += `<div class="ad" style="margin-bottom:10px">Ability <b>9</b> (rank ${LAY.unlock}) sows ${LAY.count} mines astern of the loaded kind. <b>0</b> or right-click the button loads the next kind. A mine senses a ship's shield bubble, so the facing toward it takes the blast. Enemy minelayers carry two kinds in their faction's style.</div>`;
      html += MINE_TYPES.map((m) => `<div class="abl mrow ${P.level < m.unlock ? 'locked' : ''} ${m === cur ? 'on' : ''}" data-mine="${m.k}" style="--mc:${hex(m.color)}"><div class="ab ${P.level < m.unlock ? 'locked' : ''}">${icon('mine')}</div>
        <div><div class="an">${m.name} <span class="label">· rank ${m.unlock} · ${m.dmgType}${m === cur ? ' · LOADED' : ''}</span></div><div class="ad">${m.desc}</div><div class="ad mabs">${ABSORB[m.absorb] || ''}</div></div></div>`).join('');
    } else {
      html += `<div class="talents">` + TREES.map((tr) => `<div class="tree"><div class="title" style="color:${tr.color};margin-bottom:8px">${tr.name}</div>` +
        TALENTS.filter((t) => t.tree === tr.k).map((t) => {
          const r = (P.talents || {})[t.k] || 0, ok = canLearn(P, t.k), locked = P.level < t.req || (t.treeReq && treePoints(P, t.tree) < t.treeReq);
          return `<div class="tal ${locked ? 'locked' : ''} ${ok ? 'can' : ''} ${r ? 'has' : ''}" data-k="${t.k}" style="--tc:${tr.color}">
            <div class="ti">${icon(t.icon)}</div><div class="tt"><div class="tn">${t.capstone ? '★ ' : ''}${t.name}</div><div class="tr">${locked ? (t.treeReq ? t.treeReq + ' pts in tree' : 'Rank ' + t.req) : r + ' / ' + t.max}</div></div></div>`;
        }).join('') + `</div>`).join('') + `</div>`;
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { this.skillTab = b.dataset.tab; this.renderSkills(); });
    body.querySelector('#respec').onclick = () => { g.resetTalents(); this.renderSkills(); };
    body.querySelectorAll('[data-mine]').forEach((el) => el.onclick = () => { if (g.loadMine(el.dataset.mine)) this.renderSkills(); });
    body.querySelectorAll('.tal').forEach((el) => {
      const t = TALENTS.find((x) => x.k === el.dataset.k);
      el.onclick = () => { if (g.learnTalent(t.k)) this.renderSkills(); };
      el.onmouseenter = (e) => this.showTip(`<div class="tn">${t.name}</div><div class="tb">Requires rank ${t.req} · max ${t.max}</div><div class="tl">${t.desc}</div>`, e);
      el.onmouseleave = () => this.hideTip();
    });
  }

  renderCodex() {
    const g = this.game, P = g.data, codex = P.codex || {};
    const body = this.windows.codex.querySelector('.wbody');
    this.codexSize ??= 'small'; this.codexFaction ??= 'all'; this.codexWorld ??= 'space';
    const gcount = Object.keys(P.groundCodex || {}).length;
    const top = `<div class="ctabs"><button class="btn ${this.codexWorld === 'space' ? '' : 'violet'}" data-world="space">Space · ${Object.keys(codex).length}/${ENEMIES.length}</button><button class="btn ${this.codexWorld === 'ground' ? '' : 'violet'}" data-world="ground">Ground · ${gcount}/${GROUND.length}</button><button class="btn ${this.codexWorld === 'notes' ? '' : 'violet'}" data-world="notes">Field notes · ${Object.keys(P.faunaCodex || {}).length + Object.keys(P.curios || {}).length}/${Object.keys(FAUNA).length + CURIO_KINDS.length}</button></div>`;
    if (this.codexWorld === 'ground') return this.renderGroundCodex(body, top);
    if (this.codexWorld === 'notes') return this.renderFieldNotes(body, top);
    const known = Object.keys(codex).length;
    let h = top + `<div class="label" style="margin-bottom:8px">${known} / ${ENEMIES.length} designs catalogued · first kill of a design grants bonus XP</div>
      <div class="ctabs">${SIZES.map((s) => `<button class="btn ${s.k === this.codexSize ? '' : 'violet'}" data-size="${s.k}" style="border-color:${s.color}">${s.name} ${ENEMIES.filter((e) => e.size === s.k && codex[e.id]).length}/60</button>`).join('')}</div>
      <div class="ctabs">${['all', ...Object.keys(ENEMY_FACTIONS)].map((f) => `<button class="btn ${f === this.codexFaction ? '' : 'violet'}" data-fac="${f}">${f === 'all' ? 'All' : ENEMY_FACTIONS[f].name}</button>`).join('')}</div><div class="clist">`;
    for (const e of ENEMIES) {
      if (e.size !== this.codexSize || (this.codexFaction !== 'all' && e.faction !== this.codexFaction)) continue;
      const n = codex[e.id] || 0;
      const sz = SIZES[e.sizeIndex];
      h += n ? `<div class="centry"><div class="cn" style="color:${sz.color}">${e.name}</div><div class="label">${e.roleName} · ${ENEMY_FACTIONS[e.faction].name} · ${e.len * 10} m</div><div class="cd">${e.desc}</div><div class="label">Destroyed ${n} · seen from danger ${e.minDanger}</div></div>`
        : `<div class="centry unknown"><div class="cn">???</div><div class="label">${e.roleName} · ${ENEMY_FACTIONS[e.faction].name}</div><div class="cd">Uncatalogued. Appears from danger ${e.minDanger}.</div></div>`;
    }
    body.innerHTML = h + '</div>';
    body.querySelectorAll('[data-size]').forEach((b) => b.onclick = () => { this.codexSize = b.dataset.size; this.renderCodex(); });
    body.querySelectorAll('[data-fac]').forEach((b) => b.onclick = () => { this.codexFaction = b.dataset.fac; this.renderCodex(); });
    body.querySelectorAll('[data-world]').forEach((b) => b.onclick = () => { this.codexWorld = b.dataset.world; this.renderCodex(); });
  }

  // field notes: the harmless wildlife met on the surface and the curiosities scanned there
  renderFieldNotes(body, top) {
    const P = this.game.data, fc = P.faunaCodex || {}, cu = P.curios || {};
    const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
    let h = top + `<div class="label" style="margin-bottom:8px">Native wildlife · catalogued by driving near a herd on its home world</div><div class="clist">`;
    for (const [world, f] of Object.entries(FAUNA)) {
      const r = fc[f.id];
      h += r ? `<div class="centry"><div class="cn" style="color:${hex(f.glow)}">${f.name}</div><div class="label">${world} worlds · non-hostile</div><div class="cd">${f.note}</div><div class="label">Catalogued · non-hostile</div></div>`
        : `<div class="centry unknown"><div class="cn">???</div><div class="label">${world} worlds</div><div class="cd">Unidentified life signs. Drive near a herd to catalogue it.</div></div>`;
    }
    h += `</div><div class="label" style="margin:12px 0 8px">Curiosities · scanned from the explorer (five on every landing site)</div><div class="clist">`;
    for (const k of CURIO_KINDS) {
      const c = CURIOS[k], n = cu[k] || 0;
      h += n ? `<div class="centry"><div class="cn" style="color:${hex(c.hex)}">${c.name}</div><div class="label">Scanned ${n}</div>${c.lore.slice(0, Math.min(c.lore.length, n)).map((l) => `<div class="cd">${l}</div>`).join('')}${n < c.lore.length ? `<div class="label">${c.lore.length - n} more ${c.lore.length - n > 1 ? 'entries' : 'entry'} to uncover</div>` : ''}</div>`
        : `<div class="centry unknown"><div class="cn">???</div><div class="cd">Unexplained. Look for violet beacons on the surface.</div></div>`;
    }
    body.innerHTML = h + '</div>';
    body.querySelectorAll('[data-world]').forEach((b) => b.onclick = () => { this.codexWorld = b.dataset.world; this.renderCodex(); });
  }

  // the planetary bestiary: 12 families x 6 sizes x 5 roles, catalogued by the explorer's kills
  renderGroundCodex(body, top) {
    const P = this.game.data, gc = P.groundCodex || {};
    const sizes = Object.keys(GSIZES);
    this.gSize ??= 'small'; this.gFam ??= 'all';
    let h = top + `<div class="label" style="margin-bottom:8px">Creatures and war machines your explorer has met on the surface</div>
      <div class="ctabs">${sizes.map((k) => `<button class="btn ${k === this.gSize ? '' : 'violet'}" data-gsize="${k}">${GSIZES[k].name} ${GROUND.filter((e) => e.sizeClass === k && gc[e.id]).length}/${GROUND.filter((e) => e.sizeClass === k).length}</button>`).join('')}</div>
      <div class="ctabs">${['all', ...Object.keys(GFAM)].map((f) => `<button class="btn ${f === this.gFam ? '' : 'violet'}" data-gfam="${f}">${f === 'all' ? 'All' : GFAM[f].name}</button>`).join('')}</div><div class="clist">`;
    for (const e of GROUND) {
      if (e.sizeClass !== this.gSize || (this.gFam !== 'all' && e.family !== this.gFam)) continue;
      const n = gc[e.id] || 0;
      h += n ? `<div class="centry"><div class="cn" style="color:#${(e.vis.glow >>> 0).toString(16).padStart(6, '0')}">${e.name}</div><div class="label">${e.familyName} · ${e.archetype}${e.boss ? ' · boss' : ''}</div><div class="cd">${e.role}.</div><div class="label">Killed ${n} · worlds: ${e.planets.join(', ')}</div></div>`
        : `<div class="centry unknown"><div class="cn">???</div><div class="label">${e.familyName}</div><div class="cd">Uncatalogued. Found on ${e.planets.join(', ')} worlds.</div></div>`;
    }
    body.innerHTML = h + '</div>';
    body.querySelectorAll('[data-world]').forEach((b) => b.onclick = () => { this.codexWorld = b.dataset.world; this.renderCodex(); });
    body.querySelectorAll('[data-gsize]').forEach((b) => b.onclick = () => { this.gSize = b.dataset.gsize; this.renderCodex(); });
    body.querySelectorAll('[data-gfam]').forEach((b) => b.onclick = () => { this.gFam = b.dataset.gfam; this.renderCodex(); });
  }

  renderOptions() {
    const g = this.game, a = g.audio, e = g.engine;
    const body = this.windows.options.querySelector('.wbody');
    const sl = (id, label, v) => `<label class="opt"><span>${label}</span><input type="range" id="${id}" min="0" max="100" value="${Math.round(v * 100)}"></label>`;
    body.innerHTML = `${sl('oMaster', 'Master volume', a ? a.volume : 0.7)}${sl('oMusic', 'Music', a ? a.musicVolume : 0.45)}${sl('oUiVol', 'Interface sounds', a ? a.uiVolume : 0.8)}${sl('oBloom', 'Bloom', e.bloomStrength.value / 1.6)}
      <label class="opt"><span>Broadside arcs</span><input type="checkbox" id="oArcs" ${g.showArcs ? 'checked' : ''}></label>
      <label class="opt"><span>Planet scan prompt [V] over landable worlds</span><input type="checkbox" id="oScanP" ${g.settings().hideScanPrompt ? '' : 'checked'}></label>
      <label class="opt"><span>Hide interface during autoplay</span><input type="checkbox" id="oHide" ${g.settings().hideHudInAuto ? 'checked' : ''}></label>
      <label class="opt"><span>Autoplay scraps outgrown hulls (35% of price)</span><input type="checkbox" id="oScrap" ${g.settings().autoScrapHulls ? 'checked' : ''}></label>
      <label class="opt"><span>Autoplay ambition</span><select id="oAuto"><option value="full">Full campaign</option><option value="hold">Hold this system</option><option value="combat">Combat &amp; loot only</option></select></label>
      <label class="opt"><span>Autoplay keeps</span><select id="oKeep"><option value="uncommon">Uncommon+</option><option value="rare">Rare+</option><option value="epic">Epic+</option><option value="legendary">Legendary+</option></select></label>
      <label class="opt"><span>Ticker size <b id="oTkV">${Math.round((g.ticker ? g.ticker.scale : 1) * 100)}%</b></span><input type="range" id="oTicker" min="70" max="200" step="5" value="${Math.round((g.ticker ? g.ticker.scale : 1) * 100)}"></label>
      <div class="opt wm-opt"><span>Windows: drag a title bar to move, an edge or the corner grip to resize; double-click a title bar to put it back</span><button class="btn" id="oLayout">Reset layout</button></div>
      <div class="label" style="margin:10px 0">Renderer: ${e.backend} · quality ${e.quality} · ${e.fps.toFixed(0)} fps${e.res && e.res.on ? ` · resolution ×${e.res.scale.toFixed(2)} (auto)` : ''}</div>
      <div style="display:flex;gap:8px"><button class="btn" id="oSave">Save now</button><button class="btn bad" id="oWipe">Delete save &amp; restart</button></div>`;
    const q = (id) => body.querySelector('#' + id);
    q('oMaster').oninput = (ev) => { if (a) { a.volume = ev.target.value / 100; if (a.master) a.master.gain.value = a.volume; } };
    q('oMusic').oninput = (ev) => { if (a) { a.musicVolume = ev.target.value / 100; if (a.music) a.music.gain.value = a.musicVolume; } };
    q('oUiVol').oninput = (ev) => { if (a) a.setUiVolume(ev.target.value / 100); };
    q('oBloom').oninput = (ev) => { e.bloomStrength.value = ev.target.value / 100 * 1.6; };
    q('oArcs').onchange = (ev) => { g.showArcs = ev.target.checked; };
    q('oScanP').onchange = (ev) => { g.settings().hideScanPrompt = !ev.target.checked; };
    q('oHide').onchange = (ev) => { g.settings().hideHudInAuto = ev.target.checked; };
    q('oScrap').onchange = (ev) => { g.settings().autoScrapHulls = ev.target.checked; };
    const AP = (g.data.autoplay ||= {});
    q('oAuto').value = AP.mode || 'full'; q('oKeep').value = AP.keep || 'rare';
    q('oAuto').onchange = (ev) => { AP.mode = ev.target.value; };
    q('oKeep').onchange = (ev) => { AP.keep = ev.target.value; };
    q('oTicker').oninput = (ev) => {
      if (!g.ticker) return;
      g.ticker.scale = ev.target.value / 100;
      q('oTkV').textContent = Math.round(g.ticker.scale * 100) + '%';
      if (!g.ticker.busy) g.ticker.say('Ticker size · the lines along the top read at this size', { who: 'Comms', cls: 'dim' });   // something to judge it by
    };
    q('oLayout').onclick = () => { this.wm.reset(); this.toast('Window layout reset'); };
    q('oSave').onclick = () => { g.saveNow(); this.toast('Saved'); };
    q('oWipe').onclick = () => { if (confirm('Delete your captain and start over?')) { g.wipeSave(); location.reload(); } };
  }

  // ---------------- per-frame ----------------
  damageNumber(pos, amount, crit, shield, ship = null) {
    // hits on the same ship within a quarter second merge into one number
    if (ship) for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      if (n.ship === ship && n.t < 0.25 && n.shield === shield) { n.v += Math.round(amount); n.crit = n.crit || crit; n.pos.lerp(pos, 0.3); return; }
    }
    if (this.numbers.length > 60) this.numbers.shift();
    this.numbers.push({ pos: pos.clone(), v: Math.round(amount), crit, shield, t: 0, dx: (Math.random() - 0.5) * 30, ship, own: ship && ship === this.game.player });
  }

  // the part of the screen not covered by HUD panels that hug an edge. The camera puts its
  // optical centre in the middle of it (so the fight isn't framed under the helm or the pad).
  safeRect() {
    const W = innerWidth, H = innerHeight, r = this._safe || (this._safe = { x: 0, y: 0, w: W, h: H });
    let l = 0, rt = W, t = 0, b = H;
    for (const id of SAFE_IDS) {
      const el = document.getElementById(id);
      if (!el) continue;
      const c = el.getBoundingClientRect();
      if (c.width < 8 || c.height < 8 || c.right < 0 || c.left > W) continue;
      if (getComputedStyle(el).visibility === 'hidden' || +getComputedStyle(el).opacity < 0.05) continue;
      const dl = c.left, dr = W - c.right, dt = c.top, db = H - c.bottom, m = Math.min(dl, dr, dt, db);
      if (m > 96) continue;                         // floating mid-screen: ignore (docked panels sit within ~90px)
      // shrink along whichever axis costs the least screen
      const opts = [];
      if (dl === m || dl < 96) opts.push(['l', c.right * H]);
      if (dr === m || dr < 96) opts.push(['r', (W - c.left) * H]);
      if (dt === m || dt < 96) opts.push(['t', c.bottom * W]);
      if (db === m || db < 96) opts.push(['b', (H - c.top) * W]);
      opts.sort((a, z) => a[1] - z[1]);
      const k = opts[0][0];
      if (k === 'l') l = Math.max(l, c.right); else if (k === 'r') rt = Math.min(rt, c.left);
      else if (k === 't') t = Math.max(t, c.bottom); else b = Math.min(b, c.top);
    }
    // never let the HUD squeeze the view below 55% of the screen on an axis
    if (rt - l < W * 0.55) { const c = (l + rt) / 2; l = Math.max(0, c - W * 0.275); rt = Math.min(W, l + W * 0.55); }
    if (b - t < H * 0.55) { const c = (t + b) / 2; t = Math.max(0, c - H * 0.275); b = Math.min(H, t + H * 0.55); }
    r.x = l; r.y = t; r.w = rt - l; r.h = b - t;
    return r;
  }

  update(dt, realDt) {
    const g = this.game, s = g.player, P = g.data;
    if (!P) return;
    this.safeT = (this.safeT || 0) - realDt;
    if (this.safeT <= 0 && g.cam) { this.safeT = 0.5; g.cam.safe = g.mode === 'space' ? this.safeRect() : null; }
    // status
    const lvl = P.level;
    this.hud.lvl.textContent = lvl;
    this.hud.name.textContent = P.ship.name;
    const ch = CHASSIS_BY_ID[P.ship.chassis];
    this.hud.cls.textContent = `${ch.cls} · ${YARDS[ch.yard].name} · Ship Lv ${P.ship.level}`;
    this.hud.cred.textContent = fmt(P.credits) + ' ¢';
    if (s) {
      this.setBar(this.hud.hull, s.hull / s.maxHull, `${fmt(Math.max(0, s.hull))} / ${fmt(s.maxHull)}`, true);
      this.setBar(this.hud.shield, s.shieldTotal() / (s.maxShield * 1.2), `${fmt(s.shieldTotal())}`);
      this.drawRose(s);
      THROTTLE_STEPS.forEach((st, i) => this.hud.thr[i].classList.toggle('on', st < 0 ? s.throttle < 0 : s.throttle >= st && st > 0 || (st === 0 && Math.abs(s.throttle) < 0.01)));
      this.hud.spd.textContent = Math.abs(s.speed).toFixed(0) + ' / ' + s.maxSpeed.toFixed(0);
      this.hud.alt.textContent = s.position.y.toFixed(0);
      this.hud.afire.textContent = s.autoFire ? 'ON' : 'OFF';
      this.updateWeaponRows(s);
    }
    const xpN = xpForLevel(lvl);
    this.setBar(this.hud.xp, P.xp / xpN, `${fmt(P.xp)} / ${fmt(xpN)}`);
    // target
    const t = s && s.target && s.target.alive ? s.target : null;
    this.hud.target.style.display = t ? 'block' : 'none';
    if (t) {
      const tn = $('#tName'); tn.textContent = (t.elite === 2 ? '☠ ' : t.elite ? '★ ' : '') + t.name;
      tn.style.color = t.team === 1 ? 'var(--cyan)' : t.elite ? '#ffd66a' : t.design && t.design.sizeIndex >= 2 ? SIZES[t.design.sizeIndex].color : '#ff8a9a';
      $('#tSub').innerHTML = `Lv ${t.level} ${t.design ? SIZES[t.design.sizeIndex].name + ' ' : ''}${t.chassis.cls} · ${t.factionName || t.faction}` + (t.mods ? '<br>' + t.mods.map((m) => `<span style="color:${this.game.world.eliteMods[m].color}">${this.game.world.eliteMods[m].name}</span>`).join(' · ') : '');
      this.setBar($('#tShield'), t.shieldTotal() / (t.maxShield * 1.2), fmt(t.shieldTotal()));
      this.setBar($('#tHull'), t.hull / t.maxHull, `${fmt(Math.max(0, t.hull))} / ${fmt(t.maxHull)}`);
    }
    // abilities
    const now = g.engine.time;
    for (const a of ABILITIES) {
      const el = this.abEls[a.k];
      const locked = lvl < a.unlock;
      el.classList.toggle('locked', locked);
      const rem = Math.max(0, (g.cooldowns[a.k] || 0) - now);
      const cd = g.abilityCd(a);
      el.querySelector('.cd').style.setProperty('--p', (rem > 0 ? (rem / cd) * 100 : 0) + '%');
      el.querySelector('.cdt').textContent = rem > 0 ? rem.toFixed(rem < 3 ? 1 : 0) : '';
      if (rem <= 0 && el._wasCd) el.classList.remove('ready'), void el.offsetWidth, el.classList.add('ready');
      el._wasCd = rem > 0;
      if (a.k === 'mines') {
        const m = MINE_BY_KEY[P.mineType] || MINE_BY_KEY.contact;
        if (el._mt !== m.k) { el._mt = m.k; el.querySelector('.mt').style.setProperty('--mc', '#' + m.color.toString(16).padStart(6, '0')); el.title = `${a.name}: ${m.name} (right-click: next kind)`; }
      }
    }
    const as = document.getElementById('autoStatus');
    const ap = g.autoplay;
    if (ap) {
      const what = !ap.active ? `manual override ${Math.ceil(ap.yieldT)}s` : ap.goal ? ap.goal.name : ap.state === 'combat' && s && s.target ? `engaging ${s.target.name}` : ap.state;
      const txt = `AUTOPLAY · ${what}`;
      if (as.textContent !== txt) as.textContent = txt;
      as.style.display = 'block';
    } else as.style.display = 'none';
    this.drawRadar(s);
    this.drawOverlay(realDt);
  }

  setBar(el, f, text, ghost) {
    f = Math.max(0, Math.min(1, f));
    const w = (f * 100).toFixed(1) + '%';
    const i = el.querySelector('i'); if (i.style.width !== w) i.style.width = w;
    if (ghost) { const b = el.querySelector('b'); if (b && b.style.width !== w) b.style.width = w; }
    const sp = el.querySelector('span'); if (sp && sp.textContent !== text) sp.textContent = text;
  }

  updateWeaponRows(s) {
    const groups = { port: [], starboard: [], prow: [], turrets: [], hangar: [] };
    for (const w of s.weapons) {
      const g = w.hp.type === 'broadside' ? w.hp.side : w.hp.type === 'turret' ? 'turrets' : w.hp.type;
      groups[g].push(w);
    }
    const tg = s.target && s.target.alive ? s.target : null;
    let html = '';
    for (const [k, ws] of Object.entries(groups)) {
      if (!ws.length) continue;
      html += `<div class="wrow"><span class="label">${k}</span><div class="pips">${ws.map((w) => {
        const f = w.hp.type === 'hangar' ? (w.wing ? w.wing.length / Math.max(1, w.ws.count) : 0) : 1 - Math.max(0, w.cd) * w.ws.rof;
        const arc = tg && w.hp.type !== 'hangar' && s.inArc(w, tg);
        return `<div class="pip ${arc ? 'arc' : ''}"><i style="transform:scaleX(${Math.max(0, Math.min(1, f)).toFixed(2)})"></i></div>`;
      }).join('')}</div></div>`;
    }
    const el = $('#wRows'); if (el._h !== html) { el.innerHTML = html; el._h = html; }
  }

  drawRose(s) {
    const c = this.hud.rose, W = 184, cx = 92, cy = 92;
    c.clearRect(0, 0, W, W);
    // facing arcs: fore (up), aft, port (left), starboard (right)
    const arcs = [[-Math.PI * 0.75, -Math.PI * 0.25], [Math.PI * 0.25, Math.PI * 0.75], [Math.PI * 0.75, Math.PI * 1.25], [-Math.PI * 0.25, Math.PI * 0.25]];
    const cap = s.maxShield * 0.3;
    for (let i = 0; i < 4; i++) {
      const f = s.shields[i] / cap;
      c.lineWidth = 9; c.strokeStyle = 'rgba(40,70,120,0.5)';
      c.beginPath(); c.arc(cx, cy, 74, arcs[i][0] + 0.08, arcs[i][1] - 0.08); c.stroke();
      if (f > 0.01) {
        c.strokeStyle = f > 0.5 ? '#58b8ff' : f > 0.2 ? '#ffb040' : '#ff4a6a';
        c.shadowColor = c.strokeStyle; c.shadowBlur = 10;
        const mid = (arcs[i][0] + arcs[i][1]) / 2, half = (arcs[i][1] - arcs[i][0] - 0.16) / 2 * f;
        c.beginPath(); c.arc(cx, cy, 74, mid - half, mid + half); c.stroke();
        c.shadowBlur = 0;
      }
    }
    // ship silhouette
    const hf = s.hull / s.maxHull;
    c.fillStyle = hf > 0.5 ? '#c8d4f0' : hf > 0.25 ? '#ffb060' : '#ff4a6a';
    c.beginPath(); c.moveTo(cx, cy - 46); c.lineTo(cx + 13, cy - 18); c.lineTo(cx + 13, cy + 34); c.lineTo(cx + 7, cy + 44); c.lineTo(cx - 7, cy + 44); c.lineTo(cx - 13, cy + 34); c.lineTo(cx - 13, cy - 18); c.closePath(); c.fill();
    c.fillStyle = '#0a1530'; c.fillRect(cx - 6, cy + 4, 12, 22);
  }

  drawRadar(s) {
    const c = this.hud.radar, W = 472, cx = W / 2, cy = W / 2, R = W / 2 - 10;
    const g = this.game, world = g.world;
    c.clearRect(0, 0, W, W);
    const range = 1800;
    const k = R / range;
    const yaw = g.cam.yaw;
    const center = s ? s.position : g.cam.focus;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const map = (p) => {
      const dx = p.x - center.x, dz = p.z - center.z;
      // rotate so camera-forward is up on the radar
      const rx = -(dx * cosY - dz * sinY), rz = -(dx * sinY + dz * cosY);
      return [cx + rx * k, cy + rz * k];
    };
    c.strokeStyle = 'rgba(88,184,255,0.18)'; c.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(cx, cy, R * i / 3, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
    // sweep
    const sw = (g.engine.realTime * 1.6) % (Math.PI * 2);
    const grd = c.createConicGradient(sw, cx, cy); grd.addColorStop(0, 'rgba(88,200,255,0.25)'); grd.addColorStop(0.12, 'rgba(88,200,255,0)'); grd.addColorStop(1, 'rgba(88,200,255,0)');
    c.fillStyle = grd; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    for (const b of world.bodies) {
      if (!b.userData.radius) continue;
      const [x, y] = map(b.position); const r = Math.max(3, b.userData.radius * k);
      c.fillStyle = b.userData.kind === 'sun' ? 'rgba(255,200,100,0.5)' : b.userData.kind === 'station' ? 'rgba(120,255,200,0.8)' : 'rgba(150,170,220,0.35)';
      c.beginPath(); c.arc(x, y, b.userData.kind === 'station' ? 6 : r, 0, Math.PI * 2); c.fill();
    }
    for (const d of world.loot.drops) {
      if (d.type !== 'item') continue;
      const [x, y] = map(d.pos); c.fillStyle = RARITY[d.item.rarity].color; c.fillRect(x - 2, y - 2, 4, 4);
    }
    if (g.raidMarker) {
      let [x, y] = map(g.raidMarker);
      const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy);
      if (dd > R - 12) { x = cx + dx / dd * (R - 12); y = cy + dy / dd * (R - 12); }
      c.strokeStyle = '#ff9a2e'; c.lineWidth = 3; c.shadowColor = '#ff9a2e'; c.shadowBlur = 12;
      const pr = 10 + Math.sin(g.engine.realTime * 5) * 3;
      c.beginPath(); c.arc(x, y, pr, 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0;
      c.fillStyle = '#ff9a2e'; c.font = '700 18px Orbitron, sans-serif'; c.textAlign = 'center'; c.fillText('☠', x, y + 6);
    }
    if (world.mines) for (const m of world.mines.list) {
      if (m.child || (m.def.stealth && m.team !== 1)) continue;
      const [x, y] = map(m.pos);
      c.fillStyle = m.team === 1 ? 'rgba(88,200,255,0.75)' : 'rgba(255,110,90,0.8)';
      c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x + 3, y); c.lineTo(x, y + 3); c.lineTo(x - 3, y); c.closePath(); c.fill();
    }
    for (const o of world.ships) {
      if (!o.alive || o === s || o.cloaked) continue;
      const [x, y] = map(o.position);
      c.fillStyle = o.team === 1 ? '#58c8ff' : o.elite === 2 ? '#ff9a2e' : o.elite ? '#ffd66a' : '#ff4a6a';
      const r = 2.5 + Math.min(5, o.dims.L / 40);
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      if (s && o === s.target) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 5, 0, Math.PI * 2); c.stroke(); }
    }
    c.restore();
    if (s) {
      c.save(); c.translate(cx, cy); c.rotate(-(s.heading - yaw) + Math.PI);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -10); c.lineTo(6, 8); c.lineTo(-6, 8); c.closePath(); c.fill(); c.restore();
    }
  }

  // the four shield facings as arcs on the plane round the captain's ship, just outside the nav ring:
  // a dim track per facing, filled from its centre by its charge, flashing in the colour of what it
  // just absorbed (energy cyan, kinetic white-gold, explosive amber, ion violet) and red when it collapses
  drawShieldArcs(ctx, s, proj, ppu) {
    const now = this.game.engine.time, cap = Math.max(1, s.maxShield * 0.3);
    const rw = Math.max(26 / ppu, s.dims.L * 0.62);
    const CEN = [0, Math.PI, Math.PI / 2, -Math.PI / 2];   // fore, aft, port, starboard (from the heading)
    const HALF = 0.66, N = 14;
    const arc = (a0, a1, rr) => {
      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        const a = a0 + (a1 - a0) * (k / N);
        const pt = proj(_q.set(s.position.x + Math.sin(a) * rr, s.position.y, s.position.z + Math.cos(a) * rr));
        if (!pt) return false;
        k ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y);
      }
      return true;
    };
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const f = Math.max(0, Math.min(1, s.shields[i] / cap));
      const mid = s.heading + CEN[i];
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,70,120,0.35)';
      if (arc(mid - HALF, mid + HALF, rw)) ctx.stroke();
      const hit = Math.max(0, 1 - (now - s.shieldHitT[i]) / 0.6), brk = Math.max(0, 1 - (now - s.shieldBreakT[i]) / 1.2);
      if (f > 0.005) {
        const low = f < 0.25 ? 0.5 + 0.5 * Math.sin(this.game.engine.realTime * 10) : 1;
        _c3.set(f < 0.25 ? 0xff7a9a : 0x58b8ff);
        if (hit > 0) _c3.lerp(_c4.set(SHIELD_HIT[s.shieldHitType[i]] || 0x58b8ff), hit);
        ctx.strokeStyle = `rgba(${_c3.r * 255 | 0},${_c3.g * 255 | 0},${_c3.b * 255 | 0},${(0.55 + 0.4 * hit) * low})`;
        ctx.lineWidth = 3 + hit * 2.5;
        if (hit > 0.2) { ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10 * hit; }
        if (arc(mid - HALF * f, mid + HALF * f, rw)) ctx.stroke();
        ctx.shadowBlur = 0;
      }
      if (brk > 0) {
        ctx.strokeStyle = `rgba(255,90,122,${brk * 0.8})`; ctx.lineWidth = 2;
        if (arc(mid - HALF, mid + HALF, rw * (1 + (1 - brk) * 0.25))) ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }

  drawOverlay(realDt) {
    const ctx = this.ctx, g = this.game, cam = g.cam, world = g.world, s = g.player;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const camera = g.engine.camera;
    const proj = (v) => { _p.copy(v).project(camera); return _p.z < 1 ? { x: (_p.x * 0.5 + 0.5) * innerWidth, y: (-_p.y * 0.5 + 0.5) * innerHeight } : null; };
    const pxPerUnit = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360) * cam.distance);

    // broadside arc compass around the player: two short wedges, green when the target bears
    if (s && s.alive && g.showArcs && !g.hudHidden) {
      const tg = s.target && s.target.alive ? s.target : null;
      const c0 = proj(s.position);
      if (c0) for (const side of [1, -1]) {
        const ws = s.weapons.filter((w) => w.hp.type === 'broadside' && Math.sign(w.hp.dir.x) === side);
        if (!ws.length) continue;
        const bears = tg && ws.some((w) => s.inArc(w, tg));
        const r = Math.min(Math.max(...ws.map((w) => w.ws.range)), 150 / pxPerUnit);
        const r0 = s.dims.W * 2.4;
        const base = s.heading + side * Math.PI / 2;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const a = base - 0.95 + (i / 12) * 1.9;
          const pt = proj(_q.set(s.position.x + Math.sin(a) * r, s.position.y, s.position.z + Math.cos(a) * r));
          if (pt) i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y);
        }
        for (let i = 12; i >= 0; i--) {
          const a = base - 0.95 + (i / 12) * 1.9;
          const pt = proj(_q.set(s.position.x + Math.sin(a) * r0, s.position.y, s.position.z + Math.cos(a) * r0));
          if (pt) ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        const grd = ctx.createRadialGradient(c0.x, c0.y, 0, c0.x, c0.y, r * pxPerUnit);
        const col = bears ? '74,222,128' : '88,184,255';
        grd.addColorStop(0, `rgba(${col},0)`); grd.addColorStop(0.5, `rgba(${col},${bears ? 0.16 : 0.07})`); grd.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = grd; ctx.fill();
      }
    }
    // your ship: a faint ring underneath so it never gets lost in the fireworks
    if (s && s.alive) {
      const c = proj(s.position);
      if (c) {
        const r = Math.max(18, s.dims.L * 0.55 * pxPerUnit);
        ctx.strokeStyle = 'rgba(88,200,255,0.45)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(88,200,255,0.8)';
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + g.engine.realTime * 0.6; ctx.fillRect(c.x + Math.cos(a) * r - 2, c.y + Math.sin(a) * r * 0.55 - 2, 4, 4); }
        this.drawShieldArcs(ctx, s, proj, pxPerUnit);
      }
      // hostiles shooting at us from off-screen: arrows on the edge
      for (const o of world.ships) {
        if (!o.alive || o.target !== s || o.cloaked) continue;
        _p.copy(o.position).project(camera);
        let x = (_p.x * 0.5 + 0.5) * innerWidth, y = (-_p.y * 0.5 + 0.5) * innerHeight;
        if (_p.z > 1) { x = innerWidth - x; y = innerHeight - y; }
        if (x > 30 && x < innerWidth - 30 && y > 30 && y < innerHeight - 30 && _p.z < 1) continue;
        const cx = innerWidth / 2, cy = innerHeight / 2, a = Math.atan2(y - cy, x - cx);
        const ex = cx + Math.cos(a) * (innerWidth / 2 - 28), ey = cy + Math.sin(a) * (innerHeight / 2 - 28);
        ctx.save(); ctx.translate(Math.max(24, Math.min(innerWidth - 24, ex)), Math.max(24, Math.min(innerHeight - 24, ey))); ctx.rotate(a);
        ctx.fillStyle = o.design && o.design.sizeIndex >= 3 ? 'rgba(255,154,46,0.9)' : 'rgba(255,90,110,0.85)';
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -8); ctx.lineTo(-4, 0); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
    // telegraphed attacks
    const now = g.engine.time;
    for (const w of world.warnings) {
      const k = Math.min(1, (now - w.t0) / w.dur);
      const pulse = 0.35 + 0.35 * Math.sin(g.engine.realTime * 18);
      ctx.strokeStyle = w.color; ctx.fillStyle = w.color; ctx.lineWidth = 2;
      if (w.kind === 'circle') {
        const c = w.follow ? w.follow.position : w.pos;
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; const pt = proj(_q.set(c.x + Math.sin(a) * w.r, c.y, c.z + Math.cos(a) * w.r)); if (pt) i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y); }
        ctx.globalAlpha = 0.9; ctx.stroke();
        ctx.globalAlpha = 0.12 + k * 0.25 * pulse; ctx.fill();
        ctx.globalAlpha = 0.5; ctx.beginPath();
        for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; const pt = proj(_q.set(c.x + Math.sin(a) * w.r * k, c.y, c.z + Math.cos(a) * w.r * k)); if (pt) i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y); }
        ctx.stroke(); ctx.globalAlpha = 1;
      } else if (w.kind === 'line') {
        const side = _p.set(-w.dir.z, 0, w.dir.x);
        const pts = [[0, -1], [w.len, -1], [w.len, 1], [0, 1]].map(([a, b]) => proj(_q.copy(w.pos).addScaledVector(w.dir, a).addScaledVector(side, b * w.width)));
        if (pts.every(Boolean)) {
          ctx.beginPath(); pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.closePath();
          ctx.globalAlpha = 0.12 + k * 0.3 * pulse; ctx.fill(); ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
    }
    // ships: health bars + brackets + names
    ctx.textAlign = 'center';
    for (const o of world.ships) {
      if (!o.alive || o === s || o.cloaked) continue;
      const sp = proj(o.position); if (!sp) continue;
      if (sp.x < -100 || sp.x > innerWidth + 100 || sp.y < -100 || sp.y > innerHeight + 100) continue;
      const rad = Math.max(16, o.dims.L * 0.55 * pxPerUnit);
      const isT = s && o === s.target;
      const hostile = o.team !== 1;
      const recent = g.engine.time - o.lastHit < 6;
      if (isT) {
        ctx.strokeStyle = hostile ? '#ff5a7a' : '#58c8ff'; ctx.lineWidth = 2; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
        const r = rad * 0.85 + Math.sin(g.engine.realTime * 6) * 2, L = r * 0.35;
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          ctx.beginPath(); ctx.moveTo(sp.x + dx * r, sp.y + dy * (r - L)); ctx.lineTo(sp.x + dx * r, sp.y + dy * r); ctx.lineTo(sp.x + dx * (r - L), sp.y + dy * r); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
      if (isT || recent || o.elite || !hostile) {
        const bw = Math.min(90, Math.max(40, rad * 1.2)), by = sp.y - rad * 0.8 - 12;
        ctx.fillStyle = 'rgba(5,10,24,0.75)'; ctx.fillRect(sp.x - bw / 2 - 1, by - 1, bw + 2, 8);
        ctx.fillStyle = '#58b8ff'; ctx.fillRect(sp.x - bw / 2, by, bw * Math.min(1, o.shieldTotal() / (o.maxShield * 1.2)), 2.5);
        ctx.fillStyle = hostile ? '#ff7a50' : '#7affb0'; ctx.fillRect(sp.x - bw / 2, by + 3.5, bw * Math.max(0, o.hull / o.maxHull), 2.5);
        ctx.font = '600 11px Rajdhani, sans-serif';
        ctx.fillStyle = !hostile ? '#9fdcff' : o.elite ? '#ffd66a' : o.design && o.design.sizeIndex >= 2 ? SIZES[o.design.sizeIndex].color : 'rgba(255,170,180,0.9)';
        const label = (o.guild ? `<${o.guild}> ` : '') + o.name + (hostile ? ` · ${o.level}` : '');
        if (isT || o.elite || !hostile || recent || (o.design && o.design.sizeIndex >= 3)) ctx.fillText(label, sp.x, by - 4);
        if (o.mods && (isT || recent)) { ctx.font = '600 10px Rajdhani, sans-serif'; ctx.fillStyle = 'rgba(255,214,106,0.85)'; ctx.fillText(o.mods.map((m) => world.eliteMods[m].name).join(' · '), sp.x, by - 16); }
      }
    }
    // loot labels
    ctx.font = '600 12px Rajdhani, sans-serif';
    for (const d of world.loot.drops) {
      if (d.type !== 'item') continue;
      const sp = proj(d.pos); if (!sp) continue;
      const r = RARITY[d.item.rarity];
      if (r.i < 1 && cam.distance > 900) continue;
      ctx.fillStyle = 'rgba(4,8,20,0.7)';
      const w = ctx.measureText(d.item.name).width + 10;
      ctx.fillRect(sp.x - w / 2, sp.y - 30, w, 15);
      ctx.fillStyle = r.color; ctx.fillText(d.item.name, sp.x, sp.y - 19);
    }
    // move marker
    if (this.marker && this.marker.t > 0) {
      this.marker.t -= realDt;
      const sp = proj(this.marker.p);
      if (sp) { const r = 10 + (1 - this.marker.t) * 14; ctx.strokeStyle = `rgba(88,200,255,${this.marker.t})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    // damage numbers
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += realDt;
      if (n.t > 1.1) { this.numbers.splice(i, 1); continue; }
      const sp = proj(n.pos); if (!sp) continue;
      const a = n.t < 0.8 ? 1 : 1 - (n.t - 0.8) / 0.3;
      const scale = n.crit ? 1.6 - Math.min(0.5, n.t * 2) : 1;
      ctx.font = `${n.crit ? 800 : 700} ${Math.round(15 * scale)}px Orbitron, Rajdhani, sans-serif`;
      ctx.fillStyle = n.own ? `rgba(255,110,110,${a})` : n.shield ? `rgba(120,200,255,${a})` : n.crit ? `rgba(255,220,90,${a})` : `rgba(255,255,255,${a})`;
      ctx.strokeStyle = `rgba(0,0,0,${a * 0.8})`; ctx.lineWidth = 3;
      const y = sp.y - 20 - n.t * 46, x = sp.x + n.dx * n.t;
      const txt = (n.crit ? n.v + '!' : n.v);
      ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
    }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
