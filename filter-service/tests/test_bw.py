"""Black-and-white filter endpoints (`app/main.py`).

These take only an image and apply a fixed tone curve. We assert the
structural invariants of each look rather than exact pixel values:
output size is preserved, the greyscale looks are R==G==B, and the
warm look keeps the red>=green>=blue channel ordering.
"""
from __future__ import annotations

import base64
import io

import numpy as np
import pytest
from PIL import Image


def _decode(res) -> np.ndarray:
    img = Image.open(io.BytesIO(res.content)).convert("RGB")
    return np.asarray(img)


@pytest.fixture
def gray_png_b64() -> str:
    arr = np.full((6, 9, 3), 128, dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr, mode="RGB").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@pytest.mark.parametrize("route", ["bw_hard", "bw_soft"])
def test_bw_grey_looks_are_neutral(client, gray_png_b64, route):
    res = client.post(f"/filters/{route}", json={"image_base64": gray_png_b64})
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    out = _decode(res)
    assert out.shape == (6, 9, 3)  # size preserved
    # Greyscale: all three channels equal.
    assert np.array_equal(out[:, :, 0], out[:, :, 1])
    assert np.array_equal(out[:, :, 1], out[:, :, 2])


def test_bw_warm_keeps_warm_channel_ordering(client, gray_png_b64):
    res = client.post("/filters/bw_warm", json={"image_base64": gray_png_b64})
    assert res.status_code == 200
    out = _decode(res).astype(int)
    # Warm tint lifts red, holds green, pulls blue down -> R>=G>=B per pixel.
    assert (out[:, :, 0] >= out[:, :, 1]).all()
    assert (out[:, :, 1] >= out[:, :, 2]).all()
    # And it is genuinely tinted, not neutral grey.
    assert not np.array_equal(out[:, :, 0], out[:, :, 2])


def test_bw_profile_header_present(client, png_b64):
    res = client.post("/filters/bw_soft", json={"image_base64": png_b64})
    assert res.status_code == 200
    assert "X-Profile-Phases" in res.headers
