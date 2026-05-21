// Title renders once in init — no re-render needed on screen transitions
function renderTitle() {
  const el = document.getElementById('screen-title');
  el.innerHTML = `
    <div class="title-logo">
      <h1>Creature Battle</h1>
      <div class="subtitle">Rental Combat Alpha</div>
    </div>
    <div class="title-creatures">
      ${RENTAL_ROSTER.map((c, i) => `
        <img class="title-creature-sprite" src="${c.sprite}" alt="${c.name}" style="animation-delay:${i * 0.4}s">
      `).join('')}
    </div>
    <div class="title-press-start">Press Enter or Click to Start</div>
  `;

  el.addEventListener('click', () => { playClick(); setScreen('mode-select'); });
}
