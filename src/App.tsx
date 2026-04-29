import { Archive } from "lucide-react";
import { HomePage } from "./components/HomePage";
import { ReportPage } from "./components/ReportPage";
import { ReportsPage } from "./components/ReportsPage";
import { SiteNav } from "./components/SiteNav";

const processSteps = [
  {
    number: "01",
    title: "Discover",
    summary: "Query exact homepage captures across http, https, root, and www variants.",
    detail: "Retrosite starts by asking the Wayback Machine CDX index for exact homepage captures. It checks the common URL variants because older sites often moved between www, non-www, http, and https over time."
  },
  {
    number: "02",
    title: "Render",
    summary: "Capture full-page Wayback replays and mark broken, stripped, or partially styled versions.",
    detail: "Candidate captures need to be opened and rendered because archive data alone cannot tell whether a page visually survived. Broken stylesheets, missing images, partial hydration, and stripped fallback pages are marked for replacement."
  },
  {
    number: "03",
    title: "Curate",
    summary: "Group visually distinct eras, keep the best replay, and record omitted gaps.",
    detail: "The report should show meaningful visual eras, not every timestamp. Nearby captures are compared so the clearest representative screenshot is kept, while replay gaps and unreliable eras are documented honestly."
  },
  {
    number: "04",
    title: "Publish",
    summary: "Export a shareable timeline with screenshots, source links, tech stack notes, and caveats.",
    detail: "The final output combines screenshots, Wayback links, inferred technology notes, and render caveats into a visual timeline that can be read as a history of the site's design."
  }
];

function AboutPage() {
  return (
    <main>
      <SiteNav />
      <section className="about-hero">
        <span className="eyebrow">
          <Archive size={16} />
          About the process
        </span>
        <h1>How Retrosite creates a visual archive report</h1>
        <p>
          Retrosite turns historical Wayback Machine captures into a curated report that shows how a website changed
          over time, with screenshots, source links, technology notes, and replay caveats.
        </p>
      </section>

      <section className="about-process" aria-label="Report creation process">
        {processSteps.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.summary}</p>
            <p>{step.detail}</p>
          </article>
        ))}
      </section>

      <section className="about-notes">
        <div>
          <h2>What the report includes</h2>
          <p>
            A finished report includes selected screenshots, capture dates, Wayback source links, inferred stack details,
            notes about visual changes, and transparent explanations for eras that could not be rendered reliably.
          </p>
        </div>
        <div>
          <h2>Why curation matters</h2>
          <p>
            Archive indexes contain many duplicates and many technically successful captures that do not visually replay.
            The useful artifact is a human-readable timeline of design eras, not a raw dump of every capture.
          </p>
        </div>
        <div>
          <h2>No LLM required</h2>
          <p>
            The MVP runs from deterministic archive discovery, screenshot rendering, visual-quality checks, and editable
            draft fields. An LLM could improve captions later, but the report pipeline does not depend on one.
          </p>
        </div>
      </section>
    </main>
  );
}

export function App() {
  const pathname = window.location.pathname;

  if (pathname === "/about") {
    return <AboutPage />;
  }

  if (pathname === "/reports") {
    return <ReportsPage />;
  }

  const reportMatch = pathname.match(/^\/report\/([^/]+?)(?:\/share)?$/);
  if (reportMatch) {
    return <ReportPage domain={decodeURIComponent(reportMatch[1])} />;
  }

  return <HomePage />;
}
