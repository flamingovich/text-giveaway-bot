#!/usr/bin/env node
/**
 * Перенос кошельков Pokerdom со старых project_* ключей на brand_pokerdom_{ownerId}.
 *
 * Usage:
 *   node scripts/migrate-pokerdom-legacy-profiles.js
 *   node scripts/migrate-pokerdom-legacy-profiles.js --apply
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { migratePokerdomLegacyProfiles, LEGACY_POKERDOM_PROJECT_OWNERS } = require("../src/project-profile-bridge");
const {
  readUserProjectProfiles,
  readProjects,
  readData,
  readArchivedDraws,
  writeUserProjectProfiles,
} = require("../src/storage");

function parseArgs(argv) {
  return { apply: argv.includes("--apply") };
}

function main() {
  const { apply } = parseArgs(process.argv);
  const dryRun = !apply;

  if (dryRun) {
    console.log("Режим просмотра (без записи). Добавьте --apply чтобы применить.\n");
  }

  console.log("Legacy Pokerdom projectId → ownerId:");
  for (const [projectId, ownerId] of Object.entries(LEGACY_POKERDOM_PROJECT_OWNERS)) {
    console.log(`  ${projectId} → ${ownerId}`);
  }
  console.log("");

  const result = migratePokerdomLegacyProfiles({
    readUserProjectProfiles,
    readProjects,
    readData,
    readArchivedDraws,
    writeUserProjectProfiles: apply ? writeUserProjectProfiles : undefined,
    dryRun,
  });

  console.log(`Пользователей просмотрено: ${result.usersScanned}`);
  console.log(`Пользователей обновлено: ${result.usersTouched}`);
  console.log(`Brand-профилей создано: ${result.brandProfilesCreated}`);
  console.log(`Brand-профилей обновлено: ${result.brandProfilesUpdated}`);
  console.log(`Пропущено (другой кошелёк уже есть): ${result.skippedExistingWallet}`);
  console.log(`Пропущено (нет legacy-кошелька): ${result.skippedNoSource}`);

  if (result.samples.length) {
    console.log("\nПримеры:");
    for (const sample of result.samples) {
      console.log(`  user ${sample.userId}: ${sample.from} → ${sample.to} (${sample.wallet})`);
    }
  }

  console.log(
    dryRun
      ? "\nНичего не записано. Для применения: node scripts/migrate-pokerdom-legacy-profiles.js --apply"
      : "\nГотово.",
  );
}

main();
