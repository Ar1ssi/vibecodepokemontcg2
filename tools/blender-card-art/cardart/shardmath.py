"""Mega ex shard burst (spec 4c) as pure 2D geometry in card-frame coordinates.

Each shard is a strip of (left, right) edge points from its base to its tip, so a renderer can
build it from quads or triangles without triangulating concave outlines. Coordinates are
normalized card-frame (u left to right, v top to bottom). Shapes may extend past 0..1; the frame
crops them.
"""

import math
import random
from dataclasses import dataclass, field

from .spec import CARD_ASPECT, MEGA_SHARD_PALETTE, hero_center


@dataclass
class Shard:
    left: list
    right: list
    color: str
    layer: str  # 'back' (behind the subject) or 'front' (crosses over it)
    kind: str  # 'blade' or 'splinter'
    meta: dict = field(default_factory=dict)

    @property
    def outline(self):
        return self.left + self.right[::-1]


def generate_shards(seed=0, count=28, center=None, palette=MEGA_SHARD_PALETTE,
                    front_fraction=0.3, keep_clear=0.22, blade_share=0.75):
    """Pinwheel burst of tapered blades and zigzag splinters radiating from `center`.

    `keep_clear` is the radius (in card heights) around the centre that front shards never enter,
    so they cross the body's edges instead of the face. Two back blades always run to the bottom
    corners, because Mega shards continue down beside the text box (spec section 2).
    """
    if count < 4:
        raise ValueError('count must be at least 4')
    if not 0 <= front_fraction <= 1:
        raise ValueError('front_fraction must be within 0..1')
    rng = random.Random(seed)
    cu, cv = center if center is not None else hero_center('mega')
    origin = (cu * CARD_ASPECT, cv)
    spin = rng.choice((-1, 1))
    front = set(rng.sample(range(count - 2), round((count - 2) * front_fraction)))

    shards = [_corner_blade(origin, corner, spin, rng) for corner in ((0.0, 1.0), (CARD_ASPECT, 1.0))]
    step = 2 * math.pi / (count - 2)
    start = rng.uniform(0, step)
    for i in range(count - 2):
        angle = start + i * step + rng.uniform(-0.4, 0.4) * step
        layer = 'front' if i in front else 'back'
        kind = 'blade' if rng.random() < blade_share else 'splinter'
        shards.append(_radial_shard(origin, angle, layer, kind, spin, keep_clear, rng))

    _assign_colors(shards, palette, rng)
    return shards


def _radial_shard(origin, angle, layer, kind, spin, keep_clear, rng):
    # Real Mega shards are broad ribbons (roughly 5-12% of the card height across), not thin streaks.
    if layer == 'front':
        width = rng.uniform(0.035, 0.08)
        start = keep_clear + width
        length = rng.uniform(0.15, 0.45)
    else:
        width = rng.uniform(0.05, 0.12)
        start = rng.uniform(0.02, 0.12)
        length = rng.uniform(0.35, 0.9)
    bend = spin * rng.uniform(0.15, 0.6) * (1.0 if kind == 'blade' else 0.3)
    builder = _blade if kind == 'blade' else _splinter
    left, right = builder(origin, angle, start, length, width, bend)
    return Shard(left, right, '', layer, kind, {'angle': angle, 'start': start, 'width': width})


def _corner_blade(origin, corner, spin, rng):
    dx, dy = corner[0] - origin[0], corner[1] - origin[1]
    angle = math.atan2(dy, dx)
    start = 0.05
    length = math.hypot(dx, dy) * 1.15 - start
    width = rng.uniform(0.06, 0.09)
    left, right = _blade(origin, angle, start, length, width, spin * 0.08)
    return Shard(left, right, '', 'back', 'blade', {'angle': angle, 'start': start, 'width': width})


def _centerline(origin, angle, start, length, bend, steps):
    pts = []
    for k in range(steps):
        t = k / (steps - 1)
        a = angle + bend * t
        r = start + length * t
        pts.append((origin[0] + r * math.cos(a), origin[1] + r * math.sin(a), t))
    return pts


def _edges(centre, half_widths):
    left, right = [], []
    for k, (x, y, _) in enumerate(centre):
        nxt = centre[min(k + 1, len(centre) - 1)]
        prv = centre[max(k - 1, 0)]
        tx, ty = nxt[0] - prv[0], nxt[1] - prv[1]
        norm = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / norm, tx / norm
        hl, hr = half_widths[k]
        left.append((x + nx * hl, y + ny * hl))
        right.append((x - nx * hr, y - ny * hr))
    return left, right


def _blade(origin, angle, start, length, width, bend, steps=14):
    centre = _centerline(origin, angle, start, length, bend, steps)
    # Blunt-ish base, fattest near a third of the way, needle tip.
    profile = [(t ** 0.35) * (1 - t) ** 1.2 for _, _, t in centre]
    peak = max(profile) or 1.0
    halves = [(width * p / peak / 2,) * 2 for p in profile]
    return _to_frame(*_edges(centre, halves))


def _splinter(origin, angle, start, length, width, bend, steps=9):
    centre = _centerline(origin, angle, start, length, bend, steps)
    halves = []
    for k, (_, _, t) in enumerate(centre):
        half = width * (1 - t) / 2
        jag = 0.35 if k % 2 else -0.35  # stronger zigzags read as lightning, not shards
        halves.append((half * (1 + jag), half * (1 - jag)))
    return _to_frame(*_edges(centre, halves))


def _to_frame(left, right):
    return ([(x / CARD_ASPECT, y) for x, y in left], [(x / CARD_ASPECT, y) for x, y in right])


def _assign_colors(shards, palette, rng):
    colors = [c for c, _ in palette]
    weights = [w for _, w in palette]
    ordered = sorted(shards, key=lambda s: s.meta['angle'] % (2 * math.pi))
    previous = None
    for shard in ordered:
        choice = rng.choices(colors, weights)[0]
        if choice == previous and len(colors) > 1:
            choice = rng.choices([c for c in colors if c != previous],
                                 [w for c, w in palette if c != previous])[0]
        shard.color = choice
        previous = choice


def generate_speed_lines(seed=0, count=48, center=None, inner=(0.12, 0.3), width=(0.002, 0.006)):
    """Concentration lines (spec rule 12): thin needles radiating from `center` past the frame edge.

    Returned as Shard strips (layer 'back', kind 'line', colour left empty for the caller), widest
    at the outer end so they read as streaks rushing toward the viewer.
    """
    if count < 1:
        raise ValueError('count must be at least 1')
    rng = random.Random(seed)
    cu, cv = center if center is not None else hero_center('mega')
    origin = (cu * CARD_ASPECT, cv)
    lines = []
    for i in range(count):
        angle = (i + rng.uniform(-0.45, 0.45)) * 2 * math.pi / count
        start = rng.uniform(*inner)
        end = 1.6  # past every frame corner from any centre inside the card
        half = rng.uniform(*width) / 2
        ca, sa = math.cos(angle), math.sin(angle)
        nx, ny = -sa, ca
        base = (origin[0] + start * ca, origin[1] + start * sa)
        tip = (origin[0] + end * ca, origin[1] + end * sa)
        left = [base, (tip[0] + nx * half, tip[1] + ny * half)]
        right = [base, (tip[0] - nx * half, tip[1] - ny * half)]
        left, right = _to_frame(left, right)
        lines.append(Shard(left, right, '', 'back', 'line', {'angle': angle, 'start': start, 'width': half * 2}))
    return lines
