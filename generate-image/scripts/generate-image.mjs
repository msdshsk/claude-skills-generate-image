#!/usr/bin/env node

/**
 * Gemini Image Generation Script
 * Zero external dependencies — uses Node.js built-in crypto and fetch.
 *
 * All models use Vertex AI endpoint (data NOT used for training).
 *
 * Usage:
 *   node generate-image.mjs [options]
 *
 * Required environment variable:
 *   GEMINI_SECRET_PATH  — path to a GCP service-account JSON key file
 *
 * Options:
 *   --prompt <text>          Text prompt for image generation (required)
 *   --output <path>          Output file path (default: generated_image.png)
 *   --model <id>             Model ID (default: gemini-3.1-flash-image-preview)
 *   --aspect-ratio <ratio>   1:1, 16:9, 9:16, 3:4, 4:3, 3:2, 2:3, 4:5, 5:4, 21:9
 *   --image-size <size>      512, 1K, 2K, 4K
 *   --temperature <n>        0.0–2.0 (default: 1.0)
 *   --top-p <n>              0.0–1.0 (default: 0.95)
 *   --response-modalities <m> Comma-separated: TEXT,IMAGE (default: IMAGE)
 *   --reference-image <path> Path(s) to reference image(s), comma-separated
 *   --region <region>        GCP region for Vertex AI (default: global)
 *   --config <json>          JSON string with all options
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Endpoint info (Vertex AI only)
// ---------------------------------------------------------------------------

function getEndpointInfo() {
  return {
    type: "vertex",
    label: "Vertex AI (data NOT used for training)",
  };
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--")) {
      const name = key.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[name] = value;
    }
  }
  return args;
}

function buildConfig(raw) {
  let config = {};
  if (raw.config) {
    try {
      config = JSON.parse(raw.config);
    } catch (e) {
      console.error("Error: --config must be valid JSON");
      process.exit(1);
    }
  }

  return {
    prompt: raw.prompt ?? config.prompt,
    output: raw.output ?? config.output ?? "generated_image.png",
    model: raw.model ?? config.model ?? "gemini-3.1-flash-image-preview",
    aspectRatio: raw["aspect-ratio"] ?? config.aspectRatio,
    imageSize: raw["image-size"] ?? config.imageSize,
    temperature: parseFloat(raw.temperature ?? config.temperature ?? "1.0"),
    topP: parseFloat(raw["top-p"] ?? config.topP ?? "0.95"),
    responseModalities: (raw["response-modalities"] ?? config.responseModalities ?? "IMAGE")
      .split(",")
      .map((s) => s.trim().toUpperCase()),
    referenceImages: (raw["reference-image"] ?? config.referenceImages ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    region: raw.region ?? config.region ?? "global",
  };
}

// ---------------------------------------------------------------------------
// Google OAuth2 — service-account JWT → access token
// ---------------------------------------------------------------------------

function loadServiceAccount() {
  const secretPath = process.env.GEMINI_SECRET_PATH;
  if (!secretPath) {
    console.error("Error: GEMINI_SECRET_PATH environment variable is not set");
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(resolve(secretPath), "utf-8"));
  } catch (e) {
    console.error(`Error: Cannot read service account JSON at ${secretPath}: ${e.message}`);
    process.exit(1);
  }
}

function createJwt(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };

  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const unsigned = `${encode(header)}.${encode(payload)}`;

  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, "base64url");

  return `${unsigned}.${signature}`;
}

async function getAccessToken(sa) {
  const jwt = createJwt(sa);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Error: Failed to obtain access token: ${res.status} ${text}`);
    process.exit(1);
  }

  const data = await res.json();
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Build API request
// ---------------------------------------------------------------------------

function buildApiUrl(config, sa) {
  const host = config.region === "global"
    ? "aiplatform.googleapis.com"
    : `${config.region}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${sa.project_id}/locations/${config.region}/publishers/google/models/${config.model}:generateContent`;
}

function buildRequestBody(config) {
  const parts = [];

  // Reference images first
  for (const imgPath of config.referenceImages) {
    try {
      const imgData = readFileSync(resolve(imgPath));
      const base64 = imgData.toString("base64");
      const ext = imgPath.split(".").pop().toLowerCase();
      const mimeMap = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
      };
      parts.push({
        inlineData: {
          mimeType: mimeMap[ext] || "image/png",
          data: base64,
        },
      });
    } catch (e) {
      console.error(`Warning: Cannot read reference image ${imgPath}: ${e.message}`);
    }
  }

  // Text prompt
  parts.push({ text: config.prompt });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: config.responseModalities,
      temperature: config.temperature,
      topP: config.topP,
      candidateCount: 1,
    },
  };

  // Image config (only add if there are image-specific settings)
  const imageConfig = {};
  if (config.aspectRatio) imageConfig.aspectRatio = config.aspectRatio;
  if (config.imageSize) imageConfig.imageSize = config.imageSize;

  if (Object.keys(imageConfig).length > 0) {
    body.generationConfig.imageConfig = imageConfig;
  }

  return body;
}

// ---------------------------------------------------------------------------
// Call API & save result
// ---------------------------------------------------------------------------

async function generateImage(config) {
  const sa = loadServiceAccount();
  const endpointInfo = getEndpointInfo();

  console.error(`Model: ${config.model}`);
  console.error(`Endpoint: ${endpointInfo.label}`);
  console.error(`Region: ${config.region}`);

  console.error(`Authenticating as ${sa.client_email}...`);
  const token = await getAccessToken(sa);

  const url = buildApiUrl(config, sa);
  const body = buildRequestBody(config);

  console.error(`Prompt: ${config.prompt.substring(0, 100)}${config.prompt.length > 100 ? "..." : ""}`);

  let res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  // Fallback: if -preview model returns 404, try without -preview suffix
  if (res.status === 404 && config.model.endsWith("-preview")) {
    const fallbackModel = config.model.replace(/-preview$/, "");
    console.error(`Model ${config.model} returned 404. Trying ${fallbackModel}...`);
    config.model = fallbackModel;
    const fallbackUrl = buildApiUrl(config, sa);
    res = await fetch(fallbackUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`Error: API request failed: ${res.status}`);
    console.error(text);
    process.exit(1);
  }

  const data = await res.json();

  // Extract images and text from response
  const candidates = data.candidates || [];
  if (candidates.length === 0) {
    console.error("Error: No candidates in response");
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const parts = candidates[0].content?.parts || [];
  let imageCount = 0;
  const textParts = [];

  for (const part of parts) {
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData) {
      const ext = inlineData.mimeType === "image/jpeg" || inlineData.mime_type === "image/jpeg" ? ".jpg" : ".png";
      let outputPath = config.output;

      // If multiple images, append index
      if (imageCount > 0) {
        const base = outputPath.replace(/\.[^.]+$/, "");
        const origExt = outputPath.match(/\.[^.]+$/)?.[0] || ext;
        outputPath = `${base}_${imageCount}${origExt}`;
      }

      const imageBuffer = Buffer.from(inlineData.data, "base64");
      writeFileSync(resolve(outputPath), imageBuffer);
      console.error(`Saved: ${resolve(outputPath)} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
      imageCount++;
    } else if (part.text) {
      textParts.push(part.text);
    }
  }

  if (imageCount === 0) {
    console.error("Warning: No image was generated in the response");
    if (textParts.length > 0) {
      console.error("Text response:", textParts.join("\n"));
    }
    console.error("Full response:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  // Output summary to stdout as JSON
  const result = {
    success: true,
    imagesGenerated: imageCount,
    output: resolve(config.output),
    model: config.model,
    endpoint: endpointInfo.type,
    region: config.region,
  };
  if (textParts.length > 0) {
    result.text = textParts.join("\n");
  }
  console.log(JSON.stringify(result, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const rawArgs = parseArgs(process.argv);

if (rawArgs.help) {
  console.log(`Usage: node generate-image.mjs --prompt <text> [options]

Required:
  --prompt <text>             Text prompt for image generation

Options:
  --output <path>             Output file path (default: generated_image.png)
  --model <id>                Model ID (default: gemini-3.1-flash-image-preview)
  --aspect-ratio <ratio>      1:1, 16:9, 9:16, 3:4, 4:3, 3:2, 2:3, 4:5, 5:4, 21:9
  --image-size <size>         512, 1K, 2K, 4K
  --temperature <n>           0.0–2.0 (default: 1.0)
  --top-p <n>                 0.0–1.0 (default: 0.95)
  --response-modalities <m>   Comma-separated: TEXT,IMAGE (default: IMAGE)
  --reference-image <path>    Reference image path(s), comma-separated
  --region <region>           GCP region for Vertex AI (default: global)
  --config <json>             JSON string with all options

Models:
  gemini-3.1-flash-image-preview      Nano Banana 2 (recommended)
  gemini-3-pro-image-preview    Nano Banana Pro

Environment:
  GEMINI_SECRET_PATH          Path to GCP service-account JSON key file`);
  process.exit(0);
}

const config = buildConfig(rawArgs);

if (!config.prompt) {
  console.error("Error: --prompt is required");
  process.exit(1);
}

generateImage(config).catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
