import { ReactNode } from "react";

type StickerTone = "aqua" | "yellow" | "primary";

const toneClass: Record<StickerTone, string> = {
  aqua: "sticker--aqua",
  yellow: "sticker--yellow",
  primary: "sticker--primary"
};

type StickerProps = {
  children: ReactNode;
  tone?: StickerTone;
  rotate?: number;
};

export function Sticker({ children, tone = "aqua", rotate = -7 }: StickerProps) {
  return (
    <span className={`sticker ${toneClass[tone]}`} style={{ transform: `rotate(${rotate}deg)` }}>
      {children}
    </span>
  );
}
