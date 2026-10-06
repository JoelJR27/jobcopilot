import { NextResponse } from 'next/server';

import { makeLogoutUser } from '@/infrastructure/composition/auth';
import { clearSessionCookie, getSessionId } from '@/infrastructure/auth/session/session-cookie';

export async function POST() {

    const sessionId = await getSessionId();

    if (sessionId) {
        const logoutUser = makeLogoutUser();

        await logoutUser.execute(sessionId);
    }

    const response = NextResponse.json(
        {
            message: 'Logout realizado com sucesso.',
        },
        { status: 200 },
    );

    clearSessionCookie(response);

    return response;
}