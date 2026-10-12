import { ForbiddenError } from '@/shared/errors/forbidden-error';
import { requireAuthenticatedUser } from './require-authenticated-user';

export async function requireAdminUser() {
    const user = await requireAuthenticatedUser();

    if (user.role !== 'ADMIN') {
        throw new ForbiddenError();
    }

    return user;
}
