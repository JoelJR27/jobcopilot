import { requireAdminUser } from '@/infrastructure/auth/session/require-admin-user';
import { makeSetJobSourceActive } from '@/infrastructure/composition/admin-operations';
import { privateJson, readAccountJson } from '@/infrastructure/http/account-data';
import { operationError } from '@/infrastructure/http/operation-error';
import { userMutationLimit, limitedResponse } from '@/infrastructure/http/auth-rate-limit';
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const admin = await requireAdminUser();
        const wait = await userMutationLimit('source', admin.id);
        if (wait) return limitedResponse(wait);
        const { id } = await context.params;
        return privateJson(await makeSetJobSourceActive().execute(id, await readAccountJson(request)));
    } catch (error) { return operationError(error); }
}
