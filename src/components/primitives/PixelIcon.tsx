type PixelGrid = string[];

const ICONS: Record<string, PixelGrid> = {
  computer: [
    "############",
    "#----------#",
    "#-##---##--#",
    "#-##---##--#",
    "#----------#",
    "#---####---#",
    "#--##--##--#",
    "#----------#",
    "############",
    "#  ######  #",
    "############",
    " ########## "
  ],
  disk: [
    " ########## ",
    "#..........#",
    "#.######...#",
    "#.######...#",
    "#.######...#",
    "#..........#",
    "#..........#",
    "#.########.#",
    "#.#......#.#",
    "#.#......#.#",
    "#.########.#",
    "############"
  ],
  globe: [
    "   ####   ",
    " ##....## ",
    "#.#.##.#.#",
    "#..#..#..#",
    "#.######.#",
    "#.######.#",
    "#..#..#..#",
    "#.#.##.#.#",
    " ##....## ",
    "   ####   "
  ],
  clock: [
    "  ######  ",
    " #......# ",
    "#..#.....#",
    "#..#.....#",
    "#..#.....#",
    "#..#####.#",
    "#........#",
    "#........#",
    " #......# ",
    "  ######  "
  ],
  folder: [
    "####        ",
    "#..######## ",
    "#..........#",
    "#..........#",
    "#..........#",
    "#..........#",
    "#..........#",
    "############"
  ],
  doc: [
    "########  ",
    "#......## ",
    "#.####..# ",
    "#......## ",
    "#.####..#.",
    "#......#..",
    "#.####.#..",
    "#......#..",
    "########.."
  ],
  bookmark: [
    "########",
    "#......#",
    "#......#",
    "#..##..#",
    "#.####.#",
    "#......#",
    "#......#",
    "##....##",
    "#.#  #.#",
    "#       #"
  ],
  arrow: [
    "         #  ",
    "         ##  ",
    "##########.# ",
    "############ ",
    "############ ",
    "##########.# ",
    "         ##  ",
    "         #   "
  ]
};

type PixelIconProps = {
  name: keyof typeof ICONS;
  size?: number;
  color?: string;
  accent?: string;
};

export function PixelIcon({
  name,
  size = 28,
  color = "var(--ink)",
  accent = "var(--marker-blue)"
}: PixelIconProps) {
  const grid = ICONS[name];
  if (!grid) return null;
  const rows = grid.length;
  const cols = grid[0].length;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      {grid.flatMap((row, y) =>
        [...row].map((ch, x) => {
          if (ch === " ") return null;
          const fill = ch === "#" ? color : ch === "." ? accent : color;
          return <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={fill} />;
        })
      )}
    </svg>
  );
}

export const PIXEL_ICON_NAMES = Object.keys(ICONS);
