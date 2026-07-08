"""
OKLab color conversion + nearest-palette match — server side.

This is the **shared color contract** for trace filters: a cell's mean
colour is converted to OKLab and matched to the nearest palette chip. The
transform is byte-identical to color-lab's `rgb_to_oklab` (the tool that
computed the `lab_munsell` / `lab_grays` OKLab columns in the DB), so a
cell's OKLab lives in the same space as the chips it is matched against.
Transform per Björn Ottosson (2020); color-lab validates the matrices
against `colour.XYZ_to_Oklab`.

A `lib/color/oklab.ts` mirror runs in the client preview; an algorithm
parity test keeps the two in lockstep.
"""
from __future__ import annotations

import numpy as np

# Forward matrices (Ottosson). Inverses are not needed server-side (we only
# go RGB → OKLab). Kept byte-identical to color-lab/build_palette.py.
_OKLAB_M1 = np.array(
    [
        [0.4122214708, 0.5363325363, 0.0514459929],
        [0.2119034982, 0.6806995451, 0.1073969566],
        [0.0883024619, 0.2817188376, 0.6299787005],
    ]
)
_OKLAB_M2 = np.array(
    [
        [0.2104542553, 0.7936177850, -0.0040720468],
        [1.9779984951, -2.4285922050, 0.4505937099],
        [0.0259040371, 0.7827717662, -0.8086757660],
    ]
)


def _srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((np.maximum(c, 0.0) + 0.055) / 1.055) ** 2.4)


def rgb_to_oklab(rgb01: np.ndarray) -> np.ndarray:
    """sRGB (gamma-encoded, 0..1, shape (..., 3)) → OKLab (..., 3)."""
    lin = _srgb_to_linear(np.asarray(rgb01, dtype=np.float64))
    # NumPy's SIMD matmul path spuriously reports a stale FP-error flag on
    # large operands ("divide by zero in matmul" — impossible, matmul only
    # multiply-adds). Inputs here are finite and in-gamut, so the warnings are
    # pure noise that spams Cloud Run's stderr. Silencing them leaves the
    # output bit-identical (OKLab parity with the TS mirror is unaffected).
    with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
        lms_ = np.cbrt(lin @ _OKLAB_M1.T)
        return lms_ @ _OKLAB_M2.T


def rgb255_to_oklab(rgb255: np.ndarray) -> np.ndarray:
    """sRGB uint8 (0..255, shape (..., 3)) → OKLab (..., 3)."""
    return rgb_to_oklab(np.asarray(rgb255, dtype=np.float64) / 255.0)


def adjust_oklab(
    oklab: np.ndarray,
    hue_deg: float = 0.0,
    lightness_delta: float = 0.0,
    chroma_scale: float = 1.0,
) -> np.ndarray:
    """Apply an OKLCh adjustment to OKLab colours: rotate hue by `hue_deg`,
    scale chroma by `chroma_scale`, shift lightness by `lightness_delta`
    (L clamped to [0, 1]). Shape (..., 3) → (..., 3). Mirror of
    `lib/color/oklab.ts::adjustOklab`.

    Used by Circulate's inner ellipse: the cell mean is adjusted by the chosen
    sub colour filter, then snapped back to the nearest palette chip
    (`nearest_palette_indices`) so the result never leaves the palette. The
    identity adjustment `(0, 0, 1)` collapses the inner colour to the same chip
    as the outer cell.
    """
    lab = np.asarray(oklab, dtype=np.float64)
    a = lab[..., 1]
    b = lab[..., 2]
    chroma = np.hypot(a, b) * chroma_scale
    hue = np.arctan2(b, a) + np.radians(hue_deg)
    out = np.empty_like(lab)
    out[..., 0] = np.clip(lab[..., 0] + lightness_delta, 0.0, 1.0)
    out[..., 1] = chroma * np.cos(hue)
    out[..., 2] = chroma * np.sin(hue)
    return out


def nearest_palette_indices(cell_oklab: np.ndarray, palette_oklab: np.ndarray) -> np.ndarray:
    """For each cell OKLab (N, 3), the index of the nearest palette chip
    (M, 3) by squared euclidean OKLab distance. Returns (N,) int indices.

    Plain numpy broadcasting — no scipy/cKDTree dependency. M ≤ 128 and N is
    the cell count, so the (N, M) distance matrix is small and fast.
    """
    cells = np.asarray(cell_oklab, dtype=np.float64).reshape(-1, 3)
    palette = np.asarray(palette_oklab, dtype=np.float64).reshape(-1, 3)
    # (N, 1, 3) - (1, M, 3) → (N, M, 3) → sum sq over axis 2 → (N, M)
    d2 = ((cells[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
    return d2.argmin(axis=1)
