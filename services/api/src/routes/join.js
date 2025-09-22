import express from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { TURN_DOMAIN, TURN_SECRET, TURN_TTL_SECONDS, WS_PUBLIC } from "../lib/env.js";
import { badRequest } from "../lib/errors.js";
import { verifyToken } from "../services/tokens.js";
import { callExists, peersCount } from "../services/calls.js";

export const joinRouter = express.Router();

const JoinSchema = z.object({
  token: z.string().min(10),
});

function buildIceServers() {
  const expires = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  const username = `${expires}:user`;
  const credential = crypto.createHmac("sha1", TURN_SECRET).update(username).digest("base64");

  return [
    { urls: [`stun:${TURN_DOMAIN}:3478`] },
    { urls: [`turn:${TURN_DOMAIN}:3478?transport=udp`], username, credential },
    { urls: [`turn:${TURN_DOMAIN}:3478?transport=tcp`], username, credential },
    { urls: [`turns:${TURN_DOMAIN}:5349?transport=tcp`], username, credential },
  ];
}

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
      iceServers: buildIceServers(),
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