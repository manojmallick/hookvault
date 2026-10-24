import { handle } from "hono/aws-lambda";
import { app } from "../logic/app.js";

export const handler = handle(app);
