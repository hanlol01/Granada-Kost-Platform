import { useEffect, useState } from "react";
import axios from "axios";

const api = axios.create({ timeout: 20_000 });

const actions = [
  { label: "Device Detail", method: "GET", path: "/api/device" },
  { label: "Status", method: "GET", path: "/api/device/status" },
  { label: "Functions", method: "GET", path: "/api/device/functions" },
  { label: "Specifications", method: "GET", path: "/api/device/specifications" },
];

function App() {
  const [safeMode, setSafeMode] = useState(true);
  const [healthState, setHealthState] = useState("unknown");
  const [loading, setLoading] = useState("");
  const [response, setResponse] = useState({
    title: "Ready",
    data: { message: "Pilih aksi untuk mulai menguji Tuya Cloud API." },
  });
  const [raw, setRaw] = useState({
    method: "GET",
    path: "/v1.0/devices/DEVICE_ID/status",
    body: "{}",
  });

  useEffect(() => {
    callApi("Backend Health", "GET", "/health", undefined, true);
  }, []);

  async function callApi(title, method, path, body, silent = false) {
    setLoading(title);
    try {
      const result = await api({ method, url: path, data: body });
      if (path === "/health") {
        setSafeMode(result.data.safeMode);
        setHealthState("online");
      }
      if (!silent || path === "/health") setResponse({ title, data: result.data });
      return result.data;
    } catch (error) {
      if (path === "/health") setHealthState("offline");
      const data = error.response?.data || {
        success: false,
        error: { code: error.code, message: error.message },
      };
      setResponse({ title: `${title} - Error`, data });
      return null;
    } finally {
      setLoading("");
    }
  }

  function controlLock(action) {
    const warning = action === "unlock"
      ? "PERINGATAN: Perintah ini dapat membuka pintu fisik. Lanjutkan?"
      : "Kirim perintah lock? Tidak semua smart lock mendukung remote lock.";
    if (!window.confirm(warning)) return;
    callApi(action === "unlock" ? "Unlock Test" : "Lock Test", "POST", `/api/lock/${action}`, {});
  }

  function sendRaw(event) {
    event.preventDefault();
    let parsedBody;
    try {
      parsedBody = raw.body.trim() ? JSON.parse(raw.body) : {};
    } catch (error) {
      setResponse({
        title: "Raw API - Invalid JSON",
        data: { success: false, error: { code: "INVALID_JSON", message: error.message } },
      });
      return;
    }
    callApi("Raw Tuya API", "POST", "/api/tuya/raw", { ...raw, body: parsedBody });
  }

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Proof of Concept / Tuya Cloud</p>
          <h1>Smart Lock API Tester</h1>
          <p className="intro">Uji koneksi, kemampuan device, dan kontrol PALOMA Tuya WiFi lock dari satu halaman.</p>
        </div>
        <div className={`mode-card ${safeMode ? "safe" : "live"}`}>
          <span className="status-dot" />
          <div>
            <strong>{safeMode ? "SAFE MODE" : "LIVE CONTROL"}</strong>
            <small>{safeMode ? "Perintah kontrol disimulasikan" : "Dapat mengontrol pintu fisik"}</small>
          </div>
        </div>
      </header>

      <div className="grid">
        <section className="panel connection">
          <PanelTitle number="01" title="Connection Test" />
          <div className="connection-row">
            <span className={`health ${healthState}`}>{healthState}</span>
            <button onClick={() => callApi("Backend Health", "GET", "/health")}>Test Backend</button>
            <button onClick={() => callApi("Tuya Access Token", "GET", "/api/tuya/token")}>Get Tuya Token</button>
          </div>
        </section>

        <section className="panel">
          <PanelTitle number="02" title="Device Info" />
          <div className="button-grid">
            {actions.map((action) => (
              <button key={action.path} onClick={() => callApi(action.label, action.method, action.path)}>
                {action.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel control">
          <PanelTitle number="03" title="Smart Lock Control" />
          <p className="warning">Unlock dapat membuka pintu fisik. Pastikan area pintu aman sebelum menonaktifkan SAFE_MODE.</p>
          <div className="control-row">
            <button className="unlock" onClick={() => controlLock("unlock")}>
              {safeMode ? "Simulate Unlock" : "Unlock Door"}
            </button>
            <button className="lock" onClick={() => controlLock("lock")}>
              {safeMode ? "Simulate Lock" : "Lock Door"}
            </button>
          </div>
        </section>

        <section className="panel raw-panel">
          <PanelTitle number="04" title="Raw API Tester" />
          <form onSubmit={sendRaw}>
            <label>
              Method
              <select value={raw.method} onChange={(event) => setRaw({ ...raw, method: event.target.value })}>
                {["GET", "POST", "PUT", "DELETE"].map((method) => <option key={method}>{method}</option>)}
              </select>
            </label>
            <label className="path-field">
              Tuya API path
              <input value={raw.path} onChange={(event) => setRaw({ ...raw, path: event.target.value })} />
            </label>
            <label className="body-field">
              JSON body
              <textarea rows="7" value={raw.body} onChange={(event) => setRaw({ ...raw, body: event.target.value })} />
            </label>
            <button type="submit">Send Raw Request</button>
          </form>
          {safeMode && <p className="safe-note">SAFE_MODE aktif: Raw API hanya mengizinkan GET.</p>}
        </section>

        <section className="panel response-panel">
          <div className="response-heading">
            <PanelTitle number="05" title="Response Viewer" />
            {loading && <span className="loading">Requesting {loading}...</span>}
          </div>
          <pre>{JSON.stringify(response.data, null, 2)}</pre>
        </section>
      </div>
    </main>
  );
}

function PanelTitle({ number, title }) {
  return (
    <div className="panel-title">
      <span>{number}</span>
      <h2>{title}</h2>
    </div>
  );
}

export default App;
