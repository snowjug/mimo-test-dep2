import React, { useEffect } from 'react';
import { X, ExternalLink, CheckCircle2, User, Calendar, Image as ImageIcon } from 'lucide-react';
import { tsToIso } from '../../lib/format';

export interface ProofModalData {
  imageUrl: string;
  title: string;
  assigneeName?: string;
  proofNote?: string | null;
  completedAt?: (string | { _seconds: number }) | null;
  status?: string;
}

export const ProofImageModal: React.FC<{
  data: ProofModalData | null;
  onClose: () => void;
}> = ({ data, onClose }) => {
  useEffect(() => {
    if (!data) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, onClose]);

  if (!data) return null;

  const completedIso = tsToIso(data.completedAt);
  const formattedCompleted = completedIso
    ? new Date(completedIso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 sm:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-900/90 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="size-3.5" /> Proof of Work
              </span>
              {data.status && (
                <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                  {data.status}
                </span>
              )}
            </div>
            <h3 className="mt-1.5 text-base sm:text-lg font-bold text-white truncate">
              {data.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              {data.assigneeName && (
                <span className="flex items-center gap-1 font-medium text-slate-300">
                  <User className="size-3.5 text-slate-400" />
                  {data.assigneeName}
                </span>
              )}
              {formattedCompleted && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5 text-slate-400" />
                  Completed {formattedCompleted}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={data.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
              title="Open full size image in new tab"
            >
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">Open original</span>
            </a>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Image Content Container */}
        <div className="relative flex-1 overflow-auto bg-black/60 p-2 sm:p-4 flex items-center justify-center min-h-[280px]">
          <img
            src={data.imageUrl}
            alt={data.title}
            className="max-h-[62vh] w-auto max-w-full rounded-lg object-contain shadow-md"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>

        {/* Proof Note Callout */}
        {data.proofNote && (
          <div className="border-t border-slate-800 bg-slate-900/95 px-5 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Technician Notes / Completion Summary
            </p>
            <p className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
              {data.proofNote}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
