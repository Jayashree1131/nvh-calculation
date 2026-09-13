# Optimizer Integration Task

## Backend
- [x] Add `OPTIMIZER_SCRIPT` + `OPTIMIZER_TIMEOUT_MS` to `server/config.js`
- [x] Create `server/routes/optimize.js` (SSE streaming route + cancel via DELETE)
- [x] Register `/api/optimize` in `server/index.js`
- [x] Create `python/optimizer_calc.py` (JSON-in/JSON-out wrapper with PROGRESS: stderr lines)
- [x] Install scipy on system python3

## Frontend — State
- [x] Add optimizer defaults to `client/src/utils/optimizerDefaults.js`
- [x] Add optimizer slice to `client/src/store/useStore.js`

## Frontend — Hooks
- [x] Create `client/src/hooks/useOptimizer.js` (SSE hook with cancel support)

## Frontend — Components
- [x] Create `client/src/components/optimizer/OptimizerInputPanel.jsx`
- [x] Create `client/src/components/optimizer/OptimizerProgress.jsx`
- [x] Create `client/src/components/optimizer/OptimizerResults.jsx`

## Frontend — App Integration
- [x] Modify `client/src/App.jsx` to add mode toggle (Manual Analysis | Optimizer)

## Verification
- [x] Client build passes (Vite ✓)
- [/] Python smoke test running (1 case, 1 proposal, maxiter=3)
- [ ] Test SSE endpoint via browser
