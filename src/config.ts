/**
 * Find skill config slice: config.skills.find
 */

export interface FindConfig {
  /** Camera image topic (default /camera/camera/color/image_raw/compressed). */
  cameraTopic?: string;
  /** Camera message type. Default "CompressedImage". */
  cameraMessageType?: "CompressedImage" | "Image";
  /** Override cmd_vel topic. Default: derived from teleop / robot namespace. */
  cmdVelTopic?: string;
  /** Default rotation speed in rad/s when caller omits it. Default 0.3. */
  defaultAngularSpeed?: number;
  /** Default timeout in seconds when caller omits it. Default 30. */
  defaultTimeoutSeconds?: number;
  /** Default minimum YOLO confidence. Default 0.5. */
  defaultMinConfidence?: number;
  /** Time between camera frame samples (ms). Default 500. */
  pollIntervalMs?: number;
  /** Per-frame camera subscribe timeout (ms). Default 3000. */
  snapshotTimeoutMs?: number;
}

const DEFAULTS: Required<FindConfig> = {
  cameraTopic: "/camera/camera/color/image_raw/compressed",
  cameraMessageType: "CompressedImage",
  cmdVelTopic: "",
  defaultAngularSpeed: 0.3,
  defaultTimeoutSeconds: 30,
  defaultMinConfidence: 0.5,
  pollIntervalMs: 500,
  snapshotTimeoutMs: 3000,
};

export function getFindConfig(skillsSlice: unknown): Required<FindConfig> {
  if (!skillsSlice || typeof skillsSlice !== "object") return DEFAULTS;
  const c = skillsSlice as Record<string, unknown>;
  return {
    cameraTopic: typeof c.cameraTopic === "string" ? c.cameraTopic : DEFAULTS.cameraTopic,
    cameraMessageType:
      c.cameraMessageType === "Image" ? "Image" : DEFAULTS.cameraMessageType,
    cmdVelTopic: typeof c.cmdVelTopic === "string" ? c.cmdVelTopic : DEFAULTS.cmdVelTopic,
    defaultAngularSpeed:
      typeof c.defaultAngularSpeed === "number" && c.defaultAngularSpeed > 0
        ? c.defaultAngularSpeed
        : DEFAULTS.defaultAngularSpeed,
    defaultTimeoutSeconds:
      typeof c.defaultTimeoutSeconds === "number" && c.defaultTimeoutSeconds > 0
        ? c.defaultTimeoutSeconds
        : DEFAULTS.defaultTimeoutSeconds,
    defaultMinConfidence:
      typeof c.defaultMinConfidence === "number" && c.defaultMinConfidence > 0
        ? c.defaultMinConfidence
        : DEFAULTS.defaultMinConfidence,
    pollIntervalMs:
      typeof c.pollIntervalMs === "number" && c.pollIntervalMs > 0
        ? c.pollIntervalMs
        : DEFAULTS.pollIntervalMs,
    snapshotTimeoutMs:
      typeof c.snapshotTimeoutMs === "number" && c.snapshotTimeoutMs > 0
        ? c.snapshotTimeoutMs
        : DEFAULTS.snapshotTimeoutMs,
  };
}
