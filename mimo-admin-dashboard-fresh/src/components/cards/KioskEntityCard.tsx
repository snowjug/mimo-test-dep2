import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { KioskEntitySummary } from '../../types/dashboard.types';

interface KioskNetworkCardProps {
  kiosks: KioskEntitySummary[];
  onViewAll?: () => void;
}

export const KioskEntityCard: React.FC<KioskNetworkCardProps> = ({ kiosks, onViewAll }) => {
  return (
    <div className="bg-[#10223A] rounded-2xl border border-[#1D3A59] p-5 sm:p-6 shadow-xl flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#1D3A59]">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-[#F5F7FA]">Kiosk Network</h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#20D3A2]/15 text-[#20D3A2] border border-[#20D3A2]/30">
              {kiosks.filter((k) => k.status === 'Online').length} Online
            </span>
          </div>
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs font-bold text-[#20D3A2] hover:text-[#20D3A2]/80 flex items-center gap-1 cursor-pointer"
            >
              <span>View all</span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>

        {/* Horizontal Card Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3.5">
          {kiosks.map((kiosk) => (
            <div
              key={kiosk.id}
              className="p-3.5 rounded-xl bg-[#07111F]/60 border border-[#1D3A59]/80 hover:border-[#20D3A2]/40 transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#1D3A59]/60">
                <span className="text-xs font-bold text-[#F5F7FA]">{kiosk.name}</span>
                <div className="flex items-center gap-1 text-[11px] text-[#20D3A2] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#20D3A2]" />
                  <span>{kiosk.status}</span>
                </div>
              </div>

              <div className="pt-2 space-y-0.5 text-[11px] text-[#8EA6BF]">
                <p>
                  <strong className="text-[#F5F7FA] font-bold">{kiosk.pagesToday}</strong> pages
                </p>
                <p>
                  <strong className="text-[#20D3A2] font-bold">₹{kiosk.revenueToday.toLocaleString()}</strong> revenue
                </p>
                <p className="text-[10px] text-[#6F89A3]">{kiosk.successRate}% success</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
