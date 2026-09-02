import { config } from "./config.js";
import { migrate, openDatabase } from "./db.js";
import { createApp, startSessionCleanup } from "./app.js";

const db = openDatabase();
migrate(db);

const app = createApp(db);
const server = app.listen(config.port, config.host, () => {
  console.log(`記帳同步後端已啟動： http://localhost:${config.port}`);
  console.log(`資料庫： ${config.dbPath}`);
  console.log(`允許的前端來源： ${config.corsOrigins.join(", ") || "(無)"}`);
  if (config.disableRegistration) console.log("註冊已關閉（DISABLE_REGISTRATION=1）");
});

startSessionCleanup(db);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
