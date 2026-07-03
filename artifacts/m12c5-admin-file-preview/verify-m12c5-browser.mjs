import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("artifacts/m12c5-admin-file-preview");
const setup = JSON.parse(fs.readFileSync(path.join(outDir, "m12c5-api-setup-result.json"), "utf8")).setup;

const appBase = "http://localhost:8080";
const cdpBase = "http://127.0.0.1:9224";
const adminEmail = "dev.admin@kostation.test";
const adminPassword = "Demo123@";

const checks = [];
const issues = [];
const network = [];
const consoleMessages = [];
const screenshots = {};

function check(name, pass, detail = {}) {
  checks.push({ name, pass, detail });
  if (!pass) issues.push(`${name}: ${JSON.stringify(detail)}`);
}

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

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message}: ${msg.error.data ?? ""}`));
    else resolve(msg.result);
    return;
  }

  if (msg.method === "Network.responseReceived") {
    network.push({
      method: msg.params.response.requestHeaders?.[":method"] ?? "",
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
      // The page can be between navigations.
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

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  screenshots[name] = file;
}

async function clickByText(selector, text) {
  const clicked = await evalInPage(`(() => {
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const node = nodes.find((el) => (el.innerText || el.textContent || "").includes(${JSON.stringify(text)}));
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

async function clickPreviewByFilename(filename) {
  const clicked = await evalInPage(`(() => {
    const nodes = Array.from(document.querySelectorAll('button[aria-label^="Preview"], button[title]'));
    const node = nodes.find((el) => (el.getAttribute("aria-label") || el.getAttribute("title") || "").includes(${JSON.stringify(filename)}));
    if (!node) return false;
    node.scrollIntoView({ block: "center", inline: "center" });
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Unable to click preview ${filename}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1365,
  height: 950,
  deviceScaleFactor: 1,
  mobile: false,
});

try {
  await navigate(`${appBase}/login`);
  await waitForPage("!!document.querySelector('#identifier') && !!document.querySelector('#password')");
  await screenshot("admin-login");
  await evalInPage(`(() => {
    function setValue(el, value) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setValue(document.querySelector("#identifier"), ${JSON.stringify(adminEmail)});
    setValue(document.querySelector("#password"), ${JSON.stringify(adminPassword)});
    document.querySelector('button[type="submit"]').click();
    return true;
  })()`);
  await waitForPage("!location.pathname.includes('/login')", 20000);
  check("Admin login works", true, { url: await evalInPage("location.href") });

  await navigate(`${appBase}/payments`);
  await waitForPage("document.body.innerText.includes('Pembayaran')", 20000);
  await clickByText('[role="tab"], button', "Verifikasi");
  await waitForPage("document.body.innerText.includes('Lihat Bukti')", 20000);
  await screenshot("admin-payments-verification");
  check("Payments Verifikasi tab renders proof records", true, {
    hasProofNote: await evalInPage(`document.body.innerText.includes(${JSON.stringify(setup.proofNote)})`),
  });

  await clickByText("button", "Lihat Bukti");
  await waitForPage("document.body.innerText.includes('Review Bukti Pembayaran Manual')", 20000);
  await waitForNode(
    () => network.some((r) => r.url.includes(`/api/v1/payment-proofs/${setup.proofId}/files`) && r.status === 200),
    "payment proof files metadata",
    20000,
  );
  await waitForNode(
    () => network.some((r) => r.url.includes(`/api/v1/files/${setup.paymentFileId}/content`) && r.status === 200),
    "payment proof file content",
    20000,
  );
  await waitForPage(`document.querySelectorAll('button[aria-label^="Preview"]').length > 0`, 20000);
  await screenshot("admin-payment-proof-dialog");
  check("PaymentProofReviewDialog opens", true, {
    thumbnails: await evalInPage("document.querySelectorAll('button[aria-label^=\"Preview\"]').length"),
    verifyVisible: await evalInPage("document.body.innerText.includes('Verifikasi')"),
    rejectVisible: await evalInPage("document.body.innerText.includes('Tolak')"),
  });

  await clickPreviewByFilename("m12c5-payment-proof.png");
  await waitForPage(`document.body.innerText.includes('m12c5-payment-proof.png')`, 10000);
  await screenshot("admin-payment-proof-preview");
  check("Payment proof full-size preview opens", true, {
    contentEndpointUsed: network.some((r) => r.url.includes(`/api/v1/files/${setup.paymentFileId}/content`) && r.status === 200),
  });

  await navigate(`${appBase}/complaints`);
  await waitForPage(`document.body.innerText.includes(${JSON.stringify(setup.complaintTitle)})`, 20000);
  await screenshot("admin-complaints-list");
  await clickByText("button", setup.complaintTitle);
  await waitForPage("document.body.innerText.includes('Lampiran Komplain')", 20000);
  await waitForNode(
    () => network.some((r) => r.url.includes(`/api/v1/complaints/${setup.complaintId}/files`) && r.status === 200),
    "complaint files metadata",
    20000,
  );
  await waitForNode(
    () => network.some((r) => r.url.includes(`/api/v1/files/${setup.complaintFileId}/content`) && r.status === 200),
    "complaint file content",
    20000,
  );
  await screenshot("admin-complaint-detail-attachments");
  check("ComplaintAttachments component appears", true, {
    thumbnails: await evalInPage("document.querySelectorAll('button[aria-label^=\"Preview\"]').length"),
  });

  await clickPreviewByFilename("m12c5-complaint-attachment.png");
  await waitForPage(`document.body.innerText.includes('m12c5-complaint-attachment.png')`, 10000);
  await screenshot("admin-complaint-preview");
  check("Complaint attachment full-size preview opens", true, {
    contentEndpointUsed: network.some((r) => r.url.includes(`/api/v1/files/${setup.complaintFileId}/content`) && r.status === 200),
  });

  const badNetwork = network.filter((r) => /\/uploads\/|storage_path|storagePath/.test(r.url));
  check("No public storage URL used in browser network", badNetwork.length === 0, { badNetwork });

  const fatalConsole = consoleMessages.filter((m) => {
    const text = `${m.type} ${m.text}`;
    return /(fatal|uncaught|unhandled|react warning|validateDOMNesting)/i.test(text);
  });
  check("No fatal console errors", fatalConsole.length === 0, { fatalConsole });

  const unexpectedErrors = network.filter(
    (r) =>
      r.status >= 400 &&
      !r.url.includes("/auth/refresh") &&
      !r.url.includes("/json/"),
  );
  check("No unexpected 400/500 in browser happy path", unexpectedErrors.length === 0, { unexpectedErrors });
} catch (error) {
  try {
    await screenshot("failure-state");
    const bodyText = await evalInPage("document.body.innerText");
    issues.push(`BODY_TEXT: ${bodyText.slice(0, 4000)}`);
  } catch {
    // Ignore secondary evidence capture failures.
  }
  issues.push(error.stack ?? error.message);
} finally {
  const result = {
    generated_at: new Date().toISOString(),
    setup,
    checks,
    network,
    console: consoleMessages,
    screenshots,
    issues,
    pass: issues.length === 0 && checks.length > 0 && checks.every((c) => c.pass),
  };
  fs.writeFileSync(path.join(outDir, "m12c5-browser-result.json"), JSON.stringify(result, null, 2));
  await send("Page.close").catch(() => {});
  ws.close();
  console.log(JSON.stringify({ pass: result.pass, checks: result.checks, issues: result.issues, screenshots: result.screenshots }, null, 2));
}
