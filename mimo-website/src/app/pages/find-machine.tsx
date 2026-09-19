import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Info } from "lucide-react";
import { motion } from "motion/react";

interface MachineLocation {
  id: string;
  badge: string;
  name: string;
  location: string;
  details: string;
  image: string | null;
  badgeBg: string;
  pinColor: string;
  blobColor: string;
  placeholderBg: string;
  placeholderIconColor: string;
  borderColor: string;
  isAvailable: boolean;
}

const machines: MachineLocation[] = [
  {
    id: "1.0",
    badge: "1.0",
    name: "MIMO 1.0",
    location: "CV Raman Block",
    details: "1st Floor, Entrance",
    image: "/images/machines/cv-raman-block.jpg",
    badgeBg: "bg-[#2563EB]",
    pinColor: "text-[#2563EB]",
    blobColor: "bg-blue-100/40",
    placeholderBg: "bg-blue-50/60",
    placeholderIconColor: "text-blue-500",
    borderColor: "border-blue-100/80",
    isAvailable: true,
  },
  {
    id: "2.0",
    badge: "2.0",
    name: "MIMO 2.0",
    location: "Central Library",
    details: "Entrance (Left Side)",
    image: "/images/machines/central-library.jpg",
    badgeBg: "bg-[#7C3AED]",
    pinColor: "text-[#7C3AED]",
    blobColor: "bg-purple-100/40",
    placeholderBg: "bg-purple-50/60",
    placeholderIconColor: "text-purple-500",
    borderColor: "border-purple-100/80",
    isAvailable: true,
  },
  {
    id: "3.0",
    badge: "3.0",
    name: "MIMO 3.0",
    location: "Jain University",
    details: "Main Block, Ground Floor\n(Near Entrance)",
    image: null,
    badgeBg: "bg-[#059669]",
    pinColor: "text-[#059669]",
    blobColor: "bg-emerald-100/40",
    placeholderBg: "bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-emerald-100/30",
    placeholderIconColor: "text-emerald-600/70",
    borderColor: "border-emerald-100/80",
    isAvailable: false,
  },
  {
    id: "4.0",
    badge: "4.0",
    name: "MIMO 4.0",
    location: "Presidency University",
    details: "Library Block, Ground Floor\n(Left Side)",
    image: null,
    badgeBg: "bg-[#EA580C]",
    pinColor: "text-[#EA580C]",
    blobColor: "bg-orange-100/40",
    placeholderBg: "bg-gradient-to-br from-orange-50/80 via-amber-50/40 to-orange-100/30",
    placeholderIconColor: "text-orange-500/70",
    borderColor: "border-orange-100/80",
    isAvailable: false,
  },
];

// Clean line-art printer icon matching reference mockup
function MinimalPrinterIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </svg>
  );
}

// Large feature printer illustration for desktop banner & mobile footer
function DecorativePrinterIllustration({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Top Paper */}
      <rect x="28" y="8" width="44" height="28" rx="4" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="3" />
      <line x1="36" y1="18" x2="64" y2="18" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="36" y1="25" x2="56" y2="25" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />

      {/* Main Printer Body */}
      <rect x="12" y="30" width="76" height="38" rx="10" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="3.5" />

      {/* Printer Paper Tray Output */}
      <rect x="24" y="52" width="52" height="26" rx="5" fill="#FFFFFF" stroke="#3B82F6" strokeWidth="3" />
      <line x1="32" y1="62" x2="68" y2="62" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="32" y1="69" x2="58" y2="69" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />

      {/* Status Light & Power Button */}
      <circle cx="76" cy="42" r="3" fill="#3B82F6" />
      <rect x="22" y="38" width="16" height="4" rx="2" fill="#93C5FD" />

      {/* Speed / Spark lines */}
      <path d="M4 42L0 44" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M96 42L100 44" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M6 35L2 34" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function FindMachine() {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F3F7FC] text-slate-800 antialiased font-['Inter',sans-serif] relative overflow-x-hidden selection:bg-blue-500 selection:text-white pb-16">
      {/* Decorative ambient background curves */}
      <div className="absolute top-0 right-0 w-[420px] h-[360px] bg-gradient-to-bl from-blue-200/30 via-indigo-100/20 to-transparent rounded-bl-full pointer-events-none -z-0 blur-2xl" />
      <div className="absolute top-40 left-0 w-[320px] h-[320px] bg-gradient-to-tr from-sky-100/40 via-blue-50/20 to-transparent rounded-tr-full pointer-events-none -z-0 blur-2xl" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 relative z-10">
        
        {/* Top Navigation / Back Button */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white text-blue-600 font-semibold text-xs sm:text-sm shadow-sm border border-slate-200/80 hover:bg-blue-50/70 hover:border-blue-200 transition-all cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center group-hover:-translate-x-0.5 transition-transform">
              <ArrowLeft className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <span>Back</span>
          </button>
        </div>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 sm:mb-6">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-[#E3EEFF] flex items-center justify-center shrink-0 shadow-sm border border-blue-200/60">
              <MapPin className="w-5 h-5 sm:w-7 sm:h-7 text-[#2563EB] fill-[#2563EB]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0B2A4A] tracking-tight">
                Find Machine
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Locate the nearest MIMO printing machine on campus and nearby locations.
              </p>
            </div>
          </div>

          {/* Decorative header accent */}
          <div className="hidden sm:flex items-center gap-2.5 opacity-90 pr-2">
            <span className="font-['Caveat',cursive,sans-serif] text-2xl font-bold text-[#2563EB] -rotate-3 select-none">
              Print Made Easy
            </span>
            <span className="text-yellow-400 font-bold text-lg select-none">✨</span>
            <MinimalPrinterIcon className="w-6 h-6 text-blue-500 ml-1 opacity-80" />
          </div>
        </div>

        {/* Color Printing Notice Banner */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-[#EAF2FF] border border-[#BFDBFE] rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 mb-6 sm:mb-8 flex items-center justify-between shadow-[0_4px_16px_-4px_rgba(59,130,246,0.12)]"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#3B82F6] text-white flex items-center justify-center shrink-0 shadow-sm">
              <Info className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            </div>
            <p className="text-xs sm:text-sm md:text-base text-[#0D3B66] leading-snug">
              <strong className="font-bold">Color printing is available only on MIMO 2.0 (Central Library).</strong>
            </p>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-blue-500 opacity-80 shrink-0">
            <DecorativePrinterIllustration className="w-9 h-8" />
          </div>
        </motion.div>

        {/* Machines Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          {machines.map((machine, idx) => (
            <motion.div
              key={machine.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
              className={`bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border ${machine.borderColor} shadow-[0_8px_24px_-6px_rgba(0,0,0,0.06)] hover:shadow-[0_14px_30px_-6px_rgba(37,99,235,0.14)] hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col justify-between`}
            >
              {/* Soft decorative corner blob */}
              <div
                className={`absolute -bottom-8 -right-8 w-28 h-28 rounded-full ${machine.blobColor} blur-xl pointer-events-none`}
              />

              {/* Mobile horizontal card layout container (on screens < md) / Vertical layout on md+ */}
              <div className="flex md:flex-col justify-between gap-3 h-full">
                
                {/* Information Column */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    {/* Top Row: Badge + Name */}
                    <div className="flex items-center gap-2.5 mb-2.5 sm:mb-3">
                      <div
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full ${machine.badgeBg} text-white font-bold text-xs sm:text-sm flex items-center justify-center shadow-sm shrink-0`}
                      >
                        {machine.badge}
                      </div>
                      <span className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
                        {machine.name}
                      </span>
                    </div>

                    {/* Location Section */}
                    <div className="flex items-start gap-2 sm:gap-2.5 mb-3">
                      <div className="mt-0.5 shrink-0">
                        <MapPin className={`w-4 h-4 ${machine.pinColor} stroke-[2.2]`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm sm:text-[15px] leading-tight">
                          {machine.location}
                        </h3>
                        <p className="text-xs sm:text-[13px] text-slate-500 mt-0.5 whitespace-pre-line leading-snug">
                          {machine.details}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Status Pill Badge (Mobile position: bottom of left column) */}
                  <div className="mt-2 md:hidden">
                    {machine.isAvailable ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] shadow-2xs">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>

                {/* Media / Visual Column */}
                <div className="w-[120px] sm:w-[140px] md:w-full h-[95px] sm:h-[110px] md:h-36 shrink-0 relative rounded-xl sm:rounded-2xl overflow-hidden border border-slate-100 shadow-2xs bg-slate-100 flex items-center justify-center group">
                  {machine.image ? (
                    <>
                      <img
                        src={machine.image}
                        alt={`${machine.name} - ${machine.location}`}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-40" />
                    </>
                  ) : (
                    /* Subtle Decorative Placeholder with Printer Icon for Coming Soon machines */
                    <div
                      className={`w-full h-full ${machine.placeholderBg} flex flex-col items-center justify-center relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500`}
                    >
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/70 backdrop-blur-xs flex items-center justify-center shadow-xs border border-white/80">
                        <MinimalPrinterIcon
                          className={`w-6 h-6 md:w-7 md:h-7 ${machine.placeholderIconColor}`}
                        />
                      </div>
                      <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-white/30 blur-md pointer-events-none" />
                    </div>
                  )}
                </div>

                {/* Status Pill Badge (Desktop position: below image/placeholder) */}
                <div className="hidden md:flex items-center justify-start mt-1">
                  {machine.isAvailable ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Available
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] shadow-2xs">
                      Coming Soon
                    </span>
                  )}
                </div>

              </div>
            </motion.div>
          ))}

          {/* 2-Column Span Feature Banner on Desktop (Columns 2 & 3 in Row 2) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="hidden lg:flex lg:col-span-2 bg-white/70 backdrop-blur-xs rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-blue-100/60 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.04)] items-center justify-around relative overflow-hidden min-h-[220px]"
          >
            {/* Soft decorative background glow */}
            <div className="absolute w-64 h-64 rounded-full bg-blue-100/40 blur-3xl pointer-events-none -z-0" />

            <div className="relative z-10 flex items-center justify-between w-full px-4 lg:px-8">
              {/* Handwritten script text with accents */}
              <div className="relative">
                <div className="flex items-center gap-1.5">
                  <span className="font-['Caveat',cursive,sans-serif] text-4xl lg:text-5xl font-bold text-[#2563EB] -rotate-6 select-none drop-shadow-xs">
                    Print Made Easy
                  </span>
                </div>
                {/* Yellow decorative accent rays */}
                <div className="absolute -top-3 -right-6 flex gap-1">
                  <span className="text-amber-400 font-black text-2xl select-none leading-none animate-pulse">
                    ✨
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gradient-to-r from-transparent via-amber-400/80 to-transparent rounded-full mt-1.5" />
              </div>

              {/* Line Art Printer Illustration */}
              <div className="text-blue-500 transform hover:scale-105 transition-transform duration-300 pr-4">
                <DecorativePrinterIllustration className="w-28 h-24 lg:w-36 lg:h-28" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Mobile bottom decorative unit */}
        <div className="flex lg:hidden flex-col items-center justify-center mt-8 pt-4 pb-2 text-center">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-['Caveat',cursive,sans-serif] text-2xl font-bold text-[#2563EB] -rotate-3 select-none">
              Print Made Easy
            </span>
            <span className="text-amber-400 font-bold text-lg select-none">✨</span>
          </div>
          <DecorativePrinterIllustration className="w-16 h-14 text-blue-500 opacity-90" />
        </div>

      </div>
    </div>
  );
}

export default FindMachine;
