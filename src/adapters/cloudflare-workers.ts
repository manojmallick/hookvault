import { app } from "../logic/app.js";

// Cloudflare Workers consumes a Web-standard `{ fetch(request, env, ctx) }` export directly
// — Hono apps already implement that shape, so no wrapper function is needed here (unlike
// aws-lambda.ts). hono/cloudflare-workers only exports utilities (serveStatic,
// upgradeWebSocket, getConnInfo), not an entrypoint adapter.
export default app;
