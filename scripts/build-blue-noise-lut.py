"""
Void-and-Cluster (Ulichney 1993) blue-noise threshold LUT generator.

The texture filter (`filter-service/app/cell_texture.py` and the TS mirror
`lib/editor/trace/cell-texture.ts`) needs a 256×256 byte threshold table to
decide, per cell coordinate, whether to replace a deep-interior cell with a
neighbor-cluster colour. Blue-noise distributes the thresholds so the
resulting "tupfer" pattern looks organically scattered, not banded or
clustered (unlike a plain RNG or a Bayer matrix).

Run once, commit the output. The script writes the same 64 KB binary to:
  - `public/assets/blue-noise-256.bin`             (served to the browser)
  - `filter-service/app/data/blue_noise_256.bin`   (loaded by the Python
                                                    service at import time)

Determinism: fixed seed + fixed algorithm + fixed numpy version → byte-stable.
The script prints the SHA256 of the LUT; regenerating must reproduce the
same digest. The TS + Python texture tests assert byte-parity against the
committed file, so any silent drift in the LUT would fail the parity test.

Cost: ~30 s on a recent machine (a 256² × 256² inner-loop, vectorised). The
binary is committed so deploys never run the script — re-run only when the
algorithm or parameters intentionally change.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np

SIZE = 256
# Standard Ulichney sigma for void-and-cluster. Larger sigma → smoother
# low-frequency suppression, more "blueness"; smaller → spikier.
SIGMA = 1.9
# Initial 1-pixel density (Ulichney suggests ~10%). Higher counts converge
# faster but produce slightly less random initial patterns.
INITIAL_FRACTION = 0.1
# Deterministic seed for the initial pattern. Pick once, keep.
SEED = 1729


def gaussian_kernel(sigma: float) -> np.ndarray:
    """Symmetric 2D gaussian, half-width = round(3·sigma) so the tails are
    truncated at ~exp(-4.5) ≈ 1 %. Not normalised — only RELATIVE energy
    matters for find-the-tightest-cluster."""
    half = max(1, int(round(sigma * 3)))
    y, x = np.mgrid[-half : half + 1, -half : half + 1]
    k = np.exp(-(x * x + y * y) / (2.0 * sigma * sigma))
    return k.astype(np.float64)


def add_energy(
    energy: np.ndarray, kernel: np.ndarray, cy: int, cx: int, sign: float
) -> None:
    """Add `sign · kernel` to `energy` centred at (cy, cx) with toroidal
    wrap. In-place — caller relies on the running energy field staying
    consistent with the current binary pattern."""
    H, W = energy.shape
    kh, kw = kernel.shape
    half_h = kh // 2
    half_w = kw // 2
    ys = (cy - half_h + np.arange(kh)) % H
    xs = (cx - half_w + np.arange(kw)) % W
    energy[np.ix_(ys, xs)] += sign * kernel


def find_tightest_cluster(
    energy: np.ndarray, pattern: np.ndarray
) -> tuple[int, int]:
    """Index of the 1-pixel with the HIGHEST energy (= densest cluster of
    nearby 1s). `np.argmax` returns the FIRST maximum on ties — the TS
    mirror does the same scan order for deterministic parity."""
    masked = np.where(pattern == 1, energy, -np.inf)
    idx = int(np.argmax(masked))
    return idx // energy.shape[1], idx % energy.shape[1]


def find_largest_void(
    energy: np.ndarray, pattern: np.ndarray
) -> tuple[int, int]:
    """Index of the 0-pixel with the LOWEST energy (= largest gap). First
    minimum on ties (same rule as argmax)."""
    masked = np.where(pattern == 0, energy, np.inf)
    idx = int(np.argmin(masked))
    return idx // energy.shape[1], idx % energy.shape[1]


def converge_initial(
    pattern: np.ndarray, energy: np.ndarray, kernel: np.ndarray
) -> None:
    """Swap-loop: repeatedly remove the tightest cluster and place a new
    point in the largest void, until a swap would move the point onto the
    same cell (the pattern is locally stationary). In-place on both
    arrays."""
    while True:
        cy, cx = find_tightest_cluster(energy, pattern)
        pattern[cy, cx] = 0
        add_energy(energy, kernel, cy, cx, -1.0)
        vy, vx = find_largest_void(energy, pattern)
        if vy == cy and vx == cx:
            # No improvement → put it back and stop.
            pattern[cy, cx] = 1
            add_energy(energy, kernel, cy, cx, +1.0)
            return
        pattern[vy, vx] = 1
        add_energy(energy, kernel, vy, vx, +1.0)


def build_blue_noise(size: int, sigma: float, seed: int) -> np.ndarray:
    """Generate a `size × size` uint8 blue-noise threshold matrix. Returned
    values cover the full 0..255 range exactly once each (give or take the
    floor-div mapping rank → threshold), so using
    `threshold[cy mod size, cx mod size] / 255 < strength` produces a
    blue-noise mask whose density tracks `strength` linearly.
    """
    N = size * size
    initial_count = max(int(round(N * INITIAL_FRACTION)), 1)

    rng = np.random.RandomState(seed)
    pattern = np.zeros((size, size), dtype=np.int32)
    flat = rng.permutation(N)[:initial_count]
    ys, xs = flat // size, flat % size
    pattern[ys, xs] = 1

    kernel = gaussian_kernel(sigma)

    # Initial energy = sum of kernels centered at each 1-pixel. Computed
    # incrementally so the same code path is used for the convergence loop.
    energy = np.zeros((size, size), dtype=np.float64)
    for y, x in zip(ys, xs):
        add_energy(energy, kernel, int(y), int(x), +1.0)

    print(f"[1/4] converging initial {initial_count} points …", file=sys.stderr)
    converge_initial(pattern, energy, kernel)

    initial_pattern = pattern.copy()
    initial_energy = energy.copy()
    rank = np.full((size, size), -1, dtype=np.int32)

    # Phase I: ranks `initial_count - 1` down to 0. Repeatedly remove the
    # tightest cluster from the converged binary pattern and assign the
    # next-lower rank.
    print(f"[2/4] phase I — ranks {initial_count - 1} .. 0 …", file=sys.stderr)
    pattern = initial_pattern.copy()
    energy = initial_energy.copy()
    for r in range(initial_count - 1, -1, -1):
        cy, cx = find_tightest_cluster(energy, pattern)
        rank[cy, cx] = r
        pattern[cy, cx] = 0
        add_energy(energy, kernel, cy, cx, -1.0)

    # Phase II: ranks `initial_count` .. N/2 - 1. Restart from the converged
    # initial pattern and repeatedly add the largest void.
    print(f"[3/4] phase II — ranks {initial_count} .. {N // 2 - 1} …", file=sys.stderr)
    pattern = initial_pattern.copy()
    energy = initial_energy.copy()
    for r in range(initial_count, N // 2):
        vy, vx = find_largest_void(energy, pattern)
        rank[vy, vx] = r
        pattern[vy, vx] = 1
        add_energy(energy, kernel, vy, vx, +1.0)

    # Phase III: ranks N/2 .. N-1. Invert the pattern (now N/2 ones become
    # zeros, and the unranked cells become ones) and continue placing
    # "tightest clusters" — in the inverted view those are the cells with
    # the most unranked neighbours, i.e. the next ones to rank.
    print(f"[4/4] phase III — ranks {N // 2} .. {N - 1} …", file=sys.stderr)
    inverted = 1 - pattern
    energy = np.zeros((size, size), dtype=np.float64)
    ys_inv, xs_inv = np.where(inverted == 1)
    for y, x in zip(ys_inv, xs_inv):
        add_energy(energy, kernel, int(y), int(x), +1.0)
    for r in range(N // 2, N):
        cy, cx = find_tightest_cluster(energy, inverted)
        rank[cy, cx] = r
        inverted[cy, cx] = 0
        add_energy(energy, kernel, cy, cx, -1.0)

    if (rank < 0).any():
        raise RuntimeError("internal error: some ranks were not assigned")

    # Rank (0..N-1) → threshold (0..255). With N = 65536, this is rank // 256,
    # so each threshold value covers exactly 256 ranks.
    threshold = (rank * 256 // N).astype(np.uint8)
    return threshold


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    targets = [
        repo_root / "public" / "assets" / "blue-noise-256.bin",
        repo_root / "filter-service" / "app" / "data" / "blue_noise_256.bin",
    ]

    lut = build_blue_noise(SIZE, SIGMA, SEED)
    if lut.shape != (SIZE, SIZE) or lut.dtype != np.uint8:
        raise RuntimeError(f"unexpected LUT shape/dtype: {lut.shape} {lut.dtype}")

    digest = hashlib.sha256(lut.tobytes()).hexdigest()
    print(f"SHA256: {digest}", file=sys.stderr)

    for p in targets:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(lut.tobytes())
        size = p.stat().st_size
        print(f"wrote {p.relative_to(repo_root)} ({size} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
