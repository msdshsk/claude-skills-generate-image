#!/usr/bin/env node

/**
 * Image Post-Processing Script
 * Requires: sharp (npm install -g sharp)
 *
 * Usage:
 *   node process-image.mjs --input <path> [options]
 *
 * Operations (can be combined):
 *   --crop <WxH>            Crop to width x height (pixels), centered
 *   --crop-ratio <ratio>    Crop to aspect ratio (e.g., 9:16, 1:1), centered
 *   --resize <WxH>          Resize to width x height (pixels), fit inside
 *   --resize-width <n>      Resize to width, maintaining aspect ratio
 *   --resize-height <n>     Resize to height, maintaining aspect ratio
 *   --format <fmt>          Convert format: jpeg, png, webp, avif
 *   --quality <n>           Compression quality 1-100 (default: 85, for jpeg/webp/avif)
 *   --output <path>         Output file path (required)
 *   --input <path>          Input file path (required)
 */

import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Dependency check
// ---------------------------------------------------------------------------

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch (e) {
  // Fallback: try loading from global node_modules
  try {
    const { execSync } = await import("node:child_process");
    const globalRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    sharp = (await import(`${globalRoot}/sharp/lib/index.js`)).default;
  } catch (e2) {
    console.error("Error: 'sharp' module is not installed.");
    console.error("");
    console.error("Install it with:");
    console.error("  npm install -g sharp");
    console.error("");
    console.error("sharp is required for image cropping, resizing, and format conversion.");
    process.exit(1);
  }
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

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

async function processImage(args) {
  if (!args.input) {
    console.error("Error: --input is required");
    process.exit(1);
  }
  if (!args.output) {
    console.error("Error: --output is required");
    process.exit(1);
  }

  const inputPath = resolve(args.input);
  const outputPath = resolve(args.output);

  let pipeline = sharp(inputPath);
  const metadata = await pipeline.metadata();

  console.error(`Input: ${inputPath} (${metadata.width}x${metadata.height}, ${metadata.format})`);

  const operations = [];

  // Crop to aspect ratio (centered)
  if (args["crop-ratio"]) {
    const [rw, rh] = args["crop-ratio"].split(":").map(Number);
    if (!rw || !rh) {
      console.error("Error: --crop-ratio must be in format W:H (e.g., 9:16)");
      process.exit(1);
    }

    const targetRatio = rw / rh;
    const currentRatio = metadata.width / metadata.height;

    let cropWidth, cropHeight;
    if (currentRatio > targetRatio) {
      // Image is wider than target — crop width
      cropHeight = metadata.height;
      cropWidth = Math.round(cropHeight * targetRatio);
    } else {
      // Image is taller than target — crop height
      cropWidth = metadata.width;
      cropHeight = Math.round(cropWidth / targetRatio);
    }

    const left = Math.round((metadata.width - cropWidth) / 2);
    const top = Math.round((metadata.height - cropHeight) / 2);

    pipeline = pipeline.extract({ left, top, width: cropWidth, height: cropHeight });
    operations.push(`crop-ratio ${args["crop-ratio"]} → ${cropWidth}x${cropHeight}`);

    // Update effective dimensions for subsequent operations
    metadata.width = cropWidth;
    metadata.height = cropHeight;
  }

  // Crop to exact dimensions (centered)
  if (args.crop) {
    const [cw, ch] = args.crop.split("x").map(Number);
    if (!cw || !ch) {
      console.error("Error: --crop must be in format WxH (e.g., 1080x1920)");
      process.exit(1);
    }

    const left = Math.max(0, Math.round((metadata.width - cw) / 2));
    const top = Math.max(0, Math.round((metadata.height - ch) / 2));
    const width = Math.min(cw, metadata.width);
    const height = Math.min(ch, metadata.height);

    pipeline = pipeline.extract({ left, top, width, height });
    operations.push(`crop ${width}x${height}`);

    metadata.width = width;
    metadata.height = height;
  }

  // Resize
  if (args.resize) {
    const [rw, rh] = args.resize.split("x").map(Number);
    pipeline = pipeline.resize(rw, rh, { fit: "inside", withoutEnlargement: true });
    operations.push(`resize ${rw}x${rh}`);
  } else if (args["resize-width"]) {
    const w = parseInt(args["resize-width"]);
    pipeline = pipeline.resize(w, null, { withoutEnlargement: true });
    operations.push(`resize width=${w}`);
  } else if (args["resize-height"]) {
    const h = parseInt(args["resize-height"]);
    pipeline = pipeline.resize(null, h, { withoutEnlargement: true });
    operations.push(`resize height=${h}`);
  }

  // Format conversion
  const quality = parseInt(args.quality ?? "85");
  const format = args.format || outputPath.split(".").pop().toLowerCase();

  switch (format) {
    case "jpeg":
    case "jpg":
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      operations.push(`jpeg q=${quality}`);
      break;
    case "webp":
      pipeline = pipeline.webp({ quality });
      operations.push(`webp q=${quality}`);
      break;
    case "avif":
      pipeline = pipeline.avif({ quality });
      operations.push(`avif q=${quality}`);
      break;
    case "png":
      pipeline = pipeline.png({ compressionLevel: 9 });
      operations.push("png compressed");
      break;
    default:
      console.error(`Warning: Unknown format '${format}', outputting as-is`);
  }

  const outputBuffer = await pipeline.toBuffer();
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outputPath, outputBuffer);

  const outputMeta = await sharp(outputBuffer).metadata();

  console.error(`Operations: ${operations.join(" → ")}`);
  console.error(`Output: ${outputPath} (${outputMeta.width}x${outputMeta.height}, ${(outputBuffer.length / 1024).toFixed(1)} KB)`);

  // Stdout JSON result
  console.log(JSON.stringify({
    success: true,
    input: inputPath,
    output: outputPath,
    operations,
    dimensions: { width: outputMeta.width, height: outputMeta.height },
    size: outputBuffer.length,
    format: outputMeta.format,
  }, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv);

if (args.help) {
  console.log(`Usage: node process-image.mjs --input <path> --output <path> [options]

Required:
  --input <path>            Input image file
  --output <path>           Output image file

Crop:
  --crop-ratio <W:H>       Crop to aspect ratio, centered (e.g., 9:16, 1:1)
  --crop <WxH>             Crop to exact pixels, centered (e.g., 1080x1920)

Resize:
  --resize <WxH>           Resize to fit inside WxH
  --resize-width <n>       Resize to width, keep aspect ratio
  --resize-height <n>      Resize to height, keep aspect ratio

Format:
  --format <fmt>           jpeg, png, webp, avif (auto-detected from output extension)
  --quality <n>            Compression quality 1-100 (default: 85)

Dependency:
  npm install -g sharp`);
  process.exit(0);
}

processImage(args).catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
