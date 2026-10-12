import { NextResponse } from 'next/server';
import { makeLogoutUser } from '@/infrastructure/composition/auth';
import { clearSessionCookie, getSessionId } from '@/infrastructure/auth/session/session-cookie';
import { assertSafeOrigin } from '@/infrastructure/http/safe-origin';
import { ForbiddenError } from '@/shared/errors/forbidden-error';
export async function POST(request: Request) {
    const json = (message: string, status: number) => NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
    try {
        assertSafeOrigin(request);
        const sessionId = await getSessionId();
        if (sessionId) await makeLogoutUser().execute(sessionId);
        const response = json('Logout realizado com sucesso.', 200);
        clearSessionCookie(response); return response;
    } catch (error) {
        if (error instanceof ForbiddenError) return json('Origem não permitida.', 403);
        console.error('Falha ao realizar logout.');
        return json('Não foi possível realizar logout.', 500);
    }
}
