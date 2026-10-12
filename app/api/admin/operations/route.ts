import { requireAdminUser } from '@/infrastructure/auth/session/require-admin-user';
import { makeGetOperations } from '@/infrastructure/composition/admin-operations';
import { privateJson } from '@/infrastructure/http/account-data';
import { operationError } from '@/infrastructure/http/operation-error';
import { userMutationLimit, limitedResponse } from '@/infrastructure/http/auth-rate-limit';
export async function GET() { try { const user = await requireAdminUser(); const wait = await userMutationLimit('admin-read', user.id); if (wait) return limitedResponse(wait); return privateJson(await makeGetOperations().execute()); } catch (error) { return operationError(error); } }
