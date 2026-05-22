"""Lineart endpoint smoke test (`app/main.py` -> `app/lineart.py`).

Deep geometry of the vtracer pipeline is out of scope here; this guards
the happy path end-to-end so a broken pipeline (import error, vtracer
contract change) is caught before the Cloud Run deploy.
"""
from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image


def _noise_png_b64(w: int = 24, h: int = 24) -> str:
    arr = np.random.default_rng(0).integers(0, 255, (h, w, 3), dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr, mode="RGB").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_lineart_happy_path_returns_svg(client):
    res = client.post(
        "/filters/lineart",
        json={
            "image_base64": _noise_png_b64(),
            "line_thickness": 1.0,
            "blur_amount": 3,
            "smoothness": 0.6,
            "num_colors": 8,
        },
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/svg+xml"
    assert "X-Region-Count" in res.headers
    assert res.text.lstrip().startswith("<?xml")
    assert "<svg" in res.text
