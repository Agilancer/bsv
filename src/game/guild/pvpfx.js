// The arena's title and its verdict. Before a match: a steel "P" drives in from the left and locks home with a clank
// and a spray of sparks, a "v" drops from the top, the second "P" comes in from the right; the screen goes black, the
// captain is moved into the arena under it (arena.js takeStation, at INTRO_BLACK) and the match fades in. After it:
// WINNER / LOSER / DRAW slams onto the screen and stays until the screen fades out and the captain is home again.
// Everything runs off engine.realTime against the match's own clocks (introT0, stationT, leaveAt), so the picture and
// the simulation cannot drift apart. Matches started with `fast` (the tools) skip all of it. Styles: css/guild.css.

const LETTERS = [
  { ch: 'P', from: [-1, 0], go: 0.12, hit: 0.5, glow: '#58c8ff' },
  { ch: 'v', from: [0, -1], go: 0.78, hit: 1.12, glow: '#9a6bff' },
  { ch: 'P', from: [1, 0], go: 1.4, hit: 1.76, glow: '#ff5a8a' },
];
const MAX_SPARKS = 520;
const STAMP_HIT = 0.2, STAMP_RISE = 1.6;

export function installPvpFx(game, G) {
  let root = null, dim, black, cvs, ctx, row, stamp, letters = [];
  let introFor = null, stampFor = null, wasIn = false, fadeBackT = -1, lastT = 0;
  const hits = new Set();                   // impacts already sounded for the current title / stamp
  const sparks = [];                        // {x, y, vx, vy, life, max, w}
  let shakeT = -9, shakeA = 0, dpr = 1;

  function build() {
    root = document.createElement('div'); root.id = 'pvpFx';
    root.innerHTML = '<div class="fx-dim"></div><div class="fx-row"></div><div class="fx-stamp"></div><canvas></canvas><div class="fx-black"></div>';
    document.body.append(root);
    dim = root.querySelector('.fx-dim'); black = root.querySelector('.fx-black'); row = root.querySelector('.fx-row');
    stamp = root.querySelector('.fx-stamp'); cvs = root.querySelector('canvas'); ctx = cvs.getContext('2d');
    letters = LETTERS.map((L) => { const el = document.createElement('span'); el.className = 'fx-l'; el.textContent = L.ch; el.style.setProperty('--g', L.glow); row.append(el); return { L, el, rest: null }; });
    root.style.display = 'none';
  }
  function show(on) { if (root._on !== on) { root._on = on; root.style.display = on ? '' : 'none'; } }
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; }
  }
  // where each letter sits once locked (measured with no transform on it)
  function measure() {
    for (const l of letters) { l.el.style.transform = 'none'; }
    for (const l of letters) { const r = l.el.getBoundingClientRect(); l.rest = { x: r.left, y: r.top, w: r.width, h: r.height }; }
  }
  const play = (k, v) => { if (game.audio) game.audio.play(k, null, v); };

  // ---- sparks: struck steel throws hot slivers back off the face it hit, falling and cooling as they go
  function spray(x0, y0, x1, y1, dx, dy, n, power = 1) {
    for (let i = 0; i < n && sparks.length < MAX_SPARKS; i++) {
      const u = Math.random(), sp = (260 + Math.random() * 760) * power;
      const back = 0.25 + Math.random() * 0.9, side = (Math.random() - 0.5) * 2.2;
      // perpendicular to the travel direction, spread both ways; a lift so most arc up before they fall
      let vx = -dx * back + -dy * side, vy = -dy * back + dx * side - (0.3 + Math.random() * 0.8);
      const m = Math.hypot(vx, vy) || 1; vx = vx / m * sp; vy = vy / m * sp;
      if (Math.random() < 0.2) { vx *= 0.35; vy = -Math.random() * 120; }        // a few drop straight off the seam
      const max = 0.35 + Math.random() * 0.65;
      sparks.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, vx, vy, life: max, max, w: 1 + Math.random() * 1.8 });
    }
  }
  function drawSparks(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    if (!sparks.length) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
      s.vy += 1500 * dt; s.vx *= 1 - 1.2 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      const k = s.life / s.max;                                   // 1 fresh .. 0 spent: white -> amber -> ember
      const r = 255, g = Math.round(110 + 145 * Math.min(1, k * 1.4)), b = Math.round(40 + 215 * Math.max(0, k - 0.55) / 0.45);
      ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(1, k * 1.6).toFixed(3)})`;
      ctx.lineWidth = s.w * (0.5 + k * 0.6);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.022, s.y - s.vy * 0.022); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function flash(x, y, rad, a) {
    if (a <= 0.01) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,240,210,${a})`); gr.addColorStop(0.35, `rgba(255,170,80,${a * 0.45})`); gr.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    ctx.globalCompositeOperation = 'source-over';
  }
  function shake(now) {
    const k = shakeA * Math.exp(-(now - shakeT) * 11);
    return k < 0.3 ? [0, 0] : [(Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k];
  }

  // ---- the title: P, v, P
  function title(M, now, dt) {
    const t = now - M.introT0, A = G.arena, B = A.INTRO_BLACK;
    if (introFor !== M) { introFor = M; hits.clear(); sparks.length = 0; measure(); row.style.opacity = '1'; }
    dim.style.opacity = String(Math.min(1, t / 0.35) * 0.62);
    const [sx, sy] = shake(now);
    let impact = null;
    for (let i = 0; i < letters.length; i++) {
      const { L, el, rest } = letters[i], [dx, dy] = L.from;
      if (t < L.go) { el.style.opacity = '0'; continue; }
      if (!hits.has('w' + i)) { hits.add('w' + i); play('whoosh', 0.7); }
      // off-screen start: far enough that the whole glyph is outside the view
      const far = dx ? (dx < 0 ? rest.x + rest.w : innerWidth - rest.x) + 40 : rest.y + rest.h + 40;
      let off, heat = 1, sc = 1;
      if (t < L.hit) {
        const u = (t - L.go) / (L.hit - L.go);
        off = far * (1 - u * u * u);                         // accelerating all the way in: no ease at the end, it slams
        sc = 1 + (1 - u) * 0.25;
      } else {
        if (!hits.has(i)) {
          hits.add(i); play('clank', 1); shakeT = now; shakeA = 14;
          // sparks off the leading face (and off the seam under it)
          const x0 = dx > 0 ? rest.x : dx < 0 ? rest.x + rest.w : rest.x + rest.w * 0.3;
          const x1 = dx ? x0 : rest.x + rest.w * 0.7;
          const y0 = dy ? rest.y + rest.h * 0.86 : rest.y + rest.h * 0.18, y1 = dy ? y0 : rest.y + rest.h * 0.86;
          spray(x0, y0, x1, y1, -dx, -dy, 80, 1.1);
          spray(rest.x + rest.w * 0.15, rest.y + rest.h * 0.9, rest.x + rest.w * 0.85, rest.y + rest.h * 0.9, 0, 1, 24, 0.7);
        }
        const a = t - L.hit;
        off = -Math.sin(a * 38) * Math.exp(-a * 13) * 16;      // the recoil off the stop, ringing out
        heat = 1 + 1.8 * Math.exp(-a * 5.5);
        if (a < 0.25) impact = { x: dx > 0 ? rest.x : dx < 0 ? rest.x + rest.w : rest.x + rest.w / 2, y: dy ? rest.y + rest.h * 0.86 : rest.y + rest.h * 0.5, a: 1 - a / 0.25 };
      }
      // the last beat: everything pushes toward the camera as the screen goes black
      const dive = t > B - 0.5 ? (t - (B - 0.5)) / 0.5 : 0;
      sc *= 1 + dive * dive * 0.35;
      el.style.opacity = String(1 - Math.max(0, (t - (B - 0.22)) / 0.22));
      el.style.transform = `translate(${(dx ? -dx * off : 0) + sx}px,${(dy ? -dy * off : 0) + sy}px) scale(${sc.toFixed(3)})`;
      el.style.setProperty('--heat', heat.toFixed(2));
    }
    // a sheen runs across the locked plates
    const sh = t > LETTERS[2].hit + 0.15 ? Math.min(1, (t - LETTERS[2].hit - 0.15) / 0.55) : 0;
    row.style.setProperty('--sheen', `${(-60 + sh * 220).toFixed(1)}%`);
    drawSparks(dt);
    if (impact) flash(impact.x, impact.y, 170, impact.a * 0.9);
    // to black, then in again once the captain has taken station
    black.style.opacity = String(Math.min(1, Math.max(0, (t - (B - 0.45)) / 0.45)));
  }
  function fadeIn(M, now) {
    const A = G.arena, k = (now - (M.stationT || now)) / A.INTRO_IN;
    row.style.opacity = '0'; dim.style.opacity = '0';
    black.style.opacity = String(Math.max(0, 1 - Math.max(0, k - 0.15) / 0.85));
    return k < 1;
  }

  // ---- the verdict
  function verdict(M, now, dt, watching) {
    const word = M.result >= 1 ? 'WINNER' : M.result <= 0 ? 'LOSER' : 'DRAW';
    if (stampFor !== M) {
      stampFor = M; M._stampT0 = now; hits.clear(); sparks.length = 0;
      stamp.textContent = word; stamp.className = `fx-stamp ${word === 'WINNER' ? 'win' : word === 'LOSER' ? 'loss' : 'draw'}`;
      stamp.style.opacity = '0'; stamp.style.display = 'block';
    }
    const t = now - M._stampT0;
    row.style.opacity = '0';
    let sc, op = 1, ty = 0;
    if (t < STAMP_HIT) { const u = t / STAMP_HIT; sc = 2.6 - 1.6 * u * u; op = u; }
    else {
      if (!hits.has('stamp')) {
        hits.add('stamp'); play('clank', 1.1); shakeT = now; shakeA = 18;
        const r = stamp.getBoundingClientRect();
        spray(r.left + r.width * 0.04, r.bottom - r.height * 0.18, r.left + r.width * 0.96, r.bottom - r.height * 0.18, 0, 1, 90, 1.1);
        spray(r.left, r.top + r.height * 0.3, r.left, r.bottom - r.height * 0.2, 1, 0, 22, 0.8);
        spray(r.right, r.top + r.height * 0.3, r.right, r.bottom - r.height * 0.2, -1, 0, 22, 0.8);
      }
      const a = t - STAMP_HIT;
      sc = 1 + Math.sin(a * 30) * Math.exp(-a * 10) * 0.04;
      stamp.style.setProperty('--heat', (1 + 1.6 * Math.exp(-a * 5)).toFixed(2));
      // with the result card up, the word rises clear of it into the space above
      const card = !watching && document.querySelector('#pvpResult.open');
      if (card && t > STAMP_RISE) {
        const u = Math.min(1, (t - STAMP_RISE) / 0.55), e = u * u * (3 - 2 * u);
        const cr = card.getBoundingClientRect(), r = stamp.offsetHeight || 100;
        const tk = game.ticker && game.ticker.el ? game.ticker.el.getBoundingClientRect().bottom : 0;
        const room = cr.top - tk - 12, s2 = Math.min(0.62, room / r);
        const yc = tk + 6 + room / 2;
        ty = (yc - innerHeight / 2) * e;
        sc *= 1 + (Math.max(0.3, s2) - 1) * e;
        if (s2 < 0.3) op = 1 - e;                                 // no room above the card (a short phone screen)
      }
    }
    const [sx, sy] = shake(now);
    stamp.style.opacity = String(op);
    stamp.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${(ty + sy).toFixed(1)}px)) scale(${sc.toFixed(3)})`;
    dim.style.opacity = String(Math.min(1, t / 0.3) * (watching ? 0.35 : 0.25));
    drawSparks(dt);
    if (t >= STAMP_HIT && t < STAMP_HIT + 0.3) { const r = stamp.getBoundingClientRect(); flash(r.left + r.width / 2, r.bottom - r.height * 0.2, r.width * 0.45, (1 - (t - STAMP_HIT) / 0.3) * 0.7); }
    // leaving: the screen fades out over the word; the captain goes home under the black
    const A = G.arena;
    black.style.opacity = M.leaveAt ? String(Math.min(1, 1 - (M.leaveAt - now) / A.LEAVE_FADE)) : '0';
  }

  let fromOp = 0;
  game.engine.add({
    update(dt, tt, realDt) {
      if (!G.arena) return;
      const M = G.arena.match, now = game.engine.realTime, fx = !!(M && !M.fast);
      const fdt = Math.min(0.05, Math.max(0, now - lastT)); lastT = now;
      if (fx) {
        const watching = !!(game.autoplay && game.autoplay.active);
        // in the match proper the overlay only lives while the view comes up out of the black and the sparks die
        if (M.phase !== 'intro' && M.phase !== 'over' && (!wasIn || (now - (M.stationT || 0) > G.arena.INTRO_IN && !sparks.length))) { if (root) show(false); return; }
        if (!root) build();
        wasIn = true; fadeBackT = -1;
        size(); show(true);
        if (M.phase === 'intro') { stamp.style.display = 'none'; title(M, now, fdt); return; }
        if (M.phase === 'over') { verdict(M, now, fdt, watching); return; }
        stamp.style.display = 'none';
        fadeIn(M, now); drawSparks(fdt);
        return;
      }
      if (!wasIn && fadeBackT < 0) return;
      // home again (or the match was called off): the word is gone, and the view comes up out of the black
      if (wasIn) {
        wasIn = false; fadeBackT = now; fromOp = parseFloat(black.style.opacity) || 0;
        stamp.style.display = 'none'; row.style.opacity = '0'; dim.style.opacity = '0'; sparks.length = 0; introFor = stampFor = null;
        size(); drawSparks(0); show(true);
      }
      const k = (now - fadeBackT) / 0.6;
      black.style.opacity = String(Math.max(0, fromOp * (1 - k)));
      if (k >= 1 || fromOp <= 0) { fadeBackT = -1; black.style.opacity = '0'; show(false); }
    },
  });
  addEventListener('resize', () => { if (introFor) measure(); });
}
