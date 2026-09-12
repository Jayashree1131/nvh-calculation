export const DEFAULTS = {
  mass: 117.2,
  cg: [2371.09, -28.66, 131.61],
  inertia: [
    [4.583, 0.61, -0.019],
    [0.61, 1.955, 0.066],
    [-0.019, 0.066, 5.507],
  ],
  torque: 1000.0,
  dynamic_stiffness_factor: 1.3,
  mounts: [
    {
      name: "M1 (LH)",
      x: 2318.519,
      y: 282.7,
      z: 108.843,
      kx: 205.72,
      ky: 90.759,
      kz: 411.44,
      roll: 0.0,
      pitch: 0.0,
      yaw: 0.0,
    },
    {
      name: "M2 (RH)",
      x: 2127.287,
      y: -172.5,
      z: 173.467,
      kx: 246.372,
      ky: 110.021,
      kz: 413.791,
      roll: 0.0,
      pitch: 0.0,
      yaw: 0.0,
    },
    {
      name: "M3 (RR)",
      x: 2583.0,
      y: -191.195,
      z: 42.137,
      kx: 115.856,
      ky: 231.712,
      kz: 463.424,
      roll: 0.0,
      pitch: 0.0,
      yaw: 0.0,
    },
  ],
};

export function getDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}
