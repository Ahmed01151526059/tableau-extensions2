const BACKEND_URL = window.location.origin;

let authToken = null;
let siteId = null;
let currentWorkbooks = [];
let currentViews = [];
let currentRows = [];
let chartObjects = [];

function setStatus(text) {
  document.getElementById("status-text").textContent = text;
}

function addChatMessage(sender, text, cls = "ai") {
  const div = document.createElement("div");
  div.className = `chat-msg ${cls}`;
  div.textContent = `${sender}: ${text}`;
  const win = document.getElementById("chat-window");
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

async function postJSON(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json.error || JSON.stringify(json));
  }
  return json;
}

async function getJSON(url) {
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json.error || JSON.stringify(json));
  }
  return json;
}

// ===== LOGIN =====
async function handleConnect() {
  const username = document.getElementById("input-username").value;
  const password = document.getElementById("input-password").value;
  const site = document.getElementById("input-site").value;

  if (!username || !password) {
    document.getElementById("login-info").textContent = "Please enter username and password.";
    return;
  }

  document.getElementById("login-info").textContent = "Connecting...";
  setStatus("Signing in to Tableau...");

  try {
    const data = await postJSON(`${BACKEND_URL}/signin`, {
      username,
      password,
      siteContentUrl: site,
    });
    authToken = data.authToken;
    siteId = data.siteId;
    document.getElementById("login-info").textContent = data.message || "Connected.";
    setStatus("Connected to Tableau.");
  } catch (err) {
    document.getElementById("login-info").textContent = "Login failed: " + err.message;
    setStatus("Login failed.");
  }
}

// ===== WORKBOOKS =====
async function loadWorkbooks() {
  if (!authToken || !siteId) {
    setStatus("Please connect first.");
    return;
  }
  setStatus("Loading workbooks...");
  try {
    const data = await getJSON(
      `${BACKEND_URL}/workbooks?authToken=${encodeURIComponent(authToken)}&siteId=${encodeURIComponent(siteId)}`
    );
    currentWorkbooks = data.workbooks || [];
    const sel = document.getElementById("select-workbook");
    sel.innerHTML = "";
    currentWorkbooks.forEach((wb) => {
      const opt = document.createElement("option");
      opt.value = wb.id;
      opt.textContent = wb.name;
      sel.appendChild(opt);
    });
    setStatus(`Loaded ${currentWorkbooks.length} workbooks.`);
  } catch (err) {
    setStatus("Failed to load workbooks: " + err.message);
  }
}

// ===== VIEWS =====
async function loadViews() {
  if (!authToken || !siteId) {
    setStatus("Please connect first.");
    return;
  }
  const wbSel = document.getElementById("select-workbook");
  const workbookId = wbSel.value;
  if (!workbookId) {
    setStatus("Please select a workbook.");
    return;
  }

  setStatus("Loading sheets...");
  try {
    const data = await getJSON(
      `${BACKEND_URL}/views?authToken=${encodeURIComponent(authToken)}&siteId=${encodeURIComponent(siteId)}&workbookId=${encodeURIComponent(workbookId)}`
    );
    currentViews = data.views || [];
    const sel = document.getElementById("select-view");
    sel.innerHTML = "";
    currentViews.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.name;
      sel.appendChild(opt);
    });
    setStatus(`Loaded ${currentViews.length} sheets.`);
  } catch (err) {
    setStatus("Failed to load sheets: " + err.message);
  }
}

// ===== DATA PREVIEW =====
async function displayData() {
  if (!authToken || !siteId) {
    setStatus("Please connect first.");
    return;
  }
  const viewSel = document.getElementById("select-view");
  const viewId = viewSel.value;
  if (!viewId) {
    setStatus("Please select a sheet.");
    return;
  }

  setStatus("Loading sheet data...");
  try {
    const data = await getJSON(
      `${BACKEND_URL}/view-data?authToken=${encodeURIComponent(authToken)}&siteId=${encodeURIComponent(siteId)}&viewId=${encodeURIComponent(viewId)}`
    );
    const columns = data.columns || [];
    const rows = data.rows || [];
    currentRows = rows;

    const info = document.getElementById("data-info");
    info.textContent = `Loaded ${rows.length} rows, ${columns.length} columns.`;

    const container = document.getElementById("table-container");
    container.innerHTML = "";

    if (!columns.length) {
      container.textContent = "No data.";
      return;
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    columns.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.slice(0, 100).forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((c) => {
        const td = document.createElement("td");
        td.textContent = row[c];
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    setStatus("Sheet data displayed.");
  } catch (err) {
    setStatus("Failed to load sheet data: " + err.message);
  }
}

// ===== CHAT =====
async function sendChat(question) {
  if (!currentRows.length) {
    addChatMessage("System", "Please display data first.", "system");
    return;
  }
  if (!question) return;
  addChatMessage("You", question, "user");

  try {
    const data = await postJSON(`${BACKEND_URL}/chat`, {
      question,
      data: currentRows,
    });
    addChatMessage("AI", data.answer || "(No answer)", "ai");
  } catch (err) {
    addChatMessage("System", "Error: " + err.message, "system");
  }
}

// ===== AI DASHBOARD =====
async function generateAIDashboard() {
  if (!currentRows.length) {
    addChatMessage("System", "Please display data first.", "system");
    return;
  }
  setStatus("Letting AI design dashboard...");

  try {
    const spec = await postJSON(`${BACKEND_URL}/ai-dashboard`, {
      data: currentRows,
    });
    renderDashboard(spec.charts || []);
    setStatus("AI dashboard created.");
  } catch (err) {
    addChatMessage("System", "AI dashboard error: " + err.message, "system");
    setStatus("AI dashboard failed.");
  }
}

function renderDashboard(chartsSpec) {
  const container = document.getElementById("dashboard-container");
  container.innerHTML = "";
  chartObjects.forEach((c) => c.destroy());
  chartObjects = [];

  const specs = chartsSpec.slice(0, 4);

  specs.forEach((cfg) => {
    const xcol = cfg.x;
    const ycol = cfg.y;
    const type = (cfg.type || "bar").toLowerCase();
    const title = cfg.title || `${type} chart`;

    if (!xcol) return;

    const grouped = {};
    currentRows.forEach((row) => {
      const key = String(row[xcol]);
      let val = 1;
      if (ycol) {
        const raw = row[ycol];
        const num = parseFloat(String(raw || "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
        if (!Number.isNaN(num)) {
          val = num;
        }
      }
      if (!(key in grouped)) grouped[key] = 0;
      grouped[key] += val;
    });

    const labels = Object.keys(grouped).slice(0, 10);
    const values = labels.map((k) => grouped[k]);

    const div = document.createElement("div");
    div.className = "dashboard-chart";
    const canvas = document.createElement("canvas");
    div.appendChild(canvas);
    container.appendChild(div);

    const ctx = canvas.getContext("2d");
    let chartType = "bar";
    if (type === "line") chartType = "line";
    if (type === "pie") chartType = "pie";

    const chart = new Chart(ctx, {
      type: chartType,
      data: {
        labels,
        datasets: [
          {
            label: title,
            data: values,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#fff", font: { size: 9 } },
          },
          title: {
            display: true,
            text: title,
            color: "#fff",
            font: { size: 11, weight: "bold" },
          },
        },
        scales:
          chartType === "pie"
            ? {}
            : {
                x: { ticks: { color: "#fff", font: { size: 9 } } },
                y: { ticks: { color: "#fff", font: { size: 9 } } },
              },
      },
    });
    chartObjects.push(chart);
  });

  if (!specs.length) {
    addChatMessage(
      "System",
      "AI returned no usable charts. Check the model output or prompt.",
      "system"
    );
  }
}

// ===== UI wiring =====
function setupUI() {
  document.getElementById("btn-connect").onclick = handleConnect;
  document.getElementById("btn-load-workbooks").onclick = loadWorkbooks;
  document.getElementById("btn-load-views").onclick = loadViews;
  document.getElementById("btn-display-data").onclick = displayData;
  document.getElementById("btn-ai-dashboard").onclick = generateAIDashboard;

  document.getElementById("btn-chat-send").onclick = () => {
    const input = document.getElementById("chat-input");
    const q = input.value;
    input.value = "";
    sendChat(q);
  };

  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const input = document.getElementById("chat-input");
      const q = input.value;
      input.value = "";
      sendChat(q);
    }
  });

  document.querySelectorAll(".preset").forEach((btn) => {
    btn.onclick = () => {
      const q = btn.getAttribute("data-q") || "";
      sendChat(q);
    };
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupUI();
  // Optional: initialize Tableau extension (won't change logic here)
  if (window.tableau && tableau.extensions) {
    tableau.extensions
      .initializeAsync()
      .then(() => setStatus("Extension initialized."))
      .catch(() => setStatus("Extension initialized (fallback)."));
  }
});

