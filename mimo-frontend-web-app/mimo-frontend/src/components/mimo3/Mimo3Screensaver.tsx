import React, { useState, useEffect, useRef, useCallback } from 'react';
import brightHanuman from '../../assets/hanuman-lineart-bright.png';
import { HANUMAN_STROKES } from '../../assets/hanumanStrokesData.ts';
import { ArrowRight } from '@phosphor-icons/react';
import { SacredMandala, TempleZariBorder } from './Mimo3Motifs';

interface Mimo3ScreensaverProps {
  isActive: boolean;
  onTap: () => void;
  kioskId?: string | null;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  decay: number;
  color: string;
}

const BRIGHT_SPARK_COLORS = ['#EA580C', '#D97706', '#F59E0B', '#B45309', '#FEF08A', '#FFFDF0'];

export const Mimo3Screensaver: React.FC<Mimo3ScreensaverProps> = ({
  isActive,
  onTap,
}) => {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [isDrawn, setIsDrawn] = useState(false);
  const [drawProgressPercent, setDrawProgressPercent] = useState(0);
  const [drawFlash, setDrawFlash] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<SparkParticle[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Offscreen canvases for multi-layer progressive drawing on bright ivory background
  const imgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const penGlowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageLoadedRef = useRef<boolean>(false);

  // Animation progress trackers
  const animationStartTimeRef = useRef<number>(0);
  const drawnStrokeIndexRef = useRef<number>(0);
  const activeTipRef = useRef<{ x: number; y: number } | null>(null);
  const isDrawnRef = useRef<boolean>(false);

  const DRAW_DURATION_MS = 5400; // 5.4 seconds for graceful, majestic stroke-by-stroke drawing

  // Initialize offscreen canvases and pre-load high-resolution line-art image
  useEffect(() => {
    const W = HANUMAN_STROKES.width; // 576
    const H = HANUMAN_STROKES.height; // 1024

    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = W;
    imgCanvas.height = H;
    imgCanvasRef.current = imgCanvas;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = W;
    maskCanvas.height = H;
    maskCanvasRef.current = maskCanvas;

    const penGlowCanvas = document.createElement('canvas');
    penGlowCanvas.width = W;
    penGlowCanvas.height = H;
    penGlowCanvasRef.current = penGlowCanvas;

    const compCanvas = document.createElement('canvas');
    compCanvas.width = W;
    compCanvas.height = H;
    compCanvasRef.current = compCanvas;

    const img = new Image();
    img.src = brightHanuman;
    img.onload = () => {
      const ctx = imgCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, W, H);
      }
      imageLoadedRef.current = true;
    };
  }, []);

  // Reboot & start drawing animation automatically from pure canvas
  const rebootDrawing = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      const mctx = maskCanvas.getContext('2d');
      mctx?.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    const penGlowCanvas = penGlowCanvasRef.current;
    if (penGlowCanvas) {
      const gctx = penGlowCanvas.getContext('2d');
      gctx?.clearRect(0, 0, penGlowCanvas.width, penGlowCanvas.height);
    }

    particlesRef.current = [];
    drawnStrokeIndexRef.current = 0;
    activeTipRef.current = null;
    isDrawnRef.current = false;
    setIsDrawn(false);
    setDrawProgressPercent(0);
    setDrawFlash(false);

    animationStartTimeRef.current = performance.now();
  }, []);

  // Expose global console trigger for demonstration & tests
  useEffect(() => {
    (window as any).__REBOOT_MIMO3_DRAWING = rebootDrawing;
  }, [rebootDrawing]);

  // Handle keyboard shortcut 'R' or Space to reboot drawing
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R' || e.key === ' ') {
        rebootDrawing();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, rebootDrawing]);

  // Live real-time clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }).toUpperCase()
      );
      setDateStr(
        now.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Main Canvas Animation Loop (Progressive Drawing + Particles + Rendering on Bright Screen)
  useEffect(() => {
    if (!isActive) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    rebootDrawing();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let localAnimId: number;

    const resize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const render = (now: number) => {
      const W = canvas.width;
      const H = canvas.height;

      // 1. Calculate Fullscreen Responsive Geometry
      // Center and scale Hanuman Ji to majestic proportion filling the screen
      const artW = HANUMAN_STROKES.width; // 576
      const artH = HANUMAN_STROKES.height; // 1024

      // Scale to fit between header and footer with majestic grandeur
      const maxAvailableH = Math.max(300, H - 210); // Leave room for top banner and bottom mantra/button
      const scale = Math.min((W * 0.92) / artW, maxAvailableH / artH);
      const renderW = artW * scale;
      const renderH = artH * scale;
      const offsetX = (W - renderW) / 2;
      const offsetY = Math.max(70, 75 + (maxAvailableH - renderH) / 2);

      // 2. Clear canvas with pure bright warm ivory backdrop
      ctx.clearRect(0, 0, W, H);

      // Warm celestial ivory radiant gradient
      const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.7);
      bgGrad.addColorStop(0, '#FFFDF7');
      bgGrad.addColorStop(0.5, '#FEFBF2');
      bgGrad.addColorStop(1, '#FDF6E3');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 3. Compute Drawing Progress
      const elapsed = now - animationStartTimeRef.current;
      const progress = Math.min(1, elapsed / DRAW_DURATION_MS);
      setDrawProgressPercent(Math.floor(progress * 100));

      const totalStrokes = HANUMAN_STROKES.strokes.length;
      const targetStrokeIndex = Math.min(totalStrokes, Math.floor(progress * totalStrokes));

      const maskCanvas = maskCanvasRef.current;
      const penGlowCanvas = penGlowCanvasRef.current;
      const imgCanvas = imgCanvasRef.current;
      const compCanvas = compCanvasRef.current;

      const maskCtx = maskCanvas?.getContext('2d');
      const penGlowCtx = penGlowCanvas?.getContext('2d');
      const compCtx = compCanvas?.getContext('2d');

      // 4. Progressively Draw New Strokes with Moving Stylus in Saffron Gold Ink
      if (maskCtx && penGlowCtx && targetStrokeIndex > drawnStrokeIndexRef.current) {
        for (let i = drawnStrokeIndexRef.current; i < targetStrokeIndex; i++) {
          const stroke = HANUMAN_STROKES.strokes[i];
          if (!stroke || stroke.length === 0) continue;

          // A. Draw wide mask stroke to uncover original image lines
          maskCtx.strokeStyle = '#FFFFFF';
          maskCtx.lineWidth = 26; // Covers the full thickness of line art
          maskCtx.lineCap = 'round';
          maskCtx.lineJoin = 'round';
          maskCtx.beginPath();
          maskCtx.moveTo(stroke[0][0], stroke[0][1]);
          for (let p = 1; p < stroke.length; p++) {
            maskCtx.lineTo(stroke[p][0], stroke[p][1]);
          }
          maskCtx.stroke();

          // B. Draw bright glowing saffron pencil stroke for real-time etching light
          penGlowCtx.strokeStyle = '#EA580C';
          penGlowCtx.lineWidth = 3.2;
          penGlowCtx.lineCap = 'round';
          penGlowCtx.lineJoin = 'round';
          penGlowCtx.shadowColor = '#D97706';
          penGlowCtx.shadowBlur = 8;
          penGlowCtx.beginPath();
          penGlowCtx.moveTo(stroke[0][0], stroke[0][1]);
          for (let p = 1; p < stroke.length; p++) {
            penGlowCtx.lineTo(stroke[p][0], stroke[p][1]);
          }
          penGlowCtx.stroke();

          // C. Track latest active tip position in screen coordinates
          const lastPt = stroke[stroke.length - 1];
          const tipScreenX = offsetX + lastPt[0] * scale;
          const tipScreenY = offsetY + lastPt[1] * scale;
          activeTipRef.current = { x: tipScreenX, y: tipScreenY };

          // D. Spawn dynamic saffron/gold sparks at active pencil tip
          for (let s = 0; s < 4; s++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4.2 + 1.2;
            particlesRef.current.push({
              x: tipScreenX + (Math.random() - 0.5) * 6,
              y: tipScreenY + (Math.random() - 0.5) * 6,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 1.2,
              size: Math.random() * 3.2 + 1.2,
              alpha: 1,
              decay: Math.random() * 0.035 + 0.025,
              color: BRIGHT_SPARK_COLORS[Math.floor(Math.random() * BRIGHT_SPARK_COLORS.length)],
            });
          }
        }
        drawnStrokeIndexRef.current = targetStrokeIndex;
      }

      // Check if drawing just finished
      if (progress >= 1 && !isDrawnRef.current) {
        isDrawnRef.current = true;
        setIsDrawn(true);
        setDrawFlash(true);
        setTimeout(() => setDrawFlash(false), 800);
      }

      // 5. Composite and Render Drawn Layers
      if (imgCanvas && maskCanvas && compCanvas && compCtx) {
        if (progress < 1) {
          // Drawing in progress: render masked saffron-gold image
          compCtx.clearRect(0, 0, artW, artH);
          compCtx.drawImage(imgCanvas, 0, 0);
          compCtx.globalCompositeOperation = 'destination-in';
          compCtx.drawImage(maskCanvas, 0, 0);
          compCtx.globalCompositeOperation = 'source-over';

          // Draw revealed image onto main screen
          ctx.drawImage(compCanvas, offsetX, offsetY, renderW, renderH);

          // Draw active glowing pencil stylus tip
          if (activeTipRef.current) {
            const tip = activeTipRef.current;

            // Outer radiant saffron halo
            const tipGrad = ctx.createRadialGradient(tip.x, tip.y, 1, tip.x, tip.y, 22);
            tipGrad.addColorStop(0, 'rgba(234, 88, 12, 1)');
            tipGrad.addColorStop(0.35, 'rgba(245, 158, 11, 0.7)');
            tipGrad.addColorStop(0.7, 'rgba(253, 230, 138, 0.35)');
            tipGrad.addColorStop(1, 'rgba(254, 243, 199, 0)');
            ctx.fillStyle = tipGrad;
            ctx.beginPath();
            ctx.arc(tip.x, tip.y, 22, 0, Math.PI * 2);
            ctx.fill();

            // Core hot golden stylus point
            ctx.fillStyle = '#EA580C';
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // 4-point cross sparkle
            ctx.strokeStyle = '#D97706';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(tip.x - 14, tip.y);
            ctx.lineTo(tip.x + 14, tip.y);
            ctx.moveTo(tip.x, tip.y - 14);
            ctx.lineTo(tip.x, tip.y + 14);
            ctx.stroke();
          }
        } else {
          // Drawing Complete: Render full 100% original saffron-gold picture
          ctx.save();
          ctx.drawImage(imgCanvas, offsetX, offsetY, renderW, renderH);
          ctx.restore();
        }
      }

      // 6. Ambient rising golden embers from bottom of screen (always present)
      if (Math.random() < 0.35) {
        particlesRef.current.push({
          x: Math.random() * W,
          y: H + 10,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -(Math.random() * 1.5 + 0.8),
          size: Math.random() * 2.8 + 1,
          alpha: Math.random() * 0.7 + 0.3,
          decay: Math.random() * 0.006 + 0.003,
          color: BRIGHT_SPARK_COLORS[Math.floor(Math.random() * BRIGHT_SPARK_COLORS.length)],
        });
      }

      // 7. Update & Render Spark Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.alpha -= pt.decay;

        if (pt.alpha <= 0 || pt.y < -20 || pt.x < -20 || pt.x > W + 20) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.fillStyle = pt.color;
        ctx.shadowBlur = pt.size * 2.5;
        ctx.shadowColor = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      localAnimId = requestAnimationFrame(render);
    };

    localAnimId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(localAnimId);
      window.removeEventListener('resize', resize);
    };
  }, [isActive, rebootDrawing]);

  if (!isActive) return null;

  return (
    <div
      role="region"
      aria-label="Bhagwan Hanuman Ji Screensaver"
      className="fixed inset-0 z-[999] flex h-full w-full select-none flex-col items-center justify-between overflow-hidden bg-gradient-to-br from-[#FFFDF7] via-[#FEFBF2] to-[#FEF3C7]/40 text-[#0F172A]"
    >
      {/* Fullscreen Interactive Canvas - Touch anywhere on canvas to auto-reboot drawing */}
      <canvas
        ref={canvasRef}
        onClick={rebootDrawing}
        onTouchStart={rebootDrawing}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer"
      />

      {/* Top Zari border accent */}
      <TempleZariBorder className="opacity-90 z-20 pointer-events-none" />

      {/* Rotating Sacred Mandala Watermark in Background */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0">
        <SacredMandala
          size={1050}
          opacity={isDrawn ? 0.08 : 0.04}
          className="animate-[spin_260s_linear_infinite] transition-opacity duration-1000"
        />
      </div>

      {/* Radiant Background Warmth Halo behind Hanuman Ji */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[720px] w-[620px] rounded-full blur-[100px] transition-all duration-1000 z-0"
        style={{
          background: isDrawn
            ? 'radial-gradient(circle, rgba(254,243,199,0.9) 0%, rgba(253,230,138,0.45) 45%, transparent 75%)'
            : 'radial-gradient(circle, rgba(254,243,199,0.6) 0%, transparent 65%)',
          animation: isDrawn ? 'divineAuraPulse 6s ease-in-out infinite' : 'none',
        }}
      />

      {/* Celestial Illumination Surge upon Drawing Completion */}
      {drawFlash && (
        <div className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-t from-[#F59E0B]/15 via-[#FEF3C7]/30 to-transparent transition-opacity duration-700 animate-pulse" />
      )}

      {/* TOP HEADER: Clean, Minimal, Elegant Banner */}
      <header className="relative z-20 flex w-full items-center justify-between px-14 pt-8 pointer-events-none">
        {/* Left: Sacred ॐ Emblem (Touch to auto-reboot drawing) */}
        <div className="flex items-center gap-3.5 pointer-events-auto">
          <div
            onClick={rebootDrawing}
            role="button"
            tabIndex={0}
            title="Touch to reboot drawing"
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFDF7] to-[#FEF3C7] shadow-[0_2px_12px_rgba(245,158,11,0.18)] active:scale-95 transition-transform"
          >
            <span className="text-[22px] font-bold text-[#EA580C]">ॐ</span>
          </div>
        </div>

        {/* Right: Clean, Crisp Live Clock & Date */}
        <div className="text-right pointer-events-auto">
          <div className="text-[28px] font-black tracking-tight text-[#0F172A]">
            {timeStr}
          </div>
          <div className="text-[13px] font-semibold text-[#64748B]">{dateStr}</div>
        </div>
      </header>

      {/* BOTTOM OVERLAY: Sacred Mantra Just Below Image, Above Touch Button */}
      <footer className="relative z-20 flex w-full flex-col items-center justify-center pb-8 pt-2 pointer-events-none">
        {/* Sacred Mantra in Proper Order: Just below the image and above the touch screen button */}
        <div
          className={`text-center mb-4 transition-all duration-1000 ${
            drawProgressPercent > 15 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}
        >
          <p className="font-serif text-[30px] sm:text-[38px] font-bold tracking-[0.2em] text-[#B45309] drop-shadow-[0_2px_8px_rgba(217,119,6,0.2)]">
            ॥ ॐ श्री हनुमते नमः ॥
          </p>
        </div>

        {/* Touch Screen To Start Action Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTap();
          }}
          id="touch-start-btn"
          className="pointer-events-auto group flex items-center gap-3.5 rounded-full border-2 border-[#F59E0B] bg-gradient-to-r from-[#EA580C] via-[#F97316] to-[#FB923C] px-9 py-4 text-white shadow-[0_12px_32px_rgba(234,88,12,0.32)] active:scale-95 transition-all cursor-pointer"
        >
          <span className="relative flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_10px_#FFFFFF]" />
          </span>
          <span className="text-[17px] font-black tracking-widest text-white uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
            Touch Screen To Start
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-transform group-hover:translate-x-1">
            <ArrowRight size={16} weight="bold" className="text-white" />
          </div>
        </button>
      </footer>
    </div>
  );
};
