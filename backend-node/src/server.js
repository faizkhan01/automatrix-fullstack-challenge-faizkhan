import { createApp } from "./app.js";
import { config } from "./config.js";
import { sequelize } from "./db/sequelize.js";
import "./models/index.js";

await sequelize.authenticate();

const server = createApp().listen(config.port, () => {
  console.log(`OrderDesk API listening on http://localhost:${config.port}`);
});

// Let in-flight requests (and their transactions) finish before exiting on deploys/restarts.
const SHUTDOWN_TIMEOUT_MS = 10_000;

function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();

  server.close(async () => {
    await sequelize.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
