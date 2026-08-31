#!/usr/bin/env node
// Works out who first brought each person to each project, from the whole
// history, and writes it into their profile. Read-only unless --apply.
//
// The answer is frozen on purpose: an attribution recomputed on every render
// changes as draws move to the archive, and a status that moves is not a
// status. Anything already attributed is left exactly as it is.
//
//   node scripts/backfill-project-attribution.js
//   node scripts/backfill-project-attribution.js --apply

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const {
  ensureStorage,
  readData,
  readArchivedDraws,
  readProjects,
  readUserProjectProfiles,
  writeUserProjectProfiles,
} = require("../src/storage");
const { resolveProjectId } = require("../src/project-identity");
const { computeFirstTouch, toProfilePatch, needsAttribution } = require("../src/project-attribution");

const APPLY = process.argv.includes("--apply");

function main() {
  ensureStorage();

  const live = readData().draws || [];
  const archived = readArchivedDraws().draws || [];
  const seen = new Set();
  const draws = [...live, ...archived].filter((draw) => {
    const id = String(draw.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const projects = readProjects().projects || [];
  const byId = new Map(projects.map((project) => [String(project.id), project]));

  const resolveProject = (draw) => {
    const projectId = resolveProjectId(draw.projectId) || draw.projectId;
    if (!projectId) return null;
    const project = byId.get(String(projectId));
    const ownerId = project?.ownerId || project?.createdBy || draw.ownerId || draw.createdBy;
    if (!ownerId) return null;
    return { projectId: String(projectId), ownerId: String(ownerId) };
  };

  const firstTouch = computeFirstTouch(draws, resolveProject);
  console.log(`  розыгрышей просмотрено: ${draws.length}`);
  console.log(`  пар «человек + проект»: ${firstTouch.size}`);

  const profiles = readUserProjectProfiles();
  profiles.users = profiles.users || {};

  let written = 0;
  let alreadySet = 0;
  let noProfile = 0;
  const byOwner = new Map();
  const bySource = new Map();

  for (const entry of firstTouch.values()) {
    const user = profiles.users[entry.userId];
    if (!user) {
      noProfile += 1;
      continue;
    }
    user.projects = user.projects || {};
    const projectData = user.projects[entry.projectId];
    if (!needsAttribution(projectData)) {
      alreadySet += 1;
      continue;
    }
    user.projects[entry.projectId] = { ...(projectData || {}), ...toProfilePatch(entry) };
    written += 1;
    byOwner.set(entry.ownerId, (byOwner.get(entry.ownerId) || 0) + 1);
    bySource.set(entry.source, (bySource.get(entry.source) || 0) + 1);
  }

  console.log(`  будет проставлено: ${written}`);
  console.log(`  уже проставлено раньше: ${alreadySet}`);
  console.log(`  без профиля (пропущено): ${noProfile}`);
  console.log("  по точности:");
  for (const [source, count] of bySource) {
    console.log(`     ${source === "participant" ? "точная отметка входа" : "дата розыгрыша (грубо)"}: ${count}`);
  }
  console.log("  кто привёл:");
  const named = (id) => {
    const meta = profiles.users[String(id)]?.meta || {};
    return meta.username ? `@${meta.username}` : `id ${id}`;
  };
  for (const [ownerId, count] of [...byOwner.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${named(ownerId).padEnd(20)} ${count}`);
  }

  if (!APPLY) {
    console.log("\n  пробный прогон. Чтобы записать: node scripts/backfill-project-attribution.js --apply");
    return;
  }
  writeUserProjectProfiles(profiles);
  console.log(`\n  записано: ${written}`);
}

main();
