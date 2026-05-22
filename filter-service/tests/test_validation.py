"""Request-validation contract for the filter endpoints.

These bounds live in `app/main.py` (pixelate: lines ~276-281, lineart:
lines ~337-344) and run *before* any image processing, so they need no
real decode path — but we send a valid image so the only thing under
test is the bound check itself.
"""
from __future__ import annotations

import pytest


def _pixelate_body(png: str, **overrides) -> dict:
    body = {
        "image_base64": png,
        "cells_x": 4,
        "cells_y": 4,
        "crop_x": 0.0,
        "crop_y": 0.0,
        "crop_w": 8.0,
        "crop_h": 8.0,
        "stroke_width": 1.0,
        "num_colors": 16,
    }
    body.update(overrides)
    return body


def _lineart_body(png: str, **overrides) -> dict:
    body = {
        "image_base64": png,
        "line_thickness": 1.0,
        "blur_amount": 3,
        "smoothness": 0.6,
        "num_colors": 8,
    }
    body.update(overrides)
    return body


# --- pixelate bounds -----------------------------------------------------


@pytest.mark.parametrize("field,value", [("cells_x", 0), ("cells_y", 0)])
def test_pixelate_rejects_nonpositive_cells(client, make_png_b64, field, value):
    res = client.post("/filters/pixelate", json=_pixelate_body(make_png_b64(), **{field: value}))
    assert res.status_code == 400
    assert "cells_x and cells_y must be >= 1" in res.json()["detail"]


@pytest.mark.parametrize("field", ["crop_w", "crop_h"])
def test_pixelate_rejects_nonpositive_crop(client, make_png_b64, field):
    res = client.post("/filters/pixelate", json=_pixelate_body(make_png_b64(), **{field: 0.0}))
    assert res.status_code == 400
    assert "crop_w and crop_h must be > 0" in res.json()["detail"]


@pytest.mark.parametrize("stroke", [0.0, 0.05, 20.1, 50])
def test_pixelate_rejects_out_of_range_stroke(client, make_png_b64, stroke):
    res = client.post("/filters/pixelate", json=_pixelate_body(make_png_b64(), stroke_width=stroke))
    assert res.status_code == 400
    assert "Stroke width must be between 0.1 and 20" in res.json()["detail"]


def test_pixelate_accepts_valid_bounds(client, make_png_b64):
    res = client.post("/filters/pixelate", json=_pixelate_body(make_png_b64()))
    assert res.status_code == 200


def test_pixelate_malformed_image_is_500(client):
    body = _pixelate_body("not a real base64 image")
    res = client.post("/filters/pixelate", json=body)
    assert res.status_code == 500
    assert "Image processing failed" in res.json()["detail"]


# --- lineart bounds ------------------------------------------------------


@pytest.mark.parametrize("value", [0.0, 0.05, 10.1, 100])
def test_lineart_rejects_out_of_range_thickness(client, make_png_b64, value):
    res = client.post("/filters/lineart", json=_lineart_body(make_png_b64(), line_thickness=value))
    assert res.status_code == 400
    assert "line_thickness must be between 0.1 and 10" in res.json()["detail"]


@pytest.mark.parametrize("value", [-1, 21, 100])
def test_lineart_rejects_out_of_range_blur(client, make_png_b64, value):
    res = client.post("/filters/lineart", json=_lineart_body(make_png_b64(), blur_amount=value))
    assert res.status_code == 400
    assert "blur_amount must be between 0 and 20" in res.json()["detail"]


@pytest.mark.parametrize("value", [-0.1, 1.1, 2])
def test_lineart_rejects_out_of_range_smoothness(client, make_png_b64, value):
    res = client.post("/filters/lineart", json=_lineart_body(make_png_b64(), smoothness=value))
    assert res.status_code == 400
    assert "smoothness must be between 0 and 1" in res.json()["detail"]


@pytest.mark.parametrize("value", [1, 0, 257, 1000])
def test_lineart_rejects_out_of_range_num_colors(client, make_png_b64, value):
    res = client.post("/filters/lineart", json=_lineart_body(make_png_b64(), num_colors=value))
    assert res.status_code == 400
    assert "num_colors must be between 2 and 256" in res.json()["detail"]
