// Procedural audio: every sound is synthesised with WebAudio (no files), attenuated by
// distance from the camera's focus, with a per-kind voice limit so a 40-gun broadside
// doesn't clip. Plus generative music: an ambient pad that a combat layer swells over.
const LIMITS = {
  cannon: 10, heavy: 4, beam: 6, missile: 6, torpedo: 4, explosion: 8, hit: 10, shield: 8, ui: 3,
  phaser: 5, tosPhaser: 4, lance: 4, spinal: 2, pulsePhaser: 8, disruptor: 4, arc: 4, graviton: 3,
  photon: 5, quantal: 5, plasmic: 3, heavyTorp: 2, rail: 4, plasmaShot: 6, ionShot: 5,
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.musicVolume = 0.45;
    this.listener = { x: 0, y: 0, z: 0 };
    this.voices = {};
    this.intensity = 0;      // 0 calm .. 1 full battle
    // Browsers only start audio from a user gesture, and on touch screens a pointerdown is not one
    // (the finger lifting is): keep trying on every kind of activation until the context runs.
    const EV = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    const unlock = () => {
      this.init();
      const c = this.ctx;
      if (c && c.state === 'suspended' && !document.hidden && !this.paused) c.resume().catch(() => {});
      if (!c || c.state === 'running') for (const e of EV) removeEventListener(e, unlock, true);
    };
    for (const e of EV) addEventListener(e, unlock, true);
  }

  // ctx: an OfflineAudioContext renders the sound effects alone, without music (tools/sfx.html)
  init(ctx = null) {
    if (this.ctx) return;
    try { this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    // a short convolution-free "space" reverb: feedback delay
    const d = c.createDelay(1); d.delayTime.value = 0.23;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.verb = c.createGain(); this.verb.gain.value = 0.35;
    this.verb.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.master);
    this.noise = this.makeNoise();
    this.pink = this.makePink();
    if (!ctx) this.startMusic();
  }

  // tab hidden / app in the background: stop the sound card, pick up where we left off
  setPaused(on) {
    this.paused = !!on;
    const c = this.ctx; if (!c) return;
    if (on && c.state === 'running') c.suspend().catch(() => {});
    else if (!on && c.state === 'suspended') c.resume().catch(() => {});
  }

  makeNoise() {
    const c = this.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // pink noise (-3 dB/octave, Paul Kellet's filter): the "fuzz" layered over a phaser's hum
  makePink() {
    const c = this.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    return b;
  }

  setListener(p) { this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z; }

  // gain for a world position (0 when far)
  att(pos) {
    if (!pos) return 1;
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    return Math.max(0, 1 - d / 1800) ** 1.6;
  }

  // a, b: optional per-sound parameters (weapons: pitch scale, then duration for beams)
  play(kind, pos, mul = 1, a, b) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const g = this.att(pos) * mul;
    if (g < 0.02) return;
    const lim = LIMITS[kind] || 6;
    const now = this.ctx.currentTime;
    const v = (this.voices[kind] ||= []);
    while (v.length && v[0] < now) v.shift();
    if (v.length >= lim) return;
    const f = this[kind]; if (!f) return;
    const dur = f.call(this, now, g, a, b);
    v.push(now + (dur || 0.3));
  }

  // --- building blocks ---
  osc(type, f0, f1, t, dur, gain, dest = this.sfx) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return g;
  }
  burst(t, dur, gain, freq, q = 0.7, type = 'lowpass', sweepTo = null, dest = this.sfx) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    fl.type = type; fl.frequency.setValueAtTime(freq, t); if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return g;
  }

  // --- sounds ---
  cannon(t, g) { this.osc('sine', 120 + Math.random() * 30, 38, t, 0.35, 0.5 * g); this.burst(t, 0.25, 0.45 * g, 2200, 0.6, 'lowpass', 300); const r = this.burst(t, 0.5, 0.12 * g, 900); r.connect(this.verb); return 0.12; }
  heavy(t, g) { this.osc('sine', 80, 24, t, 0.9, 0.8 * g); this.burst(t, 0.7, 0.6 * g, 1600, 0.5, 'lowpass', 120).connect(this.verb); this.osc('sawtooth', 220, 60, t, 0.25, 0.1 * g); return 0.5; }
  beam(t, g) { this.osc('sawtooth', 880, 420, t, 0.45, 0.12 * g); this.osc('sine', 1760, 900, t, 0.4, 0.08 * g); this.burst(t, 0.4, 0.1 * g, 4000, 2, 'bandpass', 1500).connect(this.verb); return 0.2; }
  missile(t, g) { this.burst(t, 0.6, 0.25 * g, 600, 1, 'bandpass', 2500); this.osc('triangle', 300, 900, t, 0.5, 0.06 * g); return 0.15; }
  torpedo(t, g) { this.burst(t, 1.2, 0.35 * g, 300, 1.5, 'bandpass', 1400); this.osc('sine', 60, 140, t, 1.1, 0.2 * g); return 0.4; }
  explosion(t, g, pitch = 1) {
    const P = pitch || 1;
    this.osc('sine', 70 * P, 18, t, 1.4, 0.9 * g); this.burst(t, 1.6, 0.8 * g, 1400 * P, 0.4, 'lowpass', 80).connect(this.verb); this.burst(t + 0.05, 0.5, 0.3 * g, 5000, 0.3, 'highpass', 2000);
    // energy warheads crackle as they go (pitch above 1)
    if (P > 1.05) for (let i = 0; i < 4; i++) this.burst(t + 0.04 + Math.random() * 0.3, 0.05, 0.12 * g, 3500 * P, 1.5, 'bandpass', 1500).connect(this.verb);
    return 0.6;
  }
  hit(t, g, pitch = 1) { this.burst(t, 0.12, 0.25 * g, 3000 * (pitch || 1), 1, 'bandpass', 900); return 0.06; }
  shield(t, g) { this.osc('sine', 600 + Math.random() * 200, 1400, t, 0.25, 0.08 * g); this.burst(t, 0.2, 0.08 * g, 6000, 4, 'bandpass', 2500); return 0.08; }
  ui(t, g) { this.osc('sine', 880, 1320, t, 0.12, 0.1 * g); return 0.1; }
  jump(t, g) { this.osc('sawtooth', 60, 2400, t, 2.2, 0.15 * g); this.burst(t, 2.4, 0.3 * g, 200, 2, 'bandpass', 6000).connect(this.verb); return 2; }
  // the drive: a rising whine over the ~4 s spool, then the punch as it goes
  spool(t, g) {
    // swells rather than decays: each voice ramps up across the spool and cuts at the end
    const c = this.ctx, D = 4.1;
    for (const [type, f0, f1, v] of [['sawtooth', 40, 420, 0.05], ['sine', 80, 1040, 0.09], ['triangle', 160, 2080, 0.035]]) {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + D);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(v * g, t + D * 0.95); gn.gain.exponentialRampToValueAtTime(0.0001, t + D + 0.15);
      o.connect(gn).connect(this.sfx); gn.connect(this.verb); o.start(t); o.stop(t + D + 0.2);
    }
    return D;
  }
  warp(t, g) { this.osc('sine', 1400, 50, t, 0.9, 0.3 * g); this.burst(t, 1.4, 0.35 * g, 200, 2, 'bandpass', 6000).connect(this.verb); return 1; }
  levelup(t, g) { [523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, f * 1.001, t + i * 0.09, 0.9, 0.12 * g).connect(this.verb)); return 1; }
  lure(t, g) { this.osc('sine', 70, 38, t, 0.7, 0.32 * g); this.osc('triangle', 140, 76, t, 0.55, 0.1 * g); this.burst(t, 0.35, 0.12 * g, 120, 1, 'lowpass', 900); return 0.7; }
  // a heavy plate locking home: a dull thud, inharmonic ringing partials (struck steel) and a short grinding scrape
  clank(t, g) {
    this.osc('sine', 150, 46, t, 0.4, 0.55 * g);
    this.burst(t, 0.09, 0.5 * g, 2600, 0.8, 'lowpass', 500);
    const f = 260 + Math.random() * 40;
    [[1, 0.13, 0.9], [2.76, 0.08, 0.6], [5.4, 0.05, 0.4], [8.93, 0.03, 0.25]].forEach(([k, a, d]) => this.osc('sine', f * k, f * k * 0.985, t, d, a * g).connect(this.verb));
    this.burst(t + 0.01, 0.32, 0.16 * g, 5200, 3, 'bandpass', 2400);
    return 0.5;
  }
  whoosh(t, g) { this.burst(t, 0.42, 0.22 * g, 500, 1.6, 'bandpass', 3400); this.osc('sawtooth', 70, 160, t, 0.4, 0.04 * g); return 0.3; }
  loot(t, g) { [1046, 1318, 1568, 2093].forEach((f, i) => this.osc('sine', f, f, t + i * 0.06, 0.6, 0.08 * g).connect(this.verb)); return 0.5; }

  // ---- ship weapons ----
  // A voice held for dur: fast attack, flat sustain, short release. Returns its gain node (connect it).
  hold(t, dur, gain, atk = 0.012, rel = 0.1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + atk);
    g.gain.setValueAtTime(gain, t + Math.max(atk, dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
  // an oscillator with an LFO on its pitch (vibrato / warble), held for dur
  wobble(type, f0, f1, t, dur, rate, depth, dest) {
    const c = this.ctx, o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
    l.frequency.value = rate; lg.gain.value = depth; l.connect(lg).connect(o.frequency);
    o.connect(dest); o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
    return o;
  }
  noiseThrough(buf, t, dur, type, freq, q, dest, sweepTo) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter();
    s.buffer = buf; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    s.connect(f).connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return f;
  }

  // The ship's phaser: a steady electric hum with pink-noise fuzz laid over it and a high, warbling whine,
  // held for as long as the beam is on (b = seconds). It opens with a bright zap and dies with a drop.
  phaser(t, g, pitch = 1, dur = 0.45) {
    const D = Math.max(0.28, Math.min(1.4, dur || 0.45)), P = pitch || 1, c = this.ctx;
    const out = this.hold(t, D, 0.5 * g, 0.015, 0.12); out.connect(this.sfx); out.connect(this.verb);
    // the hum: two detuned saws beating, through a resonant band that drifts up
    const hb = c.createBiquadFilter(); hb.type = 'bandpass'; hb.Q.value = 3; hb.frequency.setValueAtTime(900 * P, t); hb.frequency.linearRampToValueAtTime(1300 * P, t + D);
    const hg = c.createGain(); hg.gain.value = 0.55; hb.connect(hg).connect(out);
    this.wobble('sawtooth', 165 * P, 172 * P, t, D, 60, 4, hb);
    this.wobble('sawtooth', 167.5 * P, 175 * P, t, D, 61, 4, hb);
    // the whine: a sine with a fast warble, rising a little as the beam holds
    const wg = c.createGain(); wg.gain.value = 0.3; wg.connect(out);
    this.wobble('sine', 1480 * P, 1620 * P, t, D, 34, 55 * P, wg);
    this.wobble('sine', 2960 * P, 3240 * P, t, D, 34, 110 * P, (() => { const x = c.createGain(); x.gain.value = 0.25; x.connect(wg); return x; })());
    // the fuzz: pink noise in a high band, tremoloed by the same buzz
    const ng = c.createGain(); ng.gain.value = 0.3; ng.connect(out);
    const am = c.createOscillator(), amg = c.createGain(); am.frequency.value = 60; amg.gain.value = 0.15; am.connect(amg).connect(ng.gain); am.start(t); am.stop(t + D + 0.05);
    this.noiseThrough(this.pink, t, D, 'bandpass', 3200 * P, 1.6, ng);
    // zap on, drop off
    this.osc('sine', 4200 * P, 1500 * P, t, 0.07, 0.12 * g);
    this.osc('sine', 1500 * P, 300 * P, t + D - 0.05, 0.14, 0.06 * g);
    return D;
  }
  // the older hand of phaser: a shrill whine with a deep, fast warble (tachyon lances)
  tosPhaser(t, g, pitch = 1, dur = 0.45) {
    const D = Math.max(0.3, Math.min(1.4, dur || 0.45)), P = pitch || 1, c = this.ctx;
    const out = this.hold(t, D, 0.18 * g, 0.02, 0.1); out.connect(this.sfx); out.connect(this.verb);
    this.wobble('sine', 1700 * P, 1500 * P, t, D, 18, 380 * P, out);
    const tg = c.createGain(); tg.gain.value = 0.35; tg.connect(out);
    this.wobble('triangle', 850 * P, 760 * P, t, D, 18, 190 * P, tg);
    const ng = c.createGain(); ng.gain.value = 0.4; ng.connect(out);
    this.noiseThrough(this.pink, t, D, 'bandpass', 2400 * P, 1.2, ng);
    return D;
  }
  // a heavy broadside lance: the phaser an octave down, with a sub-bass push under it
  lance(t, g, pitch = 1, dur = 0.5) {
    const D = this.phaser(t, g * 0.85, (pitch || 1) * 0.62, dur);
    this.osc('sine', 70 * (pitch || 1), 45, t, Math.min(1.2, D + 0.2), 0.35 * g);
    return D;
  }
  // the spinal lance: a charge whine climbing, then the roar of the beam
  spinal(t, g, pitch = 1, dur = 0.8) {
    const P = pitch || 1;
    this.osc('sawtooth', 220 * P, 1800 * P, t, 0.22, 0.06 * g).connect(this.verb);
    this.osc('sine', 440 * P, 3600 * P, t, 0.2, 0.08 * g);
    const D = this.phaser(t + 0.12, g, 0.45 * P, (dur || 0.8));
    this.osc('sine', 55 * P, 30, t + 0.12, D + 0.3, 0.4 * g);
    this.burst(t + 0.12, D + 0.3, 0.25 * g, 600, 0.6, 'lowpass', 120).connect(this.verb);
    return D + 0.12;
  }
  // a pulse phaser bolt: a short bright "tchew" that falls away
  pulsePhaser(t, g, pitch = 1) {
    const P = pitch || 1, c = this.ctx;
    const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.32 * g, t + 0.006); out.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    out.connect(this.sfx); const send = c.createGain(); send.gain.value = 0.3; out.connect(send).connect(this.verb);
    const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(1900 * P, t); o.frequency.exponentialRampToValueAtTime(380 * P, t + 0.16);
    const lf = c.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.setValueAtTime(5000, t); lf.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    const fm = c.createOscillator(), fg = c.createGain(); fm.frequency.value = 70; fg.gain.value = 120 * P; fm.connect(fg).connect(o.frequency);
    o.connect(lf).connect(out); o.start(t); fm.start(t); o.stop(t + 0.22); fm.stop(t + 0.22);
    this.burst(t, 0.07, 0.12 * g, 4500 * P, 1.2, 'bandpass', 1800);
    return 0.08;
  }
  // a disruptor: harsh and ragged, a low saw ring-modulated into a snarl with crackle on top
  disruptor(t, g, pitch = 1, dur = 0.35) {
    const D = Math.max(0.22, Math.min(1, dur || 0.35)), P = pitch || 1, c = this.ctx;
    const out = this.hold(t, D, 0.4 * g, 0.008, 0.1); out.connect(this.sfx); out.connect(this.verb);
    const rm = c.createGain(); rm.gain.value = 0; rm.connect(out);
    const mod = c.createOscillator(); mod.frequency.value = 43 * P; mod.connect(rm.gain); mod.start(t); mod.stop(t + D + 0.05);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100 * P; bp.Q.value = 1.4; bp.connect(rm);
    this.wobble('sawtooth', 260 * P, 180 * P, t, D, 23, 40, bp);
    this.wobble('square', 131 * P, 92 * P, t, D, 11, 18, bp);
    const ng = c.createGain(); ng.gain.value = 0.22; ng.connect(out);
    this.noiseThrough(this.noise, t, D, 'highpass', 3000, 0.7, ng);
    this.osc('sawtooth', 2400 * P, 400, t, 0.1, 0.08 * g);
    return D;
  }
  // arc lightning: snapping crackle in short bursts
  arc(t, g, pitch = 1, dur = 0.25) {
    const D = Math.max(0.15, Math.min(0.6, dur || 0.25)), P = pitch || 1;
    for (let i = 0; i < 6; i++) { const tt = t + Math.random() * D; this.burst(tt, 0.04 + Math.random() * 0.05, (0.2 + Math.random() * 0.15) * g, 3000 + Math.random() * 4000 * P, 1, 'bandpass', 1200).connect(this.verb); }
    this.osc('sawtooth', 120 * P, 60, t, D, 0.12 * g);
    return D;
  }
  // a graviton beam / tractor: a deep throbbing hum that bends down
  graviton(t, g, pitch = 1, dur = 0.45) {
    const D = Math.max(0.3, Math.min(1.2, dur || 0.45)), P = pitch || 1, c = this.ctx;
    const out = this.hold(t, D, 0.2 * g, 0.04, 0.15); out.connect(this.sfx); out.connect(this.verb);
    const am = c.createOscillator(), amg = c.createGain(), vg = c.createGain(); vg.gain.value = 0.6; am.frequency.value = 9 * P; amg.gain.value = 0.4;
    am.connect(amg).connect(vg.gain); am.start(t); am.stop(t + D + 0.05); vg.connect(out);
    this.wobble('sine', 92 * P, 70 * P, t, D, 3, 6, vg);
    this.wobble('triangle', 184 * P, 141 * P, t, D, 3, 9, vg);
    this.wobble('sine', 620 * P, 540 * P, t, D, 9, 30, (() => { const x = c.createGain(); x.gain.value = 0.1; x.connect(out); return x; })());
    return D;
  }
  // The tube torpedo: a struck spring in a long tube. A falling "pew" that flutters back as echoes off the
  // tube, a metallic ring under it and the thump of the launch.
  photon(t, g, pitch = 1) {
    const P = pitch || 1, c = this.ctx;
    this.osc('sine', 120 * P, 42, t, 0.26, 0.45 * g);
    this.burst(t, 0.06, 0.25 * g, 3000, 0.8, 'lowpass', 600);
    for (let k = 0; k < 4; k++) {
      const tt = t + 0.012 + k * 0.058, a = 0.26 * Math.pow(0.55, k) * g, f0 = 2600 * P * (1 - k * 0.04);
      const o = c.createOscillator(), og = c.createGain(), lf = c.createBiquadFilter();
      o.type = 'triangle'; o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(240 * P, tt + 0.36);
      lf.type = 'lowpass'; lf.frequency.setValueAtTime(7000, tt); lf.frequency.exponentialRampToValueAtTime(1200, tt + 0.4); lf.Q.value = 4;
      og.gain.setValueAtTime(0.0001, tt); og.gain.exponentialRampToValueAtTime(a, tt + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, tt + 0.42);
      o.connect(lf).connect(og); og.connect(this.sfx); og.connect(this.verb); o.start(tt); o.stop(tt + 0.45);
      // the spring's second mode, a fifth above, falling with it
      this.osc('sine', f0 * 1.5, 360 * P, tt, 0.3, a * 0.35);
    }
    // the tube ringing: inharmonic partials of struck steel
    const f = 520 * P;
    [[1, 0.05, 0.6], [2.32, 0.035, 0.45], [3.87, 0.02, 0.3]].forEach(([k, a, d]) => this.osc('sine', f * k, f * k * 0.97, t, d, a * g).connect(this.verb));
    this.burst(t, 0.5, 0.1 * g, 2600 * P, 1.4, 'bandpass', 700).connect(this.verb);
    return 0.35;
  }
  // the quantal torpedo: higher and harder, a crystalline glint on top of the spring
  quantal(t, g, pitch = 1) {
    const P = pitch || 1;
    this.photon(t, g * 0.85, 1.28 * P);
    for (let i = 0; i < 4; i++) { const tt = t + 0.03 + i * 0.045 + Math.random() * 0.02, f = (4200 + Math.random() * 1800) * P; this.osc('sine', f, f * 1.02, tt, 0.18, 0.05 * g).connect(this.verb); }
    this.osc('sawtooth', 3200 * P, 900 * P, t, 0.12, 0.04 * g);
    return 0.3;
  }
  // a plasma globe: a slow seething swell, a gurgling falling tone and a rush as it leaves
  plasmic(t, g, pitch = 1) {
    const P = pitch || 1, c = this.ctx, D = 1.1;
    const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.24 * g, t + 0.18); out.gain.exponentialRampToValueAtTime(0.0001, t + D);
    out.connect(this.sfx); out.connect(this.verb);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.2); lp.frequency.exponentialRampToValueAtTime(500, t + D); lp.Q.value = 6; lp.connect(out);
    this.wobble('sawtooth', 150 * P, 62 * P, t, D, 23, 25 * P, lp);
    this.wobble('sawtooth', 151.5 * P, 63 * P, t, D, 17, 20 * P, lp);
    const ng = c.createGain(); ng.gain.value = 0.5; ng.connect(out);
    this.noiseThrough(this.pink, t, D, 'bandpass', 500, 1.5, ng, 2200);
    this.osc('sine', 1800 * P, 300 * P, t + 0.15, 0.5, 0.08 * g).connect(this.verb);
    return 0.6;
  }
  // a demolition device or gravity torpedo: a deep launch thud, the spring low, and a long rumble
  heavyTorp(t, g, pitch = 1) {
    const P = pitch || 1;
    this.osc('sine', 70 * P, 24, t, 0.9, 0.75 * g);
    this.photon(t + 0.02, g * 0.8, 0.55 * P);
    this.burst(t, 1.2, 0.3 * g, 700, 0.6, 'lowpass', 90).connect(this.verb);
    return 0.8;
  }
  // a railgun: a hard electric crack and the slam of the slug leaving
  rail(t, g, pitch = 1) {
    const P = pitch || 1;
    this.burst(t, 0.05, 0.5 * g, 7000, 0.7, 'highpass', 3000);
    this.osc('sawtooth', 5200 * P, 800 * P, t, 0.08, 0.1 * g);
    this.osc('sine', 3100 * P, 2400 * P, t, 0.3, 0.05 * g).connect(this.verb);
    this.osc('sine', 110 * P, 40, t, 0.35, 0.45 * g);
    this.burst(t + 0.01, 0.4, 0.15 * g, 1500, 0.6, 'lowpass', 200).connect(this.verb);
    return 0.12;
  }
  // a plasma bolt: a wet, falling zap
  plasmaShot(t, g, pitch = 1) {
    const P = pitch || 1;
    this.osc('sawtooth', 700 * P, 120 * P, t, 0.22, 0.24 * g);
    this.osc('sine', 1400 * P, 250 * P, t, 0.2, 0.2 * g).connect(this.verb);
    this.burst(t, 0.18, 0.3 * g, 1600 * P, 2, 'bandpass', 400);
    return 0.1;
  }
  // an ion charge: a buzzing pop
  ionShot(t, g, pitch = 1) {
    const P = pitch || 1;
    this.osc('square', 900 * P, 200 * P, t, 0.18, 0.15 * g);
    this.osc('sine', 2400 * P, 600 * P, t, 0.15, 0.14 * g).connect(this.verb);
    this.burst(t, 0.12, 0.28 * g, 5000, 1, 'highpass', 2000);
    return 0.1;
  }

  // --- generative music ---
  startMusic() {
    const c = this.ctx;
    this.music = c.createGain(); this.music.gain.value = this.musicVolume; this.music.connect(this.master);
    this.padBus = c.createGain(); this.padBus.gain.value = 0.5; this.padBus.connect(this.music);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.6;
    this.padFilter = lp;
    this.padIn = c.createGain(); this.padIn.connect(lp).connect(this.padBus);
    lp.connect(this.verb);
    this.drumBus = c.createGain(); this.drumBus.gain.value = 0; this.drumBus.connect(this.music);
    // minor modal progression (D aeolian-ish), long chords
    this.chords = [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [45, 52, 57, 60], [43, 50, 55, 58], [46, 53, 58, 65]];
    this.chordI = 0; this.nextChord = c.currentTime + 0.1; this.nextBeat = c.currentTime + 0.5; this.beat = 0;
    this.tick = setInterval(() => this.schedule(), 100);
  }
  mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  schedule() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    // fade the combat layer with intensity
    this.drumBus.gain.setTargetAtTime(this.intensity * 0.55, now, 1.2);
    this.padFilter.frequency.setTargetAtTime(700 + this.intensity * 1400, now, 2);
    while (this.nextChord < now + 0.3) {
      const t = this.nextChord, ch = this.chords[this.chordI % this.chords.length], dur = 8;
      for (const m of ch) for (const det of [-6, 6]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = this.mtof(m); o.detune.value = det + (Math.random() - 0.5) * 4;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + 2.5); g.gain.linearRampToValueAtTime(0.018, t + dur - 1.5); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5);
        o.connect(g).connect(this.padIn); o.start(t); o.stop(t + dur + 1.6);
      }
      // sub drone
      const s = c.createOscillator(), sg = c.createGain(); s.type = 'sine'; s.frequency.value = this.mtof(ch[0] - 12);
      sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.08, t + 2); sg.gain.linearRampToValueAtTime(0.0001, t + dur + 1);
      s.connect(sg).connect(this.music); s.start(t); s.stop(t + dur + 1.1);
      // sparse bell arpeggio
      for (let i = 0; i < 4; i++) if (Math.random() < 0.6) {
        const m = ch[Math.floor(Math.random() * 4)] + 24, tt = t + 1 + i * 1.7 + Math.random() * 0.3;
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = this.mtof(m);
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.03, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.5);
        o.connect(g); g.connect(this.music); g.connect(this.verb); o.start(tt); o.stop(tt + 2.6);
      }
      this.chordI++; this.nextChord += dur;
    }
    // combat percussion: 96 bpm war drums, only scheduled when it matters
    while (this.nextBeat < now + 0.3) {
      const t = this.nextBeat, b = this.beat % 16;
      if (this.intensity > 0.05) {
        if (b % 4 === 0 || b === 10) { // taiko kick
          const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
          o.connect(g).connect(this.drumBus); o.start(t); o.stop(t + 0.5);
        }
        if (b % 8 === 4) this.burst(t, 0.18, 0.35, 1800, 0.8, 'bandpass', 900, this.drumBus);
        if (b % 2 === 1) this.burst(t, 0.05, 0.08, 8000, 0.5, 'highpass', null, this.drumBus);
        if (b === 14 || b === 15) this.burst(t, 0.12, 0.2, 2500, 0.8, 'bandpass', 1200, this.drumBus);
      }
      this.beat++; this.nextBeat += 60 / 96 / 4 * 2;
    }
  }
}
