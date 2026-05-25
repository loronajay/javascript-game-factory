function renderControlHint(desktopText, touchText) {
  return `
    <span class="control-hint-desktop">${desktopText}</span>
    <span class="control-hint-touch">${touchText}</span>
  `;
}

function renderTouchActionBar(actions) {
  if (!actions || !actions.length) return '';
  return `
    <div class="touch-action-bar">
      ${actions.map(action => `
        <button class="touch-action-btn ${action.primary ? 'touch-action-primary' : ''}"
                type="button"
                data-touch-action="${action.id}">
          ${action.label}
        </button>
      `).join('')}
    </div>
  `;
}

function bindTouchActionBar(root, handlers) {
  if (!root || !handlers) return;
  root.querySelectorAll('[data-touch-action]').forEach(button => {
    const handler = handlers[button.dataset.touchAction];
    if (!handler) return;
    button.addEventListener('click', event => {
      event.stopPropagation();
      handler(event);
    });
  });
}

if (typeof window !== 'undefined') {
  window.renderControlHint = renderControlHint;
  window.renderTouchActionBar = renderTouchActionBar;
  window.bindTouchActionBar = bindTouchActionBar;
}
