"""Bearer-token middleware contract (`app/main.py` ~lines 55-69).

The middleware reads the module global `_FILTER_SERVICE_TOKEN` at call
time, so patching that attribute is enough to exercise both the
"secured" and "open" modes without reloading the heavy module.
"""
from __future__ import annotations

import app.main as main


def test_health_is_exempt_even_when_secured(client, monkeypatch):
    monkeypatch.setattr(main, "_FILTER_SERVICE_TOKEN", "s3cret")
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_missing_token_is_rejected(client, monkeypatch, png_b64):
    monkeypatch.setattr(main, "_FILTER_SERVICE_TOKEN", "s3cret")
    res = client.post("/filters/bw_hard", json={"image_base64": png_b64})
    assert res.status_code == 401


def test_wrong_token_is_rejected(client, monkeypatch, png_b64):
    monkeypatch.setattr(main, "_FILTER_SERVICE_TOKEN", "s3cret")
    res = client.post(
        "/filters/bw_hard",
        json={"image_base64": png_b64},
        headers={"Authorization": "Bearer nope"},
    )
    assert res.status_code == 401


def test_correct_token_passes_through(client, monkeypatch, png_b64):
    monkeypatch.setattr(main, "_FILTER_SERVICE_TOKEN", "s3cret")
    res = client.post(
        "/filters/bw_hard",
        json={"image_base64": png_b64},
        headers={"Authorization": "Bearer s3cret"},
    )
    assert res.status_code != 401
    assert res.status_code == 200


def test_open_mode_when_token_unset(client, monkeypatch, png_b64):
    # Default test env leaves the token empty -> middleware short-circuits.
    monkeypatch.setattr(main, "_FILTER_SERVICE_TOKEN", "")
    res = client.post("/filters/bw_hard", json={"image_base64": png_b64})
    assert res.status_code == 200
