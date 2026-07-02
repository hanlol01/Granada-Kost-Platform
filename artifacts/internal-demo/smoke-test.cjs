const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const OUT_DIR = path.resolve(__dirname);
const ADMIN_URL = "http://localhost:8080";
const PENGHUNI_URL = "http://localhost:8081";
const API_URL = "http://localhost:3000/api/v1";
const ADMIN_LOGIN = "dev.admin@kostation.test";
const PENGHUNI_LOGIN = "dev.resident.alpha@kostation.test";
const PASSWORD = "Demo123@";

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}: ${msg.error.data ?? ""}`));
        else resolve(msg.result);
        return;
      }
      if (msg.method && this.listeners.has(msg.method)) {
        for (const fn of this.listeners.get(msg.method)) fn(msg.params ?? {});
      }
    });
  }

  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
  }

  on(method, fn) {
    const list = this.listeners.get(method) ?? [];
    list.push(fn);
    this.listeners.set(method, list);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000).unref();
    });
    this.ws.send(payload);
    return promise;
  }
}

async function newTab(url = "about:blank") {
  const res = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!res.ok) throw new Error(`Failed to create Chrome tab: ${res.status}`);
  const target = await res.json();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  return cdp;
}

async function setupPage(cdp, appName) {
  const events = {
    consoleErrors: [],
    exceptions: [],
    networkErrors: [],
    failedRequests: [],
    observations: [],
  };
  cdp.on("Runtime.consoleAPICalled", (p) => {
    const text = (p.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" ");
    if (p.type === "error") events.consoleErrors.push({ appName, text });
  });
  cdp.on("Runtime.exceptionThrown", (p) => {
    events.exceptions.push({ appName, text: p.exceptionDetails?.text ?? "Runtime exception" });
  });
  cdp.on("Log.entryAdded", (p) => {
    if (p.entry?.level === "error") {
      events.consoleErrors.push({ appName, text: p.entry.text, url: p.entry.url });
    }
  });
  cdp.on("Network.responseReceived", (p) => {
    const status = p.response?.status ?? 0;
    const url = p.response?.url ?? "";
    if (status >= 400) events.networkErrors.push({ appName, status, url });
  });
  cdp.on("Network.loadingFailed", (p) => {
    events.failedRequests.push({ appName, url: p.requestId, errorText: p.errorText });
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: appName === "penghuni" ? 430 : 1440,
    height: appName === "penghuni" ? 932 : 1000,
    deviceScaleFactor: 1,
    mobile: appName === "penghuni",
  });
  return events;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Evaluation failed");
  }
  return result.result?.value;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function goto(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await wait(2500);
}

async function waitUntil(cdp, expression, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(cdp, expression).catch((err) => String(err.message));
    if (last) return last;
    await wait(500);
  }
  throw new Error(`Timed out waiting for: ${expression}; last=${last}`);
}

async function screenshot(cdp, filename) {
  const res = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const target = path.join(OUT_DIR, filename);
  fs.writeFileSync(target, Buffer.from(res.data, "base64"));
  return target;
}

async function typeInto(cdp, selector, text) {
  await evaluate(
    cdp,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.focus();
      el.select?.();
      return true;
    })()`,
  );
  await cdp.send("Input.insertText", { text });
  await wait(250);
}

async function clickByExpression(cdp, expression) {
  const box = await evaluate(
    cdp,
    `(() => {
      const el = (${expression});
      if (!el) return null;
      el.scrollIntoView({ block: "center", inline: "center" });
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
  );
  if (!box) throw new Error(`Element not found for click: ${expression}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  await wait(500);
}

async function pageState(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const text = document.body ? document.body.innerText : "";
      const title = document.querySelector("h1")?.innerText || document.title || "";
      const fatalPatterns = [
        "This page didn't load",
        "Something went wrong",
        "Gagal memuat",
        "Page not found",
        "Forbidden",
        "Akses ditolak"
      ];
      const loadingPatterns = ["Memuat sesi", "Memuat...", "Loading"];
      return {
        url: location.href,
        title,
        text: text.slice(0, 4000),
        fatal: fatalPatterns.filter((p) => text.includes(p)),
        loading: loadingPatterns.filter((p) => text.includes(p)),
      };
    })()`,
  );
}

async function login(cdp, baseUrl, username, password, screenshotName) {
  await cdp.send("Network.clearBrowserCookies");
  await goto(cdp, `${baseUrl}/login`);
  await waitUntil(cdp, `!!document.querySelector("#identifier") && !!document.querySelector("#password")`);
  await screenshot(cdp, screenshotName);
  await typeInto(cdp, "#identifier", username);
  await typeInto(cdp, "#password", password);
  await evaluate(cdp, `(() => { document.querySelector("form").requestSubmit(); return true; })()`);
  await waitUntil(cdp, `!location.pathname.startsWith("/login") && document.body.innerText.length > 20`, 15000);
}

async function assertPage(cdp, item) {
  await goto(cdp, item.url);
  await wait(2500);
  const state = await pageState(cdp);
  const expectedOk = item.expected.some((needle) => state.text.includes(needle) || state.title.includes(needle));
  const persistentLoading = state.loading.length > 0 && state.text.length < 1500;
  const ok = expectedOk && state.fatal.length === 0 && !persistentLoading;
  const shot = await screenshot(cdp, item.screenshot);
  return {
    name: item.name,
    url: state.url,
    expected: item.expected,
    pass: ok,
    fatal: state.fatal,
    loading: state.loading,
    title: state.title,
    screenshot: path.relative(path.resolve("."), shot).replaceAll("\\", "/"),
    excerpt: state.text.slice(0, 500),
  };
}

async function runAdmin() {
  const cdp = await newTab("about:blank");
  const events = await setupPage(cdp, "admin");
  const results = [];
  await login(cdp, ADMIN_URL, ADMIN_LOGIN, PASSWORD, "admin-login.png");
  const pages = [
    { name: "Dashboard", url: `${ADMIN_URL}/`, expected: ["Dashboard", "Ringkasan"], screenshot: "admin-dashboard.png" },
    { name: "Rooms", url: `${ADMIN_URL}/rooms`, expected: ["Kamar", "Kelola"], screenshot: "admin-rooms.png" },
    { name: "Tenants", url: `${ADMIN_URL}/tenants`, expected: ["Data Penghuni", "penghuni"], screenshot: "admin-tenants.png" },
    { name: "Payments", url: `${ADMIN_URL}/payments`, expected: ["Pembayaran", "Tagihan"], screenshot: "admin-payments.png" },
    { name: "Complaints", url: `${ADMIN_URL}/complaints`, expected: ["Komplain", "Keluhan"], screenshot: "admin-complaints.png" },
    { name: "Vehicles", url: `${ADMIN_URL}/vehicles`, expected: ["Kendaraan", "Vehicles"], screenshot: "admin-vehicles.png" },
    { name: "Parking", url: `${ADMIN_URL}/parking`, expected: ["Parkir", "Parking"], screenshot: "admin-parking.png" },
    { name: "Reports", url: `${ADMIN_URL}/reports`, expected: ["Laporan", "Reports"], screenshot: "admin-reports.png" },
  ];
  for (const item of pages) results.push(await assertPage(cdp, item));
  const logoutResult = await (async () => {
    try {
      await clickByExpression(cdp, `[...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Akun pengguna")`);
      await clickByExpression(cdp, `[...document.querySelectorAll('[role="menuitem"]')].find((el) => (el.innerText || "").includes("Keluar"))`);
      await waitUntil(cdp, `location.pathname.startsWith("/login")`, 10000);
      return await pageState(cdp);
    } catch (err) {
      return { error: err.message, ...(await pageState(cdp).catch(() => ({}))) };
    }
  })();
  return { app: "admin", results, logoutResult, events };
}

async function runPenghuni() {
  const cdp = await newTab("about:blank");
  const events = await setupPage(cdp, "penghuni");
  const results = [];
  await login(cdp, PENGHUNI_URL, PENGHUNI_LOGIN, PASSWORD, "penghuni-login.png");
  const pages = [
    { name: "Home", url: `${PENGHUNI_URL}/`, expected: ["Halo", "Tagihan", "Kamar"], screenshot: "penghuni-home.png" },
    { name: "Billing", url: `${PENGHUNI_URL}/billing`, expected: ["Tagihan", "Pembayaran"], screenshot: "penghuni-billing.png" },
    { name: "Complaints", url: `${PENGHUNI_URL}/complaints`, expected: ["Komplain", "Keluhan"], screenshot: "penghuni-complaints.png" },
    { name: "Notifications", url: `${PENGHUNI_URL}/notifications`, expected: ["Notifikasi", "Notif"], screenshot: "penghuni-notifications.png" },
    { name: "Info", url: `${PENGHUNI_URL}/info`, expected: ["Informasi", "FAQ"], screenshot: "penghuni-info.png" },
    { name: "Profile", url: `${PENGHUNI_URL}/profile`, expected: ["Profil", "Sesi Aktif"], screenshot: "penghuni-profile.png" },
  ];
  for (const item of pages) results.push(await assertPage(cdp, item));
  const logoutResult = await (async () => {
    try {
      await clickByExpression(cdp, `[...document.querySelectorAll("button")].find((el) => (el.innerText || "").includes("Logout"))`);
      await waitUntil(cdp, `location.pathname.startsWith("/login")`, 10000);
      return await pageState(cdp);
    } catch (err) {
      return { error: err.message, ...(await pageState(cdp).catch(() => ({}))) };
    }
  })();
  return { app: "penghuni", results, logoutResult, events };
}

(async () => {
  const startedAt = new Date().toISOString();
  const admin = await runAdmin();
  const penghuni = await runPenghuni();
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    environment: { adminUrl: ADMIN_URL, penghuniUrl: PENGHUNI_URL, apiUrl: API_URL },
    accounts: { admin: ADMIN_LOGIN, penghuni: PENGHUNI_LOGIN, passwordMasked: "********" },
    admin,
    penghuni,
  };
  fs.writeFileSync(path.join(OUT_DIR, "smoke-result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
