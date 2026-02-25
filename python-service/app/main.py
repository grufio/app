"""
FastAPI service for image processing filters.
"""
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import cv2
import numpy as np
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






class LineArtRequest(BaseModel):
    image_base64: str
    threshold1: int = 100
    threshold2: int = 200
    line_thickness: int = 2
    invert: bool = True
    blur_amount: int = 3
    min_contour_area: int = 200
    smoothness: float = 0.005


@app.post("/filters/lineart")
async def lineart_filter(request: LineArtRequest):
    """
    Apply line art filter with closed contours exported as SVG vectors.
    
    Algorithm:
    1. Optional: Gaussian blur (reduces details)
    2. Canny edge detection
    3. Close gaps with morphological operations
    4. Find closed contours
    5. Filter by minimum area (removes noise)
    6. Export contours as SVG paths (vectors)
    """
    if request.threshold1 < 0 or request.threshold2 < 0:
        raise HTTPException(status_code=400, detail="Thresholds must be >= 0")
    if request.threshold1 >= request.threshold2:
        raise HTTPException(status_code=400, detail="threshold1 must be < threshold2")
    if request.line_thickness < 1 or request.line_thickness > 10:
        raise HTTPException(status_code=400, detail="Line thickness must be between 1 and 10")
    if request.blur_amount < 0 or request.blur_amount > 20:
        raise HTTPException(status_code=400, detail="Blur amount must be between 0 and 20")
    if request.min_contour_area < 0:
        raise HTTPException(status_code=400, detail="Min contour area must be >= 0")
    if request.smoothness < 0 or request.smoothness > 0.1:
        raise HTTPException(status_code=400, detail="Smoothness must be between 0 and 0.1")
    
    try:
        # Decode and convert image
        img_bytes = base64.b64decode(request.image_base64)
        img = Image.open(io.BytesIO(img_bytes))
        img_array = np.array(img)
        
        # Convert to grayscale
        if len(img_array.shape) == 3:
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_array
        
        height, width = gray.shape
        
        # Apply Gaussian blur if requested (reduces details)
        if request.blur_amount > 0:
            # Blur kernel must be odd
            kernel_size = request.blur_amount * 2 + 1
            gray = cv2.GaussianBlur(gray, (kernel_size, kernel_size), 0)
        
        # Apply Canny edge detection
        edges = cv2.Canny(gray, request.threshold1, request.threshold2)
        
        # Close gaps with morphological closing
        kernel_size = max(3, request.line_thickness + 2)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(closed, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        
        # Filter contours by minimum area
        filtered_contours = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area >= request.min_contour_area:
                filtered_contours.append(contour)
        
        # Convert contours to SVG paths
        svg_paths = []
        for contour in filtered_contours:
            if len(contour) < 3:
                continue
            
            # Apply polygon approximation for smoother curves
            epsilon = request.smoothness * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            # Build SVG path data from approximated contour
            path_data = []
            for i, point in enumerate(approx):
                x, y = point[0]
                if i == 0:
                    path_data.append(f"M {x} {y}")
                else:
                    path_data.append(f"L {x} {y}")
            path_data.append("Z")
            
            svg_paths.append(f'<path d="{" ".join(path_data)}" fill="none" stroke="black" stroke-width="{request.line_thickness}" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Create SVG document
        svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="{width}" height="{height}" fill="{"white" if request.invert else "black"}"/>
  <g>
    {chr(10).join(svg_paths)}
  </g>
</svg>'''
        
        return Response(content=svg_content, media_type="image/svg+xml")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
