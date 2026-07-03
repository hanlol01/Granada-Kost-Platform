import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import routes from "./routes.js";
import { isSafeMode, maskValue, toErrorResponse } from "./tuyaClient.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.resolve(backendDir, "../.env") });
dotenv.config({ path: path.resolve(backendDir, ".env"), override: true });

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "tuya-smartlock-tester-backend",
    safeMode: isSafeMode(),
    config: {
      endpoint: process.env.TUYA_ENDPOINT || null,
      clientId: maskValue(process.env.TUYA_CLIENT_ID || ""),
      deviceId: maskValue(process.env.TUYA_DEVICE_ID || ""),
      credentialsConfigured: Boolean(process.env.TUYA_CLIENT_ID && process.env.TUYA_CLIENT_SECRET),
      deviceConfigured: Boolean(process.env.TUYA_DEVICE_ID),
    },
    time: new Date().toISOString(),
  });
});

app.use("/api", routes);

app.use((error, _req, res, _next) => {
  console.error(`[Backend] ${error.code || "ERROR"}: ${error.message}`);
  res.status(error.status || 500).json(toErrorResponse(error));
});

app.listen(port, () => {
  console.log(`[Backend] Tuya Smart Lock Tester berjalan di http://localhost:${port}`);
  console.log(`[Backend] SAFE_MODE=${isSafeMode()}`);
});
