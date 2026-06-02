/**
 * AgenticROS Find Object skill.
 * Registers the find_object tool that rotates the robot in place until a
 * target COCO object is detected (YOLOv8n on the camera feed), then stops.
 *
 * Config: config.skills.find
 */

import type { AgenticROSConfig } from "@agenticros/core";
import type { SkillPluginApi, SkillContext } from "./types.js";
import { registerFindObjectTool } from "./tools/find-object.js";

export function registerSkill(
  api: SkillPluginApi,
  config: AgenticROSConfig,
  context: SkillContext,
): void {
  registerFindObjectTool(api, config, context);
}
