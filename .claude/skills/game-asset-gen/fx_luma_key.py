#!/usr/bin/env python3
"""
Luminance keyer for GLOW FX generated on a solid black background.

nano-banana can't produce real alpha for transparent requests (it bakes a grey
checkerboard), and alpha_key.py's border flood-fill can't cross that checker. For
additive-style glow effects (sparks, fire, crit bursts, muzzle, trails) the clean
answer is to generate on PURE BLACK and derive alpha from brightness:

    alpha = clamp(luma * GAIN)      # black -> 0, bright glow -> 1

RGB is left intact, so normal alpha blending reads like an additive glow on any
background. Run AFTER gen-assets, INSTEAD OF alpha_key.py, for these ids only.

Usage:
    python3 fx_luma_key.py <artDir> id1 id2 ...      # keys <id>*.png (all frames)
"""
import sys, glob, os
from PIL import Image

GAIN = 1.7          # push mid glow toward opaque
BLACK_CUT = 0.06    # luma below this -> fully transparent (kills dark noise)

def key(path):
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            if luma <= BLACK_CUT:
                a = 0
            else:
                a = int(max(0.0, min(1.0, luma * GAIN)) * 255)
            px[x, y] = (r, g, b, a)
    im.save(path)
    return path

def main():
    if len(sys.argv) < 3:
        print("usage: fx_luma_key.py <artDir> id1 id2 ...", file=sys.stderr)
        sys.exit(2)
    art = sys.argv[1]
    ids = sys.argv[2:]
    n = 0
    for i in ids:
        for p in sorted(glob.glob(os.path.join(art, i + "_*.png")) + glob.glob(os.path.join(art, i + ".png"))):
            key(p); n += 1
            print("keyed", os.path.basename(p))
    print(f"luma-keyed {n} frame(s)")

if __name__ == "__main__":
    main()
