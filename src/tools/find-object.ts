/**
 * find_object: Rotate the robot in place until a target COCO class is detected
 * by YOLOv8n in the camera feed, then stop.
 */

import { Type } from "@sinclair/typebox";
import type { AgenticROSConfig } from "@agenticros/core";
import type { SkillPluginApi, SkillContext } from "../types.js";
import { findObject } from "../find-object.js";
import { COCO_CLASSES } from "../coco-classes.js";

export function registerFindObjectTool(
  api: SkillPluginApi,
  config: AgenticROSConfig,
  context: SkillContext,
): void {
  api.registerTool({
    name: "find_object",
    label: "Find object",
    description:
      "Rotate the robot in place (clockwise by default) until a target object is detected by YOLOv8n in the camera feed, then stop. " +
      "Target must be a COCO class name (e.g. 'cell phone', 'chair', 'bottle', 'cup', 'vase', 'laptop'). " +
      "Returns whether the object was found, its confidence, bounding box, and horizontal offset from image center " +
      "(-1 = left edge, 0 = center, +1 = right edge).",

    parameters: Type.Object({
      target: Type.String({
        description:
          "COCO class name to search for (e.g. 'bottle', 'cup', 'vase', 'chair', 'cell phone'). " +
          "Common aliases accepted: phone, sofa, plant, tv/television, bike.",
      }),
      angular_speed: Type.Optional(
        Type.Number({
          minimum: 0.05,
          maximum: 3,
          description:
            "Rotation speed in rad/s. Defaults to skills.find.defaultAngularSpeed (0.3). Clamped to safety.maxAngularVelocity.",
        }),
      ),
      clockwise: Type.Optional(
        Type.Boolean({
          description: "Rotate clockwise (default true). Set false for counterclockwise.",
        }),
      ),
      timeout_seconds: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 300,
          description: "Give up after this many seconds. Defaults to skills.find.defaultTimeoutSeconds (30).",
        }),
      ),
      min_confidence: Type.Optional(
        Type.Number({
          minimum: 0.05,
          maximum: 0.99,
          description: "Minimum detection confidence to accept. Defaults to skills.find.defaultMinConfidence (0.5).",
        }),
      ),
    }),

    async execute(_toolCallId, params) {
      const target = String(params["target"] ?? "").trim();
      if (!target) {
        return {
          content: [{ type: "text" as const, text: "Missing required argument: target" }],
          details: { error: "missing_target" },
        };
      }

      const transport = context.getTransport();
      if (transport.getStatus() !== "connected") {
        return {
          content: [
            {
              type: "text" as const,
              text: "Transport not connected to ROS2. Check the AgenticROS plugin status.",
            },
          ],
          details: { error: "transport_not_connected" },
        };
      }

      try {
        const result = await findObject(config, transport, {
          target,
          angularSpeed: params["angular_speed"] as number | undefined,
          clockwise: params["clockwise"] as boolean | undefined,
          timeoutSeconds: params["timeout_seconds"] as number | undefined,
          minConfidence: params["min_confidence"] as number | undefined,
        });

        const summary = result.error
          ? result.error
          : result.found
          ? `Found ${target} after ${result.elapsedSeconds.toFixed(1)}s rotating ${result.rotationDirection}. ` +
            `Confidence ${(result.detection!.confidence * 100).toFixed(0)}%, ` +
            `horizontal offset ${result.detection!.horizontalOffset.toFixed(2)} ` +
            `(${result.detection!.horizontalOffset < 0 ? "left" : "right"} of center). Robot stopped.`
          : `${target} not found within ${result.elapsedSeconds.toFixed(1)}s. Robot stopped.`;

        return {
          content: [{ type: "text" as const, text: summary }],
          details: result,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        context.logger.error(`find_object failed: ${message}`);
        return {
          content: [{ type: "text" as const, text: `find_object failed: ${message}` }],
          details: { error: message },
        };
      }
    },
  });

  // Touch the COCO list import so tree-shakers don't drop it; also useful for
  // future "list supported classes" debugging.
  void COCO_CLASSES.length;
}
