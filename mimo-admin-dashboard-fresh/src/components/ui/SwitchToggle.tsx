import React from 'react';

export interface SwitchToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  className?: string;
}

export const SwitchToggle: React.FC<SwitchToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  className = '',
}) => {
  return (
    <label
      className={`flex items-center justify-between cursor-pointer select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {(label || description) && (
        <div className="mr-3">
          {label && <p className="text-xs sm:text-sm font-semibold text-[#F5F7FA]">{label}</p>}
          {description && <p className="text-[11px] text-[#8EA6BF] mt-0.5">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer ${
          checked ? 'bg-[#20D3A2]' : 'bg-[#1D3A59]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[#07111F] shadow-lg ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
};
