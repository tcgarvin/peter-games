# Art brief: SPACEWAR cabinet

The exact prompt given to `codex exec -s read-only` (image tool only). Outputs were copied into
`src/` and cut into sprites with `uv run --script tools/slice_cabinet.py art/spacewar/slice.json`.

---

You have no working shell in this session (the sandbox cannot start), and you do not need one.
Use ONLY your built-in image generation tool (generate and edit). Do not try to read or write
files. The images are collected automatically from where your tool saves them.

## What you are designing

Arcade cabinet art for one game in "Peter's Arcade", small games played in a web browser inside
a skeuomorphic arcade cabinet. The page shows the cabinet filling the viewport; the live game is
drawn (with a CRT shader) over the cabinet's screen, and the joysticks and buttons painted on the
control panel are the real touch controls on phones. Make it look like a real, lovingly made
1980s arcade cabinet for this specific game. You own the visual design.

The game, SPACEWAR: a space cargo-delivery race in a wrap-around asteroid field, drawn in simple
vector style on a black starfield. Three little triangular rocket ships fly with Newtonian
momentum (rotate, thrust, drift). White outlined asteroids tumble through space and shatter into
smaller rocks when a ship crashes into them. Glowing ORANGE "PICKUP" rings and PURPLE "DROPOFF"
rings appear; a ship must slow down inside a pickup ring to load cargo, then fly to a dropoff
ring and slow down again to deliver it for one credit ($). First ship to $5 wins; crash into a
rock and you are out. Player 1's ship is GREEN, Player 2's ship is MAGENTA/PINK, and the CPU
freighter is BLUE. Think space truckers, cargo haulers, interplanetary delivery service, vector
graphics arcade, but the theme and decoration are yours to choose.

Control panel (two-player, P1 on the left, P2 on the right):
- each player: one ball-top joystick (up = THRUST, left/right = ROTATE) and one big THRUST button
- shared: a "1 PLAYER" start button and a "2 PLAYER" start button
Design the art around each control for this game (labels such as ROTATE / THRUST, P1 / P2,
cockpit or space-freighter hardware motifs, whatever you think is best). Text in the art is
welcome; spell it exactly. Every control must be clearly visible, separate from the others, and
large enough to press with a thumb on a phone. Tint P1's controls green and P2's controls magenta
(or otherwise make clear which side is which).

Hard requirements for every image:
- The screen area is a flat, plain, near-black rectangle with an exact 4:3 aspect ratio and
  nothing drawn in it. The live game will be drawn over it. Make it as large as the composition
  allows.
- Seen straight on, no perspective tilt, so the screen is a true rectangle.

## Images to make, in this exact order

A. PORTRAIT BASE (1024x1536): the whole cabinet seen head-on, for a phone held upright and for
   desktop. Marquee with the title SPACEWAR at top, screen in the middle, control panel below.
   Both joysticks upright/centered, all buttons up.
B. Edit of A: both joysticks tilted UP (pushed away from the player). Change nothing else.
C. Edit of A: both joysticks tilted DOWN (pulled toward the player). Change nothing else.
D. Edit of A: both joysticks tilted LEFT. Change nothing else.
E. Edit of A: both joysticks tilted RIGHT. Change nothing else.
F. Edit of A: all four buttons (both THRUST buttons and both start buttons) pressed in, lit up.
   Change nothing else.

G. LANDSCAPE BASE (1536x1024): a composition of the same cabinet for a phone held sideways. The
   screen must be as large as possible and centered; the controls flank it: P1 joystick + THRUST
   to the left of the screen, P2 joystick + THRUST to the right, start buttons wherever they fit
   (for example under the side controls). A short marquee strip is fine. Same visual design as A.
H. to L. Edits of G, exactly like B to F: both sticks UP, DOWN, LEFT, RIGHT, then all buttons
   pressed. Change nothing else.

For the edits, the tilted stick must read clearly at phone size: show the shaft leaning and the
ball top displaced in that direction, with the rubber dust washer and shadow responding. Keep the
rest of the image pixel-identical as far as you can; only the controls should change.

When done, list the images in order A to L with one line on each.
