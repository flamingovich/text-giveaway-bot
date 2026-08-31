// Projects: who takes part where, and which organiser brought them.
//
// The same brand exists once per organiser, so "Pokerdom" is several projects.
// Both readings are useful - the brand across everyone, and each organiser's own
// - so both are computed, and the two must never be added together: a quarter of
// the audience takes part in more than one project, and unique counts do not sum.

const { resolveProjectId } = require("./project-identity");
const { identityOf } = require("./admin-format");

function add(map, key, value = 1) {
  map.set(key, (map.get(key) || 0) + value);
}

function buildProjectStats(draws = [], projects = [], profiles = {}) {
  const users = profiles?.users || {};
  const identity = (userId) => identityOf(userId, users[String(userId)]?.meta || {});
  const byId = new Map(projects.map((project) => [String(project.id), project]));

  const brands = new Map(); // brand -> { people:Set, entries, draws, owners:Set }
  const cells = new Map(); // `${ownerId}|${brand}` -> { people:Set, entries, draws }
  const owners = new Map(); // ownerId -> { people:Set, entries, draws }
  const everyone = new Set();
  const projectsPerUser = new Map();
  const ownersPerUser = new Map();

  for (const draw of draws) {
    const projectId = resolveProjectId(draw.projectId) || draw.projectId;
    const project = byId.get(String(projectId));
    const brand = project?.name || "Без проекта";
    const ownerId = String(project?.ownerId || project?.createdBy || draw.ownerId || draw.createdBy || "");
    if (!ownerId) continue;

    const cellKey = `${ownerId}|${brand}`;
    if (!brands.has(brand)) brands.set(brand, { people: new Set(), entries: 0, draws: 0, owners: new Set() });
    if (!cells.has(cellKey)) cells.set(cellKey, { people: new Set(), entries: 0, draws: 0 });
    if (!owners.has(ownerId)) owners.set(ownerId, { people: new Set(), entries: 0, draws: 0 });

    brands.get(brand).draws += 1;
    brands.get(brand).owners.add(ownerId);
    cells.get(cellKey).draws += 1;
    owners.get(ownerId).draws += 1;

    for (const participant of draw.participantIds || []) {
      const userId = String(participant);
      everyone.add(userId);
      brands.get(brand).people.add(userId);
      brands.get(brand).entries += 1;
      cells.get(cellKey).people.add(userId);
      cells.get(cellKey).entries += 1;
      owners.get(ownerId).people.add(userId);
      owners.get(ownerId).entries += 1;

      if (!projectsPerUser.has(userId)) projectsPerUser.set(userId, new Set());
      projectsPerUser.get(userId).add(brand);
      if (!ownersPerUser.has(userId)) ownersPerUser.set(userId, new Set());
      ownersPerUser.get(userId).add(ownerId);
    }
  }

  // Who was credited with bringing each person to each project, read from the
  // profiles where it was written down - never recomputed here, so the page and
  // the stored status can never disagree.
  const attribution = new Map();
  let attributed = 0;
  for (const [userId, node] of Object.entries(users)) {
    for (const [projectId, projectData] of Object.entries(node?.projects || {})) {
      const ownerId = projectData?.firstTouchOwnerId;
      if (ownerId == null) continue;
      attributed += 1;
      const project = byId.get(String(resolveProjectId(projectId) || projectId));
      const brand = project?.name || "Без проекта";
      add(attribution, `${String(ownerId)}|${brand}`);
      void userId;
    }
  }

  const spread = (map) => {
    const buckets = new Map();
    for (const set of map.values()) add(buckets, set.size);
    return [...buckets.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([count, people]) => ({ count, people }));
  };

  const orderedOwners = [...owners.entries()].sort((a, b) => b[1].people.size - a[1].people.size);
  const orderedBrands = [...brands.entries()].sort((a, b) => b[1].people.size - a[1].people.size);

  return {
    totals: {
      people: everyone.size,
      projects: orderedBrands.length,
      owners: orderedOwners.length,
      bindings: [...cells.values()].reduce((sum, cell) => sum + cell.people.size, 0),
      attributed,
      sharedPeople: [...projectsPerUser.values()].filter((set) => set.size > 1).length,
    },
    brands: orderedBrands.map(([brand, value]) => ({
      brand,
      people: value.people.size,
      entries: value.entries,
      draws: value.draws,
      owners: value.owners.size,
    })),
    owners: orderedOwners.map(([ownerId, value]) => ({
      identity: identity(ownerId),
      ownerId,
      people: value.people.size,
      entries: value.entries,
      draws: value.draws,
    })),
    cells: [...cells.entries()].map(([key, value]) => {
      const [ownerId, brand] = key.split("|");
      return {
        ownerId,
        brand,
        people: value.people.size,
        entries: value.entries,
        draws: value.draws,
        attributed: attribution.get(key) || 0,
      };
    }),
    spreadByProject: spread(projectsPerUser),
    spreadByOwner: spread(ownersPerUser),
  };
}

module.exports = { buildProjectStats };
