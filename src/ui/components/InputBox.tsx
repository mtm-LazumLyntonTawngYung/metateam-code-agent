import { Box, Text } from "ink";
import TextInput from "ink-text-input";

type InputBoxProps = {
  query: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
};

export default function InputBox({ query, onChange, onSubmit }: InputBoxProps) {
  return (
    <Box>
      <Text color="blue">| </Text>
      <TextInput
        value={query}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="Fix a TODO in the codebase"
      />
    </Box>
  );
}
