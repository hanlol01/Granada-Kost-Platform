import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const artifactDir = path.join(repoRoot, "artifacts", "m14c-browser-regression");
const screenshotDir = path.join(artifactDir, "screenshots");
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "granada-m14c-"));
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const testPassword = "Demo123@";
const adminEmail = "dev.admin@kostation.test";
const residentEmail = "dev.resident.alpha@kostation.test";

const TIMEOUTS = {
  manualLogin: 5 * 60 * 1000,
  page: 20_000,
  action: 15_000,
  upload: 25_000,
};

const state = {
  commands: [],
  routes: [],
  screenshots: [],
  console: [],
  network: [],
  bodiesForLeakScan: [],
  services: [],
  results: {},
  issues: [],
  limitations: [],
  testData: {},
  env: {},
};

const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStep(message) {
  const line = `[M14C] ${message}`;
  console.log(line);
}

async function ensureDirs() {
  await fs.rm(screenshotDir, { recursive: true, force: true });
  await fs.mkdir(screenshotDir, { recursive: true });
  for (const filename of [
    "README.md",
    "qa-summary.json",
    "browser-console-sanitized.json",
    "network-summary-sanitized.json",
    "leakage-check.txt",
    "limitations.md",
    "api.log",
    "api.err.log",
    "admin-dev.log",
    "admin-dev.err.log",
    "penghuni-dev.log",
    "penghuni-dev.err.log",
  ]) {
    await fs.rm(path.join(artifactDir, filename), { force: true });
  }
}

function mask(value) {
  if (!value) return value;
  return String(value)
    .replaceAll(testPassword, "***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
    .replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token":"***"')
    .replace(/"refresh_token"\s*:\s*"[^"]+"/g, '"refresh_token":"***"');
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = parsed.search ? "?..." : "";
    return parsed.toString();
  } catch {
    return url;
  }
}

async function freePort(preferred) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(freePort(0)));
    server.listen(preferred, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 60000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown"}`);
}

function startProcess(name, command, args, options = {}) {
  state.commands.push(`${command} ${args.join(" ")}`);
  const env = Object.fromEntries(
    Object.entries({ ...process.env, ...(options.env ?? {}) })
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  const proc = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: options.shell ?? false,
  });
  const logPath = path.join(artifactDir, `${name}.log`);
  const errPath = path.join(artifactDir, `${name}.err.log`);
  proc.stdout.on("data", (chunk) => {
    void fs.appendFile(logPath, mask(chunk.toString()));
  });
  proc.stderr.on("data", (chunk) => {
    void fs.appendFile(errPath, mask(chunk.toString()));
  });
  proc.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      state.issues.push(`${name} exited with code ${code}`);
    }
    if (signal) {
      void fs.appendFile(errPath, `${name} exited with signal ${signal}\n`);
    }
  });
  state.services.push({ name, proc });
  return proc;
}

async function stopServices() {
  for (const service of state.services.reverse()) {
    if (!service.proc.killed) {
      service.proc.kill();
    }
  }
  await sleep(1500);
}

class CdpPage {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = [];
    this.responseByRequestId = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.handleMessage(event.data));
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Network.enable");
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: 1365,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  handleMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result ?? {});
      return;
    }
    if (message.method === "Runtime.consoleAPICalled") {
      const args = (message.params.args ?? [])
        .map((arg) => arg.value ?? arg.description ?? arg.type)
        .join(" ");
      state.console.push({
        type: message.params.type,
        text: mask(args).slice(0, 800),
      });
    }
    if (message.method === "Log.entryAdded") {
      state.console.push({
        type: message.params.entry.level,
        text: mask(message.params.entry.text).slice(0, 800),
      });
    }
    if (message.method === "Network.responseReceived") {
      const response = message.params.response;
      const item = {
        requestId: message.params.requestId,
        url: response.url,
        status: response.status,
        mimeType: response.mimeType,
        type: message.params.type,
      };
      this.responseByRequestId.set(item.requestId, item);
      if (response.status >= 400) {
        state.network.push({
          url: sanitizeUrl(response.url),
          status: response.status,
          type: item.type,
        });
      }
    }
    if (message.method === "Network.loadingFailed") {
      state.network.push({
        url: sanitizeUrl(message.params.requestId),
        status: "loadingFailed",
        errorText: message.params.errorText,
      });
    }
    if (message.method === "Network.loadingFinished") {
      const item = this.responseByRequestId.get(message.params.requestId);
      if (item?.mimeType?.includes("json") && item.url.includes("/api/v1/")) {
        void this.captureBody(message.params.requestId, item.url, item.status);
      }
    }
  }

  async captureBody(requestId, url, status) {
    try {
      const body = await this.send("Network.getResponseBody", { requestId });
      const text = body.base64Encoded
        ? Buffer.from(body.body, "base64").toString("utf8")
        : body.body;
      state.bodiesForLeakScan.push({ url, status, text: mask(text).slice(0, 5000) });
    } catch {
      // Some responses are no longer available; network status is still recorded.
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async navigate(url) {
    state.routes.push(url);
    try {
      await this.send("Page.bringToFront");
    } catch {
      // Some targets may not support focusing; navigation can continue.
    }
    await this.send("Page.navigate", { url });
    await this.waitForLoad();
    await sleep(800);
  }

  async waitForLoad() {
    await this.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        if (document.readyState === "complete") resolve(true);
        else window.addEventListener("load", () => resolve(true), { once: true });
      })`,
      awaitPromise: true,
    });
  }

  async eval(expression, awaitPromise = true) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "Runtime exception");
    }
    return result.result?.value;
  }

  async screenshot(name) {
    const result = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    const rel = path.join("artifacts", "m14c-browser-regression", "screenshots", name);
    await fs.writeFile(path.join(screenshotDir, name), Buffer.from(result.data, "base64"));
    state.screenshots.push(rel.replaceAll("\\", "/"));
  }

  async close() {
    try {
      this.ws?.close();
    } catch {
      // ignore close errors
    }
  }
}

async function createChromePage(debugPort) {
  const endpoint = `http://127.0.0.1:${debugPort}/json/new?about:blank`;
  let response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) {
    response = await fetch(endpoint);
  }
  if (!response.ok) throw new Error(`Could not create Chrome target: ${response.status}`);
  const target = await response.json();
  const page = new CdpPage(target.webSocketDebuggerUrl);
  await page.connect();
  return page;
}

async function startChromePage(label, debugPort, profileDir) {
  const chrome = spawn(chromePath, [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--start-maximized",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
  state.commands.push(`${chromePath} --role=${label} --remote-debugging-port=${debugPort}`);
  state.services.push({ name: `chrome-${label}`, proc: chrome });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 30000);
  return createChromePage(debugPort);
}

function domHelpers() {
  return `
    const qa = {
      text: () => document.body.innerText,
      norm: (value) => (value || "").replace(/\\s+/g, " ").trim(),
      findByText: (text, selector = "button,a,[role=button]") => {
        const needle = text.toLowerCase();
        return Array.from(document.querySelectorAll(selector)).find((el) =>
          qa.norm(el.textContent).toLowerCase().includes(needle)
        );
      },
      clickText: (text, selector) => {
        const el = qa.findByText(text, selector);
        if (!el) throw new Error("Missing clickable text: " + text);
        el.click();
        return qa.norm(el.textContent);
      },
      clickSelector: (selector) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error("Missing selector: " + selector);
        el.click();
        return true;
      },
      setValue: (selector, value) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error("Missing field: " + selector);
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      selectFirstOption: (selector) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error("Missing select: " + selector);
        const option = Array.from(el.options).find((o) => o.value);
        if (!option) throw new Error("No selectable option: " + selector);
        el.value = option.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return option.textContent.trim();
      },
      uploadFile: (selector, name, type, base64) => {
        const input = document.querySelector(selector);
        if (!input) throw new Error("Missing file input: " + selector);
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const file = new File([bytes], name, { type });
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      uploadLargeFile: (selector) => {
        const input = document.querySelector(selector);
        if (!input) throw new Error("Missing file input: " + selector);
        const bytes = new Uint8Array(2 * 1024 * 1024 + 64);
        bytes[0] = 0x89; bytes[1] = 0x50; bytes[2] = 0x4e; bytes[3] = 0x47;
        const file = new File([bytes], "m14c-oversized.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      visibleTextIncludes: (text) => qa.text().toLowerCase().includes(text.toLowerCase()),
      clickFirstFilePreview: () => {
        const candidates = Array.from(document.querySelectorAll("img,button,div"))
          .filter((el) => /blob:|file|lampiran|bukti/i.test(el.outerHTML) && el.offsetParent !== null);
        const clickable = candidates.find((el) => typeof el.click === "function");
        if (!clickable) throw new Error("No file preview candidate found");
        clickable.click();
        return true;
      }
    };
  `;
}

async function waitFor(page, expression, timeoutMs = 30000, label = expression) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await page.eval(`(() => { ${domHelpers()} return Boolean(${expression}); })()`);
      if (value) return true;
    } catch (error) {
      last = error;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}${last ? ` (${last.message})` : ""}`);
}

async function waitOrFail(page, expression, timeoutMs, label, screenshotName) {
  try {
    return await waitFor(page, expression, timeoutMs, label);
  } catch (error) {
    if (screenshotName) {
      try {
        await page.screenshot(screenshotName);
      } catch {
        // Keep the original failure as the important signal.
      }
    }
    let visibleText = "";
    try {
      visibleText = await page.eval(`(() => document.body.innerText.slice(0, 1200))()`);
    } catch {
      visibleText = "(unable to read page text)";
    }
    const screenshotNote = screenshotName ? ` Screenshot: screenshots/${screenshotName}.` : "";
    const message = `STEP FAILED: ${label} after ${Math.round(timeoutMs / 1000)}s.${screenshotNote} Last visible text: ${visibleText}`;
    state.issues.push(message);
    throw new Error(message);
  }
}

async function clickText(page, text, selector) {
  await page.eval(`(() => { ${domHelpers()} return qa.clickText(${JSON.stringify(text)}, ${selector ? JSON.stringify(selector) : "undefined"}); })()`);
  await sleep(800);
}

async function clickTextByMouse(page, text, selector = "button,a,[role=button],[role=tab]") {
  const rect = await page.eval(`(() => {
    ${domHelpers()}
    const el = qa.findByText(${JSON.stringify(text)}, ${JSON.stringify(selector)});
    if (!el) throw new Error("Missing clickable text: " + ${JSON.stringify(text)});
    const box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, text: qa.norm(el.textContent) };
  })()`);
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rect.x,
    y: rect.y,
    button: "none",
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  await sleep(800);
  return rect.text;
}

async function fill(page, selector, value) {
  await page.eval(`(() => { ${domHelpers()} return qa.setValue(${JSON.stringify(selector)}, ${JSON.stringify(value)}); })()`);
}

async function manualLogin(page, baseUrl, label, screenshotName, dashboardShot, dashboardText) {
  logStep(`Open ${label} login. Manual login timeout: ${Math.round(TIMEOUTS.manualLogin / 1000)}s.`);
  await page.navigate(`${baseUrl}/login`);
  await waitOrFail(page, `qa.visibleTextIncludes("Masuk")`, TIMEOUTS.page, `${label} login page`, `${label.toLowerCase()}-login-timeout.png`);
  await page.screenshot(screenshotName);
  console.log(`MANUAL ACTION REQUIRED: log in to ${label} in the Chrome window and wait for ${dashboardText}.`);
  await waitOrFail(
    page,
    `!location.pathname.includes("/login") && qa.visibleTextIncludes(${JSON.stringify(dashboardText)})`,
    TIMEOUTS.manualLogin,
    `${label} manual login completed`,
    `${label.toLowerCase()}-manual-login-timeout.png`,
  );
  await page.screenshot(dashboardShot);
  logStep(`${label} manual login detected.`);
}

async function paymentProofFlow(page, adminPage, penghuniBase, adminBase) {
  logStep("Penghuni billing: verify manual payment proof upload UI.");
  await page.navigate(`${penghuniBase}/billing`);
  await waitOrFail(page, `qa.visibleTextIncludes("Tagihan")`, TIMEOUTS.page, "billing page", "penghuni-billing-timeout.png");
  await page.screenshot("penghuni-billing-manual-proof.png");
  const hasManual = await page.eval(`(() => { ${domHelpers()} return qa.visibleTextIncludes("Upload Bukti Pembayaran Manual"); })()`);
  if (!hasManual) {
    state.limitations.push("Payment proof UI not available because no current actionable invoice was visible for Resident Alpha.");
    state.results.paymentProof = "LIMITED";
    return;
  }
  await page.eval(`(() => { ${domHelpers()} return qa.uploadFile("#file-picker-payment_proof", "m14c-payment-proof.png", "image/png", "${pngBase64}"); })()`);
  await waitOrFail(page, `qa.visibleTextIncludes("File sudah diupload")`, TIMEOUTS.upload, "payment proof upload preview", "penghuni-payment-upload-timeout.png");
  await page.screenshot("penghuni-billing-proof-preview.png");
  await fill(page, "textarea", "M14C browser regression payment proof");
  await clickText(page, "Kirim Bukti Manual", "button");
  await waitOrFail(page, `qa.visibleTextIncludes("Bukti manual terkirim") || qa.visibleTextIncludes("menunggu review admin")`, TIMEOUTS.upload, "payment proof submitted", "penghuni-payment-submit-timeout.png");
  await page.screenshot("penghuni-billing-proof-pending-review.png");
  state.results.paymentProof = "PASS";
  logStep("Penghuni payment proof submission PASS. Switching to Admin payment verification.");

  await adminPage.navigate(`${adminBase}/payments`);
  await waitOrFail(adminPage, `qa.visibleTextIncludes("Pembayaran")`, TIMEOUTS.page, "admin payments", "admin-payments-page-timeout.png");
  await adminPage.screenshot("admin-payments-before-verification-tab.png");
  try {
    await clickTextByMouse(adminPage, "Verifikasi", "[role=tab]");
  } catch {
    await clickTextByMouse(adminPage, "Verifikasi", "button");
  }
  await waitOrFail(
    adminPage,
    `qa.visibleTextIncludes("Lihat Bukti") || qa.visibleTextIncludes("Tidak ada bukti") || qa.visibleTextIncludes("bukti pembayaran pending")`,
    TIMEOUTS.action,
    "admin payment verification tab",
    "admin-payments-verification-timeout.png",
  );
  await adminPage.screenshot("admin-payments-verification.png");
  const hasProof = await adminPage.eval(`(() => { ${domHelpers()} return qa.visibleTextIncludes("Lihat Bukti"); })()`);
  if (!hasProof) {
    state.limitations.push("Admin verification tab did not show a pending proof after resident submission within timeout.");
    state.results.adminPaymentPreview = "LIMITED";
    return;
  }
  await clickText(adminPage, "Lihat Bukti", "button");
  await waitOrFail(
    adminPage,
    `qa.visibleTextIncludes("Review Bukti Pembayaran Manual") && qa.visibleTextIncludes("Bukti Pembayaran")`,
    TIMEOUTS.action,
    "payment proof review dialog",
    "admin-payment-proof-dialog-timeout.png",
  );
  await adminPage.screenshot("admin-payment-proof-preview.png");
  state.results.adminPaymentPreview = "PASS";
}

async function complaintFlow(page, adminPage, penghuniBase, adminBase) {
  logStep("Penghuni complaints: create ticket without and with attachment.");
  await page.navigate(`${penghuniBase}/complaints`);
  await waitOrFail(page, `qa.visibleTextIncludes("Komplain") && qa.visibleTextIncludes("Riwayat Tiket")`, TIMEOUTS.page, "complaint list", "penghuni-complaints-list-timeout.png");
  await page.screenshot("penghuni-complaints-list.png");
  await page.eval(`(() => { ${domHelpers()} return qa.clickSelector('button[aria-label="Buat tiket baru"]'); })()`);
  await waitOrFail(page, `document.querySelector("select") && qa.visibleTextIncludes("Kategori")`, TIMEOUTS.page, "create complaint form", "penghuni-complaint-form-timeout.png");
  await page.screenshot("penghuni-complaint-create-no-attachment.png");
  await page.eval(`(() => { ${domHelpers()} return qa.selectFirstOption("select"); })()`);
  const titleNoAttachment = `M14C no attachment ${Date.now()}`;
  await fill(page, 'input[type="text"]', titleNoAttachment);
  await fill(page, "textarea", "M14C browser regression complaint without attachment");
  await clickText(page, "Kirim Tiket", "button");
  await waitOrFail(page, `qa.visibleTextIncludes("Tiket berhasil dibuat")`, TIMEOUTS.upload, "complaint no attachment success", "penghuni-complaint-no-attachment-timeout.png");
  await page.screenshot("penghuni-complaint-create-success.png");
  state.testData.complaintNoAttachmentTitle = titleNoAttachment;
  state.results.complaintNoAttachment = "PASS";
  await clickText(page, "Tutup", "button");
  await sleep(1200);
  await waitOrFail(page, `qa.visibleTextIncludes(${JSON.stringify(titleNoAttachment)})`, TIMEOUTS.action, "complaint list refreshed with no attachment ticket", "penghuni-complaint-list-refresh-timeout.png");

  await page.eval(`(() => { ${domHelpers()} return qa.clickSelector('button[aria-label="Buat tiket baru"]'); })()`);
  await waitOrFail(page, `document.querySelector("#file-picker-complaint_attachment")`, TIMEOUTS.page, "complaint attachment form", "penghuni-complaint-attachment-form-timeout.png");
  await page.eval(`(() => { ${domHelpers()} return qa.selectFirstOption("select"); })()`);
  const titleWithAttachment = `M14C with attachment ${Date.now()}`;
  await fill(page, 'input[type="text"]', titleWithAttachment);
  await fill(page, "textarea", "M14C browser regression complaint with attachment");
  await page.eval(`(() => { ${domHelpers()} return qa.uploadFile("#file-picker-complaint_attachment", "m14c-complaint.png", "image/png", "${pngBase64}"); })()`);
  await waitOrFail(page, `qa.visibleTextIncludes("m14c-complaint.png") || document.querySelector('img[src^="blob:"]')`, TIMEOUTS.upload, "complaint upload preview", "penghuni-complaint-upload-timeout.png");
  await page.screenshot("penghuni-complaint-upload-preview.png");
  await clickText(page, "Kirim Tiket", "button");
  await waitOrFail(page, `qa.visibleTextIncludes("Tiket berhasil dibuat")`, TIMEOUTS.upload, "complaint with attachment success", "penghuni-complaint-with-attachment-timeout.png");
  await page.screenshot("penghuni-complaint-create-with-attachment-success.png");
  state.testData.complaintWithAttachmentTitle = titleWithAttachment;
  state.results.complaintWithAttachment = "PASS";
  await clickText(page, "Tutup", "button");
  await sleep(1200);
  await waitOrFail(page, `qa.visibleTextIncludes(${JSON.stringify(titleWithAttachment)})`, TIMEOUTS.action, "complaint list refreshed with attachment ticket", "penghuni-complaint-attachment-list-refresh-timeout.png");

  await adminPage.navigate(`${adminBase}/complaints`);
  await waitOrFail(adminPage, `qa.visibleTextIncludes("Komplain")`, TIMEOUTS.page, "admin complaints", "admin-complaints-page-timeout.png");
  await adminPage.eval(`(() => { ${domHelpers()} qa.setValue('input[placeholder*="Cari"]', ${JSON.stringify(titleWithAttachment)}); return true; })()`);
  await sleep(1500);
  await waitOrFail(adminPage, `qa.visibleTextIncludes(${JSON.stringify(titleWithAttachment)})`, TIMEOUTS.action, "admin complaint created title", "admin-complaint-search-timeout.png");
  await adminPage.eval(`(() => { ${domHelpers()} const btn = Array.from(document.querySelectorAll("button")).find((el) => el.innerText.includes(${JSON.stringify(titleWithAttachment)})); if (!btn) throw new Error("complaint button missing"); btn.click(); return true; })()`);
  await waitOrFail(adminPage, `qa.visibleTextIncludes("Lampiran Komplain")`, TIMEOUTS.action, "admin complaint attachment visible", "admin-complaint-attachment-timeout.png");
  await adminPage.screenshot("admin-complaint-detail-attachments.png");
  await adminPage.eval(`(() => { ${domHelpers()} return qa.clickFirstFilePreview(); })()`);
  await waitOrFail(adminPage, `document.querySelector('[role="dialog"]') || qa.visibleTextIncludes("Preview")`, TIMEOUTS.action, "admin complaint attachment preview", "admin-complaint-preview-timeout.png");
  await adminPage.screenshot("admin-complaint-attachment-preview.png");
  state.results.adminComplaintPreview = "PASS";
}

async function negativeUploadCheck(page, penghuniBase) {
  logStep("Penghuni negative upload UX: unsupported and oversized file.");
  await page.navigate(`${penghuniBase}/complaints`);
  await waitOrFail(page, `qa.visibleTextIncludes("Komplain")`, TIMEOUTS.page, "complaint list for negative upload", "negative-upload-complaints-timeout.png");
  await page.eval(`(() => { ${domHelpers()} return qa.clickSelector('button[aria-label="Buat tiket baru"]'); })()`);
  await waitOrFail(page, `document.querySelector("#file-picker-complaint_attachment")`, TIMEOUTS.page, "complaint upload control", "negative-upload-control-timeout.png");
  await page.eval(`(() => { ${domHelpers()} return qa.uploadFile("#file-picker-complaint_attachment", "m14c-unsupported.txt", "text/plain", "SGVsbG8="); })()`);
  await waitOrFail(page, `qa.visibleTextIncludes("tidak didukung") || qa.visibleTextIncludes("JPEG") || qa.visibleTextIncludes("PNG")`, TIMEOUTS.action, "unsupported file validation", "invalid-file-timeout.png");
  await page.screenshot("invalid-file-error.png");
  await page.eval(`(() => { ${domHelpers()} return qa.uploadLargeFile("#file-picker-complaint_attachment"); })()`);
  await waitOrFail(page, `qa.visibleTextIncludes("terlalu besar") || qa.visibleTextIncludes("maks") || qa.visibleTextIncludes("WhatsApp")`, TIMEOUTS.action, "oversized file validation", "oversized-file-timeout.png");
  await page.screenshot("oversized-file-error.png");
  state.results.negativeUploadUx = "PASS";
}

async function smartLockSafeCheck(page, adminBase) {
  logStep("Admin Smart Lock: verify simulated safe state.");
  await page.navigate(`${adminBase}/smart-lock`);
  await waitOrFail(page, `qa.visibleTextIncludes("Smart Lock berjalan dalam simulasi") || qa.visibleTextIncludes("SIMULATED")`, TIMEOUTS.page, "smart lock simulated state", "admin-smart-lock-timeout.png");
  await page.screenshot("admin-smart-lock-simulated-safe-state.png");
  const text = await page.eval(`(() => document.body.innerText)()`);
  if (/live provider|perintah dikirim/i.test(text) && !/tidak ada provider/i.test(text)) {
    state.issues.push("Smart Lock page text may imply live provider command.");
  }
  state.results.smartLockSafeState = "PASS";
}

async function runApiSanity(apiBase) {
  const health = await fetch(`${apiBase}/health`);
  state.results.health = health.ok ? "PASS" : `FAIL ${health.status}`;
  const unauth = await fetch(`${apiBase}/payment-proofs/00000000-0000-0000-0000-000000000000/files`);
  state.results.unauthAdminFileEndpoint = unauth.status === 401 ? "PASS" : `EXPECTED_401_GOT_${unauth.status}`;
}

function analyzeLeakage() {
  const dangerous = [
    "storage_path",
    "storagePath",
    "local_key",
    "ticket_key",
    "TUYA_CLIENT_SECRET",
    "client_secret",
    "tuya_refresh_token",
    "tuya_access_token",
    "rawProviderPayload",
    "raw_provider",
    "public/storage",
  ];
  const leaks = [];
  for (const body of state.bodiesForLeakScan) {
    const lower = body.text.toLowerCase();
    for (const needle of dangerous) {
      if (lower.includes(needle.toLowerCase())) {
        leaks.push({ url: sanitizeUrl(body.url), status: body.status, needle });
      }
    }
  }
  return leaks;
}

async function writeArtifacts(finalStatus, leakageFindings) {
  const sanitizedConsole = state.console
    .map((item) => ({ type: item.type, text: mask(item.text) }))
    .filter((item) => item.text && !/Download the React DevTools/i.test(item.text));
  const fatalConsole = sanitizedConsole.filter((item) =>
    /error|warning|failed/i.test(`${item.type} ${item.text}`) &&
    !/401|invalid identifier|vite|favicon/i.test(item.text),
  );
  const unexpectedNetwork = state.network.filter((item) => {
    if (item.status === 401 || item.status === 403) return false;
    if (String(item.status).startsWith("4") && /auth\/login/.test(item.url)) return false;
    return Number(item.status) >= 400 || item.status === "loadingFailed";
  });

  const summary = {
    status: finalStatus,
    executedAt: new Date().toISOString(),
    environment: state.env,
    accounts: {
      admin: adminEmail,
      penghuni: residentEmail,
      password: "***",
    },
    commands: state.commands,
    routesTested: Array.from(new Set(state.routes.map(sanitizeUrl))),
    results: state.results,
    testData: state.testData,
    screenshots: state.screenshots,
    console: {
      total: sanitizedConsole.length,
      fatalCandidates: fatalConsole,
    },
    network: {
      errorCandidates: unexpectedNetwork,
    },
    leakageFindings,
    issues: state.issues,
    limitations: state.limitations,
  };

  await fs.writeFile(
    path.join(artifactDir, "browser-console-sanitized.json"),
    `${JSON.stringify(sanitizedConsole, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(artifactDir, "network-summary-sanitized.json"),
    `${JSON.stringify({ allErrors: state.network, unexpectedNetwork }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(artifactDir, "qa-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(artifactDir, "leakage-check.txt"),
    [
      `Leakage findings: ${leakageFindings.length}`,
      leakageFindings.length
        ? JSON.stringify(leakageFindings, null, 2)
        : "No storage_path/storagePath/public storage URL/Tuya secret/local_key/ticket_key/raw provider payload found in captured API JSON bodies.",
      "Note: auth/login normally returns an application access_token and was not treated as Tuya/provider leakage.",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(artifactDir, "limitations.md"),
    [
      "# M14C Limitations",
      "",
      ...(state.limitations.length ? state.limitations.map((item) => `- ${item}`) : ["- None recorded by runner."]),
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(artifactDir, "README.md"),
    [
      "# M14C Browser Regression Artifact Pack",
      "",
      `Status: ${finalStatus}`,
      "",
      "Generated by local Chrome/CDP QA runner in Smart Lock simulated mode.",
      "",
      "Files:",
      "- qa-summary.json",
      "- browser-console-sanitized.json",
      "- network-summary-sanitized.json",
      "- leakage-check.txt",
      "- limitations.md",
      "- screenshots/",
      "",
    ].join("\n"),
  );

  return summary;
}

async function main() {
  await ensureDirs();
  const apiPort = await freePort(3018);
  const adminPort = await freePort(18080);
  const penghuniPort = await freePort(18081);
  const adminChromePort = await freePort(19222);
  const penghuniChromePort = await freePort(19223);
  const apiBase = `http://127.0.0.1:${apiPort}/api/v1`;
  const adminBase = `http://127.0.0.1:${adminPort}`;
  const penghuniBase = `http://127.0.0.1:${penghuniPort}`;
  state.env = {
    apiBase,
    adminBase,
    penghuniBase,
    smartLockProvider: "simulated",
    smartLockLiveEnabled: "false",
  };

  startProcess("api", "node", ["dist/main.js"], {
    cwd: path.join(repoRoot, "backend", "api"),
    env: {
      PORT: String(apiPort),
      HOST: "127.0.0.1",
      SMART_LOCK_PROVIDER: "simulated",
      SMART_LOCK_LIVE_ENABLED: "false",
      SMART_LOCK_SIMULATED_LATENCY_MS: "0",
      CORS_ALLOWED_ORIGINS: `${adminBase},${penghuniBase}`,
      LOG_LEVEL: "warn",
    },
  });
  await waitForHttp(`${apiBase}/health`, 90000);

  const viteEnv = {
    VITE_API_BASE_URL: apiBase,
    VITE_FEATURE_SMARTLOCK_MODE: "simulated",
    VITE_FEATURE_CCTV_ENABLED: "false",
    VITE_FEATURE_BOOKING_ENABLED: "false",
    VITE_FEATURE_CHAT_ENABLED: "false",
    VITE_FEATURE_PUSH_ENABLED: "false",
    VITE_ADMIN_WHATSAPP_PHONE: "6281234567890",
  };
  startProcess("admin-dev", "npm.cmd", [
    "--workspace",
    "@granada-kost/admin",
    "run",
    "dev",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(adminPort),
    "--strictPort",
  ], { env: viteEnv, shell: true });
  startProcess("penghuni-dev", "npm.cmd", [
    "--workspace",
    "@granada-kost/penghuni",
    "run",
    "dev",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(penghuniPort),
    "--strictPort",
  ], { env: viteEnv, shell: true });
  await waitForHttp(adminBase, 90000);
  await waitForHttp(penghuniBase, 90000);

  let adminPage;
  let penghuniPage;
  try {
    await runApiSanity(apiBase);
    state.limitations.push(
      "Automated login, invalid-login, and browser RBAC credential-entry checks were skipped by request for Hybrid Interactive QA; login was completed manually in Chrome.",
    );
    adminPage = await startChromePage("admin", adminChromePort, path.join(tmpDir, "chrome-admin-profile"));
    await manualLogin(adminPage, adminBase, "Admin", "admin-login.png", "admin-dashboard.png", "Dashboard");
    penghuniPage = await startChromePage(
      "penghuni",
      penghuniChromePort,
      path.join(tmpDir, "chrome-penghuni-profile"),
    );
    await manualLogin(
      penghuniPage,
      penghuniBase,
      "Penghuni",
      "penghuni-login.png",
      "penghuni-dashboard.png",
      "Tagihan Aktif",
    );
    await paymentProofFlow(penghuniPage, adminPage, penghuniBase, adminBase);
    await complaintFlow(penghuniPage, adminPage, penghuniBase, adminBase);
    await negativeUploadCheck(penghuniPage, penghuniBase);
    await smartLockSafeCheck(adminPage, adminBase);
  } finally {
    await adminPage?.close();
    await penghuniPage?.close();
  }

  await sleep(1500);
  const leakageFindings = analyzeLeakage();
  if (leakageFindings.length > 0) {
    state.issues.push("Leakage scan found sensitive file/provider fields in captured API JSON.");
  }
  const finalStatus = state.issues.length === 0 ? "PASS" : "FAIL";
  const summary = await writeArtifacts(finalStatus, leakageFindings);
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} catch (error) {
  state.issues.push(error.stack ?? error.message);
  const leakageFindings = analyzeLeakage();
  await writeArtifacts("FAIL", leakageFindings);
  console.error(`[M14C] FAIL FAST: ${error.message}`);
  console.error(`[M14C] Artifacts written to: ${artifactDir}`);
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
} finally {
  await stopServices();
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore temp cleanup failure
  }
}
