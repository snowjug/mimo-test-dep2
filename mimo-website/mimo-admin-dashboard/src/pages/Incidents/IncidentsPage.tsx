import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  Check,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import api from '../../api';
import { useTheme } from '../../context/ThemeContext';

interface RefundRequestItem {
  id: string;
  orderId: string;
  userId?: string;
  amount?: number;
  reason?: string;
  status?: string;
  requestedAt?: any;
  userEmail?: string;
}

export const IncidentsPage: React.FC = () => {
  const { isDark } = useTheme();
  const [refundRequests, setRefundRequests] = useState<RefundRequestItem[]>([]);
  const [hardwareAlerts, setHardwareAlerts] = useState<Array<{ code: string; issue: string; severity: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadIncidents = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [refReqRes, hwRes] = await Promise.all([
        api.get<{ requests: RefundRequestItem[] }>('/admin/refund-requests').catch(() => ({ data: { requests: [] } })),
        api.get<Record<string, any>>('/admin/hardware').catch(() => ({ data: {} })),
      ]);

      setRefundRequests(refReqRes.data?.requests || []);

      // Check hardware alerts
      const hwData = hwRes.data || {};
      const alerts: Array<{ code: string; issue: string; severity: string }> = [];
      Object.entries(hwData).forEach(([code, item]) => {
        if ((item.paperLevel ?? 500) < 100) {
          alerts.push({
            code,
            issue: `Paper tray low (${item.paperLevel ?? 0} sheets remaining)`,
            severity: 'High',
          });
        }
        if ((item.tonerLevel ?? item.inkLevel ?? 100) < 20) {
          alerts.push({
            code,
            issue: `Toner reserve depleted (${item.tonerLevel ?? item.inkLevel ?? 0}%)`,
            severity: 'Medium',
          });
        }
      });
      setHardwareAlerts(alerts);
    } catch (err) {
      console.error('Failed to load incident items:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleProcessRefund = async (orderId: string, amount: number) => {
    setProcessingId(orderId);
    try {
      await api.post('/admin/refund', {
        orderId,
        refundAmount: amount,
        note: 'Approved via Incident Resolution Command',
      });
      alert(`Refund processed for order ${orderId}`);
      loadIncidents(true);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to process refund.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Incident & Alert Center
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <AlertTriangle size={12} />
              {refundRequests.filter(r => r.status === 'pending').length + hardwareAlerts.length} Active Items
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">
            Real-time monitoring of campus terminal alerts, paper jams, user refund requests, and SLA compliance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadIncidents(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Sync Alerts
        </button>
      </div>

      {/* ── Active Hardware Alerts ─────────────────────────────────── */}
      {hardwareAlerts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-3)]">
            Hardware Telemetry Alerts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hardwareAlerts.map((alert, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-[var(--surface)] border border-amber-500/30 shadow-xs flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[var(--text-1)]">{alert.code}</h3>
                    <p className="text-xs text-[var(--text-2)]">{alert.issue}</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  {alert.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending Refund Requests Table ───────────────────────────── */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm sm:text-base text-[var(--text-1)]">User Refund Requests</h2>
            <p className="text-xs text-[var(--text-3)]">Pending customer dispute requests from campus users</p>
          </div>
          <span className="text-xs font-bold text-[var(--text-2)] bg-[var(--surface-2)] px-2.5 py-1 rounded-lg">
            {refundRequests.length} Total
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">Order ID</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 sm:px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs sm:text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--text-3)]">
                    <RefreshCw className="animate-spin inline mr-2" size={16} />
                    Loading refund requests...
                  </td>
                </tr>
              ) : refundRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--text-3)]">
                    No pending refund requests. Platform is running smoothly!
                  </td>
                </tr>
              ) : (
                refundRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 font-mono font-bold text-[var(--text-1)]">
                      {req.orderId}
                    </td>
                    <td className="py-3.5 px-4 text-[var(--text-2)] font-medium">
                      {req.userEmail || req.userId || 'Campus Student'}
                    </td>
                    <td className="py-3.5 px-4 text-[var(--text-2)] max-w-xs truncate">
                      {req.reason || 'Paper jam / job not printed'}
                    </td>
                    <td className="py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400">
                      ₹{(req.amount || 0).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                        req.status === 'processed' || req.status === 'resolved'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-600'
                      }`}>
                        {req.status || 'Pending'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right">
                      {req.status === 'pending' && (
                        <button
                          type="button"
                          disabled={processingId === req.orderId}
                          onClick={() => handleProcessRefund(req.orderId, req.amount || 0)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          {processingId === req.orderId ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Approve Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
