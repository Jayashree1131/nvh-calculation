const express = require("express");
const { validate, calculateSchema } = require("../middleware/validate");
const { runPython } = require("./calculate");
const { ROBUSTNESS_TIMEOUT_MS } = require("../config");
const Calculation = require("../models/Calculation");
const Joi = require("joi");

const router = express.Router();

// Reuse calculate schema but allow run_robustness to be true
const robustnessSchema = calculateSchema.keys({
  run_robustness: Joi.boolean().default(true),
  // Allow passing an existing calculation ID to attach robustness to
  calculation_id: Joi.string().optional(),
});

/**
 * POST /api/robustness
 * Runs the exhaustive ±5/±10/±15% stiffness robustness study.
 * This is intentionally separate from /calculate because it takes ~10-30s.
 */
router.post("/", validate(robustnessSchema), async (req, res) => {
  const inputs = { ...req.validatedBody, run_robustness: true };

  try {
    const result = await runPython(inputs, ROBUSTNESS_TIMEOUT_MS);

    // If a calculation_id was provided, attach robustness results to it
    if (req.validatedBody.calculation_id) {
      Calculation.findByIdAndUpdate(
        req.validatedBody.calculation_id,
        { $set: { "outputs.robustness": result.robustness } },
        { new: true }
      ).catch((err) => {
        console.warn("[DB] Failed to update robustness on calculation:", err.message);
      });
    }

    return res.json({ status: "ok", data: result.robustness });
  } catch (err) {
    console.error("[robustness]", err.message);

    if (err.message.includes("timed out")) {
      return res.status(504).json({
        status: "timeout_error",
        message:
          "Robustness study timed out. This is rare — check if your system is under heavy load and try again.",
      });
    }

    if (err.pythonError) {
      return res.status(422).json({
        status: "calculation_error",
        message: err.message,
      });
    }

    return res.status(500).json({
      status: "server_error",
      message: err.message,
    });
  }
});

module.exports = router;
