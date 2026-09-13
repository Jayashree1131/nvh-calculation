import { useState } from "react";
import {
  Paper, Stack, Group, Text, Badge, Button, Table, Collapse,
  SimpleGrid, Box, Divider, ScrollArea, Alert, Tabs, Menu, ActionIcon, Tooltip,
} from "@mantine/core";
import {
  IconTrophy, IconChevronDown, IconChevronUp,
  IconDownload, IconChartBar, IconCheck, IconX, IconFileSpreadsheet, IconFileText,
} from "@tabler/icons-react";
import useStore from "../../store/useStore";
import { ErrorBoundary } from "../ErrorBoundary";
import { downloadReviewReport } from "../../utils/exportReport";

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


// ── RFC-4180 CSV escaping ──────────────────────────────────
function csvEscape(val) {
  if (val == null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ── Comprehensive CSV Column Definitions ──────────────────
const DETAILED_CSV_HEADERS = [
  "Rank",
  "Proposal Name",
  "Case ID",
  "Case Name",
  "Overall Feasible",
  "Verdict",
  "Min Purity %",
  "TRA/eTRA 3D Angle (deg)",
  "eTRA Offset from CG (mm)",
  "Min Gap Margin (Hz)",
  // Compliance Checks
  "Package Check",
  "Stiffness Ratio Check",
  "Frequency Check",
  "Purity Check",
  "Gap Check",
  "Identity Check",
  "TRA Alignment Check",
  // Mount 1 (LH)
  "M1 Name", "M1 Axis", "M1 X (mm)", "M1 Y (mm)", "M1 Z (mm)",
  "M1 Kx (N/mm)", "M1 Ky (N/mm)", "M1 Kz (N/mm)", "M1 Void/Solid (V/S)", "M1 (V+S)/Axial",
  // Mount 2 (RH)
  "M2 Name", "M2 Axis", "M2 X (mm)", "M2 Y (mm)", "M2 Z (mm)",
  "M2 Kx (N/mm)", "M2 Ky (N/mm)", "M2 Kz (N/mm)", "M2 Void/Solid (V/S)", "M2 (V+S)/Axial",
  // Mount 3 (RR)
  "M3 Name", "M3 Axis", "M3 X (mm)", "M3 Y (mm)", "M3 Z (mm)",
  "M3 Kx (N/mm)", "M3 Ky (N/mm)", "M3 Kz (N/mm)", "M3 Void/Solid (V/S)", "M3 (V+S)/Axial",
  // Modal Analysis (Modes 1 to 6)
  "Mode 1 Identity", "Mode 1 Freq (Hz)", "Mode 1 Purity %", "Mode 1 Gap (Hz)",
  "Mode 1 Tx %", "Mode 1 Ty %", "Mode 1 Tz %", "Mode 1 Rx %", "Mode 1 Ry %", "Mode 1 Rz %",
  "Mode 2 Identity", "Mode 2 Freq (Hz)", "Mode 2 Purity %", "Mode 2 Gap (Hz)",
  "Mode 2 Tx %", "Mode 2 Ty %", "Mode 2 Tz %", "Mode 2 Rx %", "Mode 2 Ry %", "Mode 2 Rz %",
  "Mode 3 Identity", "Mode 3 Freq (Hz)", "Mode 3 Purity %", "Mode 3 Gap (Hz)",
  "Mode 3 Tx %", "Mode 3 Ty %", "Mode 3 Tz %", "Mode 3 Rx %", "Mode 3 Ry %", "Mode 3 Rz %",
  "Mode 4 Identity", "Mode 4 Freq (Hz)", "Mode 4 Purity %", "Mode 4 Gap (Hz)",
  "Mode 4 Tx %", "Mode 4 Ty %", "Mode 4 Tz %", "Mode 4 Rx %", "Mode 4 Ry %", "Mode 4 Rz %",
  "Mode 5 Identity", "Mode 5 Freq (Hz)", "Mode 5 Purity %", "Mode 5 Gap (Hz)",
  "Mode 5 Tx %", "Mode 5 Ty %", "Mode 5 Tz %", "Mode 5 Rx %", "Mode 5 Ry %", "Mode 5 Rz %",
  "Mode 6 Identity", "Mode 6 Freq (Hz)", "Mode 6 Purity %", "Mode 6 Gap (Hz)",
  "Mode 6 Tx %", "Mode 6 Ty %", "Mode 6 Tz %", "Mode 6 Rx %", "Mode 6 Ry %", "Mode 6 Rz %",
  // Robustness Study
  "±5% Exact PASS Count", "±5% Exact PASS %", "±5% Random PASS Count", "±5% Random PASS %",
  "±10% Exact PASS Count", "±10% Exact PASS %", "±10% Random PASS Count", "±10% Random PASS %",
  "±15% Exact PASS Count", "±15% Exact PASS %", "±15% Random PASS Count", "±15% Random PASS %",
];

function formatProposalDetailedRow(p, rank) {
  const rb = p.robustness ?? {};
  const getRb = (tol, field) => {
    const entry =
      rb[tol] ||
      rb[String(tol)] ||
      rb[`${tol}.0`] ||
      rb[Object.keys(rb).find((k) => Number(k) === tol)];
    return entry?.[field] ?? "";
  };

  const mounts = Array.isArray(p.mounts) ? p.mounts : [];
  const modal = Array.isArray(p.modal) ? p.modal : [];

  const row = [
    rank,
    csvEscape(p.name || ""),
    p.case_id ?? "",
    csvEscape(p.case_name || (p.case_id ? `Case ${p.case_id}` : "")),
    p.feasible ? "YES" : "NO",
    csvEscape(p.verdict || ""),
    p.min_purity != null ? p.min_purity.toFixed(3) : "",
    p.angle_3d_deg != null ? p.angle_3d_deg.toFixed(4) : "",
    p.etra_offset_mm != null ? p.etra_offset_mm.toFixed(3) : "",
    p.min_gap_margin != null ? p.min_gap_margin.toFixed(4) : "",
    // Checks
    p.package_pass ? "PASS" : "FAIL",
    p.ratio_pass ? "PASS" : "FAIL",
    p.freq_pass ? "PASS" : "FAIL",
    p.purity_pass ? "PASS" : "FAIL",
    p.gap_pass ? "PASS" : "FAIL",
    p.identity_pass ? "PASS" : "FAIL",
    p.tra_pass ? "PASS" : "FAIL",
  ];

  // 3 Mounts
  for (let mIdx = 0; mIdx < 3; mIdx++) {
    const m = mounts[mIdx];
    if (m) {
      row.push(
        csvEscape(m.name || `M${mIdx + 1}`),
        m.axis || "",
        m.x != null ? m.x : "",
        m.y != null ? m.y : "",
        m.z != null ? m.z : "",
        m.kx != null ? m.kx : "",
        m.ky != null ? m.ky : "",
        m.kz != null ? m.kz : "",
        m.void_solid != null ? m.void_solid : "",
        m.void_solid_axial != null ? m.void_solid_axial : ""
      );
    } else {
      row.push("", "", "", "", "", "", "", "", "", "");
    }
  }

  // 6 Modes
  for (let modeIdx = 0; modeIdx < 6; modeIdx++) {
    const m = modal[modeIdx];
    if (m) {
      const er = Array.isArray(m.energy_row) ? m.energy_row : [];
      row.push(
        m.identity || "",
        m.freq_hz != null ? m.freq_hz : "",
        m.purity_pct != null ? m.purity_pct : "",
        m.gap_hz != null ? m.gap_hz : "",
        er[0] != null ? er[0] : "",
        er[1] != null ? er[1] : "",
        er[2] != null ? er[2] : "",
        er[3] != null ? er[3] : "",
        er[4] != null ? er[4] : "",
        er[5] != null ? er[5] : ""
      );
    } else {
      row.push("", "", "", "", "", "", "", "", "", "");
    }
  }

  // Robustness (5%, 10%, 15%)
  [5, 10, 15].forEach((tol) => {
    const exactPass = getRb(tol, "exact_pass");
    const exactTotal = getRb(tol, "exact_total");
    const exactPct = getRb(tol, "exact_pass_percent");
    const randPass = getRb(tol, "random_pass");
    const randTotal = getRb(tol, "random_total");
    const randPct = getRb(tol, "random_pass_percent");

    row.push(
      exactPass !== "" ? `${exactPass}/${exactTotal ?? 512}` : "",
      exactPct !== "" ? `${exactPct}%` : "",
      randPass !== "" ? `${randPass}/${randTotal ?? 600}` : "",
      randPct !== "" ? `${randPct}%` : ""
    );
  });

  return row.join(",");
}

// ── Export function with UTF-8 BOM for Excel / Apple Numbers ──
function exportProposalsDetailed(proposals, fileCategory = "top10") {
  if (!proposals || proposals.length === 0) return;

  const headerRow = DETAILED_CSV_HEADERS.join(",");
  const dataRows = proposals.map((p, i) => formatProposalDetailedRow(p, i + 1));
  const csvContent = "\uFEFF" + [headerRow, ...dataRows].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `optimizer_${fileCategory}_detailed_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main results component ─────────────────────────────────
export function OptimizerResults() {
  const optimizerResult = useStore((s) => s.optimizerResult);
  const optimizerForm = useStore((s) => s.optimizerForm);
  const [view, setView] = useState("top10");

  if (!optimizerResult) return null;

  const { top10 = [], case_summaries = [], all_proposals = [], settings } = optimizerResult;
  const medals = ["🥇", "🥈", "🥉"];

  // Resolve complete proposal data for Best Per Case (supports both legacy and new runs)
  const bestPerCaseProposals = case_summaries.flatMap((cs) =>
    (cs.best || []).map((b) => all_proposals.find((p) => p.name === b.name) || b)
  );

  // Determine active export dataset and label matching the current tab
  let currentReportLabel = "Export Top 10 Report (.txt)";
  let currentCsvLabel = "Export Top 10 CSV";
  let currentExportData = top10;
  let currentExportCategory = "top10";

  if (view === "bycases") {
    currentReportLabel = `Export Best Per Case Report (.txt)`;
    currentCsvLabel = `Export Best Per Case CSV`;
    currentExportData = bestPerCaseProposals;
    currentExportCategory = "best_per_case";
  } else if (view === "all") {
    currentReportLabel = `Export All Proposals Report (.txt)`;
    currentCsvLabel = `Export All Proposals CSV`;
    currentExportData = all_proposals;
    currentExportCategory = "all_proposals";
  }

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

          {/* Dynamic Export Controls: Report (.txt) + CSV + Full Dropdown Menu */}
          <Group gap="xs">
            <Button
              size="xs"
              variant="filled"
              color="violet"
              leftSection={<IconFileText size={14} />}
              onClick={() =>
                downloadReviewReport(currentExportData, optimizerForm, settings, currentExportCategory)
              }
            >
              {currentReportLabel}
            </Button>

            <Button
              size="xs"
              variant="light"
              color="green"
              leftSection={<IconDownload size={14} />}
              onClick={() => exportProposalsDetailed(currentExportData, currentExportCategory)}
            >
              {currentCsvLabel}
            </Button>

            <Menu position="bottom-end" shadow="md" width={280}>
              <Menu.Target>
                <Tooltip label="More export options & datasets">
                  <ActionIcon size="input-xs" variant="light" color="gray" radius="sm">
                    <IconChevronDown size={14} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Full Case Review Report (.txt)</Menu.Label>
                <Menu.Item
                  leftSection={<IconTrophy size={14} color="#f59e0b" />}
                  onClick={() => downloadReviewReport(top10, optimizerForm, settings, "top10")}
                >
                  Top 10 Report (.txt)
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconChartBar size={14} color="#8b5cf6" />}
                  onClick={() =>
                    downloadReviewReport(bestPerCaseProposals, optimizerForm, settings, "best_per_case")
                  }
                >
                  Best Per Case Report ({bestPerCaseProposals.length}) (.txt)
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconFileText size={14} color="#a78bfa" />}
                  onClick={() =>
                    downloadReviewReport(all_proposals, optimizerForm, settings, "all_proposals")
                  }
                >
                  All Proposals Report ({all_proposals.length}) (.txt)
                </Menu.Item>

                <Menu.Divider />

                <Menu.Label>Detailed Spreadsheet (.csv)</Menu.Label>
                <Menu.Item
                  leftSection={<IconTrophy size={14} color="#f59e0b" />}
                  onClick={() => exportProposalsDetailed(top10, "top10")}
                >
                  Top 10 Ranking CSV ({top10.length})
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconChartBar size={14} color="#8b5cf6" />}
                  onClick={() => exportProposalsDetailed(bestPerCaseProposals, "best_per_case")}
                >
                  Best Per Case CSV ({bestPerCaseProposals.length})
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconFileSpreadsheet size={14} color="#10b981" />}
                  onClick={() => exportProposalsDetailed(all_proposals, "all_proposals")}
                >
                  All Proposals CSV ({all_proposals.length})
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
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
                          {(cs.best || []).map((b, bi) => {
                            const fullProp = all_proposals.find((p) => p.name === b.name) || b;
                            return (
                              <ProposalRow
                                key={bi}
                                rank={bi + 1}
                                proposal={fullProp}
                              />
                            );
                          })}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Paper>
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
