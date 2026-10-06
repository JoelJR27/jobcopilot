import { getSessionId } from '@/infrastructure/auth/session/session-cookie';
import { makeGetCurrentUser } from '@/infrastructure/composition/auth';

export async function requireAuthenticatedUser() {
    const sessionId = await getSessionId();

    const getCurrentUser = makeGetCurrentUser();

    return getCurrentUser.execute(sessionId);
}