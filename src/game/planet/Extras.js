// The expedition's voice: radio chatter from the ship in orbit, kill-streak callouts, discovery
// cards and the end-of-run report. DOM only — owned by the planet HUD root so it hides with it.
import { radioLine, streakFor, streakBonus, STREAK_WINDOW, expeditionRating, CURIOS_PER_SITE } from './lifeData.js';
import { RESOURCES } from './economy.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const RADIO_GAP = 14;      // seconds between unforced lines: chatter, not a podcast

export class PlanetExtras {
  constructor(mode) {
    this.mode = mode;
    const root = mode.hud.root;
    this.comm = h(`<div id="pComm" class="holo"><div class="cwave"><i></i><i></i><i></i><i></i><i></i></div><div class="cbody"><div class="cwho"></div><div class="ctext"></div></div></div>`);
    this.streakEl = h(`<div id="pStreak"><div class="sbig"></div><div class="ssub"></div></div>`);
    this.cardEl = h(`<div id="pCard" class="holo"><div class="ktag"></div><div class="ktitle"></div><div class="ktext"></div></div>`);
    root.append(this.comm, this.streakEl, this.cardEl);
    this.nextRadio = 0; this.commT = 0; this.typed = 0; this.line = null; this.said = new Set();
    this.chain = 0; this.chainT = 0; this.best = 0; this.streakT = 0; this.cardT = 0;
    this.idleT = 0; this.lowHull = false; this.fullSaid = false; this.kills = 0;
  }

  // say something from orbit. once-per-run events pass once=true; force skips the cooldown.
  radio(event, force = false, once = false) {
    const M = this.mode, now = M.engine.time;
    if (once) { if (this.said.has(event)) return false; }
    if (!force && now < this.nextRadio) return false;
    const line = radioLine(event);
    if (!line) return false;
    if (once) this.said.add(event);
    this.nextRadio = now + RADIO_GAP;
    this.line = line; this.typed = 0; this.commT = 3.2 + line.text.length * 0.05;
    this.comm.querySelector('.cwho').textContent = line.name;
    this.comm.querySelector('.cwho').style.color = line.hex;
    this.comm.style.setProperty('--cc', line.hex);
    this.comm.querySelector('.ctext').textContent = '';
    this.comm.classList.add('show');
    M.game.ui.chat('COMM', line.name, line.text, 'sys');
    M.sfx('ui', null, 0.5);
    return true;
  }

  card(title, text, color, tag = 'Discovery') {
    const c = this.cardEl;
    c.querySelector('.ktag').textContent = tag;
    c.querySelector('.ktitle').textContent = title; c.querySelector('.ktitle').style.color = color;
    c.querySelector('.ktext').textContent = text;
    c.style.setProperty('--cc', color);
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    this.cardT = 7;
  }

  // a kill landed: extend the chain, call out the tiers. Returns the bonus XP share for this kill.
  onKill(e) {
    const M = this.mode;
    this.kills++;
    this.chain = this.chainT > 0 ? this.chain + 1 : 1;
    this.chainT = STREAK_WINDOW;
    if (this.chain > this.best) { this.best = this.chain; M.runStats.bestStreak = this.best; }
    const s = streakFor(this.chain);
    if (s) {
      const el = this.streakEl;
      el.querySelector('.sbig').textContent = s.title;
      el.querySelector('.ssub').textContent = s.sub || `${s.n} in a row · +${Math.round(streakBonus(s.n) * 100)}% XP`;
      el.dataset.tier = Math.min(4, s.tier);
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      this.streakT = 2.2;
      M.cam.addShake(0.6 + s.tier * 0.4);
      if (s.tier >= 2) M.sfx('levelup', null, 0.5);
      if (s.tier === 3) this.radio('streak');
    }
    if (this.kills === 1) this.radio('firstKill', false, true);
    return streakBonus(this.chain);
  }

  update(dt, realDt) {
    const M = this.mode, V = M.vehicle;
    if (this.chainT > 0) { this.chainT -= dt; if (this.chainT <= 0) this.chain = 0; }
    if (this.streakT > 0) { this.streakT -= realDt; if (this.streakT <= 0) this.streakEl.classList.remove('show'); }
    if (this.cardT > 0) { this.cardT -= realDt; if (this.cardT <= 0) this.cardEl.classList.remove('show'); }
    if (this.commT > 0) {
      this.commT -= realDt;
      const L = this.line;
      if (L && this.typed < L.text.length) { this.typed = Math.min(L.text.length, this.typed + realDt * 55); this.comm.querySelector('.ctext').textContent = L.text.slice(0, Math.floor(this.typed)); }
      this.comm.classList.toggle('talking', !!L && this.typed < L.text.length);
      if (this.commT <= 0) this.comm.classList.remove('show');
    }
    if (M.state !== 'play' || !V.alive) return;
    // situational lines
    const hf = V.hp / V.stats.maxHp;
    if (hf < 0.33 && !this.lowHull) { this.lowHull = true; this.radio('lowHull', true); }
    else if (hf > 0.7) this.lowHull = false;
    const moving = Math.hypot(V.velocity.x, V.velocity.z) > 1 || M.mining;
    this.idleT = moving || M.dungeon ? 0 : this.idleT + dt;
    if (this.idleT > 40) { this.idleT = -80; this.radio('idle'); }
  }

  // ---- the end-of-run card (called before the HUD goes away; lives on #ui and removes itself)
  static report(game, mode) {
    const R = mode.runStats, ex = mode.ex;
    const r = { ...R, deaths: R.deaths || 0, curioTotal: mode.curios ? mode.curios.total : CURIOS_PER_SITE };
    const [title, quip] = expeditionRating(r);
    const got = Object.entries(R.gathered).filter(([, v]) => v > 0).map(([k, v]) => `<span style="color:${RESOURCES[k].color}">${v} ${RESOURCES[k].short}</span>`).join(' · ') || '<span class="label">nothing, technically</span>';
    const row = (k, v) => `<div class="rrow"><span>${k}</span><b>${v}</b></div>`;
    const el = h(`<div id="pReport"><div class="rcard holo scan">
      <div class="label">Expedition report · ${mode.survey.name}</div>
      <div class="rtitle">${title}</div><div class="rquip">${quip}</div>
      <div class="rgrid">
        ${row('Hostiles destroyed', R.kills)}${row('Best kill streak', R.bestStreak || 0)}
        ${row('Resources banked', R.banked)}${row('Items recovered', R.items)}
        ${row('Curiosities scanned', `${R.curios || 0}/${r.curioTotal}`)}${row('Apex kills', R.bosses)}
        ${row('Dungeons entered', R.dungeons)}${row('Wildlife launched', R.punts || 0)}
        ${row('Explorer XP', R.xp)}${row('Explorers lost', r.deaths)}
      </div>
      <div class="rgot">${got}</div>
      <button class="btn">Carry on</button></div></div>`);
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 350); };
    el.querySelector('button').onclick = close;
    el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
    document.querySelectorAll('#pReport').forEach((x) => x.remove());
    document.getElementById('ui').append(el);
    setTimeout(close, game.autoplay ? 7000 : 16000);
    return el;
  }
}
