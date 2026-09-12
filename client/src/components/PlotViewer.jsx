import {
  Paper,
  Tabs,
  Image,
  Group,
  Button,
  Text,
  Stack,
  ActionIcon,
  Tooltip,
  Center,
  Badge,
} from "@mantine/core";
import {
  IconDownload,
  IconEye,
  IconCube,
  IconGridDots,
} from "@tabler/icons-react";

export function PlotViewer({ plots }) {
  if (!plots || (!plots.plot_3d_base64 && !plots.plot_projected_base64)) {
    return null;
  }

  const handleDownload = (base64Data, filename) => {
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${base64Data}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <Text fw={700} size="sm">
              Visualization & Geometry Plots
            </Text>
            <Badge size="xs" color="blue" variant="light">
              High Resolution
            </Badge>
          </Group>
        </Group>

        <Tabs defaultValue="3d" variant="outline">
          <Tabs.List>
            <Tabs.Tab value="3d" leftSection={<IconCube size={14} />}>
              3D Geometry & Trajectories
            </Tabs.Tab>
            <Tabs.Tab value="projected" leftSection={<IconGridDots size={14} />}>
              Projected Views (YZ, XY, ZX)
            </Tabs.Tab>
          </Tabs.List>

          {/* ── Tab 1: 3D Plot ── */}
          <Tabs.Panel value="3d" pt="md">
            <Stack gap="xs">
              <Group justify="flex-end">
                <Button
                  size="xs"
                  variant="light"
                  color="cyan"
                  leftSection={<IconDownload size={14} />}
                  onClick={() =>
                    handleDownload(plots.plot_3d_base64, "engine_nvh_3d_geometry.png")
                  }
                  disabled={!plots.plot_3d_base64}
                >
                  Download 3D Plot (PNG)
                </Button>
              </Group>
              {plots.plot_3d_base64 ? (
                <Paper
                  radius="md"
                  withBorder
                  style={{ overflow: "hidden", background: "#16213e" }}
                >
                  <Image
                    src={`data:image/png;base64,${plots.plot_3d_base64}`}
                    alt="3D TRA and eTRA visualization"
                    fit="contain"
                    radius="sm"
                  />
                </Paper>
              ) : (
                <Center p="xl">
                  <Text size="sm" c="dimmed">
                    3D plot not generated.
                  </Text>
                </Center>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ── Tab 2: Projected Planes Plot ── */}
          <Tabs.Panel value="projected" pt="md">
            <Stack gap="xs">
              <Group justify="flex-end">
                <Button
                  size="xs"
                  variant="light"
                  color="pink"
                  leftSection={<IconDownload size={14} />}
                  onClick={() =>
                    handleDownload(
                      plots.plot_projected_base64,
                      "engine_nvh_projected_views.png"
                    )
                  }
                  disabled={!plots.plot_projected_base64}
                >
                  Download Projections (PNG)
                </Button>
              </Group>
              {plots.plot_projected_base64 ? (
                <Paper
                  radius="md"
                  withBorder
                  style={{ overflow: "hidden", background: "#16213e" }}
                >
                  <Image
                    src={`data:image/png;base64,${plots.plot_projected_base64}`}
                    alt="Projected views YZ, XY, ZX"
                    fit="contain"
                    radius="sm"
                  />
                </Paper>
              ) : (
                <Center p="xl">
                  <Text size="sm" c="dimmed">
                    Projected planes plot not generated.
                  </Text>
                </Center>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Paper>
  );
}
