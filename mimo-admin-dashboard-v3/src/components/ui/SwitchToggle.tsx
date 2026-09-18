import React from 'react';

export interface SwitchToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const SwitchToggle: React.FC<SwitchToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center justify-between gap-4 select-none min-h-[52px] py-1.5 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      {(label || description) && (
        <div className="flex-1 pr-3">
          {label && (
            <p className="text-base sm:text-[17px] font-bold text-slate-900 dark:text-[#F8FAFC] tracking-tight leading-snug">
              {label}
            </p>
          )}
          {description && (
            <p className="text-xs sm:text-sm text-slate-500 dark:text-[#94A3B8] mt-1 font-normal leading-normal">
              {description}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || 'Toggle switch'}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onChange(!checked);
        }}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          checked ? 'bg-[#6366F1] dark:bg-[#6366F1]' : 'bg-slate-300 dark:bg-[#26384D]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
