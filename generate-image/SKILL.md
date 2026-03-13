---
name: generate-image
description: Generate images using Google Gemini image generation API. This skill should be used when the user requests image creation, asset generation, sprite creation, or any visual content generation task. Supports text-to-image, image-to-image (reference-based), and handles various use cases including web UI assets, game sprites, illustrations, and designs.
---

# Generate Image

## Overview

This skill generates images via the Gemini image generation API (Nano Banana family). It supports text-to-image generation, reference image-based generation, and fine-grained control over output parameters. Authentication uses a GCP service-account JSON key referenced by the `GEMINI_SECRET_PATH` environment variable.

## Important: Model Selection and Training Risk

Models are classified into two categories with different data handling policies:

| Category | Models | Training Risk | User Permission |
|----------|--------|---------------|-----------------|
| **GA** | `gemini-2.5-flash-image` | None (Vertex AI) | Not required |
| **Preview** | `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview` | **Data may be used for training** | **MUST obtain explicit user permission** |

**Before using any preview model, always inform the user:**
> "このモデル（{model名}）はpreview版のため、Generative Language API経由で実行されます。送信データがGoogleのモデル学習に使用される可能性があります。使用してよろしいですか？"

When the user has not granted permission or the content is sensitive/proprietary, default to the GA model `gemini-2.5-flash-image`.

For details on endpoint routing, see `references/endpoint-notes.md`.

## Script

`scripts/generate-image.mjs` — Node.js script with zero external dependencies.

```bash
node <skill-dir>/scripts/generate-image.mjs --prompt "<prompt>" [options]
```

## Workflow

### 0. Verify environment

Before any image generation, confirm the `GEMINI_SECRET_PATH` environment variable is set by running:

```bash
echo "$GEMINI_SECRET_PATH"
```

If it is empty or unset, inform the user:
> "画像生成にはGCPサービスアカウントのJSONキーが必要です。`GEMINI_SECRET_PATH` 環境変数にキーファイルのパスを設定してください。（例: `export GEMINI_SECRET_PATH=/path/to/service-account.json`）"

Do NOT proceed with image generation until this variable is confirmed.

### 1. Clarify the user's intent

Before generating, ensure the request is unambiguous. If any of the following are unclear, **ask the user before proceeding**:

- **What is being generated?** — Distinguish between "an image **of** X" vs "an image **to be used for** X". For example:
  - "ヘッダ画像を作って" → Does the user want a header UI mockup, or a background/asset image to place behind a header?
  - "アイコンを作って" → An icon graphic, or an app icon with rounded corners and specific dimensions?
- **Where will the image be used?** — Web background, game asset, print, social media, etc. This determines aspect ratio, size, and style.
- **Should the image contain text?** — If yes, what exact text? If no, ensure the prompt explicitly excludes UI elements like navigation bars, buttons, or placeholder text.
- **Style and mood** — If not specified, ask or infer from context (e.g., a game project likely wants illustrated/stylized, a corporate site likely wants clean/professional).

### 2. Select model

- If Japanese text rendering or advanced quality is needed → preview model required → **ask user permission first** (training risk).
- Otherwise → use default GA model.

### 3. Craft an effective prompt

**Language rule:** Write prompts in English. Only use the original language for proper nouns, titles, or text that must appear literally in the image (e.g., 「吾輩は猫である」). This produces the best results from Gemini.

**Accuracy rule:** Translate the user's intent precisely. Do not embellish or add elements the user did not request. Common pitfalls to avoid:
- User asks for "background image for a header" → Do NOT generate a full UI mockup with navigation. Generate only the background artwork.
- User asks for "a cat illustration" → Do NOT add text overlays or decorative frames unless requested.
- User asks for "a logo" → Generate only the logo mark, not a full page layout containing the logo.

Include in the prompt:
- Subject description (what to generate)
- Style direction (photorealistic, illustration, pixel art, flat design, etc.)
- Composition details (framing, perspective, layout)
- Color palette or mood if relevant
- **Explicit exclusions** when needed (e.g., "no text overlays", "no UI elements", "artwork only")
- For text that must appear in the image: specify the exact string and placement

### 4. Execute the script

Run the script with the chosen parameters. The script automatically routes to the correct endpoint based on the model.

### 5. Verify and iterate

Read the generated image file to verify the result. Adjust prompt or parameters and regenerate if needed.

### 6. Post-process if needed

If the generated image requires cropping, resizing, or format conversion, use `scripts/process-image.mjs`. **Always keep the original** and save processed versions as separate files.

**Dependency:** `sharp` must be globally installed. If not available, prompt the user to run `npm install -g sharp`.

```bash
node <skill-dir>/scripts/process-image.mjs --input <original> --output <processed> [options]
```

Common post-processing scenarios:

| Scenario | Command |
|----------|---------|
| Change aspect ratio (e.g., 16:9 → 9:16 for mobile) | `--crop-ratio 9:16` |
| Exact pixel crop for a specific slot | `--crop 1080x1920` |
| Downsize for web use | `--resize-width 1200` |
| PNG → JPEG for web (smaller filesize) | `--format jpeg --quality 85` |
| PNG → WebP for modern web | `--format webp --quality 80` |
| Combined: crop + resize + convert | `--crop-ratio 1:1 --resize-width 512 --format webp`|

## Parameters Reference

### --model

| Model ID | Category | Best For |
|----------|----------|----------|
| `gemini-2.5-flash-image` (default) | GA | Stable, no training risk |
| `gemini-3-pro-image-preview` | Preview | High quality, 4K, Japanese text |
| `gemini-3.1-flash-image-preview` | Preview | Latest quality, 4K, widest aspect ratios |

### --aspect-ratio

Select based on the intended use:

| Ratio | Use Case |
|-------|----------|
| `1:1` | Icons, avatars, profile images, square thumbnails |
| `16:9` | Web hero banners, desktop wallpapers, YouTube thumbnails |
| `9:16` | Mobile wallpapers, vertical stories, portrait posters |
| `4:3` | Presentation slides, traditional display content |
| `3:4` | Portrait photos, book covers |
| `3:2` | Standard photo aspect, landscape photography |
| `2:3` | Portrait photography |
| `4:5` | Instagram portrait posts |
| `5:4` | Landscape photography, print media |
| `21:9` | Ultra-wide banners, cinematic compositions |

### --image-size

| Size | Resolution | Best For |
|------|-----------|----------|
| `512` | Low | Quick previews, thumbnails, rapid iteration |
| `1K` | Medium | Web assets, UI elements |
| `2K` | High | High-quality illustrations, print-ready |
| `4K` | Ultra | Maximum detail (preview models only) |

### --temperature

Controls randomness/creativity. Range: 0.0–2.0 (default: 1.0)

- **0.2–0.5**: Consistent, predictable results. Use for UI assets, icons, sprites where uniformity matters.
- **0.8–1.2**: Balanced creativity. Good default for most generation tasks.
- **1.5–2.0**: High variation, experimental. Use for brainstorming, abstract art, exploring diverse styles.

### --top-p

Nucleus sampling parameter. Range: 0.0–1.0 (default: 0.95)

Typically leave at default. Lower values (0.7–0.8) to constrain output when combined with low temperature.

### --response-modalities

- `IMAGE` (default): Image-only output, best for most generation tasks.
- `TEXT,IMAGE`: Returns both text description and image. Use when the model's interpretation context is useful.

### --reference-image

Path(s) to reference image file(s), comma-separated. Use for:

- **Character consistency**: Provide a character reference to generate the same character in a new scene or pose.
- **Style transfer**: Provide a style reference to apply a visual style to a new subject.
- **Image editing**: Provide the original image and describe modifications in the prompt.

When using reference images, describe in the prompt what to do with the reference (e.g., "Generate this character sitting at a desk" or "Apply the art style of the reference image to a mountain landscape").

### --output

Output file path. Defaults to `generated_image.png`. Set a descriptive filename in the project context (e.g., `assets/hero-banner.png`, `sprites/player-idle.png`).

## Use Case Examples

### Web App Assets (GA model — no permission needed)

```bash
# Hero banner
node <script> --prompt "Modern gradient abstract background with soft blue and purple tones, minimal geometric shapes" --aspect-ratio 16:9 --image-size 2K --temperature 0.8 --output assets/hero-bg.png

# Icon
node <script> --prompt "Flat design settings gear icon, white on dark background, Material Design style" --aspect-ratio 1:1 --image-size 512 --temperature 0.3 --output assets/icon-settings.png
```

### Game Sprites (GA model — no permission needed)

```bash
node <script> --prompt "Pixel art RPG character warrior, front-facing, 32x32 style, transparent background" --aspect-ratio 1:1 --image-size 512 --temperature 0.5 --output sprites/warrior.png
```

### Japanese Text (Preview model — permission required)

```bash
node <script> --prompt "Japanese event poster with title 「夏祭り」 at top, fireworks background" --model gemini-3-pro-image-preview --aspect-ratio 3:4 --image-size 2K --output poster.png
```

### Character Scene Variations (with reference image)

```bash
node <script> --prompt "Generate this character sitting in a cozy café, warm lighting, same outfit" --reference-image character_ref.png --aspect-ratio 3:4 --image-size 2K --output scenes/cafe.png
```
