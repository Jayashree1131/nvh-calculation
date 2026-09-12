import axios from "axios";
import useStore from "../store/useStore";
import { validateInputs, hasBlockingErrors } from "../utils/validators";
import { notifications } from "@mantine/notifications";

const API = axios.create({ baseURL: "/api" });

export function useCalculate() {
  const {
    form,
    setCalcLoading,
    setCalcSuccess,
    setCalcError,
    setValidationErrors,
    resetRobustness,
  } = useStore();

  const calculate = async () => {
    // 1. Client-side validation
    const errors = validateInputs(form);
    setValidationErrors(errors);

    if (hasBlockingErrors(errors)) {
      notifications.show({
        title: "Validation Error",
        message: "Please fix the highlighted fields before calculating.",
        color: "red",
        autoClose: 4000,
      });
      return;
    }

    // 2. Reset previous results
    setCalcLoading();
    resetRobustness();

    try {
      // Coerce all numeric strings to numbers before sending
      const payload = coerceNumerics(form);
      const res = await API.post("/calculate", payload);

      if (res.data.status === "ok") {
        setCalcSuccess(res.data.data, res.data.data._id || null);
        notifications.show({
          title: "Calculation Complete",
          message: "Results updated below.",
          color: "teal",
          autoClose: 2500,
        });
      } else {
        throw new Error(res.data.message || "Unknown calculation error.");
      }
    } catch (err) {
      const msg = extractErrorMessage(err);
      setCalcError(msg);
      notifications.show({
        title: "Calculation Failed",
        message: msg,
        color: "red",
        autoClose: 6000,
      });
    }
  };

  return { calculate };
}

export function useRobustness() {
  const {
    form,
    lastCalcId,
    setRobustnessLoading,
    setRobustnessSuccess,
    setRobustnessError,
  } = useStore();

  const runRobustness = async () => {
    setRobustnessLoading();

    notifications.show({
      id: "robustness-running",
      title: "Running Robustness Study",
      message: "Evaluating 512 stiffness corner cases × 3 tolerances…",
      color: "blue",
      loading: true,
      autoClose: false,
    });

    try {
      const payload = {
        ...coerceNumerics(form),
        run_robustness: true,
        calculation_id: lastCalcId || undefined,
      };
      const res = await API.post("/robustness", payload, { timeout: 130000 });

      notifications.hide("robustness-running");

      if (res.data.status === "ok") {
        setRobustnessSuccess(res.data.data);
        notifications.show({
          title: "Robustness Study Complete",
          message: "Results updated.",
          color: "teal",
          autoClose: 2500,
        });
      } else {
        throw new Error(res.data.message || "Robustness error.");
      }
    } catch (err) {
      notifications.hide("robustness-running");
      const msg = extractErrorMessage(err);
      setRobustnessError(msg);
      notifications.show({
        title: "Robustness Failed",
        message: msg,
        color: "red",
        autoClose: 6000,
      });
    }
  };

  return { runRobustness };
}

// ── Helpers ──────────────────────────────────────────────────

function coerceNumerics(form) {
  return {
    mass: Number(form.mass),
    cg: form.cg.map(Number),
    inertia: form.inertia.map((row) => row.map(Number)),
    torque: Number(form.torque),
    dynamic_stiffness_factor: Number(form.dynamic_stiffness_factor),
    mounts: form.mounts.map((m) => ({
      name: m.name,
      x: Number(m.x),
      y: Number(m.y),
      z: Number(m.z),
      kx: Number(m.kx),
      ky: Number(m.ky),
      kz: Number(m.kz),
      roll: Number(m.roll || 0),
      pitch: Number(m.pitch || 0),
      yaw: Number(m.yaw || 0),
    })),
  };
}

function extractErrorMessage(err) {
  if (err.response) {
    const d = err.response.data;
    if (d.status === "validation_error" && d.errors) {
      return d.errors.map((e) => e.message).join("; ");
    }
    return d.message || `Server error ${err.response.status}`;
  }
  if (err.code === "ECONNABORTED") return "Request timed out. Try again.";
  if (err.message.includes("Network Error")) return "Cannot reach server. Is it running?";
  return err.message;
}
