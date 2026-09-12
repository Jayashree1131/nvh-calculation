import { Paper, Text, TextInput, SimpleGrid, Group, Badge, Tooltip } from "@mantine/core";
import useStore from "../store/useStore";

const AXIS_LABELS = ["X", "Y", "Z"];

export function InertiaTensorGrid() {
  const inertia = useStore((state) => state.form.inertia);
  const updateInertia = useStore((state) => state.updateInertia);
  const validationErrors = useStore((state) => state.validationErrors);

  const handleChange = (r, c, val) => {
    const num = parseFloat(val);
    updateInertia(r, c, isNaN(num) ? "" : num);
  };

  return (
    <Paper p="sm" radius="md" withBorder style={{ background: "var(--mantine-color-dark-7)" }}>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Inertia Tensor [I]
          </Text>
          <Badge size="xs" variant="outline" color="blue">
            kg·m²
          </Badge>
        </Group>
        <Tooltip label="Editing off-diagonals mirrors symmetrically (Ixy = Iyx)">
          <Badge size="xs" variant="dot" color="teal">
            Symmetric Enforced
          </Badge>
        </Tooltip>
      </Group>

      <SimpleGrid cols={3} spacing="xs">
        {inertia.map((row, r) =>
          row.map((val, c) => {
            const isDiagonal = r === c;
            const errKey = `inertia_${r}_${c}`;
            const hasError = !!validationErrors[errKey];

            return (
              <TextInput
                key={`${r}-${c}`}
                size="xs"
                label={`${AXIS_LABELS[r]}${AXIS_LABELS[c]}`}
                value={val ?? ""}
                onChange={(e) => handleChange(r, c, e.currentTarget.value)}
                error={hasError ? validationErrors[errKey] : null}
                styles={{
                  input: {
                    fontFamily: "monospace",
                    fontWeight: isDiagonal ? 700 : 400,
                    color: isDiagonal ? "var(--mantine-color-teal-4)" : "var(--mantine-color-gray-3)",
                    backgroundColor: isDiagonal ? "rgba(32, 201, 151, 0.08)" : undefined,
                  },
                }}
              />
            );
          })
        )}
      </SimpleGrid>
    </Paper>
  );
}
