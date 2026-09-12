import { useState } from "react";
import {
  Tooltip,
  Badge,
  Group,
  Text,
  Stack,
  Modal,
  Tabs,
  Paper,
  Table,
  Alert,
  SimpleGrid,
  Code,
  Progress,
  ThemeIcon,
  Divider,
} from "@mantine/core";
import {
  IconCircleCheck,
  IconCircleX,
  IconClick,
  IconMathFunction,
  IconTriangleSquareCircle,
  IconMatrix,
  IconWaveSine,
  IconAdjustments,
  IconInfoCircle,
} from "@tabler/icons-react";

const CHECK_DEFS = [
  {
    key: "positive_definite",
    label: "Positive Definite",
    path: ["inertia_validation", "positive_definite"],
    icon: IconMathFunction,
    color: "violet",
    tip: "Click to inspect: All principal moments of inertia Iᵢ > 0.",
  },
  {
    key: "triangle_ok",
    label: "Triangle Inequality",
    path: ["inertia_validation", "triangle_ok"],
    icon: IconTriangleSquareCircle,
    color: "orange",
    tip: "Click to inspect: I₁+I₂≥I₃ for all permutations — physical realizability check.",
  },
  {
    key: "K_symmetric",
    label: "K Matrix Symmetric",
    path: ["K_matrix_validation", "symmetric"],
    icon: IconMatrix,
    color: "cyan",
    tip: "Click to inspect: Assembled 6×6 stiffness matrix must be symmetric (K_ij = K_ji).",
  },
  {
    key: "all_modes_pass",
    label: "All Modes ≥80% Pure",
    path: ["all_modes_pass_80pct"],
    icon: IconWaveSine,
    color: "teal",
    tip: "Click to inspect: Each rigid-body mode must be ≥80% kinetic energy purity.",
  },
];

function getNestedValue(obj, path) {
  return path.reduce((cur, key) => (cur != null ? cur[key] : undefined), obj);
}

function PassBadge({ pass, size = "sm" }) {
  return (
    <Badge
      color={pass ? "teal" : "red"}
      variant={pass ? "dot" : "filled"}
      size={size}
      leftSection={pass ? <IconCircleCheck size={12} /> : <IconCircleX size={12} />}
    >
      {pass ? "PASS" : "FAIL"}
    </Badge>
  );
}

// Render the input 3×3 inertia tensor as a styled table
function InertiaMatrix({ tensor }) {
  if (!tensor) return null;
  const labels = ["x", "y", "z"];
  return (
    <Paper withBorder radius="md" p={0} style={{ overflowX: "auto" }}>
      <Table withColumnBorders fontSize="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ background: "var(--mantine-color-dark-6)" }}>I</Table.Th>
            {labels.map((l) => (
              <Table.Th key={l} style={{ textAlign: "center", background: "var(--mantine-color-dark-6)" }}>
                {l}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tensor.map((row, rIdx) => (
            <Table.Tr key={rIdx}>
              <Table.Td fw={700} c="blue" style={{ background: "var(--mantine-color-dark-6)" }}>
                {labels[rIdx]}
              </Table.Td>
              {row.map((val, cIdx) => (
                <Table.Td
                  key={cIdx}
                  ff="monospace"
                  fw={rIdx === cIdx ? 700 : 400}
                  style={{
                    textAlign: "right",
                    color:
                      rIdx === cIdx
                        ? "var(--mantine-color-teal-4)"
                        : "var(--mantine-color-gray-3)",
                  }}
                >
                  {val.toFixed(6)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

export default function ValidationBadges({ result }) {
  const [activeModal, setActiveModal] = useState(null);

  if (!result) return null;

  const iv = result.inertia_validation || {};
  const kv = result.K_matrix_validation || {};
  const modalTable = result.modal_table || [];

  // Principal moments (sorted ascending from eigh)
  const pm = iv.principal_moments_kg_m2 || [0, 0, 0];
  const [I1, I2, I3] = pm;
  const triangleTerms = iv.triangle_terms || [I1 + I2 - I3, I1 + I3 - I2, I2 + I3 - I1];
  const diag = iv.diagonal_elements || [0, 0, 0];
  const offDiag = iv.off_diagonal_elements || {};
  const DOF_LABELS = ["Tx", "Ty", "Tz", "Rx", "Ry", "Rz"];

  const triangleRows = [
    { cond: "I₁ + I₂ ≥ I₃", lhs: I1 + I2, rhs: I3, margin: triangleTerms[0] },
    { cond: "I₁ + I₃ ≥ I₂", lhs: I1 + I3, rhs: I2, margin: triangleTerms[1] },
    { cond: "I₂ + I₃ ≥ I₁", lhs: I2 + I3, rhs: I1, margin: triangleTerms[2] },
  ].map((r) => ({ ...r, pass: r.margin >= -1e-8 }));

  return (
    <>
      {/* ── Badge Row ── */}
      <Group gap="sm" wrap="wrap">
        {CHECK_DEFS.map((def) => {
          const value = getNestedValue(result, def.path);
          const pass = value === true;
          const badgeColor = pass ? "teal" : "red";

          return (
            <Tooltip
              key={def.key}
              label={
                <Stack gap={2}>
                  <Text size="xs" fw={600}>{def.tip}</Text>
                  <Text size="xs" c="dimmed">👉 Click for detailed values & math</Text>
                </Stack>
              }
              multiline
              w={280}
              withArrow
            >
              <Badge
                size="lg"
                radius="sm"
                color={badgeColor}
                variant="light"
                onClick={() => setActiveModal(def.key)}
                leftSection={pass ? <IconCircleCheck size={14} /> : <IconCircleX size={14} />}
                rightSection={<IconClick size={12} style={{ opacity: 0.6 }} />}
                style={{
                  cursor: "pointer",
                  textTransform: "none",
                  fontWeight: 600,
                  border: `1px solid var(--mantine-color-${badgeColor}-7)`,
                }}
              >
                {def.label}
              </Badge>
            </Tooltip>
          );
        })}
      </Group>

      {/* ── Inspection Modal ── */}
      <Modal
        opened={!!activeModal}
        onClose={() => setActiveModal(null)}
        title={
          <Group gap="xs">
            <ThemeIcon color="blue" variant="light" size="md">
              <IconAdjustments size={18} />
            </ThemeIcon>
            <Text fw={700} size="md">Inertia & Stiffness Validation Inspector</Text>
          </Group>
        }
        size="xl"
        radius="md"
        styles={{ body: { padding: "0 16px 16px" } }}
      >
        <Tabs value={activeModal} onChange={setActiveModal} variant="outline">
          <Tabs.List mb="md">
            {CHECK_DEFS.map((def) => {
              const val = getNestedValue(result, def.path);
              const pass = val === true;
              return (
                <Tabs.Tab
                  key={def.key}
                  value={def.key}
                  leftSection={<def.icon size={14} />}
                  rightSection={<PassBadge pass={pass} size="xs" />}
                >
                  {def.label}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>

          {/* ════════════════════════════════════════
              TAB 1 — POSITIVE DEFINITE
          ════════════════════════════════════════ */}
          <Tabs.Panel value="positive_definite">
            <Stack gap="md">
              <Alert
                color={iv.positive_definite ? "teal" : "red"}
                title={iv.positive_definite ? "Positive Definite ✓ — Kinetic energy is strictly positive for all non-zero ω" : "NOT Positive Definite ✗ — Physically impossible inertia tensor"}
                icon={iv.positive_definite ? <IconCircleCheck size={18} /> : <IconCircleX size={18} />}
              >
                Condition: all eigenvalues of [I] must satisfy{" "}
                <Code>Iᵢ {">"} 0</Code>. Equivalently, the rotational kinetic energy{" "}
                <Code>T = ½ ωᵀ [I] ω {">"} 0</Code> for every non-zero angular velocity ω.
              </Alert>

              {/* Input Tensor */}
              <div>
                <Text size="xs" fw={700} c="dimmed" mb={6}>
                  📥 Input Inertia Tensor [I] (kg·m²) — as entered:
                </Text>
                <InertiaMatrix tensor={iv.inertia_tensor_input} />
              </div>

              <Divider label="Eigen-decomposition: [I] = [P] · diag(I₁,I₂,I₃) · [P]ᵀ" labelPosition="center" />

              {/* Principal Moments */}
              <div>
                <Text size="xs" fw={700} c="dimmed" mb={6}>
                  🎯 Principal Moments of Inertia (eigenvalues of [I]):
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                  {["I₁ (Min)", "I₂ (Int)", "I₃ (Max)"].map((lbl, idx) => {
                    const val = pm[idx];
                    const good = val > 0;
                    return (
                      <Paper key={lbl} p="sm" withBorder radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
                        <Text size="xs" c="dimmed" fw={600}>{lbl}</Text>
                        <Text size="xl" fw={800} ff="monospace" c={good ? "teal" : "red"}>
                          {val.toFixed(6)}
                        </Text>
                        <Text size="xs" c="dimmed">kg·m²</Text>
                        <Badge size="xs" color={good ? "teal" : "red"} variant="light" mt={4}>
                          {good ? `> 0 ✓` : `≤ 0 ✗ FAIL`}
                        </Badge>
                      </Paper>
                    );
                  })}
                </SimpleGrid>
              </div>

              {/* Diagonal vs Off-diagonal */}
              <div>
                <Text size="xs" fw={700} c="dimmed" mb={6}>
                  📊 Tensor Entry Breakdown:
                </Text>
                <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                  {[
                    { label: "Ixx (diagonal)", val: diag[0], diag: true },
                    { label: "Iyy (diagonal)", val: diag[1], diag: true },
                    { label: "Izz (diagonal)", val: diag[2], diag: true },
                    { label: "Ixy (off-diag)", val: offDiag.Ixy, diag: false },
                    { label: "Ixz (off-diag)", val: offDiag.Ixz, diag: false },
                    { label: "Iyz (off-diag)", val: offDiag.Iyz, diag: false },
                  ].map(({ label, val, diag: isDiag }) => (
                    <Paper key={label} p="xs" withBorder radius="sm" style={{ background: "var(--mantine-color-dark-7)" }}>
                      <Text size="xs" c="dimmed">{label}</Text>
                      <Text size="sm" fw={700} ff="monospace" c={isDiag ? "teal" : "gray"}>
                        {val != null ? val.toFixed(6) : "—"} kg·m²
                      </Text>
                    </Paper>
                  ))}
                </SimpleGrid>
              </div>

              {/* Summary row */}
              <Paper p="sm" withBorder radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">det([I]):</Text>
                    <Code fw={700}>{iv.determinant?.toFixed(6)} (kg·m²)³</Code>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Max symmetry error:</Text>
                    <Code fw={700}>{iv.symmetry_error?.toExponential(3)}</Code>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Overall result:</Text>
                    <PassBadge pass={iv.positive_definite} />
                  </Group>
                </SimpleGrid>
              </Paper>
            </Stack>
          </Tabs.Panel>

          {/* ════════════════════════════════════════
              TAB 2 — TRIANGLE INEQUALITY
          ════════════════════════════════════════ */}
          <Tabs.Panel value="triangle_ok">
            <Stack gap="md">
              <Alert
                color={iv.triangle_ok ? "teal" : "red"}
                title={iv.triangle_ok ? "Triangle Inequality Satisfied ✓ — Physically realizable 3D body" : "Triangle Inequality Violated ✗ — No real 3D mass distribution can reproduce this tensor"}
                icon={iv.triangle_ok ? <IconCircleCheck size={18} /> : <IconCircleX size={18} />}
              >
                For a body with non-negative mass density <Code>ρ(r) ≥ 0</Code>, the principal
                moments must satisfy: <Code>Iᵢ + Iⱼ ≥ Iₖ</Code> for all permutations (i,j,k).
                Violation means the inertia tensor is geometrically impossible.
              </Alert>

              {/* Principal moments reference */}
              <div>
                <Text size="xs" fw={700} c="dimmed" mb={6}>
                  📌 Principal Moments (from eigenvalue decomposition of [I]):
                </Text>
                <SimpleGrid cols={3} spacing="xs">
                  {[["I₁", I1], ["I₂", I2], ["I₃", I3]].map(([lbl, val]) => (
                    <Paper key={lbl} p="xs" withBorder radius="sm" style={{ background: "var(--mantine-color-dark-7)" }}>
                      <Text size="xs" c="dimmed" fw={600}>{lbl}</Text>
                      <Text size="md" fw={700} ff="monospace" c="blue">
                        {val.toFixed(6)} kg·m²
                      </Text>
                    </Paper>
                  ))}
                </SimpleGrid>
              </div>

              {/* Triangle conditions table */}
              <div>
                <Text size="xs" fw={700} c="dimmed" mb={6}>
                  🔺 Triangle Inequality Conditions — computed margins:
                </Text>
                <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
                  <Table striped highlightOnHover withColumnBorders fontSize="sm">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Condition</Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>LHS (kg·m²)</Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>RHS (kg·m²)</Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>Margin = LHS − RHS</Table.Th>
                        <Table.Th style={{ textAlign: "center" }}>Status</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {triangleRows.map((r, i) => (
                        <Table.Tr
                          key={i}
                          style={{ background: r.pass ? undefined : "rgba(239,68,68,0.08)" }}
                        >
                          <Table.Td fw={700} ff="monospace">{r.cond}</Table.Td>
                          <Table.Td ff="monospace" style={{ textAlign: "right" }}>
                            {r.lhs.toFixed(6)}
                          </Table.Td>
                          <Table.Td ff="monospace" style={{ textAlign: "right" }}>
                            {r.rhs.toFixed(6)}
                          </Table.Td>
                          <Table.Td
                            ff="monospace"
                            fw={700}
                            c={r.pass ? "teal" : "red"}
                            style={{ textAlign: "right" }}
                          >
                            {r.margin >= 0 ? "+" : ""}{r.margin.toFixed(6)}
                          </Table.Td>
                          <Table.Td style={{ textAlign: "center" }}>
                            <PassBadge pass={r.pass} />
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Paper>
              </div>

              {!iv.triangle_ok && (
                <Paper p="sm" withBorder radius="md" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <Text size="xs" fw={700} c="red" mb={4}>💡 How to fix:</Text>
                  <Text size="xs" c="dimmed">
                    Increase diagonal entries <Code>Ixx</Code> / <Code>Iyy</Code>, or reduce <Code>Izz</Code> in the
                    Engine Constants panel so that no one principal moment exceeds the sum of the other two.
                  </Text>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ════════════════════════════════════════
              TAB 3 — K MATRIX SYMMETRIC
          ════════════════════════════════════════ */}
          <Tabs.Panel value="K_symmetric">
            <Stack gap="md">
              <Alert
                color={kv.symmetric ? "teal" : "red"}
                title={kv.symmetric ? "Stiffness Matrix K is Symmetric ✓ (Maxwell-Betti theorem satisfied)" : "Stiffness Matrix K is NOT Symmetric ✗ — Numerical error or mount orientation bug"}
                icon={kv.symmetric ? <IconCircleCheck size={18} /> : <IconCircleX size={18} />}
              >
                By Maxwell-Betti reciprocal work theorem, the assembled 6×6 linearised mount stiffness
                matrix must satisfy <Code>K_ij = K_ji</Code>. Asymmetry indicates a programming/orientation bug.
              </Alert>

              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <Paper p="sm" withBorder radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
                  <Text size="xs" c="dimmed">Max |K_ij − K_ji|</Text>
                  <Text size="lg" fw={700} ff="monospace" c="teal">{kv.symmetry_error?.toFixed(8)}</Text>
                  <Text size="xs" c="dimmed">N/mm</Text>
                </Paper>
                <Paper p="sm" withBorder radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
                  <Text size="xs" c="dimmed">Relative symmetry error</Text>
                  <Text size="lg" fw={700} ff="monospace" c="teal">{kv.relative_symmetry_error?.toExponential(4)}</Text>
                  <Text size="xs" c="dimmed">(unitless, {`<`}1e-8 is fine)</Text>
                </Paper>
                <Paper p="sm" withBorder radius="md" style={{ background: "var(--mantine-color-dark-7)" }}>
                  <Text size="xs" c="dimmed">Result</Text>
                  <PassBadge pass={kv.symmetric} size="lg" />
                </Paper>
              </SimpleGrid>

              {kv.K_matrix_6x6 && (
                <div>
                  <Text size="xs" fw={700} c="dimmed" mb={6}>
                    🗃 Assembled 6×6 Mount Stiffness Matrix [K] (N/mm and N·mm/rad):
                  </Text>
                  <Paper withBorder radius="md" p={0} style={{ overflowX: "auto" }}>
                    <Table withColumnBorders fontSize="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th style={{ background: "var(--mantine-color-dark-6)" }}>DOF</Table.Th>
                          {DOF_LABELS.map((d) => (
                            <Table.Th key={d} style={{ textAlign: "right", background: "var(--mantine-color-dark-6)" }}>
                              {d}
                            </Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {kv.K_matrix_6x6.map((row, rIdx) => (
                          <Table.Tr key={rIdx}>
                            <Table.Td fw={700} c="blue" style={{ background: "var(--mantine-color-dark-6)" }}>
                              {DOF_LABELS[rIdx]}
                            </Table.Td>
                            {row.map((val, cIdx) => (
                              <Table.Td
                                key={cIdx}
                                ff="monospace"
                                fw={rIdx === cIdx ? 700 : 400}
                                style={{
                                  textAlign: "right",
                                  color:
                                    rIdx === cIdx
                                      ? "var(--mantine-color-teal-4)"
                                      : Math.abs(val) > 0.01
                                      ? "var(--mantine-color-gray-3)"
                                      : "var(--mantine-color-dark-3)",
                                }}
                              >
                                {Math.abs(val) > 9999 ? val.toExponential(2) : val.toFixed(1)}
                              </Table.Td>
                            ))}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Paper>
                  <Text size="xs" c="dimmed" mt={4}>
                    Teal diagonal = translational stiffness (N/mm). Off-diagonals represent translational-rotational coupling.
                  </Text>
                </div>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ════════════════════════════════════════
              TAB 4 — MODAL PURITY
          ════════════════════════════════════════ */}
          <Tabs.Panel value="all_modes_pass">
            <Stack gap="md">
              <Alert
                color={result.all_modes_pass_80pct ? "teal" : "yellow"}
                title={result.all_modes_pass_80pct ? "All 6 Modes Decoupled ≥80% ✓" : "Some modes below 80% purity — mount tuning needed"}
                icon={result.all_modes_pass_80pct ? <IconCircleCheck size={18} /> : <IconInfoCircle size={18} />}
              >
                Good NVH isolation requires each mode to be dominated by a single DOF (≥80% kinetic
                energy purity). The TRA roll mode (Rx or Ry) should align closely with the engine
                torque axis and have the highest purity.
              </Alert>

              <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
                <Table striped highlightOnHover withColumnBorders fontSize="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Mode</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Freq (Hz)</Table.Th>
                      <Table.Th>Dominant DOF</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Purity %</Table.Th>
                      <Table.Th style={{ minWidth: 110 }}>Decoupling</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Tx%</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Ty%</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Tz%</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Rx%</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Ry%</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Rz%</Table.Th>
                      <Table.Th style={{ textAlign: "center" }}>Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {modalTable.map((m) => (
                      <Table.Tr
                        key={m.mode}
                        style={{ background: m.pass ? undefined : "rgba(239,68,68,0.06)" }}
                      >
                        <Table.Td fw={700}>{m.mode}</Table.Td>
                        <Table.Td ff="monospace" style={{ textAlign: "right" }}>
                          {m.frequency_hz?.toFixed(3)}
                        </Table.Td>
                        <Table.Td>
                          <Badge color="blue" variant="light" size="sm">{m.dominant_dof}</Badge>
                        </Table.Td>
                        <Table.Td ff="monospace" fw={700} c={m.pass ? "teal" : "red"} style={{ textAlign: "right" }}>
                          {m.purity_pct?.toFixed(2)}%
                        </Table.Td>
                        <Table.Td>
                          <Progress
                            value={Math.min(100, m.purity_pct)}
                            color={m.purity_pct >= 80 ? "teal" : m.purity_pct >= 60 ? "yellow" : "red"}
                            size="sm"
                            radius="xl"
                          />
                        </Table.Td>
                        {["Tx_pct", "Ty_pct", "Tz_pct", "Rx_pct", "Ry_pct", "Rz_pct"].map((key) => (
                          <Table.Td
                            key={key}
                            ff="monospace"
                            style={{
                              textAlign: "right",
                              color:
                                m.dominant_dof === key.replace("_pct", "")
                                  ? "var(--mantine-color-teal-4)"
                                  : m[key] >= 10
                                  ? "var(--mantine-color-gray-3)"
                                  : "var(--mantine-color-dark-3)",
                              fontWeight: m.dominant_dof === key.replace("_pct", "") ? 700 : 400,
                            }}
                          >
                            {m[key]?.toFixed(1)}
                          </Table.Td>
                        ))}
                        <Table.Td style={{ textAlign: "center" }}>
                          <PassBadge pass={m.pass} />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>

              <Text size="xs" c="dimmed">
                Highlighted (teal) columns show the dominant DOF per mode. All other contributions
                ideally should be ≤ 20% for good decoupling. The Rx/Ry roll modes should be the
                lowest-frequency modes to avoid combustion NVH coupling.
              </Text>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Modal>
    </>
  );
}
