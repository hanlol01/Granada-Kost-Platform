import express from "express";
import {
  getDeviceId,
  isSafeMode,
  maskSensitive,
  maskValue,
  requestAccessToken,
  toErrorResponse,
  tuyaRequest,
} from "./tuyaClient.js";

const router = express.Router();
const ALLOWED_RAW_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function devicePath(suffix = "") {
  return `/v1.0/devices/${encodeURIComponent(getDeviceId())}${suffix}`;
}

async function attempt(name, method, path, body) {
  try {
    const tuya = await tuyaRequest({ method, path, body });
    return { name, method, path, success: Boolean(tuya?.success), tuya: maskSensitive(tuya) };
  } catch (error) {
    return { name, method, path, ...toErrorResponse(error) };
  }
}

async function doorOperate(open) {
  const deviceId = encodeURIComponent(getDeviceId());
  const attempts = [];

  const ticketAttempt = await attempt(
    "Get smart-lock password ticket",
    "POST",
    `/v1.0/smart-lock/devices/${deviceId}/password-ticket`,
    {},
  );
  attempts.push(ticketAttempt);

  const ticketId = ticketAttempt.tuya?.result?.ticket_id;
  if (ticketId) {
    const operation = await attempt(
      open ? "Password-free door operate: unlock" : "Password-free door operate: lock",
      "POST",
      `/v1.0/smart-lock/devices/${deviceId}/password-free/door-operate`,
      { ticket_id: ticketId, open },
    );
    attempts.push(operation);
    if (operation.success) {
      return { success: true, action: open ? "unlock" : "lock", strategy: operation.name, attempts };
    }
  }

  if (open) {
    const legacy = await attempt(
      "Legacy password-free open-door",
      "POST",
      `/v1.0/devices/${deviceId}/door-lock/password-free/open-door`,
      {},
    );
    attempts.push(legacy);
    if (legacy.success) {
      return { success: true, action: "unlock", strategy: legacy.name, attempts };
    }
  }

  return {
    success: false,
    action: open ? "unlock" : "lock",
    message: open
      ? "Tidak ada metode remote unlock yang berhasil. Periksa response setiap attempt."
      : "Remote lock tidak didukung atau gagal. Banyak smart lock hanya mendukung automatic locking.",
    attempts,
  };
}

router.get("/tuya/token", asyncRoute(async (_req, res) => {
  const token = await requestAccessToken({ force: true });
  res.json({
    success: true,
    result: {
      access_token: maskValue(token.accessToken),
      refresh_token: maskValue(token.refreshToken),
      expires_in_seconds: token.expiresInSeconds,
      expires_at: new Date(token.expiresAt).toISOString(),
      source: token.source,
    },
    tuya: maskSensitive(token.raw),
  });
}));

router.get("/device", asyncRoute(async (_req, res) => {
  res.json(maskSensitive(await tuyaRequest({ path: devicePath() })));
}));

router.get("/device/status", asyncRoute(async (_req, res) => {
  res.json(maskSensitive(await tuyaRequest({ path: devicePath("/status") })));
}));

router.get("/device/functions", asyncRoute(async (_req, res) => {
  res.json(maskSensitive(await tuyaRequest({ path: devicePath("/functions") })));
}));

router.get("/device/specifications", asyncRoute(async (_req, res) => {
  const primary = await attempt("Device specifications v1.0", "GET", devicePath("/specifications"));
  if (primary.success) return res.json(primary);

  const fallback = await attempt(
    "Device specification IoT Core v1.2",
    "GET",
    `/v1.2/iot-03/devices/${encodeURIComponent(getDeviceId())}/specification`,
  );
  res.json({
    success: fallback.success,
    message: fallback.success ? "Fallback specification endpoint berhasil." : "Semua specification endpoint gagal.",
    attempts: [primary, fallback],
  });
}));

router.post("/lock/unlock", asyncRoute(async (_req, res) => {
  if (isSafeMode()) {
    return res.json({
      success: true,
      simulated: true,
      action: "unlock",
      message: "SAFE_MODE aktif. Tidak ada perintah yang dikirim ke pintu fisik.",
    });
  }
  res.json(await doorOperate(true));
}));

router.post("/lock/lock", asyncRoute(async (_req, res) => {
  if (isSafeMode()) {
    return res.json({
      success: true,
      simulated: true,
      action: "lock",
      message: "SAFE_MODE aktif. Tidak ada perintah yang dikirim ke pintu fisik.",
    });
  }
  res.json(await doorOperate(false));
}));

router.post("/tuya/raw", asyncRoute(async (req, res) => {
  const method = String(req.body?.method || "GET").toUpperCase();
  const path = req.body?.path;
  const body = req.body?.body;

  if (!ALLOWED_RAW_METHODS.has(method)) {
    return res.status(400).json({ success: false, error: { code: "INVALID_METHOD", message: "Method harus GET, POST, PUT, atau DELETE." } });
  }
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return res.status(400).json({ success: false, error: { code: "INVALID_PATH", message: "Path harus relative path Tuya yang diawali '/'." } });
  }
  if (isSafeMode() && method !== "GET") {
    return res.status(403).json({
      success: false,
      error: {
        code: "SAFE_MODE_BLOCKED",
        message: "SAFE_MODE aktif. Raw API Tester hanya mengizinkan GET agar tidak dapat mengubah atau mengontrol device.",
      },
    });
  }

  res.json(maskSensitive(await tuyaRequest({ method, path, body: method === "GET" ? undefined : body })));
}));

export default router;
