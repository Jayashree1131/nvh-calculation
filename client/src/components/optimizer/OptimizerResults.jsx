import { useState } from "react";
import {
  Paper, Stack, Group, Text, Badge, Button, Table, Collapse,
  SimpleGrid, Box, Divider, ScrollArea, Alert, Tabs,
} from "@mantine/core";
import {
  IconTrophy, IconChevronDown, IconChevronUp,
  IconDownload, IconChartBar, IconCheck, IconX,
} from "@tabler/icons-react";
import useStore from "../../store/useStore";
import { ErrorBoundary } from "../ErrorBoundary";

// ── Verdict color ──────────────────────────────────────────
function verdictColor(verdict) {
  if (!verdict) return "gray";
  if (verdict.includes("RECOMMENDED")) return "teal";
  if (verdict.includes("TECHNICALLY")) return "yellow";
  return "red";
}

// ── Pass/Fail badge ────────────────────────────────────────
function PF({ ok, label }) {
  return (
    <Badge size="xs" color={ok ? "teal" : "red"} variant="light">
      {ok ? "✓" : "✗"} {label}
    </Badge>
  );
}

// ── Robustness mini-table ──────────────────────────────────
function RobustnessTable({ robustness }) {
  if (!robustness || typeof robustness !== "object") return null;
  const entries = Object.entries(robustness).sort(([a], [b]) => Number(a) - Number(b));
  if (entries.length === 0) return null;

  return (
    <Table withTableBorder withColumnBorders striped fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Tol.</Table.Th>
          <Table.Th>Exact PASS/512</Table.Th>
          <Table.Th>Exact %</Table.Th>
          <Table.Th>Random PASS</Table.Th>
          <Table.Th>Random %</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map(([tolKey, rb]) => {
          if (!rb) return null;
          const tolNum = parseFloat(tolKey);
          const exactPass = rb.exact_pass ?? 0;
          const exactTotal = rb.exact_total ?? 512;
          const exactPct = rb.exact_pass_percent ?? 0;
          const randPass = rb.random_pass ?? 0;
          const randTotal = rb.random_total ?? 0;
          const randPct = rb.random_pass_percent ?? 0;

          return (
            <Table.Tr key={tolKey}>
              <Table.Td>±{tolNum}%</Table.Td>
              <Table.Td>{exactPass}/{exactTotal}</Table.Td>
              <Table.Td
                style={{ color: exactPct >= 80 ? "#20c997" : "#ff6b6b" }}
              >
                {exactPct.toFixed(1)}%
              </Table.Td>
              <Table.Td>{randPass}/{randTotal}</Table.Td>
              <Table.Td
                style={{ color: randPct >= 80 ? "#20c997" : "#ff6b6b" }}
              >
                {randPct.toFixed(1)}%
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

// ── Modal table ────────────────────────────────────────────
function ModalTable({ modal }) {
  if (!modal || !Array.isArray(modal)) return null;
  return (
    <Table withTableBorder withColumnBorders striped fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>#</Table.Th>
          <Table.Th>Identity</Table.Th>
          <Table.Th>Freq (Hz)</Table.Th>
          <Table.Th>Purity %</Table.Th>
          <Table.Th>Gap (Hz)</Table.Th>
          <Table.Th>Tx%</Table.Th>
          <Table.Th>Ty%</Table.Th>
          <Table.Th>Tz%</Table.Th>
          <Table.Th>Rx%</Table.Th>
          <Table.Th>Ry%</Table.Th>
          <Table.Th>Rz%</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {modal.map((m) => (
          <Table.Tr key={m.mode}>
            <Table.Td>{m.mode}</Table.Td>
            <Table.Td><Badge size="xs" variant="dot">{m.identity}</Badge></Table.Td>
            <Table.Td>{m.freq_hz != null ? m.freq_hz.toFixed(3) : "—"}</Table.Td>
            <Table.Td style={{ color: (m.purity_pct ?? 0) >= 85 ? "#20c997" : "#ff6b6b" }}>
              {m.purity_pct != null ? `${m.purity_pct.toFixed(1)}%` : "—"}
            </Table.Td>
            <Table.Td>{m.gap_hz != null ? m.gap_hz.toFixed(3) : "—"}</Table.Td>
            {Array.isArray(m.energy_row) ? m.energy_row.map((v, i) => (
              <Table.Td key={i} style={{ color: Math.abs(v) > 50 ? "#a78bfa" : undefined }}>
                {v != null ? v.toFixed(1) : "—"}
              </Table.Td>
            )) : null}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// ── Single proposal row (expandable) ──────────────────────
function ProposalRow({ rank, proposal, medal }) {
  const [open, setOpen] = useState(false);
  const vc = verdictColor(proposal.verdict);

  return (
    <>
      <Table.Tr
        style={{ cursor: "pointer", background: open ? "#1c2128" : undefined }}
        onClick={() => setOpen((o) => !o)}
      >
        <Table.Td>
          <Group gap="xs" wrap="nowrap">
            {medal && <Text>{medal}</Text>}
            <Text fw={700} c="violet" size="sm">#{rank}</Text>
          </Group>
        </Table.Td>
        <Table.Td>
          <Text size="xs" style={{ maxWidth: 280, wordBreak: "break-word" }}>
            {proposal.name}
          </Text>
        </Table.Td>
        <Table.Td>
          <Badge size="xs" color="violet" variant="light">Case {proposal.case_id}</Badge>
        </Table.Td>
        <Table.Td>
          <Text size="xs" fw={600} c={proposal.min_purity >= 90 ? "teal" : "yellow"}>
            {proposal.min_purity?.toFixed(1)}%
          </Text>
        </Table.Td>
        <Table.Td>
          <Text size="xs" c={proposal.angle_3d_deg <= 1 ? "teal" : "orange"}>
            {proposal.angle_3d_deg?.toFixed(3)}°
          </Text>
        </Table.Td>
        <Table.Td>
          <Text size="xs">{proposal.min_gap_margin?.toFixed(3)}</Text>
        </Table.Td>
        <Table.Td>
          <Badge size="xs" color={vc} variant="filled">
            {proposal.feasible ? "✓ Feasible" : "✗ Infeasible"}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Badge size="xs" color={vc}>{proposal.verdict?.split("—")[0].trim()}</Badge>
        </Table.Td>
        <Table.Td>
          {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </Table.Td>
      </Table.Tr>

      {open && (
        <Table.Tr>
          <Table.Td colSpan={9} p={0}>
            <ErrorBoundary>
              <Box p="md" style={{ background: "#0d1117", borderTop: "1px solid #30363d" }}>
                <Stack gap="md">
                  {/* Checks row */}
                  <Group gap="xs" wrap="wrap">
                    <PF ok={proposal.package_pass} label="Package" />
                    <PF ok={proposal.freq_pass} label="Frequency" />
                    <PF ok={proposal.purity_pass} label="Purity" />
                    <PF ok={proposal.gap_pass} label="Gaps" />
                    <PF ok={proposal.identity_pass} label="Identity" />
                    <PF ok={proposal.ratio_pass} label="Ratios" />
                    <PF ok={proposal.tra_pass} label="TRA/eTRA" />
                  </Group>

                  {/* Mount layout */}
                  <div>
                    <Text size="xs" fw={700} mb={4}>Mount Layout + Stiffness</Text>
                    <Table withTableBorder fz="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Mount</Table.Th>
                          <Table.Th>X mm</Table.Th>
                          <Table.Th>Y mm</Table.Th>
                          <Table.Th>Z mm</Table.Th>
                          <Table.Th>Axis</Table.Th>
                          <Table.Th>Kx</Table.Th>
                          <Table.Th>Ky</Table.Th>
                          <Table.Th>Kz</Table.Th>
                          <Table.Th>V/S</Table.Th>
                          <Table.Th>(V+S)/A</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {proposal.mounts?.map((m) => (
                          <Table.Tr key={m.name}>
                            <Table.Td><Badge size="xs">{m.name}</Badge></Table.Td>
                            <Table.Td>{m.x != null ? m.x.toFixed(3) : "—"}</Table.Td>
                            <Table.Td>{m.y != null ? m.y.toFixed(3) : "—"}</Table.Td>
                            <Table.Td>{m.z != null ? m.z.toFixed(3) : "—"}</Table.Td>
                            <Table.Td>{m.axis || "—"}</Table.Td>
                            <Table.Td>{m.kx != null ? m.kx.toFixed(2) : "—"}</Table.Td>
                            <Table.Td>{m.ky != null ? m.ky.toFixed(2) : "—"}</Table.Td>
                            <Table.Td>{m.kz != null ? m.kz.toFixed(2) : "—"}</Table.Td>
                            <Table.Td style={{ color: m.void_solid != null && m.void_solid >= 0.5 && m.void_solid <= 0.6 ? "#20c997" : "#ff6b6b" }}>
                              {m.void_solid != null ? m.void_solid.toFixed(4) : "—"}
                            </Table.Td>
                            <Table.Td style={{ color: m.void_solid_axial != null && m.void_solid_axial >= 6.0 && m.void_solid_axial <= 6.8 ? "#20c997" : "#ff6b6b" }}>
                              {m.void_solid_axial != null ? m.void_solid_axial.toFixed(4) : "—"}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </div>

                  {/* Modal table */}
                  <div>
                    <Text size="xs" fw={700} mb={4}>Modal Analysis Table</Text>
                    <ScrollArea>
                      <ModalTable modal={proposal.modal} />
                    </ScrollArea>
                  </div>

                  {/* TRA/eTRA */}
                  <SimpleGrid cols={3} spacing="xs">
                    <Paper p="xs" radius="sm" withBorder>
                      <Text size="xs" c="dimmed">TRA/eTRA 3D angle</Text>
                      <Text fw={700} size="sm" c={(proposal.angle_3d_deg ?? 999) <= 1 ? "teal" : "orange"}>
                        {proposal.angle_3d_deg != null ? `${proposal.angle_3d_deg.toFixed(4)}°` : "—"}
                      </Text>
                    </Paper>
                    <Paper p="xs" radius="sm" withBorder>
                      <Text size="xs" c="dimmed">eTRA offset from CG</Text>
                      <Text fw={700} size="sm">
                        {proposal.etra_offset_mm != null ? `${proposal.etra_offset_mm.toFixed(2)} mm` : "—"}
                      </Text>
                    </Paper>
                    <Paper p="xs" radius="sm" withBorder>
                      <Text size="xs" c="dimmed">Min Gap Margin</Text>
                      <Text fw={700} size="sm" c={(proposal.min_gap_margin ?? -1) >= 0 ? "teal" : "red"}>
                        {proposal.min_gap_margin != null ? `${proposal.min_gap_margin.toFixed(4)} Hz` : "—"}
                      </Text>
                    </Paper>
                  </SimpleGrid>

                  {/* Robustness */}
                  <div>
                    <Text size="xs" fw={700} mb={4}>Robustness Study</Text>
                    <RobustnessTable robustness={proposal.robustness} />
                  </div>
                </Stack>
              </Box>
            </ErrorBoundary>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}


// ── Helper for CSV export robustness pass count ───────────
function getRobPass(rb, tol) {
  if (!rb || typeof rb !== "object") return "";
  const entry =
    rb[tol] ||
    rb[String(tol)] ||
    rb[`${tol}.0`] ||
    rb[Object.keys(rb).find((k) => Number(k) === tol)];
  return entry?.exact_pass != null ? `${entry.exact_pass}/512` : "";
}

// ── CSV export ─────────────────────────────────────────────
function exportCSV(top10) {
  const header = [
    "Rank", "Name", "Case", "Min Purity %", "TRA/eTRA deg",
    "eTRA Offset mm", "Min Gap Margin Hz", "Feasible", "Verdict",
    "5% Exact PASS", "10% Exact PASS", "15% Exact PASS",
  ].join(",");

  const rows = top10.map((r, i) => {
    const rb = r.robustness ?? {};
    return [
      i + 1,
      `"${r.name || ""}"`,
      r.case_id ?? "",
      r.min_purity != null ? r.min_purity.toFixed(3) : "",
      r.angle_3d_deg != null ? r.angle_3d_deg.toFixed(4) : "",
      r.etra_offset_mm != null ? r.etra_offset_mm.toFixed(2) : "",
      r.min_gap_margin != null ? r.min_gap_margin.toFixed(4) : "",
      r.feasible ? "YES" : "NO",
      `"${r.verdict || ""}"`,
      getRobPass(rb, 5),
      getRobPass(rb, 10),
      getRobPass(rb, 15),
    ].join(",");
  });

  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `optimizer_top10_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}


// ── Main results component ─────────────────────────────────
export function OptimizerResults() {
  const optimizerResult = useStore((s) => s.optimizerResult);
  const [view, setView] = useState("top10");

  if (!optimizerResult) return null;

  const { top10 = [], case_summaries = [], all_proposals = [], settings } = optimizerResult;
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Stack gap="md">
      <Paper p="sm" radius="md" withBorder
        style={{ background: "linear-gradient(135deg,#1c2128 0%,#16213e 100%)", border: "1px solid #7c3aed44" }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm">
            <IconTrophy size={20} color="#f59e0b" />
            <div>
              <Text fw={800} size="md" c="#e2e8f0">Optimization Results</Text>
              <Text size="xs" c="dimmed">
                {top10.length} top proposals ranked from {all_proposals.length} total
              </Text>
            </div>
          </Group>
          <Button size="xs" variant="light" color="green"
            leftSection={<IconDownload size={14} />}
            onClick={() => exportCSV(top10)}>
            Export CSV
          </Button>
        </Group>
      </Paper>

      <Tabs value={view} onChange={setView} variant="pills" radius="md">
        <Tabs.List mb="sm">
          <Tabs.Tab value="top10" leftSection={<IconTrophy size={14} />}>
            Top 10 Ranking
          </Tabs.Tab>
          <Tabs.Tab value="bycases" leftSection={<IconChartBar size={14} />}>
            Best Per Case
          </Tabs.Tab>
          <Tabs.Tab value="all" leftSection={<IconChartBar size={14} />}>
            All Proposals ({all_proposals.length})
          </Tabs.Tab>
        </Tabs.List>

        {/* ── TOP 10 ── */}
        <Tabs.Panel value="top10">
          <Paper radius="md" withBorder style={{ overflow: "hidden" }}>
            <ScrollArea>
              <Table verticalSpacing="xs" highlightOnHover>
                <Table.Thead style={{ background: "#161b22" }}>
                  <Table.Tr>
                    <Table.Th>Rank</Table.Th>
                    <Table.Th>Proposal</Table.Th>
                    <Table.Th>Case</Table.Th>
                    <Table.Th>Min Purity</Table.Th>
                    <Table.Th>TRA/eTRA</Table.Th>
                    <Table.Th>Gap Margin</Table.Th>
                    <Table.Th>Feasible</Table.Th>
                    <Table.Th>Verdict</Table.Th>
                    <Table.Th></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {top10.map((p, i) => (
                    <ProposalRow key={i} rank={i + 1} proposal={p} medal={medals[i]} />
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        </Tabs.Panel>

        {/* ── BEST PER CASE ── */}
        <Tabs.Panel value="bycases">
          <Stack gap="sm">
            {case_summaries.map((cs) => (
              <Paper key={cs.case_id} p="md" radius="md" withBorder>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>{cs.case_name}</Text>
                    <Badge size="xs" variant="outline" color="violet">Case {cs.case_id}</Badge>
                  </Group>
                  {cs.best.map((b, bi) => (
                    <Group key={bi} gap="xs" p="xs"
                      style={{ background: "#1c2128", borderRadius: 8 }} wrap="nowrap">
                      <Text size="xs" c="violet" fw={700}>#{bi + 1}</Text>
                      <Text size="xs" style={{ flex: 1, wordBreak: "break-word" }}>{b.name}</Text>
                      <Badge size="xs" color={b.min_purity >= 90 ? "teal" : "yellow"}>
                        {b.min_purity?.toFixed(1)}%
                      </Badge>
                      <Badge size="xs" color={b.angle_3d_deg <= 1 ? "teal" : "orange"}>
                        {b.angle_3d_deg?.toFixed(3)}°
                      </Badge>
                      <Badge size="xs" color={b.feasible ? "teal" : "red"}>
                        {b.feasible ? "Feasible" : "Infeasible"}
                      </Badge>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>

        {/* ── ALL PROPOSALS ── */}
        <Tabs.Panel value="all">
          <Paper radius="md" withBorder style={{ overflow: "hidden" }}>
            <ScrollArea>
              <Table verticalSpacing="xs" highlightOnHover>
                <Table.Thead style={{ background: "#161b22" }}>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Proposal</Table.Th>
                    <Table.Th>Case</Table.Th>
                    <Table.Th>Min Purity</Table.Th>
                    <Table.Th>TRA/eTRA</Table.Th>
                    <Table.Th>Gap Margin</Table.Th>
                    <Table.Th>Feasible</Table.Th>
                    <Table.Th>Verdict</Table.Th>
                    <Table.Th></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {all_proposals.map((p, i) => (
                    <ProposalRow key={i} rank={i + 1} proposal={p} />
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
