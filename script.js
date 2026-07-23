const HOLD_MS = 1000;
const RESET_MS = 3000;
const RING_CIRCUMFERENCE = 2 * Math.PI * 115;
const CLIENT_COOLDOWN_MS = 30000;

const button = document.getElementById("requestButton");
const ring = document.getElementById("ringProgress");
const statusIdle = document.getElementById("statusIdle");
const statusConfirm = document.getElementById("statusConfirm");
const statusError = document.getElementById("statusError");
const stage = document.getElementById("stage");

let holdTimer;
let resetTimer;
let sent = false;
let holding = false;

const storage = {
  get lastRequestAt() {
    return Number(localStorage.getItem("oneTapRequest:lastRequestAt") || 0);
  },
  set lastRequestAt(value) {
    localStorage.setItem("oneTapRequest:lastRequestAt", String(value));
  }
};

function resetRing() {
  ring.classList.remove("filling", "complete");
  ring.style.transition = "none";
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE;
}

function setStatus(kind) {
  statusIdle.classList.toggle("hide", kind !== "idle");
  statusConfirm.classList.toggle("show", kind === "success");
  statusError.classList.toggle("show", kind === "error");
}

function canSendNow() {
  return Date.now() - storage.lastRequestAt >= CLIENT_COOLDOWN_MS;
}

function cooldownRemainingSeconds() {
  return Math.ceil((CLIENT_COOLDOWN_MS - (Date.now() - storage.lastRequestAt)) / 1000);
}

function getClientRequestId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendRequest() {
  const response = await fetch("/api/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      type: "one_tap_request",
      clientRequestId: getClientRequestId(),
      timestamp: new Date().toISOString()
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.message || "Try again in a moment.";
    throw new Error(message);
  }

  return payload;
}

function spawnParticles() {
  for (let index = 0; index < 14; index += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    const angle = ((Math.PI * 2) / 14) * index;
    const distance = 86 + Math.random() * 38;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    stage.appendChild(particle);

    particle.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.6)", opacity: 0.9 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0)`, opacity: 0 }
      ],
      { duration: 760, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    );

    window.setTimeout(() => particle.remove(), 800);
  }
}

function scheduleReset() {
  clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => {
    button.classList.remove("sent");
    button.disabled = false;
    button.setAttribute("aria-label", "Hold to send request");
    setStatus("idle");
    resetRing();
    sent = false;
  }, RESET_MS);
}

async function completeRequest() {
  if (sent) {
    return;
  }

  sent = true;
  holding = false;
  button.disabled = true;
  button.classList.remove("pressing");
  button.classList.add("sent");
  button.setAttribute("aria-label", "Request sent");
  ring.classList.add("complete");
  setStatus("success");
  spawnParticles();

  try {
    await sendRequest();
    storage.lastRequestAt = Date.now();
  } catch (error) {
    statusError.textContent = error.message;
    button.classList.remove("sent");
    setStatus("error");
  } finally {
    scheduleReset();
  }
}

function startHold(event) {
  event.preventDefault();

  if (sent || holding) {
    return;
  }

  if (!canSendNow()) {
    statusError.textContent = `Try again in ${cooldownRemainingSeconds()}s.`;
    setStatus("error");
    clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => setStatus("idle"), 1400);
    return;
  }

  holding = true;
  button.setPointerCapture?.(event.pointerId);
  button.classList.add("pressing");
  ring.style.transition = "none";
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE;
  ring.getBoundingClientRect();
  ring.classList.add("filling");
  ring.style.strokeDashoffset = 0;
  setStatus("idle");

  holdTimer = window.setTimeout(completeRequest, HOLD_MS);
}

function cancelHold() {
  if (sent || !holding) {
    return;
  }

  holding = false;
  clearTimeout(holdTimer);
  button.classList.remove("pressing");
  ring.style.transition = "stroke-dashoffset 0.4s ease";
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
    });
  }
}

button.addEventListener("pointerdown", startHold);
button.addEventListener("pointerup", cancelHold);
button.addEventListener("pointerleave", cancelHold);
button.addEventListener("pointercancel", cancelHold);

resetRing();
registerServiceWorker();
