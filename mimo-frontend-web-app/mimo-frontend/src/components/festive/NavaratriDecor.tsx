import React, { useId } from 'react';

// Every screen stays mounted (hidden with display:none), so SVG gradient ids must be
// unique per instance — a url(#id) that resolves into a hidden screen renders blank.
const useSvgId = (prefix: string) => `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

const MAROON = '#7A1230';
const GOLD = '#C9973E';

const svgUri = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// Bandhani (Gujarati tie-dye) dot clusters, printed faintly in maroon on ivory silk.
const BANDHANI = svgUri(
    `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44'>` +
        `<g fill='${MAROON}' fill-opacity='0.09'>` +
        `<circle cx='11' cy='7.5' r='1.5'/><circle cx='14.5' cy='11' r='1.5'/><circle cx='11' cy='14.5' r='1.5'/><circle cx='7.5' cy='11' r='1.5'/>` +
        `<circle cx='33' cy='29.5' r='1.5'/><circle cx='36.5' cy='33' r='1.5'/><circle cx='33' cy='36.5' r='1.5'/><circle cx='29.5' cy='33' r='1.5'/>` +
        `</g>` +
        `<g fill='${GOLD}' fill-opacity='0.22'><circle cx='33' cy='11' r='1.2'/><circle cx='11' cy='33' r='1.2'/></g>` +
        `</svg>`,
);

// Zari (woven gold) saree border: maroon band with gold lozenges.
const ZARI = svgUri(
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='18'>` +
        `<rect width='32' height='18' fill='${MAROON}'/>` +
        `<path d='M16 3 L22 9 L16 15 L10 9 Z' fill='none' stroke='${GOLD}' stroke-width='1.2'/>` +
        `<circle cx='16' cy='9' r='1.6' fill='${GOLD}'/>` +
        `<circle cx='2' cy='9' r='1' fill='${GOLD}'/><circle cx='30' cy='9' r='1' fill='${GOLD}'/>` +
        `</svg>`,
);

export const FestiveBackdrop: React.FC = () => (
    <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-parchment-100" style={{ backgroundImage: BANDHANI }} />
        <div
            className="absolute inset-0"
            style={{
                background:
                    'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(255,214,150,0.45), transparent 70%), radial-gradient(ellipse at center, transparent 58%, rgba(122,18,48,0.10) 100%)',
            }}
        />
    </div>
);

export const ZariBorder: React.FC<{ edge?: 'top' | 'bottom' }> = ({ edge = 'bottom' }) => (
    <div
        className={`pointer-events-none absolute inset-x-0 z-20 h-[18px] ${edge === 'bottom' ? 'bottom-0' : 'top-0'}`}
        style={{
            backgroundImage: ZARI,
            backgroundRepeat: 'repeat-x',
            boxShadow: edge === 'bottom' ? `0 -1.5px 0 ${GOLD}` : `0 1.5px 0 ${GOLD}`,
        }}
    />
);

const MARIGOLD_TONES = [
    { base: '#F59E0B', ruff: '#EA580C', inner: '#FBBF24', core: '#B45309' },
    { base: '#EA580C', ruff: '#C2410C', inner: '#FB923C', core: '#7C2D12' },
    { base: '#FACC15', ruff: '#F59E0B', inner: '#FDE68A', core: '#A16207' },
];

export const Marigold: React.FC<{ x: number; y: number; r?: number; tone?: number }> = ({ x, y, r = 9, tone = 0 }) => {
    const c = MARIGOLD_TONES[tone % MARIGOLD_TONES.length];
    return (
        <g transform={`translate(${x} ${y})`}>
            <circle r={r} fill={c.base} />
            <circle r={r} fill="none" stroke={c.ruff} strokeWidth={r * 0.26} strokeDasharray={`${r * 0.24} ${r * 0.2}`} />
            <circle r={r * 0.62} fill={c.inner} />
            <circle r={r * 0.62} fill="none" stroke={c.ruff} strokeWidth={r * 0.15} strokeDasharray={`${r * 0.16} ${r * 0.16}`} />
            <circle r={r * 0.24} fill={c.core} />
        </g>
    );
};

const LEAF_DOWN = 'M0 0 C 9 10 10 28 0 44 C -10 28 -9 10 0 0 Z';
const LEAF_UP = 'M0 0 C 10 -12 11 -34 0 -52 C -11 -34 -10 -12 0 0 Z';

// Toran: the marigold-and-mango-leaf door garland hung for Navaratri. Nine swags, one per night.
export const Toran: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const leafGrad = useSvgId('toran-leaf');
    const bandGrad = useSvgId('toran-band');
    const W = 1440;
    const swags = 9;
    const span = W / swags;
    const cordY = 16;
    const dip = compact ? 30 : 52;
    const leafScale = compact ? 0.62 : 1;
    const strandCount = compact ? 2 : 3;
    const height = compact ? 88 : 128;

    const pointOnSwag = (x0: number, t: number) => {
        const x1 = x0 + span;
        const cx = x0 + span / 2;
        const cy = cordY + dip * 2;
        const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
        const y = (1 - t) * (1 - t) * cordY + 2 * (1 - t) * t * cy + t * t * cordY;
        return { x, y };
    };

    return (
        <svg
            className="pointer-events-none absolute inset-x-0 top-0 z-[5]"
            width={W}
            height={height}
            viewBox={`0 0 ${W} ${height}`}
        >
            <defs>
                <linearGradient id={leafGrad} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#65A30D" />
                    <stop offset="100%" stopColor="#365314" />
                </linearGradient>
                <linearGradient id={bandGrad} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5A0E24" />
                    <stop offset="100%" stopColor={MAROON} />
                </linearGradient>
            </defs>

            {/* Mango leaves hanging under each swag */}
            {Array.from({ length: swags }, (_, i) => {
                const mid = pointOnSwag(i * span, 0.5);
                return (
                    <g key={`ml-${i}`} transform={`translate(${mid.x} ${mid.y - 2}) scale(${leafScale})`}>
                        <path d={LEAF_DOWN} fill={`url(#${leafGrad})`} />
                        <path d="M0 3 L0 40" stroke="#A3E635" strokeOpacity="0.55" strokeWidth="1" />
                    </g>
                );
            })}

            {/* Marigold swags */}
            {Array.from({ length: swags }, (_, i) =>
                Array.from({ length: 7 }, (_, k) => {
                    const p = pointOnSwag(i * span, (k + 1) / 8);
                    return <Marigold key={`s-${i}-${k}`} x={p.x} y={p.y} r={compact ? 7 : 9} tone={(i + k) % 3} />;
                }),
            )}

            {/* Hanging strands at each anchor */}
            {Array.from({ length: swags - 1 }, (_, i) => {
                const x = (i + 1) * span;
                const step = compact ? 14 : 18;
                const bellY = cordY + step * (strandCount + 1);
                return (
                    <g key={`st-${i}`} className="navaratri-sway" style={{ animationDelay: `${-i * 0.7}s` }}>
                        <line x1={x} y1={cordY} x2={x} y2={bellY - 4} stroke={MAROON} strokeWidth="1.2" />
                        {Array.from({ length: strandCount }, (_, k) => (
                            <Marigold key={k} x={x} y={cordY + step * (k + 1)} r={compact ? 6.5 : 8} tone={(i + k + 1) % 3} />
                        ))}
                        <circle cx={x} cy={bellY} r={compact ? 3.5 : 4.5} fill={GOLD} stroke="#8A6425" strokeWidth="0.8" />
                        <path
                            d={`M${x} ${bellY + 3} l-3 ${compact ? 7 : 10} M${x} ${bellY + 3} l0 ${compact ? 8 : 11} M${x} ${bellY + 3} l3 ${compact ? 7 : 10}`}
                            stroke="#B91C1C"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                        />
                    </g>
                );
            })}

            {/* Fabric band + mauli cord */}
            <rect x="0" y="0" width={W} height={cordY - 2} fill={`url(#${bandGrad})`} />
            <line x1="0" y1={cordY - 2} x2={W} y2={cordY - 2} stroke={GOLD} strokeWidth="2" />
            {Array.from({ length: 72 }, (_, i) => (
                <circle key={`d-${i}`} cx={10 + i * 20} cy={(cordY - 2) / 2} r="1.6" fill={GOLD} fillOpacity="0.8" />
            ))}
            {Array.from({ length: swags + 1 }, (_, i) => (
                <circle key={`a-${i}`} cx={i * span} cy={cordY} r="4" fill={GOLD} stroke="#8A6425" strokeWidth="0.8" />
            ))}
        </svg>
    );
};

// Lotus-petal mandala / rangoli, drawn in gold line work.
export const Mandala: React.FC<{ size: number; className?: string; style?: React.CSSProperties; spin?: boolean }> = ({
    size,
    className = '',
    style,
    spin = true,
}) => {
    const petal = (inner: number, outer: number, width: number) =>
        `M0 ${-inner} C ${width} ${-(inner + (outer - inner) * 0.3)} ${width * 0.9} ${-(inner + (outer - inner) * 0.8)} 0 ${-outer} C ${-width * 0.9} ${-(inner + (outer - inner) * 0.8)} ${-width} ${-(inner + (outer - inner) * 0.3)} 0 ${-inner} Z`;
    return (
        <svg
            width={size}
            height={size}
            viewBox="-320 -320 640 640"
            className={`pointer-events-none ${className}`}
            style={{ ...style, animation: spin ? 'navaratri-spin 180s linear infinite' : undefined }}
        >
            <g fill="none" stroke={GOLD} strokeWidth="1.4">
                <circle r="34" />
                <circle r="42" strokeDasharray="2 5" strokeLinecap="round" strokeWidth="2.5" />
                {Array.from({ length: 12 }, (_, i) => (
                    <path key={`p1-${i}`} d={petal(46, 108, 20)} transform={`rotate(${i * 30})`} fill={GOLD} fillOpacity="0.06" />
                ))}
                {Array.from({ length: 12 }, (_, i) => (
                    <path key={`p1b-${i}`} d={petal(56, 92, 9)} transform={`rotate(${i * 30})`} />
                ))}
                <circle r="118" />
                <circle r="126" strokeDasharray="1 7" strokeLinecap="round" strokeWidth="3" />
                {Array.from({ length: 24 }, (_, i) => (
                    <path key={`p2-${i}`} d={petal(132, 168, 9)} transform={`rotate(${i * 15 + 7.5})`} />
                ))}
                <circle r="176" />
                {Array.from({ length: 16 }, (_, i) => (
                    <g key={`p3-${i}`} transform={`rotate(${i * 22.5})`}>
                        <path d={petal(180, 262, 38)} fill={GOLD} fillOpacity="0.05" />
                        <path d="M0 -190 L0 -250" />
                        <circle cy="-272" r="4" fill={GOLD} fillOpacity="0.5" />
                    </g>
                ))}
                <circle r="284" />
                {Array.from({ length: 48 }, (_, i) => (
                    <circle key={`b-${i}`} cy="-296" r="5" transform={`rotate(${i * 7.5})`} />
                ))}
                <circle r="308" strokeDasharray="2 6" strokeLinecap="round" strokeWidth="2" />
            </g>
        </svg>
    );
};

// Diya: clay oil lamp. `lit` lets a row of nine act as a nine-night progress indicator.
export const Diya: React.FC<{ size?: number; lit?: boolean; delay?: number }> = ({ size = 46, lit = true, delay = 0 }) => {
    const flameGrad = useSvgId('diya-flame');
    const clayGrad = useSvgId('diya-clay');
    return (
        <svg width={size} height={size * (60 / 64)} viewBox="0 0 64 60" className="overflow-visible">
            <defs>
                <linearGradient id={flameGrad} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFFBEB" />
                    <stop offset="40%" stopColor="#FCD34D" />
                    <stop offset="100%" stopColor="#EA580C" />
                </linearGradient>
                <linearGradient id={clayGrad} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C2410C" />
                    <stop offset="100%" stopColor="#7C2D12" />
                </linearGradient>
            </defs>
            {lit && (
                <>
                    <circle cx="32" cy="18" r="17" fill="#FBBF24" fillOpacity="0.28" style={{ filter: 'blur(5px)' }} />
                    <g className="navaratri-flame" style={{ animationDelay: `${delay}s` }}>
                        <path d="M32 2 C 39 13 41 21 32 30 C 23 21 25 13 32 2 Z" fill={`url(#${flameGrad})`} />
                        <path d="M32 13 C 35 19 35 23 32 27 C 29 23 29 19 32 13 Z" fill="#FFFBEB" />
                    </g>
                </>
            )}
            <line x1="32" y1="28" x2="32" y2="34" stroke="#44200D" strokeWidth="2" strokeLinecap="round" />
            <path d="M5 33 Q 32 35 59 33 Q 55 54 32 56 Q 9 54 5 33 Z" fill={`url(#${clayGrad})`} />
            <ellipse cx="32" cy="33" rx="27" ry="4.5" fill={MAROON} stroke={GOLD} strokeWidth="1.4" />
            <path d="M12 42 Q 32 50 52 42" fill="none" stroke={GOLD} strokeWidth="1.4" strokeDasharray="1.2 3.5" strokeLinecap="round" />
            <circle cx="32" cy="47.5" r="1.8" fill={GOLD} />
        </svg>
    );
};

export const DiyaRow: React.FC<{ count?: number; size?: number; litCount?: number; gap?: number }> = ({
    count = 9,
    size = 40,
    litCount = count,
    gap = 30,
}) => (
    <div className="flex items-end justify-center" style={{ gap }}>
        {Array.from({ length: count }, (_, i) => (
            <Diya key={i} size={size} lit={i < litCount} delay={i * 0.23} />
        ))}
    </div>
);

// Kalash: the sacred pot of Ghatasthapana, installed on the first day of Navaratri.
export const Kalash: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => {
    const potGrad = useSvgId('kalash-pot');
    const leafGrad = useSvgId('kalash-leaf');
    const rimGrad = useSvgId('kalash-rim');
    return (
        <svg width="180" height="250" viewBox="0 0 180 250" className={`pointer-events-none ${className}`} style={style}>
            <defs>
                <linearGradient id={potGrad} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#F6D58A" />
                    <stop offset="45%" stopColor="#D9A544" />
                    <stop offset="100%" stopColor="#8A5A1C" />
                </linearGradient>
                <linearGradient id={rimGrad} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8A6425" />
                    <stop offset="50%" stopColor="#F6DFA9" />
                    <stop offset="100%" stopColor="#8A6425" />
                </linearGradient>
                <linearGradient id={leafGrad} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#365314" />
                    <stop offset="100%" stopColor="#65A30D" />
                </linearGradient>
            </defs>

            <ellipse cx="90" cy="150" rx="80" ry="92" fill="#FCD34D" fillOpacity="0.16" style={{ filter: 'blur(14px)' }} />

            {[-62, -32, 0, 32, 62].map((deg) => (
                <g key={deg} transform={`translate(90 84) rotate(${deg})`}>
                    <path d={LEAF_UP} fill={`url(#${leafGrad})`} />
                    <path d="M0 -3 L0 -48" stroke="#A3E635" strokeOpacity="0.5" strokeWidth="1" />
                </g>
            ))}

            {/* Coconut wrapped in red chunari */}
            <ellipse cx="90" cy="60" rx="21" ry="25" fill="#7C4A1E" />
            <path d="M84 37 l-3 -8 M90 35 l0 -9 M96 37 l3 -8" stroke="#5B3413" strokeWidth="2" strokeLinecap="round" />
            <path d="M68 62 Q 90 74 112 62 L 116 84 Q 90 98 64 84 Z" fill="#C0262D" />
            <path d="M64 84 Q 90 98 116 84" fill="none" stroke={GOLD} strokeWidth="2" strokeDasharray="2 3" />
            <path d="M70 70 Q 90 80 110 70" fill="none" stroke="#FCD34D" strokeOpacity="0.7" strokeWidth="1" strokeDasharray="1 4" strokeLinecap="round" />

            {/* Rim, neck and mauli thread */}
            <ellipse cx="90" cy="94" rx="32" ry="7" fill={`url(#${rimGrad})`} />
            <rect x="70" y="96" width="40" height="14" fill={`url(#${potGrad})`} />
            <rect x="67" y="103" width="46" height="8" rx="2" fill="#DC2626" />
            {Array.from({ length: 8 }, (_, i) => (
                <line key={i} x1={70 + i * 5.5} y1="111" x2={74 + i * 5.5} y2="103" stroke="#FACC15" strokeWidth="1.3" />
            ))}

            {/* Pot body */}
            <path
                d="M70 110 C 30 120 20 162 32 192 C 42 216 68 226 90 226 C 112 226 138 216 148 192 C 160 162 150 120 110 110 Z"
                fill={`url(#${potGrad})`}
            />
            <path d="M52 132 C 38 150 36 178 46 198" fill="none" stroke="#FFFBEB" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" />
            <path d="M40 142 Q 90 156 140 142" fill="none" stroke={MAROON} strokeWidth="2" />
            <path d="M38 198 Q 90 214 142 198" fill="none" stroke={MAROON} strokeWidth="2" />

            {/* Kumkum and haldi motif */}
            <g transform="translate(90 170)">
                <circle r="6" fill="#B91C1C" />
                {Array.from({ length: 8 }, (_, i) => (
                    <circle key={`k-${i}`} r="2.6" cy="-13" fill="#B91C1C" transform={`rotate(${i * 45})`} />
                ))}
                {Array.from({ length: 8 }, (_, i) => (
                    <circle key={`h-${i}`} r="2.2" cy="-21" fill="#F59E0B" transform={`rotate(${i * 45 + 22.5})`} />
                ))}
            </g>

            {/* Brass thali with rice and marigolds */}
            <ellipse cx="90" cy="230" rx="62" ry="11" fill={`url(#${rimGrad})`} />
            {Array.from({ length: 14 }, (_, i) => (
                <ellipse key={`r-${i}`} cx={46 + i * 6.5} cy={227 + (i % 3)} rx="1.6" ry="0.9" fill="#FFFBEB" />
            ))}
            <Marigold x={38} y={226} r={8} tone={0} />
            <Marigold x={142} y={226} r={8} tone={1} />
            <Marigold x={52} y={232} r={6} tone={2} />
            <Marigold x={128} y={232} r={6} tone={0} />
        </svg>
    );
};

// Small lotus used as an ornament in dividers and arch finials.
export const Lotus: React.FC<{ size?: number; className?: string }> = ({ size = 28, className = '' }) => (
    <svg width={size} height={size * 0.75} viewBox="0 0 40 30" className={className}>
        <g fill={GOLD} stroke="#8A6425" strokeWidth="0.6">
            <path d="M20 2 C 25 10 25 20 20 28 C 15 20 15 10 20 2 Z" />
            <path d="M20 28 C 12 24 7 16 6 8 C 13 11 18 18 20 28 Z" fillOpacity="0.85" />
            <path d="M20 28 C 28 24 33 16 34 8 C 27 11 22 18 20 28 Z" fillOpacity="0.85" />
            <path d="M20 28 C 10 28 3 24 0 18 C 8 17 15 21 20 28 Z" fillOpacity="0.65" />
            <path d="M20 28 C 30 28 37 24 40 18 C 32 17 25 21 20 28 Z" fillOpacity="0.65" />
        </g>
    </svg>
);

export const OrnamentDivider: React.FC<{ width?: number }> = ({ width = 120 }) => (
    <div className="flex items-center justify-center gap-3">
        <span className="h-px bg-gradient-to-r from-transparent via-gold-600/60 to-gold-600" style={{ width }} />
        <span className="h-1.5 w-1.5 rotate-45 bg-gold-600" />
        <Lotus size={30} />
        <span className="h-1.5 w-1.5 rotate-45 bg-gold-600" />
        <span className="h-px bg-gradient-to-l from-transparent via-gold-600/60 to-gold-600" style={{ width }} />
    </div>
);

// Jharokha: the cusped Rajasthani window arch, used to frame the code-entry panel.
export const ArchFrame: React.FC<{ width: number; height: number }> = ({ width: w, height: h }) => {
    const fillGrad = useSvgId('arch-fill');
    const arch = (i: number) =>
        `M${i} ${h - i} L${i} ${196} C${i} ${118} ${w / 2 - 96} ${92 + i * 0.4} ${w / 2} ${22 + i} C${w / 2 + 96} ${92 + i * 0.4} ${w - i} ${118} ${w - i} ${196} L${w - i} ${h - i} Z`;
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0 overflow-visible">
            <defs>
                <linearGradient id={fillGrad} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFFDF7" stopOpacity="0.92" />
                    <stop offset="100%" stopColor="#F4E9D4" stopOpacity="0.85" />
                </linearGradient>
            </defs>
            <path d={arch(0)} fill={`url(#${fillGrad})`} stroke={GOLD} strokeWidth="2.2" style={{ filter: 'drop-shadow(0 18px 40px rgba(122,18,48,0.12))' }} />
            <path d={arch(12)} fill="none" stroke={GOLD} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="3 5" />
            <path d={arch(20)} fill="none" stroke={MAROON} strokeOpacity="0.18" strokeWidth="1" />
            <g transform={`translate(${w / 2} 22)`}>
                <line y1="-4" y2="-20" stroke={GOLD} strokeWidth="1.6" />
                <circle cy="-24" r="4.5" fill={GOLD} />
                <circle cy="-24" r="2" fill={MAROON} />
            </g>
        </svg>
    );
};
