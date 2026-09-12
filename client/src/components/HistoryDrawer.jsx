import { useEffect, useState } from "react";
import {
  Drawer,
  Stack,
  Group,
  Text,
  Badge,
  Paper,
  Button,
  ActionIcon,
  TextInput,
  Tooltip,
  Loader,
  Center,
  ScrollArea,
} from "@mantine/core";
import {
  IconTrash,
  IconDownload,
  IconCheck,
  IconEdit,
  IconClock,
  IconRefresh,
} from "@tabler/icons-react";
import axios from "axios";
import useStore from "../store/useStore";
import { useHistory } from "../hooks/useHistory";
import { notifications } from "@mantine/notifications";

export function HistoryDrawer() {
  const historyOpen = useStore((state) => state.historyOpen);
  const setHistoryOpen = useStore((state) => state.setHistoryOpen);
  const loadFromHistory = useStore((state) => state.loadFromHistory);
  const setCalcSuccess = useStore((state) => state.setCalcSuccess);

  const { items, loading, total, fetchHistory, deleteCalc, updateLabel } = useHistory();
  const [editingId, setEditingId] = useState(null);
  const [tempLabel, setTempLabel] = useState("");

  useEffect(() => {
    if (historyOpen) {
      fetchHistory();
    }
  }, [historyOpen, fetchHistory]);

  const handleLoad = async (item) => {
    // 1. Load inputs into form
    loadFromHistory(item.inputs);

    // 2. Fetch full calc record (including plots) to display immediately in results
    try {
      const res = await axios.get(`/api/history/${item._id}`);
      if (res.data.status === "ok") {
        setCalcSuccess(res.data.data.outputs, item._id);
        notifications.show({
          title: "Run Loaded",
          message: `Loaded inputs & results from ${new Date(item.createdAt).toLocaleString()}`,
          color: "teal",
          autoClose: 2500,
        });
      }
    } catch {
      if (item.outputs) {
        setCalcSuccess(item.outputs, item._id);
      }
    }

    setHistoryOpen(false);
  };

  const handleStartEdit = (item) => {
    setEditingId(item._id);
    setTempLabel(item.label || "");
  };

  const handleSaveLabel = async (id) => {
    await updateLabel(id, tempLabel);
    setEditingId(null);
  };

  return (
    <Drawer
      opened={historyOpen}
      onClose={() => setHistoryOpen(false)}
      title={
        <Group gap="xs">
          <IconClock size={18} />
          <Text fw={700}>Calculation History ({total})</Text>
        </Group>
      }
      position="right"
      size="md"
      padding="md"
    >
      <ScrollArea style={{ height: "calc(100vh - 100px)" }} type="auto">
        <Stack gap="sm">
          <Group justify="flex-end">
            <ActionIcon variant="subtle" size="sm" onClick={() => fetchHistory()}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Group>

          {loading ? (
            <Center p="xl">
              <Loader size="sm" />
            </Center>
          ) : items.length === 0 ? (
            <Center p="xl">
              <Text size="sm" c="dimmed">
                No saved calculations found.
              </Text>
            </Center>
          ) : (
            items.map((item) => {
              const misalignment = item.outputs?.misalignment_3D_deg;
              const dateStr = new Date(item.createdAt).toLocaleString();
              const isEditing = editingId === item._id;

              return (
                <Paper
                  key={item._id}
                  p="sm"
                  radius="md"
                  withBorder
                  style={{ background: "var(--mantine-color-dark-7)" }}
                >
                  <Stack gap="xs">
                    {/* Header: Label or Edit Field */}
                    <Group justify="space-between">
                      {isEditing ? (
                        <Group gap="xs" style={{ flex: 1 }}>
                          <TextInput
                            size="xs"
                            value={tempLabel}
                            onChange={(e) => setTempLabel(e.currentTarget.value)}
                            placeholder="Label (e.g. Baseline Run 1)"
                            style={{ flex: 1 }}
                            autoFocus
                          />
                          <ActionIcon
                            size="sm"
                            color="teal"
                            variant="filled"
                            onClick={() => handleSaveLabel(item._id)}
                          >
                            <IconCheck size={14} />
                          </ActionIcon>
                        </Group>
                      ) : (
                        <Group gap="xs">
                          <Text fw={600} size="xs">
                            {item.label || "Untitled Run"}
                          </Text>
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="gray"
                            onClick={() => handleStartEdit(item)}
                          >
                            <IconEdit size={12} />
                          </ActionIcon>
                        </Group>
                      )}

                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => deleteCalc(item._id)}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Group>

                    {/* Metadata */}
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        {dateStr}
                      </Text>
                      <Badge size="xs" color="blue" variant="light">
                        Mass: {item.inputs?.mass} kg
                      </Badge>
                    </Group>

                    {misalignment !== undefined && (
                      <Group justify="space-between">
                        <Text size="xs" c="dimmed">
                          TRA-eTRA Misalignment:
                        </Text>
                        <Badge
                          size="xs"
                          color={misalignment < 5 ? "teal" : misalignment < 15 ? "yellow" : "red"}
                        >
                          {misalignment?.toFixed(2)}°
                        </Badge>
                      </Group>
                    )}

                    <Button
                      size="xs"
                      variant="light"
                      color="blue"
                      fullWidth
                      onClick={() => handleLoad(item)}
                    >
                      Load into Form
                    </Button>
                  </Stack>
                </Paper>
              );
            })
          )}
        </Stack>
      </ScrollArea>
    </Drawer>
  );
}
