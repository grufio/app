"""
CIEDE2000 parity test (server side). The SAME 34 reference pairs are
asserted in the client mirror `lib/color/ciede2000.test.ts` — if client
and server diverge, one side fails here.

Reference values from Sharma, Wu, Dalal (2005), Table I:
"The CIEDE2000 Color-Difference Formula: Implementation Notes,
Supplementary Test Data, and Mathematical Observations."

Pairs cover the algorithm's edge cases by design:
  - 1-6   neutral-blue boundary (tests G + Sl behaviour near zero a)
  - 7-15  near-origin hue crossings (tests dhp/Hbarp wrap + Cp_prod_zero)
  - 16    pure red ↔ pure blue (tests Rt rotation around 275°)
  - 17-20 large supra-threshold deltas (tests overall magnitude)
  - 21-24 chroma-only ~1 unit (tests Sc weighting)
  - 25-34 measured industrial samples (tests all terms together)
"""
import numpy as np

from app.ciede2000 import (
    ciede2000,
    nearest_palette_indices_ciede2000,
    rgb255_to_cielab,
)

# (lab1, lab2, expected ΔE00) — Sharma 2005 Table I, all 34 pairs.
SHARMA_PAIRS = [
    ((50.0000, 2.6772, -79.7751), (50.0000, 0.0000, -82.7485), 2.0425),
    ((50.0000, 3.1571, -77.2803), (50.0000, 0.0000, -82.7485), 2.8615),
    ((50.0000, 2.8361, -74.0200), (50.0000, 0.0000, -82.7485), 3.4412),
    ((50.0000, -1.3802, -84.2814), (50.0000, 0.0000, -82.7485), 1.0000),
    ((50.0000, -1.1848, -84.8006), (50.0000, 0.0000, -82.7485), 1.0000),
    ((50.0000, -0.9009, -85.5211), (50.0000, 0.0000, -82.7485), 1.0000),
    ((50.0000, 0.0000, 0.0000), (50.0000, -1.0000, 2.0000), 2.3669),
    ((50.0000, -1.0000, 2.0000), (50.0000, 0.0000, 0.0000), 2.3669),
    ((50.0000, 2.4900, -0.0010), (50.0000, -2.4900, 0.0009), 7.1792),
    ((50.0000, 2.4900, -0.0010), (50.0000, -2.4900, 0.0010), 7.1792),
    ((50.0000, 2.4900, -0.0010), (50.0000, -2.4900, 0.0011), 7.2195),
    ((50.0000, 2.4900, -0.0010), (50.0000, -2.4900, 0.0012), 7.2195),
    ((50.0000, -0.0010, 2.4900), (50.0000, 0.0009, -2.4900), 4.8045),
    ((50.0000, -0.0010, 2.4900), (50.0000, 0.0010, -2.4900), 4.8045),
    ((50.0000, -0.0010, 2.4900), (50.0000, 0.0011, -2.4900), 4.7461),
    ((50.0000, 2.5000, 0.0000), (50.0000, 0.0000, -2.5000), 4.3065),
    ((50.0000, 2.5000, 0.0000), (73.0000, 25.0000, -18.0000), 27.1492),
    ((50.0000, 2.5000, 0.0000), (61.0000, -5.0000, 29.0000), 22.8977),
    ((50.0000, 2.5000, 0.0000), (56.0000, -27.0000, -3.0000), 31.9030),
    ((50.0000, 2.5000, 0.0000), (58.0000, 24.0000, 15.0000), 19.4535),
    ((50.0000, 2.5000, 0.0000), (50.0000, 3.1736, 0.5854), 1.0000),
    ((50.0000, 2.5000, 0.0000), (50.0000, 3.2972, 0.0000), 1.0000),
    ((50.0000, 2.5000, 0.0000), (50.0000, 1.8634, 0.5757), 1.0000),
    ((50.0000, 2.5000, 0.0000), (50.0000, 3.2592, 0.3350), 1.0000),
    ((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387), 1.2644),
    ((63.0109, -31.0961, -5.8663), (62.8187, -29.7946, -4.0864), 1.2630),
    ((61.2901, 3.7196, -5.3901), (61.4292, 2.2480, -4.9620), 1.8731),
    ((35.0831, -44.1164, 3.7933), (35.0232, -40.0716, 1.5901), 1.8645),
    ((22.7233, 20.0904, -46.6940), (23.0331, 14.9730, -42.5619), 2.0373),
    ((36.4612, 47.8580, 18.3852), (36.2715, 50.5065, 21.2231), 1.4146),
    ((90.8027, -2.0831, 1.4410), (91.1528, -1.6435, 0.0447), 1.4441),
    ((90.9257, -0.5406, -0.9208), (88.6381, -0.8985, -0.7239), 1.5381),
    ((6.7747, -0.2908, -2.4247), (5.8714, -0.0985, -2.2286), 0.6377),
    ((2.0776, 0.0795, -1.1350), (0.9033, -0.0636, -0.5514), 0.9082),
]


def test_ciede2000_sharma_reference_pairs():
    """All 34 Sharma 2005 reference pairs match to 4 decimals."""
    for i, (lab1, lab2, expected) in enumerate(SHARMA_PAIRS, start=1):
        got = float(ciede2000(np.array(lab1), np.array(lab2)))
        assert abs(got - expected) < 1e-4, f"pair {i}: got {got}, expected {expected}"


def test_ciede2000_is_symmetric():
    """ΔE00(a, b) == ΔE00(b, a) for every Sharma pair."""
    for lab1, lab2, _ in SHARMA_PAIRS:
        d12 = float(ciede2000(np.array(lab1), np.array(lab2)))
        d21 = float(ciede2000(np.array(lab2), np.array(lab1)))
        assert abs(d12 - d21) < 1e-10


def test_ciede2000_zero_for_identical_colors():
    """ΔE00(c, c) == 0 for a variety of colours including the edge cases
    Sharma's Table I exercises (a/b≈0, neutral, vivid)."""
    for lab1, _, _ in SHARMA_PAIRS:
        assert float(ciede2000(np.array(lab1), np.array(lab1))) < 1e-10


def test_ciede2000_broadcasts_over_batch_axis():
    """Batched call over (N, 3) returns elementwise distances == per-pair calls."""
    labs1 = np.array([p[0] for p in SHARMA_PAIRS])
    labs2 = np.array([p[1] for p in SHARMA_PAIRS])
    expected = np.array([p[2] for p in SHARMA_PAIRS])
    got = ciede2000(labs1, labs2)
    np.testing.assert_allclose(got, expected, atol=1e-4)


# sRGB → CIE Lab D65 reference values. The sRGB matrix (Lindbloom) +
# D65 reference white (0.95047, 1.0, 1.08883) are pinned in
# `app/ciede2000.py`. These same vectors are asserted in
# `lib/color/ciede2000.test.ts` to byte-equivalent precision so the
# TS mirror cannot drift.
CIELAB_PROBES = [
    ([255, 255, 255], [100.0000, 0.0000, 0.0000]),  # white
    ([0, 0, 0], [0.0, 0.0, 0.0]),  # black (exact)
    ([255, 0, 0], [53.2408, 80.0925, 67.2032]),  # pure red
    ([0, 255, 0], [87.7347, -86.1827, 83.1793]),  # pure green
    ([0, 0, 255], [32.2970, 79.1875, -107.8602]),  # pure blue
    ([128, 128, 128], [53.5850, 0.0000, 0.0000]),  # mid gray (a = b = 0)
    ([100, 150, 200], [60.5072, -2.7871, -30.9306]),  # arbitrary mid colour
]


def test_rgb255_to_cielab_reference_vectors():
    """sRGB → CIE Lab D65 transform matches the shared reference values to 3 decimals."""
    for rgb, expected in CIELAB_PROBES:
        got = rgb255_to_cielab(np.array(rgb))
        np.testing.assert_allclose(got, expected, atol=1e-3)


def test_rgb255_to_cielab_black_white_exact():
    """Black → [0,0,0] exactly; white → L ≈ 100 within float epsilon."""
    np.testing.assert_allclose(
        rgb255_to_cielab(np.array([0, 0, 0])), [0.0, 0.0, 0.0], atol=1e-12
    )
    w = rgb255_to_cielab(np.array([255, 255, 255]))
    assert abs(w[0] - 100.0) < 1e-4  # L (float-cbrt residual)
    assert abs(w[1]) < 1e-4  # a
    assert abs(w[2]) < 1e-4  # b


def test_nearest_palette_indices_ciede2000_matches_per_pair_argmin():
    """Broadcast variant returns the same index per probe as a per-pair
    `ciede2000` call followed by `argmin`. The actual indices depend on
    CIEDE2000's perceptual weighting (which differs from naive Lab
    Euclidean — notably the L-axis weighting that makes white the
    nearest chip for bright pure green over a low-L green-chip), so the
    contract is "broadcast == per-pair" rather than a hard-coded list.
    """
    palette = rgb255_to_cielab(
        np.array([[0, 0, 0], [255, 255, 255], [200, 0, 0], [0, 120, 0], [40, 40, 200]])
    )
    probes = rgb255_to_cielab(np.array([p[0] for p in CIELAB_PROBES]))
    broadcast = nearest_palette_indices_ciede2000(probes, palette)
    per_pair = np.array(
        [int(np.argmin([float(ciede2000(p, c)) for c in palette])) for p in probes]
    )
    np.testing.assert_array_equal(broadcast, per_pair)
