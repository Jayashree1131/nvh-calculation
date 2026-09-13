import { useState } from "react";
import {
  Paper, Stack, Group, Text, TextInput, Button, SimpleGrid,
  Tabs, Badge, ThemeIcon, NumberInput, Switch, Tooltip,
  Divider, Box, Alert, Chip,
} from "@mantine/core";
import {
  IconPlayerPlay, IconPlayerStop, IconRotateClockwise,
  IconSettings, IconTarget, IconShield, IconBolt,
  IconInfoCircle, IconChartBar,
} from "@tabler/icons-react";
import useStore from "../../store/useStore";
import { useOptimizer } from "../../hooks/useOptimizer";
import { OptimizerProgress } from "./OptimizerProgress";

const CASE_LABELS = {
  1: "Baseline Axis / Modal-Purity",
  2: "M1/M2 Axis-Free",
  3: "Research-Guided Package-Constrained",
  4: "Dynamic-Factor / Robustness-Oriented",
  5: "TRA/eTRA Alignment",
  6: "Current Thermal / Exhaust-Safe",
};

export function OptimizerInputPanel() {
  const [activeTab, setActiveTab] = useState("engine");
  const optimizerForm = useStore((s) => s.optimizerForm);
  const setOptimizerForm = useStore((s) => s.setOptimizerForm);
  const resetOptimizerForm = useStore((s) => s.resetOptimizerForm);
  const optimizerState = useStore((s) => s.optimizerState);
  const { runOptimizer, cancelOptimizer } = useOptimizer();

  const isRunning = optimizerState === "running";

  // ── Generic setters ────────────────────────────────────────
  const setEngine = (field, val) =>
    setOptimizerForm((f) => ({ ...f, engine: { ...f.engine, [field]: val } }));

  const setTarget = (field, val) =>
    setOptimizerForm((f) => ({ ...f, targets: { ...f.targets, [field]: val } }));

  const setMfg = (field, val) =>
    setOptimizerForm((f) => ({ ...f, manufacturing: { ...f.manufacturing, [field]: val } }));

  const setOpt = (field, val) =>
    setOptimizerForm((f) => ({ ...f, optimizer: { ...f.optimizer, [field]: val } }));

  const setMount = (idx, field, val) =>
    setOptimizerForm((f) => {
      const mounts = f.mounts.map((m, i) => (i === idx ? { ...m, [field]: val } : m));
      return { ...f, mounts };
    });

  const setMountLimit = (idx, coord, side, val) =>
    setOptimizerForm((f) => {
      const mounts = f.mounts.map((m, i) => {
        if (i !== idx) return m;
        const limits = { ...m.position_limits };
        const cur = [...(limits[coord] || [0, 0])];
        cur[side] = val;
        limits[coord] = cur;
        return { ...m, position_limits: limits };
      });
      return { ...f, mounts };
    });

  const toggleCase = (cid) => {
    const enabled = optimizerForm.optimizer.enabled_cases;
    const next = enabled.includes(cid)
      ? enabled.filter((x) => x !== cid)
      : [...enabled, cid].sort();
    setOpt("enabled_cases", next);
  };

  const setMountAxis = (idx, axis, enabled) => {
    setOptimizerForm((f) => {
      const mounts = f.mounts.map((m, i) => {
        if (i !== idx) return m;
        let opts = [...m.axis_options];
        if (enabled) {
          if (!opts.includes(axis)) opts.push(axis);
        } else {
          opts = opts.filter((a) => a !== axis);
          if (opts.length === 0) opts = [axis]; // keep at least one
        }
        return { ...m, axis_options: opts };
      });
      return { ...f, mounts };
    });
  };

  const inputSx = { input: { fontFamily: "monospace", fontSize: "0.82rem" } };

  return (
    <Stack gap="md">
      {/* ── Header control bar ── */}
      <Paper p="sm" radius="md" withBorder
        style={{ background: "linear-gradient(180deg,#1c2128 0%,#161b22 100%)", border: "1px solid #30363d" }}
      >
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs">
              <Badge variant="dot" color="violet" size="sm">
                {optimizerForm.optimizer.enabled_cases.length} Cases
              </Badge>
              <Badge variant="dot" color="cyan" size="sm">
                {optimizerForm.optimizer.proposals_per_case} proposals/case
              </Badge>
            </Group>
            <Tooltip label="Reset optimizer inputs to defaults">
              <Button size="xs" variant="subtle" color="gray"
                leftSection={<IconRotateClockwise size={14} />}
                onClick={resetOptimizerForm} disabled={isRunning}>
                Reset
              </Button>
            </Tooltip>
          </Group>

          <Group grow gap="xs">
            {!isRunning ? (
              <Button size="md" color="violet"
                leftSection={<IconPlayerPlay size={18} />}
                style={{ boxShadow: "0 4px 14px rgba(160,110,250,0.35)" }}
                onClick={runOptimizer}
                disabled={optimizerForm.optimizer.enabled_cases.length === 0}
              >
                Run Optimizer
              </Button>
            ) : (
              <Button size="md" color="red" variant="filled"
                leftSection={<IconPlayerStop size={18} />}
                onClick={cancelOptimizer}
              >
                Cancel Run
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>

      {/* ── Progress panel (shown while running or just finished) ── */}
      {optimizerState !== "idle" && <OptimizerProgress />}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onChange={setActiveTab} variant="pills" radius="md">
        <Tabs.List grow mb="sm">
          <Tabs.Tab value="engine" leftSection={<IconSettings size={14} />}>Engine</Tabs.Tab>
          <Tabs.Tab value="targets" leftSection={<IconTarget size={14} />}>Targets</Tabs.Tab>
          <Tabs.Tab value="mounts" leftSection={<IconBolt size={14} />}>Mounts</Tabs.Tab>
          <Tabs.Tab value="controls" leftSection={<IconShield size={14} />}>Controls</Tabs.Tab>
        </Tabs.List>

        {/* ────── TAB: ENGINE ────── */}
        <Tabs.Panel value="engine">
          <Stack gap="sm">
            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Text fw={700} size="sm">Engine Physical Parameters</Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <NumberInput label="Mass (kg)" value={optimizerForm.engine.mass}
                    onChange={(v) => setEngine("mass", v)} styles={inputSx} min={0} />
                  <NumberInput label="Dynamic / Static Factor"
                    value={optimizerForm.engine.dynamic_stiffness_factor}
                    onChange={(v) => setEngine("dynamic_stiffness_factor", v)}
                    styles={inputSx} min={1} max={3} step={0.05} />
                </SimpleGrid>

                <Text size="xs" c="dimmed" fw={600}>Center of Gravity [X, Y, Z] (mm)</Text>
                <SimpleGrid cols={3} spacing="xs">
                  {["X", "Y", "Z"].map((c, i) => (
                    <NumberInput key={c} label={c} size="xs"
                      value={optimizerForm.engine.cg[i]}
                      onChange={(v) => setOptimizerForm((f) => {
                        const cg = [...f.engine.cg]; cg[i] = v;
                        return { ...f, engine: { ...f.engine, cg } };
                      })} styles={inputSx} />
                  ))}
                </SimpleGrid>

                <Text size="xs" c="dimmed" fw={600}>Inertia Tensor (kg·m²) — symmetric 3×3</Text>
                <Stack gap={4}>
                  {[0, 1, 2].map((row) => (
                    <SimpleGrid key={row} cols={3} spacing="xs">
                      {[0, 1, 2].map((col) => (
                        <NumberInput key={col} size="xs"
                          label={`I${["x","y","z"][row]}${["x","y","z"][col]}`}
                          value={optimizerForm.engine.inertia[row][col]}
                          onChange={(v) => setOptimizerForm((f) => {
                            const inertia = f.engine.inertia.map((r) => [...r]);
                            inertia[row][col] = v;
                            if (row !== col) inertia[col][row] = v;
                            return { ...f, engine: { ...f.engine, inertia } };
                          })}
                          styles={inputSx} step={0.001} decimalScale={4} />
                      ))}
                    </SimpleGrid>
                  ))}
                </Stack>

                <Text size="xs" c="dimmed" fw={600}>Crank / Torque Axis [dx, dy, dz]</Text>
                <SimpleGrid cols={3} spacing="xs">
                  {["dx", "dy", "dz"].map((c, i) => (
                    <NumberInput key={c} label={c} size="xs"
                      value={optimizerForm.engine.crank_axis[i]}
                      onChange={(v) => setOptimizerForm((f) => {
                        const ca = [...f.engine.crank_axis]; ca[i] = v;
                        return { ...f, engine: { ...f.engine, crank_axis: ca } };
                      })} styles={inputSx} min={-1} max={1} step={0.01} />
                  ))}
                </SimpleGrid>
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>

        {/* ────── TAB: TARGETS ────── */}
        <Tabs.Panel value="targets">
          <Stack gap="sm">
            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Text fw={700} size="sm">Frequency Targets</Text>
                <SimpleGrid cols={2} spacing="sm">
                  <NumberInput label="Min Frequency (Hz)" value={optimizerForm.targets.freq_min_hz}
                    onChange={(v) => setTarget("freq_min_hz", v)} styles={inputSx} min={0} />
                  <NumberInput label="Max Frequency (Hz)" value={optimizerForm.targets.freq_max_hz}
                    onChange={(v) => setTarget("freq_max_hz", v)} styles={inputSx} min={0} />
                </SimpleGrid>
              </Stack>
            </Paper>

            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Text fw={700} size="sm">Modal Purity & Gaps</Text>
                <SimpleGrid cols={2} spacing="sm">
                  <NumberInput label="Min Purity (%)" value={optimizerForm.targets.purity_min_pct}
                    onChange={(v) => setTarget("purity_min_pct", v)} styles={inputSx} min={0} max={100} />
                  <NumberInput label="Target Purity (%)" value={optimizerForm.targets.purity_target_pct}
                    onChange={(v) => setTarget("purity_target_pct", v)} styles={inputSx} min={0} max={100} />
                  <NumberInput label="Mode 1–2 Gap Min (Hz)" value={optimizerForm.targets.mode_12_gap_min_hz}
                    onChange={(v) => setTarget("mode_12_gap_min_hz", v)} styles={inputSx} step={0.1} />
                  <NumberInput label="Other Gaps Min (Hz)" value={optimizerForm.targets.other_gap_min_hz}
                    onChange={(v) => setTarget("other_gap_min_hz", v)} styles={inputSx} step={0.1} />
                </SimpleGrid>
                <NumberInput label="TRA / eTRA Target (deg)"
                  value={optimizerForm.targets.tra_etra_target_deg}
                  onChange={(v) => setTarget("tra_etra_target_deg", v)} styles={inputSx} step={0.1} />
              </Stack>
            </Paper>

            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Text fw={700} size="sm">Manufacturing Ratios</Text>
                <SimpleGrid cols={2} spacing="sm">
                  <NumberInput label="Void/Solid Min" value={optimizerForm.manufacturing.void_solid_min}
                    onChange={(v) => setMfg("void_solid_min", v)} styles={inputSx} step={0.01} />
                  <NumberInput label="Void/Solid Max" value={optimizerForm.manufacturing.void_solid_max}
                    onChange={(v) => setMfg("void_solid_max", v)} styles={inputSx} step={0.01} />
                  <NumberInput label="(V+S)/Axial Min" value={optimizerForm.manufacturing.void_solid_over_axial_min}
                    onChange={(v) => setMfg("void_solid_over_axial_min", v)} styles={inputSx} step={0.1} />
                  <NumberInput label="(V+S)/Axial Max" value={optimizerForm.manufacturing.void_solid_over_axial_max}
                    onChange={(v) => setMfg("void_solid_over_axial_max", v)} styles={inputSx} step={0.1} />
                </SimpleGrid>
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>

        {/* ────── TAB: MOUNTS ────── */}
        <Tabs.Panel value="mounts">
          <Stack gap="sm">
            {optimizerForm.mounts.map((mount, idx) => (
              <Paper key={mount.name} p="md" radius="md" withBorder>
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text fw={700} size="sm">{mount.name} — Position Limits & Axis</Text>
                    <Badge size="xs" variant="light" color="blue">
                      Axis opts: {mount.axis_options.join(", ")}
                    </Badge>
                  </Group>

                  {["X", "Y", "Z"].map((coord) => (
                    <Group key={coord} gap="xs" wrap="nowrap">
                      <Text size="xs" w={20} c="dimmed" fw={600}>{coord}</Text>
                      <NumberInput
                        placeholder="Min"
                        size="xs"
                        label="Min (mm)"
                        value={mount.position_limits[coord][0]}
                        onChange={(v) => setMountLimit(idx, coord, 0, v)}
                        styles={inputSx}
                        style={{ flex: 1 }}
                      />
                      <NumberInput
                        placeholder="Max"
                        size="xs"
                        label="Max (mm)"
                        value={mount.position_limits[coord][1]}
                        onChange={(v) => setMountLimit(idx, coord, 1, v)}
                        styles={inputSx}
                        style={{ flex: 1 }}
                      />
                    </Group>
                  ))}

                  <Divider label="Axis Options" labelPosition="left" />
                  <Group gap="xs">
                    {["X", "Y", "Z"].map((axis) => (
                      <Chip
                        key={axis}
                        checked={mount.axis_options.includes(axis)}
                        onChange={(checked) => setMountAxis(idx, axis, checked)}
                        size="sm"
                        variant="filled"
                      >
                        {axis}
                      </Chip>
                    ))}
                  </Group>

                  <Divider label="Baseline Stiffness (N/mm)" labelPosition="left" />
                  <SimpleGrid cols={3} spacing="xs">
                    {["Kx", "Ky", "Kz"].map((k, ki) => (
                      <NumberInput key={k} label={k} size="xs"
                        value={mount.baseline_stiffness[ki]}
                        onChange={(v) => {
                          setOptimizerForm((f) => {
                            const mounts = f.mounts.map((m, i) => {
                              if (i !== idx) return m;
                              const bs = [...m.baseline_stiffness];
                              bs[ki] = v;
                              return { ...m, baseline_stiffness: bs };
                            });
                            return { ...f, mounts };
                          });
                        }}
                        styles={inputSx} min={1} />
                    ))}
                  </SimpleGrid>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>

        {/* ────── TAB: CONTROLS ────── */}
        <Tabs.Panel value="controls">
          <Stack gap="sm">
            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Text fw={700} size="sm">Optimizer Controls</Text>
                <SimpleGrid cols={2} spacing="sm">
                  <NumberInput label="Proposals per Case" value={optimizerForm.optimizer.proposals_per_case}
                    onChange={(v) => setOpt("proposals_per_case", v)} styles={inputSx} min={1} max={10} />
                  <NumberInput label="Max Iterations (DE)" value={optimizerForm.optimizer.max_iter}
                    onChange={(v) => setOpt("max_iter", v)} styles={inputSx} min={1} max={100} />
                  <NumberInput label="Population Size (DE)" value={optimizerForm.optimizer.pop_size}
                    onChange={(v) => setOpt("pop_size", v)} styles={inputSx} min={2} max={20} />
                  <NumberInput label="Stiffness Search Fraction"
                    value={optimizerForm.optimizer.stiffness_fraction}
                    onChange={(v) => setOpt("stiffness_fraction", v)}
                    styles={inputSx} min={0.05} max={1.0} step={0.05} decimalScale={2} />
                </SimpleGrid>

                <Alert icon={<IconInfoCircle size={14} />} color="blue" radius="sm" variant="light">
                  Lower max_iter / pop_size = faster but less optimal. For quick preview use 5/3; for best results use 15/6.
                </Alert>
              </Stack>
            </Paper>

            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Text fw={700} size="sm">Enable / Disable Cases</Text>
                <Text size="xs" c="dimmed">
                  Each enabled case generates {optimizerForm.optimizer.proposals_per_case} proposals.
                  All 6 = {6 * optimizerForm.optimizer.proposals_per_case} total proposals.
                </Text>
                <Stack gap="xs">
                  {Object.entries(CASE_LABELS).map(([cid, label]) => {
                    const id = parseInt(cid);
                    const on = optimizerForm.optimizer.enabled_cases.includes(id);
                    return (
                      <Group key={cid} justify="space-between" wrap="nowrap">
                        <Text component="div" size="xs" style={{ flex: 1 }}>
                          <Badge size="xs" variant="outline" color={on ? "violet" : "gray"} mr={6}>
                            Case {id}
                          </Badge>
                          {label}
                        </Text>
                        <Switch
                          checked={on}
                          onChange={() => toggleCase(id)}
                          size="sm"
                          color="violet"
                        />
                      </Group>
                    );
                  })}
                </Stack>
              </Stack>
            </Paper>

            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Text fw={700} size="sm">Robustness Study</Text>
                <SimpleGrid cols={2} spacing="sm">
                  <NumberInput label="Min Purity (%)" value={optimizerForm.robustness.purity_min_pct}
                    onChange={(v) => setOptimizerForm((f) => ({
                      ...f, robustness: { ...f.robustness, purity_min_pct: v }
                    }))} styles={inputSx} min={0} max={100} />
                  <NumberInput label="Random Cases" value={optimizerForm.robustness.random_cases}
                    onChange={(v) => setOptimizerForm((f) => ({
                      ...f, robustness: { ...f.robustness, random_cases: v }
                    }))} styles={inputSx} min={10} max={2000} />
                  <NumberInput label="Random Seed" value={optimizerForm.robustness.random_seed}
                    onChange={(v) => setOptimizerForm((f) => ({
                      ...f, robustness: { ...f.robustness, random_seed: v }
                    }))} styles={inputSx} />
                </SimpleGrid>
              </Stack>
            </Paper>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
