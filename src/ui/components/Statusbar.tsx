import { Box, Text } from "ink";
import { theme } from "../theme";

export default function Statusbar() {
  return (
    <Box
      borderStyle="single"
      borderColor={theme.colors.muted}
      paddingX={1}
      width="100%"
    >
      <Text color={theme.colors.muted}>Ready</Text>
    </Box>
  );
}
