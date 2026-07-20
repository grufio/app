"""Object-partition constraint for linerate (merge-guard).

The SAM object partition is a purely ADDITIVE geometry constraint: no color facet
may cross an object boundary. It never touches pixels, palette or flatten. These
tests pin the two guarantees that matter:
  1. flag-off / single-object == today's behaviour (byte-identical),
  2. the boundary is actually enforced (no region straddles two objects; a uniform
     area split by the partition is drawn as two regions).
"""
from __future__ import annotations

import numpy as np
from PIL import Image

from app.linerate import (
    linerate_to_svg,
    _facet_merge,
    _labels_from_paint_map_obj,
    _prepare_obj_map,
)
from app.oklab import rgb255_to_oklab


def _mini_palette(rgbs):
    pal_rgb = [list(c) for c in rgbs]
    pal_ok = [list(rgb255_to_oklab(np.array([c], np.uint8))[0]) for c in rgbs]
    return pal_ok, pal_rgb


def _stripes_img(h=48, w=48):
    arr = np.zeros((h, w, 3), np.uint8)
    arr[:, : w // 3] = (200, 60, 60)
    arr[:, w // 3 : 2 * w // 3] = (60, 200, 60)
    arr[:, 2 * w // 3 :] = (60, 60, 200)
    return Image.fromarray(arr, "RGB"), [(200, 60, 60), (60, 200, 60), (60, 60, 200)]


# ---- 1. flag-off / single object is a no-op (byte-identical to today) ------

def test_partition_none_matches_default():
    img, cols = _stripes_img()
    pal_ok, pal_rgb = _mini_palette(cols)
    kw = dict(flatten=0.2, detail=0.5, num_colors=6, min_radius=3.0,
              palette_oklab=pal_ok, palette_rgb=pal_rgb)
    a = linerate_to_svg(img, **kw)
    b = linerate_to_svg(img, partition=None, **kw)
    assert a[0] == b[0] and a[1] == b[1] and a[2] == b[2]


def test_single_object_partition_is_identity():
    # A partition with ONE object (all zeros) must be indistinguishable from no
    # partition: composite == paint, no adjacency dropped, re-CC unchanged.
    img, cols = _stripes_img()
    pal_ok, pal_rgb = _mini_palette(cols)
    kw = dict(flatten=0.2, detail=0.5, num_colors=6, min_radius=3.0,
              palette_oklab=pal_ok, palette_rgb=pal_rgb)
    base = linerate_to_svg(img, **kw)
    one_obj = np.zeros((img.size[1], img.size[0]), np.int32)
    guarded = linerate_to_svg(img, partition=one_obj, **kw)
    assert base[0] == guarded[0], "single-object partition must be byte-identical"


# ---- 2. the boundary is enforced ------------------------------------------

def test_uniform_area_is_split_by_the_partition():
    # A single uniform colour → one region without a partition. Split by a 2-object
    # partition, the boundary must be DRAWN → two regions (same colour, both sides).
    h, w = 40, 40
    img = Image.fromarray(np.full((h, w, 3), (120, 120, 120), np.uint8), "RGB")
    pal_ok, pal_rgb = _mini_palette([(120, 120, 120), (10, 10, 10)])
    kw = dict(flatten=0.1, detail=0.5, num_colors=4, min_radius=2.0,
              palette_oklab=pal_ok, palette_rgb=pal_rgb)
    base_regions = linerate_to_svg(img, **kw)[1]
    part = np.zeros((h, w), np.int32)
    part[:, w // 2 :] = 1                       # left / right objects
    guarded_regions = linerate_to_svg(img, partition=part, **kw)[1]
    assert base_regions == 1, f"uniform image should be one region, got {base_regions}"
    assert guarded_regions == 2, f"partition must split it into two, got {guarded_regions}"


def test_no_region_crosses_an_object_boundary():
    # Core invariant, tested at the merge level: every final region lies within a
    # single object even after merges that, unguarded, would cross the boundary.
    h, w = 32, 32
    # paint map: mostly paint 0, with a thin paint-1 sliver straddling the boundary
    P = np.zeros((h, w), np.int32)
    P[14:18, 10:22] = 1                          # a sliver crossing the mid-line
    obj = np.zeros((h, w), np.int64)
    obj[:, w // 2 :] = 1                          # object boundary at the mid-line
    # two paints, far apart in OKLab so merge distances are meaningful
    sel_ok = np.array(rgb255_to_oklab(np.array([(20, 20, 20), (230, 230, 230)], np.uint8)),
                      np.float64)
    labels, nreg, reg_sel = _facet_merge(
        P, 2, sel_ok, min_area=200.0, min_radius_work=0.0, obj_map=obj,
    )
    # every region must map to exactly one object id
    for r in range(nreg):
        objs = np.unique(obj[labels == r])
        assert objs.size == 1, f"region {r} straddles objects {objs.tolist()}"


# ---- 3. resample: nearest-neighbour, downsample-only, correct axis order ---

def test_prepare_obj_map_downsamples_nearest_and_keeps_shape():
    # A partition at higher resolution than the work grid is NN-downsampled to
    # (hh, ww) exactly — including the non-square (portrait) axis order.
    ww, hh = 24, 40                              # portrait: hh != ww (transpose trap)
    big = np.zeros((hh * 2, ww * 2), np.int32)
    big[:, ww:] = 7                              # sparse, non-contiguous id (7)
    out = _prepare_obj_map(big, ww, hh)
    assert out.shape == (hh, ww), f"expected {(hh, ww)}, got {out.shape}"
    assert set(np.unique(out).tolist()) == {0, 1}, "ids must be densified to 0..n-1"
    assert out[:, : ww // 2].max() == 0 and out[:, ww // 2 :].min() == 1


def test_prepare_obj_map_refuses_to_upsample():
    # Upsampling a label map staircases boundaries at the pixels that matter → forbid.
    small = np.zeros((10, 10), np.int32)
    try:
        _prepare_obj_map(small, 40, 40)
        raised = False
    except ValueError:
        raised = True
    assert raised, "partition smaller than work must raise (no upsampling)"


def test_labels_from_paint_map_obj_splits_same_paint_across_objects():
    # One uniform paint over two objects → two regions (one per object).
    P = np.zeros((10, 10), np.int32)
    obj = np.zeros((10, 10), np.int64)
    obj[:, 5:] = 1
    labels, nreg, reg_paint, reg_obj = _labels_from_paint_map_obj(P, obj, 2)
    assert nreg == 2
    assert set(reg_paint.tolist()) == {0}          # same paint both sides
    assert set(reg_obj.tolist()) == {0, 1}         # different objects
