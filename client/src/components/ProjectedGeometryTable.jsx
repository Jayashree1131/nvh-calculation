import { Table, Badge, Text, Paper, Tooltip, Group } from "@mantine/core";

const PLANES = [
  { key: "YZ", label: "YZ (Front View)", primary: true },
  { key: "XY", label: "XY (Top View)", primary: false },
  { key: "ZX", label: "ZX (Side View)", primary: false },
];

function angleBadge(deg) {
  const color = deg < 5 ? "teal" : deg < 15 ? "yellow" : "red";
  return (
    <Badge color={color} variant="light" size="sm">
      {deg.toFixed(3)}°
    </Badge>
  );
}

export default function ProjectedGeometryTable({ result }) {
  if (!result?.projected) return null;

  const rows = PLANES.map(({ key, label, primary }) => {
    const p = result.projected[key];
    if (!p) return null;

    return (
      <Table.Tr
        key={key}
        style={primary ? { background: "rgba(99, 102, 241, 0.08)" } : undefined}
      >
        <Table.Td>
          <Group gap="xs" wrap="nowrap">
            <Text fw={primary ? 700 : 400} size="sm">
              {label}
            </Text>
            {primary && (
              <Badge size="xs" color="violet" variant="filled">
                Primary
              </Badge>
            )}
          </Group>
        </Table.Td>
        <Table.Td>{angleBadge(p.misalignment_deg)}</Table.Td>
        <Table.Td>
          <Text ff="monospace" size="sm">
            {p.nearest_distance_mm?.toFixed(3)} mm
          </Text>
        </Table.Td>
        <Table.Td>
          {p.intersection_2d ? (
            <Text ff="monospace" size="xs" c="dimmed">
              [{p.intersection_2d.map((v) => v.toFixed(1)).join(", ")}]
            </Text>
          ) : (
            <Badge color="gray" variant="outline" size="xs">
              Parallel / Coincident
            </Badge>
          )}
        </Table.Td>
        <Table.Td>
          <Text ff="monospace" size="xs" c="dimmed">
            TRA: {p.tra_line_angle_deg?.toFixed(2)}° | eTRA: {p.etra_line_angle_deg?.toFixed(2)}°
          </Text>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
      <Table striped highlightOnHover withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Projection Plane</Table.Th>
            <Tooltip label="Smallest angle between projected TRA and eTRA lines (0–90°)" withArrow>
              <Table.Th style={{ cursor: "help" }}>Misalignment ⓘ</Table.Th>
            </Tooltip>
            <Tooltip label="Perpendicular distance from projected CG to projected eTRA line" withArrow>
              <Table.Th style={{ cursor: "help" }}>CG→eTRA Distance ⓘ</Table.Th>
            </Tooltip>
            <Table.Th>Intersection</Table.Th>
            <Table.Th>Line Angles</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </Paper>
  );
}
