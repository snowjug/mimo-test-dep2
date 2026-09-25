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
} from 'lucide-react';
import api from '../../../api';
import { FinanceMetricCard } from '../components/FinanceMetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { FinanceDetailsDrawer } from '../components/FinanceDetailsDrawer';

export interface FinanceRefundsPageProps {
  refundRequests: any[];
  loading: boolean;
  onRefresh: () => void;
}

export const FinanceRefundsPage: React.FC<FinanceRefundsPageProps> = ({
  refundRequests,
  loading,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [refundToProcess, setRefundToProcess] = useState<any | null>(null);
  const [customRefundAmount, setCustomRefundAmount] = useState<string>('');
  const [refundNote, setRefundNote] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      {/* ── TOP METRICS ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <FinanceMetricCard
          title="Total Requests"
          value={totalRequests.toLocaleString('en-IN')}
          change="Dispute Stream"
          trend="neutral"
          icon={<RotateCcw className="w-5 h-5" />}
          iconBgColor="bg-purple-50"
          iconColor="text-[#6D35E8]"
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
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          {actionError}
        </div>
      )}

      {/* ── FILTER & SEARCH BAR ────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#EDE9FE] rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Order ID, User ID, or Reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#FAF9FD] border border-[#EDE9FE] text-slate-800 placeholder-slate-400 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-[#6D35E8]"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-[#FAF9FD] border border-[#EDE9FE] px-3 py-1.5 rounded-xl text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
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
          className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Requests
        </button>
      </div>

      {/* ── REFUNDS TABLE ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#EDE9FE] rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FAF9FD] border-b border-[#EDE9FE] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
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
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No refund requests found in the dispute queue.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req, idx) => {
                  const isPending = req.status === 'pending' || req.status === 'PENDING';
                  return (
                    <tr key={req.id || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#6D35E8]">
                        {req.id ? `REF-${String(req.id).slice(-4)}` : `REF-${7401 + idx}`}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                        {req.orderId || 'ORD-9912'}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700 truncate max-w-[140px]">
                        {req.userEmail || req.userId || 'Campus User'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-black text-rose-600 text-sm">
                        ₹{Number(req.refundAmount || req.amount || 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-[200px] truncate">
                        {req.reason || req.note || 'Hardware paper jam / print error'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {req.requestedAt ? new Date(req.requestedAt).toLocaleDateString() : '2026-09-26'}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge status={req.status || 'PENDING'} />
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedRequest(req)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Inspect Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {isPending && (
                            <button
                              onClick={() => handleOpenProcessModal(req)}
                              className="px-2.5 py-1 text-xs font-bold text-white bg-[#6D35E8] hover:bg-[#5b29c9] rounded-lg shadow-xs transition-all cursor-pointer"
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

      {/* ── EXECUTE REFUND MODAL ───────────────────────────────────────────────── */}
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
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold font-mono focus:outline-none focus:border-[#6D35E8]"
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
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-[#6D35E8]"
            />
          </div>
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
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-150">
              <span className="text-rose-500 text-[11px] block mb-1 font-semibold">Refund Requested</span>
              <span className="text-2xl font-black text-rose-700 font-mono">
                ₹{Number(selectedRequest.refundAmount || selectedRequest.amount || 0).toFixed(2)}
              </span>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono font-semibold text-slate-800">{selectedRequest.orderId}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-800">{selectedRequest.userEmail || selectedRequest.userId || 'Student'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Dispute Reason:</span>
                <span className="font-medium text-slate-800">{selectedRequest.reason || 'Hardware failure'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Gateway Status:</span>
                <span className="font-mono text-slate-800">{selectedRequest.status || 'PENDING'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Requested Timestamp:</span>
                <span className="font-mono text-slate-800">{selectedRequest.requestedAt || '2026-09-26'}</span>
              </div>
            </div>
          </div>
        )}
      </FinanceDetailsDrawer>
    </div>
  );
};
