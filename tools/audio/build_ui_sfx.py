#!/usr/bin/env python3
"""Build the game's interface sound bank from the SCI-FI UI SFX pack.

    python3 tools/audio/build_ui_sfx.py [SOURCE_DIR] [OUT_DIR]

SOURCE_DIR defaults to assets/sounds/SCI-FI_UI_SFX_PACK, where the pack was delivered (48 kHz / 24-bit WAV, folders
with spaces in their names, up to 1.3 s of trailing silence, impacts with 0.85 s of digital silence up front).
The raw WAVs were removed once built (71 MB); to rebuild, restore them from git history first:
    git checkout 65d8d17 -- assets/sounds/SCI-FI_UI_SFX_PACK
OUT_DIR defaults to assets/audio/ui. For every WAV this writes one game-ready MP3 at a stable, lower-case path
(`src/engine/sfxBank.js` names them; `tests/sfx.test.mjs` checks the two agree):

  - silence trimmed at both ends (-60 dB below the file's peak, 2 ms kept before the onset, 25 ms fade at the tail)
  - loudness evened out: the audible part is brought to -20 dBFS RMS, never above -1 dBFS peak, so one cue
    volume in the bank means the same thing for a soft ring and a hard click
  - mono when the two channels are identical (most of the pack), stereo otherwise (glitches, impacts, Tone3)
  - MP3 (LAME VBR q2, 48 kHz): decodeAudioData reads it in every browser the game runs in; the LAME header
    carries the encoder delay so the onset stays tight

Needs ffmpeg with libmp3lame, and numpy.
"""
import os, re, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets/sounds/SCI-FI_UI_SFX_PACK')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'assets/audio/ui')
SR = 48000
TARGET_RMS, PEAK_CAP = -20.0, -1.0

INTERVALS = {
  'FifthDown': 'fifth-down', 'FifthUp': 'fifth-up', 'FifthOctaveDown': 'fifth-octave-down', 'FifthOctaveUp': 'fifth-octave-up',
  'FourthDown': 'fourth-down', 'FourthUp': 'fourth-up', 'FourthOctaveDown': 'fourth-octave-down', 'FourthOctaveUp': 'fourth-octave-up',
  'MajorThirdDown': 'major-third-down', 'MajorThirdUp': 'major-third-up', 'MajorTriadDown': 'major-triad-down', 'MajorTriadUp': 'major-triad-up',
  'MinorThirdDown': 'minor-third-down', 'MinorThirdUp': 'minor-third-up', 'MinorTriadDown': 'minor-triad-down', 'MinorTriadUp': 'minor-triad-up',
  'OctaveDown': 'octave-down', 'OctaveUp': 'octave-up',
  'TritoneDown': 'tritone-down', 'TritoneUp': 'tritone-up', 'TritoneOctaveDown': 'tritone-octave-down', 'TritoneOctaveUp': 'tritone-octave-up',
}
NAMED = {
  'Click Combos/Click_Combo.wav': 'combo/combo-1', 'Click Combos/Click_Combo_Pitched_Up.wav': 'combo/combo-1-up',
  'Click Combos/Click_Combo_2.wav': 'combo/combo-2', 'Click Combos/Click_Combo_2_High.wav': 'combo/combo-2-high', 'Click Combos/Click_Combo_2_Low.wav': 'combo/combo-2-low',
  'Click Combos/Click_Combo_3.wav': 'combo/combo-3', 'Click Combos/Click_Combo_3_High.wav': 'combo/combo-3-high',
  'Click Combos/Click_Combo_4.wav': 'combo/combo-4', 'Click Combos/Click_Combo_4_High.wav': 'combo/combo-4-high',
  'Click Combos/Click_Combo_5.wav': 'combo/combo-5', 'Click Combos/Click_Combo_5_Pitched_Down.wav': 'combo/combo-5-down', 'Click Combos/Click_Combo_5_Pitched_Up.wav': 'combo/combo-5-up',
  'Clicks/Click.wav': 'click/click', 'Clicks/Click_1.wav': 'click/click-1', 'Clicks/Click_2.wav': 'click/click-2', 'Clicks/Click_3.wav': 'click/click-3',
  'Clicks/Click_Low.wav': 'click/click-low', 'Clicks/Click_Mid.wav': 'click/click-mid', 'Clicks/Click_Mid-High.wav': 'click/click-mid-high',
  'Clicks/Click_Pitched_Down.wav': 'click/click-down', 'Clicks/Click_Pitched_Down_High_Pass.wav': 'click/click-down-hp', 'Clicks/Click_Pitched_Up.wav': 'click/click-up',
  'Clicks/Click_Scoop_Up.wav': 'click/click-scoop', 'Clicks/Click_Stutter.wav': 'click/click-stutter', 'Clicks/Click_Stutter_High.wav': 'click/click-stutter-high',
  'Clicks/High_Click_1.wav': 'click/high-click-1', 'Clicks/High_Click_2.wav': 'click/high-click-2',
  'Clicks/Ting_Pitched_Down.wav': 'click/ting-down', 'Clicks/Ting_Pitched_Up.wav': 'click/ting-up',
  'FX Sounds/Air_FX.wav': 'air/air', 'FX Sounds/Air_FX_Pitched_Down.wav': 'air/air-down', 'FX Sounds/Air_FX_Pitched_Up.wav': 'air/air-up',
  'Impacts/Impact_1.wav': 'impact/impact-1', 'Impacts/Impact_1_Low.wav': 'impact/impact-1-low', 'Impacts/Impact_2.wav': 'impact/impact-2',
  'Impacts/Impact_2_Mid.wav': 'impact/impact-2-mid', 'Impacts/Impact_2_Reso.wav': 'impact/impact-2-reso', 'Impacts/Impact_2_Top_End.wav': 'impact/impact-2-top',
  'Rings/Reverse_Ring.wav': 'ring/reverse-1', 'Rings/Reverse_Ring_High.wav': 'ring/reverse-1-high', 'Rings/Reverse_Ring_Low.wav': 'ring/reverse-1-low', 'Rings/Reverse_Ring_Very_Low.wav': 'ring/reverse-1-very-low',
  'Rings/Reverse_Ring_2.wav': 'ring/reverse-2', 'Rings/Reverse_Ring_2_High.wav': 'ring/reverse-2-high', 'Rings/Reverse_Ring_2_Mid.wav': 'ring/reverse-2-mid',
  'Rings/Reverse_Ring_2_Low.wav': 'ring/reverse-2-low', 'Rings/Reverse_Ring_2_Very_Low.wav': 'ring/reverse-2-very-low',
  'Rings/Ring_Pitched_Down.wav': 'ring/ring-down', 'Rings/Ring_Pitched_Up.wav': 'ring/ring-up', 'Rings/Ring_Pitched_Up_1.wav': 'ring/ring-up-soft',
}

def target(rel):
  if rel in NAMED: return NAMED[rel]
  m = re.fullmatch(r'Glitches/Glitch(?:_(\d+))?\.wav', rel)
  if m: return 'glitch/glitch-%02d' % int(m.group(1) or 0)
  m = re.fullmatch(r'Tone(\d)/[^/]+/Tone\d([A-E])(?:_(\w+))?\.wav', rel)
  if m:
    n, letter, iv = m.groups()
    suffix = '' if iv is None else '-double' if iv == 'Double' else '-' + INTERVALS[iv]
    return 'tone%s/%s%s' % (n, letter.lower(), suffix)
  raise SystemExit('no name for ' + rel)

def load(path):
  raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
  return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)

def build(src, dst):
  a = load(src)
  pk = np.abs(a).max()
  if pk <= 0: raise SystemExit('silent file ' + src)
  loud = np.nonzero(np.abs(a).max(1) > pk * 10 ** (-60 / 20))[0]
  s0 = max(0, loud[0] - int(0.002 * SR)); s1 = min(len(a), loud[-1] + int(0.025 * SR))
  a = a[s0:s1].copy()
  fade = min(len(a), int(0.025 * SR)); a[-fade:] *= np.linspace(1, 0, fade)[:, None]
  rms = np.sqrt((a ** 2).mean()); peak = np.abs(a).max()
  gain = min(10 ** (TARGET_RMS / 20) / rms, 10 ** (PEAK_CAP / 20) / peak)
  a *= gain
  mono = np.abs(a[:, 0] - a[:, 1]).max() < 0.01
  pcm = (a.mean(1, keepdims=True) if mono else a).astype(np.float32)
  os.makedirs(os.path.dirname(dst), exist_ok=True)
  subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1' if mono else '2', '-i', '-',
                  '-c:a', 'libmp3lame', '-q:a', '2', '-ar', str(SR), '-map_metadata', '-1', dst], input=pcm.tobytes(), check=True)
  return len(a) / SR, mono

def main():
  seen = {}
  for dp, _, fn in os.walk(SRC):
    for f in sorted(fn):
      if not f.lower().endswith('.wav'): continue
      rel = os.path.relpath(os.path.join(dp, f), SRC).replace(os.sep, '/')
      name = target(rel)
      if name in seen: raise SystemExit('two files map to %s: %s, %s' % (name, seen[name], rel))
      seen[name] = rel
      dur, mono = build(os.path.join(dp, f), os.path.join(OUT, name + '.mp3'))
      print('%-34s %5.2fs %s  <- %s' % (name, dur, 'mono  ' if mono else 'stereo', rel))
  print(len(seen), 'files ->', OUT)

if __name__ == '__main__':
  main()
