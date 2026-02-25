"""
FastAPI service for image processing filters.
"""
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image
import io
from typing import Literal

app = FastAPI(title="Image Processing Service")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/filters/pixelate")
async def pixelate_filter(
    image: UploadFile = File(...),
    superpixel_width: int = Form(...),
    superpixel_height: int = Form(...),
    color_mode: Literal["rgb", "grayscale"] = Form("rgb"),
    num_colors: int = Form(16),
):
    """
    Apply pixelate filter to an image.
    
    Algorithm:
    1. Divide image into superpixel blocks
    2. Calculate average color for each block
    3. Fill block with average color
    4. Optional: Reduce to N colors using quantization
    5. Optional: Convert to grayscale
    """
    # Validate parameters
    if superpixel_width < 1 or superpixel_height < 1:
        raise HTTPException(status_code=400, detail="Superpixel dimensions must be >= 1")
    if num_colors < 2 or num_colors > 256:
        raise HTTPException(status_code=400, detail="Number of colors must be between 2 and 256")
    
    try:
        # Read image
        img_bytes = await image.read()
        img = Image.open(io.BytesIO(img_bytes))
        
        # Convert to RGB if necessary (handles RGBA, etc.)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        
        width, height = img.size
        
        # Calculate grid dimensions
        grid_width = width // superpixel_width
        grid_height = height // superpixel_height
        
        if grid_width < 1 or grid_height < 1:
            raise HTTPException(
                status_code=400, 
                detail=f"Superpixel size too large for image ({width}x{height})"
            )
        
        # Create new image for result
        result = Image.new(img.mode, (width, height))
        pixels = img.load()
        result_pixels = result.load()
        
        # Process each superpixel block
        for block_y in range(grid_height):
            for block_x in range(grid_width):
                # Calculate block boundaries
                x_start = block_x * superpixel_width
                y_start = block_y * superpixel_height
                x_end = min(x_start + superpixel_width, width)
                y_end = min(y_start + superpixel_height, height)
                
                # Calculate average color of the block
                r_sum, g_sum, b_sum = 0, 0, 0
                pixel_count = 0
                
                for y in range(y_start, y_end):
                    for x in range(x_start, x_end):
                        pixel = pixels[x, y]
                        if img.mode == "RGB":
                            r_sum += pixel[0]
                            g_sum += pixel[1]
                            b_sum += pixel[2]
                        else:  # Grayscale
                            r_sum += pixel
                            g_sum += pixel
                            b_sum += pixel
                        pixel_count += 1
                
                # Calculate average
                if pixel_count > 0:
                    if img.mode == "RGB":
                        avg_color = (
                            r_sum // pixel_count,
                            g_sum // pixel_count,
                            b_sum // pixel_count
                        )
                    else:
                        avg_gray = r_sum // pixel_count
                        avg_color = avg_gray
                
                # Fill the block with average color
                for y in range(y_start, y_end):
                    for x in range(x_start, x_end):
                        result_pixels[x, y] = avg_color
        
        # Handle remaining pixels on edges (if image not evenly divisible)
        # Right edge
        if grid_width * superpixel_width < width:
            for y in range(height):
                for x in range(grid_width * superpixel_width, width):
                    result_pixels[x, y] = pixels[x, y]
        
        # Bottom edge
        if grid_height * superpixel_height < height:
            for y in range(grid_height * superpixel_height, height):
                for x in range(width):
                    result_pixels[x, y] = pixels[x, y]
        
        # Apply grayscale if requested
        if color_mode == "grayscale":
            result = result.convert("L")
        
        # Apply color quantization (reduce to N colors)
        if num_colors < 256:
            # Use adaptive palette quantization
            result = result.quantize(colors=num_colors, method=Image.MEDIANCUT)
            result = result.convert("RGB" if color_mode == "rgb" else "L")
        
        # Save result to bytes
        output = io.BytesIO()
        result.save(output, format="PNG", optimize=True)
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="image/png",
            headers={
                "Content-Disposition": f'attachment; filename="pixelated.png"'
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
