"""Tests for the parts that run without Blender: python3 -m unittest discover tools/blender-card-art/tests"""

import math
import os
import sys
import unittest

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from cardart import brushmath, spec  # noqa: E402
from cardart.shardmath import generate_shards, generate_speed_lines  # noqa: E402


def grid(n=21, size=1.0):
    xs = np.linspace(-size, size, n)
    xx, yy = np.meshgrid(xs, xs)
    co = np.stack([xx.ravel(), yy.ravel(), np.zeros(n * n)], axis=1)
    normals = np.tile([0.0, 0.0, 1.0], (n * n, 1))
    idx = np.arange(n * n).reshape(n, n)
    edges = np.concatenate([np.stack([idx[:, :-1].ravel(), idx[:, 1:].ravel()], 1),
                            np.stack([idx[:-1, :].ravel(), idx[1:, :].ravel()], 1)])
    return co, normals, edges


class SpecTest(unittest.TestCase):
    def test_hero_zone_per_subline(self):
        self.assertEqual(spec.hero_zone('mega'), (0.037, 0.14, 0.963, 0.475))
        self.assertEqual(spec.hero_zone('tera')[1], 0.164)
        self.assertEqual(spec.hero_zone('standard', 'stage')[1], 0.115)
        self.assertEqual(spec.hero_zone('standard')[1], 0.08)

    def test_bad_subline_and_type_raise(self):
        with self.assertRaises(ValueError):
            spec.hero_zone('vmax')
        with self.assertRaises(ValueError):
            spec.type_colors('Fairy')

    def test_tone_ranges_are_ordered_and_match_spec_table(self):
        for subline, metrics in spec.TONE_RANGES.items():
            for name, (low, median, high) in metrics.items():
                self.assertLessEqual(low, median, f'{subline}.{name}')
                self.assertLessEqual(median, high, f'{subline}.{name}')
        self.assertEqual(spec.TONE_RANGES['mega']['colorful'], (81, 104, 125))
        self.assertEqual(spec.TONE_RANGES['tera']['val'], (0.67, 0.79, 0.84))

    def test_colour_conversion(self):
        self.assertEqual(spec.hex_to_srgb('#FF0000'), (1.0, 0.0, 0.0))
        self.assertAlmostEqual(spec.hex_to_linear('#808080')[0], 0.2158605, places=5)
        with self.assertRaises(ValueError):
            spec.hex_to_srgb('#FFF')


class BrushMathTest(unittest.TestCase):
    def test_falloff_shape(self):
        self.assertEqual(brushmath.falloff(0.0, 1.0), 1.0)
        self.assertEqual(brushmath.falloff(1.0, 1.0), 0.0)
        self.assertEqual(brushmath.falloff(2.0, 1.0), 0.0)
        samples = brushmath.falloff(np.linspace(0, 1, 11), 1.0)
        self.assertTrue(np.all(np.diff(samples) <= 0))
        with self.assertRaises(ValueError):
            brushmath.falloff(0.5, 0.0)

    def test_grab_moves_centre_fully_and_leaves_outside_alone(self):
        co, _, _ = grid()
        out = brushmath.grab(co, (0, 0, 0), 0.5, (0, 0, 0.2))
        centre = np.argmin(np.linalg.norm(co, axis=1))
        self.assertAlmostEqual(out[centre, 2], 0.2)
        outside = np.linalg.norm(co, axis=1) >= 0.5
        np.testing.assert_array_equal(out[outside], co[outside])

    def test_inflate_follows_normals(self):
        co, normals, _ = grid()
        out = brushmath.inflate(co, normals, (0, 0, 0), 0.5, 0.1)
        np.testing.assert_allclose(out[:, :2], co[:, :2])
        self.assertGreater(out[:, 2].max(), 0.09)

    def test_smooth_reduces_a_spike(self):
        co, _, edges = grid()
        centre = np.argmin(np.linalg.norm(co, axis=1))
        co[centre, 2] = 0.3  # inside the brush radius; weights use 3D distance
        out = brushmath.smooth(co, edges, (0, 0, 0), 0.5, strength=1.0, iterations=3)
        self.assertLess(out[centre, 2], 0.1)

    def test_flatten_pulls_toward_plane(self):
        co, normals, _ = grid()
        co[:, 2] = np.sin(co[:, 0] * 6) * 0.1
        out = brushmath.flatten(co, normals, (0, 0, 0), 0.6, strength=1.0)
        inside = np.linalg.norm(co[:, :2], axis=1) < 0.3
        self.assertLess(np.abs(out[inside, 2] - out[inside, 2].mean()).max(),
                        np.abs(co[inside, 2] - co[inside, 2].mean()).max())

    def test_pinch_moves_toward_centre_in_plane(self):
        co, normals, _ = grid()
        out = brushmath.pinch(co, normals, (0, 0, 0), 0.6, strength=0.5)
        ring = (np.linalg.norm(co, axis=1) > 0.1) & (np.linalg.norm(co, axis=1) < 0.5)
        self.assertTrue(np.all(np.linalg.norm(out[ring], axis=1) < np.linalg.norm(co[ring], axis=1)))
        np.testing.assert_allclose(out[:, 2], 0.0)

    def test_crease_dents_along_normal(self):
        co, normals, _ = grid()
        out = brushmath.crease(co, normals, (0, 0, 0), 0.5, strength=0.3, depth=0.05)
        self.assertLess(out[:, 2].min(), -0.04)

    def test_stroke_points_spacing_and_ends(self):
        dabs = brushmath.stroke_points([(0, 0, 0), (1, 0, 0), (1, 1, 0)], 0.25)
        np.testing.assert_allclose(dabs[0], (0, 0, 0))
        np.testing.assert_allclose(dabs[-1], (1, 1, 0))
        gaps = np.linalg.norm(np.diff(dabs, axis=0), axis=1)
        self.assertLessEqual(gaps.max(), 0.25 + 1e-9)
        with self.assertRaises(ValueError):
            brushmath.stroke_points([], 0.1)


def polygon_area(points):
    pts = np.asarray(points)
    x, y = pts[:, 0] * spec.CARD_ASPECT, pts[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


class ShardMathTest(unittest.TestCase):
    def setUp(self):
        self.shards = generate_shards(seed=7, count=32)

    def test_deterministic_per_seed(self):
        again = generate_shards(seed=7, count=32)
        self.assertEqual([s.outline for s in again], [s.outline for s in self.shards])
        self.assertNotEqual([s.outline for s in generate_shards(seed=8, count=32)],
                            [s.outline for s in self.shards])

    def test_count_palette_and_layers(self):
        self.assertEqual(len(self.shards), 32)
        palette = {c for c, _ in spec.MEGA_SHARD_PALETTE}
        self.assertTrue(all(s.color in palette for s in self.shards))
        self.assertGreaterEqual(len({s.color for s in self.shards}), 4)
        self.assertEqual(sum(s.layer == 'front' for s in self.shards), 9)

    def test_shapes_are_real_polygons(self):
        for shard in self.shards:
            self.assertEqual(len(shard.left), len(shard.right))
            self.assertGreater(polygon_area(shard.outline), 1e-5)

    def test_front_shards_keep_the_face_clear(self):
        cu, cv = spec.hero_center('mega')
        for shard in (s for s in self.shards if s.layer == 'front'):
            pts = np.asarray(shard.outline)
            dist = np.hypot((pts[:, 0] - cu) * spec.CARD_ASPECT, pts[:, 1] - cv)
            self.assertGreaterEqual(dist.min(), 0.22)

    def test_shards_reach_both_bottom_corners(self):
        tips = [s.outline for s in self.shards if s.layer == 'back']
        reach_left = any(u <= 0.05 and v >= 0.95 for o in tips for u, v in o)
        reach_right = any(u >= 0.95 and v >= 0.95 for o in tips for u, v in o)
        self.assertTrue(reach_left and reach_right)

    def test_neighbouring_shards_differ_in_colour(self):
        ordered = sorted(self.shards, key=lambda s: s.meta['angle'] % (2 * math.pi))
        self.assertTrue(all(a.color != b.color for a, b in zip(ordered, ordered[1:])))

    def test_invalid_arguments(self):
        with self.assertRaises(ValueError):
            generate_shards(count=3)
        with self.assertRaises(ValueError):
            generate_shards(front_fraction=1.5)


class SpeedLineTest(unittest.TestCase):
    def test_lines_radiate_past_the_frame_and_stay_thin(self):
        cu, cv = spec.hero_center('mega')
        lines = generate_speed_lines(seed=1, count=40)
        self.assertEqual(len(lines), 40)
        for line in lines:
            (bu, bv), (tu, tv) = line.left[0], line.left[-1]
            self.assertAlmostEqual(bu, line.right[0][0])  # needle base is a single point
            inner = math.hypot((bu - cu) * spec.CARD_ASPECT, bv - cv)
            self.assertTrue(0.12 <= inner <= 0.3)
            self.assertTrue(tu < 0 or tu > 1 or tv < 0 or tv > 1, 'tip must leave the frame')
            self.assertLessEqual(line.meta['width'], 0.006)

    def test_angles_cover_the_full_circle(self):
        angles = sorted(l.meta['angle'] % (2 * math.pi) for l in generate_speed_lines(seed=2, count=48))
        gaps = np.diff(angles + [angles[0] + 2 * math.pi])
        self.assertLess(gaps.max(), 2 * (2 * math.pi / 48))


class QACheckTest(unittest.TestCase):
    def setUp(self):
        try:
            import PIL  # noqa: F401
        except ImportError:
            self.skipTest('Pillow not installed')
        sys.path.insert(0, ROOT)
        import qa_check
        self.qa = qa_check

    def test_grey_card_has_no_saturation_or_hue(self):
        from PIL import Image
        metrics = self.qa.tone_metrics(Image.new('RGB', (600, 838), (128, 128, 128)))
        self.assertEqual(metrics['sat'], 0.0)
        self.assertEqual(metrics['hue_entropy'], 0.0)
        self.assertEqual(metrics['edge'], 0.0)

    def test_grey_card_fails_mega_targets(self):
        from PIL import Image
        rows = self.qa.evaluate(self.qa.tone_metrics(Image.new('RGB', (600, 838), (128, 128, 128))), 'mega')
        failed = {name for name, *_, ok in rows if not ok}
        self.assertIn('sat', failed)
        self.assertIn('colorful', failed)

    def test_aspect_check(self):
        from PIL import Image
        self.assertTrue(self.qa.aspect_ok(Image.new('RGB', (1200, 1676))))
        self.assertFalse(self.qa.aspect_ok(Image.new('RGB', (1000, 1000))))


if __name__ == '__main__':
    unittest.main()
