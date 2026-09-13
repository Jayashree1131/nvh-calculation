import React from "react";
import { Alert, Button, Stack, Text, Paper } from "@mantine/core";
import { IconAlertTriangle, IconRotateClockwise } from "@tabler/icons-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary caught error]:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Paper p="md" radius="md" withBorder style={{ borderColor: "#ff6b6b44", background: "#1c1117" }}>
          <Stack gap="sm">
            <Alert
              icon={<IconAlertTriangle size={18} />}
              title="Component Rendering Error"
              color="red"
              variant="light"
            >
              <Text size="xs" style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                {this.state.error?.message || "An unexpected rendering error occurred."}
              </Text>
            </Alert>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconRotateClockwise size={14} />}
              onClick={this.handleReset}
              style={{ alignSelf: "flex-start" }}
            >
              Retry Render
            </Button>
          </Stack>
        </Paper>
      );
    }

    return this.props.children;
  }
}
