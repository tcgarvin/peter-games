# Art brief: PLATFORMER cabinet

The exact prompt given to `codex exec -s read-only` (image tool only). Outputs were copied into
`src/` and cut into sprites with `uv run --script tools/slice_cabinet.py art/platformer/slice.json`.

---

You have no working shell in this session (the sandbox cannot start), and you do not need one.
Use ONLY your built-in image generation tool (generate and edit). Do not try to read or write
files. The images are collected automatically from where your tool saves them.

## What you are designing

Arcade cabinet art for one game in "Peter's Arcade", small games played in a web browser inside
a skeuomorphic arcade cabinet. The page shows the cabinet filling the viewport; the live game is
drawn (with a CRT shader) over the cabinet's screen, and the joystick and buttons painted on the
control panel are the real touch controls on phones. Make it look like a real, lovingly made
1980s arcade cabinet for this specific game. You own the visual design.

The game, PLATFORMER: a single-screen jump-and-run in bold primitive shapes on a pure black
background. The hero is a plain BLUE square. Brown (wooden/brick) ledges float at different
heights, a PURPLE platform slides back and forth, spinning YELLOW coins sit on the ledges, and RED
triangular spikes lurk in gaps. Collect every coin to clear the level; touch a spike or fall off
the bottom and it's game over. Think early-80s Donkey Kong / Jumpman era colour and energy, but
the cabinet's personality is yours to invent. ONE player only.

Control panel (single player, a compact centred panel):
- one ball-top joystick (left/right runs; label it RUN or with left/right arrows as you like)
- one big JUMP button, labelled JUMP
- one "START" button (labelled START, or "1 PLAYER")
There is no second player: no second joystick, no second set of buttons, no 2 PLAYER button.
Text in the art is welcome; spell it exactly. Every control must be clearly visible, separate from
the others, and large enough to press with a thumb on a phone.

Hard requirements for every image:
- The screen area is a flat, plain, near-black rectangle with an exact 4:3 aspect ratio
  (width:height = 4:3, landscape-shaped screen) and nothing drawn in it. The live game will be
  drawn over it. Make it as large as the composition allows.
- Seen straight on, no perspective tilt, so the screen is a true rectangle.

## Images to make, in this exact order

A. PORTRAIT BASE (1024x1536): the whole cabinet seen head-on, for a phone held upright and for
   desktop. Marquee with the title PLATFORMER at top, screen in the middle, control panel below
   with the joystick on the left, JUMP button on the right, START button between or above them.
   Joystick upright/centered, all buttons up.
B. Edit of A: the joystick tilted UP (pushed away from the player). Change nothing else.
C. Edit of A: the joystick tilted DOWN (pulled toward the player). Change nothing else.
D. Edit of A: the joystick tilted LEFT. Change nothing else.
E. Edit of A: the joystick tilted RIGHT. Change nothing else.
F. Edit of A: both buttons (JUMP and START) pressed in, lit up. Change nothing else.

G. LANDSCAPE BASE (1536x1024): a composition of the same cabinet for a phone held sideways. The
   screen must be as large as possible and centered; the controls flank it: the joystick to the
   LEFT of the screen, the JUMP button to the RIGHT of the screen, and the START button below the
   JUMP button on the right side. A short marquee strip is fine. Same visual design as A.
H. to L. Edits of G, exactly like B to F: joystick UP, DOWN, LEFT, RIGHT, then both buttons
   pressed. Change nothing else.

For the edits, the tilted stick must read clearly at phone size: show the shaft leaning and the
ball top displaced in that direction, with the rubber dust washer and shadow responding. Keep the
rest of the image pixel-identical as far as you can; only the controls should change.

When done, list the images in order A to L with one line on each.
