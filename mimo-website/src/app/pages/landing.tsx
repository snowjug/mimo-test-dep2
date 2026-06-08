import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView } from "motion/react";
import {
  Upload, QrCode, Printer, Zap, Shield, Clock, FileText,
  ChevronDown, ArrowRight, Check, X, Star, Phone, Mail,
  MapPin, Instagram, Twitter, Linkedin, Menu, BookOpen,
  CreditCard, Wifi, Coins, RefreshCw, Smartphone
} from "lucide-react";

/* ─────────────────────────────────────────────────────────
   ANIMATED COUNTER
───────────────────────────────────────────────────────── */
function AnimatedCounter({ target, suffix = "", prefix = "" }: { target: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 2000;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

/* ─────────────────────────────────────────────────────────
   FAQ ITEM
───────────────────────────────────────────────────────── */
const faqs = [
  { q: "What file formats does MIMO support?", a: "MIMO supports PDF, DOCX, DOC, PPTX, JPG, PNG and most common document and image formats. We automatically convert non-PDF files so you never have to worry about compatibility." },
  { q: "How do I get the 4-digit MIMO code?", a: "After you upload your file on our web app (printmimo.tech), select your print settings, and pay — you'll instantly receive a unique 4-digit code. Share it with anyone or use it yourself at any MIMO kiosk." },
  { q: "Is my file secure?", a: "Absolutely. Files are encrypted in transit and stored securely on Google Cloud Storage. They are automatically deleted 24 hours after printing. We never share your files with anyone." },
  { q: "What payment methods are accepted?", a: "We accept all major UPI apps (GPay, PhonePe, Paytm), credit/debit cards, and net banking through Cashfree — India's most trusted payment gateway." },
  { q: "What if my print fails or there is a hardware issue?", a: "If a print job fails due to a hardware issue, our system automatically triggers a full refund to your original payment method within 3–5 business days. No questions asked." },
  { q: "What are Mimo Coins?", a: "Mimo Coins are our loyalty rewards. You earn coins on every successful print and can redeem them for discounts on future orders. It's our way of thanking you for printing with us!" },
  { q: "Can I print in color?", a: "Yes! MIMO supports both Black & White and full Color printing. You choose your preference in the print settings before checkout." },
  { q: "Where are MIMO kiosks located?", a: "Currently deployed at REVA University campus (Bengaluru). We are expanding rapidly — more campuses coming soon. Contact us to bring MIMO to your campus!" },
];

function FAQItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.06 }}
      className="border border-slate-200 rounded-2xl overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="font-semibold text-slate-800 pr-4">{q}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown className="w-5 h-5 text-blue-600 shrink-0" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className="px-6 pb-5 text-slate-600 leading-relaxed border-t border-slate-100 pt-4">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────
   MAIN LANDING PAGE
───────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "#contact" },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">

      {/* ── NAVBAR ── */}
      <motion.nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-white/95 backdrop-blur-xl shadow-md border-b border-slate-100" : "bg-transparent"
        }`}
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 sm:h-20">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2 group">
            <div className="bg-[#093765] p-2 rounded-xl group-hover:scale-105 transition-transform">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <span className={`text-2xl font-black tracking-widest transition-colors ${scrolled ? "text-[#093765]" : "text-white"}`}>
              MIMO
            </span>
          </a>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(link => (
              <a
                key={link.label}
                href={link.href}
                className={`font-medium text-sm hover:text-blue-500 transition-colors ${scrolled ? "text-slate-700" : "text-white/80"}`}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://printmimo.tech/login"
              className="text-sm font-semibold text-white/80 hover:text-white transition-colors hidden lg:block"
            >
              Sign In
            </a>
            <a
              href="https://printmimo.tech"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/30 hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              Get Started <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className={`w-6 h-6 ${scrolled ? "text-slate-800" : "text-white"}`} />
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden bg-white border-t border-slate-100 shadow-xl"
            >
              <div className="px-4 py-4 flex flex-col gap-3">
                {navLinks.map(link => (
                  <a key={link.label} href={link.href} onClick={() => setMobileMenuOpen(false)}
                    className="text-slate-700 font-medium py-2 border-b border-slate-100">
                    {link.label}
                  </a>
                ))}
                <a
                  href="https://printmimo.tech"
                  className="mt-2 bg-blue-600 text-white font-bold text-center py-3 rounded-xl"
                >
                  Get Started Free
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-[#060d1f] via-[#0a1a3a] to-[#093765]">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
            className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-blue-600/20 blur-[120px]"
          />
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ repeat: Infinity, duration: 10, ease: "easeInOut", delay: 2 }}
            className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-indigo-500/20 blur-[120px]"
          />
          <motion.div
            animate={{ y: [0, -30, 0] }}
            transition={{ repeat: Infinity, duration: 12, ease: "easeInOut" }}
            className="absolute top-[30%] right-[10%] w-[200px] h-[200px] rounded-full bg-cyan-400/10 blur-[80px]"
          />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-24 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-0 items-center relative z-10">
          {/* Left — Text */}
          <div className="text-white space-y-6 lg:pr-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 text-white/90 px-4 py-2 rounded-full text-sm font-medium"
            >
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Now live at REVA University, Bengaluru
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl sm:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight"
            >
              Your file.<br />
              Your print.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">In seconds.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-white/70 text-lg leading-relaxed max-w-xl"
            >
              Upload your document online, get a 4-digit MIMO code, and walk to the nearest kiosk to collect your print. No USB. No queues. No hassle.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <a
                href="https://printmimo.tech"
                className="inline-flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-bold px-7 py-4 rounded-2xl text-base transition-all duration-200 shadow-2xl shadow-blue-500/40 hover:scale-105 active:scale-95"
              >
                Get Started Free <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-7 py-4 rounded-2xl text-base border border-white/20 transition-all duration-200"
              >
                See How It Works
              </a>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap items-center gap-4 pt-2"
            >
              {[
                { icon: Shield, text: "Bank-grade security" },
                { icon: Zap, text: "Prints in seconds" },
                { icon: RefreshCw, text: "Auto-refund on failure" },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-white/60 text-sm">
                  <Icon className="w-4 h-4 text-blue-400" />
                  {text}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — Kiosk Image */}
          <motion.div
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="flex justify-center lg:justify-end relative"
          >
            <div className="relative">
              {/* Glow behind image */}
              <div className="absolute inset-0 rounded-3xl bg-blue-500/20 blur-3xl scale-110" />
              <motion.img
                src="/kiosk-hero.png"
                alt="MIMO Print Kiosk Machine"
                className="relative z-10 w-full max-w-sm lg:max-w-md xl:max-w-lg rounded-3xl shadow-2xl"
                animate={{ y: [0, -12, 0] }}
                transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
              />
              {/* Floating badges */}
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 }}
                className="absolute top-8 -left-8 bg-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Print Complete!</p>
                  <p className="text-sm font-bold text-slate-800">2 pages • ₹3.00</p>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.0 }}
                className="absolute bottom-12 -right-6 bg-white rounded-2xl shadow-2xl px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-xs font-bold text-slate-800">4.9 · 1200+ prints</p>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40"
        >
          <ChevronDown className="w-6 h-6" />
        </motion.div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="bg-[#093765] py-10">
        <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { target: 5000, suffix: "+", label: "Documents Printed" },
            { target: 99, suffix: "%", label: "Uptime Guaranteed" },
            { target: 3, suffix: "s", label: "Avg Print Time" },
            { target: 100, suffix: "%", label: "Auto-Refund on Failure" },
          ].map(({ target, suffix, label }) => (
            <div key={label} className="text-center">
              <p className="text-4xl font-black text-white">
                <AnimatedCounter target={target} suffix={suffix} />
              </p>
              <p className="text-blue-200/70 text-sm mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block bg-blue-100 text-blue-700 font-semibold text-sm px-4 py-1.5 rounded-full mb-4">Simple Process</span>
            <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4">How MIMO Works</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">From file to print in 3 simple steps. No setup, no software, no USB drives needed.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Connector line (desktop only) */}
            <div className="hidden md:block absolute top-[72px] left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-0.5 bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 z-0" />

            {[
              {
                step: "01", icon: Upload, color: "from-blue-500 to-blue-600",
                title: "Upload Your File",
                desc: "Go to printmimo.tech, sign in, and upload your document or image. We support PDF, Word, PowerPoint, and most image formats. No format headaches!"
              },
              {
                step: "02", icon: QrCode, color: "from-indigo-500 to-purple-600",
                title: "Get Your MIMO Code",
                desc: "Select your print settings (color, copies, duplex), complete payment, and instantly receive a unique 4-digit MIMO code. Share it with anyone!"
              },
              {
                step: "03", icon: Printer, color: "from-purple-500 to-pink-600",
                title: "Print Instantly",
                desc: "Walk to any MIMO kiosk, enter your 4-digit code on the touchscreen, and collect your document — printed in seconds. That's it!"
              },
            ].map(({ step, icon: Icon, color, title, desc }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative z-10 bg-white rounded-3xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border border-slate-100"
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center mb-6 shadow-lg`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <div className="text-6xl font-black text-slate-100 mb-3">{step}</div>
                <h3 className="text-xl font-black text-slate-900 mb-3">{title}</h3>
                <p className="text-slate-500 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="text-center mt-12"
          >
            <a
              href="https://printmimo.tech"
              className="inline-flex items-center gap-2 bg-[#093765] hover:bg-blue-700 text-white font-bold px-8 py-4 rounded-2xl text-base transition-all duration-200 shadow-xl hover:scale-105"
            >
              Try It Now <ArrowRight className="w-5 h-5" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block bg-blue-100 text-blue-700 font-semibold text-sm px-4 py-1.5 rounded-full mb-4">Powerful Features</span>
            <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4">Built for Modern Campuses</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">Everything you need for a seamless, zero-friction printing experience.</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Zap, color: "bg-yellow-100 text-yellow-600", title: "Lightning Fast", desc: "From code entry to document in your hand — typically under 5 seconds." },
              { icon: FileText, color: "bg-blue-100 text-blue-600", title: "Any File Format", desc: "PDF, DOCX, PPTX, JPG, PNG and more. We convert everything automatically." },
              { icon: Shield, color: "bg-green-100 text-green-600", title: "Secure & Private", desc: "Files encrypted in transit, deleted after printing. Your documents are yours alone." },
              { icon: Coins, color: "bg-orange-100 text-orange-600", title: "Mimo Coins Rewards", desc: "Earn loyalty coins on every print. Redeem for discounts on future orders." },
              { icon: Smartphone, color: "bg-purple-100 text-purple-600", title: "Print from Anywhere", desc: "Upload from your phone, laptop, or tablet. No need to be physically at the kiosk." },
              { icon: CreditCard, color: "bg-pink-100 text-pink-600", title: "Auto-Refund Protection", desc: "If anything goes wrong at the hardware level, you get an automatic full refund." },
              { icon: Clock, color: "bg-indigo-100 text-indigo-600", title: "24/7 Availability", desc: "MIMO kiosks run around the clock. Print at 2am before that early morning submission." },
              { icon: BookOpen, color: "bg-teal-100 text-teal-600", title: "Print History", desc: "Every print job is logged. Review your print history and reprint at any time." },
              { icon: Wifi, color: "bg-cyan-100 text-cyan-600", title: "Real-time Status", desc: "Track your job status in real-time from upload to completion on our web app." },
            ].map(({ icon: Icon, color, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                whileHover={{ y: -4, shadow: "0 20px 40px rgba(0,0,0,0.1)" }}
                className="bg-slate-50 hover:bg-white rounded-3xl p-6 border border-slate-100 hover:border-blue-100 hover:shadow-xl transition-all duration-300 group"
              >
                <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY MIMO ── */}
      <section className="py-24 bg-gradient-to-br from-[#060d1f] via-[#0a1a3a] to-[#093765]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block bg-white/10 text-blue-300 font-semibold text-sm px-4 py-1.5 rounded-full mb-4 border border-white/20">The MIMO Advantage</span>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">Say Goodbye to Old Problems</h2>
            <p className="text-white/60 text-lg max-w-xl mx-auto">Traditional printing is broken. MIMO fixes all of it.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Old Way */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white/5 border border-white/10 rounded-3xl p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <X className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-white">The Old Way</h3>
              </div>
              <ul className="space-y-4">
                {[
                  "Carry a USB drive everywhere",
                  "Wait in long queues at the shop",
                  "Deal with 'file not opening' errors",
                  "Risk your files on a stranger's computer",
                  "No receipt, no tracking, no refunds",
                  "Shop hours limit when you can print",
                ].map(item => (
                  <li key={item} className="flex items-center gap-3 text-white/60">
                    <X className="w-4 h-4 text-red-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* MIMO Way */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-blue-600/20 border border-blue-400/30 rounded-3xl p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center">
                  <Check className="w-5 h-5 text-blue-300" />
                </div>
                <h3 className="text-xl font-bold text-white">The MIMO Way</h3>
              </div>
              <ul className="space-y-4">
                {[
                  "Upload from your phone in seconds",
                  "Collect instantly — no waiting",
                  "Any format, auto-converted for you",
                  "Your file, secured end-to-end",
                  "Digital receipt + auto-refund guarantee",
                  "24/7 kiosk availability on campus",
                ].map(item => (
                  <li key={item} className="flex items-center gap-3 text-white/80">
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-24 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block bg-blue-100 text-blue-700 font-semibold text-sm px-4 py-1.5 rounded-full mb-4">FAQ</span>
            <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4">Common Questions</h2>
            <p className="text-slate-500 text-lg">Everything you need to know before your first MIMO print.</p>
          </motion.div>

          <div className="space-y-3">
            {faqs.map((faq, i) => <FAQItem key={i} {...faq} index={i} />)}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-24 bg-gradient-to-br from-blue-600 via-blue-700 to-[#093765] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="w-16 h-16 rounded-3xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-6">
              <Printer className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-6">
              Ready to print smarter?
            </h2>
            <p className="text-blue-100 text-lg mb-10 max-w-xl mx-auto">
              Join thousands of students and professionals who print without the hassle. It takes 60 seconds to set up.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://printmimo.tech"
                className="inline-flex items-center gap-2 bg-white text-blue-700 font-black px-8 py-4 rounded-2xl text-base hover:bg-blue-50 transition-all duration-200 shadow-2xl hover:scale-105 active:scale-95"
              >
                Get Started Free <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="mailto:support@visionprintt.com"
                className="inline-flex items-center gap-2 border border-white/30 text-white hover:bg-white/10 font-semibold px-8 py-4 rounded-2xl text-base transition-all duration-200"
              >
                <Mail className="w-4 h-4" /> Contact Us
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="contact" className="bg-[#06101f] text-white pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-[#093765] p-2 rounded-xl">
                <Printer className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-black tracking-widest">MIMO</span>
            </div>
            <p className="text-white/50 text-sm leading-relaxed mb-4">
              Smart printing solutions for modern campuses and offices.
            </p>
            <p className="text-white/40 text-xs">Vision Printt Technologies<br />REVA NEST, Bengaluru, Karnataka</p>
            <div className="flex items-center gap-3 mt-5">
              {[Instagram, Twitter, Linkedin].map((Icon, i) => (
                <a key={i} href="#" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-blue-600 flex items-center justify-center transition-colors">
                  <Icon className="w-4 h-4 text-white/60 hover:text-white" />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-white mb-5">Quick Links</h4>
            <ul className="space-y-3">
              {["Home", "Features", "How It Works", "About Us", "Careers"].map(link => (
                <li key={link}>
                  <a href="#" className="text-white/50 hover:text-white text-sm transition-colors">{link}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-bold text-white mb-5">Support</h4>
            <ul className="space-y-3">
              {["FAQ", "Contact Support", "Report Issue", "Privacy Policy", "Terms of Service"].map(link => (
                <li key={link}>
                  <a href="#" className="text-white/50 hover:text-white text-sm transition-colors">{link}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-white mb-5">Contact</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-white/80 text-sm font-medium">+91 8123028797</p>
                  <p className="text-white/40 text-xs">Mon–Fri · 9AM–6PM IST</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-white/80 text-sm">support@visionprintt.com</p>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-white/80 text-sm">REVA NEST Innovation Hub<br />Bengaluru, Karnataka</p>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/30 text-sm">© 2025 Vision Printt Technologies. All rights reserved.</p>
          <div className="flex items-center gap-6">
            {["Privacy Policy", "Terms of Service", "Cookie Policy"].map(l => (
              <a key={l} href="#" className="text-white/30 hover:text-white/60 text-xs transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
