"""Request-validation contract for the filter endpoints.

These bounds live in `app/main.py` and run *before* any heavy work, so
they exercise the validation path only. Pixelate's wire shape ships a
raw cell grid (`cells_b64`) — the Vercel server has already cropped +
area-averaged the source. Linerate still takes the full `image_base64`.
"""
from __future__ import annotations

import base64

import numpy as np
import pytest


def _make_cells_b64(cells_y: int = 4, cells_x: int = 4, rgb=(10, 120, 240)) -> str:
    """Pack a solid-colour `(cells_y, cells_x, 3)` uint8 grid the way
    the Vercel server's `sharp().raw()` + cellAreaAverages would."""
    arr = np.empty((cells_y, cells_x, 3), dtype=np.uint8)
    arr[:, :] = rgb
    return base64.b64encode(arr.tobytes()).decode("ascii")


def _pixelate_body(**overrides) -> dict:
    body = {
        "cells_b64": _make_cells_b64(),
        "cropped_w_px": 8,
        "cropped_h_px": 8,
        "cells_x": 4,
        "cells_y": 4,
        "num_colors": 16,
    }
    body.update(overrides)
    return body


def _linerate_body(png: str, **overrides) -> dict:
    body = {
        "image_base64": png,
        "line_thickness": 1.0,
        "flatten": 0.25,
        "detail": 0.75,
        "smoothness": 0.6,
        "num_colors": 28,
    }
    body.update(overrides)
    return body


# --- linerate image source: base64 vs signed URL ------------------------


def test_linerate_requires_one_image_source(client, make_png_b64):
    body = _linerate_body(make_png_b64())
    del body["image_base64"]
    res = client.post("/filters/linerate", json=body)
    assert res.status_code == 400
    assert "image_base64 or image_url" in res.json()["detail"]


def test_linerate_image_url_is_byte_identical_to_image_base64(client, make_png_b64, monkeypatch):
    # The bridge stages the input in storage and passes a signed URL; the service
    # downloads the SAME PNG bytes. Same bytes → same pixels → same seed → identical
    # SVG. Monkeypatch the download to return exactly the base64-path bytes and prove
    # the two SVGs are byte-identical.
    png = make_png_b64(64, 48)
    raw = base64.b64decode(png)
    res_b64 = client.post("/filters/linerate", json=_linerate_body(png))
    assert res_b64.status_code == 200, res_b64.text

    monkeypatch.setattr("app.main._download_image_bytes", lambda url: raw)
    body_url = _linerate_body(png)
    del body_url["image_base64"]
    body_url["image_url"] = "https://storage.test/signed-input.png"
    res_url = client.post("/filters/linerate", json=body_url)
    assert res_url.status_code == 200, res_url.text
    assert res_url.json()["svg"] == res_b64.json()["svg"]


def test_linerate_image_url_download_failure_surfaces_status(client, make_png_b64, monkeypatch):
    from fastapi import HTTPException

    def _boom(url):
        raise HTTPException(status_code=504, detail="download timed out")

    monkeypatch.setattr("app.main._download_image_bytes", _boom)
    body = _linerate_body(make_png_b64())
    del body["image_base64"]
    body["image_url"] = "https://storage.test/signed-input.png"
    res = client.post("/filters/linerate", json=body)
    assert res.status_code == 504


def test_download_image_bytes_rejects_non_https_scheme():
    from fastapi import HTTPException
    from app.main import _download_image_bytes

    for bad in ("http://example.test/x.png", "file:///etc/passwd", "ftp://host/x"):
        with pytest.raises(HTTPException) as ei:
            _download_image_bytes(bad)
        assert ei.value.status_code == 400


# --- pixelate bounds -----------------------------------------------------


@pytest.mark.parametrize("field,value", [("cells_x", 0), ("cells_y", 0)])
def test_pixelate_rejects_nonpositive_cells(client, field, value):
    res = client.post("/filters/pixelate", json=_pixelate_body(**{field: value}))
    assert res.status_code == 400
    assert "cells_x and cells_y must be >= 1" in res.json()["detail"]


@pytest.mark.parametrize("field", ["cropped_w_px", "cropped_h_px"])
def test_pixelate_rejects_nonpositive_cropped_pixels(client, field):
    res = client.post("/filters/pixelate", json=_pixelate_body(**{field: 0}))
    assert res.status_code == 400
    assert "cropped_w_px and cropped_h_px must be >= 1" in res.json()["detail"]


def test_pixelate_rejects_missing_required_fields(client):
    # Drop cells_b64 → Pydantic 422 (request schema, not handler bounds).
    body = _pixelate_body()
    del body["cells_b64"]
    res = client.post("/filters/pixelate", json=body)
    assert res.status_code == 422


def test_pixelate_accepts_valid_bounds(client):
    res = client.post("/filters/pixelate", json=_pixelate_body())
    assert res.status_code == 200


def test_pixelate_cells_b64_length_mismatch_is_400(client):
    # cells_b64 packed for 4×4 but cells_x/y claim 5×5 → length mismatch.
    body = _pixelate_body(cells_x=5, cells_y=5)
    res = client.post("/filters/pixelate", json=body)
    assert res.status_code == 400
    assert "cells_b64 length mismatch" in res.json()["detail"]


# --- circulate bounds ----------------------------------------------------


def _circulate_body(**overrides) -> dict:
    body = {
        "cells_b64": _make_cells_b64(),
        "cropped_w_px": 8,
        "cropped_h_px": 8,
        "cells_x": 4,
        "cells_y": 4,
        "outer_w_frac": 1.0,
        "outer_h_frac": 1.0,
        "num_colors": 16,
    }
    body.update(overrides)
    return body


@pytest.mark.parametrize("field,value", [("cells_x", 0), ("cells_y", 0)])
def test_circulate_rejects_nonpositive_cells(client, field, value):
    res = client.post("/filters/circulate", json=_circulate_body(**{field: value}))
    assert res.status_code == 400
    assert "cells_x and cells_y must be >= 1" in res.json()["detail"]


@pytest.mark.parametrize("field,value", [
    ("outer_w_frac", 0.0), ("outer_w_frac", 1.1),
    ("outer_h_frac", 0.0), ("outer_h_frac", 1.1),
])
def test_circulate_rejects_out_of_range_outer_fracs(client, field, value):
    res = client.post("/filters/circulate", json=_circulate_body(**{field: value}))
    assert res.status_code == 400
    assert "outer ellipse fractions must be in (0, 1]" in res.json()["detail"]


@pytest.mark.parametrize("field,value", [
    ("inner_w_frac", 0.0), ("inner_w_frac", 1.1),
    ("inner_h_frac", 0.0), ("inner_h_frac", 1.1),
])
def test_circulate_rejects_out_of_range_inner_fracs_when_enabled(client, field, value):
    res = client.post(
        "/filters/circulate",
        json=_circulate_body(inner_enabled=True, **{field: value}),
    )
    assert res.status_code == 400
    assert "inner ellipse fractions must be in (0, 1]" in res.json()["detail"]


def test_circulate_rejects_negative_contour_width(client):
    res = client.post("/filters/circulate", json=_circulate_body(contour_width_px=-1.0))
    assert res.status_code == 400
    assert "contour_width_px must be >= 0" in res.json()["detail"]


@pytest.mark.parametrize("field", ["cropped_w_px", "cropped_h_px"])
def test_circulate_rejects_nonpositive_cropped_pixels(client, field):
    res = client.post("/filters/circulate", json=_circulate_body(**{field: 0}))
    assert res.status_code == 400
    assert "cropped_w_px and cropped_h_px must be >= 1" in res.json()["detail"]


def test_circulate_accepts_valid_bounds(client):
    res = client.post("/filters/circulate", json=_circulate_body())
    assert res.status_code == 200


def test_circulate_cells_b64_length_mismatch_is_400(client):
    body = _circulate_body(cells_x=5, cells_y=5)
    res = client.post("/filters/circulate", json=body)
    assert res.status_code == 400
    assert "cells_b64 length mismatch" in res.json()["detail"]


@pytest.mark.parametrize("value", [1, 0, 561, 1000])
def test_linerate_rejects_out_of_range_num_colors(client, make_png_b64, value):
    # num_colors is the selection budget; caps at the full palette (560 =
    # 512 lab_munsell + 48 lab_grays). 561 must 400.
    res = client.post("/filters/linerate", json=_linerate_body(make_png_b64(), num_colors=value))
    assert res.status_code == 400
    assert "num_colors must be between 2 and 560" in res.json()["detail"]


@pytest.mark.parametrize("value", [0, 255, 4097, 8000])
def test_linerate_rejects_out_of_range_work_edge(client, make_png_b64, value):
    # work_edge is the Resolution dial (bridge-mapped); the cap is raised to 4096 to
    # allow hi-res traces (short edge >= 2000 from original) while still clamping the
    # range so a bad value can't blow up memory/time.
    res = client.post("/filters/linerate", json=_linerate_body(make_png_b64(), work_edge=value))
    assert res.status_code == 400
    assert "work_edge must be between 256 and 4096" in res.json()["detail"]
