# gruf-sam-service

SAM2 "segment everything" as an isolated **Cloud Run GPU** service. Produces the
**object partition** used by the object-structured linerate (paint-by-numbers).
The CPU `filter-service` stays unchanged; only this service needs the GPU, and it
**scales to zero** (idle = €0).

## Why isolated + decoupled
SAM depends only on the image, not on trace parameters. Compute the partition
**once per uploaded image**, cache it (Supabase Storage), and every
trace/preview iteration reuses the cache. So a single GPU call per upload,
cold-start hidden in the upload step.

## Endpoint
`POST /segment`  (Bearer `SAM_AUTH_TOKEN`)
```json
{ "image_url": "https://…signed-url…", "work_edge": 1024 }
→ { "partition_png_b64": "<16-bit indexed PNG>", "width": W, "height": H, "n_objects": N }
```
`GET /health` → `{ ok, device, cuda }`.

The partition is a 16-bit indexed PNG (one object id per pixel, no holes). The
caller caches it and hands it to linerate as a hard "no region crosses an object
boundary" constraint.

## Deploy (europe-west4, NVIDIA L4, scale-to-zero) — PROD, run on explicit go
```bash
gcloud run deploy gruf-sam-service \
  --source sam-service \
  --project grufio-app \
  --region europe-west4 \
  --gpu 1 --gpu-type nvidia-l4 \
  --cpu 4 --memory 16Gi \
  --min-instances 0 --max-instances 2 \
  --no-gpu-zonal-redundancy \
  --no-cpu-throttling \
  --concurrency 1 --timeout 300 \
  --set-env-vars SAM_AUTH_TOKEN=<secret> \
  --no-allow-unauthenticated
```

### Prerequisites (owner action)
1. **GPU quota**: request "Total Nvidia L4 GPU allocation" for Cloud Run in
   `europe-west4` (GCP console → IAM & Admin → Quotas) if not already granted.
2. **Region**: `europe-west3` (the filter-service region) has **no** Cloud Run
   GPU — this service must live in a GPU region (`europe-west4` chosen).
3. **Secret**: set `SAM_AUTH_TOKEN` (also configure the caller with it).
4. Cloud Build for the image is large (~7 GB, CUDA+torch). First build is slow.

## Local smoke (CPU, slow — real run is GPU)
```bash
cd sam-service
docker build -t gruf-sam-service .
docker run -p 8080:8080 -e SAM_AUTH_TOKEN=dev gruf-sam-service
curl localhost:8080/health
curl -X POST localhost:8080/segment -H "Authorization: Bearer dev" \
     -H "Content-Type: application/json" \
     -d '{"image_url":"https://…","work_edge":1024}'
```

## Notes
- Model `sam2_b.pt` is baked into the image (no cold-start download).
- AMG tuning (dense grid 32, conf 0.70, stability 0.88) matches the validated
  color-lab prototype; the default was too coarse (few masks).
- `--concurrency 1`: GPU-bound, one request per instance at a time.
