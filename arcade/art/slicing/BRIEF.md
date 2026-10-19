# Art brief: MONSTER SLICING cabinet

The exact prompt given to `codex exec -s read-only` (image tool only). Outputs were copied into
`src/` and cut into sprites with `uv run --script tools/slice_cabinet.py art/slicing/slice.json`.

The first run's portrait images (A to F) were used. Its landscape base misspelled the title
("MONSER SLICING"), so that run was stopped and the landscape set was regenerated in a second
session with the same text up to "## Images to make", followed by the landscape-only section
reproduced at the end of this file. That run made one failed (unchanged) edit before the UP edit;
it was discarded.

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

The game, MONSTER SLICING: a one-player, top-down, Robotron-style twin-stick survival game on a
pitch-black arena. The hero is a round BLUE blob with big white eyes and a smile. Monsters charge
in from every edge of the screen: red spiky ones, green triangles, purple blobs and orange
diamonds, all with yellow eyes and jagged white teeth. The hero swings a white sword (it glows
yellow when powered up) to slice them before they hit. Slain monsters drop green hearts (health)
and silver swords (weapon boost). A green health bar, the score and the wave number are on screen.
Waves get faster and busier until the hero falls. Think swords, slashes, monster claw marks,
a cheerful-but-spooky 80s monster-movie vibe; the theme is yours.

Control panel (ONE player, twin-stick):
- LEFT: a ball-top joystick labelled MOVE
- RIGHT: a second ball-top joystick labelled SLICE (pushing it swings the sword that way)
- one big round button labelled SLICE (swings the sword), near the right-hand joystick
- one START button labelled START (this is a 1-player game: there is no 2 PLAYER button)
Text in the art is welcome; spell it exactly. Every control must be clearly visible, separate
from the others, and large enough to press with a thumb on a phone. The two joysticks must be
well apart (one per thumb).

Hard requirements for every image:
- The screen area is a flat, plain, near-black rectangle with an exact 4:3 aspect ratio
  (width:height = 4:3) and nothing drawn in it. The live game will be drawn over it. Make it as
  large as the composition allows.
- Seen straight on, no perspective tilt, so the screen is a true rectangle.

## Images to make, in this exact order

A. PORTRAIT BASE (1024x1536): the whole cabinet seen head-on, for a phone held upright and for
   desktop. Marquee with the title MONSTER SLICING at top, screen in the middle, control panel
   below: MOVE stick on the left, SLICE stick on the right, the SLICE button and START button
   placed so nothing is crowded. Both joysticks upright/centered, all buttons up.
B. Edit of A: BOTH joysticks tilted UP (pushed away from the player). Change nothing else.
C. Edit of A: BOTH joysticks tilted DOWN (pulled toward the player). Change nothing else.
D. Edit of A: BOTH joysticks tilted LEFT. Change nothing else.
E. Edit of A: BOTH joysticks tilted RIGHT. Change nothing else.
F. Edit of A: both buttons (SLICE and START) pressed in, lit up. Change nothing else.

G. LANDSCAPE BASE (1536x1024): a composition of the same cabinet for a phone held sideways. The
   screen must be as large as possible and centered; the controls flank it: the MOVE joystick to
   the left of the screen, the SLICE joystick to the right of the screen, the SLICE button under
   the SLICE joystick and the START button under the MOVE joystick. A short marquee strip is fine.
   Same visual design as A.
H. to L. Edits of G, exactly like B to F: both sticks UP, DOWN, LEFT, RIGHT, then both buttons
   pressed. Change nothing else.

For the edits, the tilted stick must read clearly at phone size: show the shaft leaning and the
ball top displaced in that direction, with the rubber dust washer and shadow responding. Keep the
rest of the image pixel-identical as far as you can; only the controls should change.

When done, list the images in order A to L with one line on each.

---

Second session (landscape only): the text above up to "## Images to make, in this exact order",
then:

## Images to make, in this exact order

Only the LANDSCAPE layout is needed in this session.

A. LANDSCAPE BASE (1536x1024): the cabinet seen head-on, for a phone held sideways. The screen
   must be as large as possible and centered; the controls flank it: the MOVE joystick to the
   left of the screen, the SLICE joystick to the right of the screen, the SLICE button under the
   SLICE joystick and the START button under the MOVE joystick. A short marquee strip across the
   top with the title. Both joysticks upright/centered, all buttons up.
   The title must be spelled exactly M-O-N-S-T-E-R S-L-I-C-I-N-G ("MONSTER SLICING", with the T).
   Check the spelling before moving on; regenerate the base if any letter is wrong.
B. Edit of A: BOTH joysticks tilted UP (pushed away from the player). Change nothing else.
C. Edit of A: BOTH joysticks tilted DOWN (pulled toward the player). Change nothing else.
D. Edit of A: BOTH joysticks tilted LEFT. Change nothing else.
E. Edit of A: BOTH joysticks tilted RIGHT. Change nothing else.
F. Edit of A: both buttons (SLICE and START) pressed in, lit up. Change nothing else.

For the edits, the tilted stick must read clearly at phone size: show the shaft leaning and the
ball top displaced in that direction, with the rubber dust washer and shadow responding. Keep the
rest of the image pixel-identical as far as you can; only the controls should change.

When done, list the images in order A to F with one line on each.
