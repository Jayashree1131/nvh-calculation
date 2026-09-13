import { useState } from "react";
import {
  Paper,
  Tabs,
  Group,
  Button,
  Text,
  Stack,
  ActionIcon,
  Tooltip,
  Center,
  Badge,
  Modal,
  SegmentedControl,
  Box,
} from "@mantine/core";
import {
  IconDownload,
  IconCube,
  IconGridDots,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
  IconArrowsMaximize,
  IconLayersSubtract,
} from "@tabler/icons-react";

export function PlotViewer({ plots }) {
  const [zoom3d, setZoom3d] = useState(1);
  const [zoomProj, setZoomProj] = useState(1);
  const [projPlane, setProjPlane] = useState("all");
  const [fullscreenModal, setFullscreenModal] = useState(false);
  const [modalData, setModalData] = useState({ src: "", title: "", filename: "" });

  if (!plots || (!plots.plot_3d_base64 && !plots.plot_projected_base64)) {
    return null;
  }

  const handleDownload = (base64Data, filename) => {
    if (!base64Data) return;
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${base64Data}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openFullscreen = (base64Data, title, filename) => {
    setModalData({
      src: `data:image/png;base64,${base64Data}`,
      title,
      filename,
    });
    setFullscreenModal(true);
  };

  // Determine active projected image
  let activeProjB64 = plots.plot_projected_base64;
  let activeProjTitle = "All 3 Planes (Panoramic YZ, XY, ZX)";
  let activeProjFilename = "engine_nvh_projected_all_planes.png";

  if (projPlane === "yz" && plots.plot_yz_base64) {
    activeProjB64 = plots.plot_yz_base64;
    activeProjTitle = "YZ Plane — Front View (Primary Decoupling)";
    activeProjFilename = "engine_nvh_projected_YZ_front.png";
  } else if (projPlane === "xy" && plots.plot_xy_base64) {
    activeProjB64 = plots.plot_xy_base64;
    activeProjTitle = "XY Plane — Top View";
    activeProjFilename = "engine_nvh_projected_XY_top.png";
  } else if (projPlane === "zx" && plots.plot_zx_base64) {
    activeProjB64 = plots.plot_zx_base64;
    activeProjTitle = "ZX Plane — Side View";
    activeProjFilename = "engine_nvh_projected_ZX_side.png";
  }

  return (
    <>
      <Paper p="md" radius="md" withBorder style={{ minWidth: 0, width: "100%" }}>
        <Stack gap="sm">
          {/* Header */}
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <Text fw={700} size="sm">
                Visualization & Geometry Plots
              </Text>
              <Badge size="xs" color="blue" variant="light">
                Responsive High-Res
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Use controls to zoom, expand to full screen, or download PNG
            </Text>
          </Group>

          {/* Main Tabs */}
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
                {/* 3D Action & Zoom Toolbar */}
                <Group justify="space-between" wrap="wrap" gap="xs">
                  {/* Zoom Controls */}
                  <Group gap={6}>
                    <Text size="xs" c="dimmed" fw={600}>
                      Zoom:
                    </Text>
                    <Tooltip label="Zoom Out (-25%)">
                      <ActionIcon
                        size="sm"
                        variant="default"
                        onClick={() =>
                          setZoom3d((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))
                        }
                        disabled={zoom3d <= 0.5}
                      >
                        <IconZoomOut size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Badge
                      size="sm"
                      variant="light"
                      color="blue"
                      style={{ minWidth: 48, textAlign: "center" }}
                    >
                      {Math.round(zoom3d * 100)}%
                    </Badge>
                    <Tooltip label="Zoom In (+25%)">
                      <ActionIcon
                        size="sm"
                        variant="default"
                        onClick={() =>
                          setZoom3d((z) => Math.min(3.0, Number((z + 0.25).toFixed(2))))
                        }
                        disabled={zoom3d >= 3.0}
                      >
                        <IconZoomIn size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Reset to Fit">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => setZoom3d(1)}
                        disabled={zoom3d === 1}
                      >
                        <IconZoomReset size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>

                  {/* Actions */}
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      color="indigo"
                      leftSection={<IconArrowsMaximize size={13} />}
                      onClick={() =>
                        openFullscreen(
                          plots.plot_3d_base64,
                          "3D TRA / eTRA Geometry with Mount Positions",
                          "engine_nvh_3d_geometry.png"
                        )
                      }
                      disabled={!plots.plot_3d_base64}
                    >
                      Inspect Fullscreen
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="cyan"
                      leftSection={<IconDownload size={13} />}
                      onClick={() =>
                        handleDownload(plots.plot_3d_base64, "engine_nvh_3d_geometry.png")
                      }
                      disabled={!plots.plot_3d_base64}
                    >
                      Download PNG
                    </Button>
                  </Group>
                </Group>

                {/* 3D Viewer Box */}
                {plots.plot_3d_base64 ? (
                  <Box
                    style={{
                      width: "100%",
                      minHeight: 360,
                      maxHeight: "65vh",
                      overflow: "auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#16213e",
                      borderRadius: 8,
                      border: "1px solid #30363d",
                      padding: 6,
                    }}
                  >
                    <img
                      src={`data:image/png;base64,${plots.plot_3d_base64}`}
                      alt="3D TRA and eTRA visualization"
                      style={{
                        maxWidth: zoom3d === 1 ? "100%" : "none",
                        width: zoom3d === 1 ? "100%" : `${zoom3d * 100}%`,
                        height: "auto",
                        maxHeight: zoom3d === 1 ? "62vh" : "none",
                        objectFit: "contain",
                        display: "block",
                        borderRadius: 4,
                        transition: "width 0.2s ease",
                      }}
                    />
                  </Box>
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
                {/* Plane View Selector & Toolbar */}
                <Group justify="space-between" wrap="wrap" gap="xs">
                  {/* Plane Switcher */}
                  <SegmentedControl
                    size="xs"
                    value={projPlane}
                    onChange={(val) => {
                      setProjPlane(val);
                      setZoomProj(1); // reset zoom when switching plane
                    }}
                    data={[
                      { label: "All 3 Planes (Panoramic)", value: "all" },
                      { label: "YZ (Front — Primary)", value: "yz" },
                      { label: "XY (Top View)", value: "xy" },
                      { label: "ZX (Side View)", value: "zx" },
                    ]}
                  />

                  {/* Zoom Controls */}
                  <Group gap={6}>
                    <Text size="xs" c="dimmed" fw={600}>
                      Zoom:
                    </Text>
                    <Tooltip label="Zoom Out (-25%)">
                      <ActionIcon
                        size="sm"
                        variant="default"
                        onClick={() =>
                          setZoomProj((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))
                        }
                        disabled={zoomProj <= 0.5}
                      >
                        <IconZoomOut size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Badge
                      size="sm"
                      variant="light"
                      color="pink"
                      style={{ minWidth: 48, textAlign: "center" }}
                    >
                      {Math.round(zoomProj * 100)}%
                    </Badge>
                    <Tooltip label="Zoom In (+25%)">
                      <ActionIcon
                        size="sm"
                        variant="default"
                        onClick={() =>
                          setZoomProj((z) => Math.min(3.0, Number((z + 0.25).toFixed(2))))
                        }
                        disabled={zoomProj >= 3.0}
                      >
                        <IconZoomIn size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Reset to Fit">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => setZoomProj(1)}
                        disabled={zoomProj === 1}
                      >
                        <IconZoomReset size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>

                  {/* Actions */}
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      color="indigo"
                      leftSection={<IconArrowsMaximize size={13} />}
                      onClick={() =>
                        openFullscreen(activeProjB64, activeProjTitle, activeProjFilename)
                      }
                      disabled={!activeProjB64}
                    >
                      Inspect Fullscreen
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="pink"
                      leftSection={<IconDownload size={13} />}
                      onClick={() => handleDownload(activeProjB64, activeProjFilename)}
                      disabled={!activeProjB64}
                    >
                      Download PNG
                    </Button>
                  </Group>
                </Group>

                {/* Sub-label showing current view description */}
                <Group justify="space-between" px={4}>
                  <Text size="xs" fw={600} c="cyan">
                    {activeProjTitle}
                  </Text>
                  {projPlane === "all" && (
                    <Text size="xs" c="dimmed">
                      Tip: Select YZ, XY, or ZX above to view each plane in full dedicated resolution
                    </Text>
                  )}
                </Group>

                {/* Projected Viewer Box */}
                {activeProjB64 ? (
                  <Box
                    style={{
                      width: "100%",
                      minHeight: 360,
                      maxHeight: "65vh",
                      overflow: "auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#16213e",
                      borderRadius: 8,
                      border: "1px solid #30363d",
                      padding: 6,
                    }}
                  >
                    <img
                      src={`data:image/png;base64,${activeProjB64}`}
                      alt={activeProjTitle}
                      style={{
                        maxWidth: zoomProj === 1 ? "100%" : "none",
                        width: zoomProj === 1 ? "100%" : `${zoomProj * 100}%`,
                        height: "auto",
                        maxHeight: zoomProj === 1 ? "62vh" : "none",
                        objectFit: "contain",
                        display: "block",
                        borderRadius: 4,
                        transition: "width 0.2s ease",
                      }}
                    />
                  </Box>
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

      {/* ── High-Resolution Fullscreen Modal ── */}
      <Modal
        opened={fullscreenModal}
        onClose={() => setFullscreenModal(false)}
        title={
          <Group gap="sm">
            <IconLayersSubtract size={18} color="#4cc9f0" />
            <Text fw={700} size="sm">
              {modalData.title}
            </Text>
          </Group>
        }
        size="95%"
        radius="md"
        centered
        styles={{
          header: { background: "#161b22", borderBottom: "1px solid #30363d" },
          body: { background: "#0d1117", padding: "16px" },
        }}
      >
        <Stack gap="md">
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="light"
              color="cyan"
              leftSection={<IconDownload size={14} />}
              onClick={() => {
                const link = document.createElement("a");
                link.href = modalData.src;
                link.download = modalData.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              Download Full-Res PNG
            </Button>
          </Group>

          <Box
            style={{
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#16213e",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <img
              src={modalData.src}
              alt={modalData.title}
              style={{
                maxWidth: "100%",
                height: "auto",
                maxHeight: "76vh",
                objectFit: "contain",
                display: "block",
                borderRadius: 4,
              }}
            />
          </Box>
        </Stack>
      </Modal>
    </>
  );
}
