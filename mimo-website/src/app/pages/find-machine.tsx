import { useNavigate } from "react-router-dom";
import { MapPin, Printer } from "lucide-react";
import { AppBar, Screen, StatusPill } from "../components/mimo/ui";

interface MachineLocation {
  id: string;
  name: string;
  location: string;
  details: string;
  image: string | null;
  colour: boolean;
  isAvailable: boolean;
}

const machines: MachineLocation[] = [
  {
    id: "1.0",
    name: "MIMO 1.0",
    location: "CV Raman Block",
    details: "1st Floor, Entrance",
    image: "/images/machines/cv-raman-block-780.jpg",
    colour: false,
    isAvailable: true,
  },
  {
    id: "2.0",
    name: "MIMO 2.0",
    location: "Central Library",
    details: "Entrance (Left Side)",
    image: "/images/machines/central-library-780.jpg",
    colour: true,
    isAvailable: true,
  },
  {
    id: "3.0",
    name: "MIMO 3.0",
    location: "Jain University",
    details: "Main Block, Ground Floor (Near Entrance)",
    image: null,
    colour: false,
    isAvailable: false,
  },
  {
    id: "4.0",
    name: "MIMO 4.0",
    location: "Presidency University",
    details: "Library Block, Ground Floor (Left Side)",
    image: null,
    colour: false,
    isAvailable: false,
  },
];

export function FindMachine() {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      window.location.href = "/";
    }
  };

  const live = machines.filter((m) => m.isAvailable);
  const soon = machines.filter((m) => !m.isAvailable);

  return (
    <div className="min-h-[100dvh]">
      <AppBar title="Find a kiosk" onBack={handleBack} />
      <Screen>
        <div className="pb-5 pt-2">
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink">Where to print</h1>
          <p className="mt-1.5 text-[15px] text-ink-2">Colour printing is only on MIMO 2.0 at the Central Library.</p>
        </div>

        <div className="flex flex-col gap-4">
          {live.map((m, i) => (
            <article key={m.id} className="rise-in overflow-hidden rounded-[20px] bg-surface" style={{ animationDelay: `${i * 60}ms` }}>
              {m.image && (
                <img
                  src={m.image}
                  alt={`${m.name} kiosk at the ${m.location}`}
                  width={800}
                  height={500}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  className="aspect-[16/10] w-full bg-surface-2 object-cover"
                />
              )}
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h2 className="text-[18px] font-semibold tracking-tight text-ink">{m.name}</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-[15px] text-ink-2">
                    <MapPin className="size-4 shrink-0 text-ink-3" /> {m.location}
                  </p>
                  <p className="mt-0.5 pl-[22px] text-[13px] text-ink-3">{m.details}</p>
                </div>
                <StatusPill tone={m.colour ? "brand" : "neutral"}>{m.colour ? "Colour and B&W" : "B&W"}</StatusPill>
              </div>
            </article>
          ))}
        </div>

        <h2 className="mb-2 mt-8 px-1 text-[13px] font-medium text-ink-3">Coming soon</h2>
        <div className="overflow-hidden rounded-[20px] bg-surface">
          {soon.map((m) => (
            <div key={m.id} className="flex items-center gap-3 border-t border-hairline px-4 py-3 first:border-t-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-ink-3">
                <Printer className="size-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] text-ink">{m.location}</span>
                <span className="mt-0.5 block text-[13px] text-ink-3">{m.details}</span>
              </span>
            </div>
          ))}
        </div>
      </Screen>
    </div>
  );
}
