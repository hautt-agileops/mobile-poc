#!/usr/bin/env python3
"""
Border flood-fill background remover for game-asset-gen sprites.

Why: Vertex "nano-banana" (gemini-2.5-flash-image) does NOT emit a real alpha
channel. When asked for a "transparent background" it PAINTS a fake-transparency
checkerboard (light grey + white squares) as opaque RGB. This script turns that
baked light background into real alpha so the PNG composites cleanly in a game.

How: flood-fill from the image border, clearing connected pixels that look like the
light/grey/white background (light + low saturation). Because the generated art has a
dark outline around each subject, the fill stops at the silhouette and interior light
areas (cream, bellies) are preserved. A 1px alpha erosion shaves the anti-aliased halo.

Usage:
  python3 alpha_key.py <img.png> [more.png ...]        # in place
  python3 alpha_key.py -d <dir> [--skip id1,id2]       # every *.png in a dir
Needs Pillow (PIL). Skips files that already have meaningful transparency.
"""
import sys
import os
from collections import deque

try:
    from PIL import Image
except ImportError:
    sys.exit("error: Pillow required — pip install Pillow")

# a pixel is "background" if it's near-greyscale, at any mid-or-brighter level. This
# covers BOTH the light painted checkerboard nano-banana 1 emits (~236 / ~254 greys)
# AND the darker checkerboard Nano Banana 2 emits (~108 / ~150 greys). The brightness
# floor keeps dark, near-black subject areas (e.g. deep-navy silhouettes) opaque, and
# the low saturation gate keeps pastel/warm/coloured subject pixels opaque. Border
# flood-fill connectivity is the real safeguard — it stops at the subject's outline —
# so a neutral-grey patch inside the subject is never reached from the border.
GREY_MIN = 60     # min channel at least this bright (excludes near-black subjects)
SAT_MAX = 32      # max-min channel spread must be at most this (near-grey)


def is_bg(px):
    r, g, b = px[0], px[1], px[2]
    mn, mx = min(r, g, b), max(r, g, b)
    return mn >= GREY_MIN and (mx - mn) <= SAT_MAX


def already_transparent(im):
    # True only when the file already has a REAL cut-out — a meaningful fraction of
    # near-transparent pixels. A tiny sliver (< 12%) is just an anti-aliased halo from
    # a prior partial key over a painted checkerboard; those still need keying, so we
    # don't let a few transparent edge pixels short-circuit the flood-fill.
    if im.mode != "RGBA":
        return False
    a = im.getchannel("A")
    lo, _ = a.getextrema()
    if lo >= 8:
        return False
    near0 = sum(a.histogram()[:8])
    return near0 / (im.width * im.height) > 0.12


def key_image(path):
    im = Image.open(path).convert("RGBA")
    if already_transparent(im):
        return False, "already has alpha"
    w, h = im.size
    px = im.load()
    cleared = bytearray(w * h)  # 0/1 mask of pixels to make transparent
    q = deque()

    def push(x, y):
        if 0 <= x < w and 0 <= y < h and not cleared[y * w + x] and is_bg(px[x, y]):
            cleared[y * w + x] = 1
            q.append((x, y))

    # seed from every border pixel
    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    while q:
        x, y = q.popleft()
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)

    # apply alpha=0 to flood-filled background
    n_cleared = 0
    for i in range(w * h):
        if cleared[i]:
            x, y = i % w, i // w
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)
            n_cleared += 1

    # 1px alpha erosion to shave the anti-aliased halo ring around the subject
    edge = []
    for y in range(h):
        for x in range(w):
            if cleared[y * w + x]:
                continue
            if (
                (x > 0 and cleared[y * w + x - 1])
                or (x < w - 1 and cleared[y * w + x + 1])
                or (y > 0 and cleared[(y - 1) * w + x])
                or (y < h - 1 and cleared[(y + 1) * w + x])
            ):
                edge.append((x, y))
    for x, y in edge:
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, a // 2)

    im.save(path)
    frac = n_cleared / (w * h)
    return True, f"cleared {frac:.0%} -> alpha"


def main(argv):
    files = []
    skip = set()
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "-d":
            i += 1
            d = argv[i]
            files += [
                os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(".png")
            ]
        elif a == "--skip":
            i += 1
            skip = set(s.strip() for s in argv[i].split(","))
        else:
            files.append(a)
        i += 1
    if not files:
        sys.exit(__doc__)
    for f in files:
        stem = os.path.splitext(os.path.basename(f))[0]
        if stem in skip:
            print(f"  - {stem}: skipped")
            continue
        try:
            changed, msg = key_image(f)
            print(f"  {'✓' if changed else '-'} {stem}: {msg}")
        except Exception as e:
            print(f"  ! {stem}: {e}")


if __name__ == "__main__":
    main(sys.argv[1:])
