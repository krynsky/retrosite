type ComputerLogoProps = {
  size?: number;
  screenColor?: string;
};

export function ComputerLogo({ size = 48, screenColor = "#bff44a" }: ComputerLogoProps) {
  const ink = "#161412";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={{ display: "block", flexShrink: 0, imageRendering: "pixelated" }}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="14" height="11" fill={ink} />
      <rect x="2" y="2" width="12" height="9" fill="#dcd6c2" />
      <rect x="3" y="3" width="10" height="7" fill={ink} />
      <rect x="4" y="4" width="8" height="5" fill={screenColor} />
      <rect x="5" y="5" width="1" height="1" fill={ink} />
      <rect x="10" y="5" width="1" height="1" fill={ink} />
      <rect x="6" y="7" width="4" height="1" fill={ink} />
      <rect x="5" y="6" width="1" height="1" fill={ink} />
      <rect x="10" y="6" width="1" height="1" fill={ink} />
      <rect x="3" y="12" width="10" height="2" fill={ink} />
      <rect x="4" y="13" width="8" height="1" fill="#dcd6c2" />
      <rect x="2" y="14" width="12" height="1" fill={ink} />
    </svg>
  );
}
