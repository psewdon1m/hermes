import express from "express";
import { z } from "zod";
import { WS_PUBLIC } from "../lib/env.js";
import { badRequest } from "../lib/errors.js";
import { verifyToken } from "../services/tokens.js";
import { callExists, peersCount } from "../services/calls.js";
import { buildIceServers } from "../services/turn.js";

export const joinRouter = express.Router();

const JoinSchema = z.object({
  token: z.string().min(10),
});

joinRouter.post("/", async (req, res) => {
  try {
    const parsed = JoinSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues);
    }

    const payload = verifyToken(parsed.data.token);
    const callId = payload.callId;

    if (!(await callExists(callId))) {
      return res.status(404).json({ error: "call_not_found" });
    }

    const peerCount = await peersCount(callId);
    const role = peerCount > 0 ? "answerer" : "offerer";

    return res.json({
      callId,
      role,
      iceServers: buildIceServers(callId),
      wsUrl: WS_PUBLIC,
    });
  } catch (error) {
    console.error(error);
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "invalid_token" });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});
