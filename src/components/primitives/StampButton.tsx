import { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "paper" | "ink" | "aqua" | "yellow";
type Size = "sm" | "md" | "lg";

const toneClass: Record<Tone, string> = {
  primary: "stamp-btn--primary",
  paper: "stamp-btn--paper",
  ink: "stamp-btn--ink",
  aqua: "stamp-btn--aqua",
  yellow: "stamp-btn--yellow"
};

const sizeClass: Record<Size, string> = {
  sm: "stamp-btn--sm",
  md: "stamp-btn--md",
  lg: "stamp-btn--lg"
};

type CommonProps = {
  tone?: Tone;
  size?: Size;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
};

type ButtonProps = CommonProps & {
  as?: "button";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

type AnchorProps = CommonProps & {
  as: "a";
  href: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href">;

export function StampButton(props: ButtonProps | AnchorProps) {
  if (props.as === "a") {
    const { tone = "primary", size = "md", icon, children, className = "", as: _as, ...rest } = props;
    const cls = `stamp-btn ${toneClass[tone]} ${sizeClass[size]} ${className}`.trim();
    return (
      <a className={cls} {...rest}>
        {children}
        {icon}
      </a>
    );
  }

  const { tone = "primary", size = "md", icon, children, className = "", as: _as, ...rest } = props;
  const cls = `stamp-btn ${toneClass[tone]} ${sizeClass[size]} ${className}`.trim();
  return (
    <button className={cls} {...rest}>
      {children}
      {icon}
    </button>
  );
}
