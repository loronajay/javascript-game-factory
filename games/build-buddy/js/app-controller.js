import { PauseMenu } from './pause-menu.js';
import { createCharacterPicker } from './character-picker.js';
import { runnerAppearance, characterById } from './characters.js';
import { Game } from './game.js';
import { VIEW } from './constants.js';
import { AudioDirector } from './audio.js';
import { ART } from './render/art-assets.js';
import {
  APP_SCREENS,
  applyOnlineGameplayDisconnect,
  applyOnlineClientSnapshot,
  applyOnlineRunComplete,
  applyServerMatchState,
  applyOnlineStageResult,
  continueFromStageResult,
  createAppShellState,
  selectCharacter,
  selectCharacterCosmetic,
  getPracticeStageOptions,
  goToOnlineMenu,
  goToModeSelect,
  goToPracticeSelect,
  joinOnlineLobby,
  localOnlineRole,
  markOnlineReady,
  resetToMainMenu,
  startOnlineSearch,
  startPrivateLobby,
  startLocalRun,
  startOnlineRunFromLobby,
  startPractice,
  submitStageClear,
  submitStageFailure,
  selectPack,
  getPackOptions,
} from './app-shell.js';
import { createOnlineClient } from './online-client.js';
import {
  acceptServerWorldSyncMessage,
  createBuilderCommandMessage,
  createBuilderCursorMessage,
  createRunnerInputMessage,
  createStageCompleteRequestMessage,
  createStageStartMessage,
  createStateSyncMessage,
  receiveStageStartMessage,
  shouldSendServerWorldSync,
} from './online-gameplay.js';

const FIXED_DT = 1 / 60;

function formatBiome(biome) {
  return String(biome || '').split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatStageTitle(stageId) {
  return stageId
    ? stageId.replace(/^pack_(\d+)_stage_(\d+)$/, 'Pack $1 / Stage $2').replaceAll('_', ' ')
    : 'Stage';
}

function formatResultTime(milliseconds) {
  const totalCentiseconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 10));
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor(totalCentiseconds / 100) % 60;
  const centiseconds = totalCentiseconds % 100;
  return [minutes, seconds, centiseconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function playerName(players, playerId) {
  return players?.find((player) => player.id === playerId)?.displayName || playerId || 'Unknown';
}

function resultMetricLabels(result, players) {
  if (!result) return [];
  const labels = [
    `Runner ${playerName(players, result.runnerPlayerId)}`,
    `Builder ${playerName(players, result.builderPlayerId)}`,
  ];
  if (result.outcome === 'clear' && result.timeClearedMs != null) {
    labels.push(`Time cleared ${formatResultTime(result.timeClearedMs)}`);
  }
  labels.push(`Deaths ${result.runnerDeaths ?? 0}`);
  labels.push(`Tools used ${result.toolUseCount ?? 0}`);
  const reward = result.checkpointUnusedRewardMs > 0
    ? ` -${formatResultTime(result.checkpointUnusedRewardMs)}`
    : '';
  labels.push(`Checkpoint used ${result.checkpointUsedForRespawn ? 'Yes' : `No${reward}`}`);
  if (result.outcome === 'clear' && result.finalStageTimeMs != null) {
    labels.push(`Final stage time ${formatResultTime(result.finalStageTimeMs)}`);
  }
  if (result.failReason) labels.push(`Reason ${result.failReason}`);
  return labels;
}

function resultGrid(result, players) {
  return el('div', { className: 'result-grid' }, resultMetricLabels(result, players)
    .map((text) => el('span', { text })));
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
    mobileControls,
    storage = globalThis.localStorage,
    onlineClient = createOnlineClient(),
    profileSource = globalThis,
    audioDirector = new AudioDirector(),
  } = {}) {
    this.canvas = canvas;
    this.shellRoot = shellRoot;
    this.hudRoot = hudRoot;
    this.mobileControls = mobileControls;
    this.state = createAppShellState({ storage });
    this.onlineClient = onlineClient;
    this.profileSource = profileSource;
    this.audio = audioDirector;
    this.pendingRoomCode = '';
    this.game = null;
    this.accumulator = 0;
    this.lastTime = null;
    this.onlineTick = 0;
    this.onlineSnapshotTick = 0;
    this.sentOnlineMessageCount = 0;
    this.appliedServerCommandSeq = 0;
    // Dedup by last-applied key per message kind. The client snapshot only ever
    // retains the most recent message of each type, so a single key per kind is
    // all we need — and it stays O(1) instead of the old unbounded Set that grew
    // for the whole run and re-hashed a full JSON string on every relay message.
    this.lastOnlineKeys = Object.create(null);
    this.lastAppliedWorldSyncTick = -1;
    this.lastAppliedBuilderCursorTick = -1;
    globalThis.document?.addEventListener?.('pointerdown', (event) => {
      const interactive = event.target?.closest?.('button, a');
      if (!interactive || interactive.hasAttribute?.('disabled')) return;
      this.audio.unlock();
      this.audio.playSfx('button', { volume: .55 });
    });

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

    this.pauseMenu = new PauseMenu(this);
    this.canvas.width = VIEW.width;
    this.canvas.height = VIEW.height;
    this.audio.setScreen(this.state.screen);
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

    if (this.state.screen === APP_SCREENS.GAMEPLAY && this.game) {
      this.audio.handleGameEvents(this.game.consumeAudioEvents());
      this.audio.syncGameplay({
        climbing: this.game.runner.climbing && !this.pauseMenu?.opened,
        climbVelocity: this.game.runner.vy,
      });
    } else {
      this.audio.syncGameplay({ climbing: false });
    }

    if (this.state.screen === APP_SCREENS.GAMEPLAY && this.game) {
      const appearance = runnerAppearance(this.state);
      this.game.runner.characterId = appearance.characterId;
      this.game.runner.cosmetics = appearance.cosmetics;
      this.game.render();
    }
  }

  setState(nextState) {
    const previousStageId = this.state.session?.currentStageId ?? null;
    const previousScreen = this.state.screen;
    this.pauseMenu?.close();
    this.state = nextState;
    this.audio.setScreen(this.state.screen);

    const nextStageId = this.state.session?.currentStageId ?? null;
    if (this.state.screen === APP_SCREENS.GAMEPLAY && (previousScreen !== APP_SCREENS.GAMEPLAY || previousStageId !== nextStageId)) {
      this.createGame();
    }
    if (this.state.screen !== APP_SCREENS.GAMEPLAY) {
      this.game?.input.dispose();
      this.game = null;
    }
    this.renderShell();
  }

  createGame() {
    this.game?.input.dispose();
    // Sync cursors are per stage: the chairs swap every stage and the new
    // Runner's tick count is unrelated to the old one's (a throttled tab can be
    // hundreds of ticks behind), so a cursor carried across would reject every
    // sync from the new Runner as stale until they caught up.
    this.lastAppliedWorldSyncTick = -1;
    this.lastAppliedBuilderCursorTick = -1;
    const localControlRole = this.state.onlineGameplay ? localOnlineRole(this.state) : 'local';
    this.game = new Game(this.canvas, {
      initialStageId: this.state.session.currentStageId,
      viewMode: this.state.viewMode,
      localControlRole,
      onStageClear: (details) => {
        this.audio.handleGameEvents([{ type: 'goal' }]);
        this.submitStageClear(details);
      },
      onStageFailure: (details) => {
        this.audio.handleGameEvents([{ type: 'error' }]);
        this.submitStageFailure(details.reason, details);
      },
    });
  }

  updateGameplayTick() {
    if (this.pauseMenu?.opened && !this.state.onlineGameplay) return;
    this.game?.updateAnimation?.(FIXED_DT);
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

    if (this.state.onlineGameplay.authorityPlayerId === 'server') {
      // Under server authority the Runner's client is the world authority and
      // the Builder's is a replica: it previews placements, but its clicks are
      // turned into commands (and local predictions) by sendLocalOnlineCommands,
      // which also calls endFrame() — so neither is done here.
      this.game?.update(FIXED_DT, { skipEndFrame: true, builderActions: false });
    } else if (this.localOnlineRole() === 'builder' && this.game) {
      // Builder is non-host: update camera to follow the synced runner position,
      // then update the hover ghost so it tracks the mouse in the correct world region.
      this.game.camera.update(FIXED_DT, this.game.runner, this.game.input);
      this.game.builder?.updateHover(this.game.input, this.game.camera, this.game.runner);
    }
    this.sendLocalOnlineCommands();
  }

  localOnlineRole() {
    return localOnlineRole(this.state);
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
      if (shouldSendServerWorldSync(this.state.onlineGameplay, role, this.onlineTick) && this.game) {
        this.onlineClient.sendOnlineGameplayMessage?.(createStateSyncMessage(this.game.createStateSnapshot(this.onlineTick)));
      }
      input?.endFrame?.();
    }
    if (role === 'builder') {
      // Cursor is a cosmetic ghost preview, so throttle it to ~15Hz instead of
      // flooding one message per tick (60Hz) through the relay.
      if (this.game && this.onlineTick % 4 === 0) {
        const input = this.game.input;
        const world = this.game.camera.screenToWorld(input.mouse.x, input.mouse.y);
        const gridX = Math.round(world.x / 40) * 40;
        const gridY = Math.round(world.y / 40) * 40;
        this.onlineClient.sendOnlineGameplayMessage?.(createBuilderCursorMessage({
          tick: this.onlineTick,
          gridX,
          gridY,
          selectedTool: input.selectedTool,
          valid: this.game.builder?.hover?.valid === true,
        }));
      }
      const command = this.consumeLocalBuilderCommand();
      if (command) {
        if (this.state.onlineGameplay?.authorityPlayerId === 'server' && this.game) {
          const result = this.game.applyBuilderCommand(command.value, { predicted: true });
          this.game.builder?.announce(command.value.action, result, command.value.toolType);
        }
        this.onlineClient.sendOnlineGameplayMessage?.(command);
      }
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
      // Place where the ghost is drawn (the hover preview already snapped and
      // normalised it), so the command names exactly the spot the Builder saw.
      const hover = this.game.builder?.hover;
      return createBuilderCommandMessage({
        tick: this.onlineTick,
        action: 'place',
        toolType: this.game.builder?.selectedTool ?? input.selectedTool,
        gridX: Number.isFinite(hover?.x) ? hover.x : gridX,
        gridY: Number.isFinite(hover?.y) ? hover.y : gridY,
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
    if (input.consumeRecall?.()) {
      return createBuilderCommandMessage({
        tick: this.onlineTick,
        action: 'recall',
      });
    }
    return null;
  }

  submitStageClear(details) {
    if (this.state.onlineGameplay?.authorityPlayerId === 'server') {
      this.onlineClient.sendOnlineGameplayMessage?.(createStageCompleteRequestMessage(this.state.onlineGameplay, {
        outcome: 'clear',
        elapsedMs: details.elapsedMs ?? details.timeClearedMs,
      }));
      return;
    }
    this.setState(submitStageClear(this.state, details));
    this.flushOnlineOutboundMessages();
  }

  submitStageFailure(reason, details) {
    if (this.state.onlineGameplay?.authorityPlayerId === 'server') {
      this.onlineClient.sendOnlineGameplayMessage?.(createStageCompleteRequestMessage(this.state.onlineGameplay, {
        outcome: 'fail',
        failReason: reason,
        elapsedMs: details.elapsedMs ?? details.timeClearedMs,
      }));
      return;
    }
    this.setState(submitStageFailure(this.state, reason, details));
    this.flushOnlineOutboundMessages();
  }

  broadcastOnlineStageStart() {
    if (!this.state.onlineGameplay?.isHost || this.state.onlineGameplay.authorityPlayerId === 'server') return;
    this.onlineClient.sendOnlineGameplayMessage?.(createStageStartMessage(this.state.onlineGameplay, {
      seed: this.state.onlineGameplay.session.stageIndex,
      startAt: Date.now() + 1200,
    }));
  }

  flushOnlineOutboundMessages() {
    if (this.state.onlineGameplay?.authorityPlayerId === 'server') return;
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
    if (this.lastOnlineKeys[kind] === key) return;
    this.lastOnlineKeys[kind] = key;
    apply(payload);
  }

  applyOnlineGameplaySnapshot(snapshot = {}) {
    this.state.online = { ...this.state.online, profiles: { ...snapshot.profiles } };
    const gameplay = snapshot.onlineGameplay ?? {};
    this.applyOnce('stage_start', gameplay.lastStageStart, (message) => {
      if (this.state.onlineGameplay?.isHost) return;
      if (this.state.onlineGameplay?.authorityPlayerId === 'server') {
        // The server's stage_start carries the next stage and its roles. Fold
        // it into the session the same way a match_state would, so the stage
        // change, the role swap and the fresh Game happen in one setState.
        const value = message.value ?? {};
        this.setState(applyServerMatchState(this.state, {
          stage: { packId: value.packId, stageId: value.stageId, stageIndex: value.stageIndex, roles: value.roles ?? {} },
          network: { authorityMode: 'server' },
          phase: 'stage_play',
        }));
        return;
      }
      const onlineGameplay = receiveStageStartMessage(this.state.onlineGameplay, message);
      const viewMode = localOnlineRole({ ...this.state, onlineGameplay, session: onlineGameplay.session }) || this.state.viewMode;
      this.setState({ ...this.state, onlineGameplay, session: onlineGameplay.session, viewMode });
      this.game?.loadStage(message.value.stageId);
    });
    this.applyOnce('runner_input', gameplay.lastRunnerInput, (message) => {
      if (this.state.onlineGameplay?.isHost) this.game?.applyRunnerInputCommand(message.value);
    });
    this.applyOnce('builder_command', gameplay.lastBuilderCommand, (message) => {
      if (this.state.onlineGameplay?.isHost) this.game?.applyBuilderCommand(message.value);
    });
    if (this.state.onlineGameplay?.authorityPlayerId === 'server') {
      const worldSync = acceptServerWorldSyncMessage(
        this.state.onlineGameplay,
        this.localOnlineRole(),
        this.lastAppliedWorldSyncTick,
        gameplay.lastStateSync,
      );
      if (worldSync) {
        this.lastAppliedWorldSyncTick = worldSync.tick;
        this.game?.applyStateSnapshot(worldSync);
      }
    } else {
      this.applyOnce('state_sync', gameplay.lastStateSync, (message) => {
        if (!this.state.onlineGameplay?.isHost) this.game?.applyStateSnapshot(message.value ?? message);
      });
    }
    this.applyOnce('stage_result', gameplay.lastStageResult, (message) => {
      this.setState(applyOnlineStageResult(this.state, message));
    });
    this.applyOnce('run_complete', gameplay.lastRunComplete, (message) => {
      this.setState(applyOnlineRunComplete(this.state, message));
    });
    this.applyOnce('match_state', gameplay.lastMatchState, (message) => {
      const nextState = applyServerMatchState(this.state, message.value);
      if (nextState === this.state) return;
      // A match_state arrives with every relayed input. Only a stage, role or
      // screen change needs the full setState (new Game, shell re-render); the
      // rest just carries commands and the latest server payload.
      const before = this.state;
      const stageChanged = before.session?.currentStageId !== nextState.session?.currentStageId
        || before.screen !== nextState.screen
        || localOnlineRole(before) !== localOnlineRole(nextState);
      if (stageChanged) this.setState(nextState);
      else this.state = nextState;
      this.applyServerCommands(message.value?.commands);
    });
    // Builder cursor: runner receives the ghost preview position so both players share intent
    const builderCursor = gameplay.lastBuilderCursor;
    if (builderCursor && this.localOnlineRole() === 'runner') {
      const tick = builderCursor.value?.tick ?? 0;
      if (tick > this.lastAppliedBuilderCursorTick) {
        this.lastAppliedBuilderCursorTick = tick;
        this.game?.setRemoteBuilderCursor(builderCursor.value);
      }
    }

    if (snapshot.status === 'idle') {
      this.setState(applyOnlineGameplayDisconnect(this.state, this.state.onlineGameplay.authorityPlayerId));
    }
  }

  applyServerCommands(commands = {}) {
    if (!commands || this.state.onlineGameplay?.authorityPlayerId !== 'server') return;
    const localPlayerId = this.state.onlineGameplay.localPlayerId;
    const merged = [
      ...(Array.isArray(commands.runnerInputs) ? commands.runnerInputs.map((command) => ({ kind: 'runner', ...command })) : []),
      ...(Array.isArray(commands.builderCommands) ? commands.builderCommands.map((command) => ({ kind: 'builder', ...command })) : []),
    ].sort((left, right) => Number(left.seq || 0) - Number(right.seq || 0));

    for (const command of merged) {
      const seq = Number(command.seq || 0);
      if (seq <= this.appliedServerCommandSeq) continue;
      this.appliedServerCommandSeq = seq;
      if (command.clientId === localPlayerId) continue;
      if (command.kind === 'runner') this.game?.applyRunnerInputCommand(command);
      if (command.kind === 'builder') this.game?.applyBuilderCommand(command);
    }
  }

  renderShell() {
    this.pauseMenu?.sync();
    this.shellRoot.replaceChildren();
    this.shellRoot.hidden = this.state.screen === APP_SCREENS.GAMEPLAY;
    this.canvas.hidden = this.state.screen !== APP_SCREENS.GAMEPLAY;
    this.hudRoot.hidden = this.state.screen !== APP_SCREENS.GAMEPLAY;
    this.mobileControls.hidden = this.state.screen !== APP_SCREENS.GAMEPLAY;

    if (this.state.screen === APP_SCREENS.MAIN_MENU) this.renderMainMenu();
    if (this.state.screen === APP_SCREENS.MODE_SELECT) this.renderModeSelect();
    if (this.state.screen === APP_SCREENS.LOCAL_SETUP) this.renderLocalSetup();
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
      characterId: this.state.players[0].characterId,
      cosmetics: this.state.players[0].cosmetics,
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
        el('div', { className: 'sign-plate' }, [
          el('p', { className: 'shell-kicker', text: 'Night shift  //  Site 07  //  Co-op construction' }),
          el('h1', {}, [
            el('span', { className: 'title-line', text: 'Build' }),
            el('span', { className: 'title-line title-line-accent', text: 'Buddy' }),
          ]),
          el('p', { className: 'shell-description', text: 'You make the jump. Your buddy makes it possible. Build, bounce, and find your way up together.' }),
          el('div', { className: 'role-strip' }, [
            el('span', { className: 'role-chip role-runner' }, [el('i'), el('b', { text: 'Runner' }), el('em', { text: 'jumps, climbs, wall-kicks' })]),
            el('span', { className: 'role-chip role-builder' }, [el('i'), el('b', { text: 'Builder' }), el('em', { text: 'drops platforms & springs' })]),
          ]),
          el('div', { className: 'shell-actions' }, [
            el('button', { text: 'Clock In', onclick: () => this.setState(goToModeSelect(this.state)) }),
          ]),
        ]),
        el('figure', { className: 'menu-crew-art' }, [
          el('img', {
            src: ART.menuCrew,
            alt: 'A customized fox, rabbit, raccoon, and bear build a steel scaffold together',
            decoding: 'async',
          }),
        ]),
      ]),
    );
  }

  renderModeSelect() {
    this.shellRoot.append(
      el('div', { className: 'shell-panel' }, [
        el('p', { className: 'shell-kicker', text: 'Mode Select' }),
        el('h2', { text: 'Choose a run type' }),
        el('div', { className: 'pack-picker' }, getPackOptions(this.state).map((pack) => el('button', {
          className: pack.selected ? 'pack-button is-selected' : 'pack-button',
          text: `${pack.name} · ${formatBiome(pack.biome)}`,
          onclick: () => this.setState(selectPack(this.state, pack.id)),
        }))),
        el('div', { className: 'mode-grid' }, [
          el('button', { text: 'Local Co-op Run', onclick: () => this.setState({ ...this.state, screen: APP_SCREENS.LOCAL_SETUP }) }),
          el('button', { text: 'Online Co-op', onclick: () => this.setState(goToOnlineMenu(this.state)) }),
          el('button', { text: 'Practice', onclick: () => this.setState(goToPracticeSelect(this.state)) }),
        ]),
        el('button', { className: 'secondary-action', text: 'Back', onclick: () => this.setState(resetToMainMenu(this.state)) }),
      ]),
    );
  }

  renderLocalSetup() {
    this.shellRoot.append(el('div', { className: 'shell-panel' }, [
      el('p', { className: 'shell-kicker', text: 'Local Co-op' }),
      el('h2', { text: 'Meet your team' }),
      createCharacterPicker({
        players: this.state.players,
        onSelect: (index, id) => { this.state = selectCharacter(this.state, index, id); },
        onCustomize: (index, key, value) => { this.state = selectCharacterCosmetic(this.state, index, key, value); },
      }),
      el('button', { text: 'Start Local Run', onclick: () => this.setState(startLocalRun(this.state)) }),
      el('button', { className: 'secondary-action', text: 'Back', onclick: () => this.setState(goToModeSelect(this.state)) }),
    ]));
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
        createCharacterPicker({
          players: this.state.players.slice(0, 1),
          online: true,
          onSelect: (index, id) => { this.state = selectCharacter(this.state, index, id); },
          onCustomize: (index, key, value) => { this.state = selectCharacterCosmetic(this.state, index, key, value); },
        }),
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
    const stageOneRoles = players.length >= 2
      ? { [players[0].id]: 'Stage 1 Runner', [players[1].id]: 'Stage 1 Builder' }
      : {};

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
          el('span', { text: `${player.displayName || `Player ${index + 1}`} · ${characterById(player.characterId).name}` }),
          el('strong', {
            text: [
              online?.readyByPlayerId?.[player.id] ? 'Ready' : 'Waiting',
              stageOneRoles[player.id],
            ].filter(Boolean).join(' - '),
          }),
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
    const players = this.state.session?.players;
    const title = result?.outcome === 'clear' ? 'Stage Clear' : 'Stage Failed';
    this.shellRoot.append(
      el('div', { className: 'shell-panel result-panel' }, [
        el('p', { className: 'shell-kicker', text: formatStageTitle(result?.stageId) }),
        el('h2', { text: title }),
        resultGrid(result, players),
        el('button', { text: 'Continue', onclick: () => this.setState(continueFromStageResult(this.state)) }),
      ]),
    );
  }

  renderRunResult() {
    const summary = this.state.runSummary;
    const players = this.state.session?.players;
    const resultCards = (summary?.results ?? []).map((result) => el('section', { className: 'stage-result-card' }, [
      el('div', { className: 'stage-result-heading' }, [
        el('h3', { text: formatStageTitle(result.stageId) }),
        el('strong', {
          className: result.outcome === 'clear' ? 'result-clear' : 'result-fail',
          text: result.outcome === 'clear' ? 'Clear' : 'Failed',
        }),
      ]),
      resultGrid(result, players),
    ]));
    this.shellRoot.append(
      el('div', { className: 'shell-panel result-panel run-result-panel' }, [
        el('p', { className: 'shell-kicker', text: 'Run Result' }),
        el('h2', { text: `${summary?.clearedStages ?? 0}/${summary?.totalStages ?? 0} cleared` }),
        el('div', { className: 'result-grid' }, [
          el('span', { text: `Completed ${summary?.completedStages ?? 0}` }),
          el('span', { text: `Failed ${summary?.failedStages ?? 0}` }),
        ]),
        el('div', { className: 'run-result-list' }, resultCards),
        el('div', { className: 'shell-actions' }, [
          el('button', { text: 'Run Again', onclick: () => this.setState(startLocalRun(this.state)) }),
          el('button', { text: 'Main Menu', onclick: () => this.setState(resetToMainMenu(this.state)) }),
        ]),
      ]),
    );
  }
}
