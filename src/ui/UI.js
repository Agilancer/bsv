// The interface: HUD panels (DOM), a 2D overlay canvas for in-world markers
// (brackets, health bars, damage numbers, loot labels, weapon arcs), and the windows.
import * as THREE from 'three/webgpu';
import { icon } from './icons.js';
import { ABILITIES } from '../game/data/abilities.js';
import { BASES, RARITY, describe, itemShipStats, weaponStats } from '../game/data/items.js';
import { slotKeys, slotType, xpForLevel, shipXpForLevel, itemScore, INV_SIZE } from '../game/Player.js';
import { CHASSIS_BY_ID, YARDS } from '../game/data/chassis.js';
import { THROTTLE_STEPS } from '../game/ship/Ship.js';
import { TREES, TALENTS, talentPoints, spentPoints, canLearn } from '../game/data/talents.js';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString();
const _p = new THREE.Vector3(), _q = new THREE.Vector3();
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
    R.append(h(`<div id="menubar">
      <button data-w="character">SHIP [C]</button><button data-w="inventory">CARGO [I]</button><button data-w="skills">SKILLS [T]</button>
      <button data-w="crew">CREW [K]</button><button data-w="bridge">BRIDGE [B]</button><button data-w="galaxy">GALAXY [M]</button>
      <button class="auto" data-w="auto">AUTO [P]</button><button data-w="options">⚙</button></div>`));
    R.querySelectorAll('#menubar button').forEach((b) => b.addEventListener('click', () => this.game.command(b.dataset.w)));
    R.append(h(`<div id="target" class="holo"><div class="tname" id="tName"></div><div class="tsub" id="tSub"></div>
      <div class="bar shield" id="tShield"><i></i><span></span></div><div class="bar hull" id="tHull"><i></i><span></span></div></div>`));
    const ab = h(`<div id="abilities" class="holo"></div>`);
    for (const a of ABILITIES) {
      const el = h(`<div class="ab" data-k="${a.k}" title="${a.name}">${icon(a.icon)}<div class="cd"></div><div class="cdt"></div><div class="key">${a.key}</div></div>`);
      el.addEventListener('click', () => this.game.useAbility(a.k));
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
    s += `<div class="tx">Fits: ${SLOT_LABEL[item.slot]} · Value ${fmt(item.value)} ¢</div>`;
    if (compareTo && compareTo !== item) {
      const a = itemScore(item), b = itemScore(compareTo);
      const diff = Math.round(a - b);
      s += `<div class="cmp">vs equipped <span style="color:${RARITY[compareTo.rarity].color}">${esc(compareTo.name)}</span>: <span class="${diff >= 0 ? 'better' : 'worse'}">${diff >= 0 ? '▲ +' : '▼ '}${diff} gear score</span></div>`;
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
    let left = '';
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
      right += `<div class="cell" data-i="${i}">${it ? this.itemEl(it, up) : ''}</div>`;
    }
    right += `</div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn" id="invBest">Equip best</button><button class="btn violet" id="invSalvage">Salvage commons</button><button class="btn bad" id="invSellJunk">Sell below rare</button></div>
      <div class="label" style="margin-top:10px">Click: equip / unequip · Right-click: salvage for credits · Drag to a slot</div>`;
    body.innerHTML = `<div class="cols"><div>${left}</div><div>${right}</div></div>`;
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
      c.addEventListener('click', () => { const it = P.inventory[+c.dataset.i]; if (it) { g.equip(it); this.hideTip(); } });
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
    let dps = 0;
    if (s) for (const w of s.weapons) if (w.hp.type !== 'hangar') dps += w.ws.dmg * w.ws.barrels * w.ws.rof * (s.stats.dmgMul || 1);
    const row = (k, v) => `<span>${k}</span><b>${v}</b>`;
    body.innerHTML = `
      <div class="title" style="color:var(--cyan)">${esc(P.ship.name)}</div>
      <div class="label" style="margin:2px 0 10px">${ch.fullName} · ${y.name}</div>
      <div style="font-size:13px;margin-bottom:10px">${y.blurb}</div>
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
        ${row('Total DPS', fmt(dps))}
        ${row('Crew complement', `${ch.crew[0]}–${ch.crew[1]}`)}
        ${row('Hull length', ch.len * 10 + ' m')}
        ${row('Kills', P.kills)}
        ${row('Credits', fmt(P.credits) + ' ¢')}
      </div>`;
  }

  renderSkills() {
    const g = this.game, P = g.data;
    const body = this.windows.skills.querySelector('.wbody');
    const tab = this.skillTab || 'talents';
    const free = talentPoints(P) - spentPoints(P);
    let html = `<div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn ${tab === 'talents' ? '' : 'violet'}" data-tab="talents">Talents · ${free} free</button><button class="btn ${tab === 'abilities' ? '' : 'violet'}" data-tab="abilities">Abilities</button>
      <span style="flex:1"></span><button class="btn bad" id="respec">Respec (${200 * P.level} ¢)</button></div>`;
    if (tab === 'abilities') {
      html += ABILITIES.map((a) => `<div class="abl"><div class="ab ${P.level < a.unlock ? 'locked' : ''}">${icon(a.icon)}<div class="key">${a.key}</div></div>
        <div><div class="an">${a.name} <span class="label">· rank ${a.unlock} · ${Math.round(g.abilityCd(a))}s</span></div><div class="ad">${a.desc}</div></div></div>`).join('');
    } else {
      html += `<div class="talents">` + TREES.map((tr) => `<div class="tree"><div class="title" style="color:${tr.color};margin-bottom:8px">${tr.name}</div>` +
        TALENTS.filter((t) => t.tree === tr.k).map((t) => {
          const r = (P.talents || {})[t.k] || 0, ok = canLearn(P, t.k), locked = P.level < t.req;
          return `<div class="tal ${locked ? 'locked' : ''} ${ok ? 'can' : ''} ${r ? 'has' : ''}" data-k="${t.k}" style="--tc:${tr.color}">
            <div class="ti">${icon(t.icon)}</div><div class="tt"><div class="tn">${t.name}</div><div class="tr">${locked ? 'Rank ' + t.req : r + ' / ' + t.max}</div></div></div>`;
        }).join('') + `</div>`).join('') + `</div>`;
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { this.skillTab = b.dataset.tab; this.renderSkills(); });
    body.querySelector('#respec').onclick = () => { g.resetTalents(); this.renderSkills(); };
    body.querySelectorAll('.tal').forEach((el) => {
      const t = TALENTS.find((x) => x.k === el.dataset.k);
      el.onclick = () => { if (g.learnTalent(t.k)) this.renderSkills(); };
      el.onmouseenter = (e) => this.showTip(`<div class="tn">${t.name}</div><div class="tb">Requires rank ${t.req} · max ${t.max}</div><div class="tl">${t.desc}</div>`, e);
      el.onmouseleave = () => this.hideTip();
    });
  }

  renderOptions() {
    const g = this.game, a = g.audio, e = g.engine;
    const body = this.windows.options.querySelector('.wbody');
    const sl = (id, label, v) => `<label class="opt"><span>${label}</span><input type="range" id="${id}" min="0" max="100" value="${Math.round(v * 100)}"></label>`;
    body.innerHTML = `${sl('oMaster', 'Master volume', a ? a.volume : 0.7)}${sl('oMusic', 'Music', a ? a.musicVolume : 0.45)}${sl('oBloom', 'Bloom', e.bloomStrength.value / 1.6)}
      <label class="opt"><span>Broadside arcs</span><input type="checkbox" id="oArcs" ${g.showArcs ? 'checked' : ''}></label>
      <label class="opt"><span>Hide interface during autoplay</span><input type="checkbox" id="oHide" ${g.settings().hideHudInAuto ? 'checked' : ''}></label>
      <label class="opt"><span>Autoplay ambition</span><select id="oAuto"><option value="full">Full campaign</option><option value="hold">Hold this system</option><option value="combat">Combat &amp; loot only</option></select></label>
      <label class="opt"><span>Autoplay keeps</span><select id="oKeep"><option value="uncommon">Uncommon+</option><option value="rare">Rare+</option><option value="epic">Epic+</option><option value="legendary">Legendary+</option></select></label>
      <div class="label" style="margin:10px 0">Renderer: ${e.backend} · quality ${e.quality} · ${e.fps.toFixed(0)} fps</div>
      <div style="display:flex;gap:8px"><button class="btn" id="oSave">Save now</button><button class="btn bad" id="oWipe">Delete save &amp; restart</button></div>`;
    const q = (id) => body.querySelector('#' + id);
    q('oMaster').oninput = (ev) => { if (a) { a.volume = ev.target.value / 100; if (a.master) a.master.gain.value = a.volume; } };
    q('oMusic').oninput = (ev) => { if (a) { a.musicVolume = ev.target.value / 100; if (a.music) a.music.gain.value = a.musicVolume; } };
    q('oBloom').oninput = (ev) => { e.bloomStrength.value = ev.target.value / 100 * 1.6; };
    q('oArcs').onchange = (ev) => { g.showArcs = ev.target.checked; };
    q('oHide').onchange = (ev) => { g.settings().hideHudInAuto = ev.target.checked; };
    const AP = (g.data.autoplay ||= {});
    q('oAuto').value = AP.mode || 'full'; q('oKeep').value = AP.keep || 'rare';
    q('oAuto').onchange = (ev) => { AP.mode = ev.target.value; };
    q('oKeep').onchange = (ev) => { AP.keep = ev.target.value; };
    q('oSave').onclick = () => { g.saveNow(); this.toast('Saved'); };
    q('oWipe').onclick = () => { if (confirm('Delete your captain and start over?')) { g.wipeSave(); location.reload(); } };
  }

  // ---------------- per-frame ----------------
  damageNumber(pos, amount, crit, shield) {
    if (this.numbers.length > 120) this.numbers.shift();
    this.numbers.push({ pos: pos.clone(), v: Math.round(amount), crit, shield, t: 0, dx: (Math.random() - 0.5) * 30 });
  }

  update(dt, realDt) {
    const g = this.game, s = g.player, P = g.data;
    if (!P) return;
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
      tn.style.color = t.team === 1 ? 'var(--cyan)' : t.elite === 2 ? '#ff9a2e' : t.elite ? '#ffd66a' : '#ff8a9a';
      $('#tSub').innerHTML = `Lv ${t.level} ${t.chassis.cls} · ${t.factionName || t.faction}` + (t.mods ? '<br>' + t.mods.map((m) => `<span style="color:${this.game.world.eliteMods[m].color}">${this.game.world.eliteMods[m].name}</span>`).join(' · ') : '');
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
    for (const o of world.ships) {
      if (!o.alive || o === s) continue;
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

  drawOverlay(realDt) {
    const ctx = this.ctx, g = this.game, cam = g.cam, world = g.world, s = g.player;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const camera = g.engine.camera;
    const proj = (v) => { _p.copy(v).project(camera); return _p.z < 1 ? { x: (_p.x * 0.5 + 0.5) * innerWidth, y: (-_p.y * 0.5 + 0.5) * innerHeight } : null; };
    const pxPerUnit = innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360) * cam.distance);

    // broadside arc compass around the player: two short wedges, green when the target bears
    if (s && s.alive && g.showArcs) {
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
    // ships: health bars + brackets + names
    ctx.textAlign = 'center';
    for (const o of world.ships) {
      if (!o.alive || o === s) continue;
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
        ctx.fillStyle = !hostile ? '#9fdcff' : o.elite === 2 ? '#ff9a2e' : o.elite ? '#ffd66a' : 'rgba(255,170,180,0.9)';
        const label = (o.guild ? `<${o.guild}> ` : '') + o.name + (hostile ? ` · ${o.level}` : '');
        if (isT || o.elite || !hostile || recent) ctx.fillText(label, sp.x, by - 4);
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
      ctx.fillStyle = n.shield ? `rgba(120,200,255,${a})` : n.crit ? `rgba(255,220,90,${a})` : `rgba(255,255,255,${a})`;
      ctx.strokeStyle = `rgba(0,0,0,${a * 0.8})`; ctx.lineWidth = 3;
      const y = sp.y - 20 - n.t * 46, x = sp.x + n.dx * n.t;
      const txt = (n.crit ? n.v + '!' : n.v);
      ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
    }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
