import { ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";

const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/1j0U747Z8_zr2QGUKPhxTXqWQ9ycclQaAirKsew_BhCw/edit#responses";

/** Event promo on the home screen. Tapping the poster opens it full size in a sheet. */
export function HackathonBanner() {
  return (
    <section aria-label="Event" className="mt-8">
      <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-3">On campus</h2>
      <div className="flex gap-4 overflow-hidden rounded-[20px] bg-surface p-3">
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="press shrink-0 overflow-hidden rounded-[12px]" aria-label="View HACKathon 3.0 poster">
              <img
                src="/images/hackathon-poster.jpg"
                alt=""
                width={96}
                height={144}
                loading="lazy"
                decoding="async"
                className="h-36 w-24 object-cover"
              />
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>HACKathon 3.0</DialogTitle>
              <DialogDescription>School of Computer Science and Applications, REVA University</DialogDescription>
            </DialogHeader>
            <img
              src="/images/hackathon-poster.jpg"
              alt="HACKathon 3.0 poster: Solve for Society. AI, IoT, technology and innovation for real-world challenges. October 9, 2026, 12 hours, on campus."
              width={682}
              height={1024}
              loading="lazy"
              className="w-full rounded-[16px]"
            />
            <a
              href={GOOGLE_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-brand text-[16px] font-semibold text-on-brand"
            >
              Register <ArrowUpRight className="size-4" />
            </a>
          </DialogContent>
        </Dialog>

        <div className="flex min-w-0 flex-1 flex-col py-1">
          <p className="text-[13px] text-ink-3">REVA University, IEEE</p>
          <p className="mt-0.5 text-[20px] font-semibold leading-tight tracking-tight text-ink">HACKathon 3.0</p>
          <p className="mt-1 text-[14px] leading-snug text-ink-2">Solve for Society. AI, IoT and real-world problems.</p>
          <p className="mt-2 text-[13px] tabular-nums text-ink-2">9 Oct 2026, 12 hours, on campus</p>
          <a
            href={GOOGLE_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="press mt-auto inline-flex min-h-11 items-center gap-1 self-start text-[15px] font-semibold text-brand-text"
          >
            Register <ArrowUpRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
