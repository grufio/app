# Filter Service

The image filtering service (FastAPI + OpenCV) for advanced effects (pixelate,
line art, numerate). Runs on Cloud Run in production, on `localhost:8001` in dev.

## Architecture

```
┌─────────────┐      HTTP POST       ┌─────────────────┐
│             │  ─────────────────>  │                 │
│  Next.js    │   (multipart/form)   │  Python Service │
│  API Route  │                      │   (FastAPI)     │
│             │  <─────────────────  │                 │
└─────────────┘    PNG image         └─────────────────┘
```

### Flow

1. **Client** → Next.js API route (`/api/projects/[id]/filters/pixelate`)
2. **Next.js** → Downloads source image from Supabase Storage
3. **Next.js** → POST to Python service (`http://filter-service:8001/filters/pixelate`)
4. **Python** → Processes image (block-based pixelation with average colors)
5. **Python** → Returns processed PNG
6. **Next.js** → Uploads result to Supabase Storage, creates DB entry

## Why Python?

**Sharp (Node.js) limitations:**
- Simple resize + quantize approach
- No per-block average color calculation
- PNG palette mode (not ideal for pixelate effect)

**Python (PIL/Pillow) advantages:**
- ✅ True block-based pixelation (calculate average per superpixel)
- ✅ Better color quantization (median cut algorithm)
- ✅ More control over individual pixels
- ✅ Easy to extend with OpenCV, scikit-image for complex filters

## Pixelate Algorithm

### Sharp (Old - Simple)
```
1. Resize down (1000x800 → 100x80) with nearest-neighbor
2. Optional: Grayscale
3. PNG palette quantization (num_colors)
4. Resize up (100x80 → 1000x800) with nearest-neighbor
```

### PIL (New - Block-based)
```
1. Divide image into superpixel blocks (e.g. 10x10)
2. For each block:
   - Calculate average RGB/grayscale value
   - Fill entire block with this average color
3. Optional: Grayscale conversion
4. Quantize to N colors using median cut
```

**Result:** Much sharper, more controlled pixelation effect!

## Development

### Local Setup (Python Service)

```bash
cd filter-service

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run service
python app/main.py
# or
uvicorn app.main:app --reload --port 8001
```

### Local Setup (Next.js)

```bash
# Add to .env.local
FILTER_SERVICE_URL=http://localhost:8001

# Start Next.js
npm run dev
```

### Docker Compose (Both Services)

```bash
# Start both services
docker-compose up

# Python service: http://localhost:8001
# Next.js: http://localhost:3000
```

## Deployment

### Vercel (Next.js)

Add environment variable:
```
FILTER_SERVICE_URL=https://your-filter-service.com
```

### Python Service Deployment Options

1. **Railway / Render / Fly.io**
   - Deploy `filter-service/` directory
   - Dockerfile included
   - Set port to 8001

2. **AWS Lambda (via Mangum)**
   - Wrap FastAPI with Mangum adapter
   - Deploy as Lambda function

3. **Google Cloud Run / Azure Container Apps**
   - Build Docker image from `filter-service/Dockerfile`
   - Deploy as container

## API Reference

### POST /filters/pixelate

**Request (multipart/form-data):**
- `image` (file): Source image
- `superpixel_width` (int): Block width (pixels)
- `superpixel_height` (int): Block height (pixels)
- `color_mode` (string): "rgb" or "grayscale"
- `num_colors` (int): 2-256

**Response:** PNG image (image/png)

**Example (cURL):**
```bash
curl -X POST http://localhost:8001/filters/pixelate \
  -F "image=@test.jpg" \
  -F "superpixel_width=10" \
  -F "superpixel_height=10" \
  -F "color_mode=rgb" \
  -F "num_colors=16" \
  --output result.png
```

## Future Filters

This architecture makes it easy to add more filters:

- **Edge Detection** (Canny, Sobel)
- **Advanced Color Quantization** (K-means clustering)
- **Artistic Filters** (Oil painting, watercolor)
- **Face Detection** (OpenCV)
- **Style Transfer** (Neural networks)

Simply add new endpoints to `filter-service/app/main.py`!

## Testing

```bash
# Python service tests (future)
cd filter-service
pytest

# Integration test (Next.js → Python)
npm test -- services/editor/server/pixelate-filter.test.ts
```

## Performance

**Benchmarks** (1000x800 image, 10x10 superpixels):
- Sharp (old): ~150ms
- Python/PIL (new): ~200ms
- Trade-off: +50ms for much better quality ✅

## Troubleshooting

**Python service not reachable:**
```bash
# Check if running
curl http://localhost:8001/health

# Check logs
docker-compose logs filter-service
```

**ModuleNotFoundError:**
```bash
# Reinstall dependencies
pip install -r requirements.txt
```

**Port already in use:**
```bash
# Change port in docker-compose.yml
# Update FILTER_SERVICE_URL in .env.local
```
