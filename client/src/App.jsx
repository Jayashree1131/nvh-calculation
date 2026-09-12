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
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import {
  IconHistory,
  IconAdjustments,
  IconCpu,
  IconDeviceFloppy,
  IconRotateClockwise,
} from "@tabler/icons-react";
import useStore from "./store/useStore";
import { InputPanel } from "./components/InputPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { HistoryDrawer } from "./components/HistoryDrawer";

const darkTheme = createTheme({
  primaryColor: "blue",
  defaultRadius: "sm",
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace: "JetBrains Mono, monospace",
});

export default function App() {
  const setHistoryOpen = useStore((state) => state.setHistoryOpen);
  const resetForm = useStore((state) => state.resetForm);

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
                    background: "linear-gradient(135deg, #1f6feb 0%, #a371f7 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconCpu size={22} color="#ffffff" />
                </Box>
                <div>
                  <Group gap="xs">
                    <Text fw={800} size="md" c="#ffffff" style={{ letterSpacing: "-0.3px" }}>
                      Engine NVH & Mount Dynamics
                    </Text>
                    <Badge variant="filled" color="blue" size="xs">
                      v1.0
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    TRA / eTRA Physical Tuning & 6-DOF Modal Decoupling Studio
                  </Text>
                </div>
              </Group>

              <Group gap="sm">
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
              </Group>
            </Group>
          </Container>
        </AppShell.Header>

        <AppShell.Main>
          <Container fluid px="md" py="md">
            <Grid gutter="lg">
              {/* Left Column: Form & Inputs (40% width on large screens) */}
              <Grid.Col span={{ base: 12, md: 5, lg: 4.5 }}>
                <InputPanel />
              </Grid.Col>

              {/* Right Column: Calculations, Vectors, Tables, Plots, Robustness (60% width) */}
              <Grid.Col span={{ base: 12, md: 7, lg: 7.5 }}>
                <ResultsPanel />
              </Grid.Col>
            </Grid>
          </Container>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
