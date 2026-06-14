import fs from "node:fs";
import path from "node:path";

export type AutopilotChangeSchedule = {
  changeId: string;
  priority: string;
  dependencies: string[];
  blocks: string[];
  markers: Array<{ kind: "Priority" | "Depends-On" | "Blocks"; value: string; source: string }>;
  source: "explicit" | "inferred" | "default";
};

export type AutopilotChangeGraphNode = AutopilotChangeSchedule & {
  writeScope: string[];
  unresolvedDependencies: string[];
  conflictsWith: string[];
  candidateDependencies: string[];
};

export type AutopilotChangeGraph = {
  nodes: AutopilotChangeGraphNode[];
  levels: string[][];
  parallelReady: string[];
  dependencyBlocked: Array<{ changeId: string; dependencies: string[] }>;
  conflicts: Array<{ changeId: string; conflictsWith: string[] }>;
  cycles: string[][];
};

type ChangeInput = {
  changeId: string;
  priority?: string;
  dependencies?: string[];
  writeScope?: string[];
  docs?: Array<{ path: string; text: string }>;
};

const priorityOrder = ["critical", "high", "medium", "low"] as const;
const priorityValues = new Set<string>(priorityOrder);

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

function normalizePriority(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized != null && priorityValues.has(normalized) ? normalized : null;
}

function priorityRank(priority: string): number {
  const index = priorityOrder.indexOf(priority.trim().toLowerCase() as typeof priorityOrder[number]);
  return index >= 0 ? index : priorityOrder.length;
}

function compareNodes(left: AutopilotChangeGraphNode, right: AutopilotChangeGraphNode): number {
  return priorityRank(left.priority) - priorityRank(right.priority) || left.changeId.localeCompare(right.changeId);
}

function compareNodeIds(nodesById: Map<string, AutopilotChangeGraphNode>, left: string, right: string): number {
  const leftNode = nodesById.get(left);
  const rightNode = nodesById.get(right);
  if (leftNode == null || rightNode == null) {
    return left.localeCompare(right);
  }
  return compareNodes(leftNode, rightNode);
}

function safeChangeId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== "..";
}

function markerDocs(root: string, changeId: string): Array<{ path: string; text: string }> {
  const changeDir = path.join(root, "openspec", "changes", changeId);
  const files = ["proposal.md", "design.md", "tasks.md"];
  const docs: Array<{ path: string; text: string }> = [];
  for (const file of files) {
    const filePath = path.join(changeDir, file);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      docs.push({ path: `openspec/changes/${changeId}/${file}`, text: fs.readFileSync(filePath, "utf8") });
    }
  }
  return docs;
}

function parseMarkers(docs: Array<{ path: string; text: string }>): AutopilotChangeSchedule["markers"] {
  const markers: AutopilotChangeSchedule["markers"] = [];
  for (const doc of docs) {
    for (const line of doc.text.split(/\r?\n/)) {
      const match = /^\s*(Priority|Depends-On|Blocks):\s*([^#\s]+)\s*$/i.exec(line);
      if (!match) {
        continue;
      }
      const kind = match[1].toLowerCase() === "priority" ? "Priority" : match[1].toLowerCase() === "depends-on" ? "Depends-On" : "Blocks";
      markers.push({ kind, value: match[2], source: doc.path });
    }
  }
  return markers.sort((left, right) => `${left.source}:${left.kind}:${left.value}`.localeCompare(`${right.source}:${right.kind}:${right.value}`));
}

export function inferChangeSchedule(input: { root?: string; changeId: string; priority?: string; dependencies?: string[]; docs?: Array<{ path: string; text: string }> }): AutopilotChangeSchedule {
  if (!safeChangeId(input.changeId)) {
    throw new Error(`Unsafe change id: ${input.changeId}`);
  }
  const docs = input.docs ?? (input.root ? markerDocs(input.root, input.changeId) : []);
  const markers = parseMarkers(docs);
  const priorityMarker = markers.find((marker) => marker.kind === "Priority");
  const explicitPriority = normalizePriority(priorityMarker?.value);
  const dependencyMarkers = markers.filter((marker) => marker.kind === "Depends-On").map((marker) => marker.value).filter(safeChangeId);
  const blockMarkers = markers.filter((marker) => marker.kind === "Blocks").map((marker) => marker.value).filter(safeChangeId);
  const dependencies = sortedUnique([...(input.dependencies ?? []), ...dependencyMarkers].filter((dependency) => dependency !== input.changeId && safeChangeId(dependency)));
  return {
    changeId: input.changeId,
    priority: explicitPriority ?? normalizePriority(input.priority) ?? "medium",
    dependencies,
    blocks: sortedUnique(blockMarkers.filter((blocked) => blocked !== input.changeId)),
    markers,
    source: markers.length > 0 ? "explicit" : input.priority != null || (input.dependencies?.length ?? 0) > 0 ? "inferred" : "default",
  };
}

function overlap(left: string[], right: string[]): boolean {
  const normalizedRight = right.map((value) => value.replace(/\\/g, "/"));
  return left.map((value) => value.replace(/\\/g, "/")).some((leftValue) => normalizedRight.some((rightValue) => leftValue === rightValue || leftValue.startsWith(`${rightValue}/`) || rightValue.startsWith(`${leftValue}/`)));
}

function levelsFor(nodes: AutopilotChangeGraphNode[]): { levels: string[][]; cycles: string[][] } {
  const nodesById = new Map(nodes.map((node) => [node.changeId, node]));
  const remaining = new Map(nodes.map((node) => [node.changeId, new Set(node.dependencies.filter((dependency) => nodes.some((candidate) => candidate.changeId === dependency)))]));
  const levels: string[][] = [];
  while (remaining.size > 0) {
    const ready = Array.from(remaining.entries()).filter(([, deps]) => deps.size === 0).map(([id]) => id).sort((left, right) => compareNodeIds(nodesById, left, right));
    if (ready.length === 0) {
      return { levels, cycles: [Array.from(remaining.keys()).sort((left, right) => compareNodeIds(nodesById, left, right))] };
    }
    levels.push(ready);
    for (const id of ready) {
      remaining.delete(id);
    }
    for (const deps of remaining.values()) {
      for (const id of ready) {
        deps.delete(id);
      }
    }
  }
  return { levels, cycles: [] };
}

export function buildChangeGraph(inputs: ChangeInput[]): AutopilotChangeGraph {
  const schedules = inputs.map((input) => ({ input, schedule: inferChangeSchedule(input) })).sort((left, right) => left.schedule.changeId.localeCompare(right.schedule.changeId));
  const ids = new Set(schedules.map(({ schedule }) => schedule.changeId));
  const reverseBlocks = new Map<string, string[]>();
  for (const { schedule } of schedules) {
    for (const blocked of schedule.blocks) {
      reverseBlocks.set(blocked, [...(reverseBlocks.get(blocked) ?? []), schedule.changeId]);
    }
  }
  const nodes: AutopilotChangeGraphNode[] = schedules.map(({ input, schedule }) => {
    const dependencies = sortedUnique([...schedule.dependencies, ...(reverseBlocks.get(schedule.changeId) ?? [])].filter((dependency) => dependency !== schedule.changeId));
    const conflictsWith = schedules
      .filter((other) => other.schedule.changeId !== schedule.changeId && overlap(input.writeScope ?? [], other.input.writeScope ?? []))
      .map((other) => other.schedule.changeId);
    return {
      ...schedule,
      dependencies,
      writeScope: sortedUnique(input.writeScope ?? []),
      unresolvedDependencies: dependencies.filter((dependency) => !ids.has(dependency)),
      conflictsWith: sortedUnique(conflictsWith),
      candidateDependencies: sortedUnique(conflictsWith),
    };
  }).sort(compareNodes);
  const nodesById = new Map(nodes.map((node) => [node.changeId, node]));
  const { levels, cycles } = levelsFor(nodes.filter((node) => node.unresolvedDependencies.length === 0));
  const firstLevel = levels[0] ?? [];
  return {
    nodes,
    levels,
    parallelReady: firstLevel.filter((id) => nodesById.get(id)?.conflictsWith.length === 0).sort((left, right) => compareNodeIds(nodesById, left, right)),
    dependencyBlocked: nodes.filter((node) => node.dependencies.length > 0).map((node) => ({ changeId: node.changeId, dependencies: node.dependencies })),
    conflicts: nodes.filter((node) => node.conflictsWith.length > 0).map((node) => ({ changeId: node.changeId, conflictsWith: node.conflictsWith })),
    cycles,
  };
}

export function topologicalLevels(graph: AutopilotChangeGraph): string[][] {
  return graph.levels;
}

export function parallelReadyChanges(graph: AutopilotChangeGraph): string[] {
  return graph.parallelReady;
}
