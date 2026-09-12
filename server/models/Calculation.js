const mongoose = require("mongoose");

const CalculationSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      default: "",
      trim: true,
    },
    inputs: {
      mass: Number,
      cg: [Number],
      inertia: [[Number]],
      torque: Number,
      dynamic_stiffness_factor: Number,
      mounts: [
        new mongoose.Schema(
          {
            name: String,
            x: Number,
            y: Number,
            z: Number,
            kx: Number,
            ky: Number,
            kz: Number,
            roll: { type: Number, default: 0 },
            pitch: { type: Number, default: 0 },
            yaw: { type: Number, default: 0 },
          },
          { _id: false }
        ),
      ],
    },
    outputs: {
      type: mongoose.Schema.Types.Mixed, // full result JSON
    },
    // quick-access KPIs stored at top level for history list queries
    kpi: {
      misalignment_3D_deg: Number,
      cg_to_eTRA_offset_mm: Number,
      yz_misalignment_deg: Number,
      all_modes_pass_80pct: Boolean,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Calculation", CalculationSchema);
