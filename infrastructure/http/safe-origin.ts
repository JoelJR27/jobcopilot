import { ForbiddenError } from '@/shared/errors/forbidden-error';
export function assertSafeOrigin(request: Request) {
    const origin = request.headers.get('origin');
    if ((origin !== null && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new ForbiddenError();
}
