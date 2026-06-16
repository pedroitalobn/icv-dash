// Script standalone de sincronização — para uso em crontab/servidor próprio.
//   Ex. crontab (a cada 15 min):  */15 * * * * cd /app && npm run sync
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { runSync } from "../src/lib/sync";

runSync()
  .then((r) => {
    console.log(
      `[sync] ok em ${r.durationMs}ms · ${r.donorsProcessed} doadores · ` +
        `${r.donationsProcessed} doações`
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("[sync] erro:", err);
    process.exit(1);
  });
