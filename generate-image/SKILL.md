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

### 1. Decompose the user's request

Every image request must be decomposed into three separate elements. If any element is unclear, **ask the user before proceeding**.

| Element | What it determines | Reflected in |
|---------|-------------------|--------------|
| **Content** — What to actually draw | The subject, scene, style, mood, composition | → Prompt text |
| **Usage** — Where the image will be placed | The container/context it lives in | → Parameters (aspect-ratio, image-size) |
| **Constraints** — Special requirements | Text overlay space, transparency, color restrictions, layout zones | → Prompt composition instructions |

**Decomposition examples:**

| User says | Content | Usage | Constraints |
|-----------|---------|-------|-------------|
| "Webヘッダ用の画像を作って" | (unclear — ask what scene/subject) | Web header background | Likely needs open space for text overlay |
| "書籍のカバーデザインを作って" | (unclear — ask what scene/theme) | Book cover artwork | Needs space for title/author text |
| "猫のアイコンを作って" | Cat illustration, simple/iconic | App icon or UI icon | Clean edges, works at small sizes |
| "この立ち絵で海辺を走るシーンを" | Character running at seaside | (ask — game asset? wallpaper?) | Character consistency with reference |

**Key question to always ask:** "What is the artwork itself?" — Separate from its container.

### 2. Select model

- If Japanese text rendering or advanced quality is needed → preview model required → **ask user permission first** (training risk).
- Otherwise → use default GA model.

### 3. Craft a content-only prompt

#### Critical rule: NEVER describe the container in the prompt

The prompt must describe **only the artwork content** — what the viewer sees in the image. The usage/container determines parameters, NOT prompt text.

**Forbidden words in prompts** (these cause Gemini to generate UI mockups or physical objects instead of artwork):
- `header`, `banner`, `hero image`, `website`, `web page`, `landing page`
- `book cover`, `cover design`, `book jacket`
- `app icon`, `UI element`, `button`, `navigation`, `menu`
- `poster layout`, `flyer`, `brochure`
- `mockup`, `template`, `frame`

Instead, describe the **visual content** that would appear in those containers.

**Transformation examples:**

| User intent | NG prompt (container-polluted) | OK prompt (content-only) |
|-------------|-------------------------------|--------------------------|
| Webヘッダ背景 | "A web header banner for a literary site with a cat" | "Ink wash painting of a dignified cat silhouette gazing at distant mountains, traditional Japanese aesthetic, muted earthy tones, wide panoramic composition with generous open space on the right" |
| 書籍カバー | "A book cover design for a fantasy novel" | "Dark enchanted forest with bioluminescent mushrooms, a narrow stone path winding into golden light, mysterious atmosphere, painterly fantasy illustration style, vertical composition with open sky area at top" |
| アプリアイコン | "An app icon for a weather app with sun" | "Stylized golden sun with radiating rays, flat design, vivid orange-to-yellow gradient, centered composition on solid sky-blue background, clean geometric shapes" |
| ゲーム背景 | "A game background for an RPG" | "Vast medieval grassland with scattered ancient ruins, distant snow-capped mountains under a dramatic cloudy sky, painterly style with rich greens and warm golden hour lighting" |

#### Language rule

Write prompts in English. Only use the original language for proper nouns, titles, or text that must appear literally in the image (e.g., 「吾輩は猫である」).

#### Composition for constraints

When the usage requires space for text overlay or UI elements, express this as **composition instructions**, not container references:
- Need title space at top → "open sky area at top third of the composition"
- Need text space on right → "subject positioned on the left, with generous negative space on the right"
- Need center focus for icon → "centered composition, single subject, clean background"

#### Always include explicit exclusions

End every prompt with exclusions to prevent unwanted elements:
- `"no text, no typography, no labels, no watermarks"` (unless text is specifically requested)
- `"no UI elements, no frames, no borders, no mockup"` (for asset images)
- `"artwork only, single illustration"` (to prevent multi-panel or collage output)

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

Each example shows the decomposition (Content / Usage / Constraints) and the resulting prompt.

### Web Header Background

- **Content**: Abstract gradient artwork
- **Usage**: Web hero section background → `16:9`, `2K`
- **Constraints**: Needs text overlay space on left

```bash
node <script> --prompt "Smooth abstract gradient flowing from deep indigo to soft lavender, subtle geometric light streaks, atmospheric and modern, subject weight on the right side with generous open space on the left third. No text, no typography, no UI elements, artwork only." --aspect-ratio 16:9 --image-size 2K --temperature 0.8 --output assets/hero-bg.png
```

### Book Cover Artwork

- **Content**: Fantasy forest scene
- **Usage**: Book cover print → `2:3`, `2K`
- **Constraints**: Open area at top for title, bottom for author name

```bash
node <script> --prompt "Dark enchanted forest with bioluminescent mushrooms lining a narrow stone path, golden light glowing at the end of the path, mysterious and inviting atmosphere, painterly fantasy illustration style. Vertical composition with open misty sky area at the top third and a dark ground area at the bottom. No text, no typography, no frames, artwork only." --aspect-ratio 2:3 --image-size 2K --temperature 1.0 --output assets/book-cover-art.png
```

### App Icon

- **Content**: Stylized sun graphic
- **Usage**: App icon → `1:1`, `512`
- **Constraints**: Must read clearly at small sizes

```bash
node <script> --prompt "Stylized golden sun with clean radiating rays, flat design, vivid orange-to-yellow gradient, perfectly centered on solid sky-blue background, clean geometric shapes, minimal detail, bold and simple. No text, no labels, no borders, single graphic only." --aspect-ratio 1:1 --image-size 512 --temperature 0.3 --output assets/icon-weather.png
```

### Game Sprite

- **Content**: Pixel art warrior character
- **Usage**: Game sprite asset → `1:1`, `512`
- **Constraints**: Front-facing, clean edges

```bash
node <script> --prompt "Pixel art RPG warrior character, front-facing idle pose, 32x32 pixel style upscaled, steel armor with red cape, clean edges suitable for sprite sheet extraction, solid flat color background. No text, no frame, single character only." --aspect-ratio 1:1 --image-size 512 --temperature 0.5 --output sprites/warrior.png
```

### Japanese Text in Image (Preview — permission required)

- **Content**: Summer festival scene with Japanese title text
- **Usage**: Event promotional artwork → `3:4`, `2K`
- **Constraints**: Text 「夏祭り」 must render correctly

```bash
node <script> --prompt "Vibrant summer night sky filled with colorful fireworks, traditional Japanese festival stalls visible below, warm lantern glow. Large calligraphic text 「夏祭り」 prominently displayed in the upper center. Festive and nostalgic atmosphere, illustration style. No UI elements, no borders, artwork only." --model gemini-3-pro-image-preview --aspect-ratio 3:4 --image-size 2K --output assets/natsu-matsuri.png
```

### Character Scene Variation (with reference image)

- **Content**: Same character in a new scene
- **Usage**: (depends on project context)
- **Constraints**: Character consistency with reference

```bash
node <script> --prompt "The same girl from the reference image, running along a coastal road on a bright sunny day. Ocean on the left side, road stretching into the distance. Her hair and clothes flowing in the wind, dynamic running pose. Same outfit, hairstyle, and accessories as reference. Photorealistic style. No text, no UI elements, artwork only." --reference-image character_ref.png --aspect-ratio 16:9 --image-size 2K --output scenes/seaside-run.png
```
