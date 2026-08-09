import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { summarizePixelDiff } from "./pixel-diff.mjs";
import {
  REFERENCE_ROUTES,
  REFERENCE_VIEWPORT,
  resolveVisualAuditPaths,
} from "./visual-audit-config.mjs";

const FRONTEND_ROOT = fileURLToPath(new URL("..", import.meta.url));
const paths = resolveVisualAuditPaths(FRONTEND_ROOT);
const threshold = Number(process.env.PIXEL_AUDIT_THRESHOLD ?? 16);

async function rgbaPixels(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

function assertDimensions(filePath, info) {
  if (
    info.width !== REFERENCE_VIEWPORT.width
    || info.height !== REFERENCE_VIEWPORT.height
    || info.channels !== 4
  ) {
    throw new Error(
      `${filePath} must be ${REFERENCE_VIEWPORT.width}x${REFERENCE_VIEWPORT.height} RGBA; got ${info.width}x${info.height}x${info.channels}`,
    );
  }
}

function diffPixels(reference, current) {
  const output = Buffer.alloc(reference.length);
  for (let offset = 0; offset < reference.length; offset += 4) {
    const changed = Math.max(
      Math.abs(reference[offset] - current[offset]),
      Math.abs(reference[offset + 1] - current[offset + 1]),
      Math.abs(reference[offset + 2] - current[offset + 2]),
    ) > threshold;
    if (changed) {
      output[offset] = 255;
      output[offset + 1] = 66;
      output[offset + 2] = 160;
      output[offset + 3] = 255;
    }
  }
  return output;
}

async function compareRoute(route) {
  const approvedPath = path.join(paths.approvedDir, `${route.name}.png`);
  const currentPath = path.join(paths.currentDir, `${route.name}.png`);
  const diffPath = path.join(paths.diffDir, `${route.name}.png`);
  const overlayPath = path.join(paths.overlayDir, `${route.name}.png`);
  const [approved, current] = await Promise.all([
    rgbaPixels(approvedPath),
    rgbaPixels(currentPath),
  ]);

  assertDimensions(approvedPath, approved.info);
  assertDimensions(currentPath, current.info);
  const metrics = summarizePixelDiff(approved.data, current.data, { threshold });

  await sharp(diffPixels(approved.data, current.data), {
    raw: { ...REFERENCE_VIEWPORT, channels: 4 },
  }).png().toFile(diffPath);

  const translucentCurrent = await sharp(currentPath)
    .removeAlpha()
    .ensureAlpha(0.5)
    .png()
    .toBuffer();
  await sharp(approvedPath)
    .composite([{ input: translucentCurrent, blend: "over" }])
    .png()
    .toFile(overlayPath);

  return {
    name: route.name,
    path: route.path,
    approvedPath,
    currentPath,
    diffPath,
    overlayPath,
    ...metrics,
  };
}

async function main() {
  await Promise.all([
    mkdir(paths.diffDir, { recursive: true }),
    mkdir(paths.overlayDir, { recursive: true }),
  ]);
  const routes = [];
  for (const route of REFERENCE_ROUTES) routes.push(await compareRoute(route));
  const report = {
    generatedAt: new Date().toISOString(),
    threshold,
    viewport: REFERENCE_VIEWPORT,
    routes,
  };
  await writeFile(paths.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
