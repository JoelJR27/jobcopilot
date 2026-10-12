import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeGetProfile, makeUpsertProfile } from '@/infrastructure/composition/profile';
import { accountDataError, privateJson, readAccountJson } from '@/infrastructure/http/account-data';
import { userMutationLimit, limitedResponse } from '@/infrastructure/http/auth-rate-limit';

export async function GET() {
    try {
        const user = await requireAuthenticatedUser();
        const profile = await makeGetProfile().execute(user.id);
        return privateJson({ profile });
    } catch (error) { return accountDataError(error); }
}

export async function PUT(request: Request) {
    try {
        const user = await requireAuthenticatedUser();
        const wait = await userMutationLimit('profile', user.id);
        if (wait) return limitedResponse(wait);
        const body = await readAccountJson(request);
        const profile = await makeUpsertProfile().execute(user.id, body);
        return privateJson({ profile });
    } catch (error) { return accountDataError(error); }
}
