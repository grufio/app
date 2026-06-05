"""
CIEDE2000 color-difference formula — server side.

Perceptual gold-standard distance between two CIE L*a*b* colours, per
the CIE TC 1-47 recommendation. Implementation follows Sharma, Wu &
Dalal (2005), "The CIEDE2000 Color-Difference Formula: Implementation
Notes, Supplementary Test Data, and Mathematical Observations" — the
same paper supplies the 34-pair reference test vectors used in
`tests/test_ciede2000.py`.

Compared to the OKLab squared-Euclidean distance (`oklab.py`), CIEDE2000
explicitly corrects for two known weaknesses of plain Euclidean Lab
metrics: lightness dominance (the `Sl` term flattens contrast in the
mid-L range) and hue rotation around the blue axis (the `Rt` rotation
term). The cost is ~30 extra operations per pair vs the OKLab
squared-Euclidean snap.

A `lib/color/ciede2000.ts` mirror runs in the client preview; cross-
language parity is asserted by the same 34 reference vectors in both
test files.

This module is purely additive — no caller wires it into the trace
pipeline yet. The downstream PRs (palette restriction + dithering)
choose which distance metric to use; PR-B just provides the math + a
parity-tested broadcast variant.
"""
from __future__ import annotations

import numpy as np

# sRGB → linear sRGB → XYZ (D65 reference white) → CIE Lab.
# Matrices: Bruce Lindbloom (sRGB matrix, D65). Reference white per
# CIE 15:2004: Xn=0.95047, Yn=1.0, Zn=1.08883.
_SRGB_TO_XYZ_D65 = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ]
)
_D65_WHITE = np.array([0.95047, 1.0, 1.08883])

# CIE Lab f(t): t**(1/3) above the linearity break, affine below. The break
# point t0 = (6/29)**3 keeps f continuous and differentiable at the join.
_LAB_T0 = (6.0 / 29.0) ** 3
_LAB_KAPPA = (29.0 / 6.0) ** 2 / 3.0  # = (29/6)^2 / 3 ≈ 7.787, the legacy form


def _srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((np.maximum(c, 0.0) + 0.055) / 1.055) ** 2.4)


def rgb_to_cielab(rgb01: np.ndarray) -> np.ndarray:
    """sRGB (gamma-encoded, 0..1, shape (..., 3)) → CIE Lab D65 (..., 3).

    L in 0..100, a/b unbounded (typically in [-128, 127] for sRGB gamut).
    """
    lin = _srgb_to_linear(np.asarray(rgb01, dtype=np.float64))
    xyz = lin @ _SRGB_TO_XYZ_D65.T
    n = xyz / _D65_WHITE
    f = np.where(n > _LAB_T0, np.cbrt(n), _LAB_KAPPA * n + 4.0 / 29.0)
    out = np.empty_like(f)
    out[..., 0] = 116.0 * f[..., 1] - 16.0
    out[..., 1] = 500.0 * (f[..., 0] - f[..., 1])
    out[..., 2] = 200.0 * (f[..., 1] - f[..., 2])
    return out


def rgb255_to_cielab(rgb255: np.ndarray) -> np.ndarray:
    """sRGB uint8 (0..255, shape (..., 3)) → CIE Lab D65 (..., 3)."""
    return rgb_to_cielab(np.asarray(rgb255, dtype=np.float64) / 255.0)


def ciede2000(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """CIE ΔE00 between two CIE Lab arrays of broadcastable shape (..., 3).

    Returns the elementwise distance array (matching the leading axes after
    broadcast). Parametric factors `kL = kC = kH = 1` (graphic-arts default).

    Symbolic naming follows Sharma 2005:
      - `Cp1`, `Cp2`  : "C prime", the rotated chroma
      - `hp1`, `hp2`  : "h prime", hue in degrees (atan2 result wrapped to [0, 360))
      - `dLp`, `dCp`, `dHp` : the three difference terms
      - `Lbarp`, `Cbarp`, `Hbarp` : per-axis arithmetic means used by the weighting fns
      - `Sl`, `Sc`, `Sh` : L/C/H weighting functions
      - `Rt`           : rotation term that couples dCp and dHp around the blue axis
    """
    a1 = np.asarray(lab1, dtype=np.float64)
    a2 = np.asarray(lab2, dtype=np.float64)
    L1, A1, B1 = a1[..., 0], a1[..., 1], a1[..., 2]
    L2, A2, B2 = a2[..., 0], a2[..., 1], a2[..., 2]

    C1 = np.hypot(A1, B1)
    C2 = np.hypot(A2, B2)
    Cbar = 0.5 * (C1 + C2)
    Cbar7 = Cbar ** 7
    G = 0.5 * (1.0 - np.sqrt(Cbar7 / (Cbar7 + 25.0 ** 7)))

    ap1 = (1.0 + G) * A1
    ap2 = (1.0 + G) * A2
    Cp1 = np.hypot(ap1, B1)
    Cp2 = np.hypot(ap2, B2)

    # Hue in degrees, wrapped to [0, 360). atan2 returns 0 when both args
    # are zero, which matches the Sharma convention (hp undefined → 0).
    hp1 = np.degrees(np.arctan2(B1, ap1)) % 360.0
    hp2 = np.degrees(np.arctan2(B2, ap2)) % 360.0

    dLp = L2 - L1
    dCp = Cp2 - Cp1

    # Hue difference dhp: undefined (= 0) when either chroma is zero;
    # else hp2 - hp1 wrapped to (-180, 180].
    Cp_prod_zero = (Cp1 * Cp2) == 0.0
    dh = hp2 - hp1
    dh = np.where(dh > 180.0, dh - 360.0, dh)
    dh = np.where(dh < -180.0, dh + 360.0, dh)
    dhp = np.where(Cp_prod_zero, 0.0, dh)
    dHp = 2.0 * np.sqrt(Cp1 * Cp2) * np.sin(np.radians(dhp / 2.0))

    Lbarp = 0.5 * (L1 + L2)
    Cbarp = 0.5 * (Cp1 + Cp2)

    # Hue mean Hbarp: when chromata differ by > 180°, average the wrapped
    # value; when one chroma is zero, take the other hue verbatim (the sum
    # equals the meaningful component since the other is 0 by atan2 conv).
    h_sum = hp1 + hp2
    h_diff_abs = np.abs(hp1 - hp2)
    Hbarp_close = h_sum / 2.0
    Hbarp_far = np.where(h_sum < 360.0, (h_sum + 360.0) / 2.0, (h_sum - 360.0) / 2.0)
    Hbarp = np.where(h_diff_abs <= 180.0, Hbarp_close, Hbarp_far)
    Hbarp = np.where(Cp_prod_zero, h_sum, Hbarp)

    T = (
        1.0
        - 0.17 * np.cos(np.radians(Hbarp - 30.0))
        + 0.24 * np.cos(np.radians(2.0 * Hbarp))
        + 0.32 * np.cos(np.radians(3.0 * Hbarp + 6.0))
        - 0.20 * np.cos(np.radians(4.0 * Hbarp - 63.0))
    )

    dTheta = 30.0 * np.exp(-(((Hbarp - 275.0) / 25.0) ** 2))
    Cbarp7 = Cbarp ** 7
    Rc = 2.0 * np.sqrt(Cbarp7 / (Cbarp7 + 25.0 ** 7))

    L_50_sq = (Lbarp - 50.0) ** 2
    Sl = 1.0 + (0.015 * L_50_sq) / np.sqrt(20.0 + L_50_sq)
    Sc = 1.0 + 0.045 * Cbarp
    Sh = 1.0 + 0.015 * Cbarp * T
    Rt = -np.sin(np.radians(2.0 * dTheta)) * Rc

    term_L = dLp / Sl
    term_C = dCp / Sc
    term_H = dHp / Sh
    return np.sqrt(term_L ** 2 + term_C ** 2 + term_H ** 2 + Rt * term_C * term_H)


def nearest_palette_indices_ciede2000(
    cells_lab: np.ndarray, palette_lab: np.ndarray
) -> np.ndarray:
    """For each cell Lab (N, 3), the index of the nearest palette chip
    (M, 3) by CIEDE2000 distance. Returns (N,) int indices.

    Broadcast pattern mirrors `oklab.nearest_palette_indices`: builds an
    (N, M, 3) view, calls `ciede2000` once over the joint axes, then
    `argmin` along the palette axis. M ≤ ~300 chips × N ≤ ~10k cells
    keeps the materialised (N, M) distance matrix well within memory.
    """
    cells = np.asarray(cells_lab, dtype=np.float64).reshape(-1, 3)
    palette = np.asarray(palette_lab, dtype=np.float64).reshape(-1, 3)
    d = ciede2000(cells[:, None, :], palette[None, :, :])
    return d.argmin(axis=1)
