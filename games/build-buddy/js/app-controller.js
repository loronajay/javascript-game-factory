import { Game } from './game.js';
import { VIEW } from './constants.js';
import {
  APP_SCREENS,
  applyOnlineGameplayDisconnect,
  applyOnlineClientSnapshot,
  applyOnlineRunComplete,
  applyOnlineStageResult,
  continueFromStageResult,
  createAppShellState,
  getPracticeStageOptions,
  goToOnlineMenu,
  goToModeSelect,
  goToPracticeSelect,
  joinOnlineLobby,
  markOnlineReady,
  resetToMainMenu,
  startOnlineSearch,
  startPrivateLobby,
  startDebugLab,
  startLocalRun,
  startOnlineRunFromLobby,
  startPractice,
  submitStageClear,
  submitStageFailure,
} from './app-shell.js';
import { createOnlineClient } from './online-client.js';
import {
  createBuilderCommandMessage,
  createRunnerInputMessage,
  createStageStartMessage,
  receiveStageStartMessage,
} from './online-gameplay.js';

const FIXED_DT = 1 / 60;

function formatStageTitle(stageId) {
  return stageId
    ? stageId.replace(/^pack_(\d+)_stage_(\d+)$/, 'Pack $1 / Stage $2').replaceAll('_', ' ')
    : 'Stage';
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

export class AppController {
  constructor({
    canvas,
    shellRoot,
    hudRoot,
    viewModeControls,
    mobileControls,
    storage = globalThis.localStorage,
    onlineClient = createOnlineClient(),
    profileSource = globalThis,
  } = {}) {
    this.canvas = canvas;
    this.shellRoot = shellRoot;
    this.hudRoot = hudRoot;
    this.viewModeControls = viewModeControls;
    this.mobileControls = mobileControls;
    this.state = createAppShellState({ storage });
    this.onlineClient = onlineClient;
    this.profileSource = profileSource;
    this.pendingRoomCode = '';
    this.game = null;
    this.accumulator = 0;
    this.lastTime = null;
    this.onlineTick = 0;
    this.onlineSnapshotTick = 0;
    this.sentOnlineMessageCount = 0;
    this.processedOnlineMessages = new Set();

    this.onlineClient.subscribe?.((snapshot) => {
      if (this.state.screen === APP_SCREENS.ONLINE_LOBBY) {
        const lobbyState = applyOnlineClientSnapshot(this.state, snapshot);
        if (snapshot.status === 'started') {
          this.setState(startOnlineRunFromLobby(lobbyState));
          this.broadcastOnlineStageStart();
        } else {
          this.setState(lobbyState);
        }
      } else if (this.state.screen === APP_SCREENS.GAMEPLAY && this.state.onlineGameplay) {
        this.applyOnlineGameplaySnapshot(snapshot);
      }
    });

    this.canvas.width = VIEW.width;
    this.canvas.height = VIEW.height;
    this.renderShell();
  }

  update(timestamp) {
    if (this.lastTime === null) this.lastTime = timestamp ?? performance.now();
    if (timestamp == null) return;

    this.accumulator += Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    while (this.accumulator >= FIXED_DT) {
      if (this.state.screen === APP_SCREENS.GAMEPLAY) this.updateGameplayTick();
      this.accumulator -= FIXED_DT;
    }

    if (this.state.screen === APP_SCREENS.GAMEPLAY) this.game?.render();
  }

  setState(nextState) {
    const previousStageId = this.state.session?.currentStageId ?? null;
    const previousScreen = this.state.screen;
    this.state = nextState;

    const nextStageId = this.state.session?.currentStageId ?? null;
    if (this.state.screen === APP_SCREENS.GAMEPLAY && (previousScreen !== APP_SCREENS.GAMEPLAY || previousStageId !== nextStageId)) {
      this.createGame();
    }
    if (this.state.screen !== APP_SCREENS.GAMEPLAY) this.game = null;
    this.renderShell();
  }

  createGame() {
    this.game = new Game(this.canvas, {
      initialStageId: this.state.session.currentStageId,
      viewMode: this.state.viewMode,
      onStageClear: (details) => this.submitStageClear(details),
      onStageFailure: (details) => this.submitStageFailure(details.reason, details),
    });
  }

  updateGameplayTick() {
    if (!this.state.onlineGameplay) {
      this.game?.update(FIXED_DT);
      return;
    }

    this.onlineTick += 1;
    if (this.state.onlineGameplay.isHost) {
      this.game?.update(FIXED_DT);
      if (this.onlineTick - this.onlineSnapshotTick >= 6) {
        this.onlineSnapshotTick = this.onlineTick;
        this.onlineClient.sendState?.(this.game.createStateSnapshot(this.onlineTick));
      }
      return;
    }

    this.sendLocalOnlineCommands();
  }

  localOnlineRole() {
    const roles = this.state.onlineGameplay?.session
      ? this.state.onlineGameplay.session.stageIndex % 2 === 0
        ? {
          runnerPlayerId: this.state.onlineGameplay.session.players[0].id,
          builderPlayerId: this.state.onlineGameplay.session.players[1].id,
        }
        : {
          runnerPlayerId: this.state.onlineGameplay.session.players[1].id,
          builderPlayerId: this.state.onlineGameplay.session.players[0].id,
        }
      : null;
    const localPlayerId = this.state.onlineGameplay?.localPlayerId;
    if (!roles || !localPlayerId) return '';
    if (roles.runnerPlayerId === localPlayerId) return 'runner';
    if (roles.builderPlayerId === localPlayerId) return 'builder';
    return '';
  }

  sendLocalOnlineCommands() {
    const role = this.localOnlineRole();
    if (role === 'runner') {
      const input = this.game?.input;
      this.onlineClient.sendOnlineGameplayMessage?.(createRunnerInputMessage({
        tick: this.onlineTick,
        left: input?.axisX() < 0,
        right: input?.axisX() > 0,
        up: input?.upHeld(),
        down: input?.downHeld(),
        jump: input?.jumpHeld(),
        reposition: input?.consumeReposition?.(),
      }));
      input?.endFrame?.();
    }
    if (role === 'builder') {
      const command = this.consumeLocalBuilderCommand();
      if (command) this.onlineClient.sendOnlineGameplayMessage?.(command);
      this.game?.input?.endFrame?.();
    }
  }

  consumeLocalBuilderCommand() {
    const input = this.game?.input;
    if (!input) return null;
    const world = this.game.camera.screenToWorld(input.mouse.x, input.mouse.y);
    const gridX = Math.round(world.x / 40) * 40;
    const gridY = Math.round(world.y / 40) * 40;
    if (input.consumePlace?.()) {
      return createBuilderCommandMessage({
        tick: this.onlineTick,
        action: 'place',
        toolType: input.selectedTool,
        gridX,
        gridY,
      });
    }
    if (input.consumeDelete?.()) {
      return createBuilderCommandMessage({
        tick: this.onlineTick,
        action: 'delete',
        gridX,
        gridY,
      });
    }
    return null;
  }

  submitStageClear(details) {
    this.setState(submitStageClear(this.state, details));
    this.flushOnlineOutboundMessages();
  }

  submitStageFailure(reason, details) {
    this.setState(submitStageFailure(this.state, reason, details));
    this.flushOnlineOutboundMessages();
  }

  broadcastOnlineStageStart() {
    if (!this.state.onlineGameplay?.isHost) return;
    this.onlineClient.sendOnlineGameplayMessage?.(createStageStartMessage(this.state.onlineGameplay, {
      seed: this.state.onlineGameplay.session.stageIndex,
      startAt: Date.now() + 1200,
    }));
  }

  flushOnlineOutboundMessages() {
    const messages = this.state.onlineGameplay?.outboundMessages ?? [];
    for (const message of messages.slice(this.sentOnlineMessageCount)) {
      this.onlineClient.sendOnlineGameplayMessage?.(message);
    }
    this.sentOnlineMessageCount = messages.length;
  }

  onlineMessageKey(kind, payload) {
    return `${kind}:${payload?.senderId ?? ''}:${JSON.stringify(payload?.value ?? payload ?? {})}`;
  }

  applyOnce(kind, payload, apply) {
    if (!payload) return;
    const key = this.onlineMessageKey(kind, payload);
    if (this.processedOnlineMessages.has(key)) return;
    this.processedOnlineMessages.add(key);
    apply(payload);
  }

  applyOnlineGameplaySnapshot(snapshot = {}) {
    const gameplay = snapshot.onlineGameplay ?? {};
    this.applyOnce('stage_start', gameplay.lastStageStart, (message) => {
      if (this.state.onlineGameplay?.isHost) return;
      const onlineGameplay = receiveStageStartMessage(this.state.onlineGameplay, message);
      this.setState({ ...this.state, onlineGameplay, session: onlineGameplay.session });
      this.game?.loadStage(message.value.stageId);
    });
    this.applyOnce('runner_input', gameplay.lastRunnerInput, (message) => {
      if (this.state.onlineGameplay?.isHost) this.game?.applyRunnerInputCommand(message.value);
    });
    this.applyOnce('builder_command', gameplay.lastBuilderCommand, (message) => {
      if (this.state.onlineGameplay?.isHost) this.game?.applyBuilderCommand(message.value);
    });
    this.applyOnce('state_sync', gameplay.lastStateSync, (message) => {
      if (!this.state.onlineGameplay?.isHost) this.game?.applyStateSnapshot(message);
    });
    this.applyOnce('stage_result', gameplay.lastStageResult, (message) => {
      this.setState(applyOnlineStageResult(this.state, message));
    });
    this.applyOnce('run_complete', gameplay.lastRunComplete, (message) => {
      this.setState(applyOnlineRunComplete(this.state, message));
    });
    if (snapshot.status === 'idle') {
      this.setState(applyOnlineGameplayDisconnect(this.state, this.state.onlineGameplay.authorityPlayerId));
    }
  }

  renderShell() {
    this.shellRoot.replaceChildren();
    this.shellRoot.hidden = this.state.screen === APP_SCREENS.GAMEPLAY;
    this.canvas.hidden = this.state.screen !== APP_SCREENS.GAMEPLAY;
    this.hudRoot.hidden = this.state.screen !== APP_SCREENS.GAMEPLAY;
    this.viewModeControls.hidden = this.state.screen !== APP_SCREENS.GAMEPLAY;
    this.mobileControls.hidden = this.state.screen !== APP_SCREENS.GAMEPLAY;

    if (this.state.screen === APP_SCREENS.MAIN_MENU) this.renderMainMenu();
    if (this.state.screen === APP_SCREENS.MODE_SELECT) this.renderModeSelect();
    if (this.state.screen === APP_SCREENS.ONLINE_MENU) this.renderOnlineMenu();
    if (this.state.screen === APP_SCREENS.ONLINE_LOBBY) this.renderOnlineLobby();
    if (this.state.screen === APP_SCREENS.PRACTICE_SELECT) this.renderPracticeSelect();
    if (this.state.screen === APP_SCREENS.STAGE_RESULT) this.renderStageResult();
    if (this.state.screen === APP_SCREENS.RUN_RESULT) this.renderRunResult();
  }

  getFactoryIdentity() {
    const source = this.profileSource;
    const candidates = [
      source?.factoryProfile,
      source?.FactoryProfile,
      source?.JayArcadeProfile,
      source?.playerProfile,
    ];
    const profile = candidates.find((candidate) => candidate && typeof candidate === 'object') ?? {};
    return {
      playerId: profile.playerId || profile.id || profile.userId || '',
      displayName: profile.displayName || profile.name || profile.username || 'Player',
    };
  }

  beginPublicSearch() {
    const identity = this.getFactoryIdentity();
    this.setState(startOnlineSearch(this.state, identity));
    this.onlineClient.setIdentity(identity);
    this.onlineClient.connect();
    this.onlineClient.findLobby({ packId: this.state.packId });
  }

  beginPrivateLobby() {
    const identity = this.getFactoryIdentity();
    this.setState(startPrivateLobby(this.state, identity));
    this.onlineClient.setIdentity(identity);
    this.onlineClient.connect();
    this.onlineClient.createLobby({ packId: this.state.packId });
  }

  beginJoinPrivateLobby() {
    const identity = this.getFactoryIdentity();
    this.setState(joinOnlineLobby(this.state, this.pendingRoomCode, identity));
    this.onlineClient.setIdentity(identity);
    this.onlineClient.connect();
    this.onlineClient.joinLobby(this.pendingRoomCode);
  }

  leaveOnlineLobby() {
    this.onlineClient.leaveLobby?.();
    this.setState(goToOnlineMenu(this.state));
  }

  renderMainMenu() {
    this.shellRoot.append(
      el('div', { className: 'shell-panel shell-panel-main' }, [
        el('p', { className: 'shell-kicker', text: 'Build Buddy' }),
        el('h1', { text: 'Co-op Construction Run' }),
        el('div', { className: 'shell-actions' }, [
          el('button', { text: 'Play', onclick: () => this.setState(goToModeSelect(this.state)) }),
          el('button', { text: 'Debug Lab', onclick: () => this.setState(startDebugLab(this.state)) }),
        ]),
      ]),
    );
  }

  renderModeSelect() {
    this.shellRoot.append(
      el('div', { className: 'shell-panel' }, [
        el('p', { className: 'shell-kicker', text: 'Mode Select' }),
        el('h2', { text: 'Choose a run type' }),
        el('div', { className: 'mode-grid' }, [
          el('button', { text: 'Local Co-op Run', onclick: () => this.setState(startLocalRun(this.state)) }),
          el('button', { text: 'Online Co-op', onclick: () => this.setState(goToOnlineMenu(this.state)) }),
          el('button', { text: 'Practice', onclick: () => this.setState(goToPracticeSelect(this.state)) }),
          el('button', { text: 'Debug Lab', onclick: () => this.setState(startDebugLab(this.state)) }),
        ]),
        el('button', { className: 'secondary-action', text: 'Back', onclick: () => this.setState(resetToMainMenu(this.state)) }),
      ]),
    );
  }

  renderOnlineMenu() {
    const codeInput = el('input', {
      className: 'room-code-input',
      value: this.pendingRoomCode,
      maxlength: '8',
      placeholder: 'ROOM CODE',
      oninput: (event) => {
        this.pendingRoomCode = event.target.value;
      },
    });

    this.shellRoot.append(
      el('div', { className: 'shell-panel online-panel' }, [
        el('p', { className: 'shell-kicker', text: 'Online Co-op' }),
        el('h2', { text: 'Find a Builder Buddy' }),
        el('div', { className: 'mode-grid' }, [
          el('button', { text: 'Public Search', onclick: () => this.beginPublicSearch() }),
          el('button', { text: 'Create Private', onclick: () => this.beginPrivateLobby() }),
          el('div', { className: 'join-code-row' }, [
            codeInput,
            el('button', { text: 'Join', onclick: () => this.beginJoinPrivateLobby() }),
          ]),
        ]),
        el('button', { className: 'secondary-action', text: 'Back', onclick: () => this.setState(goToModeSelect(this.state)) }),
      ]),
    );
  }

  renderOnlineLobby() {
    const online = this.state.online;
    const players = online?.players?.length ? online.players : [online?.identity].filter(Boolean);
    const readyCount = Object.values(online?.readyByPlayerId ?? {}).filter(Boolean).length;
    const canStart = online?.isOwner && players.length >= 2 && readyCount >= 2;

    this.shellRoot.append(
      el('div', { className: 'shell-panel online-panel' }, [
        el('p', { className: 'shell-kicker', text: online?.intent === 'public' ? 'Public Lobby' : 'Private Lobby' }),
        el('h2', { text: online?.roomCode ? `Room ${online.roomCode}` : 'Connecting' }),
        el('div', { className: 'lobby-status-grid' }, [
          el('span', { text: `Status ${online?.lobbyStatus ?? 'idle'}` }),
          el('span', { text: `${players.length}/2 players` }),
          el('span', { text: `${readyCount}/2 ready` }),
        ]),
        el('div', { className: 'player-list' }, players.map((player, index) => el('div', { className: 'player-row' }, [
          el('span', { text: player.displayName || `Player ${index + 1}` }),
          el('strong', { text: online?.readyByPlayerId?.[player.id] ? 'Ready' : 'Waiting' }),
        ]))),
        online?.error ? el('p', { className: 'online-error', text: online.error.message }) : el('span'),
        el('div', { className: 'shell-actions' }, [
          el('button', {
            text: online?.readyByPlayerId?.[online.identity.playerId] ? 'Ready Sent' : 'Ready',
            onclick: () => {
              this.setState(markOnlineReady(this.state, true));
              this.onlineClient.sendProfile?.();
              this.onlineClient.sendReady?.(true);
            },
          }),
          el('button', {
            text: 'Start',
            disabled: canStart ? null : 'disabled',
            onclick: () => this.onlineClient.startLobby?.(),
          }),
        ]),
        el('button', { className: 'secondary-action', text: 'Leave', onclick: () => this.leaveOnlineLobby() }),
      ]),
    );
  }

  renderPracticeSelect() {
    const buttons = getPracticeStageOptions(this.state).map((stage) => el('button', {
      className: stage.unlocked ? 'stage-select-button' : 'stage-select-button is-locked',
      text: `${stage.stageNumber}. ${stage.name}`,
      disabled: stage.unlocked ? null : 'disabled',
      onclick: () => this.setState(startPractice(this.state, stage.id)),
    }));

    this.shellRoot.append(
      el('div', { className: 'shell-panel' }, [
        el('p', { className: 'shell-kicker', text: 'Practice' }),
        el('h2', { text: 'Stage Select' }),
        el('div', { className: 'stage-select-grid' }, buttons),
        el('button', { className: 'secondary-action', text: 'Back', onclick: () => this.setState(goToModeSelect(this.state)) }),
      ]),
    );
  }

  renderStageResult() {
    const result = this.state.stageResult;
    const title = result?.outcome === 'clear' ? 'Stage Clear' : 'Stage Failed';
    this.shellRoot.append(
      el('div', { className: 'shell-panel result-panel' }, [
        el('p', { className: 'shell-kicker', text: formatStageTitle(result?.stageId) }),
        el('h2', { text: title }),
        el('div', { className: 'result-grid' }, [
          el('span', { text: `Deaths ${result?.deaths ?? 0}` }),
          el('span', { text: `Tools ${result?.toolsPlaced ?? 0}` }),
          el('span', { text: result?.failReason ? `Reason ${result.failReason}` : 'Reason clear' }),
        ]),
        el('button', { text: 'Continue', onclick: () => this.setState(continueFromStageResult(this.state)) }),
      ]),
    );
  }

  renderRunResult() {
    const summary = this.state.runSummary;
    this.shellRoot.append(
      el('div', { className: 'shell-panel result-panel' }, [
        el('p', { className: 'shell-kicker', text: 'Run Result' }),
        el('h2', { text: `${summary?.clearedStages ?? 0}/${summary?.totalStages ?? 0} cleared` }),
        el('div', { className: 'result-grid' }, [
          el('span', { text: `Completed ${summary?.completedStages ?? 0}` }),
          el('span', { text: `Failed ${summary?.failedStages ?? 0}` }),
        ]),
        el('div', { className: 'shell-actions' }, [
          el('button', { text: 'Run Again', onclick: () => this.setState(startLocalRun(this.state)) }),
          el('button', { text: 'Main Menu', onclick: () => this.setState(resetToMainMenu(this.state)) }),
        ]),
      ]),
    );
  }
}
