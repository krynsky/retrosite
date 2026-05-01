/* =========================================================
   Retrosite components
   ========================================================= */

// ---------- Pixel icons (hand-built grids) ----------
function Pixel({ grid, color = '#161412', accent = '#2b6df0', size = 24, scale = 1 }) {
  // grid: array of strings; chars: ' ' empty, '#' ink, '.' accent, '-' light
  const rows = grid.length;
  const cols = grid[0].length;
  const px = (size * scale) / Math.max(rows, cols);
  return (
    <svg width={size * scale} height={size * scale} viewBox={`0 0 ${cols} ${rows}`} shapeRendering="crispEdges" style={{ display: 'block' }}>
      {grid.flatMap((row, y) =>
        [...row].map((ch, x) => {
          if (ch === ' ') return null;
          const f = ch === '#' ? color : ch === '.' ? accent : ch === '-' ? '#bff44a' : ch === 'o' ? '#ffb6c8' : ch === 'y' ? '#fff27a' : color;
          return <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={f} />;
        })
      )}
    </svg>
  );
}

// Specific icons
const ICONS = {
  computer: [
    '############',
    '#----------#',
    '#-##---##--#',
    '#-##---##--#',
    '#----------#',
    '#---####---#',
    '#--##--##--#',
    '#----------#',
    '############',
    '#  ######  #',
    '############',
    ' ########## ',
  ],
  disk: [
    ' ########## ',
    '#..........#',
    '#.######...#',
    '#.######...#',
    '#.######...#',
    '#..........#',
    '#..........#',
    '#.########.#',
    '#.#......#.#',
    '#.#......#.#',
    '#.########.#',
    '############',
  ],
  globe: [
    '   ####   ',
    ' ##....## ',
    '#.#.##.#.#',
    '#..#..#..#',
    '#.######.#',
    '#.######.#',
    '#..#..#..#',
    '#.#.##.#.#',
    ' ##....## ',
    '   ####   ',
  ],
  clock: [
    '  ######  ',
    ' #......# ',
    '#..#.....#',
    '#..#.....#',
    '#..#.....#',
    '#..#####.#',
    '#........#',
    '#........#',
    ' #......# ',
    '  ######  ',
  ],
  folder: [
    '####        ',
    '#..######## ',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '############',
  ],
  doc: [
    '########  ',
    '#......## ',
    '#.####..# ',
    '#......## ',
    '#.####..#.',
    '#......#..',
    '#.####.#..',
    '#......#..',
    '########..',
  ],
  bookmark: [
    '########',
    '#......#',
    '#......#',
    '#..##..#',
    '#.####.#',
    '#......#',
    '#......#',
    '##....##',
    '#.#  #.#',
    '#       #',
  ],
  arrow: [
    '         #  ',
    '         ##  ',
    '##########.# ',
    '############ ',
    '############ ',
    '##########.# ',
    '         ##  ',
    '         #   ',
  ],
};

function PixelIcon({ name, size = 28, scale = 1, color, accent }) {
  const grid = ICONS[name];
  if (!grid) return null;
  return <Pixel grid={grid} size={size} scale={scale} color={color} accent={accent} />;
}

// ---------- Stamp button ----------
function StampButton({ children, tone = 'lime', size = 'md', as: Tag = 'button', icon, ...rest }) {
  const tones = {
    lime:    { bg: 'var(--lime)',    fg: 'var(--ink)' },
    paper:   { bg: 'var(--paper)',   fg: 'var(--ink)' },
    ink:     { bg: 'var(--ink)',     fg: 'var(--paper)' },
    pink:    { bg: 'var(--sticky)',  fg: 'var(--ink)' },
    yellow:  { bg: 'var(--sticky-yellow)', fg: 'var(--ink)' },
  };
  const sizes = {
    sm: { padding: '6px 12px', fontSize: 13 },
    md: { padding: '10px 18px', fontSize: 15 },
    lg: { padding: '14px 22px', fontSize: 17 },
  };
  const t = tones[tone];
  const s = sizes[size];
  return (
    <Tag
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: t.bg, color: t.fg,
        border: '2.5px solid var(--ink)',
        borderRadius: 4,
        boxShadow: '3px 3px 0 0 var(--ink)',
        fontFamily: 'var(--font-mono)', fontWeight: 700,
        cursor: 'pointer',
        transition: 'transform .08s ease, box-shadow .08s ease',
        ...s, ...(rest.style || {}),
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'translate(2px,2px)'; e.currentTarget.style.boxShadow = '1px 1px 0 0 var(--ink)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '3px 3px 0 0 var(--ink)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '3px 3px 0 0 var(--ink)'; }}
    >
      {children}
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
    </Tag>
  );
}

// ---------- Sticker badge ----------
function Sticker({ children, tone = 'pink', rotate = -6, style }) {
  const tones = {
    pink:   'var(--sticky)',
    yellow: 'var(--sticky-yellow)',
    lime:   'var(--lime)',
  };
  return (
    <span style={{
      display: 'inline-block',
      background: tones[tone],
      border: '2px solid var(--ink)',
      padding: '3px 10px 4px',
      fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 13,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      transform: `rotate(${rotate}deg)`,
      boxShadow: '2px 2px 0 0 var(--ink)',
      ...style,
    }}>{children}</span>
  );
}

// ---------- Polaroid card ----------
function Polaroid({ children, caption, captionTone = 'pink', rotate = -1.5, width = 360, tape = true, style }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', transform: `rotate(${rotate}deg)`, ...style }}>
      {tape && (
        <div style={{
          position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%) rotate(-3deg)',
          width: 78, height: 22, background: 'var(--tape)',
          borderLeft: '1px dashed rgba(0,0,0,0.12)', borderRight: '1px dashed rgba(0,0,0,0.12)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)', zIndex: 2,
        }} />
      )}
      <div style={{
        width, padding: 10, paddingBottom: 22,
        background: '#fbf6e6',
        border: '1px solid #c9b88a',
        boxShadow: 'var(--shadow-photo)',
        position: 'relative',
      }}>
        <div style={{
          background: '#dce4eb', height: width * 0.66, overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.06)', position: 'relative',
        }}>{children}</div>
        {caption && (
          <div style={{
            position: 'absolute', bottom: -18, left: '50%',
            transform: 'translateX(-50%) rotate(-2deg)',
            fontFamily: 'var(--font-hand)', fontSize: 28, color: 'var(--ink)',
            whiteSpace: 'nowrap',
          }}>
            <span className={captionTone === 'pink' ? 'u-marker-pink' : 'u-marker'}>{caption}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Domain input ----------
function DomainField({ label = 'DOMAIN', placeholder = 'e.g., example.com', defaultValue = '' }) {
  return (
    <div style={{
      display: 'inline-block', position: 'relative',
      border: '2.5px solid var(--ink)', background: 'var(--paper)',
      padding: '14px 16px 12px', minWidth: 320,
    }}>
      <span style={{
        position: 'absolute', top: -10, left: 12,
        background: 'var(--paper)', padding: '0 6px',
        fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12,
        letterSpacing: '0.1em',
      }}>{label}</span>
      <input
        defaultValue={defaultValue}
        placeholder={placeholder}
        style={{
          width: '100%', border: 0, background: 'transparent', outline: 'none',
          fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--ink-mute)',
        }}
      />
    </div>
  );
}

// ---------- Dashed feature row ----------
function DashedRow({ children, style }) {
  return (
    <div style={{
      border: '1.5px dashed var(--ink)',
      padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 18,
      background: 'transparent',
      ...style,
    }}>{children}</div>
  );
}

// ---------- Section divider (dashed) ----------
function DashedDivider({ style }) {
  return <div style={{ height: 0, borderTop: '1.5px dashed var(--ink)', ...style }} />;
}

// ---------- Marker scribble decoration ----------
function MarkerScribble({ width = 120, color = '#2b6df0', style }) {
  return (
    <svg width={width} height="14" viewBox="0 0 200 14" preserveAspectRatio="none" style={style}>
      <path d="M2 7 C 40 2, 80 12, 130 6 S 195 4, 198 8" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ---------- Logo ----------
function Logo({ size = 36 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <span style={{ display: 'inline-flex', padding: 2 }}>
        <Pixel
          size={size}
          color="#161412"
          accent="#bff44a"
          grid={[
            '############',
            '#-----------',
            '#-##.....##-',
            '#-##.....##-',
            '#-----------',
            '#----.----#-',
            '#---...---#-',
            '#----.----#-',
            '############',
            '#  ######  #',
            '############',
            ' ########## ',
          ]}
        />
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size * 0.95, letterSpacing: '-0.02em' }}>
        Retrosite
      </span>
    </span>
  );
}

// Expose
Object.assign(window, {
  Pixel, PixelIcon, ICONS,
  StampButton, Sticker, Polaroid,
  DomainField, DashedRow, DashedDivider,
  MarkerScribble, Logo,
});
