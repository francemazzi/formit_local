import type { QuotaInfo } from "../api/auth";

interface QuotaDisplayProps {
  quota: QuotaInfo | null;
}

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

export function QuotaDisplay({ quota }: QuotaDisplayProps) {
  if (!quota) return null;

  const percentage = Math.round((quota.used / quota.limit) * 100);
  const isNearLimit = percentage >= 80;
  const isExceeded = quota.used >= quota.limit;

  return (
    <div
      className={`quota-display ${
        isExceeded ? "quota-exceeded" : isNearLimit ? "quota-warning" : ""
      }`}
    >
      <div className="quota-text">
        <span className="quota-count">
          {quota.used}/{quota.limit}
        </span>{" "}
        documenti questa settimana
        <span className={`plan-badge plan-${quota.plan.toLowerCase()}`}>
          {PLAN_LABELS[quota.plan] || quota.plan}
        </span>
      </div>
      <div className="quota-bar">
        <div
          className="quota-bar-fill"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {isExceeded && (
        <div className="quota-message">
          Quota settimanale esaurita. Aggiorna il piano per caricare altri
          documenti.
        </div>
      )}
    </div>
  );
}
