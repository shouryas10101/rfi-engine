import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

type Ranked = {
  supplierId: string;
  supplierName: string;
  sessionId: string;
  status: string;
  rank: number;
  totalScore: number;
  components: {
    mustHavePassRate: number;
    goodToHaveScore: number;
    subjectiveScore: number;
    avgModificationDistance: number;
  };
  eligible: boolean;
  rationale: string;
};

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-ink-100 rounded-full overflow-hidden">
      <div className={color} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, height: "100%" }} />
    </div>
  );
}

export default function ComparisonPage() {
  const { id } = useParams();
  const [data, setData] = useState<{ rfi: { id: string; title: string }; ranked: Ranked[] } | null>(null);

  useEffect(() => {
    api.get(`/rfis/${id}/comparison`).then((r) => setData(r.data));
  }, [id]);

  if (!data) return <div className="text-ink-400">Loading...</div>;

  const eligible = data.ranked.filter((s) => s.eligible);
  const ineligible = data.ranked.filter((s) => !s.eligible);

  return (
    <div>
      <div className="mb-6">
        <Link to={`/rfis/${data.rfi.id}`} className="text-sm text-ink-400 hover:text-ink-600">
          ← {data.rfi.title}
        </Link>
        <h1 className="text-xl font-medium mt-2">Supplier comparison</h1>
        <p className="text-sm text-ink-400 mt-1">
          Ranked by weighted score. Suppliers failing must-have parameters are shown separately.
        </p>
      </div>

      {eligible.length > 0 && (
        <div className="space-y-3 mb-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-400">Eligible suppliers</h2>
          {eligible.map((s) => (
            <div key={s.supplierId} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-medium text-ink-900">#{s.rank}</span>
                  <div>
                    <h3 className="font-medium">{s.supplierName}</h3>
                    <p className="text-xs text-ink-400 mt-0.5">{s.rationale}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-medium">{pct(s.totalScore)}</p>
                  <p className="text-xs text-ink-400">total score</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-5">
                <div>
                  <p className="text-xs text-ink-400 mb-1">Must-have</p>
                  <Bar value={s.components.mustHavePassRate} color="bg-red-500" />
                  <p className="text-xs mt-1">{pct(s.components.mustHavePassRate)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-400 mb-1">Good-to-have</p>
                  <Bar value={s.components.goodToHaveScore} color="bg-blue-500" />
                  <p className="text-xs mt-1">{pct(s.components.goodToHaveScore)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-400 mb-1">Subjective</p>
                  <Bar value={s.components.subjectiveScore} color="bg-purple-500" />
                  <p className="text-xs mt-1">{pct(s.components.subjectiveScore)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-400 mb-1">Modification effort</p>
                  <Bar value={s.components.avgModificationDistance} color="bg-amber-500" />
                  <p className="text-xs mt-1">{pct(s.components.avgModificationDistance)}</p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-ink-100">
                <Link to={`/sessions/${s.sessionId}/report`} className="text-sm text-accent-600 hover:text-accent-700">
                  View compliance report →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {ineligible.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-400">Ineligible (must-have failure)</h2>
          {ineligible.map((s) => (
            <div key={s.supplierId} className="card border-red-200">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{s.supplierName}</h3>
                  <p className="text-xs text-red-600 mt-1">{s.rationale}</p>
                </div>
                <Link to={`/sessions/${s.sessionId}/report`} className="text-sm text-accent-600 hover:text-accent-700">
                  Report →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
