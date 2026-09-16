import { createPlatformApiClient } from '../../../js/platform/api/platform-api.mjs';
import { createAuthApiClient } from '../../../js/platform/api/auth-api.mjs';
import { describeOpponentFriendAction, loadOpponentFriendStatus } from '../../../js/platform/ui/opponent-friend-status.mjs';

// An opponent already on the player's friends list is shown as one rather than
// offered again; the verdict itself comes from the shared platform helper.
function renderFriendAction(action, profileUrl) {
  if (action.kind === 'add') return `<a class="score-overlay__action" href="${profileUrl}">Add Friend &rsaquo;</a>`;
  if (action.kind === 'friends') return `<span class="score-overlay__action score-overlay__action--friends">Friends &#10003;</span>`;
  return '';
}

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
      Promise.all([
        apiClient.loadPlayerProfile(oppPlayerId),
        loadOpponentFriendStatus({ apiClient, authClient, opponentPlayerId: oppPlayerId }),
      ])
        .then(([oppProfile, friendStatus]) => {
          if (!oppProfile?.hasAccount) return;
          const profileUrl = `../../player/index.html?id=${encodeURIComponent(oppPlayerId)}`;
          overlay.innerHTML = `
            <span class="score-overlay__label">Opponent:</span>
            <a class="score-overlay__name" href="${profileUrl}">${oppProfile.profileName || oppPlayerId}</a>
            ${renderFriendAction(describeOpponentFriendAction(friendStatus), profileUrl)}
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
