import "@/db/env";
import { closeDb, db } from "@/db";
import { runRetention } from "@/engine/retention";

runRetention(db)
  .then((r) => console.log(`retention: cleared ${r.bodiesCleared} bodies, purged ${r.eventsPurged} events`))
  .finally(() => closeDb());
