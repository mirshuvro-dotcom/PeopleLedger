/**
 * Load the git-ignored `.env` at the repository root, if present, so local
 * settings (database URLs, PGPASSWORD) need not be exported in every shell.
 * Variables already set in the environment take precedence. Node's built-in
 * loader; no dependency.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(path)) process.loadEnvFile(path);
