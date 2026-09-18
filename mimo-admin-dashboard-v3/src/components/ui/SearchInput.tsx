import React from 'react';
import { Search } from 'lucide-react';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
  rightElement?: React.ReactNode;
  iconSize?: number;
  inputSize?: 'sm' | 'md' | 'lg';
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  wrapperClassName = '',
  rightElement,
  iconSize = 18,
  inputSize = 'md',
  style,
  ...rest
}) => {
  const heightClass =
    inputSize === 'sm'
      ? 'h-10 text-xs sm:text-sm'
      : inputSize === 'lg'
      ? 'h-12 sm:h-13 text-base sm:text-[17px]'
      : 'h-11 sm:h-12 text-sm sm:text-base';

  return (
    <div className={`relative flex items-center w-full ${wrapperClassName}`}>
      <Search
        size={iconSize}
        style={{ left: '16px' }}
        className="absolute top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#8495AA] pointer-events-none shrink-0"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          paddingLeft: '48px',
          paddingRight: rightElement ? '56px' : '16px',
          ...style,
        }}
        className={`mimo-search-input w-full ${heightClass} bg-slate-50 dark:bg-[#0C1829] border border-slate-200/90 dark:border-[#1E314B] rounded-xl text-slate-900 dark:text-[#F8FAFC] placeholder-slate-400 dark:placeholder-[#8495AA] focus:outline-none focus:border-[#6366F1] focus:bg-white dark:focus:bg-[#0C1829] focus:ring-2 focus:ring-indigo-500/20 font-medium transition-all box-border ${className}`}
        {...rest}
      />
      {rightElement && (
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          {rightElement}
        </div>
      )}
    </div>
  );
};
