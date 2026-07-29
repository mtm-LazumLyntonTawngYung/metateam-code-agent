import { Box, Text } from "ink";
import { theme } from "./theme";
import { mtcBanner } from "./banner";
import Header from "./components/Header";
import Statusbar from "./components/Statusbar";

export default function Home() {
  return (
    <Box flexDirection="column">
      <Header />
      <Box flexDirection="column" alignItems="center" paddingY={1}>
        <Text color={theme.colors.primary}>{mtcBanner}</Text>
        <Text color={theme.colors.text}>Hello from Metateam Agent</Text>
      </Box>
      <Statusbar />
    </Box>
  );
}
