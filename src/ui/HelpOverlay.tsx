import { Box, Text, useInput } from "ink";

type HelpOverlayProps = {
  onClose: () => void;
};

export default function HelpOverlay({ onClose }: HelpOverlayProps) {
  useInput((_input, key) => {
    if (key.escape || key.return) onClose();
  });

  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} width={60}>
        <Text bold color="yellow">Help</Text>
        <Box marginTop={1}>
          <Text>Press ctrl+p to see all available actions and commands in any context.</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">esc/enter to close</Text>
        </Box>
      </Box>
    </Box>
  );
}
