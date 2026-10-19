import React from 'react';
import { X } from 'lucide-react';

export interface FinanceDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

export const FinanceDetailsDrawer: React.FC<FinanceDetailsDrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col animate-slideIn">
          {/* Drawer Header */}
          <div className="px-6 py-5 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/80">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
                {badge}
              </div>
              {subtitle && <p className="text-xs text-slate-400 dark:text-slate-400 font-mono">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-900 dark:text-slate-100">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
