import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'session';

export async function getSessionId(): Promise<string | null> {
    const cookieStore = await cookies();

    return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export function setSessionCookie(
    response: NextResponse,
    sessionId: string,
    expiresAt: Date,
): void {
    response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
    });
}

export function clearSessionCookie(response: NextResponse): void {
    response.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: new Date(0),
        path: '/',
    });
}