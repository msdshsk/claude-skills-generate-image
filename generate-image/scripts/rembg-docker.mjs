#!/usr/bin/env node

/**
 * rembg Docker wrapper — background removal via containerized rembg
 *
 * Usage:
 *   node rembg-docker.mjs --input <path> --output <path> [options]
 *
 * Options:
 *   --input <path>       Input image file (required)
 *   --output <path>      Output PNG with transparent background (required)
 *   --model <name>       rembg model: u2net (default), u2netp, isnet-general-use, silueta
 *   --alpha-matting       Enable alpha matting for finer edges (hair, fur)
 *   --only-mask           Output mask only (white=foreground, black=background)
 *   --bgcolor <R,G,B,A>  Replace background with color (e.g., 255,255,255,255 for white)
 *
 * The script automatically builds the Docker image on first run.
 */

import { execSync, execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGE_NAME = "generate-image-rembg";
const DOCKERFILE_DIR = resolve(__dirname, "..", "docker");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf-8", ...opts }).trim();
}

function imageExists() {
  try {
    run(`docker image inspect ${IMAGE_NAME} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

function dockerAvailable() {
  try {
    run("docker info 2>/dev/null");
    return true;
  } catch {
    return false;
  }
}

function buildImage() {
  console.error(`Building Docker image '${IMAGE_NAME}'...`);
  console.error("This will download rembg + u2net model (~500MB). First run only.");
  execSync(`docker build -t ${IMAGE_NAME} ${DOCKERFILE_DIR}`, {
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.error(`Docker image '${IMAGE_NAME}' ready.`);
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
      const value =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[name] = value;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(`Usage: node rembg-docker.mjs --input <path> --output <path> [options]

Required:
  --input <path>         Input image file
  --output <path>        Output PNG file (transparent background)

Options:
  --model <name>         u2net (default), u2netp, isnet-general-use, silueta
  --alpha-matting        Enable alpha matting for finer edges
  --only-mask            Output foreground mask only
  --bgcolor <R,G,B,A>   Replace background with color (e.g., 255,255,255,255)`);
    process.exit(0);
  }

  if (!args.input) {
    console.error("Error: --input is required");
    process.exit(1);
  }
  if (!args.output) {
    console.error("Error: --output is required");
    process.exit(1);
  }

  // Check Docker
  if (!dockerAvailable()) {
    console.error("Error: Docker is not available.");
    console.error("Please install Docker and ensure the daemon is running.");
    console.error("  https://docs.docker.com/get-docker/");
    process.exit(1);
  }

  // Build image if needed
  if (!imageExists()) {
    buildImage();
  }

  const inputPath = resolve(args.input);
  const outputPath = resolve(args.output);

  if (!existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Resolve real paths for Docker bind mounts (handles symlinks, WSL paths)
  const inputDir = dirname(realpathSync(inputPath));
  const outputDir = dirname(resolve(outputPath));
  const inputFile = basename(inputPath);
  const outputFile = basename(outputPath);

  // Build docker run command
  const dockerArgs = [
    "run", "--rm",
    "-v", `${inputDir}:/input:ro`,
    "-v", `${outputDir}:/output`,
    IMAGE_NAME,
    "i",
  ];

  // rembg options
  if (args.model) {
    dockerArgs.push("-m", args.model);
  }
  if (args["alpha-matting"]) {
    dockerArgs.push("-a");
  }
  if (args["only-mask"]) {
    dockerArgs.push("-om");
  }
  if (args.bgcolor) {
    dockerArgs.push("-bgc", args.bgcolor);
  }

  // Input and output paths inside container
  dockerArgs.push(`/input/${inputFile}`, `/output/${outputFile}`);

  console.error(`Input:  ${inputPath}`);
  console.error(`Output: ${outputPath}`);
  console.error(`Model:  ${args.model || "u2net"}`);

  try {
    execFileSync("docker", dockerArgs, { stdio: ["pipe", "inherit", "inherit"] });

    if (!existsSync(outputPath)) {
      console.error("Error: Output file was not created");
      process.exit(1);
    }

    const { statSync } = await import("node:fs");
    const stat = statSync(outputPath);

    const result = {
      success: true,
      input: inputPath,
      output: outputPath,
      model: args.model || "u2net",
      size: stat.size,
      alphaMatting: !!args["alpha-matting"],
    };

    console.error(`Done: ${outputPath} (${(stat.size / 1024).toFixed(1)} KB)`);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`Error: rembg failed — ${e.message}`);
    process.exit(1);
  }
}

main();
