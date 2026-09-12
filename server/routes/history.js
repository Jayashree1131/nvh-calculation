const express = require("express");
const {
  listCalculations,
  getCalculationById,
  updateCalculationLabel,
  deleteCalculationById,
} = require("../storage");

const router = express.Router();

/**
 * GET /api/history
 * Returns paginated past calculations (without large plot base64).
 */
router.get("/", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

  try {
    const data = await listCalculations(page, limit);
    return res.json({ status: "ok", data });
  } catch (err) {
    console.error("[history/list]", err.message);
    return res.status(500).json({ status: "server_error", message: err.message });
  }
});

/**
 * GET /api/history/:id
 * Returns a single full calculation including plots.
 */
router.get("/:id", async (req, res) => {
  try {
    const calc = await getCalculationById(req.params.id);
    if (!calc) {
      return res.status(404).json({ status: "not_found", message: "Calculation not found." });
    }
    return res.json({ status: "ok", data: calc });
  } catch (err) {
    console.error("[history/get]", err.message);
    return res.status(500).json({ status: "server_error", message: err.message });
  }
});

/**
 * PATCH /api/history/:id
 * Update calculation label.
 */
router.patch("/:id", async (req, res) => {
  const { label } = req.body;
  if (typeof label !== "string") {
    return res.status(400).json({ status: "error", message: "label must be a string." });
  }
  try {
    const calc = await updateCalculationLabel(req.params.id, label);
    if (!calc) {
      return res.status(404).json({ status: "not_found", message: "Calculation not found." });
    }
    return res.json({ status: "ok", data: calc });
  } catch (err) {
    return res.status(500).json({ status: "server_error", message: err.message });
  }
});

/**
 * DELETE /api/history/:id
 * Delete a calculation.
 */
router.delete("/:id", async (req, res) => {
  try {
    const success = await deleteCalculationById(req.params.id);
    if (!success) {
      return res.status(404).json({ status: "not_found", message: "Calculation not found." });
    }
    return res.json({ status: "ok", message: "Calculation deleted." });
  } catch (err) {
    console.error("[history/delete]", err.message);
    return res.status(500).json({ status: "server_error", message: err.message });
  }
});

module.exports = router;
