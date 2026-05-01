import { InputHTMLAttributes } from "react";

type DomainFieldProps = {
  label?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function DomainField({ label = "DOMAIN OR PATH", ...rest }: DomainFieldProps) {
  return (
    <div className="domain-field">
      <span className="domain-field-legend">{label}</span>
      <input className="domain-field-input" {...rest} />
    </div>
  );
}
