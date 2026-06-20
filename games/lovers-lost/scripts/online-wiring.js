// Online client callback wiring for Lovers Lost.
//
// `wireOnlineClient` assigns every `onlineClient.cb.*` handler. Each handler
// reads and mutates the live game/online state through the shared `host`
// accessor object owned by init-game, so the controller no longer hand-wires
// this block inline.
import { evaluateRun } from './scoring.js';
import { applyRemoteSnapshot } from './remote-snapshot.js';
import {
  attachOnlineResultIdentities, sanitizeOnlinePlayerId, sanitizeOnlineDisplayName,
} from './online-identity.js';

function wireOnlineClient(onlineClient, host) {
  onlineClient.cb.onConnected   = () => { onlineClient.requestQueueStatus('lovers-lost'); };
  onlineClient.cb.onQueueCounts = (counts) => { host.onlineQueueCounts = counts; };

  onlineClient.cb.onRemoteProfile = (profile) => {
    host.onlineRemoteIdentity = {
      playerId:    sanitizeOnlinePlayerId(profile?.playerId    || ''),
      displayName: sanitizeOnlineDisplayName(profile?.displayName || ''),
    };
    if (!host.onlineRemoteSide && (profile?.side === 'boy' || profile?.side === 'girl')) host.onlineRemoteSide = profile.side;
  };

  onlineClient.cb.onSearching       = () => {};
  onlineClient.cb.onSearchCancelled = () => { host.onlineLobbyPhase = 'main'; };
  onlineClient.cb.onRoomCreated     = (code) => { host.onlineRoomCode = code; };

  onlineClient.cb.onSideConflict = () => {
    host.onlineRoomCode = ''; host.onlineRemoteSide = null; host.onlineRemoteIdentity = null;
    host.onlineCountdown = null; host.onlineQueueCounts = null; host.onlineLobbyPhase = 'main';
    host.gs = { ...host.gs, phase: 'online_lobby' };
  };

  onlineClient.cb.onError = (code, msg) => { console.warn('[online]', code, msg); };

  onlineClient.cb.onMatchReady = ({ seed, remoteSide, serverNow, startAt }) => {
    host.onlineRemoteSide = remoteSide;
    host.onlineCountdown  = { seed, startAt, clockOffsetMs: serverNow - Date.now() };
    host.gs = { ...host.gs, phase: 'online_countdown' };
    host.inp.tick();
  };

  onlineClient.cb.onRemoteAction = () => {};

  onlineClient.cb.onRemoteEmote = (type) => {
    host.renderer.addEmote(host.onlineSide, type);
  };

  onlineClient.cb.onPartnerLeft = () => {
    if (host.gs.phase === 'online_countdown') {
      host.onlineRemoteSide = null; host.onlineRemoteIdentity = null; host.onlineCountdown = null;
      host.onlineRoomCode = ''; host.onlineQueueCounts = null; host.onlineLobbyPhase = 'main';
      host.gs = { ...host.gs, phase: 'online_lobby' };
      return;
    }
    if (host.gs.phase === 'playing') {
      const summary = attachOnlineResultIdentities(
        { ...evaluateRun(host.gs.boy, host.gs.girl, host.gs.elapsed), disconnectNote: true },
        host.onlineSide, host.onlineIdentity, host.onlineRemoteSide, host.onlineRemoteIdentity
      );
      host.gs = { ...host.gs, phase: 'gameover', phaseFrames: 0, runSummary: summary };
      host.sounds.stopMusic();
      host.sounds.play('run-failed');
    }
  };

  onlineClient.cb.onRemoteSnapshot = (snapshot) => {
    if (!host.onlineRemoteSide || !snapshot) return;
    const result = applyRemoteSnapshot(
      { gs: host.gs, boyAnim: host.boyAnim, girlAnim: host.girlAnim, remoteLaneSeq: host.remoteLaneSeq },
      host.renderer, host.onlineRemoteSide, snapshot
    );
    if (result) { host.gs = result.gs; host.boyAnim = result.boyAnim; host.girlAnim = result.girlAnim; }
  };
}

export { wireOnlineClient };
