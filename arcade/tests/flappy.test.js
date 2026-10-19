// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGame } from '../games/flappy.js';
import { PlayerInput } from '../shell/controls.js';

const COUNTDOWN_TICKS = 180;

function botDrivenInput(game) {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    sample() {
      players.forEach((p, i) => {
        const bot = game.botInput(i);
        p.apply(bot.x, bot.y, bot.buttons);
      });
    },
    player: (i) => players[i],
  };
}

function humanInput() {
  const players = [new PlayerInput(), new PlayerInput()];
  return {
    players,
    /** One tick of held buttons per player, e.g. [true, false]. */
    hold(fire) {
      players.forEach((p, i) => p.apply(0, 0, { fire: Boolean(fire[i]) }));
    },
    player: (i) => players[i],
  };
}

function skipCountdown(game, input) {
  for (let i = 0; i < COUNTDOWN_TICKS; i++) {
    input.hold([false, false]);
    game.update(input);
  }
}

test('two CPU flappers finish a game with a result within a few minutes', () => {
  for (let round = 0; round < 10; round++) {
    const game = createGame({ bots: [true, true] });
    const input = botDrivenInput(game);
    let ticks = 0;
    while (!game.over && ticks < 60 * 60 * 3) {
      input.sample();
      game.update(input);
      ticks++;
    }
    assert.ok(game.over, `round ${round} did not finish in ${ticks} ticks`);
    assert.match(game.resultText, /^(PLAYER [12] WINS|TIE GAME)$/);
  }
});

test('a CPU threads several pipes before crashing', () => {
  let best = 0;
  for (let round = 0; round < 5; round++) {
    const game = createGame({ bots: [true, true] });
    const input = botDrivenInput(game);
    for (let t = 0; t < 60 * 60 * 3 && !game.over; t++) {
      input.sample();
      game.update(input);
    }
    best = Math.max(best, ...game.birds.map((b) => b.score));
  }
  assert.ok(best >= 3, `best CPU score was only ${best}`);
});

test('botInput refuses a human player', () => {
  const game = createGame({ bots: [false, true] });
  assert.throws(() => game.botInput(0));
  assert.doesNotThrow(() => game.botInput(1));
});

test('FLAP lifts the bird once per press, not while held', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  skipCountdown(game, input);
  const bird = game.birds[0];
  input.hold([true, false]);
  game.update(input);
  assert.equal(bird.vel, -7 + 0.25);
  for (let i = 0; i < 10; i++) {
    input.hold([true, false]);
    game.update(input);
  }
  assert.equal(bird.vel, -7 + 0.25 * 11, 'holding FLAP must not flap again');
  input.hold([false, false]);
  game.update(input);
  input.hold([true, false]);
  game.update(input);
  assert.equal(bird.vel, -7 + 0.25);
});

test('birds hold still during the countdown', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  for (let i = 0; i < COUNTDOWN_TICKS - 1; i++) {
    input.hold([i % 2 === 0, true]);
    game.update(input);
  }
  assert.deepEqual(
    game.birds.map((b) => b.y),
    [300, 300],
  );
  assert.equal(game.pipes.length, 0);
});

test('the first crash ends the game and the other bird wins', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  skipCountdown(game, input);
  // P1 never flaps and hits the floor; P2 flaps whenever it sinks below the middle.
  let ticks = 0;
  while (!game.over && ticks < 600) {
    input.hold([false, game.birds[1].y > 300 && ticks % 2 === 0]);
    game.update(input);
    ticks++;
  }
  assert.ok(game.over);
  assert.equal(game.birds[0].alive, false);
  assert.equal(game.birds[1].alive, true);
  assert.equal(game.resultText, 'PLAYER 2 WINS');
});

test('each bird scores the pipes it passes (the left bird scored nothing in the original)', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  skipCountdown(game, input);
  // Keep both birds safely inside the gap by parking them there each tick.
  let ticks = 0;
  while (ticks < 600) {
    for (const bird of game.birds) {
      bird.y = game.nextPipe(bird)?.gapCenter ?? 300;
      bird.vel = 0;
    }
    input.hold([false, false]);
    game.update(input);
    ticks++;
  }
  assert.ok(!game.over);
  assert.ok(game.birds[1].score >= 2);
  assert.ok(game.birds[0].score >= 1, 'P1 must score too');
});

test('a simultaneous crash goes to the higher score', () => {
  const game = createGame({ bots: [false, false] });
  const input = humanInput();
  skipCountdown(game, input);
  game.birds[0].score = 4;
  game.birds[1].score = 2;
  for (let i = 0; i < 600 && !game.over; i++) {
    input.hold([false, false]);
    game.update(input);
  }
  assert.ok(game.over);
  assert.ok(game.birds.every((b) => !b.alive), 'both birds fall from the same height together');
  assert.equal(game.resultText, 'PLAYER 1 WINS');
});
