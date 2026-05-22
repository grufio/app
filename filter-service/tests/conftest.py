"""Shared fixtures for the filter-service test suite."""
from __future__ import annotations

import base64
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


@pytest.fixture
def client() -> TestClient:
    """FastAPI test client. Auth middleware is open by default because
    `_FILTER_SERVICE_TOKEN` is unset in the test env; auth tests patch
    `app.main._FILTER_SERVICE_TOKEN` explicitly to exercise the gate."""
    return TestClient(app)


def _encode_png(arr: np.ndarray) -> str:
    """Encode an (H, W, 3) uint8 RGB array as a base64 PNG string."""
    buf = io.BytesIO()
    Image.fromarray(arr, mode="RGB").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@pytest.fixture
def make_png_b64():
    """Factory: build a base64 PNG of a solid colour at a given size.

    Solid colour keeps pixelate cell means deterministic, so a downsampled
    cell equals the source colour regardless of the area-average block.
    """

    def _make(width: int = 8, height: int = 8, rgb: tuple[int, int, int] = (10, 120, 240)) -> str:
        arr = np.empty((height, width, 3), dtype=np.uint8)
        arr[:, :] = rgb
        return _encode_png(arr)

    return _make


@pytest.fixture
def png_b64(make_png_b64) -> str:
    """A default 8x8 solid-colour PNG for tests that don't care about size."""
    return make_png_b64()
