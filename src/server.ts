import { serve } from "@hono/node-server";
import { app } from "./logic/app.js";

// Local dev entry (via `tsx watch`) *and* the GCP Cloud Run container entry (via
// Dockerfile) — Cloud Run just needs any HTTP server listening on $PORT, no Hono adapter
// exists for it the way aws-lambda/cloudflare-workers do.
const port = Number(process.env.PORT ?? 8080);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`hookvault listening on http://localhost:${info.port}`);
});
