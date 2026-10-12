import { requireAuthenticatedUser } from '@/infrastructure/auth/session/require-authenticated-user';
import { makeSaveMatchFeedback } from '@/infrastructure/composition/feedback';
import { privateJson, readAccountJson } from '@/infrastructure/http/account-data';
import { operationError } from '@/infrastructure/http/operation-error';
import { userMutationLimit, limitedResponse } from '@/infrastructure/http/auth-rate-limit';
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const user = await requireAuthenticatedUser();
        const wait = await userMutationLimit('feedback', user.id);
        if (wait) return limitedResponse(wait);
        const { id } = await context.params;
        const input = await readAccountJson(request);
        return privateJson({ feedback: await makeSaveMatchFeedback().execute(user.id, id, input) });
    } catch (error) { return operationError(error); }
}
