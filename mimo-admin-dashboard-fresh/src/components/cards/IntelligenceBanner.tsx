import React from 'react';
import { TrendingUp, Award, ShieldCheck, AlertCircle } from 'lucide-react';
import type { IntelligenceInsight, IncidentsSummaryCount } from '../../types/dashboard.types';

interface IntelligenceSectionProps {
  insights: IntelligenceInsight[];
  incidents: IncidentsSummaryCount;
  onNavigateIncidents?: () => void;
}

export const IntelligenceBanner: React.FC<IntelligenceSectionProps> = ({
  insights,
  incidents,
  onNavigateIncidents,
}) => {
  const getIcon = (type: IntelligenceInsight['iconType']) => {
    switch (type) {
      case 'trend':
        return <TrendingUp size={16} className="text-[#20D3A2]" />;
      case 'award':
        return <Award size={16} className="text-amber-400" />;
      case 'shield':
        return <ShieldCheck size={16} className="text-[#20D3A2]" />;
      default:
        return <AlertCircle size={16} className="text-[#20D3A2]" />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
      {/* MIMO Intelligence Banner (2 Cols) */}
      <div className="lg:col-span-2 relative bg-linear-to-r from-[#10223A] via-[#10223A] to-[#132943] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl overflow-hidden flex flex-col justify-between">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#20D3A2]/10 rounded-full blur-3xl pointer-events-none" />

        <div>
          <div className="flex items-center justify-between pb-3.5 border-b border-[#1D3A59]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#20D3A2] animate-pulse" />
              <h3 className="text-sm sm:text-base font-bold text-[#F5F7FA]">MIMO Intelligence</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#20D3A2]/20 text-[#20D3A2] border border-[#20D3A2]/30 uppercase">
              LIVE
            </span>
          </div>

          <div className="mt-3.5 space-y-2.5">
            {insights.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-[#07111F]/50 border border-[#1D3A59]/60"
              >
                <div className="p-1.5 rounded-lg bg-[#132943] shrink-0">
                  {getIcon(item.iconType)}
                </div>
                <p className="text-xs sm:text-sm text-[#CAD7E6] font-medium leading-relaxed">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Incidents Summary Box (1 Col) */}
      <div className="lg:col-span-1 bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3.5 border-b border-[#1D3A59]">
            <h3 className="text-sm sm:text-base font-bold text-[#F5F7FA]">Incidents</h3>
            <span className="text-[11px] font-semibold text-[#8EA6BF]">LAST 24 HOURS</span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 mt-4">
            {/* Critical */}
            <button
              type="button"
              onClick={onNavigateIncidents}
              className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-center hover:bg-rose-500/25 transition-all cursor-pointer"
            >
              <p className="text-2xl font-black text-rose-400">{incidents.critical}</p>
              <p className="text-[11px] font-bold text-rose-300 mt-0.5">Critical</p>
            </button>

            {/* High */}
            <button
              type="button"
              onClick={onNavigateIncidents}
              className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-center hover:bg-amber-500/25 transition-all cursor-pointer"
            >
              <p className="text-2xl font-black text-amber-400">{incidents.high}</p>
              <p className="text-[11px] font-bold text-amber-300 mt-0.5">High</p>
            </button>

            {/* Medium */}
            <button
              type="button"
              onClick={onNavigateIncidents}
              className="p-3 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-center hover:bg-yellow-500/25 transition-all cursor-pointer"
            >
              <p className="text-2xl font-black text-yellow-400">{incidents.medium}</p>
              <p className="text-[11px] font-bold text-yellow-300 mt-0.5">Medium</p>
            </button>
          </div>
        </div>

        {onNavigateIncidents && (
          <button
            type="button"
            onClick={onNavigateIncidents}
            className="mt-4 pt-3 border-t border-[#1D3A59] text-xs font-bold text-[#20D3A2] hover:text-[#20D3A2]/80 text-left cursor-pointer"
          >
            Inspect Incident Queue →
          </button>
        )}
      </div>
    </div>
  );
};
