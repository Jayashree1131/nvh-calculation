const { spawn } = require("child_process");
const path = require("path");
const { PYTHON_PATH, PYTHON_SCRIPT, CALC_TIMEOUT_MS } = require("../config");
const { validate, calculateSchema } = require("../middleware/validate");
const { saveCalculation } = require("../storage");
const express = require("express");

const router = express.Router();

/**
 * Spawns the Python engine and returns parsed JSON result.
 * @param {object} inputs — validated inputs object
 * @param {number} timeoutMs
 * @returns {Promise<object>}
 */
function runPython(inputs, timeoutMs) {
  return new Promise((resolve, reject) => {
    const inputJson = JSON.stringify(inputs);
    const proc = spawn(PYTHON_PATH, [PYTHON_SCRIPT, inputJson]);

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      reject(
        new Error(
          `Python calculation timed out after ${timeoutMs / 1000}s. ` +
            "The robustness study takes longer — use the Robustness button separately."
        )
      );
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return; // already rejected

      if (!stdout.trim()) {
        return reject(
          new Error(
            `Python produced no output. stderr: ${stderr || "(empty)"}`
          )
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch (e) {
        return reject(
          new Error(
            `Failed to parse Python output as JSON: ${e.message}. ` +
              `Raw output (first 500 chars): ${stdout.slice(0, 500)}`
          )
        );
      }

      if (parsed.status === "error") {
        const err = new Error(parsed.message || "Python calculation error.");
        err.pythonError = true;
        err.traceback = parsed.traceback || "";
        return reject(err);
      }

      resolve(parsed);
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Python not found at path: ${PYTHON_PATH}. ` +
              "Check the PYTHON_PATH environment variable in .env."
          )
        );
      } else {
        reject(new Error(`Failed to start Python process: ${err.message}`));
      }
    });
  });
}

/**
 * POST /api/calculate
 * Runs the full 6DOF engine calculation (without robustness).
 */
router.post("/", validate(calculateSchema), async (req, res) => {
  const inputs = { ...req.validatedBody, run_robustness: false };

  try {
    const result = await runPython(inputs, CALC_TIMEOUT_MS);

    // Persist to MongoDB (non-blocking — don't fail the response if DB is down)
    const kpi = {
      misalignment_3D_deg: result.misalignment_3D_deg,
      cg_to_eTRA_offset_mm: result.cg_to_eTRA_offset_mm,
      yz_misalignment_deg: result.projected?.YZ?.misalignment_deg ?? null,
      all_modes_pass_80pct: result.all_modes_pass_80pct,
    };

    let calcId = null;
    try {
      calcId = await saveCalculation({
        label: req.validatedBody.label || "",
        inputs: req.validatedBody,
        outputs: result,
        kpi,
      });
    } catch (dbErr) {
      console.warn("[DB] Failed to save calculation:", dbErr.message);
    }

    return res.json({ status: "ok", data: { ...result, _id: calcId } });
  } catch (err) {
    console.error("[calculate]", err.message);

    if (err.pythonError) {
      return res.status(422).json({
        status: "calculation_error",
        message: err.message,
        detail: err.traceback
          ? err.traceback.split("\n").slice(-5).join("\n")
          : "",
      });
    }

    return res.status(500).json({
      status: "server_error",
      message: err.message,
    });
  }
});

module.exports = { router, runPython };
