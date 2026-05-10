import { prisma } from "../db/client.js";

export type PriorContext = {
  summaryText: string | null;
  sessionIds: string[];
};

const MAX_PRIOR_SESSIONS = 2;

export async function getPriorContextForSession(
  supplierId: string,
  componentCategory: string,
  excludeSessionId: string,
): Promise<PriorContext> {
  const recent = await prisma.session.findMany({
    where: {
      supplierId,
      status: { in: ["completed", "failed_veto"] },
      id: { not: excludeSessionId },
      rfi: { componentCategory },
    },
    include: {
      rfi: { include: { project: true } },
      responses: { include: { parameter: true } },
    },
    orderBy: { completedAt: "desc" },
    take: MAX_PRIOR_SESSIONS,
  });

  if (recent.length === 0) return { summaryText: null, sessionIds: [] };

  const lines: string[] = [];
  for (const s of recent) {
    const stamp = s.completedAt
      ? s.completedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : "";
    lines.push(`Prior session — ${s.rfi.project.name} (${stamp}, status: ${s.status}):`);
    for (const r of s.responses) {
      lines.push(`  - ${r.parameter.label}: "${r.rawResponse}" → ${r.verdict}`);
    }
    lines.push("");
  }

  return {
    summaryText: lines.join("\n").trim(),
    sessionIds: recent.map((s) => s.id),
  };
}
