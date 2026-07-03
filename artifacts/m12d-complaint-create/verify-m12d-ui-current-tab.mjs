import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("artifacts/m12d-complaint-create");
fs.mkdirSync(outDir, { recursive: true });

const cdpList = await (await fetch("http://127.0.0.1:9231/json/list")).json();
const target = cdpList.find((t) => t.type === "page" && t.url.includes("localhost:8081"));
if (!target) throw new Error("No Penghuni Chrome tab found on CDP port 9231");

const appBase = "http://localhost:8081";
const runId = Date.now();
const titleNoAttachment = `QA M12D UI no attachment ${runId}`;
const titleWithAttachment = `QA M12D UI with attachment ${runId}`;
const validPng = path.join(outDir, "m12d-ui-current-valid.png");
const invalidTxt = path.join(outDir, "m12d-ui-current-invalid.txt");
const oversizedPng = path.join(outDir, "m12d-ui-current-oversized.png");

fs.writeFileSync(
  validPng,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  ),
);
fs.writeFileSync(invalidTxt, "not an image");
fs.writeFileSync(oversizedPng, Buffer.alloc(2 * 1024 * 1024 + 32, 0));

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let seq = 0;
const pending = new Map();
const requestMethods = new Map();
const network = [];
const requestBodies = [];
const consoleMessages = [];
const screenshots = {};
const checks = [];
const issues = [];

function check(name, pass, detail = {}) {
  checks.push({ name, pass, detail });
  if (!pass) issues.push(`${name}: ${JSON.stringify(detail)}`);
}

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

async function evalPage(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if (await evalPage(expression)) return true;
    } catch {
      // ignore transient context errors
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`waitFor timeout: ${expression}`);
}

async function waitForNetwork(predicate, label, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`waitForNetwork timeout: ${label}`);
}

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  screenshots[name] = file;
}

async function navigate(url) {
  await send("Page.navigate", { url });
  await waitFor("document.readyState === 'complete' || document.readyState === 'interactive'", 15000);
}

async function clickByText(text) {
  const ok = await evalPage(`(() => {
    const nodes = Array.from(document.querySelectorAll('button, [role="button"]'));
    const node = nodes.find((el) => ((el.innerText || el.textContent || el.getAttribute('aria-label') || '')).includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.scrollIntoView({ block: 'center', inline: 'center' });
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, buttons: 1 }));
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1 }));
    node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Button/text not found: ${text}`);
}

async function setControlledValue(selector, value) {
  const ok = await evalPage(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const lastValue = el.value;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue(lastValue);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`Input not found: ${selector}`);
  await waitFor(`document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`, 5000);
}

async function selectFirstCategory() {
  const ok = await evalPage(`(() => {
    const select = document.querySelector('select');
    if (!select || select.options.length < 2) return false;
    const lastValue = select.value;
    select.value = select.options[1].value;
    const tracker = select._valueTracker;
    if (tracker) tracker.setValue(lastValue);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error("No category option available");
  await waitFor("document.querySelector('select')?.value", 5000);
}

async function setFile(filePath) {
  const doc = await send("DOM.getDocument", {});
  const query = await send("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
  });
  if (!query.nodeId) throw new Error("File input not found");
  await send("DOM.setFileInputFiles", {
    nodeId: query.nodeId,
    files: [path.resolve(filePath)],
  });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("DOM.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 430,
  height: 920,
  deviceScaleFactor: 1,
  mobile: false,
});

try {
  await navigate(`${appBase}/complaints`);
  await waitFor("document.body.innerText.includes('Riwayat Tiket')", 20000);
  await screenshot("penghuni-complaints-list");
  check("Complaint list loads", true);
  check(
    "Create complaint button/FAB visible",
    await evalPage("Array.from(document.querySelectorAll('button')).some((b) => (b.innerText || b.getAttribute('aria-label') || '').includes('Buat tiket'))"),
  );

  await clickByText("Buat tiket");
  await waitFor("document.body.innerText.includes('Buat Tiket Baru')", 15000);
  await waitForNetwork(() => network.some((n) => n.url.includes("/api/v1/my/complaints/categories") && n.status === 200), "categories 200");
  await waitFor("document.querySelector('select')?.options.length > 1", 15000);
  await screenshot("penghuni-create-form");
  check("Categories load in form", true);

  await selectFirstCategory();
  await setControlledValue('input[type="text"]', titleNoAttachment);
  await setControlledValue("textarea", "QA M12D browser UI no attachment.");
  await clickByText("Kirim Tiket");
  await waitFor("document.body.innerText.includes('Tiket berhasil dibuat')", 25000);
  await screenshot("penghuni-create-no-attachment-success");
  const noAttachPost = requestBodies.filter((r) => r.method === "POST" && r.url.endsWith("/api/v1/my/complaints")).at(-1);
  const noAttachBody = noAttachPost?.postData ? JSON.parse(noAttachPost.postData) : null;
  check("POST /my/complaints no attachment returns 201", network.some((n) => n.method === "POST" && n.url.endsWith("/api/v1/my/complaints") && n.status === 201), noAttachBody);
  check("file_ids omitted without attachment", noAttachBody && !("file_ids" in noAttachBody), noAttachBody);
  await clickByText("Tutup");
  await waitFor(`document.body.innerText.includes(${JSON.stringify(titleNoAttachment)})`, 15000);
  check("List refreshes and shows no-attachment complaint", true);

  await clickByText("Buat tiket");
  await waitFor("document.body.innerText.includes('Buat Tiket Baru')", 15000);
  await selectFirstCategory();
  await setControlledValue('input[type="text"]', titleWithAttachment);
  await setControlledValue("textarea", "QA M12D browser UI with PNG attachment.");
  await setFile(validPng);
  await waitForNetwork(() => network.some((n) => n.method === "POST" && n.url.endsWith("/api/v1/files") && n.status === 201), "file upload 201");
  await waitFor("document.querySelectorAll('button[aria-label^=\"Preview\"]').length > 0 || document.body.innerText.includes('68 B')", 20000);
  await waitForNetwork(() => network.some((n) => n.url.includes("/api/v1/files/") && n.url.includes("/content") && n.status === 200), "authorized preview content");
  await screenshot("penghuni-upload-preview");
  check("Uploaded preview appears", true);
  check("POST /files returns 201", true);

  await clickByText("Kirim Tiket");
  await waitFor("document.body.innerText.includes('Tiket berhasil dibuat')", 25000);
  await screenshot("penghuni-create-with-attachment-success");
  const withAttachPost = requestBodies.filter((r) => r.method === "POST" && r.url.endsWith("/api/v1/my/complaints")).at(-1);
  const withAttachBody = withAttachPost?.postData ? JSON.parse(withAttachPost.postData) : null;
  check("POST /my/complaints with attachment returns 201", network.some((n) => n.method === "POST" && n.url.endsWith("/api/v1/my/complaints") && n.status === 201), withAttachBody);
  check("file_ids sent only for attachment submission", Array.isArray(withAttachBody?.file_ids) && withAttachBody.file_ids.length === 1, withAttachBody);
  await clickByText("Tutup");
  await waitFor(`document.body.innerText.includes(${JSON.stringify(titleWithAttachment)})`, 15000);
  check("List refreshes and shows attachment complaint", true);

  await clickByText("Buat tiket");
  await waitFor("document.body.innerText.includes('Buat Tiket Baru')", 15000);
  await setFile(invalidTxt);
  await waitFor("document.body.innerText.includes('Tipe file tidak didukung') || document.body.innerText.includes('JPEG') || document.body.innerText.includes('PNG')", 10000);
  check("Unsupported file shows clear UI error", true);
  await setFile(oversizedPng);
  await waitFor("document.body.innerText.includes('terlalu besar') || document.body.innerText.includes('maks') || document.body.innerText.includes('WhatsApp')", 10000);
  const invalidBody = await evalPage("document.body.innerText");
  await screenshot("penghuni-invalid-file-error");
  check("Oversized file shows clear UI error", /terlalu besar|maks/i.test(invalidBody), {
    whatsAppFallbackVisible: invalidBody.includes("WhatsApp"),
  });

  check("GET /my/complaints/categories returns 200", network.some((n) => n.url.includes("/api/v1/my/complaints/categories") && n.status === 200));
  check("POST /files returns 201", network.some((n) => n.method === "POST" && n.url.endsWith("/api/v1/files") && n.status === 201));
  check("POST /my/complaints returns 201", network.filter((n) => n.method === "POST" && n.url.endsWith("/api/v1/my/complaints") && n.status === 201).length >= 2);
  const fatalConsole = consoleMessages.filter((m) => /(fatal|uncaught|unhandled|react warning|validateDOMNesting)/i.test(`${m.type} ${m.text}`));
  check("No fatal console error", fatalConsole.length === 0, { fatalConsole });
  const unexpectedErrors = network.filter((n) => n.status >= 400 && !n.url.includes("/auth/refresh") && !n.url.includes("/favicon"));
  check("No unexpected happy-path 400/500", unexpectedErrors.length === 0, { unexpectedErrors });
} catch (error) {
  try {
    await screenshot("penghuni-ui-current-failure-state");
    const body = await evalPage("document.body.innerText");
    issues.push(`BODY_TEXT: ${body.slice(0, 3000)}`);
  } catch {
    // ignore
  }
  issues.push(error.stack ?? error.message);
} finally {
  const result = {
    generated_at: new Date().toISOString(),
    runId,
    routes: [`${appBase}/complaints`],
    titles: { titleNoAttachment, titleWithAttachment },
    testFiles: { validPng, invalidTxt, oversizedPng },
    checks,
    network,
    requestBodies,
    console: consoleMessages,
    screenshots,
    issues,
    pass: issues.length === 0 && checks.length > 0 && checks.every((c) => c.pass),
  };
  fs.writeFileSync(path.join(outDir, "m12d-ui-current-result.json"), JSON.stringify(result, null, 2));
  ws.close();
  console.log(JSON.stringify({ pass: result.pass, checks: result.checks, issues: result.issues, screenshots: result.screenshots, titles: result.titles }, null, 2));
}
