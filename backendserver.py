body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #000000;
  color: #ffffff;
}

#app {
  padding: 12px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
  border-bottom: 1px solid #333;
  padding-bottom: 6px;
}

header h1 {
  color: #e60000;
  font-size: 20px;
  margin: 0;
}

#worksheet-name,
#ws-label {
  font-size: 13px;
  color: #aaaaaa;
}

main {
  display: flex;
  gap: 12px;
  height: calc(100vh - 60px);
}

#left-panel,
#right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  background: #111111;
  border-radius: 8px;
  padding: 10px;
  border: 1px solid #333;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card h2 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: #e60000;
}

button {
  background: #e60000;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}

button:hover {
  background: #ff3333;
}

button:disabled {
  background: #444;
  cursor: not-allowed;
}

.info-text {
  font-size: 12px;
  color: #cccccc;
}

.small-text {
  font-size: 11px;
  color: #bbbbbb;
}

#chat-window {
  flex: 1;
  min-height: 200px;
  max-height: 300px;
  overflow-y: auto;
  background: #000000;
  border-radius: 4px;
  padding: 6px;
  border: 1px solid #333;
}

.chat-msg {
  margin-bottom: 4px;
  font-size: 12px;
}

.chat-msg .sender {
  font-weight: bold;
  margin-right: 4px;
}

.chat-msg.user {
  color: #ffffff;
}

.chat-msg.ai {
  color: #8ee6ff;
}

.chat-msg.system {
  color: #ffdd88;
}

#chat-input-row {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

#chat-input {
  flex: 1;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid #555;
  background: #000;
  color: #fff;
  font-size: 12px;
}

#chat-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.preset {
  background: #333;
  font-size: 11px;
}

#dashboard-container {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 180px;
  gap: 8px;
}

.dashboard-chart {
  background: #000000;
  border-radius: 4px;
  padding: 4px;
  border: 1px solid #333;
  position: relative;
}

.dashboard-chart canvas {
  width: 100% !important;
  height: 100% !important;
}
