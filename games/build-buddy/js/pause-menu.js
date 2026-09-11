import { APP_SCREENS, resetToMainMenu } from './app-shell.js';

// A local overlay preserves the running game and its current stage.
export class PauseMenu {
  constructor(app) {
    this.app = app;
    this.opened = false;
    this.button = document.createElement('button');
    this.button.id = 'pauseButton';
    this.button.textContent = 'Pause / Esc';
    this.button.addEventListener('click', () => this.open());
    this.overlay = document.createElement('section');
    this.overlay.id = 'pauseMenu';
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'pauseTitle');
    this.overlay.innerHTML = `<div class="shell-panel"><h2 id="pauseTitle">Paused</h2><p class="shell-description"></p><div class="shell-actions"><button data-resume>Resume</button><button data-menu>Main Menu</button></div></div>`;
    this.resume = this.overlay.querySelector('[data-resume]');
    this.menu = this.overlay.querySelector('[data-menu]');
    this.resume.addEventListener('click', () => this.close());
    this.menu.addEventListener('click', () => {
      const online = !!app.state.onlineGameplay;
      app.setState(resetToMainMenu(app.state));
      if (online) app.onlineClient.leaveLobby?.();
    });
    app.canvas.parentElement.append(this.button, this.overlay);
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && app.state.screen === APP_SCREENS.GAMEPLAY) {
        event.preventDefault();
        if (!event.repeat) this.opened ? this.close() : this.open();
      }
      if (this.opened && event.code === 'Tab') {
        event.preventDefault();
        (document.activeElement === this.resume ? this.menu : this.resume).focus();
      }
    });
  }

  sync() {
    this.button.hidden = this.app.state.screen !== APP_SCREENS.GAMEPLAY || this.opened;
  }

  open() {
    if (this.app.state.screen !== APP_SCREENS.GAMEPLAY || this.opened) return;
    this.opened = true;
    this.app.game?.input.setEnabled(false);
    this.overlay.querySelector('h2').textContent = this.app.state.onlineGameplay ? 'Game Menu' : 'Paused';
    this.overlay.querySelector('p').textContent = this.app.state.onlineGameplay
      ? 'The online match keeps running. Returning to the menu leaves the match.'
      : 'Take a break. Returning to the menu ends this attempt.';
    this.overlay.hidden = false;
    this.app.canvas.inert = true;
    this.app.mobileControls.inert = true;
    this.app.viewModeControls.inert = true;
    this.sync();
    this.resume.focus();
  }

  close() {
    if (!this.opened) return;
    this.opened = false;
    this.overlay.hidden = true;
    this.app.game?.input.setEnabled(true);
    this.app.accumulator = 0;
    this.app.lastTime = null;
    this.app.canvas.inert = false;
    this.app.mobileControls.inert = false;
    this.app.viewModeControls.inert = false;
    this.sync();
    this.button.focus();
  }
}
