/**
 * Rotate the robot in place until a target COCO class is detected in the
 * camera feed, then stop. Used by the find_object skill tool.
 */

import type { AgenticROSConfig, RosTransport } from "@agenticros/core";
import { resolveCameraSubscribeTopic, toNamespacedTopic } from "@agenticros/core";
import { ObjectDetector } from "./detector.js";
import { resolveCocoClassId, COCO_CLASSES } from "./coco-classes.js";
import { getFindConfig } from "./config.js";

const COMPRESSED_IMAGE_TYPE = "sensor_msgs/msg/CompressedImage";
const IMAGE_TYPE = "sensor_msgs/msg/Image";

export interface FindObjectOptions {
  target: string;
  angularSpeed?: number;
  timeoutSeconds?: number;
  minConfidence?: number;
  clockwise?: boolean;
}

export interface FindObjectResult {
  found: boolean;
  target: string;
  classId: number;
  elapsedSeconds: number;
  rotationDirection: "clockwise" | "counterclockwise";
  angularSpeed: number;
  detection?: {
    confidence: number;
    cx: number;
    cy: number;
    width: number;
    height: number;
    imageWidth: number;
    imageHeight: number;
    horizontalOffset: number;
  };
  error?: string;
}

export async function findObject(
  config: AgenticROSConfig,
  transport: RosTransport,
  opts: FindObjectOptions,
): Promise<FindObjectResult> {
  const find = getFindConfig(config.skills?.["find"]);

  const classId = resolveCocoClassId(opts.target);
  if (classId === null) {
    return {
      found: false,
      target: opts.target,
      classId: -1,
      elapsedSeconds: 0,
      rotationDirection: "clockwise",
      angularSpeed: 0,
      error:
        `Unknown target "${opts.target}". Must be a COCO class name (e.g., "cell phone", "chair", "bottle"). ` +
        `Supported: ${COCO_CLASSES.join(", ")}.`,
    };
  }

  const safety = config.safety ?? {};
  const maxAngular = safety.maxAngularVelocity ?? 1.5;
  const requested = opts.angularSpeed ?? find.defaultAngularSpeed;
  const requestedSpeed = Math.max(0.05, Math.min(maxAngular, requested));
  const clockwise = opts.clockwise ?? true;
  const angularZ = clockwise ? -requestedSpeed : requestedSpeed;
  const timeoutMs = Math.max(
    1000,
    (opts.timeoutSeconds ?? find.defaultTimeoutSeconds) * 1000,
  );
  const minConfidence = opts.minConfidence ?? find.defaultMinConfidence;

  const detector = new ObjectDetector({ scoreThreshold: minConfidence });
  await detector.load();

  const cmdVelTopic = resolveCmdVelTopic(config, find.cmdVelTopic);
  const colorTopic = resolveCameraSubscribeTopic(config, find.cameraTopic);
  const messageType = find.cameraMessageType === "Image" ? IMAGE_TYPE : COMPRESSED_IMAGE_TYPE;

  const startedAt = Date.now();
  let rotating = false;
  let result: FindObjectResult["detection"] | undefined;

  const publishTwist = async (linearX: number, angZ: number) => {
    try {
      await transport.publish({
        topic: cmdVelTopic,
        type: "geometry_msgs/msg/Twist",
        msg: { linear: { x: linearX, y: 0, z: 0 }, angular: { x: 0, y: 0, z: angZ } },
      });
    } catch {
      // best-effort; loop will retry
    }
  };

  try {
    await publishTwist(0, angularZ);
    rotating = true;

    const deadline = startedAt + timeoutMs;
    while (Date.now() < deadline && !result) {
      // Keep the rotation alive in case the robot times out cmd_vel commands.
      await publishTwist(0, angularZ);

      const frame = await snapshotOnce(
        transport,
        colorTopic,
        messageType,
        find.snapshotTimeoutMs,
      ).catch(() => null);
      if (frame) {
        const det = await detector.detectClass(frame, classId);
        if (det.detections.length > 0) {
          const best = det.detections.reduce((a, b) => (a.confidence > b.confidence ? a : b));
          result = {
            confidence: best.confidence,
            cx: best.cx,
            cy: best.cy,
            width: best.width,
            height: best.height,
            imageWidth: det.width,
            imageHeight: det.height,
            horizontalOffset: (best.cx - det.width / 2) / (det.width / 2),
          };
          break;
        }
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(find.pollIntervalMs, remaining));
    }
  } finally {
    if (rotating) await publishTwist(0, 0);
    await detector.dispose().catch(() => {});
  }

  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  return {
    found: !!result,
    target: opts.target,
    classId,
    elapsedSeconds,
    rotationDirection: clockwise ? "clockwise" : "counterclockwise",
    angularSpeed: requestedSpeed,
    detection: result,
  };
}

async function snapshotOnce(
  transport: RosTransport,
  topic: string,
  messageType: string,
  timeoutMs: number,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const sub = transport.subscribe(
      { topic, type: messageType },
      (msg: Record<string, unknown>) => {
        clearTimeout(timer);
        sub.unsubscribe();
        try {
          const buffer = decodeImageMessage(msg);
          resolve(buffer);
        } catch {
          resolve(null);
        }
      },
    );
    const timer = setTimeout(() => {
      sub.unsubscribe();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Extract a JPEG/PNG-encoded buffer from a sensor_msgs/Image or CompressedImage
 * plain-object message. Handles base64 strings and number-array byte payloads.
 * For raw `sensor_msgs/Image` we still pass the bytes to sharp — sharp will fail
 * on raw rgb8 buffers, in which case the caller should switch cameraMessageType.
 */
function decodeImageMessage(msg: Record<string, unknown>): Buffer {
  const data = msg["data"];
  if (typeof data === "string") {
    return Buffer.from(data, "base64");
  }
  if (Array.isArray(data)) {
    return Buffer.from(data as number[]);
  }
  if (data && typeof (data as { byteLength?: number }).byteLength === "number") {
    return Buffer.from(data as ArrayBufferLike);
  }
  throw new Error("No image data in camera message");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCmdVelTopic(config: AgenticROSConfig, override: string): string {
  const raw = override.trim() || (config.teleop?.cmdVelTopic ?? "").trim() || "/cmd_vel";
  const namespaced = toNamespacedTopic(config, raw);
  const match = namespaced.match(/^\/([^/]+)\/cmd_vel$/i);
  const segment = match?.[1] ?? "";
  if (match && !segment.toLowerCase().startsWith("robot")) {
    return `/robot${segment.replace(/-/g, "")}/cmd_vel`;
  }
  return namespaced;
}
