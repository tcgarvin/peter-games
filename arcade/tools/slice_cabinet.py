# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow", "numpy"]
# ///
"""Turn generated cabinet art into the sprites and manifest.json the arcade shell reads.

Codex generates, per layout, a base cabinet image plus edits of it in which only the controls
change (sticks tilted up/down/left/right, buttons pressed). This tool compares each edit with the
base near every control, cuts a feathered patch covering whatever changed, and records where the
screen and controls are.

Usage:
    uv run --script tools/slice_cabinet.py art/artillery/slice.json

The spec (paths relative to the spec file) looks like:
    {"layouts": {"portrait": {
        "base": "src/portrait-base.png",
        "variants": {"up": "...", "down": "...", "left": "...", "right": "...", "pressed": "..."},
        "screen_near": [512, 548],
        "screen_aspect": [4, 3],      (optional, default 4:3; must match the game's width:height)
        "marquee": [40, 10, 985, 235],
        "controls": {"p1_stick": {"type": "joystick", "near": [228, 930]},
                     "p1_fire": {"type": "button", "near": [392, 950], "search": [150, 90]}}}}}
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

STICK_STATES = ("up", "down", "left", "right")
DIFF_THRESHOLD = 48  # max-channel difference that counts as "this pixel changed"
SEARCH = {"joystick": (200, 300), "button": (150, 130)}  # search window (w, h) around `near`
PATCH_PAD = 14
FEATHER = 8
SCREEN_DARK = 40
DEFAULT_ASPECT = (4, 3)
BASE_QUALITY = 88
# Sprites are small and sit on top of the base art, so they are kept lossless.
SPRITE_WEBP = {"lossless": True, "quality": 100, "method": 6}


@dataclass(frozen=True)
class Box:
    x0: int
    y0: int
    x1: int
    y1: int

    @property
    def w(self) -> int:
        return self.x1 - self.x0

    @property
    def h(self) -> int:
        return self.y1 - self.y0

    def union(self, other: Box) -> Box:
        return Box(min(self.x0, other.x0), min(self.y0, other.y0), max(self.x1, other.x1), max(self.y1, other.y1))

    def padded(self, pad: int, width: int, height: int) -> Box:
        return Box(max(0, self.x0 - pad), max(0, self.y0 - pad), min(width, self.x1 + pad), min(height, self.y1 + pad))


class SliceError(Exception):
    """The generated art doesn't match what the spec says it should contain."""


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)


def changed_box(
    base: np.ndarray, variant: np.ndarray, near: tuple[int, int], kind: str, search: tuple[int, int] | None = None
) -> Box | None:
    """Bounding box of significant changes within the search window around `near`."""
    if base.shape != variant.shape:
        raise SliceError(f"edit is {variant.shape[1]}x{variant.shape[0]}, base is {base.shape[1]}x{base.shape[0]}")
    w, h = search or SEARCH[kind]
    cx, cy = near
    x0, y0 = max(0, cx - w // 2), max(0, cy - h // 2)
    x1, y1 = min(base.shape[1], cx + w // 2), min(base.shape[0], cy + h // 2)
    diff = np.abs(base[y0:y1, x0:x1] - variant[y0:y1, x0:x1]).max(axis=2) > DIFF_THRESHOLD
    # Drop isolated speckle from re-encoding: keep pixels with several changed neighbours.
    mask = Image.fromarray((diff * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
    ys, xs = np.nonzero(np.asarray(mask))
    if len(xs) == 0:
        return None
    return Box(x0 + int(xs.min()), y0 + int(ys.min()), x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1)


def feathered_patch(image: Image.Image, box: Box) -> Image.Image:
    patch = image.crop((box.x0, box.y0, box.x1, box.y1)).convert("RGBA")
    alpha = Image.new("L", patch.size, 0)
    inner = Image.new("L", (max(1, box.w - 2 * FEATHER), max(1, box.h - 2 * FEATHER)), 255)
    alpha.paste(inner, (FEATHER, FEATHER))
    patch.putalpha(alpha.filter(ImageFilter.GaussianBlur(FEATHER / 2)))
    return patch


def find_screen(base: np.ndarray, near: tuple[int, int], aspect: float) -> dict[str, int]:
    """Largest rectangle of the given aspect inside the dark screen area that contains `near`."""
    dark = base.max(axis=2) < SCREEN_DARK
    cx, cy = near
    if not dark[cy, cx]:
        raise SliceError(f"screen_near {near} is not on the dark screen area")

    def run(line: np.ndarray, start: int, step: int) -> int:
        i = start
        while 0 <= i + step < len(line) and line[i + step]:
            i += step
        return i

    # Use the median extent over a band of rows/columns so bezel highlights don't stop the scan.
    rows = range(cy - 60, cy + 61, 10)
    cols = range(cx - 80, cx + 81, 10)
    left = int(np.median([run(dark[r], cx, -1) for r in rows]))
    right = int(np.median([run(dark[r], cx, 1) for r in rows]))
    top = int(np.median([run(dark[:, c], cy, -1) for c in cols]))
    bottom = int(np.median([run(dark[:, c], cy, 1) for c in cols]))
    inset = 4
    w, h = right - left - 2 * inset, bottom - top - 2 * inset
    if w / h > aspect:
        w = round(h * aspect)
    else:
        h = round(w / aspect)
    x = (left + right) // 2 - w // 2
    y = (top + bottom) // 2 - h // 2
    return {"x": x, "y": y, "w": w, "h": h}


def aspect_ratio(aspect: list[int] | tuple[int, int]) -> float:
    w, h = aspect
    if w <= 0 or h <= 0:
        raise SliceError(f"screen_aspect must be two positive numbers, got {aspect}")
    return w / h


def slice_layout(name: str, spec: dict, root: Path, out: Path) -> dict:
    base_img = Image.open(root / spec["base"]).convert("RGB")
    base = np.asarray(base_img, dtype=np.int16)
    variants = {state: Image.open(root / path).convert("RGB") for state, path in spec["variants"].items()}
    arrays = {state: np.asarray(img, dtype=np.int16) for state, img in variants.items()}
    width, height = base_img.size

    image_name = f"cabinet-{name}.webp"
    base_img.save(out / image_name, quality=BASE_QUALITY)
    layout: dict = {
        "image": image_name,
        "size": [width, height],
        "screen": find_screen(base, tuple(spec["screen_near"]), aspect_ratio(spec.get("screen_aspect", DEFAULT_ASPECT))),
        "controls": {},
    }
    if "marquee" in spec:
        x0, y0, x1, y1 = spec["marquee"]
        layout["marquee"] = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}

    for control_id, control in spec["controls"].items():
        kind = control["type"]
        near = tuple(control["near"])
        states = STICK_STATES if kind == "joystick" else ("pressed",)
        search = tuple(control["search"]) if "search" in control else None
        boxes = [changed_box(base, arrays[s], near, kind, search) for s in states]
        found = [b for b in boxes if b is not None]
        if not found:
            raise SliceError(f"{name}/{control_id}: no change found near {near} in {', '.join(states)}")
        box = found[0]
        for b in found[1:]:
            box = box.union(b)
        box = box.padded(PATCH_PAD, width, height)

        sprites: dict[str, dict] = {}
        rest_state = "neutral" if kind == "joystick" else "up"
        sources = {rest_state: base_img} | (
            {s: variants[s] for s in STICK_STATES} if kind == "joystick" else {"down": variants["pressed"]}
        )
        for state, img in sources.items():
            file_name = f"{name}-{control_id}-{state}.webp"
            feathered_patch(img, box).save(out / file_name, **SPRITE_WEBP)
            sprites[state] = {"file": file_name, "x": box.x0, "y": box.y0}

        if kind == "joystick":
            # The patch spans every tilt, so it is much larger than the stick; touch around the
            # stick's base instead, or the hit area swallows neighbouring buttons and the screen.
            hit = {"cx": near[0], "cy": near[1], "r": round(min(box.w, box.h) / 2)}
        else:
            hit = {"cx": (box.x0 + box.x1) // 2, "cy": (box.y0 + box.y1) // 2, "r": round(max(box.w, box.h) / 2)}
        layout["controls"][control_id] = {
            "type": kind,
            "hit": hit,
            "states": sprites,
        }
        print(f"{name}/{control_id}: patch {box.w}x{box.h} at ({box.x0},{box.y0})")
    return layout


def main(spec_path: str) -> None:
    spec_file = Path(spec_path)
    spec = json.loads(spec_file.read_text())
    root = spec_file.parent
    manifest = {"layouts": {name: slice_layout(name, layout, root, root) for name, layout in spec["layouts"].items()}}
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {root / 'manifest.json'}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
