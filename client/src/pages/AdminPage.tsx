import { useState, useEffect, useCallback } from "react";
import { adminApi, type AdminUser, type AdminStats } from "../api/auth";
import { Users, BarChart3, FileText, RefreshCw } from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

const PLAN_OPTIONS = ["FREE", "PRO", "ENTERPRISE"] as const;

export function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, statsRes] = await Promise.all([
        adminApi.getUsers(),
        adminApi.getStats(),
      ]);
      setUsers(usersRes.users);
      setStats(statsRes);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Errore nel caricamento dati");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePlanChange = async (userId: string, newPlan: string) => {
    setUpdatingPlan(userId);
    try {
      await adminApi.updateUserPlan(userId, newPlan);
      await loadData();
    } catch (err: any) {
      setError(
        err?.response?.data?.error || "Errore nel cambio piano"
      );
    } finally {
      setUpdatingPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading-spinner">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Pannello Admin</h2>
        <button className="btn-icon" onClick={loadData} title="Aggiorna">
          <RefreshCw size={18} />
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {/* Stats */}
      {stats && (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <Users size={24} />
            <div>
              <span className="stat-value">{stats.totalUsers}</span>
              <span className="stat-label">Utenti totali</span>
            </div>
          </div>
          <div className="admin-stat-card">
            <FileText size={24} />
            <div>
              <span className="stat-value">{stats.totalExtractions}</span>
              <span className="stat-label">Estrazioni totali</span>
            </div>
          </div>
          <div className="admin-stat-card">
            <BarChart3 size={24} />
            <div>
              <span className="stat-value">{stats.weeklyExtractions}</span>
              <span className="stat-label">Questa settimana</span>
            </div>
          </div>
        </div>
      )}

      {/* Plan distribution */}
      {stats && stats.planDistribution.length > 0 && (
        <div className="admin-plan-distribution">
          <h3>Distribuzione piani</h3>
          <div className="plan-badges">
            {stats.planDistribution.map((p) => (
              <span key={p.plan} className={`plan-badge plan-${p.plan.toLowerCase()}`}>
                {PLAN_LABELS[p.plan] || p.plan}: {p.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="admin-users-section">
        <h3>Utenti registrati ({users.length})</h3>
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Ruolo</th>
                <th>Piano</th>
                <th>Upload settimana</th>
                <th>Quota</th>
                <th>Registrato</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>
                    <span
                      className={`role-badge role-${user.role.toLowerCase()}`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <select
                      value={user.plan}
                      onChange={(e) =>
                        handlePlanChange(user.id, e.target.value)
                      }
                      disabled={updatingPlan === user.id}
                      className="plan-select"
                    >
                      {PLAN_OPTIONS.map((plan) => (
                        <option key={plan} value={plan}>
                          {PLAN_LABELS[plan]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span
                      className={
                        user.uploadsThisWeek >= user.quotaLimit
                          ? "quota-exceeded"
                          : ""
                      }
                    >
                      {user.uploadsThisWeek}
                    </span>
                  </td>
                  <td>{user.quotaLimit}/settimana</td>
                  <td>
                    {new Date(user.createdAt!).toLocaleDateString("it-IT")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
