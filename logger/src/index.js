import fs from "node:fs";
import path from "node:path";
import Redis from "ioredis";
import {
  bold,
  cyan,
  cyanBright,
  magenta,
  magentaBright,
  yellow,
  yellowBright,
  green,
  greenBright,
  blue,
  blueBright,
  red,
  redBright,
  gray
} from "colorette";

const {
  REDIS_URL = "redis://redis:6379",
  LOGGER_CALL_FILTER = "",
  LOGGER_INCLUDE_DETAIL = "1",
  LOGGER_FILE_PATH = "/var/log/calls/observer.log"
} = process.env;

const includeDetail = LOGGER_INCLUDE_DETAIL !== "0";
const callFilter = LOGGER_CALL_FILTER.trim();

const ensureFileStream = (filePath) => {
  if (!filePath) return null;
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const stream = fs.createWriteStream(filePath, { flags: "a" });
    stream.write(`# observer started ${new Date().toISOString()}\n`);
    return stream;
  } catch (err) {
    console.error("failed to open log file", err);
    return null;
  }
};

const fileStream = ensureFileStream(LOGGER_FILE_PATH);

function logLine(line) {
  console.log(line);
  if (fileStream) fileStream.write(`${line}\n`);
}

const subscriber = new Redis(REDIS_URL, { lazyConnect: true });
await subscriber.connect();
await subscriber.psubscribe("logs:*");

const colorPalette = [
  cyan,
  magenta,
  yellow,
  green,
  blue,
  red,
  cyanBright,
  magentaBright,
  yellowBright,
  greenBright,
  blueBright,
  redBright
];

const callColors = new Map();
const peerColors = new Map();
let paletteIndex = 0;

function nextColor() {
  const fn = colorPalette[paletteIndex % colorPalette.length];
  paletteIndex += 1;
  return fn;
}

function colorFor(map, key) {
  if (!map.has(key)) map.set(key, nextColor());
  return map.get(key);
}

function label(map, key, text) {
  const fn = colorFor(map, key);
  return fn(text);
}

function pad(text, size) {
  const str = String(text ?? "");
  return str.length >= size ? str.slice(0, size) : str.padEnd(size, " ");
}

function safeDetail(detail) {
  if (!Array.isArray(detail) || detail.length === 0) return undefined;
  return detail.map((item) => String(item));
}

logLine(
  bold(
    `log observer listening on ${REDIS_URL} (filter=${callFilter || "*"}; detail=${includeDetail ? "on" : "off"})`
  )
);
if (fileStream) {
  fileStream.write(`# redis=${REDIS_URL} filter=${callFilter || "*"} detail=${includeDetail ? "on" : "off"}\n`);
}

subscriber.on("pmessage", (_pattern, channel, message) => {
  let entry;
  try {
    entry = JSON.parse(message);
  } catch (err) {
    logLine(`failed to parse log message: ${err?.message || err}`);
    return;
  }

  const channelCall = channel.split(":")[1] || "unknown";
  const callId = entry.callId || channelCall;
  if (callFilter && callId !== callFilter) return;

  const ts = entry.ts ? new Date(entry.ts) : new Date();
  const timeLabel = gray(ts.toISOString());
  const callLabel = label(callColors, callId, pad(callId, 8));
  const peerKey = `${callId}:${entry.peerId || entry.role || "?"}`;
  const peerLabel = label(peerColors, peerKey, pad(entry.peerId || entry.role || "peer", 10));
  const roleLabel = entry.role ? gray(`[${entry.role}]`) : "";
  const text = entry.message ? String(entry.message) : "";

  logLine(`${timeLabel} ${callLabel} ${peerLabel} ${roleLabel} ${text}`.trim());

  const detail = includeDetail ? safeDetail(entry.detail) : undefined;
  if (detail && detail.length) {
    logLine(gray(`  detail: ${detail.join(" | ")}`));
  }
});

async function shutdown() {
  try {
    await subscriber.quit();
  } catch {}
  if (fileStream) {
    await new Promise((resolve) => fileStream.end(resolve));
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
