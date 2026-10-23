"""Sculpt brushes as pure numpy math on vertex arrays.

Every brush takes world-space positions `co` (N, 3), returns new positions, and leaves vertices
outside `radius` untouched. sculpt.py wraps these for Blender meshes; keeping the math here lets it
be tested without Blender.
"""

import numpy as np


def falloff(dist, radius):
    """Smooth brush weight: 1 at the centre, 0 at `radius` and beyond, zero slope at both ends."""
    if radius <= 0:
        raise ValueError('radius must be positive')
    t = np.clip(np.asarray(dist, dtype=np.float64) / radius, 0.0, 1.0)
    return (1.0 - t * t) ** 2


def weights(co, center, radius):
    return falloff(np.linalg.norm(co - np.asarray(center, dtype=np.float64), axis=1), radius)


def grab(co, center, radius, offset, strength=1.0):
    w = weights(co, center, radius) * strength
    return co + w[:, None] * np.asarray(offset, dtype=np.float64)


def inflate(co, normals, center, radius, amount):
    """Push along vertex normals; a negative amount deflates."""
    w = weights(co, center, radius) * amount
    return co + w[:, None] * normals


def smooth(co, edges, center, radius, strength=0.5, iterations=1):
    """Laplacian smoothing toward the average of each vertex's edge neighbours."""
    if len(edges) == 0:
        return co.copy()
    w = weights(co, center, radius) * np.clip(strength, 0.0, 1.0)
    a, b = edges[:, 0], edges[:, 1]
    counts = np.bincount(np.concatenate([a, b]), minlength=len(co)).astype(np.float64)
    has_neighbours = counts > 0
    out = co.copy()
    for _ in range(max(1, int(iterations))):
        sums = np.zeros_like(out)
        np.add.at(sums, a, out[b])
        np.add.at(sums, b, out[a])
        avg = out.copy()
        avg[has_neighbours] = sums[has_neighbours] / counts[has_neighbours, None]
        out = out + w[:, None] * (avg - out)
    return out


def _area_plane(co, normals, w):
    total = w.sum()
    if total <= 0:
        return None, None
    centroid = (co * w[:, None]).sum(0) / total
    n = (normals * w[:, None]).sum(0)
    length = np.linalg.norm(n)
    if length == 0:
        return None, None
    return centroid, n / length


def flatten(co, normals, center, radius, strength=0.5):
    """Pull vertices toward the weighted average plane under the brush."""
    w = weights(co, center, radius)
    centroid, n = _area_plane(co, normals, w)
    if centroid is None:
        return co.copy()
    height = (co - centroid) @ n
    return co - (np.clip(strength, 0.0, 1.0) * w * height)[:, None] * n


def pinch(co, normals, center, radius, strength=0.3):
    """Pull vertices toward the brush centre within the surface plane (sharpens forms)."""
    w = weights(co, center, radius)
    _, n = _area_plane(co, normals, w)
    if n is None:
        return co.copy()
    to_center = np.asarray(center, dtype=np.float64) - co
    tangential = to_center - (to_center @ n)[:, None] * n
    return co + (np.clip(strength, 0.0, 1.0) * w)[:, None] * tangential


def crease(co, normals, center, radius, strength=0.3, depth=0.02):
    """Pinch plus a dent along the normal: a groove (positive depth) or a ridge (negative)."""
    pinched = pinch(co, normals, center, radius, strength)
    return inflate(pinched, normals, center, radius, -depth)


def stroke_points(points, spacing):
    """Resample a polyline into evenly spaced brush dabs, keeping both ends."""
    pts = np.asarray(points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] != 3 or len(pts) == 0:
        raise ValueError('points must be a non-empty list of (x, y, z)')
    if spacing <= 0:
        raise ValueError('spacing must be positive')
    if len(pts) == 1:
        return pts.copy()
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    dist = np.concatenate([[0.0], np.cumsum(seg)])
    total = dist[-1]
    if total == 0:
        return pts[:1].copy()
    samples = np.linspace(0.0, total, max(2, int(np.ceil(total / spacing)) + 1))
    return np.stack([np.interp(samples, dist, pts[:, k]) for k in range(3)], axis=1)
