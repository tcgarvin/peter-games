# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy", "scipy"]
# ///
"""Turn a game's full standing-cabinet art into the lobby sprite.

Codex draws the whole cabinet on flat magenta (art/<id>/src/floor-cabinet.png, brief in
art/<id>/FLOOR_BRIEF.md). This keys out the magenta (only the part connected to the image border,
so magenta-ish art on the cabinet survives), crops to the cabinet, finds the screen, and writes
art/<id>/floor.webp (with alpha) and art/<id>/floor.json:
    {"size": [w, h], "screen": {"x", "y", "w", "h"}}   in floor.webp pixels

Usage:
    uv run --script tools/make_floor.py art/<id> [art/<id> ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

KEY = np.array([255, 0, 255])
KEY_DISTANCE = 140  # RGB distance from pure magenta that still counts as background
EDGE_BAND = 3  # px of cabinet edge that get magenta spill removed and a soft alpha
SCREEN_DARK = 40
OUT_HEIGHT = 1200
QUALITY = 86
SCREEN_INSET = 3


class FloorError(Exception):
    """The generated art isn't what the lobby needs."""


def key_out(rgb: np.ndarray) -> np.ndarray:
    """RGBA with the border-connected magenta made transparent and edges despilled."""
    distance = np.linalg.norm(rgb - KEY, axis=2)
    labels, _ = ndimage.label(distance < KEY_DISTANCE)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, border[border > 0])
    if background.mean() < 0.15:
        raise FloorError(f"only {background.mean():.0%} of the image is magenta background")

    band = ndimage.binary_dilation(background, iterations=EDGE_BAND) & ~background
    out = rgb.copy()
    spill = np.clip(np.minimum(out[..., 0], out[..., 2]) - out[..., 1], 0, None)
    for channel in (0, 2):
        out[..., channel] = np.where(band, out[..., channel] - spill, out[..., channel])
    # Pixels in the band that are still close to the key are mostly background.
    alpha = np.where(background, 0.0, 1.0)
    alpha = np.where(band, np.clip((distance - KEY_DISTANCE * 0.6) / (KEY_DISTANCE * 0.8), 0, 1), alpha)
    return np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)


def find_screen(rgba: np.ndarray, aspect: float) -> dict[str, int]:
    """Largest rectangle of the given aspect inside the biggest dark area of the cabinet."""
    dark = (rgba[..., :3].max(axis=2) < SCREEN_DARK) & (rgba[..., 3] == 255)
    dark = ndimage.binary_opening(dark, iterations=2)
    labels, count = ndimage.label(dark)
    screen = None
    best = 0
    for index, region in enumerate(ndimage.find_objects(labels), start=1):
        rows, cols = region
        h, w = rows.stop - rows.start, cols.stop - cols.start
        filled = (labels[region] == index).mean()
        # The screen is a solid rectangle of about the right shape; dark kick panels and
        # coin doors are either the wrong shape or full of details.
        if filled > 0.8 and abs((w / h) / aspect - 1) < 0.2 and w * h > best:
            screen, best = labels == index, w * h
    if screen is None:
        raise FloorError("no dark rectangle of the screen's aspect found")
    ys, xs = np.nonzero(screen)
    cy, cx = int(np.median(ys)), int(np.median(xs))

    # Median extents over a band through the middle, so bezel highlights don't stop the scan.
    def extent(line: np.ndarray, start: int, step: int) -> int:
        i = start
        while 0 <= i + step < len(line) and line[i + step]:
            i += step
        return i

    h_band = range(cy - 40, cy + 41, 8)
    v_band = range(cx - 40, cx + 41, 8)
    left = int(np.median([extent(screen[r], cx, -1) for r in h_band]))
    right = int(np.median([extent(screen[r], cx, 1) for r in h_band]))
    top = int(np.median([extent(screen[:, c], cy, -1) for c in v_band]))
    bottom = int(np.median([extent(screen[:, c], cy, 1) for c in v_band]))
    w, h = right - left - 2 * SCREEN_INSET, bottom - top - 2 * SCREEN_INSET
    found = w / h
    if abs(found / aspect - 1) > 0.12:
        raise FloorError(f"screen is {w}x{h} (aspect {found:.2f}), expected aspect {aspect:.2f}")
    if found > aspect:
        w = round(h * aspect)
    else:
        h = round(w / aspect)
    return {"x": (left + right) // 2 - w // 2, "y": (top + bottom) // 2 - h // 2, "w": w, "h": h}


def screen_aspect(art_dir: Path) -> float:
    spec = json.loads((art_dir / "slice.json").read_text())
    w, h = spec["layouts"]["portrait"].get("screen_aspect", [4, 3])
    return w / h


def make_floor(art_dir: Path) -> dict:
    rgb = np.asarray(Image.open(art_dir / "src" / "floor-cabinet.png").convert("RGB"), dtype=np.int16)
    rgba = key_out(rgb)
    ys, xs = np.nonzero(rgba[..., 3] > 0)
    rgba = rgba[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    scale = OUT_HEIGHT / rgba.shape[0]
    image = Image.fromarray(rgba, "RGBA")
    image = image.resize((round(image.width * scale), OUT_HEIGHT), Image.LANCZOS)
    rgba = np.asarray(image)
    info = {"size": [image.width, image.height], "screen": find_screen(rgba, screen_aspect(art_dir))}
    image.save(art_dir / "floor.webp", quality=QUALITY, method=6)
    (art_dir / "floor.json").write_text(json.dumps(info, indent=2) + "\n")
    return info


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for arg in sys.argv[1:]:
        print(arg, make_floor(Path(arg)))
