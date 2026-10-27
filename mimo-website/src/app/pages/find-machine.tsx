import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  MapPin,
  MapPinOff,
  Navigation,
  Printer,
  Sparkles,
  Footprints,
  Compass,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { AppBar, Screen, StatusPill } from "../components/mimo/ui";
import api from "../api";

interface MachineLocation {
  id: string;
  name: string;
  location: string;
  details: string;
  image: string | null;
  colour: boolean;
  isAvailable: boolean;
  latitude?: number;
  longitude?: number;
  campusName?: string;
}

/** Hand-shot photos for the machines we have them for. Keyed by machineId. */
const MACHINE_IMAGES: Record<string, string> = {
  "CV-001": "/images/machines/cv-raman-block-780.jpg",
  "SV-002": "/images/machines/central-library-780.jpg",
};

/** Precise campus coordinates for fallback */
const FALLBACK_COORDS: Record<string, { latitude: number; longitude: number }> = {
  "CV-001": { latitude: 13.116712, longitude: 77.634768 },
  "SV-002": { latitude: 13.1147477, longitude: 77.635318 },
};

/** Same four machines as before, used only until the /api/machines fetch resolves (and if it fails). */
const FALLBACK_MACHINES: MachineLocation[] = [
  {
    id: "CV-001",
    name: "MIMO 1.0",
    location: "CV Raman Block",
    details: "1st Floor, Entrance",
    image: MACHINE_IMAGES["CV-001"],
    colour: false,
    isAvailable: true,
    latitude: 13.116712,
    longitude: 77.634768,
    campusName: "REVA University",
  },
  {
    id: "SV-002",
    name: "MIMO 2.0",
    location: "Central Library",
    details: "Entrance (Left Side)",
    image: MACHINE_IMAGES["SV-002"],
    colour: true,
    isAvailable: true,
    latitude: 13.1147477,
    longitude: 77.635318,
    campusName: "REVA University",
  },
  {
    id: "3.0",
    name: "MIMO 3.0",
    location: "Jain University",
    details: "Main Block, Ground Floor (Near Entrance)",
    image: null,
    colour: false,
    isAvailable: false,
    campusName: "Jain University",
  },
  {
    id: "4.0",
    name: "MIMO 4.0",
    location: "Presidency University",
    details: "Library Block, Ground Floor (Left Side)",
    image: null,
    colour: false,
    isAvailable: false,
    campusName: "Presidency University",
  },
];

interface ApiMachine {
  machineId: string;
  displayName: string;
  locationName: string | null;
  details: string | null;
  campusName: string | null;
  latitude: number | null;
  longitude: number | null;
  capabilities: { colour?: boolean };
  available: boolean;
}

/** Haversine formula to compute distance in meters between two lat/lng coordinates */
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/** Human-readable distance */
function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Human-readable walking time (~75 meters/min) */
function formatWalkTime(meters: number): string {
  const mins = Math.max(1, Math.round(meters / 75));
  return `~${mins} min walk`;
}

/** Google Maps walking directions with optional user origin */
const directionsUrl = (latitude: number, longitude: number, userLat?: number, userLng?: number) => {
  if (userLat !== undefined && userLng !== undefined) {
    return `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${latitude},${longitude}&travelmode=walking`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=walking`;
};

export function FindMachine() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [machines, setMachines] = useState<MachineLocation[]>(FALLBACK_MACHINES);

  // Geolocation states
  const [locationStatus, setLocationStatus] = useState<
    "prompt" | "requesting" | "granted" | "denied" | "error" | "unsupported"
  >("prompt");
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [expandedPathKioskId, setExpandedPathKioskId] = useState<string | null>(null);

  // Fetch machines from API
  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const response = await api.get<{ machines: ApiMachine[] }>("/api/machines");
        const list = response.data?.machines;
        if (!list || list.length === 0) return;
        setMachines(
          list.map((m) => {
            const fallback = FALLBACK_COORDS[m.machineId];
            return {
              id: m.machineId,
              name: m.displayName,
              location: m.locationName || "",
              details: m.details || "",
              campusName: m.campusName || "REVA University",
              image: MACHINE_IMAGES[m.machineId] ?? null,
              colour: Boolean(m.capabilities?.colour),
              isAvailable: m.available,
              latitude: m.latitude ?? fallback?.latitude ?? undefined,
              longitude: m.longitude ?? fallback?.longitude ?? undefined,
            };
          })
        );
      } catch (error) {
        console.error("Failed to fetch machine list:", error);
      }
    };
    fetchMachines();
  }, []);

  // Request location handler
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("unsupported");
      setLocationError("Geolocation is not supported by your browser");
      toast.error("Location services are not supported by your device");
      return;
    }

    setLocationStatus("requesting");
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setUserCoords(coords);
        setLocationStatus("granted");
        setLocationError(null);
        toast.success("Location enabled! Showing the nearest kiosk to you.");
      },
      (err) => {
        console.warn("Geolocation error:", err);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus("denied");
          setLocationError(
            "Location permission was denied. Please turn on location in your browser or device settings."
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationStatus("error");
          setLocationError("Location information is currently unavailable. Please ensure GPS is enabled.");
        } else {
          setLocationStatus("error");
          setLocationError("Timed out trying to detect your location. Please try again.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, []);

  // Auto-prompt location if query param ?locate=1 or if permission is already granted
  useEffect(() => {
    const shouldLocate = searchParams.get("locate") === "1" || searchParams.get("locate") === "true";

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((permissionStatus) => {
          if (permissionStatus.state === "granted" || shouldLocate) {
            requestLocation();
          }
          permissionStatus.onchange = () => {
            if (permissionStatus.state === "granted") {
              requestLocation();
            } else if (permissionStatus.state === "denied") {
              setLocationStatus("denied");
            }
          };
        })
        .catch(() => {
          if (shouldLocate) {
            requestLocation();
          }
        });
    } else if (shouldLocate) {
      requestLocation();
    }
  }, [searchParams, requestLocation]);

  // Compute distances and sort machines when user location is available
  const { liveWithDistance, nearestKiosk, soonMachines } = useMemo(() => {
    const available = machines.filter((m) => m.isAvailable);
    const unavailable = machines.filter((m) => !m.isAvailable);

    if (!userCoords) {
      return {
        liveWithDistance: available.map((m) => ({ ...m, distance: null })),
        nearestKiosk: null,
        soonMachines: unavailable,
      };
    }

    const calculated = available.map((m) => {
      if (m.latitude !== undefined && m.longitude !== undefined) {
        const dist = calculateDistanceMeters(
          userCoords.latitude,
          userCoords.longitude,
          m.latitude,
          m.longitude
        );
        return { ...m, distance: dist };
      }
      return { ...m, distance: null };
    });

    // Sort by distance ascending
    calculated.sort((a, b) => {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });

    const nearest = calculated.length > 0 && calculated[0].distance !== null ? calculated[0] : null;

    return {
      liveWithDistance: calculated,
      nearestKiosk: nearest,
      soonMachines: unavailable,
    };
  }, [machines, userCoords]);

  // Auto-expand the nearest kiosk path when detected for the first time
  useEffect(() => {
    if (nearestKiosk && !expandedPathKioskId) {
      setExpandedPathKioskId(nearestKiosk.id);
    }
  }, [nearestKiosk]);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div className="min-h-[100dvh]">
      <AppBar title="Find a kiosk" onBack={handleBack} />
      <Screen>
        {/* Page Header */}
        <div className="pb-4 pt-2">
          <h1 className="text-[28px] sm:text-[30px] font-bold leading-[1.15] tracking-[-0.03em] text-ink">
            Nearby Kiosks
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-2">
            Find the closest MIMO kiosk on campus and follow the walking path to print your documents.
          </p>
        </div>

        {/* 1. Turn on Location Prompt & Status Card */}
        <section aria-label="Location Status" className="mb-4">
          {locationStatus === "prompt" && (
            <div className="rise-in relative overflow-hidden rounded-[20px] border border-brand/20 bg-brand-soft/60 p-4 sm:p-5 shadow-xs">
              <div className="flex items-start gap-3.5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand text-white shadow-xs">
                  <Compass className="size-6 animate-pulse" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[16px] font-bold text-ink">Turn on location to know nearby kiosk</h2>
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[10.5px] font-semibold text-white">
                      Recommended
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
                    Turn on your device location to instantly discover the closest kiosk to you and view the path to walk there.
                  </p>
                  <div className="mt-3.5">
                    <button
                      type="button"
                      onClick={requestLocation}
                      className="press inline-flex items-center gap-2 rounded-[12px] bg-brand px-4 py-2.5 text-[14px] font-semibold text-white shadow-xs hover:bg-brand-press transition-all"
                    >
                      <MapPin className="size-4" strokeWidth={2.2} />
                      <span>Turn On Location</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {locationStatus === "requesting" && (
            <div className="flex items-center gap-3 rounded-[18px] bg-surface p-4 border border-hairline shadow-xs">
              <Loader2 className="size-5 shrink-0 animate-spin text-brand" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">Locating your device...</p>
                <p className="text-[12.5px] text-ink-3">Calculating distances to nearby campus kiosks</p>
              </div>
            </div>
          )}

          {(locationStatus === "denied" || locationStatus === "error" || locationStatus === "unsupported") && (
            <div className="rounded-[18px] border border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-semibold text-amber-950 dark:text-amber-200">
                    Turn on location to see the nearby kiosk
                  </h3>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-amber-800 dark:text-amber-300">
                    {locationError ||
                      "Location is currently turned off. Please allow location permissions in your browser or device settings to show the closest kiosk and walking path."}
                  </p>
                  <button
                    type="button"
                    onClick={requestLocation}
                    className="press mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700 transition-colors"
                  >
                    <RotateCw className="size-3.5" />
                    <span>Try Again</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {locationStatus === "granted" && nearestKiosk && (
            <div className="flex items-center justify-between rounded-[16px] bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/40 px-3.5 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[13px] font-medium text-emerald-900 dark:text-emerald-200 truncate">
                  Location active • <strong className="font-semibold">{nearestKiosk.name}</strong> is nearest to you ({formatDistance(nearestKiosk.distance!)})
                </span>
              </div>
              <button
                type="button"
                onClick={requestLocation}
                title="Refresh current location"
                className="press shrink-0 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline px-2 py-1"
              >
                Refresh
              </button>
            </div>
          )}
        </section>

        {/* 2. Color vs Black & White Printing Notice (MANDATORY REQUIREMENT) */}
        <section aria-label="Printer Capabilities Notice" className="mb-5">
          <div className="rounded-[18px] border border-hairline/80 bg-surface p-4 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-text">
                <Sparkles className="size-4.5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[14px] font-bold text-ink">Printer Capabilities Guide</h2>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-2">
                    Notice
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                  <strong className="text-ink font-semibold">Colour printing is ONLY available on MIMO 2.0 (Central Library)</strong>.
                  Black and white kiosks (such as MIMO 1.0 at CV Raman Block) only support B&W prints.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2 text-[11.5px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-brand-text">
                    <span className="size-1.5 rounded-full bg-brand" />
                    MIMO 2.0: Colour & B&W
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-ink-2">
                    <span className="size-1.5 rounded-full bg-ink-3" />
                    MIMO 1.0: Black & White Only
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Kiosks List with Nearest Kiosk Highlight & Walking Path */}
        <div className="flex flex-col gap-4">
          {liveWithDistance.map((m, i) => {
            const isNearest = nearestKiosk?.id === m.id;
            const isPathExpanded = expandedPathKioskId === m.id;

            return (
              <article
                key={m.id}
                className={`rise-in relative overflow-hidden rounded-[20px] bg-surface transition-all ${
                  isNearest
                    ? "ring-2 ring-brand border-transparent shadow-md"
                    : "border border-hairline shadow-xs"
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Nearest Kiosk Ribbon */}
                {isNearest && (
                  <div className="flex items-center justify-between bg-brand px-4 py-1.5 text-white">
                    <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider">
                      <Sparkles className="size-3.5 text-amber-300" />
                      <span>Nearest Kiosk To You</span>
                    </div>
                    {m.distance !== null && (
                      <span className="text-[12px] font-semibold text-white/90 tabular-nums">
                        {formatDistance(m.distance)} • {formatWalkTime(m.distance)}
                      </span>
                    )}
                  </div>
                )}

                {/* Machine Image */}
                {m.image && (
                  <div className="relative">
                    <img
                      src={m.image}
                      alt={`${m.name} kiosk at the ${m.location}`}
                      width={800}
                      height={500}
                      loading={i === 0 ? "eager" : "lazy"}
                      decoding="async"
                      className="aspect-[16/10] w-full bg-surface-2 object-cover"
                    />
                    {/* Distance floating pill over image */}
                    {m.distance !== null && (
                      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-ink/80 backdrop-blur-md px-3 py-1 text-[12px] font-semibold text-white shadow-sm">
                        <Footprints className="size-3.5" />
                        <span>{formatDistance(m.distance)} ({formatWalkTime(m.distance)})</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Info Header */}
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-[19px] font-bold tracking-tight text-ink">{m.name}</h2>
                        {isNearest && (
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-text">
                            Closest
                          </span>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-[15px] font-medium text-ink">
                        <MapPin className="size-4 shrink-0 text-brand-text" /> {m.location}
                      </p>
                      <p className="mt-0.5 pl-[22px] text-[13px] text-ink-3">{m.details}</p>
                    </div>

                    {/* Printer Capability Badge */}
                    <div className="shrink-0 text-right">
                      <StatusPill tone={m.colour ? "brand" : "neutral"}>
                        {m.colour ? "Colour and B&W" : "B&W Only"}
                      </StatusPill>
                    </div>
                  </div>

                  {/* Capability Detail Note */}
                  <div className="mt-2.5 rounded-[12px] bg-surface-2/60 px-3 py-2 text-[12px] text-ink-2">
                    {m.colour ? (
                      <span className="flex items-center gap-1.5 font-medium text-brand-text">
                        <Sparkles className="size-3.5 text-brand" />
                        <span>Supports both Colour and Black & White printing</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-ink-2">
                        <Info className="size-3.5 text-ink-3" />
                        <span>Black & White printing only (No colour print available at this kiosk)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Path to that Kiosk & Navigation Actions */}
                <div className="border-t border-hairline px-4 py-3 bg-canvas/30">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedPathKioskId(isPathExpanded ? null : m.id)}
                      className="press flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-surface-2 hover:bg-surface-3 text-[14px] font-semibold text-ink transition-colors"
                      aria-expanded={isPathExpanded}
                    >
                      <Footprints className="size-4 text-brand-text" />
                      <span>{isPathExpanded ? "Hide Walking Path" : "View Walking Path"}</span>
                      {isPathExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>

                    {m.latitude !== undefined && m.longitude !== undefined && (
                      <a
                        href={directionsUrl(m.latitude, m.longitude, userCoords?.latitude, userCoords?.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Get walking directions to ${m.name} in Google Maps`}
                        className="press inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-brand px-4 text-[14px] font-semibold text-white hover:bg-brand-press transition-colors shrink-0"
                      >
                        <Navigation className="size-4" strokeWidth={2.2} />
                        <span>Directions</span>
                        <ExternalLink className="size-3.5 opacity-70" />
                      </a>
                    )}
                  </div>

                  {/* 4. Detailed Walking Path View (When expanded) */}
                  {isPathExpanded && (
                    <div className="mt-3.5 rounded-[16px] bg-surface border border-hairline p-4 rise-in">
                      <div className="flex items-center justify-between pb-2 border-b border-hairline">
                        <span className="text-[13px] font-bold text-ink">Walking Path to {m.name}</span>
                        {m.distance !== null && (
                          <span className="text-[12px] font-semibold text-brand-text tabular-nums">
                            {formatDistance(m.distance)} • {formatWalkTime(m.distance)}
                          </span>
                        )}
                      </div>

                      {/* Visual Path Diagram */}
                      <div className="py-3">
                        <div className="relative pl-7 space-y-4">
                          {/* Dotted connecting line */}
                          <div className="absolute left-[11px] top-2 bottom-3 w-0.5 border-l-2 border-dashed border-brand/40" />

                          {/* Step 1: User's position */}
                          <div className="relative flex items-start">
                            <span className="absolute -left-7 flex size-6 items-center justify-center rounded-full bg-brand-soft ring-4 ring-surface">
                              <span className="size-2 rounded-full bg-brand animate-ping" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-ink">
                                {userCoords ? "Your Current Spot" : "Start from your location"}
                              </p>
                              <p className="text-[11.5px] text-ink-3">
                                {userCoords ? "GPS location detected" : "Turn on location for live walking distance"}
                              </p>
                            </div>
                          </div>

                          {/* Step 2: Head to building */}
                          <div className="relative flex items-start">
                            <span className="absolute -left-7 flex size-6 items-center justify-center rounded-full bg-surface-2 ring-4 ring-surface">
                              <Footprints className="size-3 text-ink-2" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-ink">Walk to {m.location}</p>
                              <p className="text-[11.5px] text-ink-3">
                                Follow campus paths toward {m.campusName || "the building"}
                              </p>
                            </div>
                          </div>

                          {/* Step 3: Destination Kiosk */}
                          <div className="relative flex items-start">
                            <span className="absolute -left-7 flex size-6 items-center justify-center rounded-full bg-brand ring-4 ring-surface text-white">
                              <Printer className="size-3" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-ink">
                                {m.name} Kiosk ({m.details})
                              </p>
                              <p className="text-[11.5px] text-ink-3">
                                Spot the touch screen MIMO station and enter your 4-digit print code
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Color printing reminder inside path */}
                      {!m.colour && (
                        <div className="mt-2 rounded-[10px] bg-amber-50 dark:bg-amber-950/20 p-2.5 text-[12px] text-amber-900 dark:text-amber-200">
                          ⚠️ Note: This kiosk only prints in <strong>Black and White</strong>. If your job has colour pages, head to <strong>MIMO 2.0 (Central Library)</strong> instead.
                        </div>
                      )}

                      {/* Open Maps Direct Navigation */}
                      {m.latitude !== undefined && m.longitude !== undefined && (
                        <div className="mt-3">
                          <a
                            href={directionsUrl(m.latitude, m.longitude, userCoords?.latitude, userCoords?.longitude)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="press flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-brand text-[13px] font-semibold text-white hover:bg-brand-press transition-colors"
                          >
                            <Navigation className="size-4" strokeWidth={2.2} />
                            <span>Start Walking Route in Google Maps</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* Coming Soon Section (Preserved) */}
        <h2 className="mb-2 mt-8 px-1 text-[13px] font-semibold uppercase tracking-wider text-ink-3">
          Coming soon to other campuses
        </h2>
        <div className="overflow-hidden rounded-[20px] bg-surface border border-hairline shadow-xs">
          {soonMachines.map((m) => (
            <div key={m.id} className="flex items-center gap-3 border-t border-hairline px-4 py-3 first:border-t-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-ink-3">
                <Printer className="size-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{m.location}</span>
                <span className="mt-0.5 block text-[13px] text-ink-3">{m.details}</span>
              </span>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-3">
                Soon
              </span>
            </div>
          ))}
        </div>
      </Screen>
    </div>
  );
}

