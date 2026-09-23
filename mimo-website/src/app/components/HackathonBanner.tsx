import React, { useState } from "react";
import { Megaphone, Calendar, Clock, MapPin, ArrowRight, Lightbulb, Users, Rocket, Star, Sparkles, X, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/1j0U747Z8_zr2QGUKPhxTXqWQ9ycclQaAirKsew_BhCw/edit#responses";

export function HackathonBanner() {
  const [showPosterModal, setShowPosterModal] = useState(false);

  return (
    <>
      <div className="relative w-full rounded-2xl sm:rounded-3xl bg-white border border-slate-200/90 shadow-md sm:shadow-lg shadow-slate-200/50 overflow-hidden group transition-all duration-300 hover:shadow-xl">
        
        {/* Background Decorative Gradient Blobs */}
        <div className="absolute top-0 left-0 w-32 sm:w-48 h-32 sm:h-48 bg-gradient-to-br from-amber-200/40 via-orange-100/30 to-transparent rounded-full blur-xl sm:blur-2xl pointer-events-none -z-0" />
        <div className="absolute bottom-0 left-0 w-40 sm:w-64 h-32 sm:h-48 bg-gradient-to-tr from-amber-300/30 via-orange-100/20 to-transparent rounded-tr-full blur-xl sm:blur-2xl pointer-events-none -z-0" />
        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-48 sm:w-72 h-48 sm:h-72 bg-gradient-to-br from-purple-300/40 via-indigo-200/30 to-blue-200/20 rounded-full blur-2xl sm:blur-3xl pointer-events-none -z-0" />
        <div className="absolute bottom-0 right-0 w-36 sm:w-56 h-36 sm:h-56 bg-gradient-to-tl from-blue-400/25 via-sky-200/20 to-transparent rounded-tl-full blur-xl sm:blur-2xl pointer-events-none -z-0" />
        
        {/* Subtle Decorative Sparkle */}
        <div className="absolute top-2 sm:top-3 left-2 sm:left-3 text-amber-500/80 text-xs select-none pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
        </div>

        {/* Main Content: Single Horizontal Row on Mobile, Flex on Desktop */}
        <div className="relative z-10 p-2.5 sm:p-6 lg:p-7 flex flex-row items-center justify-between gap-2.5 sm:gap-6 lg:gap-8">
          
          {/* Left Side: Information & Branding Section */}
          <div className="flex-1 min-w-0 flex flex-col items-start justify-between">
            
            {/* Top Row: Event Spotlight Badge + Institution Logos */}
            <div className="w-full flex flex-wrap items-center gap-1 sm:gap-4 mb-1 sm:mb-4">
              {/* Event Spotlight Pill Badge */}
              <div className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-gradient-to-r from-[#F97316] via-[#EA580C] to-[#E11D48] text-white text-[7.5px] sm:text-xs font-black uppercase tracking-wider shadow-xs sm:shadow-sm shadow-orange-500/30 shrink-0 select-none">
                <Megaphone className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 fill-white stroke-none" />
                <span>Event Spotlight</span>
              </div>

              {/* Institution / Association Logos */}
              <div className="flex items-center py-0.5 px-1 sm:px-2 bg-white/80 backdrop-blur-xs rounded-lg sm:rounded-xl border border-slate-100 shadow-2xs">
                <img
                  src="/images/hackathon-logos.png"
                  alt="REVA University IEEE Student Branch | IEEE Computational Intelligence Society Bangalore Chapter | REVA University"
                  className="h-4 sm:h-7 md:h-8 w-auto object-contain"
                />
              </div>
            </div>

            {/* School / Subheading */}
            <h4 className="text-[9px] sm:text-sm md:text-base font-extrabold text-[#E11D48] tracking-wide mb-0.5 sm:mb-1.5 leading-tight truncate max-w-full">
              School of Computer Science &amp; Applications
            </h4>

            {/* Main Title Row: HACKathon 3.0 */}
            <div className="flex items-baseline gap-0.5 sm:gap-1 my-0 sm:my-1 flex-wrap">
              <span className="text-lg sm:text-5xl md:text-6xl font-black text-[#0A2540] tracking-tight leading-none">
                HACK
              </span>
              <span className="text-lg sm:text-5xl md:text-6xl font-black text-slate-800 tracking-tight leading-none">
                athon
              </span>
              <span className="text-lg sm:text-5xl md:text-6xl font-black bg-gradient-to-r from-[#F97316] via-[#EC4899] to-[#8B5CF6] bg-clip-text text-transparent ml-0.5 sm:ml-1 leading-none">
                3.0
              </span>
            </div>

            {/* Underline accent bar below title */}
            <div className="w-20 sm:w-64 h-0.5 sm:h-1.5 bg-gradient-to-r from-[#0A2540] via-[#F97316] to-[#8B5CF6] rounded-full my-0.5 sm:mb-2.5" />

            {/* Taglines */}
            <div className="mb-1.5 sm:mb-5">
              <p className="text-[7.5px] sm:text-xs md:text-sm font-black text-slate-900 tracking-[0.12em] sm:tracking-[0.22em] uppercase leading-none">
                SOLVE FOR SOCIETY
              </p>
              <p className="text-[8.5px] sm:text-sm text-slate-600 font-semibold leading-tight line-clamp-1 sm:line-clamp-none mt-0.5">
                AI &nbsp;|&nbsp; IoT &nbsp;|&nbsp; Technology &amp; Innovation for Real-World Challenges
              </p>
            </div>

            {/* 3 Detail Info Badges: Date, Duration, Venue */}
            <div className="w-full flex flex-wrap items-center gap-1 sm:gap-3 mb-1.5 sm:mb-6">
              
              {/* Date Card */}
              <div className="flex items-center gap-1 sm:gap-2.5 px-1.5 sm:px-3.5 py-0.5 sm:py-2 rounded-md sm:rounded-2xl bg-white/90 border border-slate-200/80 shadow-2xs backdrop-blur-xs">
                <div className="w-4 h-4 sm:w-8 sm:h-8 rounded sm:rounded-xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center shrink-0">
                  <Calendar className="w-2.5 h-2.5 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="leading-tight">
                  <p className="text-[6.5px] sm:text-[10px] font-bold text-red-500 uppercase tracking-wider leading-none">Date</p>
                  <p className="text-[8.5px] sm:text-sm font-extrabold text-slate-800 leading-tight">October 09, 2026</p>
                </div>
              </div>

              {/* Duration Card */}
              <div className="flex items-center gap-1 sm:gap-2.5 px-1.5 sm:px-3.5 py-0.5 sm:py-2 rounded-md sm:rounded-2xl bg-white/90 border border-slate-200/80 shadow-2xs backdrop-blur-xs">
                <div className="w-4 h-4 sm:w-8 sm:h-8 rounded sm:rounded-xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center shrink-0">
                  <Clock className="w-2.5 h-2.5 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="leading-tight">
                  <p className="text-[6.5px] sm:text-[10px] font-bold text-red-500 uppercase tracking-wider leading-none">Duration</p>
                  <p className="text-[8.5px] sm:text-sm font-extrabold text-slate-800 leading-tight">12 Hours Hackathon</p>
                </div>
              </div>

              {/* Venue Card */}
              <div className="flex items-center gap-1 sm:gap-2.5 px-1.5 sm:px-3.5 py-0.5 sm:py-2 rounded-md sm:rounded-2xl bg-white/90 border border-slate-200/80 shadow-2xs backdrop-blur-xs">
                <div className="w-4 h-4 sm:w-8 sm:h-8 rounded sm:rounded-xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center shrink-0">
                  <MapPin className="w-2.5 h-2.5 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="leading-tight">
                  <p className="text-[6.5px] sm:text-[10px] font-bold text-red-500 uppercase tracking-wider leading-none">Venue</p>
                  <p className="text-[8.5px] sm:text-sm font-extrabold text-slate-800 leading-tight">Physical | On-Campus</p>
                </div>
              </div>

            </div>

            {/* Bottom Row: CTA Button + Handwritten Slogan */}
            <div className="w-full flex items-center justify-between flex-wrap gap-2 sm:gap-4 pt-0.5 sm:pt-1">
              <a
                href={GOOGLE_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 sm:gap-2.5 px-3 sm:px-8 py-1.5 sm:py-3 rounded-full bg-gradient-to-r from-[#4C1D95] via-[#7C3AED] to-[#E11D48] hover:from-[#3B0764] hover:to-[#BE123C] text-white font-black text-[9.5px] sm:text-sm tracking-wide shadow-md shadow-purple-600/25 hover:shadow-xl hover:shadow-purple-600/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 cursor-pointer group/btn shrink-0"
              >
                <span>Be a Part of the Innovation</span>
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 group-hover/btn:translate-x-1 transition-transform" />
              </a>

              {/* Handwritten Script (Desktop bottom-left/center) */}
              <div className="hidden sm:flex items-center gap-1.5 relative">
                <div className="font-['Caveat',cursive,sans-serif] text-2xl md:text-3xl font-bold text-[#1D4ED8] -rotate-6 select-none leading-none">
                  Ideas for a <br className="hidden md:inline" />Better Tomorrow
                </div>
                <div className="w-12 h-1 bg-amber-400/80 rounded-full -rotate-6 -mt-1" />
              </div>
            </div>

          </div>

          {/* Right Section: Hackathon Poster Preview (Right side on both mobile & desktop!) */}
          <div className="shrink-0 flex flex-col items-center justify-center gap-1.5 sm:gap-6">
            
            {/* Poster Card with Tilted Shadow Effect & "Click to View" Action */}
            <div
              onClick={() => setShowPosterModal(true)}
              className="relative cursor-pointer group/poster shrink-0 transform rotate-[-1.5deg] sm:rotate-[-3deg] hover:rotate-0 hover:scale-105 transition-all duration-300 select-none"
              title="Click to view full poster"
            >
              {/* Glowing back-shadow */}
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/30 to-blue-500/30 rounded-lg sm:rounded-2xl blur-xs sm:blur-lg group-hover/poster:blur-xl transition-all duration-300" />
              
              {/* Poster Image Frame */}
              <div className="relative w-[78px] sm:w-44 md:w-52 h-[110px] sm:h-60 md:h-68 rounded-lg sm:rounded-2xl overflow-hidden border border-white sm:border-2 bg-white shadow-md sm:shadow-2xl shadow-indigo-950/20">
                <img
                  src="/images/hackathon-poster.jpg"
                  alt="Hackathon 3.0 Official Poster"
                  className="w-full h-full object-cover object-center"
                />
                
                {/* "Click to View" hover/tap hint overlay */}
                <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover/poster:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-white text-[8px] sm:text-xs font-bold backdrop-blur-[1px] gap-0.5 p-0.5 sm:p-2 text-center">
                  <span className="px-1 sm:px-2.5 py-0.2 sm:py-1 rounded-full bg-white/20 border border-white/30 backdrop-blur-xs">
                    Click to View
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile Slogan below Poster on right side */}
            <div className="flex sm:hidden flex-col items-center select-none text-center">
              <div className="font-['Caveat',cursive,sans-serif] text-[10px] font-bold text-[#1D4ED8] -rotate-3 leading-none">
                Ideas for a Tomorrow
              </div>
              <div className="w-8 h-0.5 bg-amber-400 rounded-full -rotate-3 mt-0.5" />
            </div>

            {/* Desktop Feature Badges Column (Innovate, Collaborate, Build, Make an Impact) */}
            <div className="hidden lg:flex flex-col gap-2.5 shrink-0 select-none">
              
              <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/95 border border-slate-200/80 shadow-2xs hover:shadow-sm hover:scale-[1.03] transition-all">
                <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs shadow-2xs">
                  <Lightbulb className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span className="text-xs font-bold text-slate-800">Innovate</span>
              </div>

              <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/95 border border-slate-200/80 shadow-2xs hover:shadow-sm hover:scale-[1.03] transition-all">
                <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs shadow-2xs">
                  <Users className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span className="text-xs font-bold text-slate-800">Collaborate</span>
              </div>

              <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/95 border border-slate-200/80 shadow-2xs hover:shadow-sm hover:scale-[1.03] transition-all">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs shadow-2xs">
                  <Rocket className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span className="text-xs font-bold text-slate-800">Build</span>
              </div>

              <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/95 border border-slate-200/80 shadow-2xs hover:shadow-sm hover:scale-[1.03] transition-all">
                <div className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs shadow-2xs">
                  <Star className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span className="text-xs font-bold text-slate-800">Make an Impact</span>
              </div>

            </div>

          </div>

        </div>

      </div>

      {/* Lightbox / Modal for Viewing Full Hackathon Poster & Details */}
      <AnimatePresence>
        {showPosterModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
            onClick={() => setShowPosterModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-3xl p-4 sm:p-6 max-w-xl w-full shadow-2xl relative max-h-[92vh] flex flex-col items-center overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Modal Header with Title & Close Button */}
              <div className="w-full flex items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">
                      Hackathon 3.0: Solve for Society
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                      School of Computer Science &amp; Applications, REVA University
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowPosterModal(false)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer shrink-0 shadow-2xs"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Full Readable Poster Container */}
              <div className="w-full flex-1 overflow-y-auto rounded-2xl bg-slate-50 border border-slate-200/80 p-1 sm:p-2 flex items-center justify-center">
                <img
                  src="/images/hackathon-poster.jpg"
                  alt="Hackathon 3.0 Official Full Poster"
                  className="max-h-[65vh] w-auto max-w-full rounded-xl object-contain shadow-md mx-auto"
                />
              </div>

              {/* Bottom Actions Row */}
              <div className="w-full flex items-center justify-between gap-3 pt-3 mt-3 border-t border-slate-100">
                <a
                  href={GOOGLE_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4C1D95] via-[#7C3AED] to-[#E11D48] text-white font-bold text-xs sm:text-sm hover:shadow-lg transition-all"
                >
                  <span>Register via Google Form</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  onClick={() => setShowPosterModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default HackathonBanner;
