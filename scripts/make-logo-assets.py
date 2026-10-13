"""Builds every logo, icon and splash image from the master artwork.

    python scripts/make-logo-assets.py

Input:  assets/logo-source.png   (the tomato clock on warm off-white)
Output: assets/logo-icon.png        app tile with transparent corners (1024)
        assets/logo-mark.png        the tomato alone on transparency (1024)
        assets/favicon.png          32x32
        assets/apple-touch-icon.png 180x180, full-bleed purple (iOS rounds it)
        resources/*.png             sources for `npx @capacitor/assets generate`
Needs Pillow (pip install pillow).
"""
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'logo-source.png'
BG = (253, 250, 246)  # warm off-white sampled from the artwork


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a[:3], b[:3])) ** 0.5


def flood_clear(im, seeds, match):
    """Makes every pixel connected to a seed and accepted by `match` transparent."""
    px, (w, h) = im.load(), im.size
    seen, q = set(), deque(seeds)
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        if not match(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return seen


def soften_edge(im):
    """Feathers a 1px rim so cut-out edges don't look jagged when scaled down."""
    a = im.getchannel('A')
    im.putalpha(a.filter(ImageFilter.GaussianBlur(0.6)).point(lambda v: 255 if v > 200 else v))
    return im


def fit(im, size, scale, dy=0.0, bg=None):
    """Centers `im` (trimmed) on a square canvas, `scale` = fraction of the side it spans."""
    im = im.crop(im.getbbox())
    s = int(size * scale)
    r = s / max(im.size)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    out.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2 + int(size * dy)))
    return out


src = Image.open(SRC).convert('RGBA')
W, H = src.size

# 1) the tile with its white corners made transparent
tile = src.copy()
flood_clear(tile, [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)], lambda p: p[0] > 200 and p[1] > 200 and p[2] > 200)
tile = soften_edge(tile)
tile.resize((1024, 1024), Image.LANCZOS).save(ROOT / 'assets' / 'logo-icon.png')

# 2) the tomato alone: clear the purple field, starting just inside the rounded border
mark = tile.copy()
seeds = [(x, y) for x in range(W) for y in (int(H * 0.06), int(H * 0.94))] + [(x, y) for y in range(H) for x in (int(W * 0.06), int(W * 0.94))]
flood_clear(mark, seeds, lambda p: p[3] > 0 and dist(p, BG) < 46)
# the tile's soft rounded border survives the flood fill; the tomato sits well inside it,
# so clear a margin all the way around
px = mark.load()
m = int(W * 0.09)
for y in range(H):
    for x in range(W):
        if x < m or y < m or x >= W - m or y >= H - m:
            px[x, y] = (0, 0, 0, 0)
mark = soften_edge(mark)
mark_sq = fit(mark, 1024, 0.9)
mark_sq.save(ROOT / 'assets' / 'logo-mark.png')

# 3) small icons
tile.resize((32, 32), Image.LANCZOS).save(ROOT / 'assets' / 'favicon.png')
fit(mark, 180, 0.78, bg=BG + (255,)).save(ROOT / 'assets' / 'apple-touch-icon.png')

# 4) Android launcher + splash sources for @capacitor/assets.
# Adaptive foreground: Capacitor insets this layer to the 72dp visible area, and launchers
# then crop that with a circle/squircle; the round tomato can span ~74% and stay inside it.
res = ROOT / 'resources'
fit(mark, 1024, 0.74).save(res / 'icon-foreground.png')
Image.new('RGBA', (1024, 1024), BG + (255,)).save(res / 'icon-background.png')
fit(mark, 1024, 0.74, bg=BG + (255,)).save(res / 'icon-only.png')
for name in ('splash.png', 'splash-dark.png'):
    fit(mark, 2732, 0.3, bg=BG + (255,)).save(res / name)
print('logo assets written')
