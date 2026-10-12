import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeGetPreferences, makeUpsertPreferences } from '@/infrastructure/composition/preferences';
import { accountDataError, privateJson, readAccountJson } from '@/infrastructure/http/account-data';
import { userMutationLimit, limitedResponse } from '@/infrastructure/http/auth-rate-limit';

export async function GET() {
    try {
        const user = await requireAuthenticatedUser();
        const preferences = await makeGetPreferences().execute(user.id);
        return privateJson({ preferences });
    } catch (error) { return accountDataError(error); }
}

export async function PUT(request: Request) {
    try {
        const user = await requireAuthenticatedUser();
        const wait = await userMutationLimit('preferences', user.id);
        if (wait) return limitedResponse(wait);
        const body = await readAccountJson(request);
        const preferences = await makeUpsertPreferences().execute(user.id, body);
        return privateJson({ preferences });
    } catch (error) { return accountDataError(error); }
}
