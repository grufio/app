"""
OKLab parity test (server side). The SAME reference vectors are asserted in
the client mirror `lib/color/oklab.test.ts` — if client and server diverge,
one side fails here. Expected OKLab values are Ottosson reference values,
inherited from color-lab's `colour`-validated transform.
"""
import numpy as np

from app.oklab import nearest_palette_indices, rgb255_to_oklab, rotate_hue

# (rgb255, expected OKLab) — identical to lib/color/oklab.test.ts PROBES.
PROBES = [
    ([255, 255, 255], [1.0, 0.0, 0.0]),
    ([0, 0, 0], [0.0, 0.0, 0.0]),
    ([255, 0, 0], [0.627955, 0.224863, 0.125846]),
    ([0, 255, 0], [0.86644, -0.233888, 0.179498]),
    ([0, 0, 255], [0.452014, -0.032457, -0.311528]),
    ([128, 128, 128], [0.599871, 0.0, 0.0]),
    ([100, 150, 200], [0.657972, -0.032513, -0.086445]),
]

CHIP_RGB = [[0, 0, 0], [255, 255, 255], [200, 0, 0], [0, 120, 0], [40, 40, 200]]
EXPECTED_NEAREST = [1, 0, 2, 1, 4, 3, 3]


def test_oklab_reference_vectors():
    for rgb, expected in PROBES:
        got = rgb255_to_oklab(np.array(rgb))
        np.testing.assert_allclose(got, expected, atol=1e-5)


def test_black_exact_white_within_epsilon():
    np.testing.assert_allclose(rgb255_to_oklab(np.array([0, 0, 0])), [0.0, 0.0, 0.0], atol=1e-12)
    np.testing.assert_allclose(rgb255_to_oklab(np.array([255, 255, 255])), [1.0, 0.0, 0.0], atol=1e-6)


def test_nearest_palette_indices_match_client():
    palette = rgb255_to_oklab(np.array(CHIP_RGB))
    probes = rgb255_to_oklab(np.array([p[0] for p in PROBES]))
    got = nearest_palette_indices(probes, palette)
    assert list(map(int, got)) == EXPECTED_NEAREST


def test_rotate_hue_zero_is_identity():
    lab = rgb255_to_oklab(np.array([[200, 30, 40], [10, 180, 90], [50, 60, 220]]))
    np.testing.assert_allclose(rotate_hue(lab, 0.0), lab, atol=1e-12)


def test_rotate_hue_preserves_lightness_and_chroma():
    lab = rgb255_to_oklab(np.array([200, 30, 40], dtype=float))
    rotated = rotate_hue(lab, 73.0)
    # L unchanged; chroma = hypot(a, b) preserved; hue advanced.
    assert abs(rotated[0] - lab[0]) < 1e-12
    chroma_in = np.hypot(lab[1], lab[2])
    chroma_out = np.hypot(rotated[1], rotated[2])
    np.testing.assert_allclose(chroma_out, chroma_in, atol=1e-12)
    hue_in = np.degrees(np.arctan2(lab[2], lab[1]))
    hue_out = np.degrees(np.arctan2(rotated[2], rotated[1]))
    assert abs(((hue_out - hue_in + 180) % 360) - 180 - 73.0) < 1e-6


def test_rotate_hue_360_is_identity():
    lab = rgb255_to_oklab(np.array([130, 90, 200], dtype=float))
    np.testing.assert_allclose(rotate_hue(lab, 360.0), lab, atol=1e-9)
