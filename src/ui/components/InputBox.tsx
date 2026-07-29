import { Box, Text } from "ink";
import { theme } from "../theme";

type InputBoxProps = {
  prompt?: string;
};

export default function InputBox({ prompt = ">" }: InputBoxProps) {
  return (
    <Box>
      <Text color={theme.colors.primary}>{prompt} </Text>
    </Box>
  );
}
