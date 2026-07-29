import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type InputBoxProps = {
  query: string;
  onChange: (value: string) => void;
};

export default function InputBox({ query, onChange }: InputBoxProps) {
  return (
    <Box>
      <Text color="blue">| </Text>
      <TextInput
        value={query}
        onChange={onChange}
        placeholder="Fix a TODO in the codebase"
      />
    </Box>
  );
}
