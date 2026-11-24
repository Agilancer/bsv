// Quests at runtime: turns real play into tracker events, pays out, and owns the quest UI —
// the station board tab, the Quest log window (J / menu bar) and the compact HUD tracker.
// The generator and the tracker rules are pure and live in data.js; the autoplay goal in auto.js.
//
//   game.quests.active()            the captain's accepted quests (save data: data.contracts)
//   game.quests.offers(station)     what that station's board shows right now
//   game.quests.accept(q) / abandon(id)
//   game.quests.emit(ev, e)         feed a tracker event (see data.js EVENTS)
//   game.quests.autoAccept(station) the autoplay captain's pick of the board
import { MAX_ACTIVE, boardOffers, rotationOf, advance, isDone, chainNext, migrateContract, progressText, CAT_NAMES, ROTATION_SECONDS } from './data.js';
import { questGoal, autoAccept } from './auto.js';
import { galaxy } from '../galaxy.js';
import { RARITY, rollItem } from '../data/items.js';
import { INV_SIZE, save } from '../Player.js';
import { RNG } from '../../engine/rng.js';
import { RESOURCES, RES_KEYS, addResources } from '../planet/economy.js';
import { kindOf } from '../station/services.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString());
const _e = { n: 1, faction: null, elite: 0, size: 0, boss: false, system: 0, station: 0, repeat: false, res: null, ptype: null, rarity: 0 };   // reused event (no per-event garbage)

export function installQuests(game) {
  let dirty = true, trackT = 0, trackSig = '';
  let lastCredits = 0, lastSalvage = 0, started = false, lastDockKey = -1;
  const resSnap = {};
  // planet-run counters we have already turned into events
  const run = { mode: null, kills: 0, bosses: 0, curios: 0, punts: 0, dungeons: 0 };

  const P = () => game.data;
  const active = () => (P().contracts ||= []);
  const log = () => (P().questLog ||= { done: 0, credits: 0, ids: [] });
  const stationIndex = (st) => game.stations.indexOf(st);

  const Q = game.quests = {
    MAX: MAX_ACTIVE,
    active,
    log,
    // the board of a station in the current system (minus what is already taken or finished)
    offers(st = game.docked) {
      const i = st ? stationIndex(st) : -1;
      if (i < 0) return [];
      const have = active(), gone = log().ids;
      return boardOffers(game.sector.sys.id, i, rotationOf(P().playtime)).filter((q) => !gone.includes(q.id) && !have.some((a) => a.id === q.id));
    },
    accept(q, quiet) {
      const A = active();
      if (A.length >= MAX_ACTIVE) { if (!quiet) game.ui.toast(`Quest log full (${MAX_ACTIVE})`, 'warn'); return false; }
      if (A.some((a) => a.id === q.id)) return false;
      A.push({ ...q, progress: 0, t0: P().playtime || 0 });
      dirty = true;
      if (!quiet) {
        game.ui.toast(`Quest accepted: ${q.title}`);
        game.ui.chat('QUEST', q.giver, q.text, 'guild');
        if (game.audio) game.audio.play('loot', null, 0.4);
      }
      return true;
    },
    abandon(id) {
      const A = active(), i = A.findIndex((q) => q.id === id);
      if (i < 0) return false;
      const [q] = A.splice(i, 1);
      dirty = true;
      game.ui.chat('QUEST', null, `Abandoned: ${q.title}. ${q.giver} has been informed and is being brave about it.`, 'sys');
      return true;
    },
    emit(ev, e) {
      if (!started) return;
      const A = active();
      for (let i = A.length - 1; i >= 0; i--) {
        const q = A[i], before = q.progress || 0;
        if (!advance(q, ev, e)) continue;
        dirty = true;
        q.tp = P().playtime || 0;
        if (isDone(q)) { complete(q); continue; }
        // milestones: a line in the log at each quarter, a toast at the half
        const f0 = Math.floor(4 * before / q.n), f1 = Math.floor(4 * q.progress / q.n);
        if (f1 > f0 && q.n >= 4) {
          game.ui.chat('QUEST', null, `${q.title}: ${progressText(q)}`, 'sys');
          if (f0 < 2 && f1 >= 2) game.ui.toast(`${q.title} · ${progressText(q)}`);
        }
      }
    },
    autoAccept: (st) => autoAccept(game, st),
    onDock(st) {
      _e.n = 1; _e.system = game.sector.sys.id; _e.station = stationIndex(st);
      const key = _e.system * 8 + _e.station;
      _e.repeat = key === lastDockKey; lastDockKey = key;
      Q.emit('dock', _e);
    },
    onSell(it) { _e.n = 1; _e.rarity = RARITY[it.rarity] ? RARITY[it.rarity].i : 0; Q.emit('sell', _e); },
    boardHtml, bindBoard,
    // payments we make ourselves must not count as "credits earned" / "resources banked"
    resync() { lastCredits = P().credits; lastSalvage = P().salvage || 0; for (const k of RES_KEYS) resSnap[k] = (P().resources && P().resources[k]) || 0; },
  };

  function complete(q) {
    const D = P(), A = active(), L = log(), r = q.reward || {};
    const i = A.indexOf(q); if (i >= 0) A.splice(i, 1);
    D.credits += r.credits || 0;
    if (r.xp) game.gainXp(r.xp);
    let extra = '';
    if (r.item) {
      const it = rollItem(Math.max(1, q.lvl) + 2, new RNG(Math.random() * 1e9), { rarity: r.item });
      if (D.inventory.length < INV_SIZE) { D.inventory.push(it); extra += ` · ${it.name}`; }
      else { const v = Math.round(it.value * 0.6); D.credits += v; extra += ` · hold full: ${it.name} sold for ${fmt(v)} ¢`; }
    }
    if (r.res) { addResources(D, r.res); extra += ' · ' + Object.entries(r.res).map(([k, v]) => `${v} ${RESOURCES[k] ? RESOURCES[k].short : k}`).join(' '); }
    L.done++; L.credits += r.credits || 0;
    L.ids.push(q.id); if (L.ids.length > 80) L.ids.splice(0, L.ids.length - 80);
    (L.recent ||= []).unshift({ title: q.title, giver: q.giver, credits: r.credits || 0 }); if (L.recent.length > 6) L.recent.length = 6;
    Q.resync();
    game.ui.toast(`Quest complete: ${q.title} (+${fmt(r.credits || 0)} ¢)`, 'epic');
    game.ui.chat('QUEST', null, `${q.title} complete. ${q.giver} wires ${fmt(r.credits || 0)} ¢ and ${fmt(r.xp || 0)} XP${extra}.`, 'loot', 'loot');
    if (game.audio) game.audio.play('levelup', null, 0.5);
    // a chain's next link arrives by comm and takes the slot this one freed
    const next = chainNext(q);
    if (next) {
      A.push({ ...next, progress: 0, t0: D.playtime || 0 });
      game.ui.chat('QUEST', q.giver, `Good. There is more. ${next.text}`, 'guild');
      game.ui.toast(`New orders: ${next.title}`);
    }
    dirty = true;
    if (game.ui.isOpen('quests')) renderLog();
    if (game.docked && game.ui.isOpen('station')) game.ui.render('station');
    save(D);
  }

  // ---------------------------------------------------------------- wiring
  const enter = game.enterSystem.bind(game);
  game.enterSystem = (id) => {
    const from = game.data ? game.data.system : id;
    enter(id);
    if (started && id !== from) { _e.n = 1; _e.system = id; Q.emit('visit', _e); }
  };

  game.start = ((start) => (fresh) => {
    start(fresh);
    const D = P();
    // older saves: three-field contracts become quests in place
    D.contracts = (D.contracts || []).map(migrateContract);
    log();
    Q.resync();
    started = true;
    const ev = game.world.events;
    ev.on('kill', ({ ship, killer }) => {
      if (ship.team === 1 || !(ship.playerTagged || (killer && killer.isPlayer))) return;
      const tier = ship.chassis ? ship.chassis.tier : 1;
      _e.n = 1; _e.faction = ship.faction; _e.elite = ship.elite || 0;
      _e.size = ship.design ? ship.design.sizeIndex : tier <= 2 ? 0 : tier <= 4 ? 1 : tier <= 6 ? 2 : 3;
      _e.boss = ship.elite === 2 || _e.size >= 3;
      _e.system = game.sector.sys.id;
      Q.emit('kill', _e);
    });
    ev.on('collect', (d) => { if (d.type !== 'item' || !d.item) return; _e.n = 1; _e.rarity = RARITY[d.item.rarity] ? RARITY[d.item.rarity].i : 0; Q.emit('collect', _e); });

    const ui = game.ui;
    ui.windows.quests = ui.addWindow('quests', 'Quest log');
    ui.renderers.quests = renderLog;
    // menu bar button (the mobile menu sheet is the same bar)
    const bar = document.getElementById('menubar');
    if (bar && !bar.querySelector('[data-w="quests"]')) {
      const b = document.createElement('button');
      b.dataset.w = 'quests'; b.title = 'QUESTS [J]'; b.innerHTML = 'QUESTS <i class="k">[J]</i>';
      b.addEventListener('click', () => game.command('quests'));
      bar.insertBefore(b, bar.querySelector('[data-w="galaxy"]') || null);
    }
    if (!document.querySelector('link[data-quests]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/quests.css'; l.dataset.quests = '1';
      document.head.append(l);
    }
    document.getElementById('ui').insertAdjacentHTML('beforeend', '<div id="questTrack" class="holo"></div>');
    document.getElementById('questTrack').onclick = () => game.command('quests');
  })(game.start.bind(game));

  addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (!started || !game.ui || game.input.blocked || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyJ') game.command('quests');
  });

  if (Array.isArray(game.autoplayGoals)) game.autoplayGoals.push(questGoal);

  // per frame: turn save-data changes into events (credits, salvage, banked resources, the
  // explorer's run counters). Nothing here allocates.
  game.engine.add({
    update(dt) {
      if (!started || !game.data) return;
      const D = game.data;
      if (D.credits > lastCredits) { _e.n = D.credits - lastCredits; lastCredits = D.credits; Q.emit('earn', _e); } else lastCredits = D.credits;
      const sv = D.salvage || 0;
      if (sv > lastSalvage) { _e.n = sv - lastSalvage; lastSalvage = sv; Q.emit('salvage', _e); } else lastSalvage = sv;
      const R = D.resources;
      if (R) for (let i = 0; i < RES_KEYS.length; i++) {
        const k = RES_KEYS[i], v = R[k] || 0, was = resSnap[k] || 0;
        if (v > was) { _e.n = v - was; _e.res = k; resSnap[k] = v; Q.emit('bank', _e); } else resSnap[k] = v;
      }
      const M = game.mode === 'planet' && game.planet ? game.planet.current : null;
      if (M && M.runStats) {
        if (run.mode !== M) {
          run.mode = M; run.kills = run.bosses = run.curios = run.punts = run.dungeons = 0;
          _e.n = 1; _e.ptype = M.type; Q.emit('land', _e);
        }
        const S = M.runStats, bosses = S.bosses || 0, kills = S.kills || 0;
        if (bosses > run.bosses) { _e.n = bosses - run.bosses; _e.boss = true; Q.emit('gkill', _e); }
        const plain = (kills - run.kills) - (bosses - run.bosses);
        if (plain > 0) { _e.n = plain; _e.boss = false; Q.emit('gkill', _e); }
        run.kills = kills; run.bosses = bosses;
        if ((S.curios || 0) > run.curios) { _e.n = S.curios - run.curios; run.curios = S.curios; Q.emit('scan', _e); }
        if ((S.punts || 0) > run.punts) { _e.n = S.punts - run.punts; run.punts = S.punts; Q.emit('punt', _e); }
        let cleared = 0;
        if (M.dungeons) for (let i = 0; i < M.dungeons.length; i++) if (M.dungeons[i].dungeon && M.dungeons[i].dungeon.cleared) cleared++;
        if (cleared > run.dungeons) { _e.n = cleared - run.dungeons; run.dungeons = cleared; Q.emit('dungeon', _e); }
      } else if (!M) run.mode = null;

      trackT -= dt;
      if (trackT <= 0) { trackT = 0.4; updateTracker(); }
    },
  });

  // ---------------------------------------------------------------- HUD tracker: the three liveliest objectives
  const top3 = [];
  function updateTracker() {
    const el = document.getElementById('questTrack');
    if (!el) return;
    // sits under the first-session objectives while those are showing
    const ob = document.getElementById('objectives');
    const below = ob && ob.offsetParent ? ob.offsetTop + ob.offsetHeight + 8 : 0;
    if (el._below !== below) { el._below = below; el.style.setProperty('--qt-top', below ? below + 'px' : ''); }
    if (!dirty) return;
    dirty = false;
    const A = active();
    top3.length = 0;
    for (const q of A) top3.push(q);
    top3.sort((a, b) => (b.tp == null ? -1 : b.tp) - (a.tp == null ? -1 : a.tp));   // most recent progress first; untouched jobs keep their order
    top3.length = Math.min(3, top3.length);
    let sig = A.length + '|';
    for (const q of top3) sig += q.id + ':' + Math.floor(q.progress || 0) + ';';
    if (sig === trackSig) return;
    trackSig = sig;
    el.style.display = A.length ? '' : 'none';
    el.innerHTML = `<div class="qh"><b>QUESTS</b><span>${A.length}/${MAX_ACTIVE}</span></div>` + top3.map((q) => `<div class="qt"><b>${progressText(q)}</b><span>${esc(q.obj)}</span></div>`).join('');
  }

  // ---------------------------------------------------------------- shared pieces of quest UI
  const rewardText = (r) => `<span class="val" style="color:#ffd66a">${fmt(r.credits || 0)} ¢</span> <span class="label">· ${fmt(r.xp || 0)} XP${r.item ? ` · <span style="color:${RARITY[r.item] ? RARITY[r.item].color : '#fff'}">${r.item} item</span>` : ''}${r.res ? ' · ' + Object.entries(r.res).map(([k, v]) => `${v} ${RESOURCES[k] ? RESOURCES[k].short : k}`).join(' ') : ''}</span>`;
  const catTag = (q) => `<span class="qcat c-${q.cat}">${CAT_NAMES[q.cat] || 'Job'}</span>`;
  function activeRow(q) {
    const pct = Math.round(100 * Math.min(1, (q.progress || 0) / q.n));
    return `<div class="svc quest"><div class="qmain"><div class="title">${catTag(q)}${esc(q.title)}</div>
      <div class="qobj">${esc(q.obj)}</div>
      <div class="bar xp"><i style="width:${pct}%"></i><span>${progressText(q)}</span></div>
      <div class="label qfrom">${esc(q.giver)}${q.from ? ' · ' + esc(q.from.name) + ' · ' + esc(galaxy().systems[q.from.sys].name) : ''}</div>
      <div class="qtext">“${esc(q.text)}”</div></div>
      <div class="qside">${rewardText(q.reward)}<button class="btn bad" data-qdrop="${esc(q.id)}">Abandon</button></div></div>`;
  }
  function bindDrops(body, rerender) {
    body.querySelectorAll('[data-qdrop]').forEach((b) => b.onclick = () => {
      if (b.dataset.sure) { Q.abandon(b.dataset.qdrop); rerender(); } else { b.dataset.sure = '1'; b.textContent = 'Sure?'; }
    });
  }

  // ---------------------------------------------------------------- the station board tab
  function boardHtml(st) {
    const A = active(), K = kindOf(st.kind), offers = Q.offers(st);
    const left = Math.max(0, Math.ceil(ROTATION_SECONDS - ((P().playtime || 0) % ROTATION_SECONDS)));
    let h = `<div class="label" style="margin-bottom:6px">${esc(K.name || 'Station')} board · ${offers.length} posted · new postings in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · pay is wired the moment the work is done</div>`;
    h += offers.map((q) => `<div class="svc quest"><div class="qmain"><div class="title">${catTag(q)}${esc(q.title)}</div>
      <div class="qobj">${esc(q.obj)}</div><div class="label qfrom">${esc(q.giver)}</div><div class="qtext">“${esc(q.text)}”</div></div>
      <div class="qside">${rewardText(q.reward)}<button class="btn" data-qtake="${esc(q.id)}" ${A.length < MAX_ACTIVE ? '' : 'disabled'}>Accept</button></div></div>`).join('') || '<div class="label" style="padding:6px 10px">Board cleared. Come back when they have thought of more problems.</div>';
    h += `<div class="label" style="margin:14px 0 6px">Your quests (${A.length}/${MAX_ACTIVE})</div>`;
    h += A.map(activeRow).join('') || '<div class="label" style="padding:6px 10px">None yet.</div>';
    return h;
  }
  function bindBoard(body, rerender) {
    const st = game.docked;
    body.querySelectorAll('[data-qtake]').forEach((b) => b.onclick = () => {
      const q = st && Q.offers(st).find((x) => x.id === b.dataset.qtake);
      if (q) Q.accept(q);
      rerender();
    });
    bindDrops(body, rerender);
  }

  // ---------------------------------------------------------------- the quest log window
  function renderLog() {
    const W = game.ui.windows.quests; if (!W) return;
    const body = W.querySelector('.wbody'), A = active(), L = log();
    let h = `<div class="label" style="margin-bottom:8px">Active ${A.length}/${MAX_ACTIVE} · completed ${L.done} · ${fmt(L.credits)} ¢ earned from quests</div>`;
    h += A.map(activeRow).join('');
    if (!A.length) {
      const here = game.stations.map((s) => `${esc(s.name)} <span class="label">(${esc(kindOf(s.kind).name || s.kind)})</span>`).join(' · ');
      h += `<div class="qempty">No work on the books. Every station keeps a board: dock${document.body.classList.contains('mobile') ? '' : ' [G]'} and open the Quests tab.<br>In this system: ${here || 'no stations'}.</div>`;
    }
    if (game.docked) h += '<div style="margin-top:12px"><button class="btn violet" id="qBoard">Open the station board</button></div>';
    if (L.recent && L.recent.length) h += `<div class="label" style="margin:14px 0 4px">Recently completed</div>` + L.recent.map((r) => `<div class="qdone"><span>✓ ${esc(r.title)} <i>${esc(r.giver)}</i></span><b>${fmt(r.credits)} ¢</b></div>`).join('');
    body.innerHTML = h;
    bindDrops(body, renderLog);
    const bb = body.querySelector('#qBoard');
    if (bb) bb.onclick = () => { game.ui.toggle('quests', false); if (game.openStationTab) game.openStationTab('quests'); };
  }
}
