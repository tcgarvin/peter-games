// The arcade floor: every game's full cabinet standing in one row against the back wall, each
// screen playing its attract loop. The row scrolls sideways (swipe, wheel, arrow keys or the
// side buttons); a cabinet links to #<game id>.
//
// Per game it reads art/<id>/floor.webp + floor.json (tools/make_floor.py) and
// art/<id>/attract.webp (tools/record_attract.py).

import { GAMES } from '../games/registry.js';

const LAST_GAME_KEY = 'arcade.lastGame';

async function loadFloor(artRoot, id) {
  const response = await fetch(`${artRoot}${id}/floor.json`);
  if (!response.ok) throw new Error(`Could not load ${artRoot}${id}/floor.json (${response.status})`);
  return response.json();
}

// The last game played is remembered only as a convenience; storage can be unavailable.
function readLastGame() {
  try {
    return sessionStorage.getItem(LAST_GAME_KEY);
  } catch {
    return null;
  }
}

function rememberGame(id) {
  try {
    sessionStorage.setItem(LAST_GAME_KEY, id);
  } catch {
    // Private mode or blocked storage: the lobby just starts at the first cabinet next time.
  }
}

const percent = (part, whole) => `${(100 * part) / whole}%`;

function buildCabinet(game, floor, artRoot) {
  const [w, h] = floor.size;
  const { screen } = floor;
  const item = document.createElement('li');
  item.className = 'floor-slot';
  item.innerHTML = `
    <a class="floor-cabinet" href="#${game.id}" style="aspect-ratio: ${w} / ${h}">
      <img class="floor-attract" alt="" loading="lazy" decoding="async">
      <img class="floor-art" loading="lazy" decoding="async">
      <span class="floor-glass"></span>
    </a>
    <div class="floor-plaque">
      <span class="floor-players"></span>
      <span class="floor-blurb"></span>
    </div>`;
  const link = item.querySelector('.floor-cabinet');
  link.addEventListener('click', () => rememberGame(game.id));
  link.setAttribute('aria-label', `Play ${game.title}`);
  link.style.setProperty('--screen-x', percent(screen.x, w));
  link.style.setProperty('--screen-y', percent(screen.y, h));
  link.style.setProperty('--screen-w', percent(screen.w, w));
  link.style.setProperty('--screen-h', percent(screen.h, h));
  const art = item.querySelector('.floor-art');
  art.src = `${artRoot}${game.id}/floor.webp`;
  art.alt = `${game.title} arcade cabinet`;
  item.querySelector('.floor-attract').src = `${artRoot}${game.id}/attract.webp`;
  item.querySelector('.floor-players').textContent = game.players === '1' ? '1 PLAYER' : `${game.players} PLAYERS`;
  item.querySelector('.floor-blurb').textContent = game.blurb;
  return item;
}

/** @param {HTMLElement} host @param {string} artRoot URL prefix of the art folders, ending in '/' */
export async function showLobby(host, artRoot) {
  host.className = 'lobby';
  host.innerHTML = `
    <header class="lobby-sign">
      <h1>Peter's Arcade</h1>
      <p>Free play &middot; pick a cabinet</p>
    </header>
    <ul class="floor-row" aria-label="Games"></ul>
    <button class="floor-nav floor-prev" type="button" aria-label="Previous games">&#9664;</button>
    <button class="floor-nav floor-next" type="button" aria-label="More games">&#9654;</button>`;
  const row = host.querySelector('.floor-row');
  const floors = await Promise.all(GAMES.map((game) => loadFloor(artRoot, game.id)));
  const slots = GAMES.map((game, i) => buildCabinet(game, floors[i], artRoot));
  row.append(...slots);

  const slotWidth = () => slots[0].getBoundingClientRect().width;
  const scrollBySlots = (n) => row.scrollBy({ left: n * slotWidth(), behavior: 'smooth' });
  host.querySelector('.floor-prev').addEventListener('click', () => scrollBySlots(-1));
  host.querySelector('.floor-next').addEventListener('click', () => scrollBySlots(1));

  const updateNav = () => {
    const max = row.scrollWidth - row.clientWidth;
    host.classList.toggle('at-start', row.scrollLeft <= 2);
    host.classList.toggle('at-end', row.scrollLeft >= max - 2);
  };
  row.addEventListener('scroll', updateNav, { passive: true });
  addEventListener('resize', updateNav);

  // A mouse wheel scrolls vertically; turn that into walking along the row.
  row.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      row.scrollBy({ left: e.deltaY * (e.deltaMode === 1 ? 40 : 1) });
    },
    { passive: false },
  );
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') scrollBySlots(1);
    else if (e.key === 'ArrowLeft') scrollBySlots(-1);
    else return;
    e.preventDefault();
  });

  const last = GAMES.findIndex((g) => g.id === readLastGame());
  if (last >= 0) slots[last].scrollIntoView({ inline: 'center', block: 'nearest' });
  updateNav();
}
