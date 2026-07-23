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

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`${name} is not configured.`);
  }

  return value.trim();
}

async function sendEmailRequest() {
  const serviceId = getRequiredEnv("service_l0abpsm");
  const templateId = getRequiredEnv("template_d1e4ttq");
  const publicKey = getRequiredEnv("2u6gtfbEMxYB1d33q");
  const privateKey = getRequiredEnv("JY2RrAq1iQbJcInZly5sQ");
  const toEmail = getRequiredEnv("honestkaifan@gmail.com");

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        to_email: toEmail,
        subject: "❤️ Request Received",
        title: "❤️ Request Received",
        message: "She needs you.",
        body: "She needs you.",
        sent_at: new Date().toISOString()
      }
    })
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`EmailJS rejected the request: ${body}`);
  }
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

    await sendEmailRequest();
    sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, message: "Request could not be sent." });
  }
}
