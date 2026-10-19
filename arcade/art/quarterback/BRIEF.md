# Art brief: QUARTERBACK SIMULATOR cabinet

The exact prompt given to Codex (`codex exec -s workspace-write --skip-git-repo-check -C
art/quarterback - < brief`). Its images were saved into `src/` and cut into sprites with
`uv run --script tools/slice_cabinet.py art/quarterback/slice.json`.

---

## What you are designing

Arcade cabinet art for one game in "Peter's Arcade", small games played in a web browser inside
a skeuomorphic arcade cabinet. The page shows the cabinet filling the viewport; the live game is
drawn (with a CRT shader) over the cabinet's screen, and the joystick and buttons painted on the
control panel are the real touch controls on phones. Make it look like a real, lovingly made
1980s arcade cabinet for this specific game. You own the visual design.

This one is a guest game: it was made by one of the Bullock brothers, not by Peter. So wherever
the cabinet carries a maker's name or plaque, it says "Bullock Bros." (exactly that spelling, with
the full stop). Do not write "Peter's Arcade" anywhere on this cabinet.

The game, QUARTERBACK SIMULATOR: a side-view football game on a wide green field with a dark-green
strip of turf along the bottom and a BLUE end zone at the right edge, marked END ZONE. The players
are simple stick figures: your quarterback (QB) and wide receiver (WR) are BLUE, the two defenders
(D) are RED. The QB holds the ball; you run, jump over defenders, and hold THROW to charge a pass:
a yellow dotted arc grows and shrinks to show where the ball will land, and you let go to throw
the yellow ball. Catch it with the receiver and run him into the end zone for 6 points. Four
downs to score, or it's a turnover on downs. Think Tecmo Bowl / 10-Yard Fight era sports
cabinets: stadium lights, team colours, a gridiron, a football. The personality is yours. ONE
player only.

Control panel (single player, a compact centred panel):
- one ball-top joystick, labelled RUN (with left/right arrows if you like)
- one big JUMP button, labelled JUMP
- one big THROW button, labelled THROW
- one "START" button (labelled START, or "1 PLAYER")
There is no second player: no second joystick, no second set of buttons, no 2 PLAYER button.
Text in the art is welcome; spell it exactly. Every control must be clearly visible, separate from
the others, and large enough to press with a thumb on a phone.

Hard requirements for every image:
- The screen area is a flat, plain, near-black rectangle with an exact 2:1 aspect ratio
  (width:height = 2:1, a wide landscape-shaped screen, twice as wide as it is tall) and nothing
  drawn in it. The live game will be drawn over it. Make it as large as the composition allows.
- Seen straight on, no perspective tilt, so the screen is a true rectangle.
- The marquee title reads QUARTERBACK SIMULATOR (it may be split over two lines).

## Images to make, in this exact order, and where to save them

Save each finished image as PNG at exactly these paths (relative to your working directory). If
your image tool saves elsewhere, copy each file there with a shell command.

A. src/portrait-base.png, PORTRAIT BASE (1024x1536): the whole cabinet seen head-on, for a phone
   held upright and for desktop. Marquee at top, screen in the middle, control panel below with
   the joystick on the left, JUMP and THROW buttons on the right, START button between or above
   them. Joystick upright/centered, all buttons up.
B. src/portrait-up.png: edit of A, the joystick tilted UP (pushed away from the player). Change
   nothing else.
C. src/portrait-down.png: edit of A, the joystick tilted DOWN (pulled toward the player).
D. src/portrait-left.png: edit of A, the joystick tilted LEFT.
E. src/portrait-right.png: edit of A, the joystick tilted RIGHT.
F. src/portrait-pressed.png: edit of A, all three buttons (JUMP, THROW and START) pressed in, lit
   up. Change nothing else.

G. src/landscape-base.png, LANDSCAPE BASE (1536x1024): a composition of the same cabinet for a
   phone held sideways. The screen must be as large as possible and centered; the controls flank
   it: the joystick to the LEFT of the screen, the JUMP and THROW buttons to the RIGHT of the
   screen (one above the other), and the START button below the joystick on the left side. A
   short marquee strip is fine. Same visual design as A.
H. to L. src/landscape-up.png, src/landscape-down.png, src/landscape-left.png,
   src/landscape-right.png, src/landscape-pressed.png: edits of G, exactly like B to F.

For the edits, the tilted stick must read clearly at phone size: show the shaft leaning and the
ball top displaced in that direction, with the rubber dust washer and shadow responding. Keep the
rest of the image pixel-identical as far as you can; only the controls should change.

When done, list the images in order A to L with one line on each.
