# Shared numbers for the explorer frames (mirrors src/game/data/chassis.js: keep them in step;
# tests/vehicles.test.mjs checks the exported manifest against the game data).
import math

MARKS = 12
# hardpoints at Mk I and Mk XII; hp(m) = base + floor((m-1) * (top-base) / 11)
HP = {'skiff': (1, 5), 'rover': (1, 6), 'strider': (2, 7), 'gunship': (2, 8), 'crawler': (1, 6), 'lancer': (2, 7), 'seraph': (2, 8)}

# liveries: primary hull, secondary panels, dark structure, trim, glow (frame identity colours)
LIVERY = {
    'skiff':   dict(hull=0xdfe8f0, panel=0x5aa8c8, dark=0x2c343e, trim=0xb8c4d0, glow=0x58e0ff),
    'rover':   dict(hull=0xd88a3a, panel=0xe8d8b8, dark=0x30302e, trim=0xc8b898, glow=0xffa040),
    'strider': dict(hull=0x6a5a8a, panel=0xb8b0d0, dark=0x26242e, trim=0x9890b0, glow=0xb07aff),
    'gunship': dict(hull=0xb02e3a, panel=0xdcd2c0, dark=0x26282e, trim=0xc8c0b0, glow=0xff4a5a),
    'crawler': dict(hull=0xe0b028, panel=0x2a2a2a, dark=0x2a2a28, trim=0xc8c0a8, glow=0xffd040),
    'lancer':  dict(hull=0x5a7898, panel=0xe4eaf0, dark=0x242a32, trim=0xb0bcc8, glow=0x8ab8ff),
    'seraph':  dict(hull=0xeef0f2, panel=0x2aa898, dark=0x2a2e34, trim=0xd8c08a, glow=0x5affe0),
}


def hp_count(frame, m):
    b, t = HP[frame]
    return b + (m - 1) * (t - b) // 11


def scale(m):
    """overall growth with the mark (stage changes add more on top)"""
    return 1 + (m - 1) * 0.075


def pick_hardpoints(central, pairs, n):
    """Choose n mount points: some on the centre line, the rest in mirrored pairs, symmetric when possible.
    central: [(x, y, z)], pairs: [(x, y, z)] with x > 0 (mirrored to -x). Returns a list of n points."""
    best = None
    for c in range(0, min(len(central), n) + 1):
        rest = n - c
        if rest % 2 or rest // 2 > len(pairs):
            continue
        score = (0 if c >= 1 else 1, c)  # prefer at least one on the centre line, then as few as needed
        if best is None or score < best[0]:
            best = (score, c)
    if best is None:  # not enough mirrored spots: fill what we can
        pts = list(central[:n])
        for p in pairs:
            if len(pts) >= n:
                break
            pts.append(p)
            if len(pts) < n:
                pts.append((-p[0], p[1], p[2]))
        return pts[:n]
    c = best[1]
    pts = list(central[:c])
    for p in pairs[:(n - c) // 2]:
        pts.append(p)
        pts.append((-p[0], p[1], p[2]))
    return pts
