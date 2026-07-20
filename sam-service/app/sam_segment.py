"""
SAM2 "segment everything" → cleaned OBJECT PARTITION (one int label per pixel).

This is the exact segmentation + mask-cleanup that the color-lab prototype
validated (dense AMG grid, lower filter thresholds, drop box/tiny/rectangle/
duplicate masks, uncovered → background CCs). It is the ONLY GPU step; the
paint-by-numbers colouring (linerate) stays on the CPU filter-service and reads
the partition this returns.
"""
from __future__ import annotations
import numpy as np
import cv2
import torch
from ultralytics import SAM
from ultralytics.models.sam.predict import SAM2Predictor

# ---- AMG tuning: dense grid + less aggressive filtering (validated in the lab) ----
POINTS_STRIDE = 32
_orig_generate = SAM2Predictor.generate
def _patched_generate(self, im, *a, **k):
    k.setdefault("points_stride", POINTS_STRIDE)
    k.setdefault("crop_n_layers", 0)
    k.setdefault("conf_thres", 0.70)
    k.setdefault("stability_score_thresh", 0.88)
    return _orig_generate(self, im, *a, **k)
SAM2Predictor.generate = _patched_generate

MODEL_PATH = "sam2_l.pt"          # SAM2 hiera-large (L4 has ample headroom)


def load_model():
    model = SAM(MODEL_PATH)
    return model


def device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def segment_partition(model, img, work_edge: int = 1024):
    """img: PIL RGB. → (partition uint16 [hh,ww], n_objects, (ww, hh)).
    partition = 0..N object ids covering every pixel (no holes)."""
    W0, H0 = img.size
    sc = min(1.0, work_edge / max(W0, H0))
    ww, hh = round(W0 * sc), round(H0 * sc)
    work = np.asarray(img.resize((ww, hh)))                       # RGB
    imgA = hh * ww

    r = model(cv2.cvtColor(work, cv2.COLOR_RGB2BGR), device=device(), verbose=False)
    if r[0].masks is None:
        return np.ones((hh, ww), np.uint16), 0, (ww, hh)

    M = (r[0].masks.data.cpu().numpy() > 0.5)
    conf = r[0].boxes.conf.cpu().numpy() if r[0].boxes is not None else np.ones(len(M))
    M = np.stack([cv2.resize(m.astype(np.uint8), (ww, hh), interpolation=cv2.INTER_NEAREST).astype(bool) for m in M])

    # cleanup: drop tiny / background-box / near-rectangle / low-conf
    keep = []
    for i in range(len(M)):
        a = int(M[i].sum())
        if a < imgA * 0.0008 or a > imgA * 0.55:
            continue
        ys, xs = np.where(M[i])
        bb = (ys.max() - ys.min() + 1) * (xs.max() - xs.min() + 1)
        if a / bb > 0.93 or conf[i] < 0.5:
            continue
        keep.append(i)
    # dedupe by IoU
    order = sorted(keep, key=lambda i: -int(M[i].sum()))
    kept = []
    for i in order:
        if all((M[i] & M[j]).sum() / max(1, (M[i] | M[j]).sum()) < 0.85 for j in kept):
            kept.append(i)

    obj = np.zeros((hh, ww), np.int32)
    for k, i in enumerate(kept):
        obj[M[i]] = k + 1
    n_obj = len(kept)
    # uncovered = background → own connected-component objects (no holes)
    unc = (obj == 0).astype(np.uint8)
    if unc.any():
        _, cc = cv2.connectedComponents(unc, connectivity=4)
        obj[obj == 0] = n_obj + cc[obj == 0]
    return obj.astype(np.uint16), n_obj, (ww, hh)
