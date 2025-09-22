import express from "express";
import { z } from "zod";
import { badRequest, internal } from "../lib/errors.js";
import { API_ORIGIN, JOIN_TOKEN_TTL_SECONDS } from "../lib/env.js";
import { createCall, resolveCodeToCallId } from "../services/calls.js";
import { signToken } from "../services/tokens.js";

export const callRouter = express.Router();

const CreateSchema = z.object({
  initiator_telegram_id: z.string().min(1).max(64),
});

const ResolveSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/),
});

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

    const { callId, code } = await createCall(parsed.data.initiator_telegram_id);
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
    const callId = await resolveCodeToCallId(code);

    if (!callId) {
      return res.status(404).json({ error: "code_not_found_or_expired" });
    }

    const token = signToken({ callId, role: "answerer" }, JOIN_TOKEN_TTL_SECONDS);

    return res.json({ joinUrl: buildJoinUrl(token) });
  } catch (error) {
    console.error(error);
    return internal(res);
  }
});
