import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { GUIDE_STEPS } from "../utils/how-to-print-steps";
import { hasTourCompleted, useTour } from "../utils/tour-context";

const FIRST_VISIT_DELAY_MS = 800;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The "How to print" guide: four plain steps in one card, shown on whatever page the customer is on.
 * It never points at buttons on other pages (the old spotlight tour did, and simply vanished whenever the
 * target was not on screen), so Next, Back and Close always do exactly what they say. Mounted once, inside the
 * router, so it can be opened from any header or help button and offered once to a brand-new visitor. */
export function HowToPrintGuide() {
  const { active, stepIndex, start, next, prev, close } = useTour();
  const location = useLocation();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Offer the guide once, to a genuinely new visitor, the first time they land on the upload page. Closing it
  // in any way marks it completed, so it is never offered again unprompted (the header button reopens it).
  useEffect(() => {
    if (location.pathname !== "/upload") return;
    if (active || hasTourCompleted()) return;
    const t = setTimeout(() => start(), FIRST_VISIT_DELAY_MS);
    return () => clearTimeout(t);
  }, [location.pathname, active, start]);

  // While open: stop the page behind from scrolling, move focus into the card, and give focus back on close.
  useLayoutEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primaryRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [active]);

  const isLast = stepIndex === GUIDE_STEPS.length - 1;
  const step = GUIDE_STEPS[stepIndex];

  const finish = () => {
    close();
    if (location.pathname !== "/upload") navigate("/upload");
  };
  const advance = () => (isLast ? finish() : next());

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowRight") {
        if (stepIndex < GUIDE_STEPS.length - 1) next();
      } else if (e.key === "ArrowLeft") {
        if (stepIndex > 0) prev();
      } else if (e.key === "Tab" && dialogRef.current) {
        // Keep keyboard focus inside the card while it is open.
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("disabled"));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stepIndex, next, prev, close]);

  if (!active || !step) return null;
  const Icon = step.icon;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
        className="rise-in w-full max-w-[420px] rounded-t-[28px] bg-surface px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-5 shadow-float sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-ink-3">
            How to print · Step {stepIndex + 1} of {GUIDE_STEPS.length}
          </p>
          <button
            type="button"
            aria-label="Close the guide"
            onClick={close}
            className="press -mr-2 flex size-9 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
          >
            <X className="size-5" />
          </button>
        </div>

        <div key={step.id} className="rise-in mt-5">
          <div className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-text">
            <Icon className="size-7" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h2 id="guide-title" className="mt-4 text-[22px] font-semibold leading-tight text-ink">
            {step.title}
          </h2>
          <p id="guide-body" className="mt-2 text-[16px] leading-snug text-ink-2">
            {step.body}
          </p>
          <p className="mt-4 rounded-[14px] bg-surface-2 px-3.5 py-3 text-[14px] leading-snug text-ink-2">
            <span className="font-semibold text-ink">Tip: </span>
            {step.tip}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden="true">
          {GUIDE_STEPS.map((s, i) => (
            <span key={s.id} className={`h-1.5 rounded-full transition-all motion-safe:duration-300 ${i === stepIndex ? "w-6 bg-brand" : "w-1.5 bg-surface-3"}`} />
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={prev}
              aria-label="Previous step"
              className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink active:bg-surface-3"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={advance}
            className="press h-12 flex-1 rounded-full bg-brand text-[16px] font-semibold text-on-brand active:bg-brand-press"
          >
            {isLast ? "Start printing" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
