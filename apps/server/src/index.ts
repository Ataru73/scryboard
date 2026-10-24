import { loadConfig } from "./config";
import { startServer } from "./server";

const config = loadConfig();
const server = await startServer(config).catch((error: Error) => {
  console.error(`Impossibile avviare Scryboard: ${error.message}`);
  process.exit(1);
});
console.log(`Scryboard in ascolto su http://${config.host}:${server.port}`);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} ricevuto, chiusura in corso…`);
  await server.stop();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
