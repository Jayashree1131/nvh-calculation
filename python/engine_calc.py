"""
engine_calc.py — JSON-in / JSON-out wrapper for Engine 6DOF NVH Dynamics.

Usage:
    python3 engine_calc.py '<json_string>'

Input JSON fields:
    mass                    : float (kg)
    cg                      : [X, Y, Z] (mm)
    inertia                 : [[3x3 matrix]] (kg*m^2)
    torque                  : float (N*mm)
    dynamic_stiffness_factor: float
    mounts                  : list of {name, x, y, z, kx, ky, kz}
    run_robustness          : bool (optional, default false)

Output: JSON printed to stdout.
Errors: JSON { "status": "error", "message": "..." } printed to stdout, exit 1.
"""

import sys
import json
import base64
import os
import tempfile
import traceback

import numpy as np
import matplotlib
matplotlib.use("Agg")  # headless — no display needed
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
from itertools import product


# ─────────────────────────────────────────────────────────────
# GEOMETRY HELPERS  (identical to original script)
# ─────────────────────────────────────────────────────────────

def vector_angle(a, b):
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-15 or nb < 1e-15:
        raise ValueError("Cannot calculate angle for a zero-length vector.")
    c = np.dot(a, b) / (na * nb)
    return float(np.degrees(np.arccos(np.clip(c, -1.0, 1.0))))


def line_angle_2d(v):
    v = np.asarray(v, dtype=float)
    if np.linalg.norm(v) < 1e-15:
        raise ValueError("2D line direction is zero.")
    a = float(np.degrees(np.arctan2(v[1], v[0])))
    return a if a >= 0.0 else a + 180.0


def line_misalignment_2d(v1, v2):
    a1 = np.asarray(v1, dtype=float)
    a2 = np.asarray(v2, dtype=float)
    if np.linalg.norm(a1) < 1e-15 or np.linalg.norm(a2) < 1e-15:
        raise ValueError("Cannot calculate 2D line misalignment from zero vector.")
    dot = abs(float(np.dot(a1, a2))) / (np.linalg.norm(a1) * np.linalg.norm(a2))
    return float(np.degrees(np.arccos(np.clip(dot, -1.0, 1.0))))


def projection_coords(p, plane):
    p = np.asarray(p, dtype=float)
    if plane == "XY":
        return np.array([p[1], p[0]])
    if plane == "YZ":
        return np.array([p[1], p[2]])
    if plane == "ZX":
        return np.array([p[0], p[2]])
    raise ValueError("Plane must be XY, YZ, or ZX.")


def projected_direction(v, plane):
    v = np.asarray(v, dtype=float)
    if plane == "XY":
        return np.array([v[1], v[0]])
    if plane == "YZ":
        return np.array([v[1], v[2]])
    if plane == "ZX":
        return np.array([v[0], v[2]])
    raise ValueError("Plane must be XY, YZ, or ZX.")


def nearest_point_on_2d_line(point_2d, line_point_2d, line_direction_2d):
    p = np.asarray(point_2d, dtype=float)
    p0 = np.asarray(line_point_2d, dtype=float)
    d = np.asarray(line_direction_2d, dtype=float)
    dd = np.dot(d, d)
    if dd < 1e-15:
        raise ValueError("Cannot find nearest point to a zero-length line direction.")
    t = np.dot(p - p0, d) / dd
    return p0 + t * d, float(t)


def line_intersection_2d(p1, d1, p2, d2, tol=1e-12):
    p1 = np.asarray(p1, dtype=float)
    p2 = np.asarray(p2, dtype=float)
    d1 = np.asarray(d1, dtype=float)
    d2 = np.asarray(d2, dtype=float)
    cross = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(cross) < tol:
        return None
    delta = p2 - p1
    t = (delta[0] * d2[1] - delta[1] * d2[0]) / cross
    return p1 + t * d1


# ─────────────────────────────────────────────────────────────
# MOUNT MATRIX
# ─────────────────────────────────────────────────────────────

def physical_mount_matrix(m):
    x, y, z = m["r"]
    Kt = np.diag([m["Kx"], m["Ky"], m["Kz"]])
    B = np.array([
        [1.0, 0.0, 0.0,  0.0,   z,  -y],
        [0.0, 1.0, 0.0,  -z,  0.0,   x],
        [0.0, 0.0, 1.0,   y,   -x, 0.0],
    ])
    Kr = np.zeros((6, 6), dtype=float)
    Kr[3:6, 3:6] = np.diag([m["Krx"], m["Kry"], m["Krz"]])
    return B.T @ Kt @ B + Kr


# ─────────────────────────────────────────────────────────────
# IMAGE ENCODING
# ─────────────────────────────────────────────────────────────

def fig_to_base64(fig):
    """Render a matplotlib figure to base64 PNG string."""
    import io
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return b64


# ─────────────────────────────────────────────────────────────
# ROBUSTNESS EVALUATOR
# ─────────────────────────────────────────────────────────────

def evaluate_stiffness_case(stiffness_values, mounts, M_inv_sqrt, M_SI, S,
                             DOF_NAMES, DYNAMIC_STIFFNESS_FACTOR):
    K_case_mm = np.zeros((6, 6), dtype=float)
    for mount_idx, m in enumerate(mounts):
        case_m = {
            "r": m["r"],
            "Kx": stiffness_values[mount_idx * 3 + 0] * DYNAMIC_STIFFNESS_FACTOR,
            "Ky": stiffness_values[mount_idx * 3 + 1] * DYNAMIC_STIFFNESS_FACTOR,
            "Kz": stiffness_values[mount_idx * 3 + 2] * DYNAMIC_STIFFNESS_FACTOR,
            "Krx": 0.0, "Kry": 0.0, "Krz": 0.0,
        }
        K_case_mm += physical_mount_matrix(case_m)

    K_case_SI = S.T @ K_case_mm @ S / 1000.0
    A_case = M_inv_sqrt @ K_case_SI @ M_inv_sqrt
    eig_case, Q_case = np.linalg.eigh(A_case)
    if np.any(eig_case <= 0.0):
        raise ValueError("Non-positive eigenvalue found in robustness study.")

    omega_case = np.sqrt(eig_case)
    freq_case = omega_case / (2.0 * np.pi)
    modes_case = M_inv_sqrt @ Q_case

    for j in range(6):
        mm = modes_case[:, j].T @ M_SI @ modes_case[:, j]
        modes_case[:, j] /= np.sqrt(mm)

    part_case = np.zeros((6, 6), dtype=float)
    for j in range(6):
        phi = modes_case[:, j]
        p = np.diag(M_SI) * phi**2
        part_case[:, j] = 100.0 * p / np.sum(p)

    idx = np.argmax(part_case, axis=0)
    purity_case = part_case[idx, np.arange(6)]
    dominant_case = [DOF_NAMES[i] for i in idx]
    return freq_case, purity_case, dominant_case, part_case


def run_exhaustive_robustness(tolerance, nominal_stiffnesses, mounts, M_inv_sqrt,
                               M_SI, S, DOF_NAMES, DYNAMIC_STIFFNESS_FACTOR,
                               ROBUSTNESS_PURITY_LIMIT=80.0):
    # Exact 512-corner robustness study (2^9 corners: lower -tol and upper +tol, ignoring nominal 0.0)
    levels = np.array([-tolerance, tolerance])
    total_cases = 0
    pass_cases = 0
    worst_min_purity = np.inf
    best_min_purity = -np.inf
    worst_case_data = None
    best_case_data = None
    purity_min = np.full(6, np.inf)
    purity_max = np.full(6, -np.inf)
    freq_min = np.full(6, np.inf)
    freq_max = np.full(6, -np.inf)

    for combo in product(levels, repeat=9):
        combo = np.asarray(combo, dtype=float)
        stiffness_case = nominal_stiffnesses * (1.0 + combo)
        freq_case, purity_case, dominant_case, _ = evaluate_stiffness_case(
            stiffness_case, mounts, M_inv_sqrt, M_SI, S, DOF_NAMES, DYNAMIC_STIFFNESS_FACTOR
        )
        total_cases += 1
        min_p = float(np.min(purity_case))
        passed = bool(np.all(purity_case >= ROBUSTNESS_PURITY_LIMIT))
        if passed:
            pass_cases += 1

        if min_p < worst_min_purity:
            worst_min_purity = min_p
            worst_case_data = {
                "perturbations_pct": (combo * 100).tolist(),
                "stiffnesses": stiffness_case.tolist(),
                "frequencies_hz": freq_case.tolist(),
                "purity_pct": purity_case.tolist(),
                "dominant_dof": dominant_case,
            }
        if min_p > best_min_purity:
            best_min_purity = min_p
            best_case_data = {
                "perturbations_pct": (combo * 100).tolist(),
                "stiffnesses": stiffness_case.tolist(),
                "frequencies_hz": freq_case.tolist(),
                "purity_pct": purity_case.tolist(),
                "dominant_dof": dominant_case,
            }

        purity_min = np.minimum(purity_min, purity_case)
        purity_max = np.maximum(purity_max, purity_case)
        freq_min = np.minimum(freq_min, freq_case)
        freq_max = np.maximum(freq_max, freq_case)

    return {
        "tolerance_pct": round(tolerance * 100),
        "total_cases": total_cases,
        "pass_cases": pass_cases,
        "fail_cases": total_cases - pass_cases,
        "pass_percentage": round(100.0 * pass_cases / total_cases, 3),
        "worst_min_purity": round(float(worst_min_purity), 4),
        "best_min_purity": round(float(best_min_purity), 4),
        "worst_case": worst_case_data,
        "best_case": best_case_data,
        "purity_min_per_mode": purity_min.tolist(),
        "purity_max_per_mode": purity_max.tolist(),
        "freq_min_hz": freq_min.tolist(),
        "freq_max_hz": freq_max.tolist(),
    }


# ─────────────────────────────────────────────────────────────
# MAIN CALCULATION
# ─────────────────────────────────────────────────────────────

def run_calculation(inputs):
    run_robustness = inputs.get("run_robustness", False)

    # ── Input extraction ──────────────────────────────────────
    MASS = float(inputs["mass"])
    CG   = np.array(inputs["cg"], dtype=float)
    I    = np.array(inputs["inertia"], dtype=float)
    TORQUE = float(inputs["torque"])
    DYNAMIC_STIFFNESS_FACTOR = float(inputs["dynamic_stiffness_factor"])
    mounts_data = inputs["mounts"]

    Y_AXIS = np.array([0.0, 1.0, 0.0], dtype=float)
    DOF_NAMES = ["Tx", "Ty", "Tz", "Rx", "Ry", "Rz"]
    TRACE_DISTANCES = np.array([400.0, 200.0, 0.0, -200.0, -400.0])
    ROBUSTNESS_PURITY_LIMIT = 80.0

    # ── 1. Inertia validation ─────────────────────────────────
    symmetry_error_I = float(np.max(np.abs(I - I.T)))
    principal_moments, principal_axes = np.linalg.eigh(I)
    I1, I2, I3 = principal_moments
    inertia_positive_definite = bool(np.all(principal_moments > 0.0))
    triangle_terms = np.array([I1 + I2 - I3, I1 + I3 - I2, I2 + I3 - I1])
    inertia_triangle_physical = bool(np.all(triangle_terms >= -1e-10))

    if not inertia_positive_definite:
        raise ValueError(
            "Inertia tensor is not positive definite. "
            f"Principal moments: {principal_moments.tolist()}. "
            "Check that the diagonal values and off-diagonal products satisfy physical constraints."
        )

    # ── 2. TRA ────────────────────────────────────────────────
    alpha = np.linalg.solve(I, Y_AXIS)
    TRA   = alpha / np.linalg.norm(alpha)
    TRA_angle_Y_deg = vector_angle(TRA, Y_AXIS)

    # ── 3. Mounts + 6×6 K matrix ─────────────────────────────
    mounts = []
    for md in mounts_data:
        r = np.array([md["x"], md["y"], md["z"]], dtype=float) - CG
        mounts.append({
            "name": md["name"],
            "abs_xyz": np.array([md["x"], md["y"], md["z"]], dtype=float),
            "r": r,
            "Kx":  md["kx"] * DYNAMIC_STIFFNESS_FACTOR,
            "Ky":  md["ky"] * DYNAMIC_STIFFNESS_FACTOR,
            "Kz":  md["kz"] * DYNAMIC_STIFFNESS_FACTOR,
            "Krx": 0.0, "Kry": 0.0, "Krz": 0.0,
        })

    K_total_mm = np.zeros((6, 6), dtype=float)
    for m in mounts:
        m["K"] = physical_mount_matrix(m)
        K_total_mm += m["K"]

    symmetry_error_K = float(np.max(np.abs(K_total_mm - K_total_mm.T)))
    K_symmetry_check = bool(np.allclose(K_total_mm, K_total_mm.T, rtol=1e-12, atol=1e-8))
    K_relative_symmetry_error = symmetry_error_K / max(np.max(np.abs(K_total_mm)), 1e-30)

    # Check K is invertible (non-singular)
    try:
        np.linalg.inv(K_total_mm)
    except np.linalg.LinAlgError:
        raise ValueError(
            "The combined mount stiffness matrix K is singular (not invertible). "
            "Check that no stiffness values are zero and the mount positions are not degenerate."
        )

    # ── 4. Static response → eTRA ─────────────────────────────
    F = np.array([0.0, 0.0, 0.0, 0.0, TORQUE, 0.0])
    q_static = np.linalg.solve(K_total_mm, F)
    u_CG  = q_static[:3]
    theta = q_static[3:6]
    theta_norm = np.linalg.norm(theta)
    if theta_norm < 1e-15:
        raise ValueError(
            "Rotational response is too small to define eTRA. "
            "Check that the mount stiffness allows rotation (Ky / Kz stiffness not too large)."
        )

    eTRA = theta / theta_norm
    eTRA_angle_Y_deg = vector_angle(eTRA, Y_AXIS)

    # ── 5. True 3D eTRA nearest point ────────────────────────
    eTRA_offset_from_CG = np.cross(theta, u_CG) / theta_norm**2
    eTRA_nearest_point  = CG + eTRA_offset_from_CG
    distance_CG_to_eTRA_mm = float(np.linalg.norm(eTRA_offset_from_CG))
    nearest_offset_parallel = float(np.dot(eTRA_offset_from_CG, eTRA))
    u_at_near = u_CG + np.cross(theta, eTRA_offset_from_CG)
    nearest_axis_cross_check = float(np.linalg.norm(np.cross(u_at_near, eTRA)))

    # ── 6. 3D + projected misalignment ───────────────────────
    TRA_eTRA_3D_deg = vector_angle(TRA, eTRA)

    plane_defs = {
        "XY": {"title": "XY Projection (Y horiz, X vert)", "xlabel": "Y [mm]", "ylabel": "X [mm]"},
        "YZ": {"title": "YZ Projection (Y horiz, Z vert)", "xlabel": "Y [mm]", "ylabel": "Z [mm]"},
        "ZX": {"title": "ZX Projection (X horiz, Z vert)", "xlabel": "X [mm]", "ylabel": "Z [mm]"},
    }

    projected_results = {}
    for plane in ["XY", "YZ", "ZX"]:
        cg2   = projection_coords(CG, plane)
        near2 = projection_coords(eTRA_nearest_point, plane)
        dT2   = projected_direction(TRA, plane)
        dE2   = projected_direction(eTRA, plane)

        angle_deg    = line_misalignment_2d(dT2, dE2)
        intersection = line_intersection_2d(cg2, dT2, near2, dE2)
        near_proj, t_near = nearest_point_on_2d_line(cg2, near2, dE2)
        proj_dist = float(np.linalg.norm(cg2 - near_proj))

        projected_results[plane] = {
            "misalignment_deg": round(angle_deg, 6),
            "nearest_distance_mm": round(proj_dist, 4),
            "nearest_point_2d": near_proj.tolist(),
            "intersection_2d": intersection.tolist() if intersection is not None else None,
            "tra_line_angle_deg": round(line_angle_2d(dT2), 6),
            "etra_line_angle_deg": round(line_angle_2d(dE2), 6),
            "_cg2": cg2.tolist(),
            "_etra_base2": near2.tolist(),
            "_tra_dir2": dT2.tolist(),
            "_etra_dir2": dE2.tolist(),
        }

    # ── 7. Modal analysis ─────────────────────────────────────
    S = np.diag([1000.0, 1000.0, 1000.0, 1.0, 1.0, 1.0])
    K_SI = S.T @ K_total_mm @ S / 1000.0

    M_SI = np.zeros((6, 6), dtype=float)
    M_SI[:3, :3] = MASS * np.eye(3)
    M_SI[3:6, 3:6] = I

    M_eigvals, M_eigvecs = np.linalg.eigh(M_SI)
    if np.any(M_eigvals <= 0.0):
        raise ValueError("Mass/inertia matrix is not positive definite.")
    M_inv_sqrt = M_eigvecs @ np.diag(1.0 / np.sqrt(M_eigvals)) @ M_eigvecs.T

    A = M_inv_sqrt @ K_SI @ M_inv_sqrt
    eigvals, eigvecs_mn = np.linalg.eigh(A)
    if np.any(eigvals <= 0.0):
        raise ValueError(
            "Non-positive modal eigenvalue found. "
            "This usually means the stiffness matrix is near-singular or the mount configuration is degenerate."
        )

    omega = np.sqrt(eigvals)
    frequencies_hz = omega / (2.0 * np.pi)
    modes = M_inv_sqrt @ eigvecs_mn
    for i in range(6):
        mm = modes[:, i].T @ M_SI @ modes[:, i]
        modes[:, i] /= np.sqrt(mm)

    DOF_participation = np.zeros((6, 6), dtype=float)
    for j in range(6):
        phi = modes[:, j]
        p = np.diag(M_SI) * phi**2
        DOF_participation[:, j] = 100.0 * p / np.sum(p)

    purity_index   = np.argmax(DOF_participation, axis=0)
    purity_percent = DOF_participation[purity_index, np.arange(6)]
    purity_dof     = [DOF_NAMES[i] for i in purity_index]

    modal_table = []
    for j in range(6):
        vals = DOF_participation[:, j]
        modal_table.append({
            "mode": j + 1,
            "frequency_hz": round(float(frequencies_hz[j]), 6),
            "Tx_pct": round(float(vals[0]), 4),
            "Ty_pct": round(float(vals[1]), 4),
            "Tz_pct": round(float(vals[2]), 4),
            "Rx_pct": round(float(vals[3]), 4),
            "Ry_pct": round(float(vals[4]), 4),
            "Rz_pct": round(float(vals[5]), 4),
            "dominant_dof": purity_dof[j],
            "purity_pct": round(float(purity_percent[j]), 4),
            "pass": bool(purity_percent[j] >= ROBUSTNESS_PURITY_LIMIT),
        })

    all_modes_pass = bool(np.all(purity_percent >= ROBUSTNESS_PURITY_LIMIT))

    # ── 8. TRA/eTRA traces (for plots) ────────────────────────
    TRA_trace  = np.array([CG + d * TRA for d in TRACE_DISTANCES])
    eTRA_trace = np.array([eTRA_nearest_point + d * eTRA for d in TRACE_DISTANCES])

    # ── 9. Plots ──────────────────────────────────────────────
    plot_3d_b64        = _make_3d_plot(CG, TRA_trace, eTRA_trace, eTRA_nearest_point,
                                       distance_CG_to_eTRA_mm, mounts, TRACE_DISTANCES)
    plot_projected_b64 = _make_projected_plot(CG, TRA_trace, eTRA_trace,
                                              projected_results, plane_defs,
                                              mounts, TRACE_DISTANCES)
    plot_yz_b64        = _make_single_plane_plot("YZ", CG, TRA_trace, eTRA_trace,
                                                 projected_results, plane_defs,
                                                 mounts, TRACE_DISTANCES)
    plot_xy_b64        = _make_single_plane_plot("XY", CG, TRA_trace, eTRA_trace,
                                                 projected_results, plane_defs,
                                                 mounts, TRACE_DISTANCES)
    plot_zx_b64        = _make_single_plane_plot("ZX", CG, TRA_trace, eTRA_trace,
                                                 projected_results, plane_defs,
                                                 mounts, TRACE_DISTANCES)

    # ── 10. Robustness (on-demand) ────────────────────────────
    robustness_results = None
    if run_robustness:
        nominal_stiffnesses = np.array([
            mounts_data[0]["kx"], mounts_data[0]["ky"], mounts_data[0]["kz"],
            mounts_data[1]["kx"], mounts_data[1]["ky"], mounts_data[1]["kz"],
            mounts_data[2]["kx"], mounts_data[2]["ky"], mounts_data[2]["kz"],
        ], dtype=float)
        robustness_results = []
        for tol in [0.05, 0.10, 0.15]:
            robustness_results.append(
                run_exhaustive_robustness(
                    tol, nominal_stiffnesses, mounts, M_inv_sqrt, M_SI,
                    S, DOF_NAMES, DYNAMIC_STIFFNESS_FACTOR, ROBUSTNESS_PURITY_LIMIT
                )
            )

    # ── Assemble result ───────────────────────────────────────
    return {
        "status": "ok",
        "inertia_validation": {
            "symmetry_error": round(symmetry_error_I, 8),
            "positive_definite": inertia_positive_definite,
            "principal_moments_kg_m2": principal_moments.tolist(),
            "principal_axes": principal_axes.tolist(),
            "triangle_terms": triangle_terms.tolist(),
            "triangle_ok": inertia_triangle_physical,
            "determinant": round(float(np.linalg.det(I)), 6),
            "inertia_tensor_input": np.round(I, 6).tolist(),
            "diagonal_elements": [round(float(I[0,0]),6), round(float(I[1,1]),6), round(float(I[2,2]),6)],
            "off_diagonal_elements": {
                "Ixy": round(float(I[0,1]),6), "Ixz": round(float(I[0,2]),6),
                "Iyz": round(float(I[1,2]),6),
            },
        },
        "K_matrix_validation": {
            "symmetry_error": round(symmetry_error_K, 8),
            "relative_symmetry_error": round(float(K_relative_symmetry_error), 10),
            "symmetric": K_symmetry_check,
            "K_matrix_6x6": np.round(K_total_mm, 2).tolist(),
        },
        "tra": {
            "vector": TRA.tolist(),
            "angle_from_Y_deg": round(TRA_angle_Y_deg, 6),
        },
        "eTRA": {
            "vector": eTRA.tolist(),
            "angle_from_Y_deg": round(eTRA_angle_Y_deg, 6),
        },
        "misalignment_3D_deg": round(TRA_eTRA_3D_deg, 6),
        "cg_to_eTRA_offset_mm": round(distance_CG_to_eTRA_mm, 6),
        "eTRA_nearest_point_mm": eTRA_nearest_point.tolist(),
        "nearest_offset_parallel_component": round(nearest_offset_parallel, 8),
        "nearest_axis_cross_check": round(nearest_axis_cross_check, 8),
        "projected": projected_results,
        "modal_table": modal_table,
        "all_modes_pass_80pct": all_modes_pass,
        "robustness": robustness_results,
        "plots": {
            "plot_3d_base64": plot_3d_b64,
            "plot_projected_base64": plot_projected_b64,
            "plot_yz_base64": plot_yz_b64,
            "plot_xy_base64": plot_xy_b64,
            "plot_zx_base64": plot_zx_b64,
        },
        "inputs_echo": {
            "mass": MASS,
            "cg": CG.tolist(),
            "torque": TORQUE,
            "dynamic_stiffness_factor": DYNAMIC_STIFFNESS_FACTOR,
        },
    }


# ─────────────────────────────────────────────────────────────
# PLOT GENERATORS
# ─────────────────────────────────────────────────────────────

def _make_3d_plot(CG, TRA_trace, eTRA_trace, eTRA_nearest_point,
                  distance_CG_to_eTRA_mm, mounts, TRACE_DISTANCES):
    fig = plt.figure(figsize=(10, 8), facecolor="#1a1a2e")
    ax  = fig.add_subplot(111, projection="3d")
    ax.set_facecolor("#16213e")

    ax.plot(TRA_trace[:, 0], TRA_trace[:, 1], TRA_trace[:, 2],
            "o-", linewidth=2.5, color="#4cc9f0", label="TRA", zorder=3)
    ax.plot(eTRA_trace[:, 0], eTRA_trace[:, 1], eTRA_trace[:, 2],
            "o--", linewidth=2.5, color="#f72585", label="eTRA", zorder=3)

    ax.scatter(*CG, s=90, color="#ffbe0b", label="Engine CG", zorder=5)
    ax.scatter(*eTRA_nearest_point, s=90, color="#fb5607", label="3D eTRA nearest pt", zorder=5)

    mount_colors = {"M1": "#06d6a0", "M2": "#8338ec", "M3": "#ff9f1c"}
    for m in mounts:
        col = mount_colors.get(m["name"], "#cccccc")
        ax.scatter(m["abs_xyz"][0], m["abs_xyz"][1], m["abs_xyz"][2],
                   s=100, marker="^", color=col, label=m["name"], zorder=6)
        ax.text(m["abs_xyz"][0], m["abs_xyz"][1], m["abs_xyz"][2],
                f"  {m['name']}", fontsize=9, color=col)

    ax.plot([CG[0], eTRA_nearest_point[0]],
            [CG[1], eTRA_nearest_point[1]],
            [CG[2], eTRA_nearest_point[2]],
            linestyle=":", linewidth=2, color="#aaaaaa",
            label=f"3D offset = {distance_CG_to_eTRA_mm:.1f} mm")

    for i, s in enumerate(TRACE_DISTANCES):
        ax.text(TRA_trace[i, 0], TRA_trace[i, 1], TRA_trace[i, 2],
                f" TRA {s:+.0f}", fontsize=7.5, color="#4cc9f0")
        ax.text(eTRA_trace[i, 0], eTRA_trace[i, 1], eTRA_trace[i, 2],
                f" eTRA {s:+.0f}", fontsize=7.5, color="#f72585")

    for spine in ["left", "right", "bottom", "top"]:
        ax.spines[spine].set_color("#444") if hasattr(ax.spines, spine) else None

    ax.xaxis.pane.fill = False
    ax.yaxis.pane.fill = False
    ax.zaxis.pane.fill = False
    ax.tick_params(colors="#cccccc")
    ax.xaxis.label.set_color("#cccccc")
    ax.yaxis.label.set_color("#cccccc")
    ax.zaxis.label.set_color("#cccccc")
    ax.set_xlabel("X [mm]")
    ax.set_ylabel("Y [mm]")
    ax.set_zlabel("Z [mm]")
    ax.set_title("3D TRA / eTRA Geometry with Mount Positions",
                 color="#e0e0e0", fontsize=13, pad=12)
    ax.legend(facecolor="#1a1a2e", edgecolor="#555", labelcolor="#e0e0e0",
              fontsize=9, loc="best")

    # Tight bounding box framing around engine assembly
    all_3d = np.vstack([TRA_trace, eTRA_trace, [CG], [eTRA_nearest_point], [m["abs_xyz"] for m in mounts]])
    x_min, y_min, z_min = np.min(all_3d, axis=0)
    x_max, y_max, z_max = np.max(all_3d, axis=0)
    max_range = max(x_max - x_min, y_max - y_min, z_max - z_min) * 0.55
    mid_x = (x_max + x_min) * 0.5
    mid_y = (y_max + y_min) * 0.5
    mid_z = (z_max + z_min) * 0.5
    ax.set_xlim(mid_x - max_range, mid_x + max_range)
    ax.set_ylim(mid_y - max_range, mid_y + max_range)
    ax.set_zlim(mid_z - max_range, mid_z + max_range)

    fig.tight_layout()
    return fig_to_base64(fig)


def _make_projected_plot(CG, TRA_trace, eTRA_trace, projected_results,
                         plane_defs, mounts, TRACE_DISTANCES):
    fig, axes = plt.subplots(1, 3, figsize=(18, 6), facecolor="#1a1a2e")
    fig.patch.set_facecolor("#1a1a2e")

    mount_colors  = {"M1": "#06d6a0", "M2": "#8338ec", "M3": "#ff9f1c"}
    mount_markers = {"M1": "^", "M2": "s", "M3": "D"}

    for ax, plane in zip(axes, ["XY", "YZ", "ZX"]):
        ax.set_facecolor("#16213e")
        cfg = plane_defs[plane]
        r   = projected_results[plane]

        tr2 = np.array([projection_coords(p, plane) for p in TRA_trace])
        et2 = np.array([projection_coords(p, plane) for p in eTRA_trace])

        ax.plot(tr2[:, 0], tr2[:, 1], "o-",  lw=2.5, color="#4cc9f0", label="TRA")
        ax.plot(et2[:, 0], et2[:, 1], "o--", lw=2.5, color="#f72585", label="eTRA")

        cg2   = np.array(r["_cg2"])
        near2 = np.array(r["nearest_point_2d"])

        ax.scatter(*cg2, s=80,  color="#ffbe0b",  label="Proj. CG",       zorder=4)
        ax.scatter(*near2, s=80, color="#fb5607",  label="Proj. nearest",  zorder=4)

        for m in mounts:
            mp  = projection_coords(m["abs_xyz"], plane)
            col = mount_colors.get(m["name"], "#ccc")
            ax.scatter(mp[0], mp[1], s=90, marker=mount_markers.get(m["name"], "o"),
                       color=col, label=m["name"], zorder=6)
            ax.annotate(m["name"], mp, xytext=(5, -10),
                        textcoords="offset points", fontsize=8, fontweight="bold", color=col)

        # Bounding box strictly around physical engine components
        all_pts = np.vstack([
            tr2,
            et2,
            [cg2],
            [near2],
            [projection_coords(m["abs_xyz"], plane) for m in mounts]
        ])
        x_min, y_min = np.min(all_pts, axis=0)
        x_max, y_max = np.max(all_pts, axis=0)
        x_span = max(80.0, x_max - x_min)
        y_span = max(80.0, y_max - y_min)
        x_pad = max(40.0, x_span * 0.18)
        y_pad = max(40.0, y_span * 0.18)
        xlim = (x_min - x_pad, x_max + x_pad)
        ylim = (y_min - y_pad, y_max + y_pad)

        if r["intersection_2d"] is not None:
            pt = np.array(r["intersection_2d"])
            if (xlim[0] <= pt[0] <= xlim[1]) and (ylim[0] <= pt[1] <= ylim[1]):
                ax.scatter(*pt, s=90, marker="x", linewidths=2.5,
                           color="#ffffff", label="Intersection", zorder=5)

        ax.plot([cg2[0], near2[0]], [cg2[1], near2[1]],
                linestyle=":", lw=1.8, color="#aaaaaa",
                label=f"Nearest offset = {r['nearest_distance_mm']:.1f} mm")

        angle     = r["misalignment_deg"]
        inter_txt = "Lines intersect" if r["intersection_2d"] is not None else "Lines parallel/coincident"
        ax.text(0.03, 0.97,
                f"Proj. misalignment = {angle:.2f}°\n{inter_txt}",
                transform=ax.transAxes, va="top", fontsize=9, color="#e0e0e0",
                bbox=dict(boxstyle="round,pad=0.35", facecolor="#0f3460", alpha=0.85, edgecolor="#555"))

        for i, s in enumerate(TRACE_DISTANCES):
            ax.annotate(f"{s:+.0f}", tr2[i], xytext=(4, 4),
                        textcoords="offset points", fontsize=7.5, color="#4cc9f0")

        ax.set_title(cfg["title"], color="#e0e0e0", fontsize=11)
        ax.set_xlabel(cfg["xlabel"], color="#aaaaaa")
        ax.set_ylabel(cfg["ylabel"], color="#aaaaaa")
        ax.tick_params(colors="#888888")
        ax.grid(True, alpha=0.15, color="#555")
        ax.legend(facecolor="#1a1a2e", edgecolor="#555", labelcolor="#e0e0e0",
                  fontsize=7.5, loc="best")
        ax.set_xlim(xlim)
        ax.set_ylim(ylim)
        ax.set_aspect("equal", adjustable="box")
        for sp in ax.spines.values():
            sp.set_edgecolor("#444")

    fig.suptitle("TRA / eTRA Projected Geometry with All Mount Positions",
                 fontsize=14, fontweight="bold", color="#e0e0e0")
    fig.tight_layout()
    return fig_to_base64(fig)


def _make_single_plane_plot(plane, CG, TRA_trace, eTRA_trace, projected_results,
                            plane_defs, mounts, TRACE_DISTANCES):
    """Generate a high-res, responsive single-plane projection plot (YZ, XY, or ZX)."""
    fig, ax = plt.subplots(1, 1, figsize=(10, 7), dpi=130, facecolor="#1a1a2e")
    fig.patch.set_facecolor("#1a1a2e")
    ax.set_facecolor("#16213e")

    cfg = plane_defs[plane]
    r   = projected_results[plane]

    mount_colors  = {"M1": "#06d6a0", "M2": "#8338ec", "M3": "#ff9f1c"}
    mount_markers = {"M1": "^", "M2": "s", "M3": "D"}

    tr2 = np.array([projection_coords(p, plane) for p in TRA_trace])
    et2 = np.array([projection_coords(p, plane) for p in eTRA_trace])

    ax.plot(tr2[:, 0], tr2[:, 1], "o-",  lw=2.8, color="#4cc9f0", label="TRA")
    ax.plot(et2[:, 0], et2[:, 1], "o--", lw=2.8, color="#f72585", label="eTRA")

    cg2   = np.array(r["_cg2"])
    near2 = np.array(r["nearest_point_2d"])

    ax.scatter(*cg2, s=95, color="#ffbe0b", label="Engine CG", zorder=4)
    ax.scatter(*near2, s=95, color="#fb5607", label="eTRA Nearest Point", zorder=4)

    for m in mounts:
        mp  = projection_coords(m["abs_xyz"], plane)
        col = mount_colors.get(m["name"], "#ccc")
        ax.scatter(mp[0], mp[1], s=110, marker=mount_markers.get(m["name"], "o"),
                   color=col, label=m["name"], zorder=6)
        ax.annotate(m["name"], mp, xytext=(7, -10),
                    textcoords="offset points", fontsize=9, fontweight="bold", color=col)

        # Bounding box strictly around physical engine components
        all_pts = np.vstack([
            tr2,
            et2,
            [cg2],
            [near2],
            [projection_coords(m["abs_xyz"], plane) for m in mounts]
        ])
        x_min, y_min = np.min(all_pts, axis=0)
        x_max, y_max = np.max(all_pts, axis=0)
        x_span = max(80.0, x_max - x_min)
        y_span = max(80.0, y_max - y_min)
        x_pad = max(40.0, x_span * 0.18)
        y_pad = max(40.0, y_span * 0.18)
        xlim = (x_min - x_pad, x_max + x_pad)
        ylim = (y_min - y_pad, y_max + y_pad)

        if r["intersection_2d"] is not None:
            pt = np.array(r["intersection_2d"])
            if (xlim[0] <= pt[0] <= xlim[1]) and (ylim[0] <= pt[1] <= ylim[1]):
                ax.scatter(*pt, s=110, marker="x", linewidths=2.5,
                           color="#ffffff", label="Intersection", zorder=5)

        ax.plot([cg2[0], near2[0]], [cg2[1], near2[1]],
                linestyle=":", lw=2.0, color="#aaaaaa",
                label=f"Nearest offset = {r['nearest_distance_mm']:.1f} mm")

        angle     = r["misalignment_deg"]
        inter_txt = "Lines intersect" if r["intersection_2d"] is not None else "Lines parallel/coincident"
        ax.text(0.03, 0.96,
                f"{cfg['title']} Alignment\nMisalignment = {angle:.3f}°\n{inter_txt}\nOffset from CG = {r['nearest_distance_mm']:.1f} mm",
                transform=ax.transAxes, va="top", fontsize=9.5, color="#e0e0e0",
                bbox=dict(boxstyle="round,pad=0.45", facecolor="#0f3460", alpha=0.9, edgecolor="#555"))

        for i, s in enumerate(TRACE_DISTANCES):
            ax.annotate(f"{s:+.0f}", tr2[i], xytext=(5, 5),
                        textcoords="offset points", fontsize=8, color="#4cc9f0")

        ax.set_title(f"{cfg['title']} Projection — TRA vs eTRA Trajectory",
                     color="#e0e0e0", fontsize=12, fontweight="bold", pad=12)
        ax.set_xlabel(cfg["xlabel"], color="#cccccc", fontsize=10)
        ax.set_ylabel(cfg["ylabel"], color="#cccccc", fontsize=10)
        ax.tick_params(colors="#aaaaaa")
        ax.grid(True, alpha=0.18, color="#444")
        ax.legend(facecolor="#1a1a2e", edgecolor="#555", labelcolor="#e0e0e0",
                  fontsize=9, loc="best")
        ax.set_xlim(xlim)
        ax.set_ylim(ylim)
        ax.set_aspect("equal", adjustable="box")
        for sp in ax.spines.values():
            sp.set_edgecolor("#555")

    fig.tight_layout()
    return fig_to_base64(fig)


# ─────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        out = {"status": "error", "message": "No input JSON provided. Pass JSON as first argument."}
        print(json.dumps(out))
        sys.exit(1)

    try:
        inputs = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        out = {"status": "error", "message": f"Invalid JSON input: {e}"}
        print(json.dumps(out))
        sys.exit(1)

    try:
        result = run_calculation(inputs)
        print(json.dumps(result))
        sys.exit(0)
    except Exception as e:
        tb = traceback.format_exc()
        out = {"status": "error", "message": str(e), "traceback": tb}
        print(json.dumps(out))
        sys.exit(1)
