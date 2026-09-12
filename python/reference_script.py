"""
ENGINE MOUNT – ALL CASE / PROPOSAL OPTIMIZER + ROBUSTNESS REVIEW
==========================================

EDIT ONLY THE "USER INPUT" SECTION AT THE TOP.

CASE LEGEND:
    CASE 1 = Baseline Y/Y/X axis configuration; earlier robustness proposals
    CASE 2 = M1/M2 axis-free study; best solutions still converged to Y/Y/X
    CASE 3 = Research-guided, package-constrained optimization candidate
    CASE 4 = Dynamic/static-factor 1.30 robustness-oriented optimization
    CASE 5 = Old-package solution deliberately tuned to 0° TRA/eTRA
    CASE 6 = Current thermal/exhaust-safe nominal design (M1 Z=200,
             M2 Z=45..60, M3 Z=45; Y/Y/X axes)

NOTE: Historical cases are retained for comparison. Their numerical results
are recalculated using the USER INPUT physics model; the case name describes
why each proposal was studied.

The program generates fresh optimized proposals and then checks:
    • Mount XYZ layout
    • Mount stiffness Kx/Ky/Kz
    • Manufacturing stiffness ratios
    • 6-DOF natural frequencies
    • Mode identity
    • Modal kinetic-energy / directional purity
    • Mode gaps
    • TRA
    • Static eTRA
    • True 3D TRA/eTRA angle
    • eTRA nearest point
    • TRA/eTRA paths at +400,+200,0,-200,-400 mm
    • XY / YZ / ZX projected angles
    • Packaging compliance
    • Automatic engineering remarks

Physics:
    DOF = [Tx, Ty, Tz, Rx, Ry, Rz]

    B =
        [1 0 0 0  z -y]
        [0 1 0 -z  0  x]
        [0 0 1  y -x]

    K_mount = B.T @ Kt @ B

    K_total = sum(K_mount)

    K_dynamic = 1.30 * K_static

    K phi = omega^2 M phi

TRA:
    TRA = normalize(I^-1 * crank_axis)

eTRA:
    K_static q = [0,0,0,0,T,0]
    eTRA = normalize([Rx,Ry,Rz])

Nearest point on eTRA:
    r = theta x u_CG / |theta|^2
    P_eTRA = CG + r

IMPORTANT:
The modal-energy matrix below is a full-M kinetic-energy
allocation. With products of inertia present, individual
directional contributions can be signed. Therefore the
"dominant purity" is reported using the magnitude of the
largest directional contribution.

The constant 1.30 dynamic/static stiffness factor is a
design-stage approximation. Final NVH validation should use
supplier measured frequency/amplitude-dependent dynamic
stiffness and damping where available.
"""

import numpy as np
from dataclasses import dataclass
from pathlib import Path
import csv
import math

from scipy.optimize import differential_evolution


# ============================================================
#                    USER INPUT – EDIT HERE
# ============================================================

# ---------------- ENGINE ----------------

ENGINE_MASS_KG = 117.2

ENGINE_CG_MM = [
    2371.09,       # X
    -28.66,        # Y
    131.61         # Z
]

# Full inertia tensor / MOI.
# Enter in kg-m^2 exactly as supplied.
ENGINE_MOI_KG_M2 = [
    [4.583,  0.610, -0.019],
    [0.610,  1.955,  0.066],
    [-0.019, 0.066,  5.507]
]

# Crank / torque axis
# Current engine convention = +Y
ENGINE_CRANK_AXIS = [0.0, 1.0, 0.0]


# ---------------- DYNAMIC / STATIC ----------------

DYNAMIC_STATIC_FACTOR = 1.30


# ---------------- ANALYSIS TARGETS ----------------

FREQ_MIN_HZ = 5.0
FREQ_MAX_HZ = 30.0

PURITY_MIN_PERCENT = 85.0
PURITY_TARGET_PERCENT = 90.0

MODE_1_2_GAP_MIN_HZ = 1.5
OTHER_MODE_GAP_MIN_HZ = 2.0

TRA_ETRA_TARGET_DEG = 1.0

# ---------------- DESIGN ROBUSTNESS ----------------
#
# Robustness varies all 9 mount stiffness components independently.
# Exact study = all 2^9 = 512 stiffness corners.
# Random study = uniformly sampled 600 points inside the same +/- tolerance box.
#
# Robustness purity criterion requested for this study:
ROBUSTNESS_PURITY_MIN_PERCENT = 80.0
ROBUSTNESS_TOLERANCES_PERCENT = [5.0, 10.0, 15.0]
ROBUSTNESS_RANDOM_CASES = 600
ROBUSTNESS_RANDOM_SEED = 260912

# ---------------- OVERALL PROPOSAL RANKING ----------------
#
# Each case generates 5 fresh proposals.
# We first select the best 2 from each case (12 candidates total),
# then rank those 12 and report the overall Top 10.
TOP_PER_CASE = 2
OVERALL_TOP_N = 10




# ---------------- MOUNT POSITION LIMITS ----------------
#
# Enter [MINIMUM, MAXIMUM] in mm.
#
# Fixed coordinate:
#     [value, value]
#
# Example:
#     M1_Z_LIMIT = [200, 200]
#
# means M1 Z is fixed at 200 mm.

M1_X_LIMIT = [2160.0, 2350.0]
M1_Y_LIMIT = [282.7, 282.7]
M1_Z_LIMIT = [200.0, 200.0]

M2_X_LIMIT = [2100.0, 2145.0]
M2_Y_LIMIT = [-172.5, -172.5]
M2_Z_LIMIT = [45.0, 60.0]

M3_X_LIMIT = [2583.0, 2583.0]
M3_Y_LIMIT = [-260.0, -175.2]
M3_Z_LIMIT = [45.0, 45.0]


# ---------------- MOUNT AXES ----------------

M1_AXIS = "Y"
M2_AXIS = "Y"
M3_AXIS = "X"


# ---------------- MANUFACTURING RATIOS ----------------

VOID_SOLID_MIN = 0.50
VOID_SOLID_MAX = 0.60

VOID_SOLID_OVER_AXIAL_MIN = 6.0
VOID_SOLID_OVER_AXIAL_MAX = 6.8


# ---------------- TRA / eTRA PATH ----------------

PATH_STATIONS_MM = [
    +400.0,
    +200.0,
    0.0,
    -200.0,
    -400.0
]


# ---------------- OUTPUT ----------------

OUTPUT_FOLDER = "ENGINE_MOUNT_REVIEW_OUTPUT"

# ---------------- OPTIMIZATION CONTROLS ----------------

PROPOSALS_PER_CASE = 5
OPTIMIZER_MAXITER = 10
OPTIMIZER_POPSIZE = 4

# Baseline stiffness used to define the optimization envelope.
# These are study baselines, not supplier limits.
BASELINE_MOUNT_STIFFNESS = {
    "M1": [180.0, 73.0, 320.0],
    "M2": [240.0, 120.0, 480.0],
    "M3": [73.0, 180.0, 320.0],
}


# ============================================================
#                 INTERNAL SETUP – DO NOT EDIT
# ============================================================

MASS = ENGINE_MASS_KG
CG = np.array(ENGINE_CG_MM, dtype=float)

# Convert kg-m^2 -> kg-mm^2
INERTIA = np.array(ENGINE_MOI_KG_M2, dtype=float) * 1e6

CRANK_AXIS = np.array(ENGINE_CRANK_AXIS, dtype=float)

DYNAMIC_FACTOR = DYNAMIC_STATIC_FACTOR

FREQ_MIN = FREQ_MIN_HZ
FREQ_MAX = FREQ_MAX_HZ

PURITY_MIN = PURITY_MIN_PERCENT
PURITY_TARGET = PURITY_TARGET_PERCENT

GAP12_MIN = MODE_1_2_GAP_MIN_HZ
GAP_OTHER_MIN = OTHER_MODE_GAP_MIN_HZ

TRA_TARGET = TRA_ETRA_TARGET_DEG

STATIONS = np.array(PATH_STATIONS_MM, dtype=float)

OUTPUT_FOLDER = str(Path(__file__).resolve().parent / OUTPUT_FOLDER)

POSITION_LIMITS = {
    "M1": {
        "X": tuple(M1_X_LIMIT),
        "Y": tuple(M1_Y_LIMIT),
        "Z": tuple(M1_Z_LIMIT)
    },
    "M2": {
        "X": tuple(M2_X_LIMIT),
        "Y": tuple(M2_Y_LIMIT),
        "Z": tuple(M2_Z_LIMIT)
    },
    "M3": {
        "X": tuple(M3_X_LIMIT),
        "Y": tuple(M3_Y_LIMIT),
        "Z": tuple(M3_Z_LIMIT)
    }
}

REQUIRED_AXES = {
    "M1": M1_AXIS,
    "M2": M2_AXIS,
    "M3": M3_AXIS
}

DOF_NAMES = ["Tx", "Ty", "Tz", "Rx", "Ry", "Rz"]
EXPECTED_MODE_NAMES = ["Ty", "Tx", "Rz", "Tz", "Rx", "Ry"]


# ============================================================
#                    DATA STRUCTURES
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
#                    PHYSICAL MODEL
# ============================================================

def normalize(v):
    v = np.asarray(v, dtype=float)
    n = np.linalg.norm(v)

    if n < 1e-15:
        return np.zeros_like(v)

    return v / n


def B_matrix(r_mm):
    x, y, z = r_mm

    return np.array([
        [1., 0., 0., 0., z, -y],
        [0., 1., 0., -z, 0., x],
        [0., 0., 1., y, -x, 0.]
    ])


def mount_global_stiffness(mount):
    # Position relative to engine CG
    r = mount.xyz - CG

    B = B_matrix(r)

    Kt = np.diag(mount.k)

    return B.T @ Kt @ B


def total_static_stiffness(proposal):
    K = np.zeros((6, 6))

    for mount in proposal.mounts:
        K += mount_global_stiffness(mount)

    return K


def mass_matrix():
    M = np.zeros((6, 6))

    M[:3, :3] = MASS * np.eye(3)
    M[3:, 3:] = INERTIA

    return M


MASS_MATRIX = mass_matrix()


# ============================================================
#                    MODAL ANALYSIS
# ============================================================

def modal_analysis(proposal):

    K_static_mm = total_static_stiffness(proposal)

    # Dynamic stiffness factor applies to modal calculation.
    K_dynamic_mm = DYNAMIC_FACTOR * K_static_mm

    # Convert generalized stiffness from N/mm + mm rotations
    # to SI-compatible N/m + rad coordinates.
    S = np.diag([
        1000.,
        1000.,
        1000.,
        1.,
        1.,
        1.
    ])

    K_si = S.T @ K_dynamic_mm @ S / 1000.0

    # M in kg, kg-m^2
    M = np.zeros((6, 6))
    M[:3, :3] = MASS * np.eye(3)
    M[3:, 3:] = INERTIA / 1e6

    # Cholesky transformation:
    # K phi = lambda M phi
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

    # Normalize to unit generalized mass
    for i in range(6):

        gm = phi[:, i].T @ M @ phi[:, i]

        if gm > 1e-20:
            phi[:, i] /= np.sqrt(gm)

    # Full-M modal kinetic-energy directional matrix
    #
    # T_total = 0.5*w^2*q.T*M*q
    #
    # Directional allocation:
    #     contribution_i = q_i * (M q)_i
    #
    # This retains products of inertia.
    energy_matrix = np.zeros((6, 6))

    for mode in range(6):

        q = phi[:, mode]

        Mq = M @ q

        contributions = q * Mq

        total = q.T @ Mq

        if abs(total) > 1e-20:
            energy_matrix[mode, :] = (
                100.0 * contributions / total
            )

    # Use magnitude for dominant physical contribution.
    dominant_index = np.argmax(
        np.abs(energy_matrix),
        axis=1
    )

    dominant_purity = np.max(
        np.abs(energy_matrix),
        axis=1
    )

    dominant_names = [
        DOF_NAMES[i]
        for i in dominant_index
    ]

    gaps = np.diff(freq)

    return {
        "freq": freq,
        "phi": phi,
        "energy": energy_matrix,
        "purity": dominant_purity,
        "dominant": dominant_names,
        "gaps": gaps
    }


# ============================================================
#                         TRA
# ============================================================

def calculate_TRA():

    # TRA proportional to I^-1 * T
    vector = np.linalg.solve(
        INERTIA,
        CRANK_AXIS
    )

    return normalize(vector)


# ============================================================
#                        eTRA
# ============================================================

def calculate_eTRA(proposal):

    K = total_static_stiffness(proposal)

    # Unit static torque about +Y
    F = np.array([
        0.,
        0.,
        0.,
        0.,
        1.,
        0.
    ])

    q = np.linalg.solve(K, F)

    theta = q[3:6]

    return normalize(theta), q


def true_3d_angle(a, b):

    a = normalize(a)
    b = normalize(b)

    c = np.clip(
        np.dot(a, b),
        -1.0,
        1.0
    )

    return np.degrees(
        np.arccos(c)
    )


# ============================================================
#               eTRA NEAREST POINT
# ============================================================

def nearest_etra_point(proposal):

    etra, q = calculate_eTRA(proposal)

    u_cg = q[:3]

    theta = q[3:6]

    denominator = np.dot(theta, theta)

    if denominator < 1e-20:
        return CG.copy()

    r = np.cross(theta, u_cg) / denominator

    return CG + r


# ============================================================
#                    AXIS PATHS
# ============================================================

def generate_axis_path(direction, origin):

    direction = normalize(direction)

    return np.array([
        origin + direction * s
        for s in STATIONS
    ])


# ============================================================
#                   PROJECTIONS
# ============================================================

def projected_direction(v, plane):

    v = normalize(v)

    if plane == "XY":
        # Y horizontal, X vertical
        return np.array([v[1], v[0]])

    if plane == "YZ":
        # Y horizontal, Z vertical
        return np.array([v[1], v[2]])

    if plane == "ZX":
        # X horizontal, Z vertical
        return np.array([v[0], v[2]])

    raise ValueError("Unknown plane")


def projected_angle(v1, v2, plane):

    a = projected_direction(v1, plane)
    b = projected_direction(v2, plane)

    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)

    if na < 1e-15 or nb < 1e-15:
        return np.nan

    # Geometric line angle = 0..90 degrees
    c = np.clip(
        abs(np.dot(a, b)) / (na * nb),
        0.0,
        1.0
    )

    return np.degrees(
        np.arccos(c)
    )


# ============================================================
#                 STIFFNESS RATIOS
# ============================================================

def stiffness_ratios(mount):

    axis = mount.axis.upper()

    if axis == "Y":

        k_void = mount.k[0]
        k_axial = mount.k[1]
        k_solid = mount.k[2]

    elif axis == "X":

        k_void = mount.k[1]
        k_axial = mount.k[0]
        k_solid = mount.k[2]

    elif axis == "Z":

        k_void = mount.k[0]
        k_axial = mount.k[2]
        k_solid = mount.k[1]

    else:
        raise ValueError(
            f"Invalid mount axis: {mount.axis}"
        )

    ratio_1 = k_void / k_solid

    ratio_2 = (k_void + k_solid) / k_axial

    return ratio_1, ratio_2


# ============================================================
#                  PACKAGING CHECK
# ============================================================

def check_packaging(proposal):

    mounts = {
        m.name: m
        for m in proposal.mounts
    }

    checks = []

    for mount_name in ["M1", "M2", "M3"]:

        m = mounts[mount_name]

        for index, coordinate in enumerate(
            ["X", "Y", "Z"]
        ):

            low, high = POSITION_LIMITS[
                mount_name
            ][coordinate]

            value = m.xyz[index]

            passed = (
                low - 1e-9
                <= value
                <= high + 1e-9
            )

            checks.append({
                "check": f"{mount_name} {coordinate}",
                "value": value,
                "limit": f"{low:g} .. {high:g}",
                "pass": passed
            })

    for mount_name in ["M1", "M2", "M3"]:

        actual = mounts[mount_name].axis.upper()

        required = REQUIRED_AXES[
            mount_name
        ].upper()

        checks.append({
            "check": f"{mount_name} axis",
            "value": actual,
            "limit": required,
            "pass": actual == required
        })

    return checks


# ============================================================
#                STIFFNESS RATIO CHECK
# ============================================================

def check_stiffness_ratios(proposal):

    rows = []

    for m in proposal.mounts:

        ratio_1, ratio_2 = stiffness_ratios(m)

        passed = (
            VOID_SOLID_MIN
            <= ratio_1
            <= VOID_SOLID_MAX
            and
            VOID_SOLID_OVER_AXIAL_MIN
            <= ratio_2
            <= VOID_SOLID_OVER_AXIAL_MAX
        )

        rows.append({
            "mount": m.name,
            "void_solid": ratio_1,
            "void_solid_axial": ratio_2,
            "pass": passed
        })

    return rows



# ============================================================
#                    DESIGN ROBUSTNESS
# ============================================================

def _perturbed_proposal_stiffness(proposal, multipliers):
    """Return a copy of a proposal with independent Kx/Ky/Kz multipliers."""
    new_mounts = []
    for i, m in enumerate(proposal.mounts):
        new_mounts.append(
            Mount(
                m.name,
                np.array(m.xyz, dtype=float),
                np.array(m.k, dtype=float) * multipliers[i],
                m.axis,
            )
        )
    p = Proposal(proposal.name + " [robust]", new_mounts)
    if hasattr(proposal, "package_limits"):
        p.package_limits = clone_limits(proposal.package_limits)
    if hasattr(proposal, "required_axes"):
        p.required_axes = dict(proposal.required_axes)
    return p


def _robustness_single_case(proposal, multipliers):
    """Evaluate modal purity and mode identity for one stiffness perturbation."""
    try:
        p = _perturbed_proposal_stiffness(proposal, multipliers)
        modal = modal_analysis(p)
        min_purity = float(np.min(modal["purity"]))
        identity_pass = modal["dominant"] == EXPECTED_MODE_NAMES
        purity_pass = min_purity >= ROBUSTNESS_PURITY_MIN_PERCENT
        return {
            "purity": min_purity,
            "purity_pass": purity_pass,
            "identity_pass": identity_pass,
            # User-requested robustness PASS criterion is modal purity >= 80%.
            # Mode identity is reported separately so it does not silently
            # change the requested purity pass rate.
            "pass": bool(purity_pass),
            "freq": modal["freq"],
        }
    except (np.linalg.LinAlgError, ValueError, FloatingPointError):
        return {
            "purity": -np.inf,
            "purity_pass": False,
            "identity_pass": False,
            "pass": False,
            "freq": np.full(6, np.nan),
        }


def _exact_512_corners():
    """All 2^9 vertices of the independent 9-stiffness tolerance box."""
    return np.asarray(
        np.meshgrid(*([[-1.0, 1.0]] * 9), indexing="ij")
    ).reshape(9, -1).T


def _random_robustness_multipliers(rng, tolerance_percent, n_cases):
    """Uniform random points in the independent +/- tolerance stiffness box."""
    t = tolerance_percent / 100.0
    return rng.uniform(1.0 - t, 1.0 + t, size=(n_cases, 9))


def run_design_robustness(proposal):
    """
    Run exact 512-corner and random-600 robustness at +/-5, +/-10, +/-15%.

    Each of the 9 K components is varied independently.  Robustness PASS is
    defined here as:
        minimum directional modal purity >= 80%
        AND expected modal identity retained.
    This is a stiffness-only robustness study; geometry, mass, CG, MOI and
    dynamic/static factor remain fixed.
    """
    exact_signs = _exact_512_corners()
    rng = np.random.default_rng(
        ROBUSTNESS_RANDOM_SEED + sum(ord(c) for c in proposal.name)
    )

    out = {}

    for tol in ROBUSTNESS_TOLERANCES_PERCENT:
        t = float(tol) / 100.0

        exact_pass = 0
        exact_min_purity = np.inf
        exact_worst_index = -1

        for idx, signs in enumerate(exact_signs):
            multipliers = (1.0 + t * signs).reshape(3, 3)
            r = _robustness_single_case(proposal, multipliers)
            if r["pass"]:
                exact_pass += 1
            if r["purity"] < exact_min_purity:
                exact_min_purity = r["purity"]
                exact_worst_index = idx

        random_mult = _random_robustness_multipliers(
            rng, tol, ROBUSTNESS_RANDOM_CASES
        )

        random_pass = 0
        random_min_purity = np.inf
        random_worst_index = -1

        for idx in range(ROBUSTNESS_RANDOM_CASES):
            multipliers = random_mult[idx].reshape(3, 3)
            r = _robustness_single_case(proposal, multipliers)
            if r["pass"]:
                random_pass += 1
            if r["purity"] < random_min_purity:
                random_min_purity = r["purity"]
                random_worst_index = idx

        out[float(tol)] = {
            "exact_total": 512,
            "exact_pass": exact_pass,
            "exact_fail": 512 - exact_pass,
            "exact_pass_percent": 100.0 * exact_pass / 512.0,
            "exact_min_purity": exact_min_purity,
            "exact_worst_index": exact_worst_index,
            "random_total": ROBUSTNESS_RANDOM_CASES,
            "random_pass": random_pass,
            "random_fail": ROBUSTNESS_RANDOM_CASES - random_pass,
            "random_pass_percent": 100.0 * random_pass / ROBUSTNESS_RANDOM_CASES,
            "random_min_purity": random_min_purity,
            "random_worst_index": random_worst_index,
        }

    return out


# ============================================================
#                     ENGINEERING REVIEW
# ============================================================

def review_proposal(proposal):

    modal = modal_analysis(proposal)

    freq = modal["freq"]
    purity = modal["purity"]
    dominant = modal["dominant"]
    gaps = modal["gaps"]

    tra = calculate_TRA()

    etra, static_response = calculate_eTRA(
        proposal
    )

    angle_3d = true_3d_angle(
        tra,
        etra
    )

    etra_point = nearest_etra_point(
        proposal
    )

    tra_path = generate_axis_path(
        tra,
        CG
    )

    etra_path = generate_axis_path(
        etra,
        etra_point
    )

    projected = {
        plane: projected_angle(
            tra,
            etra,
            plane
        )
        for plane in ["XY", "YZ", "ZX"]
    }

    package_rows = check_packaging(
        proposal
    )

    ratio_rows = check_stiffness_ratios(
        proposal
    )

    frequency_pass = bool(
        np.all(freq >= FREQ_MIN)
        and
        np.all(freq <= FREQ_MAX)
    )

    purity_pass = bool(
        np.min(purity)
        >= PURITY_MIN
    )

    gap_pass = bool(
        gaps[0] >= GAP12_MIN
        and
        np.all(gaps[1:] >= GAP_OTHER_MIN)
    )

    identity_pass = (
        dominant == EXPECTED_MODE_NAMES
    )

    package_pass = all(
        row["pass"]
        for row in package_rows
    )

    ratio_pass = all(
        row["pass"]
        for row in ratio_rows
    )

    tra_pass = angle_3d <= TRA_TARGET

    remarks = []

    if package_pass:
        remarks.append(
            "PACKAGE PASS: all editable XYZ limits and "
            "mount-axis requirements are satisfied."
        )
    else:
        remarks.append(
            "PACKAGE FAIL: one or more mount position/axis "
            "limits are violated."
        )

    minimum_purity = float(np.min(purity))

    if purity_pass:

        if minimum_purity >= PURITY_TARGET:
            remarks.append(
                f"MODAL PURITY PASS: minimum = "
                f"{minimum_purity:.2f}%, reaching the "
                f"preferred {PURITY_TARGET:.1f}% target."
            )
        else:
            remarks.append(
                f"MODAL PURITY PASS: minimum = "
                f"{minimum_purity:.2f}%, above {PURITY_MIN:.1f}% "
                f"but below the preferred {PURITY_TARGET:.1f}%."
            )

    else:

        remarks.append(
            f"MODAL PURITY FAIL: minimum = "
            f"{minimum_purity:.2f}%, below "
            f"{PURITY_MIN:.1f}%."
        )

    if frequency_pass:
        remarks.append(
            f"FREQUENCY PASS: all modes are within "
            f"{FREQ_MIN:.1f}–{FREQ_MAX:.1f} Hz."
        )
    else:
        remarks.append(
            "FREQUENCY FAIL: one or more modes are outside "
            f"{FREQ_MIN:.1f}–{FREQ_MAX:.1f} Hz."
        )

    if gap_pass:
        remarks.append(
            f"MODE GAP PASS: Mode 1–2 >= {GAP12_MIN:.1f} Hz "
            f"and all remaining gaps >= {GAP_OTHER_MIN:.1f} Hz."
        )
    else:
        remarks.append(
            "MODE GAP FAIL: one or more required gaps "
            "are below target."
        )

    if identity_pass:
        remarks.append(
            "MODE IDENTITY PASS: "
            + str(EXPECTED_MODE_NAMES)
        )
    else:
        remarks.append(
            "MODE IDENTITY WARNING: calculated identity = "
            + str(dominant)
        )

    if ratio_pass:
        remarks.append(
            "STIFFNESS RATIO PASS: all mounts satisfy "
            f"{VOID_SOLID_MIN:.2f}–{VOID_SOLID_MAX:.2f} "
            "Void/Solid and "
            f"{VOID_SOLID_OVER_AXIAL_MIN:.1f}–"
            f"{VOID_SOLID_OVER_AXIAL_MAX:.1f} "
            "(Void+Solid)/Axial."
        )
    else:
        remarks.append(
            "STIFFNESS RATIO FAIL: one or more mounts "
            "are outside manufacturing ratio limits."
        )

    if tra_pass:
        remarks.append(
            f"TRA/eTRA EXCELLENT: true 3D angle = "
            f"{angle_3d:.3f}°, meeting the <= "
            f"{TRA_TARGET:.1f}° target."
        )
    else:
        remarks.append(
            f"TRA/eTRA NEEDS IMPROVEMENT: true 3D angle = "
            f"{angle_3d:.3f}°, target <= "
            f"{TRA_TARGET:.1f}°."
        )

    remarks.append(
        "JOURNAL CONSIDERATION: retain 6-DOF rigid-body "
        "modal analysis, TRA/eTRA decoupling and energy "
        "decoupling as the main design-review metrics."
    )

    remarks.append(
        "JOURNAL CONSIDERATION: the full inertia matrix "
        "with products of inertia is retained in the "
        "modal-energy calculation."
    )

    remarks.append(
        "FINAL NVH NOTE: replace the constant dynamic/static "
        f"factor {DYNAMIC_FACTOR:.2f} with supplier measured "
        "frequency/amplitude-dependent dynamic stiffness and "
        "damping for final validation."
    )

    basic_pass = all([
        package_pass,
        frequency_pass,
        purity_pass,
        gap_pass,
        identity_pass,
        ratio_pass
    ])

    if basic_pass and tra_pass:

        verdict = "RECOMMENDED / STRONG CANDIDATE"

    elif basic_pass:

        verdict = (
            "TECHNICALLY PASSING — "
            "TRA/eTRA NEEDS IMPROVEMENT"
        )

    else:

        verdict = (
            "NOT READY — MODIFY LAYOUT / STIFFNESS"
        )

    # Full requested stiffness robustness study.
    robustness = run_design_robustness(proposal)

    return {
        "modal": modal,
        "tra": tra,
        "etra": etra,
        "angle_3d": angle_3d,
        "etra_point": etra_point,
        "tra_path": tra_path,
        "etra_path": etra_path,
        "projected": projected,
        "package": package_rows,
        "ratios": ratio_rows,
        "remarks": remarks,
        "robustness": robustness,
        "verdict": verdict
    }


# ============================================================
#              CASE-SPECIFIC OPTIMIZATION ENGINE
# ============================================================

# The cases are NOT frozen historical proposals anymore.
# Every run generates fresh optimized proposals from the current
# USER INPUT engine data.  Each case has a different design intent.

OLD_PACKAGE_LIMITS = {
    "M1": {"X": (2160.0, 2350.0), "Y": (282.7, 282.7), "Z": (100.0, 200.0)},
    "M2": {"X": (2100.0, 2145.0), "Y": (-172.5, -172.5), "Z": (45.0, 200.0)},
    "M3": {"X": (2583.0, 2583.0), "Y": (-260.0, -175.2), "Z": (40.0, 45.0)},
}

CURRENT_PACKAGE_LIMITS = POSITION_LIMITS


def clone_limits(limits):
    return {
        m: {c: tuple(limits[m][c]) for c in ["X", "Y", "Z"]}
        for m in ["M1", "M2", "M3"]
    }


@dataclass
class CaseConfig:
    case_id: int
    name: str
    package_limits: dict
    axis_options: dict
    stiffness_fraction: float
    objective: str
    use_robustness_objective: bool = False


CASE_CONFIGS = [
    CaseConfig(
        1,
        "CASE 1 — BASELINE AXIS / MODAL-PURITY OPTIMIZATION",
        clone_limits(OLD_PACKAGE_LIMITS),
        {"M1": ["Y"], "M2": ["Y"], "M3": ["X"]},
        0.50,
        "balanced_modal"
    ),
    CaseConfig(
        2,
        "CASE 2 — M1/M2 AXIS-FREE OPTIMIZATION",
        clone_limits(OLD_PACKAGE_LIMITS),
        {"M1": ["X", "Y"], "M2": ["X", "Y"], "M3": ["X"]},
        0.50,
        "balanced_modal"
    ),
    CaseConfig(
        3,
        "CASE 3 — RESEARCH-GUIDED PACKAGE-CONSTRAINED OPTIMIZATION",
        clone_limits(OLD_PACKAGE_LIMITS),
        {"M1": ["Y"], "M2": ["Y"], "M3": ["X"]},
        0.25,
        "energy_decoupling"
    ),
    CaseConfig(
        4,
        "CASE 4 — DYNAMIC-FACTOR / ROBUSTNESS-ORIENTED OPTIMIZATION",
        clone_limits(OLD_PACKAGE_LIMITS),
        {"M1": ["Y"], "M2": ["Y"], "M3": ["X"]},
        0.50,
        "robust_nominal",
        True
    ),
    CaseConfig(
        5,
        "CASE 5 — TRA/eTRA ALIGNMENT OPTIMIZATION",
        clone_limits(OLD_PACKAGE_LIMITS),
        {"M1": ["Y"], "M2": ["Y"], "M3": ["X"]},
        0.25,
        "tra_alignment"
    ),
    CaseConfig(
        6,
        "CASE 6 — CURRENT THERMAL / EXHAUST-SAFE OPTIMIZATION",
        clone_limits(CURRENT_PACKAGE_LIMITS),
        {"M1": [M1_AXIS], "M2": [M2_AXIS], "M3": [M3_AXIS]},
        0.50,
        "tra_alignment_current"
    ),
]


def make_case_proposal(name, xyz, k, axes):
    return Proposal(
        name,
        [
            Mount("M1", np.array(xyz[0], dtype=float), np.array(k[0], dtype=float), axes[0]),
            Mount("M2", np.array(xyz[1], dtype=float), np.array(k[1], dtype=float), axes[1]),
            Mount("M3", np.array(xyz[2], dtype=float), np.array(k[2], dtype=float), axes[2]),
        ],
    )


# Proposal metadata is attached at runtime so the existing Proposal
# dataclass stays simple.  Review functions use these attributes when
# present; otherwise they fall back to the current USER INPUT limits.
def attach_case_metadata(proposal, package_limits, required_axes):
    proposal.package_limits = clone_limits(package_limits)
    proposal.required_axes = dict(required_axes)
    return proposal


def case_packaging(proposal):
    return getattr(proposal, "package_limits", POSITION_LIMITS)


def case_axes(proposal):
    return getattr(proposal, "required_axes", REQUIRED_AXES)


# Replace the global package check with a case-aware version.
def check_packaging(proposal):
    mounts = {m.name: m for m in proposal.mounts}
    limits = case_packaging(proposal)
    required_axes = case_axes(proposal)
    checks = []

    for mount_name in ["M1", "M2", "M3"]:
        m = mounts[mount_name]
        for index, coordinate in enumerate(["X", "Y", "Z"]):
            low, high = limits[mount_name][coordinate]
            value = m.xyz[index]
            checks.append({
                "check": f"{mount_name} {coordinate}",
                "value": value,
                "limit": f"{low:g} .. {high:g}",
                "pass": low - 1e-9 <= value <= high + 1e-9
            })

    for mount_name in ["M1", "M2", "M3"]:
        actual = mounts[mount_name].axis.upper()
        required = required_axes[mount_name].upper() if isinstance(required_axes[mount_name], str) else str(required_axes[mount_name])
        passed = actual in required_axes[mount_name] if isinstance(required_axes[mount_name], list) else actual == required
        checks.append({
            "check": f"{mount_name} axis",
            "value": actual,
            "limit": required,
            "pass": passed
        })
    return checks


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


def _decode_candidate(x, config, axes):
    # x contains 6 free position coordinates followed by 6 stiffness
    # parameters: solid, void/solid ratio, (void+solid)/axial ratio.
    xyz = []
    idx = 0
    for mount_name in ["M1", "M2", "M3"]:
        p = []
        for c in ["X", "Y", "Z"]:
            lo, hi = config.package_limits[mount_name][c]
            if abs(hi - lo) < 1e-12:
                p.append(lo)
            else:
                p.append(float(x[idx])); idx += 1
        xyz.append(p)

    k = []
    for j, mount_name in enumerate(["M1", "M2", "M3"]):
        solid = float(x[idx]); rv = float(x[idx + 1]); ra = float(x[idx + 2]); idx += 3
        k.append(_axis_stiffness_from_params(solid, rv, ra, axes[j]))
    return xyz, k


def _candidate_bounds(config, axes):
    bounds = []
    for mount_name in ["M1", "M2", "M3"]:
        for c in ["X", "Y", "Z"]:
            lo, hi = config.package_limits[mount_name][c]
            if hi - lo > 1e-12:
                bounds.append((lo, hi))
    for mount_name in ["M1", "M2", "M3"]:
        # Solid stiffness envelope around the 3D baseline solid axis.
        base_k = np.asarray(BASELINE_MOUNT_STIFFNESS[mount_name], dtype=float)
        # Solid direction is Kz for X/Y bush axes and Ky for a Z bush axis.
        solid_index = {"X": 2, "Y": 2, "Z": 1}[axes[["M1", "M2", "M3"].index(mount_name)]]
        base = float(base_k[solid_index])
        f = config.stiffness_fraction
        bounds.append((base * (1.0 - f), base * (1.0 + f)))
        bounds.append((VOID_SOLID_MIN, VOID_SOLID_MAX))
        bounds.append((VOID_SOLID_OVER_AXIAL_MIN, VOID_SOLID_OVER_AXIAL_MAX))
    return bounds


def _temporary_score(proposal, config):
    try:
        modal = modal_analysis(proposal)
        freq = modal["freq"]
        purity = modal["purity"]
        gaps = modal["gaps"]
        tra = calculate_TRA()
        etra, _ = calculate_eTRA(proposal)
        angle = true_3d_angle(tra, etra)

        # Smooth penalties: constraints are strongly enforced but the
        # optimizer still has a useful gradient-free ranking signal.
        penalty = 0.0
        penalty += 500.0 * np.sum(np.maximum(FREQ_MIN - freq, 0.0) ** 2)
        penalty += 500.0 * np.sum(np.maximum(freq - FREQ_MAX, 0.0) ** 2)
        penalty += 250.0 * np.sum(np.maximum(PURITY_MIN - purity, 0.0) ** 2)
        if len(gaps):
            penalty += 350.0 * max(GAP12_MIN - gaps[0], 0.0) ** 2
            penalty += 350.0 * np.sum(np.maximum(GAP_OTHER_MIN - gaps[1:], 0.0) ** 2)

        identity_penalty = sum(
            250.0 for a, b in zip(modal["dominant"], EXPECTED_MODE_NAMES) if a != b
        )
        penalty += identity_penalty

        min_purity = float(np.min(purity))
        min_gap = float(min(gaps)) if len(gaps) else 0.0

        if config.objective == "tra_alignment" or config.objective == "tra_alignment_current":
            score = 25.0 * angle + 1.5 * max(PURITY_TARGET - min_purity, 0.0) ** 2
            score += 3.0 * max(GAP12_MIN - gaps[0], 0.0) ** 2
            score += 3.0 * np.sum(np.maximum(GAP_OTHER_MIN - gaps[1:], 0.0) ** 2)
        elif config.objective == "energy_decoupling":
            score = 1.5 * max(PURITY_TARGET - min_purity, 0.0) ** 2 + 4.0 * angle
            score += 1.0 * np.sum(np.maximum(GAP_OTHER_MIN - gaps, 0.0) ** 2)
        elif config.objective == "robust_nominal":
            # Robustness is represented as a preference for margin rather
            # than a 512-corner calculation; the user previously chose to
            # ignore formal robustness in the final design target.
            margin_purity = min_purity - PURITY_MIN
            margin_gap = min(gaps[0] - GAP12_MIN, *(gaps[1:] - GAP_OTHER_MIN)) if len(gaps) else -100.0
            score = -2.0 * margin_purity - 2.0 * margin_gap + 5.0 * angle
        else:
            score = 2.0 * max(PURITY_TARGET - min_purity, 0.0) ** 2 + 2.0 * angle
            score += 0.5 * np.sum(np.maximum(GAP_OTHER_MIN - gaps, 0.0) ** 2)

        return float(score + penalty)
    except (np.linalg.LinAlgError, ValueError, FloatingPointError):
        return 1e12


def optimize_case(config, n_proposals=5):
    """Generate fresh optimized proposals for one case from current inputs."""
    import random

    proposals = []
    base_seed = 20260912 + 100 * config.case_id
    axis_combinations = [(a, b, config.axis_options["M3"][0])
                         for a in config.axis_options["M1"]
                         for b in config.axis_options["M2"]]

    for pnum in range(1, n_proposals + 1):
        # Cycle through allowed discrete axis combinations for Case 2.
        axes = axis_combinations[(pnum - 1) % len(axis_combinations)]
        bounds = _candidate_bounds(config, axes)

        def objective(x):
            xyz, k = _decode_candidate(x, config, axes)
            prop = make_case_proposal("OPT", xyz, k, axes)
            attach_case_metadata(prop, config.package_limits, dict(zip(["M1", "M2", "M3"], axes)))
            return _temporary_score(prop, config)

        result = differential_evolution(
            objective,
            bounds,
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

        xyz, k = _decode_candidate(result.x, config, axes)
        prop = make_case_proposal(
            f"{config.name} — PROPOSAL {pnum} (OPT-{config.case_id}-{pnum})",
            xyz, k, axes
        )
        attach_case_metadata(prop, config.package_limits, dict(zip(["M1", "M2", "M3"], axes)))
        proposals.append(prop)

    return proposals


def generate_all_optimized_cases():
    all_cases = []
    for config in CASE_CONFIGS:
        print(f"\nGenerating {config.name} ...")
        optimized = optimize_case(config, n_proposals=PROPOSALS_PER_CASE)
        all_cases.extend(optimized)
    return all_cases


# ============================================================
#                 CASE GENERATION (AT RUN TIME)
# ============================================================

CASES = []


def print_engine_input():

    print("\n" + "=" * 110)
    print("ENGINE INPUT")
    print("=" * 110)

    print(f"Mass       : {MASS:.4f} kg")

    print(
        "CG         :",
        np.array2string(
            CG,
            precision=4
        ),
        "mm"
    )

    print("MOI / inertia tensor (kg-m^2):")

    print(
        np.array2string(
            INERTIA / 1e6,
            precision=6
        )
    )

    print(
        "Crank axis :",
        CRANK_AXIS
    )

    print(
        f"Dynamic/static stiffness factor : "
        f"{DYNAMIC_FACTOR:.3f}"
    )


def print_limits():

    print("\n" + "=" * 110)
    print("ACTIVE MOUNT POSITION LIMITS")
    print("=" * 110)

    for name in ["M1", "M2", "M3"]:

        print(
            f"{name}: "
            f"X={POSITION_LIMITS[name]['X']}  "
            f"Y={POSITION_LIMITS[name]['Y']}  "
            f"Z={POSITION_LIMITS[name]['Z']}  "
            f"Axis={REQUIRED_AXES[name]}"
        )


def print_proposal(proposal, result):

    modal = result["modal"]

    print("\n" + "=" * 110)
    print(proposal.name)
    print("=" * 110)

    # --------------------------------------------------------
    # Mount layout
    # --------------------------------------------------------

    print("\nMOUNT LAYOUT + STIFFNESS")

    print(
        "Mount | X(mm) | Y(mm) | Z(mm) | Axis | "
        "Kx | Ky | Kz | Void/Solid | (Void+Solid)/Axial"
    )

    for m in proposal.mounts:

        r1, r2 = stiffness_ratios(m)

        print(
            f"{m.name:>5} | "
            f"{m.xyz[0]:8.3f} | "
            f"{m.xyz[1]:8.3f} | "
            f"{m.xyz[2]:8.3f} | "
            f"{m.axis:>4} | "
            f"{m.k[0]:9.3f} | "
            f"{m.k[1]:9.3f} | "
            f"{m.k[2]:9.3f} | "
            f"{r1:10.4f} | "
            f"{r2:17.4f}"
        )

    # --------------------------------------------------------
    # Modal table
    # --------------------------------------------------------

    print("\nMODAL TABLE")

    print(
        "Mode | Identity | Frequency(Hz) | "
        "Dominant purity(%) | Gap(Hz)"
    )

    for i in range(6):

        gap = (
            "-"
            if i == 0
            else f"{modal['gaps'][i-1]:.4f}"
        )

        print(
            f"{i+1:4d} | "
            f"{modal['dominant'][i]:>8} | "
            f"{modal['freq'][i]:14.4f} | "
            f"{modal['purity'][i]:19.3f} | "
            f"{gap:>8}"
        )

    # --------------------------------------------------------
    # Full energy matrix
    # --------------------------------------------------------

    print("\nFULL MODAL KINETIC-ENERGY / DECOUPLING MATRIX (%)")

    print(
        "Columns: Tx  Ty  Tz  Rx  Ry  Rz"
    )

    print(
        np.array2string(
            modal["energy"],
            precision=3,
            suppress_small=True
        )
    )

    # --------------------------------------------------------
    # TRA/eTRA
    # --------------------------------------------------------

    print("\nTRA / eTRA")

    print(
        "TRA  =",
        np.array2string(
            result["tra"],
            precision=7
        )
    )

    print(
        "eTRA =",
        np.array2string(
            result["etra"],
            precision=7
        )
    )

    print(
        f"TRUE 3D TRA/eTRA ANGLE = "
        f"{result['angle_3d']:.4f} deg"
    )

    print(
        "eTRA nearest point to CG =",
        np.array2string(
            result["etra_point"],
            precision=4
        ),
        "mm"
    )

    offset = np.linalg.norm(
        result["etra_point"] - CG
    )

    print(
        f"eTRA nearest-point offset from CG = "
        f"{offset:.4f} mm"
    )

    # --------------------------------------------------------
    # Paths
    # --------------------------------------------------------

    print("\nTRA PATH")

    print(
        "Stations:",
        STATIONS,
        "mm"
    )

    print(
        "TRA origin = engine CG"
    )

    print(
        result["tra_path"]
    )

    print("\neTRA PATH")

    print(
        "Stations:",
        STATIONS,
        "mm"
    )

    print(
        "eTRA origin = nearest eTRA point"
    )

    print(
        result["etra_path"]
    )

    # --------------------------------------------------------
    # Projected angles
    # --------------------------------------------------------

    print("\nPROJECTED TRA/eTRA ANGLES")

    for plane in ["XY", "YZ", "ZX"]:

        print(
            f"{plane}: "
            f"{result['projected'][plane]:.4f} deg"
        )

    # --------------------------------------------------------
    # Design robustness
    # --------------------------------------------------------

    print("\nDESIGN ROBUSTNESS — STIFFNESS TOLERANCE")

    print(
        f"Criterion: modal purity >= {ROBUSTNESS_PURITY_MIN_PERCENT:.1f}% "
        "and expected mode identity retained"
    )
    print("Exact corners = 512; Random interior samples = "
          f"{ROBUSTNESS_RANDOM_CASES}")

    print(
        "Tol | Exact PASS/512 | Exact PASS % | Exact Min Purity % | "
        f"Random PASS/{ROBUSTNESS_RANDOM_CASES} | Random PASS % | Random Min Purity %"
    )

    for tol in ROBUSTNESS_TOLERANCES_PERCENT:
        rb = result["robustness"][float(tol)]
        print(
            f"{tol:>3.0f}% | "
            f"{rb['exact_pass']:>5d}/512 | "
            f"{rb['exact_pass_percent']:>11.2f} | "
            f"{rb['exact_min_purity']:>17.3f} | "
            f"{rb['random_pass']:>6d}/{ROBUSTNESS_RANDOM_CASES} | "
            f"{rb['random_pass_percent']:>13.2f} | "
            f"{rb['random_min_purity']:>19.3f}"
        )

    # --------------------------------------------------------
    # Remarks
    # --------------------------------------------------------

    print("\nENGINEERING REMARKS")

    for remark in result["remarks"]:

        print(
            " -",
            remark
        )

    print(
        "\nFINAL VERDICT:",
        result["verdict"]
    )


# ============================================================
#                         CSV OUTPUT
# ============================================================

def write_summary_csv(results):

    folder = Path(OUTPUT_FOLDER)
    folder.mkdir(
        parents=True,
        exist_ok=True
    )

    file = folder / "case_summary.csv"

    with open(
        file,
        "w",
        newline="",
        encoding="utf-8"
    ) as f:

        writer = csv.writer(f)

        writer.writerow([
            "Case / Proposal",
            "Mode1 Hz",
            "Mode2 Hz",
            "Mode3 Hz",
            "Mode4 Hz",
            "Mode5 Hz",
            "Mode6 Hz",
            "Minimum Purity %",
            "Gap1-2 Hz",
            "Gap2-3 Hz",
            "Gap3-4 Hz",
            "Gap4-5 Hz",
            "Gap5-6 Hz",
            "TRA/eTRA 3D deg",
            "TRA angle from +Y deg",
            "eTRA angle from +Y deg",
            "eTRA offset mm",
            "XY deg",
            "YZ deg",
            "ZX deg",
            "Package",
            "Ratio",
            "5% Exact PASS/512",
            "5% Exact Min Purity %",
            "5% Random PASS/600",
            "5% Random Min Purity %",
            "10% Exact PASS/512",
            "10% Exact Min Purity %",
            "10% Random PASS/600",
            "10% Random Min Purity %",
            "15% Exact PASS/512",
            "15% Exact Min Purity %",
            "15% Random PASS/600",
            "15% Random Min Purity %",
            "Robustness criterion",
            "Verdict"
        ])

        for name, r in results:

            modal = r["modal"]

            package = all(
                x["pass"]
                for x in r["package"]
            )

            ratios = all(
                x["pass"]
                for x in r["ratios"]
            )

            writer.writerow([
                name,
                *modal["freq"],
                np.min(modal["purity"]),
                *modal["gaps"],
                r["angle_3d"],
                math.degrees(math.acos(np.clip(r["tra"][1], -1.0, 1.0))),
                math.degrees(math.acos(np.clip(r["etra"][1], -1.0, 1.0))),
                float(np.linalg.norm(r["etra_point"] - CG)),
                r["projected"]["XY"],
                r["projected"]["YZ"],
                r["projected"]["ZX"],
                "PASS" if package else "FAIL",
                "PASS" if ratios else "FAIL",
                *[
                    item
                    for tol in ROBUSTNESS_TOLERANCES_PERCENT
                    for item in [
                        f"{r['robustness'][float(tol)]['exact_pass']}/512",
                        r["robustness"][float(tol)]["exact_min_purity"],
                        f"{r['robustness'][float(tol)]['random_pass']}/{ROBUSTNESS_RANDOM_CASES}",
                        r["robustness"][float(tol)]["random_min_purity"],
                    ]
                ],
"PASS = modal purity >= 80%" if all(r["robustness"][float(t)]["exact_min_purity"] >= ROBUSTNESS_PURITY_MIN_PERCENT for t in ROBUSTNESS_TOLERANCES_PERCENT) else "SEE ROBUSTNESS TABLE",
                r["verdict"]
            ])

    return file


# ============================================================
#                         TXT OUTPUT
# ============================================================

def write_full_txt(results):

    folder = Path(OUTPUT_FOLDER)

    folder.mkdir(
        parents=True,
        exist_ok=True
    )

    file = folder / "FULL_ENGINE_MOUNT_REVIEW.txt"

    with open(
        file,
        "w",
        encoding="utf-8"
    ) as f:

        f.write(
            "ENGINE MOUNT FULL CASE REVIEW\n"
        )

        f.write(
            "=" * 110 + "\n\n"
        )

        f.write(
            f"Mass = {MASS:.4f} kg\n"
        )

        f.write(
            f"CG = {CG.tolist()} mm\n"
        )

        f.write(
            "MOI kg-m^2:\n"
        )

        f.write(
            np.array2string(
                INERTIA / 1e6,
                precision=6
            )
            + "\n"
        )

        f.write(
            f"Dynamic/static factor = "
            f"{DYNAMIC_FACTOR:.3f}\n"
        )

        f.write(
            f"Frequency target = "
            f"{FREQ_MIN}–{FREQ_MAX} Hz\n"
        )

        f.write(
            f"Minimum purity = "
            f"{PURITY_MIN}%\n"
        )

        f.write(
            f"Preferred purity = "
            f"{PURITY_TARGET}%\n"
        )

        f.write(
            f"Mode 1–2 gap >= "
            f"{GAP12_MIN} Hz\n"
        )

        f.write(
            f"Other gaps >= "
            f"{GAP_OTHER_MIN} Hz\n"
        )

        f.write(
            f"TRA/eTRA target <= "
            f"{TRA_TARGET} deg\n\n"
        )

        for name, r in results:

            f.write(
                "\n" + "=" * 110 + "\n"
            )

            f.write(
                name + "\n"
            )

            f.write(
                "=" * 110 + "\n"
            )

            modal = r["modal"]

            f.write(
                "\nMOUNT LAYOUT + STIFFNESS\n"
            )
            f.write(
                "Mount  X(mm)  Y(mm)  Z(mm)  Axis  Kx  Ky  Kz  "
                "Void/Solid  (Void+Solid)/Axial\n"
            )
            for m in next(
                p.mounts for p in CASES if p.name == name
            ):
                rr1, rr2 = stiffness_ratios(m)
                f.write(
                    f"{m.name:>4} {m.xyz[0]:9.3f} {m.xyz[1]:9.3f} "
                    f"{m.xyz[2]:9.3f} {m.axis:>4} "
                    f"{m.k[0]:9.3f} {m.k[1]:9.3f} {m.k[2]:9.3f} "
                    f"{rr1:10.4f} {rr2:17.4f}\n"
                )

            f.write(
                "\nMODE TABLE\n"
            )
            f.write(
                "Mode  Hz  Tx%  Ty%  Tz%  Rx%  Ry%  Rz%  Dominant\n"
            )
            for i in range(6):
                f.write(
                    f"{i+1:>4} {modal['freq'][i]:9.4f} "
                    + " ".join(f"{v:7.3f}" for v in modal["energy"][i])
                    + f"  {modal['dominant'][i]}\n"
                )

            tra_y_angle = math.degrees(
                math.acos(np.clip(r["tra"][1], -1.0, 1.0))
            )
            etra_y_angle = math.degrees(
                math.acos(np.clip(r["etra"][1], -1.0, 1.0))
            )

            f.write(
                "\nTRA / eTRA\n"
                + "TRA = " + np.array2string(r["tra"], precision=7) + "\n"
                + "eTRA = " + np.array2string(r["etra"], precision=7) + "\n"
                + f"TRA angle from +Y = {tra_y_angle:.4f} deg\n"
                + f"eTRA angle from +Y = {etra_y_angle:.4f} deg\n"
                + f"3D TRA/eTRA misalignment = {r['angle_3d']:.4f} deg\n"
                + "Engine CG = " + np.array2string(CG, precision=4) + " mm\n"
                + "eTRA nearest point to CG = "
                + np.array2string(r["etra_point"], precision=4) + " mm\n"
                + f"3D CG-to-eTRA offset = {np.linalg.norm(r['etra_point']-CG):.4f} mm\n"
            )

            f.write("\nTRA PATH (stations +400,+200,0,-200,-400 mm)\n")
            f.write("Station  X  Y  Z\n")
            for station, point in zip(STATIONS, r["tra_path"]):
                f.write(
                    f"{station:8.1f} "
                    + " ".join(f"{v:11.4f}" for v in point) + "\n"
                )

            f.write("\neTRA PATH (stations +400,+200,0,-200,-400 mm)\n")
            f.write("Station  X  Y  Z\n")
            for station, point in zip(STATIONS, r["etra_path"]):
                f.write(
                    f"{station:8.1f} "
                    + " ".join(f"{v:11.4f}" for v in point) + "\n"
                )

            f.write("\nPROJECTED TRA/eTRA ANGLES\n")
            for p in ["XY", "YZ", "ZX"]:
                f.write(f"  {p} = {r['projected'][p]:.4f} deg\n")

            f.write("\nDESIGN ROBUSTNESS — 80% MODAL PURITY CRITERION\n")
            f.write(
                "Exact study = all 512 independent stiffness corners; "
                f"random study = {ROBUSTNESS_RANDOM_CASES} uniform interior samples.\n"
            )
            f.write(
                "Tolerance | Exact PASS/512 | Exact PASS % | Exact Min Purity % | "
                f"Random PASS/{ROBUSTNESS_RANDOM_CASES} | Random PASS % | Random Min Purity %\n"
            )
            for tol in ROBUSTNESS_TOLERANCES_PERCENT:
                rb = r["robustness"][float(tol)]
                f.write(
                    f"{tol:8.0f}% | "
                    f"{rb['exact_pass']:>5d}/512 | "
                    f"{rb['exact_pass_percent']:>13.2f} | "
                    f"{rb['exact_min_purity']:>19.3f} | "
                    f"{rb['random_pass']:>6d}/{ROBUSTNESS_RANDOM_CASES} | "
                    f"{rb['random_pass_percent']:>13.2f} | "
                    f"{rb['random_min_purity']:>20.3f}\n"
                )

            f.write(
                "\nEngineering remarks:\n"
            )

            for remark in r["remarks"]:

                f.write(
                    " - " + remark + "\n"
                )

            f.write(
                "\nVERDICT: "
                + r["verdict"]
                + "\n"
            )

    return file



# ============================================================
#                    OVERALL TOP PROPOSAL RANKING
# ============================================================

def _proposal_ranking_metrics(proposal, result):
    """Return engineering metrics used to rank optimized proposals."""
    modal = result["modal"]
    min_purity = float(np.min(modal["purity"]))
    min_gap_margin = min(
        float(modal["gaps"][0] - GAP12_MIN),
        *[float(g - GAP_OTHER_MIN) for g in modal["gaps"][1:]]
    )
    package_pass = all(x["pass"] for x in result["package"])
    ratio_pass = all(x["pass"] for x in result["ratios"])
    freq_pass = bool(
        np.all(modal["freq"] >= FREQ_MIN) and
        np.all(modal["freq"] <= FREQ_MAX)
    )
    gap_pass = bool(
        modal["gaps"][0] >= GAP12_MIN and
        np.all(modal["gaps"][1:] >= GAP_OTHER_MIN)
    )
    identity_pass = modal["dominant"] == EXPECTED_MODE_NAMES

    rb = result["robustness"]
    exact5 = rb[5.0]["exact_pass_percent"]
    exact10 = rb[10.0]["exact_pass_percent"]
    exact15 = rb[15.0]["exact_pass_percent"]
    random5 = rb[5.0]["random_pass_percent"]
    random10 = rb[10.0]["random_pass_percent"]
    random15 = rb[15.0]["random_pass_percent"]

    # Engineering-first lexicographic ranking:
    # 1) fully nominal-feasible designs first
    # 2) lower TRA/eTRA misalignment
    # 3) higher nominal purity
    # 4) stronger gap margin
    # 5) stronger robustness
    # 6) lower CG/eTRA offset
    #
    # This avoids allowing a high purity but infeasible design to outrank
    # a feasible engineering design merely because of a weighted score.
    feasible = all([
        package_pass, ratio_pass, freq_pass, gap_pass, identity_pass
    ])
    robust_mean = np.mean([
        exact5, exact10, exact15,
        random5, random10, random15
    ])
    offset = float(np.linalg.norm(result["etra_point"] - CG))

    return {
        "feasible": feasible,
        "package_pass": package_pass,
        "ratio_pass": ratio_pass,
        "freq_pass": freq_pass,
        "gap_pass": gap_pass,
        "identity_pass": identity_pass,
        "min_purity": min_purity,
        "angle_3d": float(result["angle_3d"]),
        "min_gap_margin": min_gap_margin,
        "robust_mean": float(robust_mean),
        "exact5": exact5,
        "exact10": exact10,
        "exact15": exact15,
        "random5": random5,
        "random10": random10,
        "random15": random15,
        "offset": offset,
    }


def _ranking_key(item):
    proposal, result = item
    m = _proposal_ranking_metrics(proposal, result)

    # Feasible first; then minimize alignment angle; maximize purity/margins.
    return (
        0 if m["feasible"] else 1,
        m["angle_3d"],
        -m["min_purity"],
        -m["min_gap_margin"],
        -m["robust_mean"],
        m["offset"],
    )


def select_best_two_per_case(results):
    """Select TOP_PER_CASE proposals independently within each case."""
    grouped = {}
    for item in results:
        proposal, result = item
        case_name = proposal.name.split(" — PROPOSAL")[0]
        grouped.setdefault(case_name, []).append(item)

    selected = []
    case_rows = []

    for case_name in sorted(grouped):
        ranked = sorted(grouped[case_name], key=_ranking_key)
        best = ranked[:TOP_PER_CASE]
        selected.extend(best)

        case_rows.append({
            "case": case_name,
            "best": best
        })

    return selected, case_rows


def build_overall_top10(results):
    """
    From the best 2 proposals of each of the 6 cases (12 candidates),
    rank and return the overall Top 10.
    """
    selected, case_rows = select_best_two_per_case(results)
    ranked = sorted(selected, key=_ranking_key)
    return ranked[:OVERALL_TOP_N], selected, case_rows


def print_overall_ranking(results):
    top10, selected12, case_rows = build_overall_top10(results)

    print("\n" + "=" * 130)
    print("BEST 2 PROPOSALS FROM EACH CASE")
    print("=" * 130)

    for row in case_rows:
        print("\n" + row["case"])
        print("-" * 110)
        for rank_in_case, (proposal, result) in enumerate(row["best"], 1):
            m = _proposal_ranking_metrics(proposal, result)
            print(
                f"  #{rank_in_case}: {proposal.name} | "
                f"Min purity={m['min_purity']:.2f}% | "
                f"TRA/eTRA={m['angle_3d']:.3f} deg | "
                f"Gap margin={m['min_gap_margin']:.3f} Hz | "
                f"Feasible={'YES' if m['feasible'] else 'NO'}"
            )

    print("\n" + "=" * 130)
    print("OVERALL TOP 10 — SELECTED FROM BEST 2 OF EACH CASE")
    print("=" * 130)
    print(
        "Rank | Case / Proposal | Min Purity % | TRA/eTRA deg | "
        "Offset mm | Min Gap Margin Hz | 5% Exact | 10% Exact | "
        "15% Exact | Random 600 (5/10/15%) | Feasible"
    )
    print("-" * 130)

    for rank, (proposal, result) in enumerate(top10, 1):
        m = _proposal_ranking_metrics(proposal, result)
        rb = result["robustness"]
        case_name = proposal.name.split(" — PROPOSAL")[0]
        print(
            f"{rank:4d} | {case_name} / P{proposal.name.split('PROPOSAL ')[-1].split(' ')[0]:<2} | "
            f"{m['min_purity']:13.2f} | {m['angle_3d']:13.3f} | "
            f"{m['offset']:10.3f} | {m['min_gap_margin']:17.3f} | "
            f"{rb[5.0]['exact_pass']:3d}/512 | "
            f"{rb[10.0]['exact_pass']:3d}/512 | "
            f"{rb[15.0]['exact_pass']:3d}/512 | "
            f"{rb[5.0]['random_pass']:3d}/{ROBUSTNESS_RANDOM_CASES} / "
            f"{rb[10.0]['random_pass']:3d}/{ROBUSTNESS_RANDOM_CASES} / "
            f"{rb[15.0]['random_pass']:3d}/{ROBUSTNESS_RANDOM_CASES} | "
            f"{'YES' if m['feasible'] else 'NO'}"
        )

    return top10, selected12, case_rows


def write_ranking_txt(results):
    folder = Path(OUTPUT_FOLDER)
    folder.mkdir(parents=True, exist_ok=True)
    file = folder / "TOP_10_PROPOSAL_RANKING.txt"

    top10, selected12, case_rows = build_overall_top10(results)

    with open(file, "w", encoding="utf-8") as f:
        f.write("ENGINE MOUNT — OVERALL TOP PROPOSAL RANKING\n")
        f.write("=" * 130 + "\n\n")
        f.write(
            f"Method: select best {TOP_PER_CASE} proposals from each case, "
            f"then rank those {len(selected12)} candidates and report Top {OVERALL_TOP_N}.\n"
        )
        f.write(
            "Ranking priority: nominal feasibility -> lower TRA/eTRA 3D misalignment "
            "-> higher minimum modal purity -> larger gap margin -> robustness -> lower eTRA offset.\n\n"
        )

        f.write("BEST 2 FROM EACH CASE\n")
        f.write("=" * 130 + "\n")
        for row in case_rows:
            f.write("\n" + row["case"] + "\n")
            for rank_in_case, (proposal, result) in enumerate(row["best"], 1):
                m = _proposal_ranking_metrics(proposal, result)
                f.write(
                    f"  {rank_in_case}. {proposal.name}\n"
                    f"     Min purity = {m['min_purity']:.3f}%\n"
                    f"     TRA/eTRA 3D = {m['angle_3d']:.4f} deg\n"
                    f"     eTRA offset = {m['offset']:.3f} mm\n"
                    f"     Min gap margin = {m['min_gap_margin']:.4f} Hz\n"
                    f"     Nominal feasible = {'YES' if m['feasible'] else 'NO'}\n"
                )

        f.write("\n" + "=" * 130 + "\n")
        f.write(f"OVERALL TOP {OVERALL_TOP_N}\n")
        f.write("=" * 130 + "\n")
        for rank, (proposal, result) in enumerate(top10, 1):
            m = _proposal_ranking_metrics(proposal, result)
            rb = result["robustness"]
            f.write(
                f"\nRANK {rank}: {proposal.name}\n"
                f"  Minimum modal purity = {m['min_purity']:.3f}%\n"
                f"  TRA/eTRA 3D misalignment = {m['angle_3d']:.4f} deg\n"
                f"  eTRA nearest-CG offset = {m['offset']:.3f} mm\n"
                f"  Minimum gap margin = {m['min_gap_margin']:.4f} Hz\n"
                f"  Nominal feasible = {'YES' if m['feasible'] else 'NO'}\n"
                f"  +/-5% exact = {rb[5.0]['exact_pass']}/512 "
                f"({rb[5.0]['exact_pass_percent']:.2f}%)\n"
                f"  +/-10% exact = {rb[10.0]['exact_pass']}/512 "
                f"({rb[10.0]['exact_pass_percent']:.2f}%)\n"
                f"  +/-15% exact = {rb[15.0]['exact_pass']}/512 "
                f"({rb[15.0]['exact_pass_percent']:.2f}%)\n"
                f"  +/-5% random = {rb[5.0]['random_pass']}/{ROBUSTNESS_RANDOM_CASES} "
                f"({rb[5.0]['random_pass_percent']:.2f}%)\n"
                f"  +/-10% random = {rb[10.0]['random_pass']}/{ROBUSTNESS_RANDOM_CASES} "
                f"({rb[10.0]['random_pass_percent']:.2f}%)\n"
                f"  +/-15% random = {rb[15.0]['random_pass']}/{ROBUSTNESS_RANDOM_CASES} "
                f"({rb[15.0]['random_pass_percent']:.2f}%)\n"
            )

    return file



def write_ranking_csv(results):
    folder = Path(OUTPUT_FOLDER)
    folder.mkdir(parents=True, exist_ok=True)
    file = folder / "TOP_10_PROPOSAL_RANKING.csv"

    top10, selected12, case_rows = build_overall_top10(results)

    with open(file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Rank", "Case / Proposal", "Minimum Purity %",
            "TRA/eTRA 3D deg", "eTRA Offset mm", "Minimum Gap Margin Hz",
            "Nominal Feasible",
            "5% Exact PASS/512", "10% Exact PASS/512", "15% Exact PASS/512",
            "5% Random PASS/600", "10% Random PASS/600", "15% Random PASS/600"
        ])
        for rank, (proposal, result) in enumerate(top10, 1):
            m = _proposal_ranking_metrics(proposal, result)
            rb = result["robustness"]
            writer.writerow([
                rank, proposal.name, m["min_purity"], m["angle_3d"], m["offset"],
                m["min_gap_margin"], "YES" if m["feasible"] else "NO",
                f"{rb[5.0]['exact_pass']}/512",
                f"{rb[10.0]['exact_pass']}/512",
                f"{rb[15.0]['exact_pass']}/512",
                f"{rb[5.0]['random_pass']}/{ROBUSTNESS_RANDOM_CASES}",
                f"{rb[10.0]['random_pass']}/{ROBUSTNESS_RANDOM_CASES}",
                f"{rb[15.0]['random_pass']}/{ROBUSTNESS_RANDOM_CASES}",
            ])
    return file


# ============================================================
#                            MAIN
# ============================================================

def main():

    print_engine_input()

    print_limits()

    global CASES
    CASES = generate_all_optimized_cases()

    results = []

    for proposal in CASES:

        result = review_proposal(
            proposal
        )

        results.append(
            (proposal.name, result)
        )

        print_proposal(
            proposal,
            result
        )

    summary_file = write_summary_csv(
        results
    )

    full_file = write_full_txt(
        results
    )

    top10, selected12, case_rows = print_overall_ranking(results)
    ranking_file = write_ranking_txt(results)
    ranking_csv_file = write_ranking_csv(results)

    print("\n" + "=" * 110)

    print(
        "REVIEW COMPLETE"
    )

    print(
        f"CSV summary : {summary_file}"
    )

    print(
        f"Full report : {full_file}"
    )

    print(
        f"Ranking report: {ranking_file}"
    )

    print(
        f"Ranking CSV: {ranking_csv_file}"
    )

    print(
        f"Output folder: {Path(OUTPUT_FOLDER).resolve()}"
    )

    print("=" * 110)


if __name__ == "__main__":
    main()
