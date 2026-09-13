const { spawn } = require("child_process");
const path = require("path");
const express = require("express");
const { PYTHON_PATH, OPTIMIZER_SCRIPT, OPTIMIZER_TIMEOUT_MS } = require("../config");

const router = express.Router();

/**
 * POST /api/optimize
 *
 * Accepts optimizer parameters as JSON.
 * Responds with Server-Sent Events (SSE):
 *   - data: {"type":"progress", ...}   while the Python script is running
 *   - data: {"type":"result", ...}      on success
 *   - data: {"type":"error", ...}       on failure
 *
 * The client can cancel by sending DELETE /api/optimize/:jobId
 */

// In-memory map of active Python processes  jobId → child_process
const activeJobs = new Map();

// ── SSE stream endpoint ───────────────────────────────────────
router.post("/", (req, res) => {
  const inputs = req.body;

  // ── Validate minimum required fields ────────────────────────
  if (!inputs || !inputs.engine || !inputs.mounts || !Array.isArray(inputs.mounts)) {
    return res.status(400).json({
      status: "validation_error",
      message: "Required fields: engine (object), mounts (array of 3).",
    });
  }
  if (inputs.mounts.length !== 3) {
    return res.status(400).json({
      status: "validation_error",
      message: "Exactly 3 mounts (M1, M2, M3) are required.",
    });
  }

  // ── Set up SSE ────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering if present
  res.flushHeaders();

  const sendEvent = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  const jobId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  sendEvent({ type: "job_start", jobId });

  // ── Spawn Python — pass JSON via STDIN to avoid ARG_MAX limits ──
  // The script now reads from sys.stdin when no argv[1] provided
  const proc = spawn(PYTHON_PATH, [OPTIMIZER_SCRIPT], {
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  activeJobs.set(jobId, proc);

  let stdout = "";
  let stderrAll = ""; // full stderr for error reporting
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");
    sendEvent({
      type: "error",
      message: `Optimizer timed out after ${OPTIMIZER_TIMEOUT_MS / 60000} minutes.`,
    });
    if (!res.writableEnded) res.end();
    activeJobs.delete(jobId);
  }, OPTIMIZER_TIMEOUT_MS);

  // ── Write inputs JSON to Python's stdin ───────────────────
  // Use .end() to write and close in one atomic operation, avoiding EPIPE on slow starts
  const inputJson = JSON.stringify(inputs);
  try {
    proc.stdin.end(inputJson, "utf8");
  } catch (e) {
    // stdin might already be closed if the process exited immediately
    console.warn("[optimizer] stdin write error:", e.message);
  }

  // ── Collect stdout (final JSON result) ────────────────────
  proc.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  // ── Stream progress from stderr ────────────────────────────
  let stderrBuf = "";
  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderrAll += text;           // keep full copy for error reporting
    stderrBuf += text;

    // Parse complete PROGRESS: lines
    const lines = stderrBuf.split("\n");
    stderrBuf = lines.pop() ?? ""; // keep incomplete last segment

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("PROGRESS:")) {
        try {
          const payload = JSON.parse(trimmed.slice("PROGRESS:".length));
          sendEvent({ type: "progress", ...payload });
        } catch {
          sendEvent({ type: "progress", message: trimmed.slice("PROGRESS:".length) });
        }
      } else if (trimmed) {
        // Non-progress stderr — surface as a log event AND console
        console.warn("[optimizer stderr]", trimmed);
        sendEvent({ type: "log", message: trimmed });
      }
    }
  });

  proc.on("close", (code) => {
    clearTimeout(timer);
    activeJobs.delete(jobId);
    if (timedOut) return;

    // Flush any remaining stderr buffer (no trailing newline)
    if (stderrBuf.trim()) {
      stderrAll += stderrBuf;
      console.warn("[optimizer stderr]", stderrBuf.trim());
    }

    // ── No stdout → Python crashed before writing anything ───
    if (!stdout.trim()) {
      // Try to extract last few lines of stderr as the useful part
      const stderrTail = stderrAll
        .split("\n")
        .filter((l) => !l.startsWith("PROGRESS:") && l.trim())
        .slice(-10)
        .join("\n");

      sendEvent({
        type: "error",
        message:
          `Optimizer produced no output (exit code ${code}). ` +
          (stderrTail
            ? `Python error:\n${stderrTail}`
            : "Check that scipy is installed: python3 -m pip install scipy"),
      });
      if (!res.writableEnded) res.end();
      return;
    }

    // ── Parse stdout JSON ─────────────────────────────────────
    let parsed;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch (e) {
      sendEvent({
        type: "error",
        message: `Failed to parse optimizer output: ${e.message}`,
        raw: stdout.slice(0, 500),
      });
      if (!res.writableEnded) res.end();
      return;
    }

    if (parsed.status === "error") {
      sendEvent({
        type: "error",
        message: parsed.message || "Python optimizer error.",
        traceback: (parsed.traceback || "").split("\n").slice(-10).join("\n"),
      });
    } else {
      // Save compact summary to DB (non-blocking)
      _saveOptimizerRun(inputs, parsed).catch((err) => {
        console.warn("[DB] Failed to save optimizer run:", err.message);
      });
      sendEvent({ type: "result", data: parsed });
    }

    if (!res.writableEnded) res.end();
  });

  proc.on("error", (err) => {
    clearTimeout(timer);
    activeJobs.delete(jobId);
    sendEvent({
      type: "error",
      message:
        err.code === "ENOENT"
          ? `Python not found at: ${PYTHON_PATH}. Check PYTHON_PATH in .env.`
          : `Failed to start Python: ${err.message}`,
    });
    if (!res.writableEnded) res.end();
  });

  // ── Clean up on client disconnect ────────────────────────
  res.on("close", () => {
    if (!res.writableEnded && activeJobs.has(jobId)) {
      proc.kill("SIGTERM");
      activeJobs.delete(jobId);
      console.log(`[optimizer] Client disconnected prematurely, killed job ${jobId}`);
    }
  });
});

// ── Cancel endpoint  DELETE /api/optimize/:jobId ─────────────
router.delete("/:jobId", (req, res) => {
  const { jobId } = req.params;
  const proc = activeJobs.get(jobId);
  if (!proc) {
    return res.status(404).json({ status: "not_found", message: "Job not found or already finished." });
  }
  proc.kill("SIGTERM");
  activeJobs.delete(jobId);
  res.json({ status: "cancelled", jobId });
});

// ── MongoDB summary save (best-effort) ───────────────────────
async function _saveOptimizerRun(inputs, result) {
  let mongoose;
  try { mongoose = require("mongoose"); } catch { return; }
  if (mongoose.connection.readyState !== 1) return;

  const OptimizerRun = _getOptimizerRunModel(mongoose);
  await OptimizerRun.create({
    engine: inputs.engine,
    enabled_cases: result.enabled_cases,
    settings: result.settings,
    case_summaries: result.case_summaries,
    top10_summary: (result.top10 || []).map((r) => ({
      name: r.name,
      case_id: r.case_id,
      min_purity: r.min_purity,
      angle_3d_deg: r.angle_3d_deg,
      etra_offset_mm: r.etra_offset_mm,
      min_gap_margin: r.min_gap_margin,
      feasible: r.feasible,
      verdict: r.verdict,
    })),
  });
}

let _OptimizerRunModel = null;
function _getOptimizerRunModel(mongoose) {
  if (_OptimizerRunModel) return _OptimizerRunModel;
  const schema = new mongoose.Schema(
    {
      engine: mongoose.Schema.Types.Mixed,
      enabled_cases: [Number],
      settings: mongoose.Schema.Types.Mixed,
      case_summaries: mongoose.Schema.Types.Mixed,
      top10_summary: mongoose.Schema.Types.Mixed,
    },
    { timestamps: true, collection: "optimizer_runs" }
  );
  _OptimizerRunModel = mongoose.model("OptimizerRun", schema);
  return _OptimizerRunModel;
}

module.exports = router;
