type DashedDividerProps = {
  className?: string;
};

export function DashedDivider({ className = "" }: DashedDividerProps) {
  return <hr className={`dashed-divider ${className}`.trim()} />;
}
