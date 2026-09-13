import { Paper, Stack, Group, Text, Progress, Badge, ScrollArea, Box } from "@mantine/core";
import { IconLoader2, IconCheck, IconX } from "@tabler/icons-react";
import useStore from "../../store/useStore";

export function OptimizerProgress() {
  const optimizerState = useStore((s) => s.optimizerState);
  const optimizerProgress = useStore((s) => s.optimizerProgress);
  const optimizerError = useStore((s) => s.optimizerError);

  const latestPct = optimizerProgress
    .filter((e) => e.pct != null)
    .at(-1)?.pct ?? 0;

  const isRunning = optimizerState === "running";
  const isError = optimizerState === "error";
  const isDone = optimizerState === "success";

  const progressColor = isError ? "red" : isDone ? "teal" : "violet";
  const displayPct = isDone ? 100 : isError ? latestPct : latestPct;

  return (
    <Paper p="sm" radius="md" withBorder
      style={{ border: `1px solid ${isError ? "#ff6b6b44" : isDone ? "#20c99744" : "#7c3aed44"}` }}
    >
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            {isRunning && (
              <Box style={{ animation: "spin 1s linear infinite" }}
                sx={{ "@keyframes spin": { from: { transform: "rotate(0deg)" }, to: { transform: "rotate(360deg)" } } }}>
                <IconLoader2 size={16} color="#a78bfa" />
              </Box>
            )}
            {isDone && <IconCheck size={16} color="#20c997" />}
            {isError && <IconX size={16} color="#ff6b6b" />}
            <Text size="sm" fw={600} c={isError ? "red" : isDone ? "teal" : "violet"}>
              {isError ? "Optimizer Error" : isDone ? "Optimizer Complete" : "Optimizer Running…"}
            </Text>
          </Group>
          <Badge size="xs" color={progressColor} variant="light">
            {displayPct}%
          </Badge>
        </Group>

        <Progress
          value={displayPct}
          color={progressColor}
          size="sm"
          radius="xl"
          animated={isRunning}
        />

        {isError && optimizerError && (
          <Text size="xs" c="red" style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
            {optimizerError}
          </Text>
        )}

        {optimizerProgress.length > 0 && (
          <ScrollArea h={120} type="auto">
            <Stack gap={2}>
              {optimizerProgress.slice(-20).map((entry, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  {entry.case && (
                    <Badge size="xs" variant="outline" color="violet" style={{ flexShrink: 0 }}>
                      Case {entry.case}/{entry.total_cases}
                    </Badge>
                  )}
                  <Text size="xs" c="dimmed" style={{ fontFamily: "monospace" }}>
                    {entry.message}
                  </Text>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Paper>
  );
}
