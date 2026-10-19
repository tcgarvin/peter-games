# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.61.0"]  # matches the browsers already installed here
# ///
"""Screenshot a game's cabinet at phone-portrait, phone-landscape and desktop sizes.

Start the server first (cd arcade && python3 -m http.server 8765 &), then:
    uv run --script tools/screenshot.py <game-id> <out-dir> [port]

Use `lobby` as the game id to shoot the lobby instead.

On desktop it starts a 1-player game and holds the stick right and FIRE for a moment, so the
shots show attract mode (phones) and live play with a pressed control (desktop). Console errors
and page errors are printed; the exit code is 1 if there were any.
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

SIZES = {"phone-portrait": (390, 844, True), "phone-landscape": (844, 390, True), "desktop": (1440, 900, False)}


def main(game: str, out: Path, port: str) -> int:
    out.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        for name, (w, h, touch) in SIZES.items():
            page = browser.new_page(
                viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch, device_scale_factor=2
            )
            page.on("console", lambda m, n=name: m.type == "error" and errors.append(f"[{n}] {m.text}"))
            page.on("pageerror", lambda e, n=name: errors.append(f"[{n}] pageerror: {e}"))
            page.goto(f"http://localhost:{port}/" if game == "lobby" else f"http://localhost:{port}/?game={game}")
            page.wait_for_timeout(3000)
            if name == "desktop" and game != "lobby":
                page.keyboard.press("Digit1")
                page.wait_for_timeout(1500)
                page.keyboard.down("ArrowRight")
                page.keyboard.down("Space")
                page.wait_for_timeout(600)
                page.screenshot(path=str(out / f"{game}-{name}-playing.png"))
                page.keyboard.up("ArrowRight")
                page.keyboard.up("Space")
            page.screenshot(path=str(out / f"{game}-{name}.png"))
            page.close()
        browser.close()
    for e in errors:
        print(e)
    print(f"screenshots in {out}")
    return 1 if errors else 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], Path(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else "8765"))
