import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { AdSenseBlock } from "../components/AdSenseBlock";
import { Group, PrimaryButton, Row } from "../components/mimo/ui";

export function DirectSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const kioskId = searchParams.get("kioskId") || "Kiosk";

  useEffect(() => {
    // Scroll to top
    window.scrollTo(0, 0);
  }, []);

  const destination =
    kioskId === "CV-001" ? "CV B&W - Reva Boys Hostel" : kioskId === "SV-002" ? "SV Color and B&W - Reva Girls Hostel" : kioskId;

  return (
    <div className="min-h-[100dvh] px-4 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <section className="rise-in flex flex-col items-center pt-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-8" strokeWidth={2.5} />
        </span>
        <h1 className="mt-6 text-[28px] font-semibold tracking-tight text-ink">Sent to the printer</h1>
        <p className="mt-2 max-w-[30ch] text-[15px] text-ink-2">
          It is already printing. No code needed, just collect your pages from the tray.
        </p>
      </section>

      <Group className="mt-8">
        <Row label="Printer" value={<span className="block max-w-[200px] truncate">{destination}</span>} />
      </Group>

      <section className="mt-8" aria-label="Sponsored">
        <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-3">Sponsored</h2>
        <div className="flex min-h-[100px] items-center justify-center overflow-hidden rounded-[20px] bg-surface p-2">
          <AdSenseBlock className="min-h-[100px] w-full overflow-hidden rounded-[14px]" />
        </div>
      </section>

      <div className="mt-8">
        <PrimaryButton onClick={() => navigate("/")}>Print something else</PrimaryButton>
      </div>
    </div>
  );
}
