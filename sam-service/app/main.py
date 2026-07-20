"""
gruf-sam-service — FastAPI wrapper around SAM2 "segment everything".

POST /segment { image_url }  → object partition (16-bit indexed PNG, base64).
The caller (upload flow) computes this ONCE per uploaded image and caches the
partition in Supabase Storage; every trace/preview iteration reuses the cache.

Auth: shared bearer token via SAM_AUTH_TOKEN env (matches the filter-service
pattern). image_url must be an https signed URL (SSRF guard).
"""
from __future__ import annotations
import os
import io
import base64
import ipaddress
from urllib.parse import urlparse

import numpy as np
import requests
import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image

from .sam_segment import load_model, segment_partition, device

app = FastAPI(title="gruf-sam-service")
_MODEL = None
_AUTH = os.environ.get("SAM_AUTH_TOKEN")
_MAX_BYTES = 64 * 1024 * 1024


@app.on_event("startup")
def _startup():
    global _MODEL
    _MODEL = load_model()          # load weights once (baked into the image)


@app.get("/health")
def health():
    return {"ok": _MODEL is not None, "device": device(), "cuda": torch.cuda.is_available()}


class SegmentReq(BaseModel):
    image_url: str = Field(..., description="https signed URL to the source image")
    work_edge: int = Field(1024, ge=256, le=2048)


def _check_auth(authorization: str | None):
    if _AUTH and authorization != f"Bearer {_AUTH}":
        raise HTTPException(status_code=401, detail="unauthorized")


def _fetch_image(url: str) -> Image.Image:
    p = urlparse(url)
    if p.scheme != "https":
        raise HTTPException(status_code=400, detail="image_url must be https")
    host = p.hostname or ""
    try:                                            # block obvious SSRF to internal IPs
        if ipaddress.ip_address(host).is_private:
            raise HTTPException(status_code=400, detail="private host blocked")
    except ValueError:
        pass                                        # hostname (not an IP) → ok
    resp = requests.get(url, timeout=30, stream=True)
    resp.raise_for_status()
    data = resp.raw.read(_MAX_BYTES + 1, decode_content=True)
    if len(data) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="image too large")
    return Image.open(io.BytesIO(data)).convert("RGB")


@app.post("/segment")
def segment(req: SegmentReq, authorization: str | None = Header(default=None)):
    _check_auth(authorization)
    img = _fetch_image(req.image_url)
    partition, n_obj, (ww, hh) = segment_partition(_MODEL, img, req.work_edge)
    buf = io.BytesIO()
    # 16-bit indexed PNG (labels can exceed 255 with background CCs)
    Image.fromarray(partition.astype(np.uint16), mode="I;16").save(buf, format="PNG")
    return {
        "partition_png_b64": base64.b64encode(buf.getvalue()).decode(),
        "width": ww,
        "height": hh,
        "n_objects": n_obj,
        "device": device(),
    }
