import {
  Paper,
  Group,
  Text,
  TextInput,
  ActionIcon,
  SimpleGrid,
  Badge,
  Stack,
  Tooltip,
} from "@mantine/core";
import useStore from "../store/useStore";
import { sanitizeNumericInput } from "../utils/validators";

const MOUNT_COLORS = ["blue", "teal", "grape", "orange", "cyan"];

export function MountCard({ mount, index, totalMounts }) {
  const updateMount = useStore((state) => state.updateMount);
  const setForm = useStore((state) => state.setForm);
  const validationErrors = useStore((state) => state.validationErrors);

  const color = MOUNT_COLORS[index % MOUNT_COLORS.length];

  const handleNumChange = (field, val) => {
    const clean = sanitizeNumericInput(val);
    if (clean !== null) {
      updateMount(index, field, clean);
    }
  };

  const handleRemove = () => {
    setForm((prev) => ({
      ...prev,
      mounts: prev.mounts.filter((_, i) => i !== index),
    }));
  };

  const mountErrPrefix = `mount_${index}_`;

  return (
    <Paper p="sm" radius="md" withBorder style={{ background: "var(--mantine-color-dark-7)" }}>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <Badge color={color} variant="filled" size="sm">
              #{index + 1}
            </Badge>
            <TextInput
              size="xs"
              variant="unstyled"
              value={mount.name || ""}
              placeholder="Mount Name"
              onChange={(e) => updateMount(index, "name", e.currentTarget.value)}
              styles={{
                input: {
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  color: "var(--mantine-color-gray-2)",
                },
              }}
            />
          </Group>
          {totalMounts > 3 && (
            <Tooltip label="Remove Mount">
              <ActionIcon color="red" variant="subtle" size="sm" onClick={handleRemove}>
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {/* Position [X, Y, Z] in mm */}
        <div>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="dimmed" fw={600}>
              Position (mm)
            </Text>
          </Group>
          <SimpleGrid cols={3} spacing="xs">
            {["x", "y", "z"].map((coord) => (
              <TextInput
                key={coord}
                size="xs"
                label={coord.toUpperCase()}
                value={mount[coord] ?? ""}
                onChange={(e) => handleNumChange(coord, e.currentTarget.value)}
                error={validationErrors[`${mountErrPrefix}${coord}`]}
                styles={{ input: { fontFamily: "monospace" } }}
              />
            ))}
          </SimpleGrid>
        </div>

        {/* Stiffness [kx, ky, kz] in N/mm */}
        <div>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="dimmed" fw={600}>
              Stiffness (N/mm)
            </Text>
          </Group>
          <SimpleGrid cols={3} spacing="xs">
            {["kx", "ky", "kz"].map((axis) => (
              <TextInput
                key={axis}
                size="xs"
                label={`K${axis.slice(1)}`}
                value={mount[axis] ?? ""}
                onChange={(e) => handleNumChange(axis, e.currentTarget.value)}
                error={validationErrors[`${mountErrPrefix}${axis}`]}
                styles={{
                  input: {
                    fontFamily: "monospace",
                    color: "var(--mantine-color-blue-4)",
                  },
                }}
              />
            ))}
          </SimpleGrid>
        </div>

        {/* Orientation [Roll, Pitch, Yaw] in deg */}
        <div>
          <Group justify="space-between" mb={2}>
            <Text size="xs" c="dimmed" fw={600}>
              Orientation (deg)
            </Text>
          </Group>
          <SimpleGrid cols={3} spacing="xs">
            {[
              { key: "roll", label: "Roll (X)" },
              { key: "pitch", label: "Pitch (Y)" },
              { key: "yaw", label: "Yaw (Z)" },
            ].map(({ key, label }) => (
              <TextInput
                key={key}
                size="xs"
                label={label}
                value={mount[key] ?? ""}
                onChange={(e) => handleNumChange(key, e.currentTarget.value)}
                styles={{ input: { fontFamily: "monospace" } }}
              />
            ))}
          </SimpleGrid>
        </div>
      </Stack>
    </Paper>
  );
}
