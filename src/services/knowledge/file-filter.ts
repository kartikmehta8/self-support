import { basename } from "node:path";

export const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".cache",
  "out"
]);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".md",
  ".mdx",
  ".json",
  ".yml",
  ".yaml",
  ".sol",
  ".rs",
  ".go",
  ".py",
  ".css",
  ".scss",
  ".html",
  ".txt"
]);

export function shouldIndexFile(path: string): boolean {
  const file = basename(path);
  if (file === "package-lock.json" || file === "pnpm-lock.yaml" || file === "yarn.lock") {
    return false;
  }

  const lowerPath = path.toLowerCase();
  if (
    lowerPath.endsWith(".min.js") ||
    lowerPath.endsWith(".min.css") ||
    lowerPath.endsWith(".bundle.js") ||
    lowerPath.endsWith(".bundle.css") ||
    lowerPath.includes("/generated/") ||
    lowerPath.includes("/__generated__/") ||
    lowerPath.includes("/storybook-static/") ||
    lowerPath.includes("/public/assets/") ||
    lowerPath.includes("/assets/lottie/") ||
    lowerPath.includes("/assets/animations/")
  ) {
    return false;
  }

  const extension = path.slice(path.lastIndexOf("."));
  return TEXT_EXTENSIONS.has(extension);
}

export function looksMinified(path: string, content: string): boolean {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (extension !== ".js" && extension !== ".jsx" && extension !== ".css") {
    return false;
  }

  const lines = content.split(/\r?\n/);
  const longestLine = Math.max(...lines.map((line) => line.length));
  const averageLine = content.length / Math.max(lines.length, 1);

  return longestLine > 20_000 || averageLine > 2_000;
}
