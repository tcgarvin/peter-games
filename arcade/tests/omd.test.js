// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame } from '../games/omd.js';
import { PlayerInput } from '../shell/controls.js';

const SECOND = 60;

function botDrivenInput(game) {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    sample() {
      players.forEach((p, i) => {
        if (!game.bots[i]) return p.apply(0, 0, {});
        const bot = game.botInput(i);
        p.apply(bot.x, bot.y, bot.buttons);
      });
    },
    player: (i) => players[i],
  };
}

function idle() {
  const players = [new PlayerInput(), new PlayerInput()];
  return { player: (i) => players[i], players };
}

test('two CPU defenders hold off several waves, and the run ends with the wave reached', () => {
  let finished = 0;
  for (let round = 0; round < 3; round++) {
    const game = createGame({ bots: [true, true] });
    const input = botDrivenInput(game);
    let ticks = 0;
    while (!game.over && ticks < 8 * 60 * SECOND) {
      input.sample();
      game.update(input);
      ticks++;
    }
    assert.ok(game.waveNumber >= 4, `round ${round} only reached wave ${game.waveNumber}`);
    if (game.over) {
      finished++;
      assert.match(game.resultText, /^WAVE \d+ REACHED$/);
      assert.equal(game.resultText, `WAVE ${game.waveNumber} REACHED`);
    }
  }
  assert.ok(finished >= 1, 'no CPU-vs-CPU run finished within 8 minutes');
});

test('a lone CPU partner cannot hold the objective forever', () => {
  const game = createGame({ bots: [false, true] });
  const input = botDrivenInput(game);
  for (let i = 0; i < 10 * 60 * SECOND && !game.over; i++) {
    input.sample();
    game.update(input);
  }
  assert.ok(game.over);
});

test('the first wave of seven orcs arrives after three seconds', () => {
  const game = createGame({ bots: [false, false] });
  const input = idle();
  for (let i = 0; i < 3 * SECOND - 1; i++) game.update(input);
  assert.equal(game.waveNumber, 0);
  game.update(input);
  game.update(input);
  assert.equal(game.waveNumber, 1);
  assert.equal(game.enemies.length, 7);
});

test('holding ATTACK swings once every half second at orcs in reach', () => {
  const game = createGame({ bots: [false, false] });
  const input = idle();
  const hero = game.players[0];
  game.startWave();
  const victim = game.enemies[0];
  game.enemies = [victim];
  victim.speed = 0;
  victim.x = hero.x + 30;
  victim.y = hero.y;
  const start = victim.health;
  const press = () => {
    input.players[0].apply(0, 0, { fire: true });
    game.update(input);
  };
  press();
  assert.equal(victim.health, start - 20);
  for (let i = 0; i < 29; i++) press();
  assert.equal(victim.health, start - 20, 'no second swing inside the cooldown');
  press();
  assert.equal(victim.health, start - 40);
});

test('orcs at the objective wear it down and end the game', () => {
  const game = createGame({ bots: [false, false] });
  const input = idle();
  game.update(input);
  game.startWave();
  for (const orc of game.enemies) {
    orc.x = game.objective.x + 30;
    orc.y = game.objective.y;
  }
  const before = game.objective.health;
  game.update(input);
  assert.ok(game.objective.health < before);
  for (let i = 0; i < 120 * SECOND && !game.over; i++) game.update(input);
  assert.ok(game.over);
  assert.equal(game.resultText, `WAVE ${game.waveNumber} REACHED`);
});

test('every gate in the maze leads to the objective', () => {
  for (let round = 0; round < 40; round++) {
    const game = createGame({ bots: [true, true] });
    const bot = game.bots[0];
    const dist = bot.distancesFrom(game.objective.x, game.objective.y - 60);
    for (const [ex, ey] of game.entrances) {
      const x = Math.max(40, Math.min(960, ex));
      const y = Math.max(40, Math.min(760, ey));
      assert.ok(bot.nearestOpen(x, y, dist, 6) >= 0, `round ${round}: gate ${ex},${ey} is sealed off`);
    }
  }
});
