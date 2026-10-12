import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeGetRecommendedJobs } from '@/infrastructure/composition/recommended-jobs';
import { UnauthorizedError } from '@/shared/errors/unauthorized-error';
export async function GET(request: Request) {
    const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
    try {
        const user = await requireAuthenticatedUser();
        const raw = new URL(request.url).searchParams.get('page');
        const page = raw && /^\d{1,4}$/.test(raw) ? Math.max(1, Math.min(1000, Number(raw))) : 1;
        return json(await makeGetRecommendedJobs().execute(user.id, page));
    } catch (error) {
        if (error instanceof UnauthorizedError) return json({ error: 'Não autenticado.' }, 401);
        console.error('Erro inesperado ao listar vagas.');
        return json({ error: 'Não foi possível carregar vagas.' }, 500);
    }
}
