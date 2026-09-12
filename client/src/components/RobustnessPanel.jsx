import {
  Paper,
  Stack,
  Group,
  Text,
  Badge,
  Table,
  Progress,
  SimpleGrid,
  Accordion,
  Alert,
  ThemeIcon,
} from "@mantine/core";
import {
  IconChartDots,
  IconCircleCheck,
  IconAlertTriangle,
  IconInfoCircle,
} from "@tabler/icons-react";

const DOF_NAMES = ["Tx", "Ty", "Tz", "Rx", "Ry", "Rz"];

export function RobustnessPanel({ robustnessData, isLoading, error }) {
  if (isLoading) {
    return (
      <Paper p="md" radius="md" withBorder>
        <Group gap="sm">
          <IconChartDots className="spin" size={20} color="var(--mantine-color-teal-4)" />
          <div>
            <Text size="sm" fw={700}>
              Evaluating 512-Corner Mount Stiffness Robustness (2⁹)...
            </Text>
            <Text size="xs" c="dimmed">
              Scanning all 2⁹ = 512 upper and lower limit stiffness corner combinations (±5%, ±10%, ±15%).
            </Text>
          </div>
        </Group>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert
        icon={<IconAlertTriangle size={16} />}
        title="Robustness Study Error"
        color="red"
        radius="md"
      >
        {error}
      </Alert>
    );
  }

  if (!robustnessData || !Array.isArray(robustnessData) || robustnessData.length === 0) {
    return null;
  }

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon color="teal" variant="light" size="sm">
              <IconChartDots size={14} />
            </ThemeIcon>
            <Text fw={700} size="sm">
              Mount Stiffness Robustness Study
            </Text>
          </Group>
          <Badge color="teal" variant="outline" size="sm">
            512 Corners (2⁹)
          </Badge>
        </Group>

        <Accordion variant="separated" radius="md" defaultValue="tol-0">
          {robustnessData.map((item, idx) => {
            const passRate = item.pass_percentage ?? 0;
            const passColor = passRate >= 95 ? "teal" : passRate >= 80 ? "yellow" : "red";

            return (
              <Accordion.Item key={idx} value={`tol-${idx}`}>
                <Accordion.Control>
                  <Group justify="space-between" pr="md">
                    <Group gap="xs">
                      <Badge color="blue" size="md">
                        ±{item.tolerance_pct}% Stiffness
                      </Badge>
                      <Text size="xs" c="dimmed">
                        ({item.total_cases?.toLocaleString()} combinations)
                      </Text>
                    </Group>
                    <Badge color={passColor} variant="light">
                      {passRate.toFixed(1)}% Pass Rate
                    </Badge>
                  </Group>
                </Accordion.Control>

                <Accordion.Panel>
                  <Stack gap="sm">
                    {/* Summary metrics */}
                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                      <Paper p="xs" radius="sm" withBorder>
                        <Text size="xs" c="dimmed">
                          Pass Cases
                        </Text>
                        <Text size="sm" fw={700} c={passColor}>
                          {item.pass_cases?.toLocaleString()} / {item.total_cases?.toLocaleString()}
                        </Text>
                      </Paper>

                      <Paper p="xs" radius="sm" withBorder>
                        <Text size="xs" c="dimmed">
                          Worst Min Purity
                        </Text>
                        <Text
                          size="sm"
                          fw={700}
                          c={item.worst_min_purity >= 80 ? "teal" : "red"}
                        >
                          {item.worst_min_purity?.toFixed(1)}%
                        </Text>
                      </Paper>

                      <Paper p="xs" radius="sm" withBorder>
                        <Text size="xs" c="dimmed">
                          Best Min Purity
                        </Text>
                        <Text size="sm" fw={700} c="teal">
                          {item.best_min_purity?.toFixed(1)}%
                        </Text>
                      </Paper>

                      <Paper p="xs" radius="sm" withBorder>
                        <Text size="xs" c="dimmed">
                          Target Threshold
                        </Text>
                        <Text size="sm" fw={700} c="dimmed">
                          ≥ 80.0%
                        </Text>
                      </Paper>
                    </SimpleGrid>

                    {/* Per-mode bounds table */}
                    {item.freq_min_hz && (
                      <div>
                        <Text size="xs" fw={700} c="dimmed" mb={4}>
                          Per-Mode Bounds across all variations:
                        </Text>
                        <Table striped highlightOnHover withTableBorder withColumnBorders size="xs">
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Mode</Table.Th>
                              <Table.Th>Dominant DOF</Table.Th>
                              <Table.Th>Freq Min (Hz)</Table.Th>
                              <Table.Th>Freq Max (Hz)</Table.Th>
                              <Table.Th>Purity Min (%)</Table.Th>
                              <Table.Th>Purity Max (%)</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {item.freq_min_hz.map((fMin, mIdx) => (
                              <Table.Tr key={mIdx}>
                                <Table.Td fw={600}>Mode {mIdx + 1}</Table.Td>
                                <Table.Td>
                                  <Badge size="xs" variant="dot">
                                    {DOF_NAMES[mIdx]}
                                  </Badge>
                                </Table.Td>
                                <Table.Td ff="monospace">{fMin.toFixed(2)}</Table.Td>
                                <Table.Td ff="monospace">{item.freq_max_hz?.[mIdx]?.toFixed(2)}</Table.Td>
                                <Table.Td
                                  ff="monospace"
                                  c={item.purity_min_per_mode?.[mIdx] >= 80 ? "teal" : "red"}
                                  fw={700}
                                >
                                  {item.purity_min_per_mode?.[mIdx]?.toFixed(1)}%
                                </Table.Td>
                                <Table.Td ff="monospace">
                                  {item.purity_max_per_mode?.[mIdx]?.toFixed(1)}%
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </div>
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      </Stack>
    </Paper>
  );
}
