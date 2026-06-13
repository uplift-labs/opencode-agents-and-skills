export type AutopilotWorkerReportMarkerEvent = {
  type: string;
  properties?: Record<string, unknown>;
};

export type AutopilotWorkerReportMarkerStatus = "missing" | "mismatch" | "partial" | "matched";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }
    return output;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      collectStrings(item, output);
    }
  }
  return output;
}

function markerIsComplete(event: AutopilotWorkerReportMarkerEvent, text: string): boolean {
  return event.properties?.reportComplete === true
    || event.properties?.complete === true
    || /\bCOMPLETE\b/i.test(text);
}

function reportMarkerIds(text: string): string[] {
  return Array.from(text.matchAll(/\bAUTOPILOT_WORKER_REPORT\s+([^\s]+)/g), (match) => match[1]);
}

export function autopilotWorkerReportMarkerStatus(event: AutopilotWorkerReportMarkerEvent, reportId: string | undefined): AutopilotWorkerReportMarkerStatus {
  const explicitReportId = optionalString(event.properties?.reportId);
  if (explicitReportId != null) {
    if (reportId != null && explicitReportId !== reportId) {
      return "mismatch";
    }
    return markerIsComplete(event, collectStrings(event.properties).join("\n")) ? "matched" : "partial";
  }
  const text = collectStrings(event.properties).join("\n");
  if (!text.includes("AUTOPILOT_WORKER_REPORT")) {
    return "missing";
  }
  const markerIds = reportMarkerIds(text);
  if (markerIds.length === 0) {
    return "missing";
  }
  if (reportId != null && !markerIds.includes(reportId)) {
    return "mismatch";
  }
  if (reportId == null) {
    return "missing";
  }
  return markerIsComplete(event, text) ? "matched" : "partial";
}

export function completeAutopilotWorkerReportMarker(event: AutopilotWorkerReportMarkerEvent): { sessionID: string; reportId: string } | null {
  if (event.type !== "message.updated" && event.type !== "message.part.updated") {
    return null;
  }
  const sessionID = optionalString(event.properties?.sessionID);
  if (sessionID == null) {
    return null;
  }
  const text = collectStrings(event.properties).join("\n");
  if (!markerIsComplete(event, text)) {
    return null;
  }
  const reportId = optionalString(event.properties?.reportId) ?? optionalString(/\bAUTOPILOT_WORKER_REPORT\s+([^\s]+)/.exec(text)?.[1]);
  return reportId == null ? null : { sessionID, reportId };
}
