import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "../ui/utils";

/*
 * MIMO mobile primitives.
 * Shape rule: cards/groups 20px, buttons and inputs 14px, chips and segmented tracks full pill.
 * Colour rule: brand navy is the only accent; success/warning/danger appear only for state.
 */

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("select-none text-[26px] leading-none text-brand dark:text-ink", className)}
      style={{ fontFamily: "'Lovelo', sans-serif", fontWeight: 900, letterSpacing: "0.02em" }}
    >
      MIMO
    </span>
  );
}

/** Top bar for task screens: back chevron, centred title, optional trailing slot. */
export function AppBar({
  title,
  onBack,
  backTo,
  trailing,
  className,
}: {
  title?: React.ReactNode;
  onBack?: () => void;
  backTo?: string;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => (backTo ? navigate(backTo) : navigate(-1)));
  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-canvas/85 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md",
        className,
      )}
    >
      <div className="grid h-14 grid-cols-[44px_1fr_44px] items-center gap-2">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="press flex size-11 items-center justify-center rounded-full text-brand-text active:bg-surface-2"
        >
          <ChevronLeft className="size-6" strokeWidth={2.25} />
        </button>
        <div className="truncate text-center text-[17px] font-semibold tracking-tight text-ink">{title}</div>
        <div className="flex items-center justify-end">{trailing}</div>
      </div>
    </header>
  );
}

/** Page wrapper with the standard 16px gutter. */
export function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn("px-4 pb-8", className)}>{children}</main>;
}

export function LargeTitle({
  children,
  subtitle,
  className,
}: {
  children: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pb-4 pt-2", className)}>
      <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">{children}</h1>
      {subtitle && <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{subtitle}</p>}
    </div>
  );
}

/** Inset grouped section, like iOS Settings. */
export function Group({
  title,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("mt-6", className)}>
      {title && <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-3">{title}</h2>}
      <div className={cn("overflow-hidden rounded-[20px] bg-surface", bodyClassName)}>{children}</div>
      {footer && <p className="mt-2 px-1 text-[13px] leading-snug text-ink-3">{footer}</p>}
    </section>
  );
}

/** A row inside a Group. Renders as a button when onClick is provided. */
export function Row({
  icon,
  label,
  detail,
  value,
  trailing,
  onClick,
  chevron,
  destructive,
  className,
  disabled,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  detail?: React.ReactNode;
  value?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const content = (
    <>
      {icon && (
        <span className={cn("flex size-8 shrink-0 items-center justify-center text-ink-2", destructive && "text-danger")}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate text-[16px] leading-snug text-ink", destructive && "text-danger")}>{label}</span>
        {detail && <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{detail}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-[15px] tabular-nums text-ink-2">{value}</span>}
      {trailing}
      {chevron && <ChevronRight className="size-4 shrink-0 text-ink-3" />}
    </>
  );
  const base = cn(
    "relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 border-t border-hairline first:border-t-0",
    className,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cn(base, "transition-colors active:bg-surface-2 disabled:opacity-40")}>
        {content}
      </button>
    );
  }
  return <div className={base}>{content}</div>;
}

/** Single-choice row with a radio mark, for pickers such as the printer choice. */
export function ChoiceRow({
  label,
  detail,
  selected,
  onSelect,
}: {
  label: React.ReactNode;
  detail?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex min-h-[60px] w-full items-center gap-3 border-t border-hairline px-4 py-3 text-left transition-colors first:border-t-0 active:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium text-ink">{label}</span>
        {detail && <span className="mt-0.5 block text-[13px] text-ink-3">{detail}</span>}
      </span>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
          selected ? "bg-brand text-on-brand" : "border-[1.5px] border-hairline-strong",
        )}
      >
        {selected && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

type SegOption<T extends string> = { value: T; label: React.ReactNode; disabled?: boolean };

/** Segmented control with a sliding thumb. Radio-group semantics for screen readers. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const w = 100 / options.length;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("relative grid h-10 select-none rounded-full bg-surface-2 p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="sliding-pill absolute bottom-1 top-1 left-1 rounded-full bg-surface shadow-[0_1px_3px_rgba(17,19,24,0.12)] dark:bg-surface-3"
        style={{ width: `calc(${w}% - 4px)`, transform: `translateX(calc(${idx * 100}% + ${idx * 4}px))` }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => !o.disabled && onChange(o.value)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 rounded-full px-2 text-[14px] font-medium transition-colors",
              active ? "text-ink" : "text-ink-2",
              o.disabled && "cursor-not-allowed opacity-35",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type ButtonProps = React.ComponentProps<"button"> & { loading?: boolean };

export function PrimaryButton({ className, children, loading, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "press inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-brand px-5 text-[16px] font-semibold text-on-brand",
        "hover:bg-brand-press disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      {loading ? <Loader2 className="size-5 animate-spin" /> : children}
    </button>
  );
}

export function SecondaryButton({ className, children, loading, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "press inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-surface-2 px-5 text-[16px] font-semibold text-ink",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      {loading ? <Loader2 className="size-5 animate-spin" /> : children}
    </button>
  );
}

export function TextButton({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn("press inline-flex min-h-11 items-center justify-center gap-1.5 px-2 text-[15px] font-medium text-brand-text disabled:opacity-40", className)}
    >
      {children}
    </button>
  );
}

/** Sticky bottom action area that stays inside the phone column. Pair with `ActionBarSpacer`. */
export function ActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      <div
        className={cn(
          "mx-auto w-full max-w-[440px] border-t border-hairline bg-canvas/90 px-4 pt-3 backdrop-blur-md pad-safe-bottom",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ActionBarSpacer({ size = 120 }: { size?: number }) {
  return <div aria-hidden style={{ height: size }} />;
}

export function Stepper({
  value,
  onDecrement,
  onIncrement,
  min = 1,
  max = 99,
  children,
}: {
  value: number | string;
  onDecrement: () => void;
  onIncrement: () => void;
  min?: number;
  max?: number;
  children?: React.ReactNode;
}) {
  const n = Number(value) || 0;
  const btn =
    "press flex size-9 items-center justify-center rounded-full text-[20px] leading-none text-ink disabled:opacity-30 active:bg-surface-3";
  return (
    <div className="flex items-center gap-1 rounded-full bg-surface-2 p-0.5">
      <button type="button" className={btn} onClick={onDecrement} disabled={n <= min} aria-label="Decrease">
        −
      </button>
      {children ?? <span className="w-8 text-center text-[16px] font-semibold tabular-nums">{value}</span>}
      <button type="button" className={btn} onClick={onIncrement} disabled={n >= max} aria-label="Increase">
        +
      </button>
    </div>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    brand: "bg-brand-soft text-brand-text",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  } as const;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="px-1 text-[14px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="px-1 text-[13px] text-danger">{error}</p>
      ) : hint ? (
        <p className="px-1 text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/** Password input with show/hide and a caps-lock hint (a common cause of failed sign-ins on phones). */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [show, setShow] = React.useState(false);
  const [caps, setCaps] = React.useState(false);
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  return (
    <Field label={label} htmlFor={id} hint={caps ? "Caps Lock is on." : undefined}>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCaps(false)}
          className={cn(inputClass, "pr-14")}
          disabled={disabled}
          required={required}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute inset-y-0 right-1 flex w-12 items-center justify-center text-[13px] font-semibold text-brand-text"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </Field>
  );
}

export const inputClass =
  "h-[52px] w-full rounded-[14px] border border-hairline-strong bg-surface px-4 text-[16px] text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] focus:border-brand-text focus:ring-4 focus:ring-brand-soft disabled:opacity-50";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-[30ch] text-[15px] text-ink-2">{body}</p>}
      {action && <div className="mt-5 w-full max-w-[240px]">{action}</div>}
    </div>
  );
}
