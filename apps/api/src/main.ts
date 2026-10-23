import "../../../scripts/load-env.js";
import { createPool } from "@peopleledger/platform";
import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

const config = loadConfig();
const appPool = createPool(config.appDbUrl, { environment: config.environment, applicationName: "peopleledger-api" });
const app = buildServer({ config, appPool });

const shutdown = async () => {
  await app.close();
  await appPool.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: config.host });
console.log(`PeopleLedger API listening on http://${config.host}:${config.port} (${config.environment}${config.devAuth ? ", developer identity ON" : ""})`);
