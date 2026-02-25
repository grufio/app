# Image Processing Service (Python)

FastAPI service for advanced image processing filters.

## Features

- **Pixelate Filter**: Block-based pixelation with average color calculation
- **Color Quantization**: Adaptive palette reduction using median cut
- **Grayscale Conversion**: Optional black & white output

## Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Run locally
python app/main.py
# or
uvicorn app.main:app --reload --port 8001
```

## Docker

```bash
# Build
docker build -t grufio-image-service .

# Run
docker run -p 8001:8001 grufio-image-service
```

## API

### POST /filters/pixelate

Apply pixelate filter to an image.

**Parameters:**
- `image` (file): Image file to process
- `superpixel_width` (int): Width of each pixel block
- `superpixel_height` (int): Height of each pixel block
- `color_mode` (string): "rgb" or "grayscale"
- `num_colors` (int): Number of colors (2-256)

**Response:** PNG image

**Example:**
```bash
curl -X POST http://localhost:8001/filters/pixelate \
  -F "image=@test.jpg" \
  -F "superpixel_width=10" \
  -F "superpixel_height=10" \
  -F "color_mode=rgb" \
  -F "num_colors=16" \
  --output result.png
```
