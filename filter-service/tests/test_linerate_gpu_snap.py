"""Gate for the GPU nearest-palette snap (`_nearest_palette_torch`).

The GPU snap runs the per-pixel argmin in float32 (torch) instead of the f64 numpy
snap. That can pick a DIFFERENT chip only where two chips are near-equidistant (a
Voronoi-boundary tie) — the accepted "different but equally good" drift, stacked on
the cuFFT-flatten drift. CI has no CUDA, so we (1) confirm the path stays guarded
off, and (2) pin the f32-vs-f64 tie-sensitivity CUDA-free with a numpy f32 proxy.
The combined flatten+snap region equivalence is an on-device check on the GPU
service, not in CI.
"""
from __future__ import annotations

import numpy as np

from app.linerate import _HAS_CUDA
from app.oklab import nearest_palette_indices, rgb255_to_oklab


def _snap_f32(cell_oklab: np.ndarray, palette_oklab: np.ndarray) -> np.ndarray:
    """CUDA-free proxy for the torch f32 GPU snap's precision class: a numpy
    float32 squared-euclidean argmin (chunked like the shipped f64 snap)."""
    X = np.ascontiguousarray(cell_oklab, np.float32).reshape(-1, 3)
    pal = np.ascontiguousarray(palette_oklab, np.float32).reshape(-1, 3)
    n, m = X.shape[0], pal.shape[0]
    block = max(1, 8_000_000 // max(1, m * 3))
    out = np.empty(n, np.int64)
    for i in range(0, n, block):
        d2 = ((X[i:i + block, None, :] - pal[None, :, :]) ** 2).sum(2)
        out[i:i + block] = d2.argmin(1)
    return out


def test_gpu_snap_guarded_off_in_ci():
    assert _HAS_CUDA is False, "CI/local has no CUDA → the GPU snap path stays off"


def test_f32_snap_drift_is_bounded_to_ties():
    """f32 may disagree with f64 ONLY at near-equidistant pixels — never a gross
    mis-snap. Every flip's two candidate chips must be within a tiny squared-OKLab
    margin for that pixel."""
    rng = np.random.default_rng(0)
    pal_rgb = rng.integers(0, 256, (24, 3), np.uint8)
    pal = np.asarray([rgb255_to_oklab(c[None])[0] for c in pal_rgb], np.float64)
    img = rng.integers(0, 256, (4000, 3), np.uint8)
    X = rgb255_to_oklab(img).astype(np.float64)
    # Add exact chip-pair midpoints → maximal tie-sensitivity (truly equidistant).
    a, b = rng.integers(0, len(pal), 4000), rng.integers(0, len(pal), 4000)
    X_all = np.vstack([X, (pal[a] + pal[b]) / 2.0])

    ref = nearest_palette_indices(X_all, pal)  # f64
    got = _snap_f32(X_all, pal)                # f32 proxy for the GPU snap
    flips = np.where(got != ref)[0]
    for i in flips:
        d_ref = float(((X_all[i] - pal[ref[i]]) ** 2).sum())
        d_got = float(((X_all[i] - pal[got[i]]) ** 2).sum())
        assert abs(d_ref - d_got) < 1e-4, f"flip at pixel {i} is not a tie: {d_ref} vs {d_got}"
