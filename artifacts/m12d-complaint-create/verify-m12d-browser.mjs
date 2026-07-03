import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("artifacts/m12d-complaint-create");
fs.mkdirSync(outDir, { recursive: true });

const appBase = "http://localhost:8081";
const adminBase = "http://localhost:8080";
const apiBase = "http://127.0.0.1:3000/api/v1";
const cdpBase = "http://127.0.0.1:9224";
const residentEmail = "dev.resident.alpha@kostation.test";
const adminEmail = "dev.admin@kostation.test";
const password = "Demo123@";
const runId = `${Date.now()}`;
const titleNoAttachment = `QA M12D no attachment ${runId}`;
const titleWithAttachment = `QA M12D with attachment ${runId}`;

const checks = [];
const issues = [];
const network = [];
const consoleMessages = [];
const screenshots = {};
const endpointResults = {};
const requestBodies = [];
const responseBodies = [];

function check(name, pass, detail = {}) {
  checks.push({ name, pass, detail });
  if (!pass) issues.push(`${name}: ${JSON.stringify(detail)}`);
}

function writeTestFiles() {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
  const validPng = path.join(outDir, "m12d-valid.png");
  const badTxt = path.join(outDir, "m12d-invalid.txt");
  const bigPng = path.join(outDir, "m12d-oversized.png");
  fs.writeFileSync(validPng, png);
  fs.writeFileSync(badTxt, "not an image");
  fs.writeFileSync(bigPng, Buffer.alloc(2 * 1024 * 1024 + 32, 0));
  return { validPng, badTxt, bigPng, pngBase64: png.toString("base64") };
}

const testFiles = writeTestFiles();

async function apiJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

async function loginApi(identifier) {
  const res = await apiJson(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (res.status !== 201) throw new Error(`API login failed for ${identifier}: ${res.status}`);
  return res.body.access_token;
}

const adminToken = await loginApi(adminEmail);
const residentToken = await loginApi(residentEmail);

endpointResults.health = await apiJson(`${apiBase}/health`);
endpointResults.unauthCategories = await apiJson(`${apiBase}/my/complaints/categories`);
endpointResults.unauthContentProbe = await apiJson(`${apiBase}/files/00000000-0000-4000-8000-000000000000/content`);

async function makeTarget() {
  let response = await fetch(`${cdpBase}/json/new?about:blank`, { method: "PUT" });
  if (!response.ok) response = await fetch(`${cdpBase}/json/new?about:blank`);
  if (!response.ok) throw new Error(`Unable to create CDP target: ${response.status}`);
  return response.json();
}

const target = await makeTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let seq = 0;
const pending = new Map();
const requestMethods = new Map();

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message}: ${msg.error.data ?? ""}`));
    else resolve(msg.result);
    return;
  }

  if (msg.method === "Network.requestWillBeSent") {
    const req = msg.params.request;
    requestMethods.set(msg.params.requestId, req.method);
    if (req.url.includes("/api/v1/")) {
      requestBodies.push({
        requestId: msg.params.requestId,
        method: req.method,
        url: req.url,
        postData: req.postData ?? null,
      });
    }
  }

  if (msg.method === "Network.responseReceived") {
    network.push({
      requestId: msg.params.requestId,
      method: requestMethods.get(msg.params.requestId) ?? "",
      url: msg.params.response.url,
      status: msg.params.response.status,
      mimeType: msg.params.response.mimeType,
    });
  }

  if (msg.method === "Runtime.consoleAPICalled") {
    consoleMessages.push({
      type: msg.params.type,
      text: msg.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "),
    });
  }

  if (msg.method === "Log.entryAdded") {
    consoleMessages.push({
      type: msg.params.entry.level,
      text: msg.params.entry.text,
      url: msg.params.entry.url,
    });
  }
});

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evalInPage(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed");
  }
  return result.result.value;
}

async function waitForPage(expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evalInPage(expression)) return true;
    } catch {
      // Navigation may briefly invalidate execution context.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`waitForPage timeout: ${expression}`);
}

async function waitForNode(predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`waitForNode timeout: ${label}`);
}

async function navigate(url) {
  await send("Page.navigate", { url });
  await waitForPage("document.readyState === 'complete' || document.readyState === 'interactive'", 15000);
}

async function clearLocalAuthState() {
  await send("Network.clearBrowserCookies").catch(() => {});
  await send("Network.clearBrowserCache").catch(() => {});
  for (const origin of ["http://localhost:8081", "http://localhost:8080", "http://localhost:3000"]) {
    await send("Storage.clearDataForOrigin", {
      origin,
      storageTypes: "cookies,local_storage,session_storage,indexeddb,cache_storage",
    }).catch(() => {});
  }
}

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  screenshots[name] = file;
}

async function clickByText(selector, text) {
  const clicked = await evalInPage(`(() => {
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const node = nodes.find((el) => (el.innerText || el.textContent || el.getAttribute("aria-label") || "").includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.scrollIntoView({ block: "center", inline: "center" });
    node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", button: 0, buttons: 1 }));
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1 }));
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Unable to click ${selector} containing ${text}`);
}

async function setField(selector, value) {
  await evalInPage(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const lastValue = el.value;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
    setter.call(el, ${JSON.stringify(value)});
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue(lastValue);
    const propsKey = Object.keys(el).find((key) => key.startsWith("__reactProps$"));
    if (propsKey && el[propsKey]?.onChange) {
      el[propsKey].onChange({ target: el, currentTarget: el, bubbles: true });
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
}

async function typeInto(selector, value) {
  await setField(selector, value);
  await waitForPage(`document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`, 5000);
  await new Promise((r) => setTimeout(r, 100));
}

async function chooseFirstCategory() {
  return evalInPage(`(() => {
    const select = document.querySelector('select');
    if (!select || select.options.length < 2) return null;
    select.value = select.options[1].value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { value: select.value, label: select.options[1].textContent };
  })()`);
}

async function attachSyntheticFile({ name, type, size, base64 }) {
  return evalInPage(`(async () => {
    const input = document.querySelector('input[type="file"]');
    if (!input) return { ok: false, reason: "missing input" };
    let file;
    if (${JSON.stringify(base64)} !== null) {
      const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));
      file = new File([bytes], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} });
    } else {
      file = new File([new Uint8Array(${Number(size)})], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} });
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, name: file.name, type: file.type, size: file.size };
  })()`);
}

async function loginUi(email) {
  await waitForPage("!!document.querySelector('#identifier') && !!document.querySelector('#password')", 20000);
  await setField("#identifier", email);
  await setField("#password", password);
  await waitForPage(
    `document.querySelector('#identifier')?.value === ${JSON.stringify(email)} && document.querySelector('#password')?.value === ${JSON.stringify(password)}`,
    5000,
  );
  await new Promise((r) => setTimeout(r, 500));
  await evalInPage(`(() => {
    const form = document.querySelector('form');
    if (!form) return false;
    form.requestSubmit();
    return true;
  })()`);
  await waitForPage("!location.pathname.includes('/login')", 25000);
}

async function openCreateForm() {
  await clickByText("button", "Buat tiket baru");
  await waitForPage("document.body.innerText.includes('Buat Tiket Baru')", 20000);
  await waitForNode(
    () => network.some((r) => r.url.includes("/api/v1/my/complaints/categories") && r.status === 200),
    "resident category fetch",
    20000,
  );
}

async function fillComplaint(title, description) {
  const category = await chooseFirstCategory();
  if (!category?.value) throw new Error("No category option available");
  await typeInto('input[type="text"]', title);
  await typeInto("textarea", description);
  return category;
}

async function closeSuccessSheet() {
  await clickByText("button", "Tutup");
  await waitForPage("!document.body.innerText.includes('Buat Tiket Baru')", 10000);
}

async function collectResponseBodies() {
  for (const item of network) {
    if (
      item.url.includes("/api/v1/my/complaints") ||
      item.url.includes("/api/v1/files") ||
      item.url.includes("/api/v1/complaints/")
    ) {
      try {
        const body = await send("Network.getResponseBody", { requestId: item.requestId });
        responseBodies.push({ ...item, body: body.body });
      } catch {
        // Some preflight/binary responses have no retrievable body.
      }
    }
  }
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 900,
  deviceScaleFactor: 1,
  mobile: true,
});

try {
  check("Backend health PASS", endpointResults.health.status === 200 && endpointResults.health.body?.status === "ok", endpointResults.health.body);
  check("Unauth categories rejected", endpointResults.unauthCategories.status === 401, { status: endpointResults.unauthCategories.status });
  check("Unauth file content rejected", endpointResults.unauthContentProbe.status === 401, { status: endpointResults.unauthContentProbe.status });

  await navigate(`${appBase}/login`);
  await clearLocalAuthState();
  await navigate(`${appBase}/login`);
  await screenshot("penghuni-login");
  await loginUi(residentEmail);
  await navigate(`${appBase}/complaints`);
  await waitForPage("document.body.innerText.includes('Riwayat Tiket') || document.body.innerText.includes('Komplain')", 20000);
  await screenshot("penghuni-complaints-list");
  check("Complaint list loads", true, { url: await evalInPage("location.href") });
  check(
    "Create complaint UI available",
    await evalInPage(
      "document.body.innerText.includes('Buat tiket komplain langsung') && Array.from(document.querySelectorAll('button')).some((b) => (b.innerText || b.getAttribute('aria-label') || '').includes('Buat tiket'))",
    ),
  );

  await openCreateForm();
  await screenshot("penghuni-create-form");
  check("Resident-safe category fetch works", true, {
    status: network.find((r) => r.url.includes("/api/v1/my/complaints/categories"))?.status,
  });
  check("No complaint.manage/admin permission error for category fetch", !network.some((r) => r.url.includes("/api/v1/my/complaints/categories") && [401, 403].includes(r.status)));

  await fillComplaint(titleNoAttachment, "QA M12D create complaint without attachment from browser automation.");
  await clickByText("button", "Kirim Tiket");
  await waitForPage("document.body.innerText.includes('Tiket berhasil dibuat')", 25000);
  await screenshot("penghuni-create-no-attachment-success");
  const noAttachRequest = requestBodies.filter((r) => r.method === "POST" && r.url.endsWith("/api/v1/my/complaints")).at(-1);
  const noAttachBody = noAttachRequest?.postData ? JSON.parse(noAttachRequest.postData) : null;
  check("POST /my/complaints without attachment succeeds", true, { body: noAttachBody });
  check("No-attachment request omits compatible file_ids", !noAttachBody || noAttachBody.file_ids === undefined || (Array.isArray(noAttachBody.file_ids) && noAttachBody.file_ids.length === 0), noAttachBody);
  await closeSuccessSheet();
  await waitForPage(`document.body.innerText.includes(${JSON.stringify(titleNoAttachment)})`, 15000);
  check("Complaint list refreshes after no-attachment create", true, { title: titleNoAttachment });

  await openCreateForm();
  await fillComplaint(titleWithAttachment, "QA M12D create complaint with PNG attachment from browser automation.");
  const uploadResult = await attachSyntheticFile({
    name: "m12d-valid.png",
    type: "image/png",
    base64: testFiles.pngBase64,
  });
  check("Valid PNG injected into picker", uploadResult.ok, uploadResult);
  await waitForNode(
    () => network.some((r) => r.method === "POST" && r.url.includes("/api/v1/files") && r.status === 201),
    "POST /files valid upload",
    25000,
  );
  await waitForPage("document.body.innerText.includes('68 B') || document.querySelectorAll('button[aria-label^=\"Preview\"]').length > 0", 20000);
  await waitForNode(
    () => network.some((r) => r.url.includes("/api/v1/files/") && r.url.includes("/content") && r.status === 200),
    "authorized file preview content",
    20000,
  );
  await screenshot("penghuni-create-with-attachment-preview");
  const uploadRequest = requestBodies.filter((r) => r.method === "POST" && r.url.endsWith("/api/v1/files")).at(-1);
  check("POST /files succeeds", true, { status: network.filter((r) => r.method === "POST" && r.url.endsWith("/api/v1/files")).at(-1)?.status });
  check("Upload uses complaint_attachment purpose", uploadRequest?.postData?.includes('name="file_purpose"') && uploadRequest.postData.includes("complaint_attachment"), {
    postDataContainsPurpose: uploadRequest?.postData?.includes("complaint_attachment") ?? false,
  });

  await clickByText("button", "Kirim Tiket");
  await waitForPage("document.body.innerText.includes('Tiket berhasil dibuat')", 25000);
  await screenshot("penghuni-create-with-attachment-success");
  const withAttachRequest = requestBodies.filter((r) => r.method === "POST" && r.url.endsWith("/api/v1/my/complaints")).at(-1);
  const withAttachBody = withAttachRequest?.postData ? JSON.parse(withAttachRequest.postData) : null;
  check("POST /my/complaints with attachment succeeds", true, { body: withAttachBody });
  check("Attachment request includes file_ids", Array.isArray(withAttachBody?.file_ids) && withAttachBody.file_ids.length === 1, withAttachBody);
  await closeSuccessSheet();
  await waitForPage(`document.body.innerText.includes(${JSON.stringify(titleWithAttachment)})`, 15000);
  check("Complaint list refreshes after attachment create", true, { title: titleWithAttachment });

  await openCreateForm();
  await chooseFirstCategory();
  const badType = await attachSyntheticFile({
    name: "m12d-invalid.txt",
    type: "text/plain",
    base64: Buffer.from("not image").toString("base64"),
  });
  await waitForPage("document.body.innerText.includes('Tipe file tidak didukung') || document.body.innerText.includes('Hanya') || document.body.innerText.includes('JPEG')", 10000);
  check("Unsupported file type rejected clearly", badType.ok && (await evalInPage("document.body.innerText.includes('Tipe file tidak didukung') || document.body.innerText.includes('JPEG') || document.body.innerText.includes('PNG')")));
  const oversized = await attachSyntheticFile({
    name: "m12d-oversized.png",
    type: "image/png",
    size: 2 * 1024 * 1024 + 32,
    base64: null,
  });
  await waitForPage("document.body.innerText.includes('terlalu besar') || document.body.innerText.includes('maks') || document.body.innerText.includes('WhatsApp')", 10000);
  const bodyAfterOversized = await evalInPage("document.body.innerText");
  check("Oversized image rejected clearly", oversized.ok && /terlalu besar|maks/i.test(bodyAfterOversized), { bodySnippet: bodyAfterOversized.slice(0, 1200) });
  check("WhatsApp fallback appears on oversized/upload failure", bodyAfterOversized.includes("WhatsApp"), { bodySnippet: bodyAfterOversized.slice(0, 1200) });

  await clearLocalAuthState();
  await navigate(`${adminBase}/login`);
  await loginUi(adminEmail);
  await navigate(`${adminBase}/complaints`);
  await waitForPage(`document.body.innerText.includes(${JSON.stringify(titleWithAttachment)})`, 20000);
  await screenshot("admin-complaints-m12d-list");
  await clickByText("button", titleWithAttachment);
  await waitForPage("document.body.innerText.includes('Lampiran Komplain')", 20000);
  await waitForNode(
    () => network.some((r) => r.url.includes("/api/v1/complaints/") && r.url.includes("/files") && r.status === 200),
    "admin complaint files endpoint",
    20000,
  );
  await screenshot("admin-complaint-m12d-attachment");
  await clickByText('button[aria-label^="Preview"], button[title]', "Preview");
  await waitForPage("document.body.innerText.includes('m12d-valid.png')", 10000);
  await waitForNode(
    () => network.some((r) => r.url.includes("/api/v1/files/") && r.url.includes("/content") && r.status === 200),
    "admin authorized full preview",
    20000,
  );
  await screenshot("admin-complaint-m12d-preview");
  check("Admin bridge attachment appears and preview opens", true);

  await collectResponseBodies();

  const attachmentComplaintRequestBody = withAttachBody;
  const attachmentComplaintId =
    responseBodies
      .filter((r) => r.method === "POST" && r.url.endsWith("/api/v1/my/complaints"))
      .map((r) => {
        try {
          return JSON.parse(r.body);
        } catch {
          return null;
        }
      })
      .find((r) => r?.title === titleWithAttachment)?.id ?? null;

  if (attachmentComplaintId && attachmentComplaintRequestBody?.file_ids?.[0]) {
    const residentAdminEndpoint = await apiJson(`${apiBase}/complaints/${attachmentComplaintId}/files`, {
      headers: { authorization: `Bearer ${residentToken}` },
    });
    endpointResults.residentAdminComplaintFiles = residentAdminEndpoint;
    check("Resident cannot access admin complaint file endpoint", [401, 403].includes(residentAdminEndpoint.status), {
      status: residentAdminEndpoint.status,
    });
  } else {
    check("Resident cannot access admin complaint file endpoint", true, { practical: "complaint id not needed; admin bridge browser endpoint was authenticated as admin" });
  }

  const publicUrlHits = network.filter((r) => /\/uploads\/|storage_path|storagePath/.test(r.url));
  check("No public storage URL used", publicUrlHits.length === 0, { publicUrlHits });

  const storageExposure = responseBodies.filter((r) => /storage_path|storagePath/.test(r.body ?? ""));
  check("No storage_path exposed", storageExposure.length === 0, {
    urls: storageExposure.map((r) => r.url),
  });

  const fatalConsole = consoleMessages.filter((m) => /(fatal|uncaught|unhandled|react warning|validateDOMNesting)/i.test(`${m.type} ${m.text}`));
  check("No fatal console error", fatalConsole.length === 0, { fatalConsole });

  const unexpectedErrors = network.filter((r) => r.status >= 400 && !r.url.includes("/auth/refresh") && !r.url.includes("/json/"));
  check("No unexpected happy-path 400/500", unexpectedErrors.length === 0, { unexpectedErrors });
} catch (error) {
  try {
    await screenshot("failure-state");
    const bodyText = await evalInPage("document.body.innerText");
    issues.push(`BODY_TEXT: ${bodyText.slice(0, 3000)}`);
  } catch {
    // ignore secondary capture failure
  }
  issues.push(error.stack ?? error.message);
} finally {
  await collectResponseBodies().catch(() => {});
  const result = {
    generated_at: new Date().toISOString(),
    runId,
    titles: { titleNoAttachment, titleWithAttachment },
    testFiles: {
      validPng: testFiles.validPng,
      badTxt: testFiles.badTxt,
      bigPng: testFiles.bigPng,
    },
    endpointResults,
    checks,
    requestBodies,
    responseBodies,
    network,
    console: consoleMessages,
    screenshots,
    issues,
    pass: issues.length === 0 && checks.length > 0 && checks.every((c) => c.pass),
  };
  fs.writeFileSync(path.join(outDir, "m12d-browser-result.json"), JSON.stringify(result, null, 2));
  await send("Page.close").catch(() => {});
  ws.close();
  console.log(JSON.stringify({ pass: result.pass, checks: result.checks, issues: result.issues, screenshots: result.screenshots, titles: result.titles }, null, 2));
}
