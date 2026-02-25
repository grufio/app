"""
FastAPI service for image processing filters.
"""
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import io
import base64
from typing import Literal

app = FastAPI(title="Image Processing Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PixelateRequest(BaseModel):
    image_base64: str
    superpixel_width: int
    superpixel_height: int
    color_mode: Literal["rgb", "grayscale"] = "rgb"
    num_colors: int = 16


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/filters/pixelate")
async def pixelate_filter(request: PixelateRequest):
    if request.superpixel_width < 1 or request.superpixel_height < 1:
        raise HTTPException(status_code=400, detail="Superpixel dimensions must be >= 1")
    if request.num_colors < 2 or request.num_colors > 256:
        raise HTTPException(status_code=400, detail="Number of colors must be between 2 and 256")
    
    try:
        img_bytes = base64.b64decode(request.image_base64)
        img = Image.open(io.BytesIO(img_bytes))
        
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        
        width, height = img.size
        grid_width = width // request.superpixel_width
        grid_height = height // request.superpixel_height
        
        if grid_width < 1 or grid_height < 1:
            raise HTTPException(status_code=400, detail=f"Superpixel size too large for image")
        
        result = Image.new(img.mode, (width, height))
        pixels = img.load()
        result_pixels = result.load()
        
        for block_y in range(grid_height):
            for block_x in range(grid_width):
                x_start = block_x * request.superpixel_width
                y_start = block_y * request.superpixel_height
                x_end = min(x_start + request.superpixel_width, width)
                y_end = min(y_start + request.superpixel_height, height)
                
                r_sum, g_sum, b_sum = 0, 0, 0
                pixel_count = 0
                
                for y in range(y_start, y_end):
                    for x in range(x_start, x_end):
                        pixel = pixels[x, y]
                        if img.mode == "RGB":
                            r_sum += pixel[0]
                            g_sum += pixel[1]
                            b_sum += pixel[2]
                        else:
                            r_sum += pixel
                            g_sum += pixel
                            b_sum += pixel
                        pixel_count += 1
                
                if pixel_count > 0:
                    if img.mode == "RGB":
                        avg_color = (r_sum // pixel_count, g_sum // pixel_count, b_sum // pixel_count)
                    else:
                        avg_color = r_sum // pixel_count
                
                for y in range(y_start, y_end):
                    for x in range(x_start, x_end):
                        result_pixels[x, y] = avg_color
        
        if request.color_mode == "grayscale":
            result = result.convert("L")
        
        if request.num_colors < 256:
            result = result.quantize(colors=request.num_colors, method=Image.MEDIANCUT)
            result = result.convert("RGB" if request.color_mode == "rgb" else "L")
        
        output = io.BytesIO()
        result.save(output, format="PNG", optimize=True)
        output.seek(0)
        
        return Response(content=output.getvalue(), media_type="image/png")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
