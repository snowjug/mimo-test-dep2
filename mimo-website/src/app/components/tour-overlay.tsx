import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { hasTourCompleted, useTour } from "../utils/tour-context";

type Rect = { top: number; left: number; width: number; height: number };

const ratesClose = (a: Rect, b: Rect) =>
  Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/** Tracks a target element's live screen position by selector -- never a hardcoded coordinate. Re-measures
 * every frame while a step is showing, so resizing, scrolling, orientation change or content reflow (e.g.
 * going from desktop to mobile width) keeps the spotlight correctly attached with no extra wiring. */
function useTargetRect(selector: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        setRect((prev) => (prev === null ? prev : null));
      } else {
        const r = el.getBoundingClientRect();
        const next = { top: r.top, left: r.left, width: r.width, height: r.height };
        setRect((prev) => (prev && ratesClose(prev, next) ? prev : next));
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [selector]);
  return rect;
}

function TourCard({
  rect,
  title,
  body,
  index,
  total,
  isLast,
  onNext,
  onPrev,
  onSkip,
  onClose,
}: {
  rect: Rect;
  title: string;
  body: string;
  index: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const cardRect = card.getBoundingClientRect();
    const margin = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - (rect.top + rect.height);
    const spaceAbove = rect.top;

    let top: number;
    if (spaceBelow >= cardRect.height + margin || spaceBelow >= spaceAbove) {
      top = rect.top + rect.height + margin;
    } else {
      top = rect.top - cardRect.height - margin;
    }
    top = Math.max(12, Math.min(top, vh - cardRect.height - 12));

    let left = rect.left + rect.width / 2 - cardRect.width / 2;
    left = Math.max(12, Math.min(left, vw - cardRect.width - 12));

    setStyle({ top, left, opacity: 1 });
  }, [rect.top, rect.left, rect.width, rect.height]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      className="fixed z-[999] w-[min(320px,calc(100vw-24px))] rounded-[18px] bg-surface p-4 shadow-float motion-safe:transition-all motion-safe:duration-300"
      style={style}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-ink-3">
          Step {index + 1} of {total}
        </p>
        <button
          type="button"
          aria-label="Close tutorial"
          onClick={onClose}
          className="press -mr-1 -mt-1 flex size-7 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
        >
          <X className="size-4" />
        </button>
      </div>
      <h3 id="tour-title" className="mt-1 text-[17px] font-semibold text-ink">
        {title}
      </h3>
      <p id="tour-body" className="mt-1 text-[14px] leading-snug text-ink-2">
        {body}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={onSkip} className="press -ml-1 rounded-full px-2 py-1.5 text-[13px] font-medium text-ink-3 active:bg-surface-2">
          Skip
        </button>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button type="button" onClick={onPrev} className="press rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 active:bg-surface-2">
              Back
            </button>
          )}
          <button type="button" onClick={onNext} className="press rounded-full bg-brand px-4 py-1.5 text-[13px] font-semibold text-on-brand active:bg-brand-press">
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all motion-safe:duration-300 ${i === index ? "w-5 bg-brand" : "w-1.5 bg-surface-3"}`} />
        ))}
      </div>
    </div>
  );
}

/** Mounted once, inside the router (DashboardLayout), above all real page content. Dims the whole screen
 * except a live-tracked cutout around the step's real target element; the dimmed layer never captures
 * pointer events, so the spotlighted element (and the rest of the page) stays genuinely interactive --
 * a real upload or a real tap on Continue is what naturally advances a new user through the tour. */
export function TourOverlay() {
  const { active, stepIndex, steps, start, next, prev, skip, close, goTo } = useTour();
  const location = useLocation();

  // Offer the tour to a genuinely new visitor the first time they land on the upload page (home) --
  // re-evaluated on every route change (unlike a check at the App root, which only runs once per full
  // page load and would miss a client-side navigation from e.g. /login to /upload). No extra "already
  // offered" ref guard here: `active` and hasTourCompleted() already make this fully idempotent on their
  // own -- once started, `active` blocks a re-trigger; once closed/skipped/finished, completion blocks it
  // permanently. (A ref guard was tried first but is wrong under React 18 StrictMode in dev: the effect's
  // first of its two intentional invocations sets the ref before its own timeout fires, so the second,
  // surviving invocation would see the ref already set and silently skip scheduling anything.)
  useEffect(() => {
    if (location.pathname !== "/upload") return;
    if (active || hasTourCompleted()) return;
    // Give the page a beat to finish its own identity/data bootstrap before dimming it.
    const t = setTimeout(() => start(), 600);
    return () => clearTimeout(t);
  }, [location.pathname, active, start]);

  const step = steps[stepIndex];
  const onThisPage = active && Boolean(step) && location.pathname === step.path;
  const rect = useTargetRect(onThisPage ? step.selector : null);

  // Keep the tour aligned to real navigation: if the user's ACTUAL route changes while the active step
  // still points at the page they just left (e.g. they clicked the real Continue button and genuinely
  // navigated from "/upload" to "/print-options"), jump to the first step belonging to the page they're
  // now on. Deliberately triggered ONLY by `location.pathname` changing (a real navigation), not by
  // `stepIndex`/`step` -- a stale, buggy version of this effect also re-ran whenever the user clicked the
  // tour's own Next button, which advances stepIndex locally onto a step for a page they have NOT
  // actually navigated to yet. That made it "helpfully" snap stepIndex straight back to an earlier step
  // still matching the CURRENT page, which looked like Next doing nothing or going backwards in a loop.
  // Reading the current step via a ref (not a dependency) avoids re-triggering on stepIndex changes.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!active) return;
    const current = stepRef.current;
    if (!current || current.path === location.pathname) return;
    const matchIndex = steps.findIndex((s) => s.path === location.pathname);
    if (matchIndex !== -1) goTo(matchIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes `step`; see comment above.
  }, [active, location.pathname, steps, goTo]);

  // Some steps on the same page are mutually exclusive in the real DOM -- e.g. the upload page shows
  // either the empty dropzone (step 1's target) OR the file list + Continue button (step 2's target),
  // never both, depending on whether the user already has files. A user who restarts the tour while
  // already past that point (already has files) would otherwise get stuck forever on a step whose target
  // can never appear. After a brief grace period (in case the element is just about to mount), look ahead
  // for a later step on the SAME route whose target already exists in the real DOM, and jump to it --
  // this reflects the real UI state rather than forcing a step that no longer applies.
  useEffect(() => {
    if (!onThisPage || rect) return;
    const t = setTimeout(() => {
      for (let i = stepIndex + 1; i < steps.length; i++) {
        if (steps[i].path !== step.path) break;
        if (document.querySelector(steps[i].selector)) {
          goTo(i);
          return;
        }
      }
    }, 900);
    return () => clearTimeout(t);
  }, [onThisPage, rect, stepIndex, step, steps, goTo]);

  useEffect(() => {
    if (!onThisPage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft" && stepIndex > 0) prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onThisPage, next, prev, close, stepIndex]);

  // Gracefully show nothing when: the tour isn't active, the current step belongs to a different route
  // (the user hasn't naturally reached it yet), or the target element isn't mounted on this screen size
  // (e.g. a desktop-only element). The tour simply resumes once the element appears.
  if (!onThisPage || !rect) return null;

  const pad = 8;

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed z-[997] pointer-events-none motion-safe:transition-all motion-safe:duration-300 ease-out"
        style={{
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          borderRadius: 16,
          boxShadow: "0 0 0 9999px rgba(10,12,16,0.62), 0 0 0 3px rgba(255,255,255,0.9)",
        }}
      />
      <TourCard
        rect={rect}
        title={step.title}
        body={step.body}
        index={stepIndex}
        total={steps.length}
        isLast={stepIndex === steps.length - 1}
        onNext={next}
        onPrev={prev}
        onSkip={skip}
        onClose={close}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {`Step ${stepIndex + 1} of ${steps.length}: ${step.title}. ${step.body}`}
      </span>
    </>
  );
}
