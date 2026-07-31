import { createContext, useContext, useState } from "react";
import { loadConfig, saveConfig } from "../config";

export type ThemeColors = {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  error: string;
  warning: string;
  success: string;
};

export type ThemeDefinition = {
  id: string;
  name: string;
  colors: ThemeColors;
};

const THEMES: ThemeDefinition[] = [
  {
    id: "neon",
    name: "Neon",
    colors: {
      primary: "#00ff88",
      secondary: "#0ea5e9",
      background: "#0f172a",
      surface: "#1e293b",
      text: "#e2e8f0",
      muted: "#64748b",
      error: "#ef4444",
      warning: "#f59e0b",
      success: "#22c55e",
    },
  },

  {
    id: "dracula",
    name: "Dracula",
    colors: {
      primary: "#ff79c6",
      secondary: "#8be9fd",
      background: "#282a36",
      surface: "#44475a",
      text: "#f8f8f2",
      muted: "#6272a4",
      error: "#ff5555",
      warning: "#f1fa8c",
      success: "#50fa7b",
    },
  },

  {
    id: "nord",
    name: "Nord",
    colors: {
      primary: "#88c0d0",
      secondary: "#81a1c1",
      background: "#2e3440",
      surface: "#3b4252",
      text: "#eceff4",
      muted: "#616e88",
      error: "#bf616a",
      warning: "#ebcb8b",
      success: "#a3be8c",
    },
  },

  {
    id: "solarized",
    name: "Solarized Dark",
    colors: {
      primary: "#268bd2",
      secondary: "#2aa198",
      background: "#002b36",
      surface: "#073642",
      text: "#839496",
      muted: "#586e75",
      error: "#dc322f",
      warning: "#b58900",
      success: "#859900",
    },
  },

  {
    id: "gruvbox",
    name: "Gruvbox Dark",
    colors: {
      primary: "#fe8019",
      secondary: "#83a598",
      background: "#282828",
      surface: "#3c3836",
      text: "#ebdbb2",
      muted: "#928374",
      error: "#fb4934",
      warning: "#fabd2f",
      success: "#b8bb26",
    },
  },

  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    colors: {
      primary: "#89b4fa",
      secondary: "#cba6f7",
      background: "#1e1e2e",
      surface: "#313244",
      text: "#cdd6f4",
      muted: "#6c7086",
      error: "#f38ba8",
      warning: "#f9e2af",
      success: "#a6e3a1",
    },
  },

  {
    id: "tokyonight",
    name: "Tokyo Night",
    colors: {
      primary: "#7aa2f7",
      secondary: "#bb9af7",
      background: "#1a1b26",
      surface: "#24283b",
      text: "#c0caf5",
      muted: "#565f89",
      error: "#f7768e",
      warning: "#e0af68",
      success: "#9ece6a",
    },
  },

  {
    id: "onedark",
    name: "One Dark",
    colors: {
      primary: "#61afef",
      secondary: "#c678dd",
      background: "#282c34",
      surface: "#353b45",
      text: "#abb2bf",
      muted: "#5c6370",
      error: "#e06c75",
      warning: "#e5c07b",
      success: "#98c379",
    },
  },

  {
    id: "github-dark",
    name: "GitHub Dark",
    colors: {
      primary: "#58a6ff",
      secondary: "#79c0ff",
      background: "#0d1117",
      surface: "#161b22",
      text: "#c9d1d9",
      muted: "#8b949e",
      error: "#f85149",
      warning: "#d29922",
      success: "#3fb950",
    },
  },

  {
    id: "github-light",
    name: "GitHub Light",
    colors: {
      primary: "#0969da",
      secondary: "#1f6feb",
      background: "#ffffff",
      surface: "#f6f8fa",
      text: "#24292f",
      muted: "#57606a",
      error: "#cf222e",
      warning: "#9a6700",
      success: "#1a7f37",
    },
  },

  {
    id: "monokai",
    name: "Monokai",
    colors: {
      primary: "#a6e22e",
      secondary: "#66d9ef",
      background: "#272822",
      surface: "#3e3d32",
      text: "#f8f8f2",
      muted: "#75715e",
      error: "#f92672",
      warning: "#fd971f",
      success: "#a6e22e",
    },
  },

  {
    id: "material",
    name: "Material Dark",
    colors: {
      primary: "#82aaff",
      secondary: "#c792ea",
      background: "#263238",
      surface: "#37474f",
      text: "#eeffff",
      muted: "#607d8b",
      error: "#ff5370",
      warning: "#ffcb6b",
      success: "#c3e88d",
    },
  },

  {
    id: "ayu",
    name: "Ayu Mirage",
    colors: {
      primary: "#5ccfe6",
      secondary: "#ffd580",
      background: "#1f2430",
      surface: "#2a3142",
      text: "#cccac2",
      muted: "#707a8c",
      error: "#ff6666",
      warning: "#ffcc66",
      success: "#bae67e",
    },
  },

  {
    id: "rosepine",
    name: "Rosé Pine",
    colors: {
      primary: "#9ccfd8",
      secondary: "#c4a7e7",
      background: "#191724",
      surface: "#26233a",
      text: "#e0def4",
      muted: "#6e6a86",
      error: "#eb6f92",
      warning: "#f6c177",
      success: "#31748f",
    },
  },

  {
    id: "everforest",
    name: "Everforest",
    colors: {
      primary: "#a7c080",
      secondary: "#7fbbb3",
      background: "#2b3339",
      surface: "#374145",
      text: "#d3c6aa",
      muted: "#859289",
      error: "#e67e80",
      warning: "#dbbc7f",
      success: "#a7c080",
    },
  },

  {
    id: "kanagawa",
    name: "Kanagawa",
    colors: {
      primary: "#7fb4ca",
      secondary: "#957fb8",
      background: "#1f1f28",
      surface: "#2a2a37",
      text: "#dcd7ba",
      muted: "#727169",
      error: "#e46876",
      warning: "#c0a36e",
      success: "#98bb6c",
    },
  },

  {
    id: "cyberpunk",
    name: "Cyberpunk",
    colors: {
      primary: "#00f5ff",
      secondary: "#ff00ff",
      background: "#09090b",
      surface: "#18181b",
      text: "#ffffff",
      muted: "#71717a",
      error: "#ff4d6d",
      warning: "#ffd60a",
      success: "#39ff14",
    },
  },

  {
    id: "matrix",
    name: "Matrix",
    colors: {
      primary: "#00ff41",
      secondary: "#00cc66",
      background: "#000000",
      surface: "#111111",
      text: "#00ff41",
      muted: "#3f3f46",
      error: "#ff4444",
      warning: "#ffee00",
      success: "#00ff41",
    },
  },

  {
    id: "ocean",
    name: "Deep Ocean",
    colors: {
      primary: "#4fc3f7",
      secondary: "#26c6da",
      background: "#011627",
      surface: "#102a43",
      text: "#d6deeb",
      muted: "#5c677d",
      error: "#ef5350",
      warning: "#ffca28",
      success: "#26a69a",
    },
  },

  {
    id: "sunset",
    name: "Sunset",
    colors: {
      primary: "#ff7b72",
      secondary: "#ffb86c",
      background: "#2d1b33",
      surface: "#442b48",
      text: "#ffe9d6",
      muted: "#9e7b87",
      error: "#ff5555",
      warning: "#ffb86c",
      success: "#50fa7b",
    },
  },

  {
    id: "forest",
    name: "Forest",
    colors: {
      primary: "#4caf50",
      secondary: "#8bc34a",
      background: "#102217",
      surface: "#1d3526",
      text: "#d8f3dc",
      muted: "#7a8f80",
      error: "#ef5350",
      warning: "#ffd54f",
      success: "#66bb6a",
    },
  },
];

export function getTheme(id: string): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

function loadSavedTheme(): ThemeDefinition {
  const cfg = loadConfig();
  return getTheme(cfg.themeId ?? "neon");
}

export function saveThemeId(id: string): void {
  saveConfig({ themeId: id });
}

export { THEMES };

type ThemeCtx = {
  theme: ThemeDefinition;
  previewTheme: (id: string) => void;
  commitTheme: (id: string) => void;
  clearPreview: () => void;
};

const ThemeContext = createContext<ThemeCtx>({
  theme: THEMES[0],
  previewTheme: () => {},
  commitTheme: () => {},
  clearPreview: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [committed, setCommitted] = useState(loadSavedTheme);
  const [preview, setPreview] = useState<ThemeDefinition | null>(null);

  const previewTheme = (id: string) => setPreview(getTheme(id));
  const clearPreview = () => setPreview(null);
  const commitTheme = (id: string) => {
    const t = getTheme(id);
    saveThemeId(id);
    setCommitted(t);
    setPreview(null);
  };

  const theme = preview ?? committed;

  return (
    <ThemeContext.Provider value={{ theme, previewTheme, commitTheme, clearPreview }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeDefinition {
  return useContext(ThemeContext).theme;
}

export function useSetTheme(): (id: string) => void {
  return useContext(ThemeContext).commitTheme;
}

export function usePreviewTheme(): (id: string) => void {
  return useContext(ThemeContext).previewTheme;
}

export const theme = THEMES[0];
