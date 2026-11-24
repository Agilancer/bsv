// Procedural audio: every sound is synthesised with WebAudio (no files), attenuated by
// distance from the camera's focus, with a per-kind voice limit so a 40-gun broadside
// doesn't clip. Plus generative music: an ambient pad that a combat layer swells over.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.musicVolume = 0.45;
    this.listener = { x: 0, y: 0, z: 0 };
    this.voices = {};
    this.intensity = 0;      // 0 calm .. 1 full battle
    const unlock = () => { this.init(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  }

  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.enabled = false; return; }
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
    this.startMusic();
  }

  makeNoise() {
    const c = this.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
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

  play(kind, pos, mul = 1) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const g = this.att(pos) * mul;
    if (g < 0.02) return;
    const lim = { cannon: 10, heavy: 4, beam: 6, missile: 6, torpedo: 4, explosion: 8, hit: 10, shield: 8, ui: 3 }[kind] || 6;
    const now = this.ctx.currentTime;
    const v = (this.voices[kind] ||= []);
    while (v.length && v[0] < now) v.shift();
    if (v.length >= lim) return;
    const f = this[kind]; if (!f) return;
    const dur = f.call(this, now, g);
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
  explosion(t, g) { this.osc('sine', 70, 18, t, 1.4, 0.9 * g); this.burst(t, 1.6, 0.8 * g, 1400, 0.4, 'lowpass', 80).connect(this.verb); this.burst(t + 0.05, 0.5, 0.3 * g, 5000, 0.3, 'highpass', 2000); return 0.6; }
  hit(t, g) { this.burst(t, 0.12, 0.25 * g, 3000, 1, 'bandpass', 900); return 0.06; }
  shield(t, g) { this.osc('sine', 600 + Math.random() * 200, 1400, t, 0.25, 0.08 * g); this.burst(t, 0.2, 0.08 * g, 6000, 4, 'bandpass', 2500); return 0.08; }
  ui(t, g) { this.osc('sine', 880, 1320, t, 0.12, 0.1 * g); return 0.1; }
  jump(t, g) { this.osc('sawtooth', 60, 2400, t, 2.2, 0.15 * g); this.burst(t, 2.4, 0.3 * g, 200, 2, 'bandpass', 6000).connect(this.verb); return 2; }
  levelup(t, g) { [523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, f * 1.001, t + i * 0.09, 0.9, 0.12 * g).connect(this.verb)); return 1; }
  squeak(t, g) { const f = 900 + Math.random() * 500; this.osc('sine', f, f * 2.1, t, 0.09, 0.16 * g); this.osc('triangle', f * 1.8, f * 0.9, t + 0.08, 0.14, 0.12 * g); return 0.15; }
  loot(t, g) { [1046, 1318, 1568, 2093].forEach((f, i) => this.osc('sine', f, f, t + i * 0.06, 0.6, 0.08 * g).connect(this.verb)); return 0.5; }

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
