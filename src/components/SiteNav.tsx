import { Github } from "lucide-react";
import { useAppConfig } from "../useAppConfig";
import { ComputerLogo } from "./primitives/ComputerLogo";
import { Sticker } from "./primitives/Sticker";
import { StampButton } from "./primitives/StampButton";

export function SiteNav() {
  const { config } = useAppConfig();
  const isDemoSite = config.mode === "request-only";

  return (
    <header className="site-nav">
      <a href="/" className="site-mark">
        <ComputerLogo size={48} />
        <span className="site-mark-name">Retrosite</span>
        {isDemoSite && <Sticker tone="aqua" rotate={-7}>Demo</Sticker>}
      </a>
      <nav className="site-nav-actions" aria-label="Primary navigation">
        <StampButton as="a" href="/timeline" tone="primary" size="md">Timelines</StampButton>
        <StampButton as="a" href={isDemoSite ? "/about" : "/how-to-use"} tone="paper" size="md">
          {isDemoSite ? "About" : "How to use"}
        </StampButton>
        <StampButton
          as="a"
          href="https://github.com/krynsky/retrosite"
          tone="paper"
          size="md"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Github size={16} strokeWidth={2.2} aria-hidden="true" />
          GitHub
        </StampButton>
      </nav>
    </header>
  );
}
