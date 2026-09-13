import { useRef, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import useStore from "../store/useStore";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5050";

export function useOptimizer() {
  const xhrRef = useRef(null);

  const optimizerForm = useStore((s) => s.optimizerForm);
  const optimizerJobId = useStore((s) => s.optimizerJobId);
  const setOptimizerRunning = useStore((s) => s.setOptimizerRunning);
  const appendOptimizerProgress = useStore((s) => s.appendOptimizerProgress);
  const setOptimizerSuccess = useStore((s) => s.setOptimizerSuccess);
  const setOptimizerError = useStore((s) => s.setOptimizerError);
  const resetOptimizer = useStore((s) => s.resetOptimizer);

  const runOptimizer = useCallback(async () => {
    // Kick off POST — server returns SSE stream
    resetOptimizer();

    let jobId = null;

    try {
      const response = await fetch(`${API_BASE}/api/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optimizerForm),
      });

      if (!response.ok || !response.body) {
        const txt = await response.text();
        setOptimizerError(txt || "Server error starting optimizer.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Process SSE stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const dataLine = part
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          let event;
          try {
            event = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (event.type === "job_start") {
            jobId = event.jobId;
            setOptimizerRunning(jobId);

          } else if (event.type === "progress") {
            appendOptimizerProgress(event);

          } else if (event.type === "result") {
            setOptimizerSuccess(event.data);
            notifications.show({
              title: "Optimizer Complete",
              message: `Top ${event.data.top10?.length ?? 0} proposals ranked successfully.`,
              color: "teal",
            });

          } else if (event.type === "error") {
            setOptimizerError(event.message || "Unknown optimizer error.");
            notifications.show({
              title: "Optimizer Error",
              message: event.message,
              color: "red",
            });
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setOptimizerError(err.message || "Network error.");
        notifications.show({
          title: "Optimizer Error",
          message: err.message,
          color: "red",
        });
      }
    }
  }, [optimizerForm, resetOptimizer, setOptimizerRunning,
      appendOptimizerProgress, setOptimizerSuccess, setOptimizerError]);

  const cancelOptimizer = useCallback(async () => {
    const jid = optimizerJobId || useStore.getState().optimizerJobId;
    if (!jid) return;
    try {
      await fetch(`${API_BASE}/api/optimize/${jid}`, { method: "DELETE" });
    } catch {
      // best-effort
    }
    resetOptimizer();
    notifications.show({
      title: "Optimizer Cancelled",
      message: "The optimization run has been cancelled.",
      color: "orange",
    });
  }, [optimizerJobId, resetOptimizer]);

  return { runOptimizer, cancelOptimizer };
}
