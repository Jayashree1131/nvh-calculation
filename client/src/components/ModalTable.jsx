import { Table, Badge, Text, Paper, Progress, Tooltip } from "@mantine/core";

const DOF_COLORS = {
  Tx: "blue",
  Ty: "cyan",
  Tz: "teal",
  Rx: "violet",
  Ry: "grape",
  Rz: "orange",
};

function PurityBar({ value, pass }) {
  return (
    <Tooltip label={`${value.toFixed(2)}% purity`} withArrow>
      <Progress
        value={value}
        color={pass ? "teal" : "red"}
        size="sm"
        radius="xl"
        style={{ minWidth: 60 }}
      />
    </Tooltip>
  );
}

function pct(v) {
  return (
    <Text ff="monospace" size="xs" c={v >= 50 ? "white" : "dimmed"}>
      {v.toFixed(1)}
    </Text>
  );
}

export default function ModalTable({ result }) {
  if (!result?.modal_table) return null;

  const rows = result.modal_table.map((m) => (
    <Table.Tr
      key={m.mode}
      style={{
        background: m.pass ? undefined : "rgba(239,68,68,0.06)",
      }}
    >
      <Table.Td>
        <Text fw={700} size="sm">
          {m.mode}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text ff="monospace" size="sm" fw={600}>
          {m.frequency_hz.toFixed(3)}
        </Text>
      </Table.Td>
      <Table.Td>{pct(m.Tx_pct)}</Table.Td>
      <Table.Td>{pct(m.Ty_pct)}</Table.Td>
      <Table.Td>{pct(m.Tz_pct)}</Table.Td>
      <Table.Td>{pct(m.Rx_pct)}</Table.Td>
      <Table.Td>{pct(m.Ry_pct)}</Table.Td>
      <Table.Td>{pct(m.Rz_pct)}</Table.Td>
      <Table.Td>
        <Badge color={DOF_COLORS[m.dominant_dof] || "gray"} variant="light" size="sm">
          {m.dominant_dof}
        </Badge>
      </Table.Td>
      <Table.Td>
        <PurityBar value={m.purity_pct} pass={m.pass} />
      </Table.Td>
      <Table.Td>
        <Badge color={m.pass ? "teal" : "red"} variant="dot" size="sm">
          {m.pass ? "PASS" : "FAIL"}
        </Badge>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
      <Table striped highlightOnHover withColumnBorders fontSize="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Mode</Table.Th>
            <Table.Th>Hz</Table.Th>
            <Table.Th>Tx%</Table.Th>
            <Table.Th>Ty%</Table.Th>
            <Table.Th>Tz%</Table.Th>
            <Table.Th>Rx%</Table.Th>
            <Table.Th>Ry%</Table.Th>
            <Table.Th>Rz%</Table.Th>
            <Table.Th>Dominant</Table.Th>
            <Tooltip label="% kinetic energy in dominant DOF — must be ≥80% for good decoupling" withArrow>
              <Table.Th style={{ cursor: "help" }}>Purity ⓘ</Table.Th>
            </Tooltip>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
    </Paper>
  );
}
