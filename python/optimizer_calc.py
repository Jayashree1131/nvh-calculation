"""
optimizer_calc.py — JSON-in / JSON-out wrapper for the 6-case engine mount optimizer.

Usage:
    python3 optimizer_calc.py '<json_string>'

Input JSON fields (all required unless noted):
    engine:
        mass                  : float (kg)
        cg                    : [X, Y, Z] (mm)
        inertia               : [[3x3]] (kg*m^2)
        crank_axis            : [dx, dy, dz]  default [0,1,0]
        dynamic_stiffness_factor : float       default 1.30

    targets:
        freq_min_hz           : float  default 5.0
        freq_max_hz           : float  default 30.0
        purity_min_pct        : float  default 85.0
        purity_target_pct     : float  default 90.0
        mode_12_gap_min_hz    : float  default 1.5
        other_gap_min_hz      : float  default 2.0
        tra_etra_target_deg   : float  default 1.0

    robustness:
        purity_min_pct        : float  default 80.0
        tolerances_pct        : [5,10,15]
        random_cases          : int    default 600
        random_seed           : int    default 260912

    mounts:                   list of 3 objects {
        name                  : "M1"|"M2"|"M3"
        position_limits       : { X:[lo,hi], Y:[lo,hi], Z:[lo,hi] }
        axis_options          : ["Y"] or ["X","Y"] etc.
        baseline_stiffness    : [Kx, Ky, Kz]  (N/mm)
    }

    manufacturing:
        void_solid_min        : float  default 0.50
        void_solid_max        : float  default 0.60
        void_solid_over_axial_min : float  default 6.0
        void_solid_over_axial_max : float  default 6.8

    optimizer:
        proposals_per_case    : int    default 5
        max_iter              : int    default 10
        pop_size              : int    default 4
        stiffness_fraction    : float  default 0.50
        enabled_cases         : [1,2,3,4,5,6]  default all

    tra_path_stations_mm      : list of floats  default [400,200,0,-200,-400]

Progress lines are printed to stderr:  PROGRESS:<json>
Final JSON result is printed to stdout.
Errors: JSON { "status": "error", "message": "..." } printed to stdout, exit 1.
"""

import sys
import json
import math
import traceback

import numpy as np
from dataclasses import dataclass
from scipy.optimize import differential_evolution


# ============================================================
#                   PROGRESS HELPER
# ============================================================

def emit_progress(msg, case=None, total_cases=6, pct=None):
    obj = {"message": msg}
    if case is not None:
        obj["case"] = case
        obj["total_cases"] = total_cases
    if pct is not None:
        obj["pct"] = pct
    print(f"PROGRESS:{json.dumps(obj)}", file=sys.stderr, flush=True)


# ============================================================
#                   DATA CLASSES
# ============================================================

@dataclass
class Mount:
    name: str
    xyz: np.ndarray
    k: np.ndarray
    axis: str


@dataclass
class Proposal:
    name: str
    mounts: list


# ============================================================
#               PHYSICAL MODEL  (identical to reference script)
# ============================================================

def normalize(v):
    v = np.asarray(v, dtype=float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-15 else np.zeros_like(v)


def B_matrix(r_mm):
    x, y, z = r_mm
    return np.array([
        [1., 0., 0.,  0.,  z, -y],
        [0., 1., 0., -z,  0.,  x],
        [0., 0., 1.,  y, -x, 0.],
    ])


def mount_global_stiffness(mount, CG):
    r = mount.xyz - CG
    B = B_matrix(r)
    Kt = np.diag(mount.k)
    return B.T @ Kt @ B


def total_static_stiffness(proposal, CG):
    K = np.zeros((6, 6))
    for m in proposal.mounts:
        K += mount_global_stiffness(m, CG)
    return K


# ============================================================
#                    MODAL ANALYSIS
# ============================================================

def modal_analysis(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR):
    K_static = total_static_stiffness(proposal, CG)
    K_dyn = DYNAMIC_FACTOR * K_static

    S = np.diag([1000., 1000., 1000., 1., 1., 1.])
    K_si = S.T @ K_dyn @ S / 1000.0

    M = np.zeros((6, 6))
    M[:3, :3] = MASS * np.eye(3)
    M[3:, 3:] = INERTIA / 1e6

    L = np.linalg.cholesky(M)
    A = np.linalg.solve(L, K_si)
    A = np.linalg.solve(L.T, A.T).T
    A = (A + A.T) / 2.0

    eigenvalues, V = np.linalg.eigh(A)
    eigenvalues = np.maximum(eigenvalues, 0.0)
    order = np.argsort(eigenvalues)
    eigenvalues = eigenvalues[order]
    V = V[:, order]

    phi = np.linalg.solve(L.T, V)
    omega = np.sqrt(eigenvalues)
    freq = omega / (2.0 * np.pi)

    for i in range(6):
        gm = phi[:, i].T @ M @ phi[:, i]
        if gm > 1e-20:
            phi[:, i] /= np.sqrt(gm)

    DOF_NAMES = ["Tx", "Ty", "Tz", "Rx", "Ry", "Rz"]
    energy_matrix = np.zeros((6, 6))
    for mode in range(6):
        q = phi[:, mode]
        Mq = M @ q
        total = q.T @ Mq
        if abs(total) > 1e-20:
            energy_matrix[mode, :] = 100.0 * (q * Mq) / total

    dominant_index = np.argmax(np.abs(energy_matrix), axis=1)
    dominant_purity = np.max(np.abs(energy_matrix), axis=1)
    dominant_names = [DOF_NAMES[i] for i in dominant_index]
    gaps = np.diff(freq)

    return {
        "freq": freq,
        "phi": phi,
        "energy": energy_matrix,
        "purity": dominant_purity,
        "dominant": dominant_names,
        "gaps": gaps,
    }


# ============================================================
#                     TRA / eTRA
# ============================================================

def calculate_TRA(INERTIA, CRANK_AXIS):
    vector = np.linalg.solve(INERTIA, CRANK_AXIS)
    return normalize(vector)


def calculate_eTRA(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR):
    """Returns (eTRA_unit_vector, static_displacement_6dof)."""
    K = total_static_stiffness(proposal, CG)
    F = np.array([0., 0., 0., 0., 1., 0.])
    q = np.linalg.solve(K, F)
    theta = q[3:6]
    return normalize(theta), q


def true_3d_angle(a, b):
    a, b = normalize(a), normalize(b)
    return float(np.degrees(np.arccos(np.clip(np.dot(a, b), -1.0, 1.0))))


def nearest_etra_point(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR):
    etra, q = calculate_eTRA(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR)
    u_cg = q[:3]
    theta = q[3:6]
    denom = np.dot(theta, theta)
    if denom < 1e-20:
        return CG.copy()
    return CG + np.cross(theta, u_cg) / denom


# ============================================================
#              STIFFNESS RATIOS
# ============================================================

def stiffness_ratios(mount, VOID_SOLID_MIN, VOID_SOLID_MAX,
                     VS_AXIAL_MIN, VS_AXIAL_MAX):
    axis = mount.axis.upper()
    if axis == "Y":
        k_void, k_axial, k_solid = mount.k[0], mount.k[1], mount.k[2]
    elif axis == "X":
        k_void, k_axial, k_solid = mount.k[1], mount.k[0], mount.k[2]
    elif axis == "Z":
        k_void, k_axial, k_solid = mount.k[0], mount.k[2], mount.k[1]
    else:
        raise ValueError(f"Invalid mount axis: {mount.axis}")

    r1 = k_void / k_solid
    r2 = (k_void + k_solid) / k_axial
    ok = (VOID_SOLID_MIN <= r1 <= VOID_SOLID_MAX and
          VS_AXIAL_MIN <= r2 <= VS_AXIAL_MAX)
    return r1, r2, ok


# ============================================================
#              ROBUSTNESS (exact 512-corner + random-600)
# ============================================================

def _perturbed_stiffness(proposal, multipliers, CG):
    new_mounts = [
        Mount(m.name, np.array(m.xyz), np.array(m.k) * multipliers[i], m.axis)
        for i, m in enumerate(proposal.mounts)
    ]
    return Proposal(proposal.name + "[rob]", new_mounts)


def _single_robust(proposal, multipliers, CG, MASS, INERTIA, DYNAMIC_FACTOR,
                   EXPECTED_MODE_NAMES, ROB_PURITY_MIN):
    try:
        p = _perturbed_stiffness(proposal, multipliers, CG)
        modal = modal_analysis(p, CG, MASS, INERTIA, DYNAMIC_FACTOR)
        min_purity = float(np.min(modal["purity"]))
        purity_pass = min_purity >= ROB_PURITY_MIN
        return {
            "purity": min_purity,
            "purity_pass": purity_pass,
            "identity_pass": modal["dominant"] == EXPECTED_MODE_NAMES,
            "pass": bool(purity_pass),
        }
    except Exception:
        return {"purity": -np.inf, "purity_pass": False,
                "identity_pass": False, "pass": False}


def run_design_robustness(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR,
                          EXPECTED_MODE_NAMES, TOLERANCES, RANDOM_CASES,
                          RANDOM_SEED, ROB_PURITY_MIN):
    exact_signs = np.asarray(
        np.meshgrid(*([[-1.0, 1.0]] * 9), indexing="ij")
    ).reshape(9, -1).T

    seed_offset = sum(ord(c) for c in proposal.name)
    rng = np.random.default_rng(RANDOM_SEED + seed_offset)
    out = {}

    for tol in TOLERANCES:
        t = float(tol) / 100.0
        exact_pass, exact_min = 0, np.inf
        for signs in exact_signs:
            mults = (1.0 + t * signs).reshape(3, 3)
            r = _single_robust(proposal, mults, CG, MASS, INERTIA, DYNAMIC_FACTOR,
                               EXPECTED_MODE_NAMES, ROB_PURITY_MIN)
            if r["pass"]:
                exact_pass += 1
            if r["purity"] < exact_min:
                exact_min = r["purity"]

        random_mult = rng.uniform(1.0 - t, 1.0 + t, size=(RANDOM_CASES, 9))
        rand_pass, rand_min = 0, np.inf
        for idx in range(RANDOM_CASES):
            mults = random_mult[idx].reshape(3, 3)
            r = _single_robust(proposal, mults, CG, MASS, INERTIA, DYNAMIC_FACTOR,
                               EXPECTED_MODE_NAMES, ROB_PURITY_MIN)
            if r["pass"]:
                rand_pass += 1
            if r["purity"] < rand_min:
                rand_min = r["purity"]

        out[float(tol)] = {
            "exact_total": 512,
            "exact_pass": exact_pass,
            "exact_pass_percent": 100.0 * exact_pass / 512.0,
            "exact_min_purity": float(exact_min),
            "random_total": RANDOM_CASES,
            "random_pass": rand_pass,
            "random_pass_percent": 100.0 * rand_pass / RANDOM_CASES,
            "random_min_purity": float(rand_min),
        }
    return out


# ============================================================
#                OPTIMIZATION ENGINE
# ============================================================

def _axis_stiffness_from_params(solid, rv, ra, axis):
    void = rv * solid
    axial = (void + solid) / ra
    if axis == "Y":
        return np.array([void, axial, solid])
    if axis == "X":
        return np.array([axial, void, solid])
    if axis == "Z":
        return np.array([void, solid, axial])
    raise ValueError(axis)


def _decode_candidate(x, pos_limits, axes, VOID_SOLID_MIN, VOID_SOLID_MAX,
                       VS_AXIAL_MIN, VS_AXIAL_MAX, baseline_stiffnesses):
    mount_names = ["M1", "M2", "M3"]
    xyz = []
    idx = 0
    for mn in mount_names:
        p = []
        for c in ["X", "Y", "Z"]:
            lo, hi = pos_limits[mn][c]
            if abs(hi - lo) < 1e-12:
                p.append(lo)
            else:
                p.append(float(x[idx])); idx += 1
        xyz.append(p)

    k = []
    for j, mn in enumerate(mount_names):
        solid = float(x[idx]); rv = float(x[idx+1]); ra = float(x[idx+2]); idx += 3
        k.append(_axis_stiffness_from_params(solid, rv, ra, axes[j]))
    return xyz, k


def _candidate_bounds(pos_limits, axes, stiffness_fraction,
                      baseline_stiffnesses, VOID_SOLID_MIN, VOID_SOLID_MAX,
                      VS_AXIAL_MIN, VS_AXIAL_MAX):
    mount_names = ["M1", "M2", "M3"]
    bounds = []
    for mn in mount_names:
        for c in ["X", "Y", "Z"]:
            lo, hi = pos_limits[mn][c]
            if hi - lo > 1e-12:
                bounds.append((lo, hi))

    for j, mn in enumerate(mount_names):
        base_k = np.asarray(baseline_stiffnesses[mn], dtype=float)
        solid_index = {"X": 2, "Y": 2, "Z": 1}[axes[j]]
        base = float(base_k[solid_index])
        f = stiffness_fraction
        bounds.append((base * (1.0 - f), base * (1.0 + f)))
        bounds.append((VOID_SOLID_MIN, VOID_SOLID_MAX))
        bounds.append((VS_AXIAL_MIN, VS_AXIAL_MAX))
    return bounds


def _score(proposal, axes, objective, CG, MASS, INERTIA, DYNAMIC_FACTOR,
           FREQ_MIN, FREQ_MAX, PURITY_MIN, PURITY_TARGET,
           GAP12_MIN, GAP_OTHER_MIN, EXPECTED_MODE_NAMES):
    try:
        modal = modal_analysis(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR)
        freq = modal["freq"]
        purity = modal["purity"]
        gaps = modal["gaps"]
        tra = calculate_TRA(INERTIA, np.array([0., 1., 0.]))
        etra, _ = calculate_eTRA(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR)
        angle = true_3d_angle(tra, etra)

        penalty = 0.0
        penalty += 500.0 * np.sum(np.maximum(FREQ_MIN - freq, 0.0) ** 2)
        penalty += 500.0 * np.sum(np.maximum(freq - FREQ_MAX, 0.0) ** 2)
        penalty += 250.0 * np.sum(np.maximum(PURITY_MIN - purity, 0.0) ** 2)
        if len(gaps):
            penalty += 350.0 * max(GAP12_MIN - gaps[0], 0.0) ** 2
            penalty += 350.0 * np.sum(np.maximum(GAP_OTHER_MIN - gaps[1:], 0.0) ** 2)
        penalty += sum(250.0 for a, b in zip(modal["dominant"], EXPECTED_MODE_NAMES) if a != b)

        min_purity = float(np.min(purity))
        if objective in ("tra_alignment", "tra_alignment_current"):
            score = 25.0 * angle + 1.5 * max(PURITY_TARGET - min_purity, 0.0) ** 2
        elif objective == "energy_decoupling":
            score = 1.5 * max(PURITY_TARGET - min_purity, 0.0) ** 2 + 4.0 * angle
        elif objective == "robust_nominal":
            margin_p = min_purity - PURITY_MIN
            margin_g = min(gaps[0] - GAP12_MIN, *(gaps[1:] - GAP_OTHER_MIN)) if len(gaps) else -100.0
            score = -2.0 * margin_p - 2.0 * margin_g + 5.0 * angle
        else:
            score = 2.0 * max(PURITY_TARGET - min_purity, 0.0) ** 2 + 2.0 * angle
        return float(score + penalty)
    except Exception:
        return 1e12


def optimize_case(case_cfg, n_proposals, CG, MASS, INERTIA, DYNAMIC_FACTOR,
                  FREQ_MIN, FREQ_MAX, PURITY_MIN, PURITY_TARGET,
                  GAP12_MIN, GAP_OTHER_MIN, EXPECTED_MODE_NAMES,
                  VOID_SOLID_MIN, VOID_SOLID_MAX, VS_AXIAL_MIN, VS_AXIAL_MAX,
                  OPTIMIZER_MAXITER, OPTIMIZER_POPSIZE,
                  baseline_stiffnesses, emit):
    case_id = case_cfg["case_id"]
    pos_limits = case_cfg["position_limits"]
    axis_options = case_cfg["axis_options"]
    stiff_frac = case_cfg["stiffness_fraction"]
    objective = case_cfg["objective"]
    base_seed = 20260912 + 100 * case_id

    axis_combos = [
        (a, b, axis_options["M3"][0])
        for a in axis_options["M1"]
        for b in axis_options["M2"]
    ]

    proposals = []
    for pnum in range(1, n_proposals + 1):
        axes = axis_combos[(pnum - 1) % len(axis_combos)]
        bounds = _candidate_bounds(pos_limits, axes, stiff_frac,
                                   baseline_stiffnesses, VOID_SOLID_MIN,
                                   VOID_SOLID_MAX, VS_AXIAL_MIN, VS_AXIAL_MAX)

        required_axes_map = {"M1": axes[0], "M2": axes[1], "M3": axes[2]}

        def objective_fn(x):
            xyz, k = _decode_candidate(x, pos_limits, axes,
                                        VOID_SOLID_MIN, VOID_SOLID_MAX,
                                        VS_AXIAL_MIN, VS_AXIAL_MAX,
                                        baseline_stiffnesses)
            prop = Proposal("OPT", [
                Mount("M1", np.array(xyz[0]), np.array(k[0]), axes[0]),
                Mount("M2", np.array(xyz[1]), np.array(k[1]), axes[1]),
                Mount("M3", np.array(xyz[2]), np.array(k[2]), axes[2]),
            ])
            prop.pos_limits = pos_limits
            prop.required_axes = required_axes_map
            return _score(prop, axes, objective, CG, MASS, INERTIA, DYNAMIC_FACTOR,
                          FREQ_MIN, FREQ_MAX, PURITY_MIN, PURITY_TARGET,
                          GAP12_MIN, GAP_OTHER_MIN, EXPECTED_MODE_NAMES)

        result = differential_evolution(
            objective_fn, bounds,
            seed=base_seed + pnum,
            maxiter=OPTIMIZER_MAXITER,
            popsize=OPTIMIZER_POPSIZE,
            tol=0.002,
            mutation=(0.5, 1.0),
            recombination=0.7,
            polish=True,
            workers=1,
            updating="immediate",
        )

        xyz, k = _decode_candidate(result.x, pos_limits, axes,
                                    VOID_SOLID_MIN, VOID_SOLID_MAX,
                                    VS_AXIAL_MIN, VS_AXIAL_MAX,
                                    baseline_stiffnesses)
        prop_name = f"{case_cfg['name']} — PROPOSAL {pnum} (OPT-{case_id}-{pnum})"
        prop = Proposal(prop_name, [
            Mount("M1", np.array(xyz[0]), np.array(k[0]), axes[0]),
            Mount("M2", np.array(xyz[1]), np.array(k[1]), axes[1]),
            Mount("M3", np.array(xyz[2]), np.array(k[2]), axes[2]),
        ])
        prop.pos_limits = pos_limits
        prop.required_axes = required_axes_map
        proposals.append(prop)

        emit(f"Case {case_id}: proposal {pnum}/{n_proposals} done")
    return proposals


# ============================================================
#               ENGINEERING REVIEW (per proposal)
# ============================================================

def review_proposal(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR,
                    CRANK_AXIS, FREQ_MIN, FREQ_MAX, PURITY_MIN,
                    PURITY_TARGET, GAP12_MIN, GAP_OTHER_MIN,
                    VOID_SOLID_MIN, VOID_SOLID_MAX, VS_AXIAL_MIN, VS_AXIAL_MAX,
                    EXPECTED_MODE_NAMES, TRA_TARGET,
                    ROBUSTNESS_TOLERANCES, ROBUSTNESS_RANDOM_CASES,
                    ROBUSTNESS_RANDOM_SEED, ROBUSTNESS_PURITY_MIN):
    modal = modal_analysis(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR)
    freq = modal["freq"]
    purity = modal["purity"]
    dominant = modal["dominant"]
    gaps = modal["gaps"]

    tra = calculate_TRA(INERTIA, CRANK_AXIS)
    etra, _ = calculate_eTRA(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR)
    angle_3d = true_3d_angle(tra, etra)
    etra_point = nearest_etra_point(proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR)
    offset = float(np.linalg.norm(etra_point - CG))

    # Packaging
    mounts = {m.name: m for m in proposal.mounts}
    pos_limits = getattr(proposal, "pos_limits", {})
    req_axes = getattr(proposal, "required_axes", {})
    package_pass = True
    for mn in ["M1", "M2", "M3"]:
        m = mounts[mn]
        for i, c in enumerate(["X", "Y", "Z"]):
            lo, hi = pos_limits.get(mn, {}).get(c, (-1e18, 1e18))
            if not (lo - 1e-9 <= m.xyz[i] <= hi + 1e-9):
                package_pass = False
        req = req_axes.get(mn, m.axis)
        allowed = req if isinstance(req, list) else [req]
        if m.axis.upper() not in [a.upper() for a in allowed]:
            package_pass = False

    # Stiffness ratios
    ratio_pass = True
    ratio_rows = []
    for m in proposal.mounts:
        r1, r2, ok = stiffness_ratios(m, VOID_SOLID_MIN, VOID_SOLID_MAX,
                                       VS_AXIAL_MIN, VS_AXIAL_MAX)
        ratio_rows.append({"mount": m.name, "void_solid": r1,
                           "void_solid_axial": r2, "pass": ok})
        if not ok:
            ratio_pass = False

    freq_pass = bool(np.all(freq >= FREQ_MIN) and np.all(freq <= FREQ_MAX))
    purity_pass = bool(np.min(purity) >= PURITY_MIN)
    gap_pass = bool(gaps[0] >= GAP12_MIN and np.all(gaps[1:] >= GAP_OTHER_MIN))
    identity_pass = dominant == EXPECTED_MODE_NAMES
    tra_pass = angle_3d <= TRA_TARGET
    feasible = all([package_pass, ratio_pass, freq_pass, purity_pass,
                    gap_pass, identity_pass])

    robustness = run_design_robustness(
        proposal, CG, MASS, INERTIA, DYNAMIC_FACTOR,
        EXPECTED_MODE_NAMES, ROBUSTNESS_TOLERANCES,
        ROBUSTNESS_RANDOM_CASES, ROBUSTNESS_RANDOM_SEED, ROBUSTNESS_PURITY_MIN
    )

    # Verdict
    if feasible and tra_pass:
        verdict = "RECOMMENDED / STRONG CANDIDATE"
    elif feasible:
        verdict = "TECHNICALLY PASSING — TRA/eTRA NEEDS IMPROVEMENT"
    else:
        verdict = "NOT READY — MODIFY LAYOUT / STIFFNESS"

    # Serialize mounts
    mounts_out = []
    for m in proposal.mounts:
        r1, r2, _ = stiffness_ratios(m, VOID_SOLID_MIN, VOID_SOLID_MAX,
                                       VS_AXIAL_MIN, VS_AXIAL_MAX)
        mounts_out.append({
            "name": m.name,
            "x": round(float(m.xyz[0]), 3),
            "y": round(float(m.xyz[1]), 3),
            "z": round(float(m.xyz[2]), 3),
            "axis": m.axis,
            "kx": round(float(m.k[0]), 3),
            "ky": round(float(m.k[1]), 3),
            "kz": round(float(m.k[2]), 3),
            "void_solid": round(r1, 4),
            "void_solid_axial": round(r2, 4),
        })

    modal_table = []
    for i in range(6):
        gap_val = None if i == 0 else round(float(gaps[i-1]), 4)
        modal_table.append({
            "mode": i + 1,
            "identity": dominant[i],
            "freq_hz": round(float(freq[i]), 4),
            "purity_pct": round(float(purity[i]), 3),
            "gap_hz": gap_val,
            "energy_row": [round(float(v), 3) for v in modal["energy"][i]],
        })

    return {
        "name": proposal.name,
        "mounts": mounts_out,
        "modal": modal_table,
        "tra": tra.tolist(),
        "etra": etra.tolist(),
        "angle_3d_deg": round(angle_3d, 4),
        "etra_point": etra_point.tolist(),
        "etra_offset_mm": round(offset, 3),
        "min_purity": round(float(np.min(purity)), 3),
        "min_gap_margin": round(float(min(gaps[0] - GAP12_MIN,
                                          *(gaps[1:] - GAP_OTHER_MIN))), 4),
        "feasible": feasible,
        "package_pass": package_pass,
        "ratio_pass": ratio_pass,
        "freq_pass": freq_pass,
        "purity_pass": purity_pass,
        "gap_pass": gap_pass,
        "identity_pass": identity_pass,
        "tra_pass": tra_pass,
        "verdict": verdict,
        "robustness": robustness,
    }


# ============================================================
#               RANKING
# ============================================================

def ranking_key(r):
    rb = r["robustness"]
    robust_mean = np.mean([
        rb[k]["exact_pass_percent"] for k in rb
    ] + [
        rb[k]["random_pass_percent"] for k in rb
    ])
    return (
        0 if r["feasible"] else 1,
        r["angle_3d_deg"],
        -r["min_purity"],
        -r["min_gap_margin"],
        -robust_mean,
        r["etra_offset_mm"],
    )


# ============================================================
#                    CASE CONFIGS
# ============================================================

def build_case_configs(inputs):
    pos_limits = {}
    for mn in ["M1", "M2", "M3"]:
        m_in = next((m for m in inputs["mounts"] if m["name"] == mn), None)
        if m_in is None:
            raise ValueError(f"Mount {mn} not found in inputs.mounts")
        pos_limits[mn] = {
            "X": tuple(m_in["position_limits"]["X"]),
            "Y": tuple(m_in["position_limits"]["Y"]),
            "Z": tuple(m_in["position_limits"]["Z"]),
        }

    def axis_opts(mn):
        m_in = next(m for m in inputs["mounts"] if m["name"] == mn)
        return m_in.get("axis_options", ["Y"])

    old_limits = {
        "M1": {"X": (2160.0, 2350.0), "Y": (282.7, 282.7), "Z": (100.0, 200.0)},
        "M2": {"X": (2100.0, 2145.0), "Y": (-172.5, -172.5), "Z": (45.0, 200.0)},
        "M3": {"X": (2583.0, 2583.0), "Y": (-260.0, -175.2), "Z": (40.0, 45.0)},
    }

    cases = [
        {
            "case_id": 1,
            "name": "CASE 1 — BASELINE AXIS / MODAL-PURITY OPTIMIZATION",
            "position_limits": old_limits,
            "axis_options": {"M1": ["Y"], "M2": ["Y"], "M3": ["X"]},
            "stiffness_fraction": 0.50,
            "objective": "balanced_modal",
        },
        {
            "case_id": 2,
            "name": "CASE 2 — M1/M2 AXIS-FREE OPTIMIZATION",
            "position_limits": old_limits,
            "axis_options": {"M1": ["X", "Y"], "M2": ["X", "Y"], "M3": ["X"]},
            "stiffness_fraction": 0.50,
            "objective": "balanced_modal",
        },
        {
            "case_id": 3,
            "name": "CASE 3 — RESEARCH-GUIDED PACKAGE-CONSTRAINED OPTIMIZATION",
            "position_limits": old_limits,
            "axis_options": {"M1": ["Y"], "M2": ["Y"], "M3": ["X"]},
            "stiffness_fraction": 0.25,
            "objective": "energy_decoupling",
        },
        {
            "case_id": 4,
            "name": "CASE 4 — DYNAMIC-FACTOR / ROBUSTNESS-ORIENTED OPTIMIZATION",
            "position_limits": old_limits,
            "axis_options": {"M1": ["Y"], "M2": ["Y"], "M3": ["X"]},
            "stiffness_fraction": 0.50,
            "objective": "robust_nominal",
        },
        {
            "case_id": 5,
            "name": "CASE 5 — TRA/eTRA ALIGNMENT OPTIMIZATION",
            "position_limits": old_limits,
            "axis_options": {"M1": ["Y"], "M2": ["Y"], "M3": ["X"]},
            "stiffness_fraction": 0.25,
            "objective": "tra_alignment",
        },
        {
            "case_id": 6,
            "name": "CASE 6 — CURRENT THERMAL / EXHAUST-SAFE OPTIMIZATION",
            "position_limits": pos_limits,
            "axis_options": {mn: axis_opts(mn) for mn in ["M1", "M2", "M3"]},
            "stiffness_fraction": 0.50,
            "objective": "tra_alignment_current",
        },
    ]
    return cases


# ============================================================
#                        MAIN
# ============================================================

def run_optimizer(inputs):
    # ── Engine params ──────────────────────────────────────────
    engine = inputs.get("engine", {})
    MASS = float(engine["mass"])
    CG = np.array(engine["cg"], dtype=float)
    INERTIA = np.array(engine["inertia"], dtype=float) * 1e6  # kg-m² → kg-mm²
    CRANK_AXIS = normalize(np.array(engine.get("crank_axis", [0., 1., 0.]), dtype=float))
    DYNAMIC_FACTOR = float(engine.get("dynamic_stiffness_factor", 1.30))

    # ── Analysis targets ───────────────────────────────────────
    tgt = inputs.get("targets", {})
    FREQ_MIN = float(tgt.get("freq_min_hz", 5.0))
    FREQ_MAX = float(tgt.get("freq_max_hz", 30.0))
    PURITY_MIN = float(tgt.get("purity_min_pct", 85.0))
    PURITY_TARGET = float(tgt.get("purity_target_pct", 90.0))
    GAP12_MIN = float(tgt.get("mode_12_gap_min_hz", 1.5))
    GAP_OTHER_MIN = float(tgt.get("other_gap_min_hz", 2.0))
    TRA_TARGET = float(tgt.get("tra_etra_target_deg", 1.0))

    EXPECTED_MODE_NAMES = ["Ty", "Tx", "Rz", "Tz", "Rx", "Ry"]

    # ── Robustness ─────────────────────────────────────────────
    rob = inputs.get("robustness", {})
    ROB_PURITY_MIN = float(rob.get("purity_min_pct", 80.0))
    ROB_TOLERANCES = rob.get("tolerances_pct", [5.0, 10.0, 15.0])
    ROB_RANDOM_CASES = int(rob.get("random_cases", 600))
    ROB_RANDOM_SEED = int(rob.get("random_seed", 260912))

    # ── Manufacturing ──────────────────────────────────────────
    mfg = inputs.get("manufacturing", {})
    VOID_SOLID_MIN = float(mfg.get("void_solid_min", 0.50))
    VOID_SOLID_MAX = float(mfg.get("void_solid_max", 0.60))
    VS_AXIAL_MIN = float(mfg.get("void_solid_over_axial_min", 6.0))
    VS_AXIAL_MAX = float(mfg.get("void_solid_over_axial_max", 6.8))

    # ── Optimizer controls ─────────────────────────────────────
    opt = inputs.get("optimizer", {})
    N_PROPOSALS = int(opt.get("proposals_per_case", 5))
    MAX_ITER = int(opt.get("max_iter", 10))
    POP_SIZE = int(opt.get("pop_size", 4))
    STIFF_FRAC = float(opt.get("stiffness_fraction", 0.50))
    ENABLED_CASES = opt.get("enabled_cases", [1, 2, 3, 4, 5, 6])

    # ── Baseline stiffnesses ───────────────────────────────────
    baseline_stiffnesses = {}
    for m_in in inputs.get("mounts", []):
        baseline_stiffnesses[m_in["name"]] = m_in.get(
            "baseline_stiffness", [180.0, 73.0, 320.0]
        )

    # ── Build case configs ─────────────────────────────────────
    all_case_cfgs = build_case_configs(inputs)
    case_cfgs = [c for c in all_case_cfgs if c["case_id"] in ENABLED_CASES]
    total_cases = len(case_cfgs)

    emit_progress("Starting optimizer…", pct=0)

    # ── Run each case ──────────────────────────────────────────
    all_proposals_raw = []
    for case_idx, cfg in enumerate(case_cfgs):
        # Override per-case stiffness fraction from optimizer controls
        cfg["stiffness_fraction"] = STIFF_FRAC

        emit_progress(f"Running {cfg['name']}…",
                      case=cfg["case_id"], total_cases=total_cases,
                      pct=int(100 * case_idx / total_cases))

        def emit(msg):
            emit_progress(msg, case=cfg["case_id"], total_cases=total_cases)

        proposals = optimize_case(
            cfg, N_PROPOSALS, CG, MASS, INERTIA, DYNAMIC_FACTOR,
            FREQ_MIN, FREQ_MAX, PURITY_MIN, PURITY_TARGET,
            GAP12_MIN, GAP_OTHER_MIN, EXPECTED_MODE_NAMES,
            VOID_SOLID_MIN, VOID_SOLID_MAX, VS_AXIAL_MIN, VS_AXIAL_MAX,
            MAX_ITER, POP_SIZE, baseline_stiffnesses, emit
        )
        all_proposals_raw.extend([(cfg, p) for p in proposals])

    emit_progress("Evaluating all proposals…", pct=90)

    # ── Review each proposal ───────────────────────────────────
    all_results = []
    for cfg, prop in all_proposals_raw:
        r = review_proposal(
            prop, CG, MASS, INERTIA, DYNAMIC_FACTOR, CRANK_AXIS,
            FREQ_MIN, FREQ_MAX, PURITY_MIN, PURITY_TARGET,
            GAP12_MIN, GAP_OTHER_MIN,
            VOID_SOLID_MIN, VOID_SOLID_MAX, VS_AXIAL_MIN, VS_AXIAL_MAX,
            EXPECTED_MODE_NAMES, TRA_TARGET,
            ROB_TOLERANCES, ROB_RANDOM_CASES, ROB_RANDOM_SEED, ROB_PURITY_MIN
        )
        r["case_id"] = cfg["case_id"]
        r["case_name"] = cfg["name"]
        all_results.append(r)

    # ── Select top 2 per case, then rank overall ───────────────
    TOP_PER_CASE = 2
    OVERALL_TOP_N = 10

    grouped = {}
    for r in all_results:
        grouped.setdefault(r["case_id"], []).append(r)

    selected = []
    case_summaries = []
    for cid in sorted(grouped):
        ranked_case = sorted(grouped[cid], key=ranking_key)
        best = ranked_case[:TOP_PER_CASE]
        selected.extend(best)
        case_summaries.append({
            "case_id": cid,
            "case_name": best[0]["case_name"] if best else f"Case {cid}",
            "best": best,
        })

    top10 = sorted(selected, key=ranking_key)[:OVERALL_TOP_N]

    emit_progress("Complete!", pct=100)

    return {
        "status": "ok",
        "top10": top10,
        "all_proposals": all_results,
        "case_summaries": case_summaries,
        "enabled_cases": ENABLED_CASES,
        "settings": {
            "proposals_per_case": N_PROPOSALS,
            "max_iter": MAX_ITER,
            "pop_size": POP_SIZE,
            "freq_range_hz": [FREQ_MIN, FREQ_MAX],
            "purity_min_pct": PURITY_MIN,
            "purity_target_pct": PURITY_TARGET,
            "tra_etra_target_deg": TRA_TARGET,
        },
    }


if __name__ == "__main__":
    # Read JSON from stdin (when called from Node.js via proc.stdin)
    # or from argv[1] (when called directly from the command line)
    try:
        if len(sys.argv) >= 2:
            raw_json = sys.argv[1]
        else:
            raw_json = sys.stdin.read()

        if not raw_json.strip():
            print(json.dumps({"status": "error", "message": "No input JSON received."}))
            sys.exit(1)

        inputs = json.loads(raw_json)
    except json.JSONDecodeError as e:
        print(json.dumps({"status": "error", "message": f"Invalid JSON: {e}"}))
        sys.exit(1)

    try:
        result = run_optimizer(inputs)
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e),
            "traceback": traceback.format_exc(),
        }), flush=True)
        sys.exit(1)
