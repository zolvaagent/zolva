"""Cut the white background out of generated icons (free, local).

gpt-image-2 cannot return transparent PNGs, so icons are generated on pure
white. This removes only the white region connected to the image border, so
white highlights inside the icon stay opaque. Edge pixels get a soft alpha to
avoid a white fringe on dark sections.

    python -I scripts/cutout-icons.py prototype/img/icons/*.png

Overwrites each file in place (512px, cropped and centered). The untouched
original is kept as assets/icons-original/<name>.png the first time, and every
rerun starts from that original.
"""

import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

NEAR_WHITE = 250  # min(r, g, b) at or above this counts as background candidate
EDGE_SOFT_FROM = 215  # within the edge band, alpha ramps from this whiteness to NEAR_WHITE
OUTPUT_SIZE = 512
PADDING = 0.06  # share of the output kept as empty margin


def shift(mask: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.zeros_like(mask)
    h, w = mask.shape
    out[max(dy, 0) : h + min(dy, 0), max(dx, 0) : w + min(dx, 0)] = mask[
        max(-dy, 0) : h + min(-dy, 0), max(-dx, 0) : w + min(-dx, 0)
    ]
    return out


def dilate(mask: np.ndarray) -> np.ndarray:
    return mask | shift(mask, 1, 0) | shift(mask, -1, 0) | shift(mask, 0, 1) | shift(mask, 0, -1)


def cutout(path: Path) -> None:
    originals = path.parents[3] / "assets" / "icons-original"
    originals.mkdir(parents=True, exist_ok=True)
    backup = originals / path.name
    if not backup.exists():
        shutil.copy2(path, backup)

    rgb = np.asarray(Image.open(backup).convert("RGB")).astype(np.float32)
    whiteness = rgb.min(axis=2)
    candidate = whiteness >= NEAR_WHITE

    # Flood fill from the border through near-white pixels only.
    background = np.zeros_like(candidate)
    background[0, :] = candidate[0, :]
    background[-1, :] = candidate[-1, :]
    background[:, 0] = candidate[:, 0]
    background[:, -1] = candidate[:, -1]
    while True:
        grown = dilate(background) & candidate
        if (grown == background).all():
            break
        background = grown

    alpha = np.where(background, 0.0, 1.0)

    # Soft edge: a 3px band around the background fades by whiteness.
    band = background.copy()
    for _ in range(3):
        band = dilate(band)
    band &= ~background
    ramp = np.clip((NEAR_WHITE - whiteness) / (NEAR_WHITE - EDGE_SOFT_FROM), 0.0, 1.0)
    alpha = np.where(band, np.minimum(alpha, ramp), alpha)

    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    image = Image.fromarray(rgba, "RGBA")

    # Crop to content, then fit into a square with even padding.
    box = image.getbbox()
    if box:
        image = image.crop(box)
    inner = round(OUTPUT_SIZE * (1 - 2 * PADDING))
    image.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    canvas.paste(image, ((OUTPUT_SIZE - image.width) // 2, (OUTPUT_SIZE - image.height) // 2), image)
    canvas.save(path, optimize=True)
    print(f"cut {path.name}: {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        cutout(Path(arg).resolve())
