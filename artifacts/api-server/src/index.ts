import app from "./app";
import { maybeAutoSync, initStoredCreds } from "./routes/crowdstrike";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, "0.0.0.0", async () => {
  console.log(`Server listening on port ${port}`);

  // Load any file-stored credentials into memory before running sync checks
  await initStoredCreds();

  // ── Weekly CrowdStrike auto-sync ─────────────────────────────────────────────
  // On startup: check if a sync is overdue (> 7 days since last) and run one.
  // Then re-check every 6 hours so the weekly schedule is maintained even across
  // server restarts without needing a persistent cron daemon.
  maybeAutoSync().catch(console.error);
  setInterval(() => maybeAutoSync().catch(console.error), 6 * 60 * 60 * 1000);
});
