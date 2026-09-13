/**
 * Client-side validators — mirrors backend Joi schema for instant inline feedback.
 * Returns an object { field: errorMessage } for any validation errors found.
 */

export function validateInputs(form) {
  const errors = {};

  // Mass
  if (form.mass === "" || form.mass === null || form.mass === undefined) {
    errors.mass = "Mass is required.";
  } else if (isNaN(Number(form.mass)) || !isFinite(Number(form.mass))) {
    errors.mass = "Mass must be a finite number.";
  } else if (Number(form.mass) <= 0) {
    errors.mass = "Mass must be positive (> 0 kg).";
  }

  // CG
  if (!form.cg || form.cg.length !== 3) {
    errors.cg = "CG requires exactly 3 values [X, Y, Z].";
  } else {
    form.cg.forEach((v, i) => {
      if (v === "" || v === null || v === undefined || isNaN(Number(v)) || !isFinite(Number(v))) {
        errors[`cg_${i}`] = `CG ${["X","Y","Z"][i]} must be a finite number.`;
      }
    });
  }

  // Torque
  if (form.torque === "" || form.torque === null || form.torque === undefined) {
    errors.torque = "Torque is required.";
  } else if (Number(form.torque) <= 0) {
    errors.torque = "Torque must be positive — eTRA cannot be defined at zero torque.";
  }

  // Dynamic stiffness factor
  const dsf = Number(form.dynamic_stiffness_factor);
  if (isNaN(dsf) || dsf < 1.0) {
    errors.dynamic_stiffness_factor = "Dynamic stiffness factor must be ≥ 1.0.";
  } else if (dsf > 3.0) {
    errors.dynamic_stiffness_factor = "Dynamic stiffness factor must be ≤ 3.0 (values above 3× are unrealistic).";
  }

  // Inertia tensor
  if (!form.inertia || form.inertia.length !== 3) {
    errors.inertia = "Inertia tensor must be 3×3.";
  } else {
    // Positive diagonal
    for (let i = 0; i < 3; i++) {
      if (!form.inertia[i] || form.inertia[i].length !== 3) {
        errors[`inertia_row_${i}`] = `Inertia row ${i} must have 3 values.`;
      } else {
        if (Number(form.inertia[i][i]) <= 0) {
          errors[`inertia_${i}_${i}`] = `I[${i}][${i}] must be positive (currently ${form.inertia[i][i]}).`;
        }
      }
    }
    // Symmetry warnings (not blocking — just warn)
    const symWarnings = [];
    const tol = 1e-4;
    const pairs = [[0,1],[0,2],[1,2]];
    for (const [i, j] of pairs) {
      if (form.inertia[i] && form.inertia[j]) {
        const diff = Math.abs(Number(form.inertia[i][j]) - Number(form.inertia[j][i]));
        if (diff > tol) {
          symWarnings.push(`I[${i}][${j}]=${form.inertia[i][j]} ≠ I[${j}][${i}]=${form.inertia[j][i]} (diff=${diff.toExponential(2)})`);
        }
      }
    }
    if (symWarnings.length > 0) {
      errors._inertia_symmetry_warning = symWarnings.join("; ");
    }
  }

  // Mounts
  if (!form.mounts || form.mounts.length !== 3) {
    errors.mounts = "Exactly 3 mounts are required.";
  } else {
    form.mounts.forEach((m, idx) => {
      const prefix = `mount_${idx}`;
      ["x", "y", "z"].forEach((coord) => {
        const val = Number(m[coord]);
        if (m[coord] === "" || m[coord] === null || isNaN(val) || !isFinite(val)) {
          errors[`${prefix}_${coord}`] = `Mount ${m.name || idx+1} ${coord.toUpperCase()} must be a finite number.`;
        }
      });
      ["kx", "ky", "kz"].forEach((k) => {
        const val = Number(m[k]);
        if (m[k] === "" || m[k] === null || isNaN(val) || val <= 0) {
          errors[`${prefix}_${k}`] = `Mount ${m.name || idx+1} ${k.toUpperCase()} must be positive — zero stiffness makes K singular.`;
        }
      });
    });
  }

  return errors;
}

/**
 * Sanitizes numeric input while typing:
 * Allows empty, minus, dot, trailing dots/zeros, negative floats, and exponent notation.
 * Replaces commas with dots.
 * Returns null if the string contains invalid characters (rejecting the input).
 */
export function sanitizeNumericInput(rawVal) {
  if (rawVal === "" || rawVal === null || rawVal === undefined) return "";
  const val = String(rawVal).trim().replace(",", ".");
  if (/^-?\d*\.?\d*(?:[eE][-+]?\d*)?$/.test(val)) {
    return val;
  }
  return null;
}

export function hasBlockingErrors(errors) {
  return Object.keys(errors).some((k) => !k.startsWith("_"));
}

export function severityColor(misalignment3D) {
  if (misalignment3D < 5) return "green";
  if (misalignment3D < 15) return "yellow";
  return "red";
}
