import { getOnlineAccountGate, readFactoryAccountSession, redirectToFactoryAccountSignIn } from '../../../../js/platform/api/factory-account-gate.mjs';
import { createAuthApiClient } from '../../../../js/platform/api/auth-api.mjs';
import { createOnlineIdentityPayload } from '../../../../js/platform/identity/match-identity.mjs';
import { handleUnauthorizedResponse } from '../../../../js/platform/api/auth-token.mjs';

// Platform accounts own identity. Do not create cabinet profile storage or send
// the bearer token over the multiplayer socket. Lobby identities are display
// metadata, not server-verified authority to award records.
export function createAccountAccess({ readAccount = readFactoryAccountSession, authApi = createAuthApiClient(), redirectToSignIn = redirectToFactoryAccountSignIn, onUnauthorized = handleUnauthorizedResponse } = {}) {
    const isEligible = () => getOnlineAccountGate(readAccount()).eligible;
    return {
        isEligible,
        // Kept inside the account/UI boundary; never serialized into a lobby.
        sessionKey: () => readAccount().token,
        signIn: redirectToSignIn,
        async resolve() {
            if (!isEligible()) throw new Error('Sign in to your Player Factory account to use online lobbies.');
            const previousToken = readAccount().token;
            const session = await authApi.getSession();
            const currentToken = readAccount().token;
            if (currentToken !== previousToken && currentToken !== session?.token) {
                throw new Error('Your account changed. Please join again.');
            }
            if (session?.httpStatus === 401) onUnauthorized();
            if (!isEligible() || !session?.ok || !session.playerId) {
                throw new Error(session?.httpStatus === 401 || session?.httpStatus === 403
                    ? 'Your session expired. Sign in again to use online lobbies.'
                    : 'Could not verify your Player Factory account. Please try again.');
            }
            return createOnlineIdentityPayload({ playerId: session.playerId, profileName: session.profileName || 'Player' });
        },
    };
}
