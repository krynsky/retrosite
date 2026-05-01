import { ReactNode } from "react";

type PolaroidProps = {
  children: ReactNode;
  width?: number;
  rotate?: number;
  innerHeightRatio?: number;
};

export function Polaroid({
  children,
  width = 420,
  rotate = -1.2,
  innerHeightRatio = 0.74
}: PolaroidProps) {
  return (
    <div className="polaroid-wrap" style={{ transform: `rotate(${rotate}deg)` }}>
      <div className="polaroid" style={{ width }}>
        <div className="polaroid-inner" style={{ height: width * innerHeightRatio }}>
          {children}
        </div>
      </div>
    </div>
  );
}
