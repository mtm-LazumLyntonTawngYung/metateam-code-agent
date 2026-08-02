import { Box, Text } from "ink";
import { useTheme } from "../theme";
import { VERSION } from "../../version";

export default function Header() {
  const theme = useTheme();
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
      <Text color={theme.colors.muted}> Metateam Code Agent v{VERSION}</Text>
    </Box>
  );
}
