// The text cards drawn over a game's screen (title / pause / game over), shared by the arcade
// shell and the lobby's attract-loop recorder.

export const FONT = '"Press Start 2P", monospace';

/**
 * Draw centered lines of text over the whole canvas, optionally dimming it first. Cards are laid
 * out for an 800x600 screen and scaled to fit the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{text: string, size: number, color?: string}[]} lines empty text leaves a gap
 * @param {number} dim opacity of the black wash behind the text (0 for none)
 */
export function drawCard(ctx, lines, dim) {
  const { width: w, height: h } = ctx.canvas;
  const cardScale = Math.min(w / 800, h / 600);
  if (dim) {
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(cardScale, cardScale);
  ctx.translate(-w / 2, -h / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const total = lines.reduce((sum, l) => sum + l.size * 2, 0);
  let y = h / 2 - total / 2;
  for (const line of lines) {
    y += line.size;
    if (line.text) {
      ctx.font = `${line.size}px ${FONT}`;
      // Long titles on narrow (vertical) screens shrink to fit.
      const room = (w * 0.92) / cardScale;
      const width = ctx.measureText(line.text).width;
      if (width > room) ctx.font = `${(line.size * room) / width}px ${FONT}`;
      ctx.lineWidth = line.size * 0.35;
      ctx.strokeStyle = '#000';
      ctx.strokeText(line.text, w / 2, y);
      ctx.fillStyle = line.color ?? '#fff';
      ctx.fillText(line.text, w / 2, y);
    }
    y += line.size;
  }
  ctx.restore();
}
