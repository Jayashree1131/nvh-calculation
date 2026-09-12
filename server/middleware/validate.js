const Joi = require("joi");

// Reusable sub-schemas
const mountSchema = Joi.object({
  name: Joi.string().required(),
  x: Joi.number().required(),
  y: Joi.number().required(),
  z: Joi.number().required(),
  kx: Joi.number().positive().required().messages({
    "number.positive": "Mount {{#label}} Kx must be positive (> 0) — zero stiffness makes the K matrix singular.",
  }),
  ky: Joi.number().positive().required().messages({
    "number.positive": "Mount {{#label}} Ky must be positive (> 0) — zero stiffness makes the K matrix singular.",
  }),
  kz: Joi.number().positive().required().messages({
    "number.positive": "Mount {{#label}} Kz must be positive (> 0) — zero stiffness makes the K matrix singular.",
  }),
  roll: Joi.number().optional().default(0),
  pitch: Joi.number().optional().default(0),
  yaw: Joi.number().optional().default(0),
  _id: Joi.any().optional(),
  id: Joi.any().optional(),
}).unknown(true);

const inertiaRowSchema = Joi.array().items(Joi.number()).length(3);

const calculateSchema = Joi.object({
  label: Joi.string().allow("").optional(),
  mass: Joi.number().positive().required().messages({
    "number.positive": "Mass must be a positive number (> 0 kg).",
    "any.required": "Mass is required.",
  }),

  cg: Joi.array()
    .items(Joi.number())
    .length(3)
    .required()
    .messages({
      "array.length": "CG must have exactly 3 coordinates [X, Y, Z].",
      "any.required": "Center of gravity (CG) is required.",
    }),

  inertia: Joi.array()
    .items(inertiaRowSchema)
    .length(3)
    .required()
    .messages({
      "array.length": "Inertia tensor must be a 3×3 matrix.",
    })
    .custom((matrix, helpers) => {
      // Symmetry check
      const tol = 1e-4;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (Math.abs(matrix[i][j] - matrix[j][i]) > tol) {
            return helpers.error("any.invalid", {
              message: `Inertia tensor is not symmetric: I[${i}][${j}]=${matrix[i][j]} vs I[${j}][${i}]=${matrix[j][i]}.`,
            });
          }
        }
      }
      // Positive diagonal check (necessary, not sufficient for PD)
      for (let i = 0; i < 3; i++) {
        if (matrix[i][i] <= 0) {
          return helpers.error("any.invalid", {
            message: `Diagonal element I[${i}][${i}]=${matrix[i][i]} must be positive.`,
          });
        }
      }
      return matrix;
    }),

  torque: Joi.number().positive().required().messages({
    "number.positive": "Torque must be positive — eTRA cannot be defined for zero torque.",
  }),

  dynamic_stiffness_factor: Joi.number().min(1.0).max(3.0).required().messages({
    "number.min": "Dynamic stiffness factor must be ≥ 1.0.",
    "number.max": "Dynamic stiffness factor must be ≤ 3.0 (values above 3× are physically unrealistic).",
  }),

  mounts: Joi.array().items(mountSchema).min(2).required().messages({
    "array.min": "At least 2 mounts are required.",
  }),

  run_robustness: Joi.boolean().default(false),
  _id: Joi.any().optional(),
  id: Joi.any().optional(),
  calculation_id: Joi.any().optional(),
  createdAt: Joi.any().optional(),
  updatedAt: Joi.any().optional(),
  __v: Joi.any().optional(),
}).unknown(true);

/**
 * Express middleware factory.
 * Usage: router.post("/", validate(calculateSchema), handler)
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      convert: true,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join("."),
        message: d.message,
      }));
      return res.status(400).json({
        status: "validation_error",
        errors: details,
      });
    }

    req.validatedBody = value;
    next();
  };
}

module.exports = { validate, calculateSchema };
