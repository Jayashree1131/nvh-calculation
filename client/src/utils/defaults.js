export const DEFAULTS = {
  mass: 110.5,
  cg: [2349.47, -40.89, 138.59],
  inertia: [
    [3.932, 1.371, -0.848],
    [1.371, 1.924, 0.149],
    [-0.848, 0.149, 5.237],
  ],
  torque: 1000.0,
  dynamic_stiffness_factor: 1.30,
  mounts: [
    {
      name: "LH_MOUNT",
      x: 2362.4,
      y: 395.0,
      z: 279.0,
      kx: 77.0,
      ky: 26.0,
      kz: 96.0,
      roll: 0.0,
      pitch: 0.0,
      yaw: 0.0,
    },
    {
      name: "RH_MOUNT",
      x: 2337.8,
      y: -481.0,
      z: 280.0,
      kx: 96.0,
      ky: 26.0,
      kz: 77.0,
      roll: 0.0,
      pitch: 0.0,
      yaw: 0.0,
    },
    {
      name: "RR_MOUNT",
      x: 2000.0,
      y: -50.0,
      z: -100.0,
      kx: 100.0,
      ky: 100.0,
      kz: 100.0,
      roll: 0.0,
      pitch: 0.0,
      yaw: 0.0,
    },
  ],
};

export function getDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}
