import { create } from "zustand";
import { getDefaults } from "../utils/defaults";

const useStore = create((set, get) => ({
  // ── Form state ──────────────────────────────────────────────
  form: getDefaults(),

  setForm: (updater) =>
    set((state) => ({
      form: typeof updater === "function" ? updater(state.form) : updater,
    })),

  resetForm: () => set({ form: getDefaults() }),

  loadFromHistory: (inputs) => set({ form: JSON.parse(JSON.stringify(inputs)) }),

  // Helper: update a single mount field
  updateMount: (index, field, value) =>
    set((state) => {
      const mounts = [...state.form.mounts];
      mounts[index] = { ...mounts[index], [field]: value };
      return { form: { ...state.form, mounts } };
    }),

  // Helper: update inertia cell (auto-mirror for symmetry)
  updateInertia: (row, col, value) =>
    set((state) => {
      const inertia = state.form.inertia.map((r) => [...r]);
      inertia[row][col] = value;
      if (row !== col) {
        inertia[col][row] = value; // enforce symmetry
      }
      return { form: { ...state.form, inertia } };
    }),

  // ── Calculation state ───────────────────────────────────────
  calcState: "idle", // "idle" | "loading" | "success" | "error"
  calcResult: null,
  calcError: null,
  lastCalcId: null, // MongoDB _id of last saved calculation

  setCalcLoading: () => set({ calcState: "loading", calcError: null }),

  setCalcSuccess: (result, id) =>
    set({ calcState: "success", calcResult: result, calcError: null, lastCalcId: id }),

  setCalcError: (error) =>
    set({ calcState: "error", calcError: error, calcResult: null }),

  // ── Robustness state ────────────────────────────────────────
  robustnessState: "idle", // "idle" | "loading" | "success" | "error"
  robustnessResult: null,
  robustnessError: null,

  setRobustnessLoading: () => set({ robustnessState: "loading", robustnessError: null }),
  setRobustnessSuccess: (data) =>
    set({ robustnessState: "success", robustnessResult: data, robustnessError: null }),
  setRobustnessError: (err) =>
    set({ robustnessState: "error", robustnessError: err }),

  resetRobustness: () =>
    set({ robustnessState: "idle", robustnessResult: null, robustnessError: null }),

  // ── History drawer ──────────────────────────────────────────
  historyOpen: false,
  setHistoryOpen: (v) => set({ historyOpen: v }),

  // ── Validation errors ───────────────────────────────────────
  validationErrors: {},
  setValidationErrors: (errors) => set({ validationErrors: errors }),
}));

export default useStore;
