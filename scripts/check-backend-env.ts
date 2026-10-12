import 'dotenv/config';
import { backendProductionEnvironmentIssues } from '../shared/config/backend-production-env.ts';
const issues = backendProductionEnvironmentIssues(process.env);
console.info(JSON.stringify({ event: 'backend_environment_check', valid: issues.length === 0, invalidFields: issues }));
if (issues.length) process.exitCode = 1;
