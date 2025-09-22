import express from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { redis } from "../lib/redis.js";
import { badRequest, internal } from "../lib/errors.js";
import { API_ORIGIN, JOIN_TOKEN_TTL_SECONDS } from "../lib/env.js";
import { signToken } from "../services/tokens.js";

export const callRouter = express.Router();

const CreateSchema = z.object({
  initiator_telegram_id: z.string().min(1).max(64),
});

const ResolveSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/),
});

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function randomId(prefix = "", len = 10) {
  return prefix + crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function buildJoinUrl(token) {
  const origin = API_ORIGIN?.replace(/\/+$/, "") ?? "";
  return `${origin}/join?token=${encodeURIComponent(token)}`;
}

callRouter.post("/create", async (req, res) => {
  try {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues);
    }

    const callId = randomId("c_", 16);
    const code = (Math.random().toString(36).slice(2, 8) + "XXXX").slice(0, 6).toUpperCase();
    const now = Date.now();

    await redis.multi()
      .hset(`call:${callId}`, "status", "pending", "createdAt", String(now), "updatedAt", String(now), "initiator", parsed.data.initiator_telegram_id)
      .expire(`call:${callId}`, 60 * 60)
      .set(`otc:${code}`, callId, "EX", 15 * 60)
      .exec();

    const tokenOfferer = signToken({ callId, role: "offerer" }, JOIN_TOKEN_TTL_SECONDS);

    return res.json({
      callId,
      code,
      joinUrl: buildJoinUrl(tokenOfferer),
    });
  } catch (error) {
    console.error(error);
    return internal(res);
  }
});

callRouter.post("/resolve", async (req, res) => {
  try {
    const parsed = ResolveSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues);
    }

    const code = parsed.data.code.toUpperCase();
    const key = `otc:${code}`;
    const callId = await redis.get(key);

    if (!callId) {
      return res.status(404).json({ error: "code_not_found_or_expired" });
    }

    await redis.del(key);
    const token = signToken({ callId, role: "answerer" }, JOIN_TOKEN_TTL_SECONDS);

    return res.json({ joinUrl: buildJoinUrl(token) });
  } catch (error) {
    console.error(error);
    return internal(res);
  }
});