import { useState, useCallback } from "react";
import axios from "axios";
import { notifications } from "@mantine/notifications";

const API = axios.create({ baseURL: "/api" });

export function useHistory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchHistory = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await API.get(`/history?page=${page}&limit=20`);
      if (res.data.status === "ok") {
        setItems(res.data.data.items);
        setTotal(res.data.data.total);
      }
    } catch (err) {
      console.warn("History fetch failed:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteCalc = useCallback(async (id) => {
    try {
      await API.delete(`/history/${id}`);
      setItems((prev) => prev.filter((x) => x._id !== id));
      setTotal((t) => t - 1);
      notifications.show({ message: "Run deleted.", color: "gray", autoClose: 2000 });
    } catch {
      notifications.show({ message: "Failed to delete.", color: "red", autoClose: 2000 });
    }
  }, []);

  const updateLabel = useCallback(async (id, label) => {
    try {
      const res = await API.patch(`/history/${id}`, { label });
      if (res.data.status === "ok") {
        setItems((prev) =>
          prev.map((x) => (x._id === id ? { ...x, label: res.data.data.label } : x))
        );
      }
    } catch {
      notifications.show({ message: "Failed to update label.", color: "red", autoClose: 2000 });
    }
  }, []);

  return { items, loading, total, fetchHistory, deleteCalc, updateLabel };
}
