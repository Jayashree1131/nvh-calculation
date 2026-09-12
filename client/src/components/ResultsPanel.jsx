import {
  Paper,
  Stack,
  Center,
  Text,
  Loader,
  Group,
  ThemeIcon,
  Badge,
} from "@mantine/core";
import { IconCpu, IconRocket } from "@tabler/icons-react";
import useStore from "../store/useStore";
import ValidationBadges from "./ValidationBadges";
import { VectorDisplay, MisalignmentCard } from "./VectorDisplay";
import ModalTable from "./ModalTable";
import ProjectedGeometryTable from "./ProjectedGeometryTable";
import { PlotViewer } from "./PlotViewer";
import { RobustnessPanel } from "./RobustnessPanel";

export function ResultsPanel() {
  const calcState = useStore((state) => state.calcState);
  const calcResult = useStore((state) => state.calcResult);
  const robustnessState = useStore((state) => state.robustnessState);
  const robustnessResult = useStore((state) => state.robustnessResult);
  const robustnessError = useStore((state) => state.robustnessError);

  if (calcState === "loading") {
    return (
      <Paper p="xl" radius="md" withBorder style={{ minHeight: 400 }}>
        <Center style={{ height: "100%", flexDirection: "column", gap: "1rem" }}>
          <Loader size="lg" color="blue" />
          <Stack gap={4} align="center">
            <Text fw={700} size="md">
              Computing Engine Rigid Body Dynamics...
            </Text>
            <Text size="xs" c="dimmed">
              Forming mass & stiffness matrices (6-DOF) and solving generalized eigenvalue problem.
            </Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  if (!calcResult) {
    return (
      <Paper p="xl" radius="md" withBorder style={{ minHeight: 400 }}>
        <Center style={{ height: "100%", flexDirection: "column", gap: "1rem", textAlign: "center" }}>
          <ThemeIcon size={64} radius="xl" variant="light" color="blue">
            <IconRocket size={32} />
          </ThemeIcon>
          <Stack gap={4} align="center" style={{ maxWidth: 420 }}>
            <Text fw={700} size="lg">
              Ready to Calculate
            </Text>
            <Text size="sm" c="dimmed">
              Adjust engine mass, CG location, inertia tensor, and mount stiffness/angles on the left, then click <b>Calculate NVH</b>.
            </Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {/* ── 1. Validation & Integrity Badges ── */}
      <ValidationBadges result={calcResult} />

      {/* ── 2. TRA & eTRA Vectors + 3D Misalignment ── */}
      <VectorDisplay result={calcResult} />
      <MisalignmentCard result={calcResult} />

      {/* ── 3. Modal Frequencies & Kinetic Energy Purity ── */}
      <ModalTable result={calcResult} />

      {/* ── 4. 2D Projected Geometry (YZ, XY, ZX) ── */}
      <ProjectedGeometryTable result={calcResult} />

      {/* ── 5. Inline Plots & Download ── */}
      <PlotViewer plots={calcResult.plots} />

      {/* ── 6. Robustness Sensitivity Results (if executed) ── */}
      <RobustnessPanel
        robustnessData={robustnessResult || calcResult.robustness}
        isLoading={robustnessState === "loading"}
        error={robustnessError}
      />
    </Stack>
  );
}
