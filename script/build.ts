import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, writeFile } from "fs/promises";

async function ensureMemoStub() {
  const stubDir = "node_modules/@solana-program/memo";
  await mkdir(stubDir, { recursive: true });
  await writeFile(
    `${stubDir}/index.mjs`,
    'export const getAddMemoInstruction = () => ({});\nexport const getAddMemoInstructionAsync = async () => ({});\n'
  );
  await writeFile(
    `${stubDir}/package.json`,
    JSON.stringify({
      name: "@solana-program/memo",
      version: "0.6.1",
      type: "module",
      main: "index.mjs",
      module: "index.mjs",
      exports: { ".": { import: "./index.mjs", default: "./index.mjs" } },
    })
  );
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("ensuring @solana-program/memo stub...");
  await ensureMemoStub();

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
