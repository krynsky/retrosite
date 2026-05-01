import { ReactNode } from "react";

type MarkerTone = "blue" | "pink" | "double";

const toneClass: Record<MarkerTone, string> = {
  blue: "u-marker",
  pink: "u-marker-pink",
  double: "u-marker-double"
};

export function MarkerText({ children, tone = "blue" }: { children: ReactNode; tone?: MarkerTone }) {
  return <span className={toneClass[tone]}>{children}</span>;
}
