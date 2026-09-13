require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

module.exports = {
  PORT: process.env.PORT || 5050,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/engine-nvh",
  PYTHON_PATH: process.env.PYTHON_PATH || "/usr/bin/python3",
  PYTHON_SCRIPT: require("path").resolve(__dirname, "../python/engine_calc.py"),
  OPTIMIZER_SCRIPT: require("path").resolve(__dirname, "../python/optimizer_calc.py"),
  CALC_TIMEOUT_MS: parseInt(process.env.CALC_TIMEOUT_MS) || 120000, // 2 min (for cloud CPU throttling)
  ROBUSTNESS_TIMEOUT_MS: parseInt(process.env.ROBUSTNESS_TIMEOUT_MS) || 300000, // 5 min
  OPTIMIZER_TIMEOUT_MS: parseInt(process.env.OPTIMIZER_TIMEOUT_MS) || 1200000, // 20 min
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
};
