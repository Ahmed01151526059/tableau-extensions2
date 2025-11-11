// === CONFIG ===
const BACKEND_URL = "http://127.0.0.1:5000";

let worksheet = null;
let currentDataRows = []; // array of row objects
let charts = []; // Chart.js instances

// Utility: append chat messages
function addChatMessage(sender, text, type = "ai") {
  const chatWindow = document.getElementById("chat-window");
  const div = document.createElement("div");
  div.className = `chat-msg ${type}`;
  const senderSpan = document.createElement("span");
  senderSpan.className = "sender";
  senderSpan.textContent = sender + ":";
  const textSpan = document.createElement("span");
  textSpan.textContent = " " + text;
  div.appendChild(senderSpan);
  div.appendChild(textSpan);
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Utility: show info text
function setInfo(text) {
  const info = document.getElementById("data-info");
  info.textContent = text;
}

// Initialize Tableau extension
function initExtension() {
  tableau.extensions.initializeAsync().then(() => {
    const dashboard = tableau.extensions.dashboardContent.dashboard;
    // For simplicity, use the first worksheet in the dashboard
    if (dashboard.worksheets.length === 0) {
      setInfo("No worksheets found in this dashboard.");
      return;
    }

    worksheet = dashboard.worksheets[0];
    document.getElementById("ws-label").textContent = worksheet.name;
    document.getElementById("worksheet-name").textContent =
      "Using worksheet: " + worksheet.name;
  });
}

// Load data from Tableau worksheet
async function loadDataFromWorksheet() {
  if (!worksheet) {
    setInfo("Extension not initialized or worksheet not found.");
    return;
  }

  setInfo("Loading data from worksheet...");
  currentDataRows = [];

  try {
    const summary = await worksheet.getSummaryDataAsync({
      maxRows: 5000,
      ignoreSelection: true,
    });

    const cols = summary.columns.map((c) => c.fieldName || c.caption);
    const rows = summary.data.map((row) => {
      const obj = {};
      row.forEach((cell, idx) => {
        obj[cols[idx]] = cell.formattedValue;
      });
      return obj;
    });

    currentDataRows = rows;
    setInfo(`Loaded ${rows.length} rows and ${cols.length} columns.`);
  } catch (err) {
    console.error(err);
    setInfo("Error loading data from worksheet.");
  }
}

// Send chat question to backend + Ollama
async function sendChatQuestion(question) {
  if (!question.trim()) return;
  if (!currentDataRows.length) {
    addChatMessage(
      "System",
      "Please click 'Load Data From Worksheet' first.",
      "system"
    );
    return;
  }

  addChatMessage("You", question, "user");

  try {
    const resp = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question,
        data: currentDataRows,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      addChatMessage(
        "System",
        "Backend error: " + resp.status + " - " + txt,
        "system"
      );
      return;
    }
    const json = await resp.json();
    addChatMessage("Assistant", json.answer || "(No answer)", "ai");
  } catch (err) {
    console.error(err);
    addChatMessage("System", "Error calling backend: " + err, "system");
  }
}

// Request AI dashboard spec and render with Chart.js
async function generateAIDashboard() {
  if (!currentDataRows.length) {
    addChatMessage(
      "System",
      "Please load data from the worksheet first.",
      "system"
    );
    return;
  }

  setInfo("Generating AI dashboard from Ollama...");

  try {
    const resp = await fetch(`${BACKEND_URL}/ai-dashboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: currentDataRows }),
    });

    const json = await resp.json();
    if (!resp.ok) {
      addChatMessage(
        "System",
        "AI dashboard error: " + (json.error || JSON.stringify(json)),
        "system"
      );
      setInfo("AI dashboard failed.");
      return;
    }

    renderDashboardCharts(json);
    setInfo("AI dashboard created.");
  } catch (err) {
    console.error(err);
    addChatMessage("System", "Error calling backend: " + err, "system");
    setInfo("AI dashboard failed.");
  }
}

// Render Chart.js charts based on AI spec { charts: [...] }
function renderDashboardCharts(spec) {
  const container = document.getElementById("dashboard-container");
  container.innerHTML = "";
  charts.forEach((c) => c.destroy());
  charts = [];

  const chartsSpec = Array.isArray(spec.charts) ? spec.charts : [];
  const maxCharts = Math.min(chartsSpec.length, 4);

  for (let i = 0; i < maxCharts; i++) {
    const cfg = chartsSpec[i] || {};
    const xcol = cfg.x;
    const ycol = cfg.y;
    const type = (cfg.type || "bar").toLowerCase();
    const title = cfg.title || `Chart ${i + 1}`;

    if (!xcol) continue;

    // Aggregate data from currentDataRows
    const grouped = {};
    currentDataRows.forEach((row) => {
      const key = String(row[xcol]);
      let val = 1;

      if (ycol) {
        const rawVal = row[ycol];
        const num = parseFloat(
          String(rawVal || "").replace(/,/g, "").replace(/[^\d.-]/g, "")
        );
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
        labels: labels,
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
            labels: {
              color: "#ffffff",
              font: { size: 10 },
            },
          },
          title: {
            display: true,
            text: title,
            color: "#ffffff",
            font: { size: 12, weight: "bold" },
          },
        },
        scales:
          chartType === "pie"
            ? {}
            : {
                x: {
                  ticks: { color: "#ffffff", font: { size: 9 } },
                },
                y: {
                  ticks: { color: "#ffffff", font: { size: 9 } },
                },
              },
      },
    });

    charts.push(chart);
  }

  if (!maxCharts) {
    addChatMessage(
      "System",
      "AI returned no usable charts. Check the model output or prompt.",
      "system"
    );
  }
}

// Hook UI events
function setupUI() {
  document
    .getElementById("btn-load-data")
    .addEventListener("click", loadDataFromWorksheet);

  document
    .getElementById("btn-chat-send")
    .addEventListener("click", () => {
      const input = document.getElementById("chat-input");
      const q = input.value;
      input.value = "";
      sendChatQuestion(q);
    });

  document
    .getElementById("chat-input")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const input = document.getElementById("chat-input");
        const q = input.value;
        input.value = "";
        sendChatQuestion(q);
      }
    });

  document.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.getAttribute("data-q") || "";
      sendChatQuestion(q);
    });
  });

  document
    .getElementById("btn-ai-dashboard")
    .addEventListener("click", generateAIDashboard);
}

// Entry point
document.addEventListener("DOMContentLoaded", () => {
  setupUI();
  initExtension();
});
