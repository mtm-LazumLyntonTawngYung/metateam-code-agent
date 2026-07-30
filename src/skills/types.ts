export type SkillStatus = "installed" | "available" | "disabled";

export type SkillCategory = "development" | "operations" | "ai" | "utility";

export type SkillOrigin = "workspace" | "global" | "bundled";

export type Skill = {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  status: SkillStatus;
  origin: SkillOrigin;
  tags: string[];
  body?: string;
};
