import "@/db/env";
import { closeDb, db, isPglite } from "@/db";
import { startWorker } from "./loop";

if (isPglite) {
  console.error("DATABASE_URL is pglite://, which only one process can open. Run the worker inside the app with WORKER_INLINE=1 instead.");
  process.exit(1);
}

const w = startWorker(db);
const shutdown = async () => {
  await w.stop();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
