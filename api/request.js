const RATE_LIMIT_WINDOW_MS = 30000;
const MAX_BODY_BYTES = 2048;
const recentRequests = new Map();
const REQUIRED_EMAIL_ENV = [
  "EMAILJS_SERVICE_ID",
  "EMAILJS_TEMPLATE_ID",
  "EMAILJS_PUBLIC_KEY",
  "EMAILJS_PRIVATE_KEY",
  "REQUEST_RECIPIENT_EMAIL"
];

class ConfigurationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ConfigurationError";
    this.details = details;
  }
}

class EmailDeliveryError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "EmailDeliveryError";
    this.details = details;
  }
}

class RequestPayloadError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RequestPayloadError";
    this.details = details;
  }
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("X-One-Tap-Commit", process.env.VERCEL_GIT_COMMIT_SHA || "local");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function getClientIp(request) {
  const forwarded = request.headers?.["x-forwarded-for"];
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

  return request.headers?.origin === allowedOrigin;
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

async function readJsonPayload(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body) && !(request.body instanceof Uint8Array)) {
    return request.body;
  }

  let rawBody;

  if (typeof request.body === "string") {
    rawBody = request.body;
  } else if (Buffer.isBuffer(request.body) || request.body instanceof Uint8Array) {
    rawBody = Buffer.from(request.body).toString("utf8");
  } else {
    rawBody = await readBody(request);
  }

  if (!rawBody || !rawBody.trim()) {
    throw new RequestPayloadError("Request body is empty.");
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new RequestPayloadError("Request body is not valid JSON.", {
      parserMessage: error?.message || "Invalid JSON",
      bodyLength: rawBody.length
    });
  }
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
    throw new ConfigurationError(`${name} is not configured.`, { missing: [name] });
  }

  return value.trim();
}

function validateEmailConfig() {
  const missing = REQUIRED_EMAIL_ENV.filter((name) => !process.env[name]?.trim());

  if (missing.length) {
    throw new ConfigurationError("EmailJS environment is incomplete.", { missing });
  }
}

function logRequestError(error, context = {}) {
  console.error(JSON.stringify({
    level: "error",
    source: "one-tap-request",
    phase: context.phase || "request",
    name: error?.name || "Error",
    message: error?.message || "Unknown error",
    details: error?.details || undefined
  }));
}

async function sendEmailRequest() {
  validateEmailConfig();

  const serviceId = getRequiredEnv("EMAILJS_SERVICE_ID");
  const templateId = getRequiredEnv("EMAILJS_TEMPLATE_ID");
  const publicKey = getRequiredEnv("EMAILJS_PUBLIC_KEY");
  const privateKey = getRequiredEnv("EMAILJS_PRIVATE_KEY");
  const toEmail = getRequiredEnv("REQUEST_RECIPIENT_EMAIL");

  let emailResponse;

  try {
    emailResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
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
  } catch (error) {
    throw new EmailDeliveryError("EmailJS request could not be reached.", {
      cause: error?.message || "Network request failed."
    });
  }

  const body = await emailResponse.text();

  if (!emailResponse.ok) {
    throw new EmailDeliveryError("EmailJS rejected the request.", {
      status: emailResponse.status,
      response: body.slice(0, 500)
    });
  }
}

export default async function handler(request, response) {
  try {
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

    if (!String(request.headers?.["content-type"] || "").includes("application/json")) {
      sendJson(response, 415, { ok: false, message: "Content-Type must be application/json." });
      return;
    }

    const ip = getClientIp(request);

    if (!checkRateLimit(ip)) {
      response.setHeader("Retry-After", String(RATE_LIMIT_WINDOW_MS / 1000));
      sendJson(response, 429, { ok: false, message: "Try again in 30s." });
      return;
    }

    const payload = await readJsonPayload(request);

    if (!validatePayload(payload)) {
      sendJson(response, 400, { ok: false, message: "Invalid request." });
      return;
    }

    await sendEmailRequest();
    sendJson(response, 200, { ok: true });
  } catch (error) {
    if (error instanceof ConfigurationError) {
      logRequestError(error, { phase: "configuration" });
      sendJson(response, 500, { ok: false, code: "EMAIL_CONFIG_MISSING", message: "Email delivery is not configured." });
      return;
    }

    if (error instanceof EmailDeliveryError) {
      logRequestError(error, { phase: "emailjs" });
      sendJson(response, 502, {
        ok: false,
        code: "EMAIL_DELIVERY_FAILED",
        message: "Email delivery failed.",
        diagnostic: error.details?.response || error.details?.cause || "Unknown EmailJS delivery error."
      });
      return;
    }

    if (error instanceof RequestPayloadError) {
      logRequestError(error, { phase: "payload" });
      sendJson(response, 400, {
        ok: false,
        code: "INVALID_JSON",
        message: "Invalid request body."
      });
      return;
    }

    logRequestError(error, { phase: "unexpected" });
    sendJson(response, 500, {
      ok: false,
      code: "REQUEST_FAILED",
      message: "Request could not be sent.",
      diagnostic: error?.message || "Unknown unexpected request error."
    });
  }
}
