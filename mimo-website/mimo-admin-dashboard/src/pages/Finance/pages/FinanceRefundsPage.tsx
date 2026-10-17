import React, { useState } from 'react';
import {
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  IndianRupee,
  Search,
  Filter,
  Eye,
  AlertTriangle,
  Loader2,
  Check,
  CheckSquare,
  Square,
  ShieldAlert,
} from 'lucide-react';
import api from '../../../api';
import { useRange } from '../../../context/RangeContext';
import { describeRange } from '../../../lib/dateRange';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { FinanceDetailsDrawer } from '../components/FinanceDetailsDrawer';
import { ErrorBanner } from '../../../components/insights/InsightBits';

export interface FinanceRefundsPageProps {
  refundRequests: any[];
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
}

export const FinanceRefundsPage: React.FC<FinanceRefundsPageProps> = ({
  refundRequests,
  loading,
  error,
  onRefresh,
}) => {
  const { range } = useRange();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [refundToProcess, setRefundToProcess] = useState<any | null>(null);
  const [customRefundAmount, setCustomRefundAmount] = useState<string>('');
  const [refundNote, setRefundNote] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Bulk Approval State
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Compute metrics from real refund requests data
  const totalRequests = refundRequests.length;
  const pendingRequests = refundRequests.filter((r) => r.status === 'pending' || r.status === 'PENDING').length;
  const approvedRequests = refundRequests.filter((r) => r.status === 'processed' || r.status === 'approved' || r.status === 'SUCCESS').length;
  const rejectedRequests = refundRequests.filter((r) => r.status === 'rejected').length;
  const totalRefundedAmount = refundRequests.reduce((acc, curr) => acc + (Number(curr.refundAmount || curr.amount) || 0), 0);

  const filteredRequests = refundRequests.filter((r) => {
    const matchSearch =
      !searchTerm ||
      (r.orderId && String(r.orderId).toLowerCase().includes(searchTerm.toLowerCase())) ||
      (r.userId && String(r.userId).toLowerCase().includes(searchTerm.toLowerCase())) ||
      (r.reason && String(r.reason).toLowerCase().includes(searchTerm.toLowerCase()));

    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'PENDING' && (r.status === 'pending' || r.status === 'PENDING')) ||
      (statusFilter === 'PROCESSED' && (r.status === 'processed' || r.status === 'approved' || r.status === 'SUCCESS')) ||
      (statusFilter === 'REJECTED' && r.status === 'rejected');

    return matchSearch && matchStatus;
  });

  const pendingFiltered = filteredRequests.filter((r) => (r.status === 'pending' || r.status === 'PENDING') && r.orderId);

  const handleToggleSelect = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleToggleSelectAllPending = () => {
    if (selectedOrderIds.size === pendingFiltered.length && pendingFiltered.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(pendingFiltered.map((r) => r.orderId)));
    }
  };

  const selectedTotalAmount = Array.from(selectedOrderIds).reduce((acc, orderId) => {
    const item = refundRequests.find((r) => r.orderId === orderId);
    return acc + (Number(item?.refundAmount || item?.amount || 0));
  }, 0);

  const handleOpenProcessModal = (req: any) => {
    setRefundToProcess(req);
    setCustomRefundAmount(String(req.refundAmount || req.amount || ''));
    setRefundNote(`Refund approved for order ${req.orderId}`);
    setActionSuccess(null);
    setActionError(null);
  };

  const handleExecuteRefund = async () => {
    if (!refundToProcess) return;
    setIsProcessing(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await api.post('/admin/refund', {
        orderId: refundToProcess.orderId,
        refundAmount: Number(customRefundAmount),
        note: refundNote,
      });

      setActionSuccess(response.data.message || `Refund of ₹${customRefundAmount} processed via Cashfree`);
      setRefundToProcess(null);
      onRefresh();
    } catch (err: any) {
      setActionError(err.response?.data?.error || err.message || 'Refund processing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteBulkRefund = async () => {
    if (selectedOrderIds.size === 0) return;
    setIsBulkProcessing(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const orderIds = Array.from(selectedOrderIds);
      const res = await api.post('/admin/refund/bulk', {
        orderIds,
        note: `Bulk approved by Finance Team (${orderIds.length} orders)`,
      });

      const { successfulCount, failedCount } = res.data;
      setActionSuccess(`Bulk refund completed: ${successfulCount} approved successfully, ${failedCount} failed.`);
      setShowBulkConfirmModal(false);
      setSelectedOrderIds(new Set());
      onRefresh();
    } catch (err: any) {
      setActionError(err.response?.data?.error || err.message || 'Bulk refund operation failed.');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#111318] dark:text-white tracking-tight">Refunds &amp; Disputes</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Dispute stream and gateway reconciliation · {describeRange(range)}</p>
        </div>
        <button
          onClick={onRefresh}
          className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 rounded-xl transition-all flex items-center gap-2 cursor-pointer self-start"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Requests
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={onRefresh} />}

      {/* ── TOP METRICS ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <FinanceMetricCard
          title="Total Requests"
          value={totalRequests.toLocaleString('en-IN')}
          change="Dispute Stream"
          trend="neutral"
          icon={<RotateCcw className="w-5 h-5" />}
          iconBgColor="bg-purple-50"
          iconColor="text-[#093765]"
          loading={loading}
        />
        <FinanceMetricCard
          title="Pending Approval"
          value={pendingRequests.toLocaleString('en-IN')}
          change="Requires Action"
          trend="down"
          icon={<Clock className="w-5 h-5" />}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Approved & Settled"
          value={approvedRequests.toLocaleString('en-IN')}
          change="Cashfree Executed"
          trend="up"
          icon={<CheckCircle2 className="w-5 h-5" />}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Rejected Disputes"
          value={rejectedRequests.toLocaleString('en-IN')}
          change="Fraud & Ineligible"
          trend="neutral"
          icon={<XCircle className="w-5 h-5" />}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
        />
        <FinanceMetricCard
          title="Total Refunded (INR)"
          value={`₹${totalRefundedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          change="Reconciled"
          trend="neutral"
          icon={<IndianRupee className="w-5 h-5" />}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
          loading={loading}
        />
      </div>

      {/* ── FEEDBACK BANNERS ───────────────────────────────────────────────────── */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          {actionError}
        </div>
      )}

      {/* ── BULK ACTION BAR (VISIBLE WHEN SELECTED) ─────────────────────────────── */}
      {selectedOrderIds.size > 0 && (
        <div className="p-4 rounded-2xl bg-[#093765] dark:bg-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center font-mono font-bold text-sm">
              {selectedOrderIds.size}
            </span>
            <div>
              <p className="font-bold text-xs">
                {selectedOrderIds.size} Refund Request{selectedOrderIds.size > 1 ? 's' : ''} Selected
              </p>
              <p className="text-[11px] text-white/70">
                Total sum to refund: <strong className="text-white font-mono">₹{selectedTotalAmount.toFixed(2)}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedOrderIds(new Set())}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-all cursor-pointer"
            >
              Clear Selection
            </button>
            <button
              type="button"
              onClick={() => setShowBulkConfirmModal(true)}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black transition-all cursor-pointer shadow-md"
            >
              Approve All {selectedOrderIds.size} Requests
            </button>
          </div>
        </div>
      )}

      {/* ── FILTER & SEARCH BAR ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Order ID, User ID, or Reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#F3F4F6] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-[#093765] dark:focus:border-indigo-400"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-[#F3F4F6] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Requests</option>
              <option value="PENDING">Pending Review</option>
              <option value="PROCESSED">Processed / Settled</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Requests
        </button>
      </div>

      {/* ── REFUNDS TABLE ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#F3F4F6] dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-400 font-semibold text-[10px]">
                <th className="py-3 px-3 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAllPending}
                    title="Select all pending"
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {pendingFiltered.length > 0 && selectedOrderIds.size === pendingFiltered.length ? (
                      <CheckSquare className="w-4 h-4 text-[#093765] dark:text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">Request ID</th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Refund Amount</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Requested At</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No refund requests found in the dispute queue.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req, idx) => {
                  const isPending = req.status === 'pending' || req.status === 'PENDING';
                  const isSelected = req.orderId && selectedOrderIds.has(req.orderId);
                  return (
                    <tr
                      key={req.id || idx}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors ${
                        isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-3 text-center">
                        {isPending && req.orderId ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(req.orderId)}
                            className="rounded border-slate-300 text-[#093765] focus:ring-[#093765] cursor-pointer"
                          />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#093765] dark:text-indigo-400">
                        {req.id ? (req.id.startsWith('REF-') ? req.id : `REF-${String(req.id).slice(-4).toUpperCase()}`) : `REF-${idx + 1}`}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {req.orderId || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                        {req.userEmail || req.userId || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                        ₹{Number(req.refundAmount || req.amount || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                        {req.reason || req.note || 'Print Failure'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {req.requestedAt ? new Date(req.requestedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={req.status || 'PENDING'} />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedRequest(req)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Inspect Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {isPending && (
                            <button
                              onClick={() => handleOpenProcessModal(req)}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-[#093765] hover:bg-[#062A4E] dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg shadow-xs transition-all cursor-pointer"
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── EXECUTE SINGLE REFUND MODAL ────────────────────────────────────────── */}
      <ConfirmationDialog
        isOpen={Boolean(refundToProcess)}
        title="Approve Cashfree Refund"
        description={`You are about to initiate an automated refund for Order ID: ${refundToProcess?.orderId}. This will invoke the Cashfree payment gateway API and refund the customer's payment source.`}
        confirmLabel="Execute Refund (Cashfree)"
        cancelLabel="Cancel"
        isDestructive={false}
        isLoading={isProcessing}
        onConfirm={handleExecuteRefund}
        onCancel={() => setRefundToProcess(null)}
      >
        <div className="space-y-3 mt-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Refund Amount (INR)
            </label>
            <input
              type="number"
              step="0.01"
              value={customRefundAmount}
              onChange={(e) => setCustomRefundAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-sm font-bold font-mono focus:outline-none focus:border-[#093765]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Audit Reason / Note
            </label>
            <input
              type="text"
              value={refundNote}
              onChange={(e) => setRefundNote(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs focus:outline-none focus:border-[#093765]"
            />
          </div>
        </div>
      </ConfirmationDialog>

      {/* ── BULK APPROVAL CONFIRMATION MODAL ────────────────────────────────────── */}
      <ConfirmationDialog
        isOpen={showBulkConfirmModal}
        title={`Approve ${selectedOrderIds.size} Bulk Refunds`}
        description={`You are executing bulk approval for ${selectedOrderIds.size} customer orders with total value ₹${selectedTotalAmount.toFixed(2)}. Each request will be processed with individual claim locks and verified via Cashfree.`}
        confirmLabel={`Authorize Bulk Refunds (₹${selectedTotalAmount.toFixed(2)})`}
        cancelLabel="Cancel"
        isDestructive={false}
        isLoading={isBulkProcessing}
        onConfirm={handleExecuteBulkRefund}
        onCancel={() => setShowBulkConfirmModal(false)}
      >
        <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <span>
            <strong>Maker-Checker Policy:</strong> This action will be immutably recorded in the Financial Audit Log with your operator credentials.
          </span>
        </div>
      </ConfirmationDialog>

      {/* ── DETAILS DRAWER ────────────────────────────────────────────────────── */}
      <FinanceDetailsDrawer
        isOpen={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
        title="Dispute & Refund Details"
        subtitle={selectedRequest?.orderId ? `Order: ${selectedRequest.orderId}` : 'Refund Record'}
        badge={<StatusBadge status={selectedRequest?.status || 'PENDING'} />}
      >
        {selectedRequest && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-150 dark:border-rose-900/40">
              <span className="text-rose-500 text-[11px] block mb-1 font-semibold">Refund Requested</span>
              <span className="text-2xl font-black text-rose-700 dark:text-rose-400 font-mono">
                ₹{Number(selectedRequest.refundAmount || selectedRequest.amount || 0).toFixed(2)}
              </span>
            </div>

            <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{selectedRequest.orderId || '—'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedRequest.userEmail || selectedRequest.userId || '—'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Dispute Reason:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{selectedRequest.reason || selectedRequest.note || '—'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Gateway Status:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{selectedRequest.status || 'PENDING'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Requested Timestamp:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{selectedRequest.requestedAt ? new Date(selectedRequest.requestedAt).toLocaleString() : '—'}</span>
              </div>
            </div>
          </div>
        )}
      </FinanceDetailsDrawer>
    </div>
  );
};
