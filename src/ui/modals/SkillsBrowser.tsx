import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { getAllSkills, installSkill, uninstallSkill } from "../../skills";
import type { Skill } from "../../skills";
import { useTheme } from "../theme";

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function originLabel(origin: string): string {
  if (origin === "workspace") return "Workspace";
  if (origin === "global") return "Global";
  return "Available";
}

type SkillsBrowserProps = {
  onClose: () => void;
  activeSkillId: string | null;
  onActivate: (id: string | null) => void;
};

export default function SkillsBrowser({ onClose, activeSkillId, onActivate }: SkillsBrowserProps) {
  const theme = useTheme();
  const originColor = (origin: string): string => {
    if (origin === "workspace") return theme.colors.secondary;
    if (origin === "global") return theme.colors.warning;
    return theme.colors.muted;
  };
  const [skills, setSkills] = useState<Skill[]>(() => getAllSkills());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      query.trim()
        ? skills.filter((s) => fuzzyMatch(s.id + " " + s.name + " " + s.description, query))
        : skills,
    [query, skills],
  );

  const current = filtered[selectedIndex];

  useInput((_input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.return && current) {
      if (current.status === "installed") {
        const newActive = activeSkillId === current.id ? null : current.id;
        onActivate(newActive);
      } else {
        installSkill(current.id);
        const updated = getAllSkills();
        setSkills(updated);
        onActivate(current.id);
      }
    }
    if (key.upArrow) setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
    if (key.downArrow) setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
  });

  const idWidth = 22;

  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.warning}
        paddingX={2}
        paddingY={1}
        width={72}
      >
        <Text bold color={theme.colors.warning}>
          Agent Skills Registry
        </Text>

        <Box marginTop={1} marginBottom={1}>
          <Text color="blue">&gt; </Text>
          <TextInput
            value={query}
            onChange={(v) => { setQuery(v); setSelectedIndex(0); }}
            placeholder="Search skills..."
          />
        </Box>

        <Box flexDirection="column">
          {filtered.length === 0 ? (
            <Box flexDirection="column">
              <Text color={theme.colors.muted}>No matching skills.</Text>
              <Box marginTop={1}>
                <Text color={theme.colors.muted}>
                  Install skills by placing a SKILL.md file in:
                </Text>
              </Box>
              <Box>
                <Text color={theme.colors.muted}>  .mtc/skills/&lt;name&gt;/SKILL.md  (project)</Text>
              </Box>
              <Box>
                <Text color={theme.colors.muted}>  ~/.mtc/skills/&lt;name&gt;/SKILL.md  (global)</Text>
              </Box>
            </Box>
          ) : (
            filtered.map((skill, i) => {
              const isSelected = i === selectedIndex;
              const isInstalled = skill.status === "installed";
              const isActive = skill.id === activeSkillId;
              const marker = isActive ? "\u25c9" : isInstalled ? "\u25cf" : "\u25cb";
              const idDisplay = skill.id.length >= idWidth
                ? skill.id.slice(0, idWidth)
                : skill.id + " ".repeat(idWidth - skill.id.length);

              return (
                <Box key={skill.id} flexDirection="column">
                  <Box>
                    <Text color={isSelected ? theme.colors.primary : "transparent"}>
                      {isSelected ? "\u276f " : "  "}
                    </Text>
                    <Text color={isActive ? theme.colors.success : isInstalled ? theme.colors.text : theme.colors.muted}>
                      {marker} {idDisplay}
                    </Text>
                    <Text color={originColor(skill.origin)}>
                      [{originLabel(skill.origin)}]
                    </Text>
                    <Text color={isActive ? theme.colors.success : isInstalled ? theme.colors.text : theme.colors.muted}>
                      {" "}{isActive ? "[Active]" : isInstalled ? "[Installed]" : "[Available]"}
                    </Text>
                  </Box>
                  <Box marginLeft={3}>
                    <Text color={theme.colors.muted}>{skill.description}</Text>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>

        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            {"\u2191\u2193"} Navigate  {"\u23ce"} Activate/Install  <Text bold>esc</Text> Back
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
