import { useState } from "react";
import { Box, Text, useWindowSize } from "ink";
import { mtcBanner } from "./banner";
import { theme } from "./theme";
import InputBox from "./components/InputBox";
import Statusbar from "./components/Statusbar";

export default function Home() {
  const [query, setQuery] = useState("");
  const { columns, rows } = useWindowSize();

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <Box marginBottom={1}>
          <Text color="gray">{mtcBanner}</Text>
        </Box>

        <Box
          flexDirection="column"
          backgroundColor="#222"
          paddingX={2}
          paddingY={1}
          width={65}
        >
          <Box marginBottom={1}>
            <InputBox query={query} onChange={setQuery} />
          </Box>

          <Box gap={1} marginBottom={1}>
            <Text color="cyan" bold>
              Build
            </Text>
            <Text color="gray">{"\u2022"}</Text>
            <Text bold>DeepSeek V4 Flash Free</Text>
            <Text color="gray">MetaTeam Zen</Text>
          </Box>

          <Box gap={2}>
            <Text color="gray">
              <Text bold>tab</Text> agents
            </Text>
            <Text color="gray">
              <Text bold>ctrl+p</Text> commands
            </Text>
          </Box>
        </Box>

        <Box marginTop={2}>
          <Text color={theme.colors.warning}>{"\u25cf"} Tip </Text>
          <Text color="gray">Run </Text>
          <Text bold>/connect </Text>
          <Text color="gray">to add an AI provider and start coding</Text>
        </Box>
      </Box>

      <Statusbar />
    </Box>
  );
}
