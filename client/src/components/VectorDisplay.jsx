import { Paper, Group, Text, Badge, Stack, ThemeIcon, RingProgress, Tooltip } from "@mantine/core";
import { IconArrowsExchange, IconTarget } from "@tabler/icons-react";

function VectorCard({ label, data, color }) {
  const vec = data?.vector || [0, 0, 0];
  const angle = data?.angle_from_Y_deg ?? 0;

  return (
    <Paper p="md" radius="md" withBorder style={{ flex: 1 }}>
      <Stack gap="xs">
        <Group gap="xs">
          <ThemeIcon size="sm" color={color} variant="light" radius="xl">
            <IconArrowsExchange size={13} />
          </ThemeIcon>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            {label}
          </Text>
        </Group>

        <Group gap={4} wrap="nowrap">
          {["X", "Y", "Z"].map((axis, i) => (
            <Paper
              key={axis}
              p="xs"
              radius="sm"
              style={{
                flex: 1,
                background: "var(--mantine-color-dark-6)",
                textAlign: "center",
              }}
            >
              <Text size="xs" c="dimmed" mb={2}>
                {axis}
              </Text>
              <Text size="sm" fw={700} ff="monospace" c={color}>
                {vec[i]?.toFixed(5)}
              </Text>
            </Paper>
          ))}
        </Group>

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Angle from +Y axis
          </Text>
          <Badge color={color} variant="light" size="sm">
            {angle.toFixed(3)}°
          </Badge>
        </Group>
      </Stack>
    </Paper>
  );
}

export function VectorDisplay({ result }) {
  if (!result) return null;
  return (
    <Group grow gap="sm">
      <VectorCard label="TRA (Torque Roll Axis)" data={result.tra} color="cyan" />
      <VectorCard label="eTRA (Elastic TRA)" data={result.eTRA} color="pink" />
    </Group>
  );
}

export function MisalignmentCard({ result }) {
  if (!result) return null;

  const deg3d = result.misalignment_3D_deg ?? 0;
  const offset = result.cg_to_eTRA_offset_mm ?? 0;

  const color = deg3d < 5 ? "teal" : deg3d < 15 ? "yellow" : "red";
  const interpretation =
    deg3d < 5
      ? "Excellent — TRA and eTRA are well aligned"
      : deg3d < 15
      ? "Acceptable — minor mount tuning may improve alignment"
      : "Poor — significant TRA/eTRA misalignment; revisit mount positions/stiffness";

  const ringVal = Math.min(100, (deg3d / 30) * 100);

  return (
    <Paper p="md" radius="md" withBorder>
      <Group align="flex-start" gap="md" wrap="nowrap">
        <Tooltip label="Misalignment scale: 0–30°" withArrow>
          <RingProgress
            size={90}
            thickness={8}
            roundCaps
            sections={[{ value: ringVal, color }]}
            label={
              <Text ta="center" size="xs" fw={700} c={color}>
                {deg3d.toFixed(1)}°
              </Text>
            }
          />
        </Tooltip>

        <Stack gap="xs" style={{ flex: 1 }}>
          <Text fw={700} size="sm">
            3D TRA–eTRA Misalignment
          </Text>
          <Text size="xs" c={color} fw={600}>
            {interpretation}
          </Text>
          <Group gap="lg">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                CG → eTRA Offset
              </Text>
              <Text size="sm" fw={700} ff="monospace">
                {offset.toFixed(3)} mm
              </Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Nearest Point
              </Text>
              <Text size="xs" ff="monospace" c="dimmed">
                [{result.eTRA_nearest_point_mm?.map((v) => v.toFixed(1)).join(", ")}]
              </Text>
            </Stack>
          </Group>
        </Stack>
      </Group>
    </Paper>
  );
}
