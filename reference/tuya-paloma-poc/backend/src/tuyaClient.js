import crypto from "node:crypto";
import axios from "axios";

const TOKEN_REFRESH_BUFFER_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

let tokenCache = null;

function requiredConfig(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    const error = new Error(`${name} belum diisi di backend/.env`);
    error.status = 500;
    error.code = "CONFIG_MISSING";
    throw error;
  }
  return value;
}

function getConfig() {
  return {
    clientId: requiredConfig("TUYA_CLIENT_ID"),
    clientSecret: requiredConfig("TUYA_CLIENT_SECRET"),
    endpoint: requiredConfig("TUYA_ENDPOINT").replace(/\/+$/, ""),
    lang: process.env.TUYA_LANG?.trim() || "en",
  };
}

export function getDeviceId() {
  return requiredConfig("TUYA_DEVICE_ID");
}

export function isSafeMode() {
  return String(process.env.SAFE_MODE ?? "true").toLowerCase() !== "false";
}

export function generateTimestamp() {
  return Date.now().toString();
}

export function generateNonce() {
  return crypto.randomUUID().replaceAll("-", "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacSha256(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex").toUpperCase();
}

function serializeBody(body) {
  if (body === undefined || body === null || body === "") return "";
  return typeof body === "string" ? body : JSON.stringify(body);
}

function canonicalizePath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    const error = new Error("Path Tuya harus berupa relative path yang diawali '/'");
    error.status = 400;
    error.code = "INVALID_PATH";
    throw error;
  }

  const url = new URL(path, "https://tuya.local");
  const sorted = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) => {
    return aKey.localeCompare(bKey) || aValue.localeCompare(bValue);
  });
  const query = new URLSearchParams(sorted).toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

export function generateSignature({
  method,
  path,
  body,
  clientId,
  clientSecret,
  accessToken = "",
  timestamp,
  nonce,
}) {
  const canonicalPath = canonicalizePath(path);
  const bodyText = serializeBody(body);
  const stringToSign = [
    method.toUpperCase(),
    sha256(bodyText),
    "",
    canonicalPath,
  ].join("\n");
  const signPayload = `${clientId}${accessToken}${timestamp}${nonce}${stringToSign}`;

  return {
    sign: hmacSha256(signPayload, clientSecret),
    canonicalPath,
    bodyText,
  };
}

function classifyTuyaError(payload, status) {
  const text = `${payload?.code ?? ""} ${payload?.msg ?? payload?.message ?? ""}`.toLowerCase();

  if (text.includes("sign") || text.includes("signature")) return "SIGNATURE_INVALID";
  if (text.includes("permission") || text.includes("no privilege")) return "PERMISSION_DENIED";
  if (text.includes("not subscribe") || text.includes("subscription")) return "API_NOT_SUBSCRIBED";
  if (text.includes("offline")) return "DEVICE_OFFLINE";
  if (text.includes("instruction") && text.includes("not support")) return "INSTRUCTION_NOT_SUPPORTED";
  if (text.includes("token") || status === 401) return "TOKEN_ERROR";
  return "TUYA_API_ERROR";
}

function normalizeAxiosError(error) {
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return {
      status: 504,
      code: "TUYA_TIMEOUT",
      message: `Tuya API timeout setelah ${REQUEST_TIMEOUT_MS / 1000} detik`,
      tuya: null,
    };
  }

  if (!error.response) {
    return {
      status: 502,
      code: "TUYA_CONNECTION_ERROR",
      message: `Tidak dapat terhubung ke Tuya endpoint: ${error.message}`,
      tuya: null,
    };
  }

  const payload = error.response.data;
  return {
    status: error.response.status || 502,
    code: classifyTuyaError(payload, error.response.status),
    message: payload?.msg || payload?.message || error.message,
    tuya: payload,
  };
}

async function signedRequest({ method = "GET", path, body, accessToken = "" }) {
  const config = getConfig();
  const timestamp = generateTimestamp();
  const nonce = generateNonce();
  const { sign, canonicalPath, bodyText } = generateSignature({
    method,
    path,
    body,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    accessToken,
    timestamp,
    nonce,
  });

  console.log(`[Tuya] ${method.toUpperCase()} ${canonicalPath} token=${accessToken ? maskValue(accessToken) : "none"}`);

  try {
    const response = await axios({
      method: method.toUpperCase(),
      url: `${config.endpoint}${canonicalPath}`,
      data: bodyText || undefined,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        client_id: config.clientId,
        ...(accessToken ? { access_token: accessToken } : {}),
        sign,
        t: timestamp,
        nonce,
        sign_method: "HMAC-SHA256",
        lang: config.lang,
        ...(bodyText ? { "Content-Type": "application/json" } : {}),
      },
      transformRequest: [(data) => data],
    });

    return response.data;
  } catch (error) {
    const normalized = normalizeAxiosError(error);
    const wrapped = new Error(normalized.message);
    Object.assign(wrapped, normalized);
    throw wrapped;
  }
}

export async function requestAccessToken({ force = false } = {}) {
  if (!force && tokenCache && Date.now() < tokenCache.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return { ...tokenCache, source: "memory-cache" };
  }

  const payload = await signedRequest({
    method: "GET",
    path: "/v1.0/token?grant_type=1",
  });

  if (!payload?.success || !payload?.result?.access_token) {
    const error = new Error(payload?.msg || "Tuya tidak mengembalikan access token");
    error.status = 502;
    error.code = classifyTuyaError(payload, 502);
    error.tuya = payload;
    throw error;
  }

  const expiresInSeconds = Number(payload.result.expire_time || 7200);
  tokenCache = {
    accessToken: payload.result.access_token,
    refreshToken: payload.result.refresh_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
    expiresInSeconds,
    raw: payload,
  };

  return { ...tokenCache, source: "tuya-cloud" };
}

export async function tuyaRequest({ method = "GET", path, body }) {
  let token = await requestAccessToken();
  let payload = await signedRequest({
    method,
    path,
    body,
    accessToken: token.accessToken,
  });

  const tokenFailed = !payload?.success && classifyTuyaError(payload, 200) === "TOKEN_ERROR";
  if (tokenFailed) {
    token = await requestAccessToken({ force: true });
    payload = await signedRequest({
      method,
      path,
      body,
      accessToken: token.accessToken,
    });
  }

  if (!payload?.success) {
    const error = new Error(payload?.msg || payload?.message || "Tuya API request gagal");
    error.status = 502;
    error.code = classifyTuyaError(payload, 502);
    error.tuya = payload;
    throw error;
  }

  return payload;
}

export function maskValue(value) {
  if (!value || typeof value !== "string") return value;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}${"*".repeat(Math.min(12, value.length - 8))}${value.slice(-4)}`;
}

export function maskSensitive(value) {
  const sensitiveKeys = /secret|access_token|refresh_token|local_key|ticket_key|password/i;

  if (Array.isArray(value)) return value.map(maskSensitive);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKeys.test(key) && typeof entry === "string" ? maskValue(entry) : maskSensitive(entry),
    ]),
  );
}

export function toErrorResponse(error) {
  return {
    success: false,
    error: {
      code: error.code || "BACKEND_ERROR",
      message: error.message || "Terjadi error yang tidak diketahui",
      hint: errorHint(error.code),
    },
    tuya: maskSensitive(error.tuya ?? null),
  };
}

function errorHint(code) {
  const hints = {
    CONFIG_MISSING: "Isi semua credential dan device ID yang diperlukan di backend/.env.",
    SIGNATURE_INVALID: "Periksa client ID, client secret, endpoint region, waktu sistem, dan format signing.",
    PERMISSION_DENIED: "Pastikan device sudah tertaut ke cloud project dan project memiliki izin API yang diperlukan.",
    API_NOT_SUBSCRIBED: "Subscribe layanan API terkait di Tuya Cloud Project.",
    DEVICE_OFFLINE: "Pastikan smart lock/gateway online. Beberapa lock hanya aktif sesaat untuk menghemat baterai.",
    INSTRUCTION_NOT_SUPPORTED: "Device ini tidak mendukung instruksi tersebut.",
    TOKEN_ERROR: "Token ditolak Tuya. Backend akan mencoba refresh otomatis pada request berikutnya.",
    TUYA_TIMEOUT: "Periksa koneksi internet, region endpoint, dan status Tuya Cloud.",
  };
  return hints[code] || null;
}
