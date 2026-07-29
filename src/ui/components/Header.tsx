import { Box, Text } from "ink";
import { theme } from "../theme";

export default function Header() {
  return (
    <Box
      borderStyle="single"
      borderColor={theme.colors.primary}
      paddingX={1}
      width="100%"
    >
      <Text bold color={theme.colors.primary}>
        mtc
      </Text>
      <Text color={theme.colors.muted}> Metateam Code Agent v0.1.0</Text>
    </Box>
  );
}
