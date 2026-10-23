import "../../../scripts/load-env.js";
import { AuthService, createPool } from "@peopleledger/platform";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig();
const appPool = createPool(config.appDbUrl, { environment: config.environment, applicationName: "peopleledger-api" });
const authPool = createPool(config.authDbUrl, { environment: config.environment, applicationName: "peopleledger-api-auth" });
const auth = new AuthService({ authPool, appPool, dataKey: config.dataKey });
const app = buildServer({ config, appPool, auth });

const shutdown = async () => {
  await app.close();
  await Promise.all([appPool.end(), authPool.end()]);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: config.host });
console.log(`PeopleLedger API listening on http://${config.host}:${config.port} (${config.environment}${config.devAuth ? ", developer identity ON" : ""})`);
