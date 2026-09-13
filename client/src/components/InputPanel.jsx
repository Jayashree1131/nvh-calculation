import { useState } from "react";
import {
  Paper,
  Stack,
  Group,
  Text,
  TextInput,
  Button,
  SimpleGrid,
  Divider,
  ActionIcon,
  Tooltip,
  Alert,
  Tabs,
  Badge,
  ThemeIcon,
  Box,
} from "@mantine/core";
import {
  IconCalculator,
  IconChartDots,
  IconRotateClockwise,
  IconPlus,
  IconAlertCircle,
  IconEngine,
  IconSettings,
  IconLayersSubtract,
  IconInfoCircle,
} from "@tabler/icons-react";
import useStore from "../store/useStore";
import { useCalculate, useRobustness } from "../hooks/useCalculate";
import { InertiaTensorGrid } from "./InertiaTensorGrid";
import { MountCard } from "./MountCard";
import { sanitizeNumericInput } from "../utils/validators";

export function InputPanel() {
  const [activeTab, setActiveTab] = useState("constants");

  const form = useStore((state) => state.form);
  const setForm = useStore((state) => state.setForm);
  const resetForm = useStore((state) => state.resetForm);
  const calcState = useStore((state) => state.calcState);
  const calcError = useStore((state) => state.calcError);
  const robustnessState = useStore((state) => state.robustnessState);
  const validationErrors = useStore((state) => state.validationErrors);

  const { calculate } = useCalculate();
  const { runRobustness } = useRobustness();

  const handleNumChange = (field, val) => {
    const clean = sanitizeNumericInput(val);
    if (clean !== null) {
      setForm((prev) => ({ ...prev, [field]: clean }));
    }
  };

  const handleCgChange = (idx, val) => {
    const clean = sanitizeNumericInput(val);
    if (clean !== null) {
      setForm((prev) => {
        const cg = [...prev.cg];
        cg[idx] = clean;
        return { ...prev, cg };
      });
    }
  };

  const handleAddMount = () => {
    const nextIdx = form.mounts.length + 1;
    setForm((prev) => ({
      ...prev,
      mounts: [
        ...prev.mounts,
        {
          name: `MOUNT_${nextIdx}`,
          x: 2100.0,
          y: 0.0,
          z: 100.0,
          kx: 80.0,
          ky: 40.0,
          kz: 80.0,
          roll: 0.0,
          pitch: 0.0,
          yaw: 0.0,
        },
      ],
    }));
  };

  const isCalculating = calcState === "loading";
  const isRobustnessLoading = robustnessState === "loading";

  return (
    <Stack gap="md">
      {/* ── Top Sticky / Header Control Bar ── */}
      <Paper
        p="sm"
        radius="md"
        withBorder
        style={{
          background: "linear-gradient(180deg, #1c2128 0%, #161b22 100%)",
          border: "1px solid #30363d",
        }}
      >
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs">
              <Badge variant="dot" color="blue" size="sm">
                Mass: {form.mass ?? 0} kg
              </Badge>
              <Badge variant="dot" color="cyan" size="sm">
                Torque: {form.torque ?? 0} Nm
              </Badge>
              <Badge variant="dot" color="teal" size="sm">
                {form.mounts?.length || 0} Mounts
              </Badge>
            </Group>
            <Tooltip label="Reset all inputs back to benchmark baseline">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={resetForm}
              >
                <IconRotateClockwise size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>

          <Group grow gap="xs">
            <Button
              size="md"
              color="blue"
              leftSection={<IconCalculator size={18} />}
              loading={isCalculating}
              onClick={calculate}
              style={{
                boxShadow: "0 4px 12px rgba(31, 111, 235, 0.3)",
              }}
            >
              Calculate 6 DOF
            </Button>
            <Button
              size="md"
              variant="light"
              color="teal"
              leftSection={<IconChartDots size={18} />}
              loading={isRobustnessLoading}
              onClick={runRobustness}
            >
              Robustness Study
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* ── Error Banner if Calc Failed ── */}
      {calcError && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Calculation Error"
          color="red"
          radius="md"
        >
          {calcError}
        </Alert>
      )}

      {/* ── Tabbed View: Constants vs Mount Inputs ── */}
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        variant="pills"
        radius="md"
        styles={{
          tab: {
            fontWeight: 600,
            fontSize: "0.85rem",
          },
        }}
      >
        <Tabs.List grow mb="sm">
          <Tabs.Tab
            value="constants"
            leftSection={<IconSettings size={16} />}
            rightSection={
              <Badge size="xs" color="gray" variant="light">
                Constants
              </Badge>
            }
          >
            Engine Constants
          </Tabs.Tab>

          <Tabs.Tab
            value="mounts"
            leftSection={<IconLayersSubtract size={16} />}
            rightSection={
              <Badge size="xs" color="blue" variant="filled">
                {form.mounts?.length || 0}
              </Badge>
            }
          >
            Mount Tuning Inputs
          </Tabs.Tab>
        </Tabs.List>

        {/* ──────── TAB 1: ENGINE CONSTANTS ──────── */}
        <Tabs.Panel value="constants">
          <Stack gap="md">
            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Group gap="xs">
                    <ThemeIcon color="blue" variant="light" size="sm">
                      <IconEngine size={16} />
                    </ThemeIcon>
                    <div>
                      <Text fw={700} size="sm">
                        Powertrain Physical Constants
                      </Text>
                      <Text size="xs" c="dimmed">
                        Physical parameters of the engine — set once, adjustable anytime
                      </Text>
                    </div>
                  </Group>
                </Group>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <TextInput
                    label="Engine Mass (kg)"
                    description="Total powertrain mass (m)"
                    value={form.mass ?? ""}
                    onChange={(e) => handleNumChange("mass", e.currentTarget.value)}
                    error={validationErrors.mass}
                    styles={{ input: { fontFamily: "monospace" } }}
                  />
                  <TextInput
                    label="Applied Torque (Nm)"
                    description="Max drive torque (T)"
                    value={form.torque ?? ""}
                    onChange={(e) => handleNumChange("torque", e.currentTarget.value)}
                    error={validationErrors.torque}
                    styles={{ input: { fontFamily: "monospace" } }}
                  />
                </SimpleGrid>

                <TextInput
                  label="Dynamic Stiffness Factor (Kd / Ks)"
                  description="Multiplier for dynamic rubber mount rates (typically 1.15 to 1.50)"
                  value={form.dynamic_stiffness_factor ?? ""}
                  onChange={(e) =>
                    handleNumChange("dynamic_stiffness_factor", e.currentTarget.value)
                  }
                  error={validationErrors.dynamic_stiffness_factor}
                  styles={{ input: { fontFamily: "monospace" } }}
                />

                <div>
                  <Text size="xs" c="dimmed" fw={600} mb={3}>
                    Center of Gravity [X, Y, Z] (mm)
                  </Text>
                  <SimpleGrid cols={3} spacing="xs">
                    {["X", "Y", "Z"].map((coord, idx) => (
                      <TextInput
                        key={coord}
                        size="xs"
                        label={coord}
                        value={form.cg?.[idx] ?? ""}
                        onChange={(e) => handleCgChange(idx, e.currentTarget.value)}
                        error={validationErrors[`cg_${idx}`]}
                        styles={{ input: { fontFamily: "monospace" } }}
                      />
                    ))}
                  </SimpleGrid>
                </div>
              </Stack>
            </Paper>

            {/* ── Inertia Tensor Card ── */}
            <InertiaTensorGrid />

            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                After adjusting constants, switch to <b>Mount Inputs</b> or click Calculate.
              </Text>
              <Button
                size="xs"
                variant="light"
                color="blue"
                rightSection={<IconLayersSubtract size={14} />}
                onClick={() => setActiveTab("mounts")}
              >
                Go to Mount Inputs →
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* ──────── TAB 2: MOUNT TUNING INPUTS ──────── */}
        <Tabs.Panel value="mounts">
          <Stack gap="md">
            <Paper p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group justify="space-between">
                  <div>
                    <Text fw={700} size="sm">
                      Mount Configurations ({form.mounts?.length || 0})
                    </Text>
                    <Text size="xs" c="dimmed">
                      Adjust positions, stiffness rates, and orientation angles
                    </Text>
                  </div>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPlus size={14} />}
                    onClick={handleAddMount}
                  >
                    Add Mount
                  </Button>
                </Group>

                <Stack gap="xs">
                  {form.mounts?.map((mount, index) => (
                    <MountCard
                      key={index}
                      mount={mount}
                      index={index}
                      totalMounts={form.mounts.length}
                    />
                  ))}
                </Stack>
              </Stack>
            </Paper>

            {/* ── Bottom Action Controls ── */}
            <Group grow>
              <Button
                size="md"
                color="blue"
                leftSection={<IconCalculator size={18} />}
                loading={isCalculating}
                onClick={calculate}
              >
                Calculate 6 DOF              </Button>
              <Button
                size="md"
                variant="light"
                color="teal"
                leftSection={<IconChartDots size={18} />}
                loading={isRobustnessLoading}
                onClick={runRobustness}
              >
                Robustness Study
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
