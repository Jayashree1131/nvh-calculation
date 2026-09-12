const mongoose = require("mongoose");
const Calculation = require("./models/Calculation");

const memoryStore = [];

async function saveCalculation({ label, inputs, outputs, kpi }) {
  if (mongoose.connection.readyState === 1) {
    try {
      const doc = await Calculation.create({ label, inputs, outputs, kpi });
      return doc._id.toString();
    } catch (err) {
      console.warn("[DB] Mongo save failed, falling back to memory:", err.message);
    }
  }

  const id = "mem_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
  const record = {
    _id: id,
    label: label || `Run #${memoryStore.length + 1}`,
    inputs,
    outputs,
    kpi,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  memoryStore.unshift(record);
  if (memoryStore.length > 50) memoryStore.pop();
  return id;
}

async function listCalculations(page = 1, limit = 20) {
  if (mongoose.connection.readyState === 1) {
    try {
      const skip = (page - 1) * limit;
      const [items, total] = await Promise.all([
        Calculation.find({}, { "outputs.plots": 0 })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Calculation.countDocuments(),
      ]);
      return { items, total, page, totalPages: Math.ceil(total / limit) };
    } catch (err) {
      console.warn("[DB] Mongo list failed, falling back to memory:", err.message);
    }
  }

  const skip = (page - 1) * limit;
  const items = memoryStore.slice(skip, skip + limit).map((x) => ({
    ...x,
    outputs: { ...x.outputs, plots: undefined },
  }));
  return {
    items,
    total: memoryStore.length,
    page,
    totalPages: Math.ceil(memoryStore.length / limit) || 1,
  };
}

async function getCalculationById(id) {
  if (mongoose.connection.readyState === 1 && !id.startsWith("mem_")) {
    try {
      return await Calculation.findById(id).lean();
    } catch (err) {
      console.warn("[DB] Mongo get failed:", err.message);
    }
  }
  return memoryStore.find((x) => x._id === id) || null;
}

async function updateCalculationLabel(id, label) {
  if (mongoose.connection.readyState === 1 && !id.startsWith("mem_")) {
    try {
      return await Calculation.findByIdAndUpdate(
        id,
        { $set: { label: label.trim().slice(0, 120) } },
        { new: true }
      ).lean();
    } catch (err) {
      console.warn("[DB] Mongo patch failed:", err.message);
    }
  }
  const item = memoryStore.find((x) => x._id === id);
  if (item) {
    item.label = label.trim().slice(0, 120);
    item.updatedAt = new Date().toISOString();
  }
  return item || null;
}

async function deleteCalculationById(id) {
  if (mongoose.connection.readyState === 1 && !id.startsWith("mem_")) {
    try {
      return await Calculation.findByIdAndDelete(id);
    } catch (err) {
      console.warn("[DB] Mongo delete failed:", err.message);
    }
  }
  const idx = memoryStore.findIndex((x) => x._id === id);
  if (idx !== -1) {
    memoryStore.splice(idx, 1);
    return true;
  }
  return false;
}

module.exports = {
  saveCalculation,
  listCalculations,
  getCalculationById,
  updateCalculationLabel,
  deleteCalculationById,
};
