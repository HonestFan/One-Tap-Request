const RATE_LIMIT_WINDOW_MS = 30000;
const MAX_BODY_BYTES = 2048;
const recentRequests = new Map();

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return request.socket?.remoteAddress || "unknown";
}

function isAllowedOrigin(request) {
  const allowedOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (!allowedOrigin) {
    return true;
  }

  const origin = request.headers.origin;
  return origin === allowedOrigin;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }

      body += chunk;
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  if (payload.type !== "one_tap_request") {
    return false;
  }

  if (typeof payload.clientRequestId !== "string" || !/^[a-f0-9-]{16,64}$/i.test(payload.clientRequestId)) {
    return false;
  }

  const timestamp = Date.parse(payload.timestamp);
  const age = Math.abs(Date.now() - timestamp);
  return Number.isFinite(timestamp) && age < 10 * 60 * 1000;
}

function checkRateLimit(key) {
  const now = Date.now();
  const previous = recentRequests.get(key) || 0;

  for (const [entryKey, lastSeen] of recentRequests.entries()) {
    if (now - lastSeen > RATE_LIMIT_WINDOW_MS * 4) {
      recentRequests.delete(entryKey);
    }
  }

  if (now - previous < RATE_LIMIT_WINDOW_MS) {
    return false;
  }

  recentRequests.set(key, now);
  return true;
}

function buildOneSignalPayload() {
  const appId = process.env.ONESIGNAL_APP_ID;
  const subscriptionId = process.env.ONESIGNAL_SUBSCRIPTION_ID;
  const externalUserId = process.env.ONESIGNAL_EXTERNAL_USER_ID;
  const segment = process.env.ONESIGNAL_INCLUDED_SEGMENT;

  const payload = {
    app_id: appId,
    target_channel: "push",
    name: "One Tap Request",
    headings: { en: "❤️ Request Received" },
    contents: { en: "She needs you." },
    custom_data: {
      source: "one_tap_request",
      sent_at: new Date().toISOString()
    }
  };

  if (subscriptionId) {
    payload.include_subscription_ids = [subscriptionId];
    return payload;
  }

  if (externalUserId) {
    payload.include_aliases = { external_id: [externalUserId] };
    return payload;
  }

  payload.included_segments = [segment || "Subscribed Users"];
  return payload;
}

async function notifyOneSignal() {
  const apiKey = process.env.ONESIGNAL_API_KEY;
  const appId = process.env.ONESIGNAL_APP_ID;

  if (!apiKey || !appId) {
    throw new Error("OneSignal is not configured.");
  }

  const response = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(buildOneSignalPayload())
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`OneSignal rejected the request: ${body}`);
  }

  return body ? JSON.parse(body) : {};
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Methods", "POST");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, message: "Only POST requests are allowed." });
    return;
  }

  if (!isAllowedOrigin(request)) {
    sendJson(response, 403, { ok: false, message: "Request origin is not allowed." });
    return;
  }

  if (!String(request.headers["content-type"] || "").includes("application/json")) {
    sendJson(response, 415, { ok: false, message: "Content-Type must be application/json." });
    return;
  }

  const ip = getClientIp(request);

  if (!checkRateLimit(ip)) {
    response.setHeader("Retry-After", String(RATE_LIMIT_WINDOW_MS / 1000));
    sendJson(response, 429, { ok: false, message: "Try again in 30s." });
    return;
  }

  try {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody);

    if (!validatePayload(payload)) {
      sendJson(response, 400, { ok: false, message: "Invalid request." });
      return;
    }

    const notification = await notifyOneSignal();
    sendJson(response, 200, { ok: true, notificationId: notification.id || null });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, message: "Request could not be sent." });
  }
}
