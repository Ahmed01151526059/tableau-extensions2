// Use the same origin where the extension is loaded
// (When hosted on GitHub Pages, this is just for info – we don't call any backend here)
let dashboard = null;
let worksheets = [];
let currentWorksheet = null;
let currentData = {
  columns: [],
  rows: [] // array of row objects: { colName: formattedValue }
};
let charts = [];

// Helper to set status text
function setStatus(msg) {
  const el = document.getElementById("status-text");
  if (el) el.textContent = msg;
}

// Initialize chart config UI (4 charts)
function initChartConfig(columns) {
  const container = document.getElementById("charts-config");
  container.innerHTML = "";

  for (let i = 0; i < 4; i++) {
    const div = document.createElement("div");
    div.className = "chart-config";
    div.dataset.index = String(i);

    const title = document.createElement("h3");
    title.textContent = `Chart ${i + 1}`;
    div.appendChild(title);

    // X selector
    const labelX = document.createElement("label");
    labelX.textContent = "X (category):";
    div.appendChild(labelX);

    const selectX = document.createElement("select");
    selectX.className = "cfg-x";
    const emptyOptX = document.createElement("option");
    emptyOptX.value = "";
    emptyOptX.textContent = "-- none --";
    selectX.appendChild(emptyOptX);
    columns.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      selectX.appendChild(opt);
    });
    div.appendChild(selectX);

    // Y selector
    const labelY = document.createElement("label");
    labelY.textContent = "Y (numeric, optional):";
    div.appendChild(labelY);

    const selectY = document.createElement("select");
    selectY.className = "cfg-y";
    const emptyOptY = document.createElement("option");
    emptyOptY.value = "";
    emptyOptY.textContent = "-- count --";
    selectY.appendChild(emptyOptY);
    columns.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      selectY.appendChild(opt);
    });
    div.appendChild(selectY);

    // Type selector
    const labelT = document.createElement("label");
    labelT.textContent = "Chart type:";
    div.appendChild(labelT);

    const selectT = document.createElement("select");
    selectT.className = "cfg-type";
    ["bar", "line", "pie"].forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      selectT.appendChild(opt);
    });
    selectT.value = "bar";
    div.appendChild(selectT);

    container.appendChild(div);
  }
}

// Render data table
function renderTable() {
  const container = document.getElementById("table-container");
  container.innerHTML = "";

  const cols = currentData.columns;
  const rows = currentData.rows;

  if (!cols.length || !rows.length) {
    container.textContent = "No data loaded.";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  cols.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.slice(0, 100).forEach((row) => {
    const tr = document.createElement("tr");
    cols.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = row[c];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// Generate dashboard charts
function generateDashboard() {
  const container = document.getElementById("dashboard-container");
  container.innerHTML = "";

  // Destroy old chart objects
  charts.forEach((ch) => ch.destroy());
  charts = [];

  const cols = currentData.columns;
  const rows = currentData.rows;

  if (!cols.length || !rows.length) {
    setStatus("No data loaded. Please load data first.");
    return;
  }

  const cfgDivs = document.querySelectorAll(".chart-config");

  cfgDivs.forEach((cfgDiv, index) => {
    const selectX = cfgDiv.querySelector(".cfg-x");
    const selectY = cfgDiv.querySelector(".cfg-y");
    const selectT = cfgDiv.querySelector(".cfg-type");

    const xCol = selectX.value;
    const yCol = selectY.value || null;
    const type = (selectT.value || "bar").toLowerCase();

    if (!xCol) {
      // skip chart if X not chosen
      return;
    }

    // Group data by xCol
    const grouped = {};
    rows.forEach((row) => {
      const key = String(row[xCol]);
      let val = 1;

      if (yCol) {
        const raw = row[yCol];
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

    const slot = document.createElement("div");
    slot.className = "chart-slot";
    const canvas = document.createElement("canvas");
    slot.appendChild(canvas);
    container.appendChild(slot);

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
            label: yCol ? `${yCol} by ${xCol}` : `Count by ${xCol}`,
            data: values
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#fff", font: { size: 9 } }
          },
          title: {
            display: true,
            text: `Chart ${index + 1}`,
            color: "#fff",
            font: { size: 11, weight: "bold" }
          }
        },
        scales:
          chartType === "pie"
            ? {}
            : {
                x: { ticks: { color: "#fff", font: { size: 9 } } },
                y: { ticks: { color: "#fff", font: { size: 9 } } }
              }
      }
    });

    charts.push(chart);
  });

  if (!charts.length) {
    setStatus("No charts were configured. Please choose X columns and try again.");
  } else {
    setStatus(`Rendered ${charts.length} chart(s).`);
  }
}

// Load data from selected worksheet
async function loadWorksheetData() {
  if (!dashboard || !worksheets.length) {
    setStatus("Extension not fully initialized.");
    return;
  }

  const select = document.getElementById("worksheet-select");
  const worksheetName = select.value;
  if (!worksheetName) {
    setStatus("Please select a worksheet.");
    return;
  }

  currentWorksheet = worksheets.find((w) => w.name === worksheetName);
  if (!currentWorksheet) {
    setStatus("Worksheet not found.");
    return;
  }

  try:
    setStatus(`Loading data from "${worksheetName}"...`);

    // getSummaryDataAsync is simple and works on most versions.
    const options = {
      maxRows: 5000,
      ignoreSelection: true
    };

    const summary = await currentWorksheet.getSummaryDataAsync(options);

    const cols = summary.columns.map((c) => c.fieldName || c.caption);
    const rows = summary.data.map((row) => {
      const obj = {};
      row.forEach((cell, idx) => {
        // Use formattedValue for display
        obj[cols[idx]] = cell.formattedValue;
      });
      return obj;
    });

    currentData.columns = cols;
    currentData.rows = rows;

    document.getElementById("data-info").textContent =
      `Loaded ${rows.length} rows, ${cols.length} columns.`;

    renderTable();
    initChartConfig(cols);
    setStatus("Data loaded successfully.");
  } catch (err) {
    console.error(err);
    setStatus("Failed to load data from worksheet.");
  }
}

// Initialize extension and populate worksheet dropdown
async function initExtension() {
  try {
    await tableau.extensions.initializeAsync();
    dashboard = tableau.extensions.dashboardContent.dashboard;
    worksheets = dashboard.worksheets;

    const select = document.getElementById("worksheet-select");
    select.innerHTML = "";
    worksheets.forEach((ws) => {
      const opt = document.createElement("option");
      opt.value = ws.name;
      opt.textContent = ws.name;
      select.appendChild(opt);
    });

    setStatus(`Initialized. Found ${worksheets.length} worksheet(s).`);
  } catch (err) {
    console.error(err);
    setStatus("Failed to initialize extension. Check console for details.");
  }
}

// Wire events
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("btn-load-data")
    .addEventListener("click", loadWorksheetData);

  document
    .getElementById("btn-generate-dashboard")
    .addEventListener("click", generateDashboard);

  initExtension();
});
