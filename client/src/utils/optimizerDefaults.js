export const OPTIMIZER_DEFAULTS = {
  engine: {
    mass: 117.2,
    cg: [2371.09, -28.66, 131.61],
    inertia: [
      [4.583, 0.61, -0.019],
      [0.61, 1.955, 0.066],
      [-0.019, 0.066, 5.507],
    ],
    crank_axis: [0.0, 1.0, 0.0],
    dynamic_stiffness_factor: 1.30,
  },
  targets: {
    freq_min_hz: 5.0,
    freq_max_hz: 30.0,
    purity_min_pct: 85.0,
    purity_target_pct: 90.0,
    mode_12_gap_min_hz: 1.5,
    other_gap_min_hz: 2.0,
    tra_etra_target_deg: 1.0,
  },
  robustness: {
    purity_min_pct: 80.0,
    tolerances_pct: [5.0, 10.0, 15.0],
    random_cases: 600,
    random_seed: 260912,
  },
  mounts: [
    {
      name: "M1",
      position_limits: {
        X: [2160.0, 2350.0],
        Y: [282.7, 282.7],
        Z: [200.0, 200.0],
      },
      axis_options: ["Y"],
      baseline_stiffness: [180.0, 73.0, 320.0],
    },
    {
      name: "M2",
      position_limits: {
        X: [2100.0, 2145.0],
        Y: [-172.5, -172.5],
        Z: [45.0, 60.0],
      },
      axis_options: ["Y"],
      baseline_stiffness: [240.0, 120.0, 480.0],
    },
    {
      name: "M3",
      position_limits: {
        X: [2583.0, 2583.0],
        Y: [-260.0, -175.2],
        Z: [45.0, 45.0],
      },
      axis_options: ["X"],
      baseline_stiffness: [73.0, 180.0, 320.0],
    },
  ],
  manufacturing: {
    void_solid_min: 0.50,
    void_solid_max: 0.60,
    void_solid_over_axial_min: 6.0,
    void_solid_over_axial_max: 6.8,
  },
  optimizer: {
    proposals_per_case: 5,
    max_iter: 10,
    pop_size: 4,
    stiffness_fraction: 0.50,
    enabled_cases: [1, 2, 3, 4, 5, 6],
  },
  tra_path_stations_mm: [400.0, 200.0, 0.0, -200.0, -400.0],
};

export function getOptimizerDefaults() {
  return JSON.parse(JSON.stringify(OPTIMIZER_DEFAULTS));
}
