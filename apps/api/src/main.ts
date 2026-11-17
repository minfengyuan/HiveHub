import { config } from "./config.js";
import { connect } from "./db.js";
import { buildApp } from "./app.js";
const cfg = config();
const { db, sql } = connect(cfg.databaseUrl);
const { app, collector } = await buildApp(db, cfg);
await app.listen({ host: "0.0.0.0", port: cfg.port });
const tick = () =>
  collector.tick().catch(() => app.log.error("Monitoring cycle failed"));
const timer = setInterval(tick, 60000);
void tick();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    void app
      .close()
      .then(() => sql.end())
      .then(() => process.exit(0));
  });
