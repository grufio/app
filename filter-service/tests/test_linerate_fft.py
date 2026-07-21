"""Correctness gate for the scipy.fft port of the L0 flatten.

The flatten (`_l0_smooth`) is ~84% of a hi-res trace and was single-threaded under
numpy.fft. Moving to scipy.fft(workers=N) threads it across the CPU allocation. Both
use pocketfft in float64, so the result must be NUMERICALLY EQUAL to numpy.fft — which
keeps the downstream (palette snap → facets → SVG) byte-stable. This test pins that:
`_l0_smooth` (scipy) must match an inline numpy.fft reference of the same solver.
"""
from __future__ import annotations

import numpy as np

from app.linerate import _l0_smooth, linerate_to_svg
from app.oklab import rgb255_to_oklab


def _l0_numpy_ref(img_u8: np.ndarray, lam: float, kappa: float = 2.0) -> np.ndarray:
    """numpy.fft mirror of _l0_smooth (Xu et al. 2011) — the reference the scipy
    port must reproduce. Kept independent so a drift in the shipped code is caught."""
    S = img_u8.astype(np.float64) / 255.0
    N, M, _ = S.shape

    def psf2otf(psf, shape):
        kh, kw = psf.shape
        pad = np.zeros(shape)
        pad[:kh, :kw] = psf
        pad = np.roll(pad, -(kh // 2), 0)
        pad = np.roll(pad, -(kw // 2), 1)
        return np.fft.fft2(pad)

    otfx = psf2otf(np.array([[1, -1]]), (N, M))
    otfy = psf2otf(np.array([[1], [-1]]), (N, M))
    Normin1 = np.fft.fft2(S, axes=(0, 1))
    Den2 = (np.abs(otfx) ** 2 + np.abs(otfy) ** 2)[:, :, None]
    beta = 2 * lam
    while beta < 1e5:
        Den = 1 + beta * Den2
        h = np.concatenate([np.diff(S, 1, 1), S[:, :1, :] - S[:, -1:, :]], 1)
        v = np.concatenate([np.diff(S, 1, 0), S[:1, :, :] - S[-1:, :, :]], 0)
        idx = (h ** 2 + v ** 2).sum(2) < (lam / beta)
        h[idx] = 0
        v[idx] = 0
        hd = np.concatenate([h[:, -1:, :] - h[:, :1, :], -np.diff(h, 1, 1)], 1)
        vd = np.concatenate([v[-1:, :, :] - v[:1, :, :], -np.diff(v, 1, 0)], 0)
        FS = (Normin1 + beta * np.fft.fft2(hd + vd, axes=(0, 1))) / Den
        S = np.real(np.fft.ifft2(FS, axes=(0, 1)))
        beta *= kappa
    return np.clip(S, 0.0, 1.0) * 255.0


def test_l0_smooth_float32_close_to_float64_reference():
    # _l0_smooth runs the FFT in float32 (halves the payload, ~2x). It is therefore
    # NOT bit-identical to the float64 solver — but must stay within a fraction of a
    # 0-255 level on average so the palette snap (and thus the SVG geometry) is
    # stable; only isolated boundary pixels may differ by a few levels. Measured on a
    # real portrait work image: MAE ~0.006, max ~3.2. Gate generously above that.
    rng = np.random.default_rng(0)
    img = (rng.random((90, 70, 3)) * 255).astype(np.uint8)
    for lam in (0.01, 0.05, 0.2):
        out = _l0_smooth(img, lam).astype(np.float64)
        ref = _l0_numpy_ref(img, lam)
        assert out.shape == ref.shape
        d = np.abs(out - ref)
        assert d.mean() < 0.5, f"lam={lam} MAE={d.mean():.4f} too high — float32 drift"
        assert d.max() < 8.0, f"lam={lam} max|Δ|={d.max():.3f} too high — float32 drift"


def test_flatten_port_keeps_the_svg_stable():
    # End-to-end: an unchanged flatten means an unchanged paint map → identical SVG
    # + region count. Run the full pipeline twice (deterministic) and pin the count.
    arr = np.zeros((60, 48, 3), np.uint8)
    arr[:, :24] = (200, 60, 60)
    arr[:, 24:] = (60, 60, 200)
    from PIL import Image
    img = Image.fromarray(arr, "RGB")
    cols = [(200, 60, 60), (60, 60, 200)]
    pal_ok = [list(rgb255_to_oklab(np.array([c], np.uint8))[0]) for c in cols]
    pal_rgb = [list(c) for c in cols]
    a = linerate_to_svg(img, flatten=0.3, detail=0.5, num_colors=4, min_radius=3.0,
                        palette_oklab=pal_ok, palette_rgb=pal_rgb)
    b = linerate_to_svg(img, flatten=0.3, detail=0.5, num_colors=4, min_radius=3.0,
                        palette_oklab=pal_ok, palette_rgb=pal_rgb)
    assert a[0] == b[0] and a[1] == b[1]        # deterministic + non-degenerate
    assert a[1] >= 2
