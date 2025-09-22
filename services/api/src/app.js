import express from "express";
import morgan from "morgan";
import cors from "cors";

import { callRouter } from "./routes/call.js";
import { joinRouter } from "./routes/join.js";
import { rateLimit, bruteCodeLimiter } from "./lib/ratelimit.js";
import { ALLOW_ORIGIN } from "./lib/env.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: ALLOW_ORIGIN, credentials: false }));
  app.use(express.json({ limit: "100kb" }));
  app.use(morgan("tiny"));

  app.get("/health", (_req, res) => res.send("ok"));
  app.get("/api/health", (_req, res) => res.send("ok"));
  app.get("/healthz", (_req, res) => res.send("ok"));
  app.get("/api/healthz", (_req, res) => res.send("ok"));

  app.use(rateLimit({
    windowSec: 60,
    limit: 60,
    keyFn: (req) => {
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
        .toString()
        .split(",")[0]
        .trim();
      return `rl:ip:${ip}:g60`;
    },
  }));

  app.use("/api/call/resolve", bruteCodeLimiter({
    ipLimit: 40,
    codeLimit: 25,
    windowSec: 300,
  }));

  app.use("/api/call", callRouter);
  app.use("/api/join", joinRouter);

  app.use((err, req, res, _next) => {
    console.error("API Error:", { path: req.path, error: err?.message });
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}