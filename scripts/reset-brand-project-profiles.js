#!/usr/bin/env node
/**
 * Thin CLI wrapper around storage reset for brand profiles.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const {
  normalizeProjectBrandName,
  resetBrandProjectProfiles,
} = require("../src/project-profile-bridge");
const {
  readUserProjectProfiles,
  readProjects,
  writeUserProjectProfiles,
} = require("../src/storage");

const { KEY_TO_JSON_FILE } = require("../src/storage/constants");
const { DATA_DIR } = require("../src/storage/paths");
const fs = require("fs");

function readProjectsData() {
  return readProjects();
}

function parseArgs(argv) {
  const args = { brand: "", apply: false, listBrands: false };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (token === "--list-brands") {
      args.listBrands = true;
      continue;
    }
    if (token === "--brand") {
      args.brand = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token.startsWith("--brand=")) {
      args.brand = token.slice("--brand=".length).trim();
    }
  }
  return args;
}

function listBrands() {
  const projects = readProjectsData().projects || [];
  const byName = new Map();
  for (const project of projects) {
    const key = normalizeProjectBrandName(project.name);
    if (!key) continue;
    const bucket = byName.get(key) || [];
    bucket.push(project);
    byName.set(key, bucket);
  }

  if (!byName.size) {
    console.log("Проектов в projects.json нет.");
    return;
  }

  console.log("Бренды (по названию проекта, без учёта регистра):\n");
  for (const [key, items] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  "${items[0].name}" → ${items.length} projectId у организаторов:`);
    for (const project of items) {
      console.log(`    - ${project.id} (ownerId ${project.ownerId ?? "?"})`);
    }
    console.log("");
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (args.listBrands) {
    listBrands();
    return;
  }

  if (!args.brand) {
    console.error("Укажите бренд: --brand Pokerdom");
    console.error("Список брендов: node scripts/reset-brand-project-profiles.js --list-brands");
    process.exit(1);
  }

  const dryRun = !args.apply;
  if (dryRun) {
    console.log("Режим просмотра (без записи). Добавьте --apply чтобы применить.\n");
  } else {
    const timestamp = Date.now();
    for (const fileName of Object.values(KEY_TO_JSON_FILE)) {
      const source = path.join(DATA_DIR, fileName);
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, `${source}.bak-${timestamp}`);
      }
    }
    console.log(`JSON backups (if present): data/*.json.bak-${timestamp}\n`);
  }

  const result = resetBrandProjectProfiles(args.brand, {
    readUserProjectProfiles,
    readProjects: readProjectsData,
    writeUserProjectProfiles,
    dryRun,
  });

  if (!result.projectIds.length) {
    console.log(`Проекты с названием "${args.brand}" не найдены.`);
    console.log("Запустите --list-brands чтобы увидеть доступные названия.");
    process.exit(1);
  }

  console.log(`Бренд: ${result.brandName} (${result.normalizedBrand})`);
  console.log("ProjectId в projects.json:");
  for (const project of result.matchedProjects) {
    console.log(`  - ${project.id} · ${project.name} · ownerId ${project.ownerId ?? "?"}`);
  }
  console.log(`\nПользователей затронуто: ${result.usersTouched}`);
  console.log(`Записей projects.* удалено: ${result.entriesRemoved}`);
  console.log(
    dryRun
      ? "\nНичего не записано. Для сброса: node scripts/reset-brand-project-profiles.js --brand \"...\" --apply"
      : "\nГотово. Удалены только блоки projects[projectId] для этого бренда.",
  );
  console.log("\nНе затронуто: draws.json, списки participantIds, победы, meta пользователей.");
}

main();
