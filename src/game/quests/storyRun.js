// The campaign at runtime: one live story step on top of the quest cap, its briefings and choices,
// the set pieces staged for it (a named boss, waves to hold out against, a pursuit), and the Story
// tab of the quest log. The script and its rules are pure data in story.js.
//
//   game.story.state()            save data (data.story)
//   game.story.say(lines, opts)   queue a briefing: [[castKey, text], ...]
//   game.story.choose(k)          answer the open choice
//   game.story.busy()             a briefing or choice is on screen
import * as THREE from 'three/webgpu';
import { CAST, ACTS, ENDINGS, AFTERWORDS, STANDINGS, STEP_BY_ID, STORY_TITLE, resolveStep, buildStoryQuest, choiceOptions, nextStepId, fillText, newStoryState, standingWord, linesFor } from './story.js';
import { questReward, progressText, isDone } from './data.js';
import { ENEMIES } from '../data/enemies.js';
import { officerOf } from '../crew/data.js';
import { save } from '../Player.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString());
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const DESIGN = Object.fromEntries(ENEMIES.map((e) => [e.name, e]));
const _at = new THREE.Vector3(), _p = new THREE.Vector3();
const CHOICE_DELAY = 8;      // seconds before the autopilot answers a choice
const ASSIST_DELAY = 12;     // seconds before the autopilot "attends by intercom" (bridge / crew steps)

export function installStory(game, Q, hooks) {
  const P = () => game.data;
  const S = () => (P().story ||= newStoryState());
  const auto = () => !!game.autoplay;
  const queue = [];            // briefings waiting for the panel
  let cur = null, page = 0, pageT = 0, choiceT = 0, gapT = 3, tickT = 0, afterT = 240;
  let el = null, card = null, cardT = 0;
  const sp = { id: null, next: 0, groups: 0, sys: -1, due: 0, gap: 0, first: true };   // set-piece bookkeeping (not saved)

  // ---------------------------------------------------------------- who is speaking
  function speaker(who) {
    const c = CAST[who] || { name: who, hex: '#b8c6e0', role: '' };
    let name = c.name, role = c.role;
    if (c.post && game.crew && game.crew.state) { const m = officerOf(game.crew.state, c.post); if (m && m.name) { role = c.name; name = m.name; } }
    return { name, role, hex: c.hex };
  }

  // ---------------------------------------------------------------- the briefing panel
  function build() {
    if (el) return;
    if (!document.querySelector('link[data-story]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/story.css'; l.dataset.story = '1'; document.head.append(l); }
    el = document.createElement('div');
    el.id = 'storyBrief'; el.className = 'holo';
    el.innerHTML = '<div class="sb-head"><span class="sb-kind"></span><span class="sb-title"></span><span class="sb-x" title="Skip (it stays in the Story journal)">skip ✕</span></div>'
      + '<div class="sb-body"><div class="sb-port"><i></i><i></i><i></i><i></i><i></i></div><div class="sb-say"><div class="sb-who"><b></b><span></span></div><div class="sb-text"></div></div></div>'
      + '<div class="sb-obj"></div><div class="sb-opts"></div>'
      + '<div class="sb-foot"><span class="sb-page"></span><button class="btn sb-next">Continue ▸</button></div>';
    document.body.append(el);
    el.querySelector('.sb-next').onclick = () => nextPage();
    el.querySelector('.sb-x').onclick = () => skip();
    card = document.createElement('div');
    card.id = 'storyCard';
    card.innerHTML = '<div class="sc-tag"></div><div class="sc-title"></div><div class="sc-sub"></div>';
    document.body.append(card);
  }
  const $ = (s) => el.querySelector(s);
  function show() {
    if (!el) build();
    if (!cur) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.classList.toggle('choice', cur.kind === 'choice');
    $('.sb-kind').textContent = cur.head || 'STORY';
    $('.sb-title').textContent = cur.title || '';
    const opts = $('.sb-opts'); opts.textContent = '';
    const line = cur.kind === 'choice' ? [cur.who, cur.prompt] : cur.lines[page];
    const sk = speaker(line[0]), text = fillText(line[1], P());
    el.style.setProperty('--cc', sk.hex);
    $('.sb-who b').textContent = sk.name; $('.sb-who span').textContent = sk.role ? ' · ' + sk.role : '';
    $('.sb-text').textContent = text;
    const last = cur.kind === 'choice' || page >= cur.lines.length - 1;
    const obj = $('.sb-obj');
    obj.textContent = last && cur.obj ? cur.obj : ''; obj.style.display = last && cur.obj ? '' : 'none';
    $('.sb-page').textContent = cur.kind === 'choice' ? (auto() ? `autopilot decides in ${Math.ceil(Math.max(0, CHOICE_DELAY - choiceT))} s` : 'Your call, Captain') : `${page + 1} / ${cur.lines.length}`;
    $('.sb-next').style.display = cur.kind === 'choice' ? 'none' : '';
    $('.sb-next').textContent = last ? (cur.close || 'Close ✓') : 'Continue ▸';
    $('.sb-x').style.display = cur.kind === 'choice' ? 'none' : '';
    if (cur.kind === 'choice') for (const o of cur.options) {
      const b = document.createElement('button'); b.className = 'btn sb-opt' + (o.k === cur.auto ? '' : ' violet');
      const t = document.createElement('b'); t.textContent = o.label; const h = document.createElement('span'); h.textContent = o.hint;
      b.append(t, h); b.onclick = () => choose(o.k); opts.append(b);
    } else if (game.ui) {
      game.ui.chat('STORY', sk.name, text, 'guild');
      // interface hidden for autoplay: the briefing is not on screen, so its lines crawl along the ticker
      if (game.hudHidden && game.ticker) { game.ticker.say(text, { who: sk.name, hex: sk.hex }); if (last && cur.obj) game.ticker.say(cur.obj, { cls: 'gold' }); }
    }
    pageT = 0;
  }
  // briefings wait for a quiet deck: not on a planet surface or the bridge, and not in the middle of an arena match
  const quiet = () => game.mode === 'space' && !(game.guild && game.guild.arena && game.guild.arena.match);
  function pump() {
    if (cur || !queue.length || !quiet()) return;
    cur = queue.shift(); page = 0; choiceT = 0;
    if (cur.kind === 'choice') {
      // rebuild from the script (the options depend on what has been chosen so far)
      const st = STEP_BY_ID[cur.step], s = S();
      if (!st || !st.choice || s.pending !== cur.step) { cur = null; return pump(); }
      Object.assign(cur, { head: 'DECISION', title: st.title, who: st.choice.who, prompt: st.choice.prompt, auto: st.choice.auto, options: choiceOptions(st, s.choices) });
    } else if (!cur.lines.length) { const end = cur.onEnd; cur = null; if (end) end(); return pump(); }
    show();
  }
  function nextPage() {
    if (!cur || cur.kind === 'choice') return;
    if (page < cur.lines.length - 1) { page++; show(); return; }
    const end = cur.onEnd; cur = null; show(); if (end) end(); pump();
  }
  function skip() {
    // drop every queued briefing (they stay readable in the journal); choices still have to be made
    if (cur && cur.kind !== 'choice') { const end = cur.onEnd; cur = null; if (end) end(); }
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind !== 'choice') { const end = queue[i].onEnd; queue.splice(i, 1); if (end) end(); }
    show(); pump();
  }
  function say(lines, opts = {}) {
    queue.push({ kind: 'lines', lines: linesFor(lines, S().choices), head: opts.head, title: opts.title, obj: opts.obj, close: opts.close, onEnd: opts.onEnd });
    pump();
  }
  function titleCard(tag, title, sub, hex) {
    if (!el) build();
    card.querySelector('.sc-tag').textContent = tag; card.querySelector('.sc-title').textContent = title; card.querySelector('.sc-sub').textContent = sub || '';
    card.style.setProperty('--cc', hex || '#b48cff');
    card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    cardT = 6;
  }

  // ---------------------------------------------------------------- the chain
  function begin(id) {
    const s = S(), st = resolveStep(id, s.choices), q = buildStoryQuest(id, s.choices);
    if (!st || !q) { s.wait = null; return; }
    q.t0 = P().playtime || 0;
    s.cur = id; s.q = q; s.wait = null; s.t0 = P().playtime || 0;
    sp.id = id; sp.next = 0; sp.groups = 0; sp.sys = -1; sp.due = 0; sp.gap = 0; sp.first = true;
    if (s.act !== st.act) { s.act = st.act; const A = ACTS[st.act]; titleCard(`ACT ${ROMAN[st.act]}`, A.title, A.sub); if (game.audio) game.audio.play('levelup', null, 0.5); }
    say(st.brief, { head: st.epilogue ? 'EPILOGUE' : `ACT ${ROMAN[st.act]} · NEW ORDERS`, title: st.title, obj: '◆ ' + st.obj });
    game.ui.toast(`Story: ${st.title}`, 'epic');
    hooks.dirty();
    save(P());
  }
  function complete() {
    const s = S(), q = s.q, id = s.cur, st = resolveStep(id, s.choices);
    if (!q || !st) return;
    s.q = null; s.cur = null; s.done.push(id);
    const extra = hooks.pay(q);
    const r = q.reward;
    game.ui.toast(`Story step complete: ${st.title} (+${fmt(r.credits || 0)} ¢)`, 'legend');
    game.ui.chat('STORY', null, `${st.title} complete: ${fmt(r.credits || 0)} ¢ and ${fmt(r.xp || 0)} XP${extra}.`, 'loot', 'loot');
    if (game.audio) game.audio.play('levelup', null, 0.6);
    say(st.done, { head: `ACT ${ROMAN[st.act]} · COMPLETE`, title: st.title, obj: `Reward: ${fmt(r.credits || 0)} ¢ · ${fmt(r.xp || 0)} XP${extra}` });
    const raw = STEP_BY_ID[id];
    if (raw.choice) { s.pending = id; queue.push({ kind: 'choice', step: id }); pump(); }
    else advance(raw);
    gapT = 4;
    hooks.dirty();
    save(P());
  }
  function advance(raw) {
    const s = S(), nx = nextStepId(raw, s.choices);
    if (nx) { s.wait = nx; return; }
    s.complete = true; s.wait = null;
    const E = ENDINGS[s.ending];
    if (E) { titleCard('THE END', E.name, E.text, '#ffd66a'); game.ui.chat('STORY', null, `${STORY_TITLE}: ${E.name}. ${E.text}`, 'sys'); }
  }
  function choose(k) {
    const s = S(), raw = STEP_BY_ID[s.pending];
    if (!raw || !raw.choice) return false;
    const o = choiceOptions(raw, s.choices).find((x) => x.k === k);
    if (!o) return false;
    s.choices[raw.choice.key] = k; s.pending = null;
    for (const [key, v] of Object.entries(o.standing || {})) s.standing[key] = (s.standing[key] || 0) + v;
    if (o.bonus) { const c = questReward('story', raw.lvl, o.bonus, null, {}).credits; P().credits += c; Q.resync(); game.ui.toast(`+${fmt(c)} ¢`, 'epic'); }
    if (raw.choice.key === 'ending') { s.ending = k; P().title = ENDINGS[k].title; }
    game.ui.chat('STORY', null, `Decision: ${o.label}.`, 'sys');
    if (cur && cur.kind === 'choice') cur = null;
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'choice') queue.splice(i, 1);
    show();
    say(o.say, { head: 'DECISION', title: o.label });
    advance(raw);
    gapT = 4;
    hooks.dirty();
    if (game.ui.isOpen('quests')) game.ui.render('quests');
    save(P());
    return true;
  }

  // ---------------------------------------------------------------- set pieces (space only)
  function tagged(id) { let n = 0; const ships = game.world.ships; for (let i = 0; i < ships.length; i++) if (ships[i].alive && ships[i].storyTag === id) n++; return n; }
  function spawnGroup(names, st, tag, bossName, champion) {
    const s = game.player, W = game.world, lvl = Math.max(st.lvl, Math.min(P().level, st.lvl + 5));
    // a bearing that is not on top of a station's guns
    let best = 0, bd = -1;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2; _p.set(s.position.x + Math.sin(a) * 1000, 0, s.position.z + Math.cos(a) * 1000);
      let d = 1e9; for (const x of game.stations) d = Math.min(d, x.position.distanceTo(_p));
      if (d > bd) { bd = d; best = a; }
    }
    _at.set(s.position.x + Math.sin(best) * 1000, 0, s.position.z + Math.cos(best) * 1000);
    const heading = best + Math.PI;
    names.forEach((nm, i) => {
      const d = DESIGN[nm]; if (!d) return;
      const o = W.spawnDesign(d, lvl, _p.set(_at.x + ((i % 3) - 1) * 150, 0, _at.z + Math.floor(i / 3) * 150 + (i ? 120 : 0)).clone(), heading, { champion: i === 0 && !!champion });
      o.provoked = true;             // Company hulls staged for the story mean it
      if (tag) o.storyTag = tag; else o.storyPursuit = true;
      if (i === 0 && bossName) o.name = bossName;
      if (o.ai && o.ai.home) o.ai.home.copy(s.position);
    });
  }
  function setpiece() {
    const s = S(), q = s.q;
    if (!q || isDone(q) || game.mode !== 'space' || !game.player || !game.player.alive || game.docked || (game.isWarping && game.isWarping())) return;
    const st = resolveStep(s.cur, s.choices), piece = st && st.setpiece;
    if (!piece) return;
    if (sp.id !== s.cur) { sp.id = s.cur; sp.next = 0; sp.groups = 0; sp.sys = -1; sp.due = 0; sp.gap = 0; sp.first = true; }
    const now = game.engine.time, sys = game.sector.sys.id;
    if (st.in && q.travel && q.travel.sys !== sys) return;
    if (piece.type === 'pursuit') {
      if (sp.sys !== sys) { sp.sys = sys; sp.due = sp.groups < (piece.max || 3) ? now + 8 : 0; }
      if (sp.due && now > sp.due) { sp.due = 0; sp.groups++; spawnGroup(piece.designs, st, null); game.ui.toast('Pursuit on the scope — they have your route', 'warn'); }
      return;
    }
    if (tagged(s.cur) > 0) { sp.gap = 0; return; }
    // a set piece never lands on top of another fight: while anything else hostile is close the next wave (or
    // the named ship) holds off (stacked on a zone garrison it sank new captains). Hull damage alone does not
    // hold it: hulls do not mend at sea, and a captain who never docks would wait for ever.
    const me = game.player, W = game.world;
    for (const o of W.ships) if (o.alive && o !== me && !o.storyTag && W.hostile(me, o) && o.position.distanceToSquared(me.position) < 1500 * 1500) { sp.gap = 0; return; }
    if (!sp.gap) { sp.gap = now + (sp.first ? 5 : piece.type === 'boss' ? 25 : 6); return; }
    if (now < sp.gap) return;
    sp.gap = 0; sp.first = false;
    if (piece.type === 'boss') {
      spawnGroup([piece.design, ...(piece.escorts || [])], st, s.cur, piece.name, piece.champion);
      // only the named ship counts
      for (const o of game.world.ships) if (o.storyTag === s.cur && o.name !== piece.name) { o.storyTag = null; o.storyPursuit = true; }
      game.ui.toast(`${piece.name} has entered the system`, 'warn');
    } else {
      const left = q.n - Math.floor(q.progress || 0), n = Math.min(piece.per, left), names = [];
      const off = Math.floor(Math.random() * piece.designs.length);
      for (let i = 0; i < n; i++) names.push(piece.designs[(off + i) % piece.designs.length]);
      spawnGroup(names, st, s.cur);
      game.ui.toast(`Hostiles inbound · ${left} to go`, 'warn');
    }
  }

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    const D = P(); if (!D) return;
    const s = S();
    if (cardT > 0) { cardT -= dt; if (cardT <= 0 && card) card.classList.remove('show'); }
    if (cur) {
      pageT += dt;
      if (cur.kind === 'choice') {
        if (auto()) { choiceT += dt; if (choiceT >= CHOICE_DELAY) { game.autoplay.log(`Story: the autopilot decides — ${cur.options.find((o) => o.k === cur.auto).label}`); choose(cur.auto); } else if (Math.floor(choiceT) !== Math.floor(choiceT - dt)) $('.sb-page').textContent = `autopilot decides in ${Math.ceil(CHOICE_DELAY - choiceT)} s`; }
        else choiceT = 0;
      } else if (auto() && pageT > 3.5 + cur.lines[page][1].length / 45) nextPage();
    }
    tickT -= dt;
    if (tickT > 0) return;
    tickT = 0.5;
    if (s.pending && !cur && !queue.some((x) => x.kind === 'choice')) { queue.push({ kind: 'choice', step: s.pending }); pump(); }
    // a briefing that was open when the captain went down to a planet (or into a match) steps aside and comes back after
    if (cur && !quiet()) { queue.unshift(cur); cur = null; show(); }
    if (!cur && queue.length) pump();   // anything held back while the captain was busy elsewhere
    // the next step starts once the captain has the rank for it and nobody is mid-sentence
    if (s.wait && !s.pending && !s.q) {
      if (gapT > 0) gapT -= 0.5;
      else if (!cur && !queue.length && game.player && (!game.tutorialDone || game.tutorialDone()) && D.level >= STEP_BY_ID[s.wait].lvl) begin(s.wait);
    }
    if (s.q) {
      setpiece();
      // the autopilot does not walk the decks: after a pause it takes the meeting by intercom
      if (auto() && (s.q.ev === 'bridge' || s.q.ev === 'crew') && (D.playtime || 0) - (s.t0 || 0) > ASSIST_DELAY && !cur) {
        game.autoplay.log(s.q.ev === 'bridge' ? 'Story: took the officers\' meeting by intercom' : 'Story: the XO signed on a hand from the dockside list');
        Q.emit(s.q.ev, { n: 1 });
      }
    }
    if (s.complete && s.ending && AFTERWORDS[s.ending]) {
      afterT -= 0.5;
      if (afterT <= 0) { afterT = 540 + Math.random() * 240; const l = AFTERWORDS[s.ending][Math.floor(Math.random() * AFTERWORDS[s.ending].length)]; game.ui.chat('COMM', speaker(l[0]).name, fillText(l[1], D), 'guild'); }
    }
  }

  // ---------------------------------------------------------------- tracker row + Story tab
  function trackerHtml() {
    const s = S();
    if (s.q) return `<div class="qt story"><b>◆ ${progressText(s.q)}</b><span>${esc(s.q.obj)}</span></div>`;
    if (s.pending) return '<div class="qt story"><b>◆</b><span>A decision is waiting</span></div>';
    if (s.wait && P().level < STEP_BY_ID[s.wait].lvl) return `<div class="qt story wait"><b>◆</b><span>Story resumes at rank ${STEP_BY_ID[s.wait].lvl}</span></div>`;
    return '';
  }
  const trackerSig = () => { const s = S(); return s.q ? s.cur + ':' + Math.floor(s.q.progress || 0) : s.pending ? 'p' : s.wait ? 'w' + (P().level >= STEP_BY_ID[s.wait].lvl ? 1 : 0) : ''; };
  const lineHtml = (l) => { const k = speaker(l[0]); return `<div class="sj-line" style="--cc:${k.hex}"><b>${esc(k.name)}</b><span>${esc(fillText(l[1], P()))}</span></div>`; };
  function tabHtml() {
    const s = S(), D = P();
    let h = `<div class="st-head"><div class="st-name">${esc(STORY_TITLE)}</div><div class="label">${s.complete ? 'Complete' : s.act ? `Act ${ROMAN[s.act]} of ${ACTS.length - 1} — ${esc(ACTS[s.act].title)}` : 'Not yet begun'} · ${s.done.length} chapters logged</div></div>`;
    if (s.q) {
      const st = resolveStep(s.cur, s.choices), q = s.q, pct = Math.round(100 * Math.min(1, (q.progress || 0) / q.n)), g = speaker(st.giver);
      h += `<div class="svc quest story"><div class="qmain"><div class="title"><span class="qcat c-story">Story</span>${esc(st.title)}</div>
        <div class="qobj">${esc(q.obj)}</div><div class="bar xp"><i style="width:${pct}%"></i><span>${progressText(q)}</span></div>
        <div class="label qfrom" style="color:${g.hex}">${esc(g.name)}${g.role ? ' · ' + esc(g.role) : ''}</div>
        <div class="sj-lines">${st.brief.map(lineHtml).join('')}</div></div>
        <div class="qside"><span class="val" style="color:#ffd66a">${fmt(q.reward.credits)} ¢</span><span class="label">${fmt(q.reward.xp)} XP${q.reward.item ? ' · ' + q.reward.item + ' item' : ''}</span><button class="btn violet" id="stReplay">Replay briefing</button></div></div>`;
    } else if (s.pending) h += '<div class="svc quest story"><div class="qmain"><div class="title"><span class="qcat c-story">Story</span>A decision is waiting</div></div><div class="qside"><button class="btn" id="stDecide">Decide</button></div></div>';
    else if (s.wait) { const st = STEP_BY_ID[s.wait]; h += `<div class="qempty">${D.level < st.lvl ? `The next chapter, <b>${esc(st.title)}</b>, opens at commander rank ${st.lvl} (you are rank ${D.level}). Take work from the station boards in the meantime.` : game.tutorialDone && !game.tutorialDone() ? 'The story begins once you have found your feet (finish or skip the tutorial).' : 'Stand by. Somebody is about to call.'}</div>`; }
    else if (s.complete && ENDINGS[s.ending]) h += `<div class="st-end"><div class="st-ename">Ending · ${esc(ENDINGS[s.ending].name)}</div><div>${esc(ENDINGS[s.ending].text)}</div><div class="label" style="margin-top:6px">Captain ${esc(D.name)}, ${esc(ENDINGS[s.ending].title)}</div></div>`;
    // standings and the choices behind them
    const made = Object.keys(s.choices);
    h += `<div class="label" style="margin:14px 0 4px">Standing</div><div class="st-stand">${Object.keys(STANDINGS).map((k) => `<div><span>${esc(STANDINGS[k].name)}</span><b class="${(s.standing[k] || 0) > 0 ? 'up' : (s.standing[k] || 0) < 0 ? 'down' : ''}">${esc(standingWord(k, s.standing[k] || 0))}</b></div>`).join('')}</div>`;
    h += `<div class="label" style="margin:14px 0 4px">Decisions (${made.length})</div>`;
    h += made.map((key) => { const st = Object.values(STEP_BY_ID).find((x) => x.choice && x.choice.key === key), o = st && st.choice.options.find((x) => x.k === s.choices[key]); return o ? `<div class="st-choice"><b>${esc(o.label)}</b><span>${esc(st.title)} — ${esc(o.hint)}</span></div>` : ''; }).join('') || '<div class="label" style="padding:2px 10px">None yet. They are coming.</div>';
    // the journal: every finished chapter, newest first, re-readable
    h += `<div class="label" style="margin:14px 0 4px">Journal</div>`;
    h += s.done.slice().reverse().map((id) => {
      const st = resolveStep(id, s.choices), raw = STEP_BY_ID[id];
      if (!st) return '';
      const o = raw.choice && raw.choice.options.find((x) => x.k === s.choices[raw.choice.key]);
      return `<details class="sj"><summary><i>${ROMAN[st.act]}</i><b>${esc(st.title)}</b><span>${esc(st.journal)}</span></summary><div class="sj-lines">${[...st.brief, ...st.done].map(lineHtml).join('')}${o ? `<div class="sj-dec">Decision: ${esc(o.label)}</div>` + linesFor(o.say, s.choices).map(lineHtml).join('') : ''}</div></details>`;
    }).join('') || '<div class="label" style="padding:2px 10px">Nothing logged yet.</div>';
    return h;
  }
  function bindTab(body) {
    const r = body.querySelector('#stReplay'), d = body.querySelector('#stDecide'), s = S();
    if (r) r.onclick = () => { const st = resolveStep(s.cur, s.choices); game.ui.toggle('quests', false); say(st.brief, { head: `ACT ${ROMAN[st.act]} · BRIEFING`, title: st.title, obj: '◆ ' + st.obj }); };
    if (d) d.onclick = () => { game.ui.toggle('quests', false); if (!cur && !queue.some((x) => x.kind === 'choice')) { queue.push({ kind: 'choice', step: s.pending }); pump(); } };
  }

  game.story = { state: S, say, choose, skip, complete, busy: () => !!cur || queue.length > 0, current: () => cur, titleCard, speaker };
  return {
    quest: () => (game.data && game.data.story ? game.data.story.q : null),
    start() { S(); build(); gapT = 3; },
    complete, tick, trackerHtml, trackerSig, tabHtml, bindTab,
  };
}
