# Engine NVH & Mount Dynamics — TRA / eTRA Tuning Studio

Automotive Powertrain NVH modal analysis, Torque Roll Axis (TRA), and Elastic TRA (eTRA) full-stack web application.

---

## 📁 Project Structure

```
engine-nvh-app/
├── client/           # React 19 + Vite + Mantine UI frontend (port 5173)
│   └── src/
│       ├── components/  # InputPanel, ResultsPanel, PlotViewer, ModalTable, etc.
│       ├── store/       # Zustand centralized state
│       └── hooks/       # Calculation & History API hooks
├── server/           # Node.js + Express backend (port 5050)
│   ├── routes/       # /api/calculate, /api/robustness, /api/history
│   ├── models/       # Mongoose Calculation schema
│   ├── storage.js    # MongoDB persistence + resilient in-memory fallback
│   └── middleware/   # Joi input validation
├── python/
│   └── engine_calc.py # 6-DOF rigid body solver, TRA/eTRA vectors, Matplotlib plots
└── .env              # Environment config (ports, python path, MongoDB URI)
```

---

## 🚀 How to Run

### 1. From Terminal:

Run the backend and frontend in separate terminals:

**Terminal 1 — Backend (Server):**
```bash
cd /Users/jay/Desktop/engine-nvh-app/server
npm run dev
```

**Terminal 2 — Frontend (Client):**
```bash
cd /Users/jay/Desktop/engine-nvh-app/client
npm run dev
```

### 2. Access the Application:

- **Web UI**: Open your browser at http://localhost:5173
- **API Health Check**: http://localhost:5050/api/health

---

## 🛠 Features

1. **Parameter Customization**:
   - Engine Mass ($m$), Center of Gravity ($[X, Y, Z]$), Applied Torque ($T$), Dynamic Stiffness Multiplier ($K_d / K_s$).
   - 3×3 Inertia Tensor matrix with symmetric auto-mirroring ($I_{xy}=I_{yx}$) and positive diagonal checks.
   - Dynamic Mount cards: position $(x, y, z)$, stiffness $(k_x, k_y, k_z)$, orientation angles $(roll, pitch, yaw)$, with add/remove mounts.
   - **Reset Baseline** button to restore original script values at any time.

2. **6-DOF Rigid Body & Decoupling Analysis**:
   - Generalized eigenvalue solver for the 6 coupled rigid-body modes.
   - Kinetic energy distribution matrix showing dominant DOF and decoupling purity percentage per mode.
   - Color-coded pass/fail indicator ($\ge 80\%$ decoupling criterion).

3. **TRA & Elastic TRA (eTRA)**:
   - Evaluates pure TRA and eTRA unit vectors with direction cosines.
   - 3D misalignment gauge ($<5^\circ$ excellent, $<15^\circ$ acceptable, $\ge 15^\circ$ poor).
   - Perpendicular offset distance from CG to eTRA line ($d_{\text{CG}\to\text{eTRA}}$) and nearest 3D point coordinates.

4. **2D Projected Views**:
   - Projections onto **YZ (Front view — primary automotive tuning plane)**, **XY (Top view)**, and **ZX (Side view)**.
   - Computes 2D misalignment angles, intersection coordinates, and projected CG-to-eTRA offsets.

5. **Inline Plots & Download**:
   - High-resolution dark-themed plots generated directly by the backend Python engine.
   - Tabbed viewer for **3D Geometry & Trajectories** and **2D Projections (YZ / XY / ZX)**.
   - One-click **Download PNG** button for each plot.

6. **Exhaustive Mount Stiffness Robustness Analysis**:
   - Dedicated **Robustness Study** button to evaluate sensitivity across thousands of stiffness combinations ($\pm 5\%$, $\pm 10\%$).

7. **Persistent History**:
   - Automatically saves every calculation run to MongoDB (with graceful in-memory fallback).
   - Browse past runs, edit labels, and restore any previous configuration back into the form with 1 click.
