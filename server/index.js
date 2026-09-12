const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { PORT, MONGO_URI, CLIENT_URL, PYTHON_PATH, PYTHON_SCRIPT } = require("./config");
const calculateRouter = require("./routes/calculate").router;
const robustnessRouter = require("./routes/robustness");
const historyRouter = require("./routes/history");

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));

// ── Routes ──────────────────────────────────────────────────
app.use("/api/calculate", calculateRouter);
app.use("/api/robustness", robustnessRouter);
app.use("/api/history", historyRouter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    python_path: PYTHON_PATH,
    python_script: PYTHON_SCRIPT,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ status: "not_found", message: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("[Unhandled]", err);
  res.status(500).json({ status: "server_error", message: "An unexpected server error occurred." });
});

// ── Database + Start ────────────────────────────────────────
async function start() {
  // Verify Python path on startup
  const { execSync } = require("child_process");
  try {
    const pyVer = execSync(`${PYTHON_PATH} --version 2>&1`).toString().trim();
    console.log(`[Python] ${pyVer} at ${PYTHON_PATH}`);
  } catch {
    console.warn(
      `[Python] WARNING: Cannot verify Python at "${PYTHON_PATH}". ` +
        "Calculations will fail. Check PYTHON_PATH in .env."
    );
  }

  // Connect to MongoDB (gracefully degrade if unavailable)
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log(`[MongoDB] Connected: ${MONGO_URI}`))
    .catch((err) => {
      console.warn(
        `[MongoDB] WARNING: Could not connect to ${MONGO_URI}. ` +
          `Error: ${err.message}. History features will be disabled.`
      );
    });

  app.listen(PORT, () => {
    console.log(`\n🚀 Engine NVH API running at http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Calculate: POST http://localhost:${PORT}/api/calculate`);
    console.log(`   Robustness: POST http://localhost:${PORT}/api/robustness`);
    console.log(`   History: GET  http://localhost:${PORT}/api/history\n`);
  });
}

start();
