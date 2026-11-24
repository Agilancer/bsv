// The title logo is under repair: every so often a welder strikes an arc behind one of the letters.
// A 2D canvas sits BEHIND the logo image, so the arc's glow rims the letter and the sparks spill out
// past its edges, bounce once on the baseline and die. startLogoSparks(logoEl) -> stop().

// letter centres as fractions of the logo image (x, y), measured from assets/logo.png
const TOP_Y = 0.13, BOT_Y = 0.6;
const SITES = [
  ...[0.206, 0.293, 0.382, 0.472, 0.562, 0.654, 0.732, 0.808].map((x) => [x, TOP_Y, 0.55]),      // F L A G S H I P
  ...[0.095, 0.24, 0.335, 0.435, 0.555, 0.675, 0.795, 0.92].map((x) => [x, BOT_Y, 1]),            // V E L S C O U R
];
const MAX = 420;

export function startLogoSparks(logo) {
  const canvas = logo.querySelector('canvas'), img = logo.querySelector('img');
  if (!canvas || !img) return () => {};
  const ctx = canvas.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // sparks: flat arrays, reused
  const px = new Float32Array(MAX), py = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX);
  const life = new Float32Array(MAX), ttl = new Float32Array(MAX), heat = new Float32Array(MAX);
  let head = 0, raf = 0, last = 0, stopped = false;
  let W = 0, H = 0, ox = 0, oy = 0, lw = 1, lh = 1, dpr = 1;
  // the welder: where it is working, for how long, and when it strikes next
  const weld = { x: 0, y: 0, s: 1, t: 0, dur: 0, next: 1.2, taps: 0, flick: 0 };

  const layout = () => {
    const r = logo.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(2, Math.round(c.width * dpr)); H = Math.max(2, Math.round(c.height * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    ox = (r.left - c.left) * dpr; oy = (r.top - c.top) * dpr; lw = r.width * dpr; lh = r.height * dpr;
  };
  const strike = (fresh) => {
    if (fresh) { const s = SITES[Math.floor(Math.random() * SITES.length)]; weld.x = s[0] + (Math.random() - 0.5) * 0.03; weld.y = s[1] + (Math.random() - 0.5) * 0.16 * s[2]; weld.s = s[2]; weld.taps = Math.random() < 0.45 ? 1 + Math.floor(Math.random() * 3) : 0; }
    weld.t = 0; weld.dur = 0.25 + Math.random() * (fresh ? 1.3 : 0.4);
  };
  const emit = (x, y, k) => {
    const i = head; head = (head + 1) % MAX;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = (160 + Math.random() * 520) * k * dpr;
    px[i] = x; py[i] = y; vx[i] = Math.cos(a) * sp; vy[i] = Math.sin(a) * sp * 0.8 - 60 * dpr;
    ttl[i] = life[i] = 0.35 + Math.random() * 0.9; heat[i] = 0.6 + Math.random() * 0.4;
  };

  const frame = (ms) => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (ms - last) / 1000 : 0.016); last = ms;
    if (document.hidden || !img.complete || !img.naturalWidth) return;
    layout();
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    // --- the arc ---
    const wx = ox + weld.x * lw, wy = oy + weld.y * lh;
    if (weld.t < weld.dur) {
      weld.t += dt;
      weld.flick = 0.55 + Math.random() * 0.45;
      const n = calm ? 1 : 2 + Math.floor(Math.random() * 5);
      for (let k = 0; k < n; k++) emit(wx + (Math.random() - 0.5) * 6 * dpr, wy + (Math.random() - 0.5) * 6 * dpr, 0.6 + weld.s * 0.4);
      if (weld.t >= weld.dur) weld.next = weld.taps > 0 ? 0.12 + Math.random() * 0.3 : (calm ? 4 : 1.2) + Math.random() * 3.6;
    } else {
      weld.flick *= Math.exp(-9 * dt);
      weld.next -= dt;
      if (weld.next <= 0) { const again = weld.taps > 0; if (again) weld.taps--; strike(!again); }
    }
    if (weld.flick > 0.02) {
      // white-blue core with a wide orange spill: behind the image it reads as light leaking round the letter
      const R = lh * (0.5 + weld.s * 0.45), f = weld.flick;
      let g = ctx.createRadialGradient(wx, wy, 0, wx, wy, R);
      g.addColorStop(0, `rgba(220,240,255,${0.95 * f})`); g.addColorStop(0.12, `rgba(140,200,255,${0.55 * f})`);
      g.addColorStop(0.4, `rgba(255,150,60,${0.22 * f})`); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.fillRect(wx - R, wy - R, R * 2, R * 2);
    }
    // --- sparks ---
    const floor = oy + lh * 1.04, grav = 900 * dpr;
    ctx.lineCap = 'round';
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const x0 = px[i], y0 = py[i];
      vy[i] += grav * dt; vx[i] *= 1 - 0.6 * dt;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt;
      if (py[i] > floor && vy[i] > 0) { py[i] = floor; vy[i] *= -0.32; vx[i] *= 0.6; life[i] *= 0.7; }
      const f = Math.max(0, life[i] / ttl[i]), h = heat[i];
      // cools from white-yellow through orange to a dull red
      ctx.strokeStyle = `rgba(255,${Math.round(110 + 145 * f * h)},${Math.round(30 + 200 * f * f * h)},${Math.min(1, f * 1.6)})`;
      ctx.lineWidth = (0.8 + 1.6 * f) * dpr;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(px[i], py[i]); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
