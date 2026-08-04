import { z } from "zod";
import type { ToolDefinition } from "./schema";
import { getAllSkills, installSkill } from "../skills/index";

const SkillSchema = z.object({
  name: z
    .string()
    .describe("Skill id or name to load, e.g. 'tdd' or 'ai-rag'."),
});

const skillTool: ToolDefinition = {
  name: "skill",
  description:
    "Load a skill's instructions (SKILL.md) into the conversation. " +
    "Skills encode specialized workflows (testing, search, presentations, etc.). " +
    "Call this before starting a task that matches a skill's description. Run the tool's guidance step by step.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Skill id or name to load.",
      },
    },
    required: ["name"],
  },
  schema: SkillSchema,
  execute(args) {
    const parsed = SkillSchema.parse(args);
    const skills = getAllSkills();
    const skill =
      skills.find((s) => s.id === parsed.name) ??
      skills.find((s) => s.name.toLowerCase() === parsed.name.toLowerCase());

    if (!skill) {
      return {
        success: false,
        error: `Unknown skill '${parsed.name}'. Available: ${skills.map((s) => s.id).join(", ")}`,
      };
    }

    if (skill.body) {
      return {
        success: true,
        data: {
          id: skill.id,
          name: skill.name,
          status: skill.status,
          body: skill.body,
        },
      };
    }

    if (skill.status === "available") {
      installSkill(skill.id);
      return {
        success: true,
        data: {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          status: "installed",
          note: `'${skill.id}' is marked installed. If its SKILL.md is not present locally, check .mtc/skills/${skill.id}/SKILL.md or ~/.mtc/skills/${skill.id}/SKILL.md.`,
        },
      };
    }

    return {
      success: true,
      data: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        note: "No SKILL.md body is installed for this skill yet.",
      },
    };
  },
};

export default skillTool;