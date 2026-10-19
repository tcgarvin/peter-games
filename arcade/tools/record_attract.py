# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.61.0", "pillow"]  # playwright matches the browsers installed here
# ///
"""Record each game's attract mode as a short looping animated WebP (art/<id>/attract.webp),
shown on the cabinet screens in the lobby.

Start the server first (cd arcade && python3 -m http.server 8765 &), then:
    uv run --script tools/record_attract.py [game-id ...]

With no ids it records every game in games/registry.js. The loop is the CPU demo under the
game's title with a blinking INSERT COIN, rendered straight from the game (no CRT; the lobby adds
its own scanlines).
"""

import base64
import io
import re
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ARCADE = Path(__file__).resolve().parent.parent
PORT = 8765
WIDTH = 320
FPS = 10
SECONDS = 4  # a whole number of blink cycles, so the loop's blink is seamless
WARMUP_SECONDS = 3
QUALITY = 70


def registry_ids() -> list[str]:
    ids = re.findall(r"\bid: '([a-z0-9_-]+)'", (ARCADE / "games" / "registry.js").read_text())
    if not ids:
        raise RuntimeError("no game ids found in games/registry.js")
    return ids


def decode(data_url: str) -> Image.Image:
    header, payload = data_url.split(",", 1)
    if header != "data:image/png;base64":
        raise ValueError(f"unexpected frame encoding {header!r}")
    return Image.open(io.BytesIO(base64.b64decode(payload))).convert("RGB")


def record(page, game: str) -> Path:
    urls = page.evaluate(
        "([id, opts]) => window.recordAttract(id, opts)",
        [game, {"width": WIDTH, "fps": FPS, "seconds": SECONDS, "warmupSeconds": WARMUP_SECONDS}],
    )
    frames = [decode(u) for u in urls]
    out = ARCADE / "art" / game / "attract.webp"
    frames[0].save(
        out, save_all=True, append_images=frames[1:], duration=1000 // FPS, loop=0, quality=QUALITY, method=6
    )
    return out


def main(games: list[str]) -> int:
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.goto(f"http://localhost:{PORT}/tools/attract.html")
        page.wait_for_function("typeof window.recordAttract === 'function'")
        for game in games:
            out = record(page, game)
            print(f"{out.relative_to(ARCADE)}  {out.stat().st_size // 1024} KB")
        browser.close()
    for e in errors:
        print(e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or registry_ids()))
