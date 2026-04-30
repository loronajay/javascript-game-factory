import { createPlatformApiClient } from '../../../js/platform/api/platform-api.mjs';
import { createAuthApiClient } from '../../../js/platform/api/auth-api.mjs';

function updateScoreOverlay(phase, prevPhase, runSummary, onlineSide) {
  if (phase === prevPhase) return;
  const overlay = document.getElementById('score-overlay');
  if (!overlay) return;

  if (phase === 'score_screen') {
    overlay.classList.add('hidden');
    const remoteSideKey = onlineSide === 'boy' ? 'girlIdentity' : 'boyIdentity';
    const oppPlayerId   = runSummary?.[remoteSideKey]?.playerId;
    if (oppPlayerId) {
      const apiClient  = createPlatformApiClient();
      const authClient = createAuthApiClient();
      Promise.all([apiClient.loadPlayerProfile(oppPlayerId), authClient.getSession()])
        .then(([oppProfile, session]) => {
          if (!oppProfile?.hasAccount) return;
          const profileUrl   = `../../player/index.html?id=${encodeURIComponent(oppPlayerId)}`;
          const isSignedIn   = Boolean(session?.ok && session?.playerId);
          const addFriendBtn = isSignedIn
            ? `<a class="score-overlay__action" href="${profileUrl}">Add Friend &rsaquo;</a>` : '';
          overlay.innerHTML = `
            <span class="score-overlay__label">Opponent:</span>
            <a class="score-overlay__name" href="${profileUrl}">${oppProfile.profileName || oppPlayerId}</a>
            ${addFriendBtn}
          `;
          overlay.classList.remove('hidden');
        }).catch(() => {});
    }
  } else {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }
}

export { updateScoreOverlay };
