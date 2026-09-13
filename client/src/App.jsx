import { useState } from "react";
import {
  MantineProvider,
  createTheme,
  AppShell,
  Container,
  Group,
  Text,
  Button,
  Badge,
  ActionIcon,
  Tooltip,
  Grid,
  Box,
  SegmentedControl,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import {
  IconHistory,
  IconCpu,
  IconRotateClockwise,
  IconAdjustments,
  IconChartRadar,
} from "@tabler/icons-react";
import useStore from "./store/useStore";
import { InputPanel } from "./components/InputPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { OptimizerInputPanel } from "./components/optimizer/OptimizerInputPanel";
import { OptimizerResults } from "./components/optimizer/OptimizerResults";
import { ErrorBoundary } from "./components/ErrorBoundary";

const darkTheme = createTheme({
  primaryColor: "blue",
  defaultRadius: "sm",
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace: "JetBrains Mono, monospace",
});

export default function App() {
  const [appMode, setAppMode] = useState("manual"); // "manual" | "optimizer"
  const setHistoryOpen = useStore((state) => state.setHistoryOpen);
  const resetForm = useStore((state) => state.resetForm);
  const resetOptimizerForm = useStore((state) => state.resetOptimizerForm);

  return (
    <MantineProvider theme={darkTheme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <HistoryDrawer />

      <AppShell
        header={{ height: 64 }}
        padding="md"
        styles={{
          main: { background: "#0d1117" },
          header: {
            background: "#161b22",
            borderBottom: "1px solid #30363d",
          },
        }}
      >
        <AppShell.Header>
          <Container fluid h="100%" px="md">
            <Group justify="space-between" h="100%">
              <Group gap="sm">
                <Box
                  p={6}
                  style={{
                    borderRadius: 8,
                    background:
                      appMode === "optimizer"
                        ? "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)"
                        : "linear-gradient(135deg, #1f6feb 0%, #a371f7 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {appMode === "optimizer" ? (
                    <IconChartRadar size={22} color="#ffffff" />
                  ) : (
                    <IconCpu size={22} color="#ffffff" />
                  )}
                </Box>
                <div>
                  <Group gap="xs">
                    <Text fw={800} size="md" c="#ffffff" style={{ letterSpacing: "-0.3px" }}>
                      Engine NVH &amp; Mount Dynamics
                    </Text>
                    <Badge variant="filled" color={appMode === "optimizer" ? "violet" : "blue"} size="xs">
                      {appMode === "optimizer" ? "Optimizer" : "v1.0"}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {appMode === "optimizer"
                      ? "Multi-Case Differential Evolution Mount Optimizer"
                      : "TRA / eTRA Physical Tuning & 6-DOF Modal Decoupling Studio"}
                  </Text>
                </div>
              </Group>

              <Group gap="sm">
                {/* Mode toggle */}
                <SegmentedControl
                  size="xs"
                  value={appMode}
                  onChange={setAppMode}
                  data={[
                    { label: "Manual Analysis", value: "manual" },
                    { label: "Optimizer", value: "optimizer" },
                  ]}
                  styles={{
                    root: { background: "#21262d", border: "1px solid #30363d" },
                    label: { fontSize: "0.78rem", fontWeight: 600 },
                    indicator: {
                      background: appMode === "optimizer"
                        ? "linear-gradient(135deg,#7c3aed,#a78bfa)"
                        : "linear-gradient(135deg,#1f6feb,#388bfd)",
                    },
                  }}
                />

                {appMode === "manual" ? (
                  <>
                    <Tooltip label="Reset all inputs back to benchmark baseline">
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        leftSection={<IconRotateClockwise size={14} />}
                        onClick={resetForm}
                      >
                        Reset Baseline
                      </Button>
                    </Tooltip>
                    <Button
                      size="xs"
                      variant="light"
                      color="blue"
                      leftSection={<IconHistory size={14} />}
                      onClick={() => setHistoryOpen(true)}
                    >
                      History Runs
                    </Button>
                  </>
                ) : (
                  <Tooltip label="Reset optimizer inputs to defaults">
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<IconRotateClockwise size={14} />}
                      onClick={resetOptimizerForm}
                    >
                      Reset Optimizer
                    </Button>
                  </Tooltip>
                )}
              </Group>
            </Group>
          </Container>
        </AppShell.Header>

        <AppShell.Main>
          <Container fluid px="md" py="md">
            {appMode === "manual" ? (
              <Grid gutter="lg">
                {/* Left Column: Form & Inputs */}
                <Grid.Col span={{ base: 12, md: 5, lg: 4.5 }}>
                  <InputPanel />
                </Grid.Col>
                {/* Right Column: Results */}
                <Grid.Col span={{ base: 12, md: 7, lg: 7.5 }}>
                  <ResultsPanel />
                </Grid.Col>
              </Grid>
            ) : (
              <Grid gutter="lg">
                {/* Left Column: Optimizer Inputs */}
                <Grid.Col span={{ base: 12, md: 5, lg: 4 }}>
                  <OptimizerInputPanel />
                </Grid.Col>
                {/* Right Column: Optimizer Results */}
                <Grid.Col span={{ base: 12, md: 7, lg: 8 }}>
                  <ErrorBoundary>
                    <OptimizerResults />
                  </ErrorBoundary>
                </Grid.Col>
              </Grid>
            )}
          </Container>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
