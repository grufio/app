"""Tests for the shared per-cell color detection (`compute_cell_colors`)."""
from PIL import Image

from app.cell_colors import compute_cell_colors


def test_box_area_average_to_cell_grid():
    # 4×2 image: left half black, right half (200,100,50). Two 2×2 blocks →
    # 2×1 cells, each the area-average of its block.
    img = Image.new("RGB", (4, 2))
    px = img.load()
    for y in range(2):
        px[0, y] = px[1, y] = (0, 0, 0)
        px[2, y] = px[3, y] = (200, 100, 50)
    arr = compute_cell_colors(img, 2, 1)
    assert arr.shape == (1, 2, 3)  # (cells_y, cells_x, 3)
    assert tuple(arr[0, 0]) == (0, 0, 0)
    assert tuple(arr[0, 1]) == (200, 100, 50)


def test_uniform_image_yields_that_colour_per_cell():
    img = Image.new("RGB", (6, 4), (12, 34, 56))
    arr = compute_cell_colors(img, 3, 2)
    assert arr.shape == (2, 3, 3)
    assert (arr == [12, 34, 56]).all()
