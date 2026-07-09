# /find

```bash
npx agenticros skills install @agenticros/find
```

Find Object skill for [AgenticROS](https://github.com/agenticros/agenticros): the robot rotates in place until it sees a target object in the camera feed, then stops.

## What it does

- **Behavior**: One-shot search. The skill rotates the robot in place (clockwise by default) and runs **YOLOv8n** on each captured camera frame. As soon as it detects an instance of the requested COCO class above a confidence threshold, it stops the robot and returns the bounding box plus the horizontal offset of the object from image center.
- **Targets**: Any of the 80 COCO classes — e.g. `bottle`, `cup`, `vase`, `chair`, `cell phone`, `laptop`, `bowl`, `book`, `tv`, `couch`. Common aliases (`phone`, `tv`/`television`, `sofa`, `plant`, `bike`) are accepted.
- **No ROS2 node required**: Detection runs entirely inside the OpenClaw gateway process. The skill subscribes to the camera topic via the AgenticROS transport and publishes `geometry_msgs/Twist` to `cmd_vel`.
- **Stops on success or timeout**: If the timeout elapses without detection, the skill stops the robot and returns `found: false` with the elapsed time.
- **Tools**:
  - **`find_object`** — Rotate and search for a target object. Returns whether it was found, confidence, bounding box, and horizontal offset (`-1` left edge, `0` center, `+1` right edge).
- **Config**: All options live under **`config.skills.find`** (see [Config options](#config-options-configskillsfind)).

## Install and run

1. **Install the skill** where the OpenClaw gateway can load it:
   - **Option A (recommended)**: Add to AgenticROS config as a package name:
     - In OpenClaw config, under `plugins.entries.agenticros.config`, set:
       - `skillPackages`: `["/find"]`
     - Install the package in the same environment as the gateway (e.g. `pnpm add /find` in the gateway app).
   - **Option B**: Clone this repo into a directory and add that directory to `skillPaths`:
     - `skillPaths`: `["/path/to//find"]`
     - Run `pnpm install` and `pnpm build` in this repo.
2. **Configure** the skill in the same config under `skills.find` (see [Config options](#config-options-configskillsfind)).
3. **Restart the OpenClaw gateway** so the plugin loads the skill.
4. In chat, use natural language: e.g. _"find the bottle"_, _"look for a chair"_, _"locate my phone"_. The agent will call `find_object` with the appropriate target.

## First-run model download

On its first call, the skill downloads `yolov8n.onnx` (~6 MB) from the public Ultralytics mirror to `~/.agenticros/models/yolov8n.onnx`. Subsequent calls reuse the cached file.

To override:
- `AGENTICROS_YOLOV8_MODEL` — absolute path to a local `.onnx` file.
- `AGENTICROS_YOLOV8_URL` — alternative download URL.

## Project structure

| Path | Purpose |
|------|---------|
| `src/index.ts` | Entry point; exports `registerSkill(api, config, context)`. |
| `src/config.ts` | Find skill config slice: reads `config.skills.find` and applies defaults. |
| `src/types.ts` | Local skill API types (matches what the AgenticROS plugin passes at runtime). |
| `src/coco-classes.ts` | COCO 80-class names + common aliases. |
| `src/detector.ts` | YOLOv8n ONNX wrapper (CPU). |
| `src/find-object.ts` | Rotate-and-detect loop: publishes `cmd_vel`, samples frames, stops on hit/timeout. |
| `src/tools/find-object.ts` | Registers the `find_object` tool. |

The skill gets **transport** from the plugin via **context**:

- `context.getTransport()` — ROS2 transport (subscribe/publish).
- `context.logger` — Plugin logger.

Config is the full AgenticROS config; the skill only uses `config.skills.find`, plus `config.robot.namespace` / `config.teleop.cmdVelTopic` / `config.safety.maxAngularVelocity` for topic resolution and safety clamping.

## Config options (config.skills.find)

| Option | Description |
|--------|-------------|
| `cameraTopic` | Camera image topic (default `/camera/camera/color/image_raw/compressed`). Resolved against the robot namespace. |
| `cameraMessageType` | `"CompressedImage"` (default) or `"Image"`. |
| `cmdVelTopic` | Override `cmd_vel` topic (default: from teleop or robot namespace). |
| `defaultAngularSpeed` | Default rotation speed in rad/s when the caller omits it (default `0.3`). Clamped to `safety.maxAngularVelocity`. |
| `defaultTimeoutSeconds` | Default timeout in seconds when the caller omits it (default `30`). |
| `defaultMinConfidence` | Default minimum YOLO confidence to accept a detection (default `0.5`). |
| `pollIntervalMs` | Time between camera frame samples (default `500`). |
| `snapshotTimeoutMs` | Per-frame camera subscribe timeout (default `3000`). |

## Tool: `find_object`

| Parameter | Type | Description |
|-----------|------|-------------|
| `target` | string (required) | COCO class name (e.g. `"bottle"`, `"cup"`, `"vase"`, `"chair"`, `"cell phone"`). Aliases accepted. |
| `angular_speed` | number | Rotation speed in rad/s (default from config). Clamped to `safety.maxAngularVelocity`. |
| `clockwise` | boolean | Rotate clockwise (default `true`). Set `false` for counterclockwise. |
| `timeout_seconds` | number | Give up after this many seconds (default from config). |
| `min_confidence` | number | Minimum detection confidence to accept (default from config). |

**Returns** an object with `found`, `target`, `classId`, `elapsedSeconds`, `rotationDirection`, `angularSpeed`, and (when found) a `detection` block: `confidence`, `cx`, `cy`, `width`, `height`, `imageWidth`, `imageHeight`, `horizontalOffset`.

## Contract summary

- **Package**: `package.json` has `"agenticrosSkill": true` and a `main` entry that exports **`registerSkill(api, config, context)`**.
- **Config**: Skill-specific options live under **`config.skills.find`**. The skill validates and defaults its own slice.
- **Context**: Use **`context.getTransport()`** for ROS2 and **`context.logger`** for logging.
- **Registration**: Call **`api.registerTool(...)`** inside `registerSkill`. Depend only on the public skill API and types exported by `@agenticros/core`.

For the full contract and how to create a third-party skill, see [docs/skills.md](https://github.com/agenticros/agenticros/blob/main/docs/skills.md) in the AgenticROS repo, and use [/followme](https://github.com/agenticros//followme) as the reference template.

## Acknowledgements

YOLOv8n model from [Ultralytics](https://github.com/ultralytics/ultralytics).
