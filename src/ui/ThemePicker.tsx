import { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { THEMES } from "./theme";
import { useTheme, useSetTheme, usePreviewTheme } from "./theme";

type ThemePickerProps = {
  onSelect: (themeId: string) => void;
};

export default function ThemePicker({ onSelect }: ThemePickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const currentTheme = useTheme();
  const commitTheme = useSetTheme();
  const previewTheme = usePreviewTheme();
  const originalRef = useRef(currentTheme.id);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => {
        const next = i > 0 ? i - 1 : THEMES.length - 1;
        previewTheme(THEMES[next].id);
        return next;
      });
    }
    if (key.downArrow) {
      setSelectedIndex((i) => {
        const next = i < THEMES.length - 1 ? i + 1 : 0;
        previewTheme(THEMES[next].id);
        return next;
      });
    }
    if (key.return) {
      const t = THEMES[selectedIndex];
      commitTheme(t.id);
      onSelect(t.id);
    }
    if (key.escape) {
      commitTheme(originalRef.current);
      onSelect(originalRef.current);
    }
  });

  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Box flexDirection="column" borderStyle="round" borderColor={currentTheme.colors.warning} paddingX={2} paddingY={1} width={55}>
        <Box marginBottom={1}>
          <Text bold color={currentTheme.colors.warning}>Themes</Text>
        </Box>
        {THEMES.map((t, i) => {
          const isCurrent = t.id === currentTheme.id;
          const isSelected = i === selectedIndex;
          return (
            <Box key={t.id}>
              <Text color={isSelected ? currentTheme.colors.primary : currentTheme.colors.muted}>
                {isSelected ? "\u276f " : "  "}
              </Text>
              <Text bold={isSelected} color={isCurrent ? currentTheme.colors.success : isSelected ? currentTheme.colors.text : currentTheme.colors.muted}>
                {t.name}
              </Text>
              {isCurrent && <Text color={currentTheme.colors.warning}>  \u2713</Text>}
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Text color={currentTheme.colors.muted}>
            {"\u2191\u2193"} navigate  {"\u23ce"} select  <Text bold>esc</Text> cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
