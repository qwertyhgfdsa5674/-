import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, "..");
const sourceDir = resolve(packageRoot, "src/db/migrations");
const targetDir = resolve(packageRoot, "dist/db/migrations");

if (!existsSync(sourceDir)) {
  throw new Error(`Migration source directory does not exist: ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true, force: true });
