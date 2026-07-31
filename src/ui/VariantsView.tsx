import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "./theme";

const VARIANTS = ["Default", "high", "max"];

type VariantsViewProps = {
  onClose: () => void;
  onSelect: (variantId: string) => void;
};

export default function VariantsView({ onClose, onSelect }: VariantsViewProps) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(
    () =>
      query.trim()
        ? VARIANTS.filter((v) => v.toLowerCase().includes(query.toLowerCase()))
        : VARIANTS,
    [query],
  );

  useInput((_input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
    }
    if (key.return && filtered[selectedIndex]) {
      onSelect(filtered[selectedIndex]);
    }
  });

  return (
    <Box flexGrow={1} flexDirection="column">
      <Box borderStyle="round" borderColor={theme.colors.muted} paddingX={2} paddingY={1}>
        <Text bold color={theme.colors.primary}>
          Select variant
        </Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" marginTop={1}>
        <Box marginBottom={1} paddingX={1}>
          <Text color={theme.colors.muted}>&gt; </Text>
          <TextInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setSelectedIndex(0);
            }}
            placeholder="filter variants..."
          />
        </Box>

        {filtered.length === 0 ? (
          <Box paddingX={1}>
            <Text color={theme.colors.muted}>No matching variants</Text>
          </Box>
        ) : (
          <Box flexDirection="column" paddingX={1}>
            {filtered.map((variant, i) => {
              const selected = i === selectedIndex;
              return (
                <Box key={variant}>
                  <Text color={selected ? theme.colors.primary : theme.colors.muted}>
                    {selected ? "\u276f " : "  "}
                  </Text>
                  <Text bold={selected} color={selected ? theme.colors.text : theme.colors.muted}>
                    {variant}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      <Box borderStyle="single" borderColor={theme.colors.muted} borderTop={false} borderBottom={false}>
        <Box paddingX={1} paddingY={0} justifyContent="space-between" width="100%">
          <Text color={theme.colors.muted}>
            {"\u2191\u2193"} Navigate  {"\u23ce"} Select  <Text bold>esc</Text> Cancel
          </Text>
          <Text color={theme.colors.muted}>
            {filtered.length} variant{filtered.length !== 1 ? "s" : ""}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
