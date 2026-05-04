import { Archive, BookOpen } from "lucide-react";
import { HomePage } from "./components/HomePage";
import { ReportPage } from "./components/ReportPage";
import { ReportsPage } from "./components/ReportsPage";
import { SiteNav } from "./components/SiteNav";
import { decodeTimelinePath } from "./helpers";

const demoProcessSteps = [
  {
    number: "01",
    title: "Browse the showcase",
    summary: "Explore finished website timelines published by the app author.",
    detail: "The demo site is a public gallery for selected timelines. Each published page combines Wayback captures, screenshots, source links, and notes into a read-only history of how a site changed over time."
  },
  {
    number: "02",
    title: "Request a timeline",
    summary: "Suggest a domain or domain/path for a future published timeline.",
    detail: "Requests go into a review queue instead of generating immediately. This keeps the hosted demo focused, avoids public abuse, and lets each timeline be checked before it appears on the site."
  },
  {
    number: "03",
    title: "Author publishes updates",
    summary: "Approved timelines are generated, curated, and promoted into the demo.",
    detail: "The author runs Retrosite locally, reviews the Wayback captures and screenshots, publishes the finished timeline as static assets, then deploys the update so the new timeline appears in the public gallery."
  },
  {
    number: "04",
    title: "Run your own copy",
    summary: "Anyone can create their own reports by downloading Retrosite from GitHub.",
    detail: "Clone or download the app from github.com/krynsky/retrosite, install the dependencies, run it on your own machine, and enter a public domain or path. Your local copy can discover Wayback captures, render screenshots, curate entries, and export a report without depending on the demo site."
  }
];

const localUseSteps = [
  {
    number: "01",
    title: "Install",
    summary: "Install dependencies from the project folder.",
    detail: "Run `npm install` after cloning the repository. The app is a local web server with a Vite frontend and Express API."
  },
  {
    number: "02",
    title: "Run locally",
    summary: "Start the API and web app together.",
    detail: "Run `npm run dev`, then open `http://127.0.0.1:5173/`. Local mode enables report generation and edit controls by default."
  },
  {
    number: "03",
    title: "Create a timeline",
    summary: "Enter a public domain or path, then create the timeline.",
    detail: "Examples include `example.com`, `krynsky.com`, or `friendfeed.com/krynsky`. Retrosite queries Wayback Machine captures, renders screenshots in Chrome, and builds an editable draft."
  },
  {
    number: "04",
    title: "Edit and curate",
    summary: "Review screenshots, labels, notes, and tech-stack fields.",
    detail: "Use the timeline view and local edit controls to choose better screenshots, exclude weak captures, and correct the text before publishing or exporting."
  },
  {
    number: "05",
    title: "Export",
    summary: "Export Markdown or HTML with included screenshot assets.",
    detail: "Generated exports are zip packages so the timeline document and its screenshots stay together."
  },
  {
    number: "06",
    title: "Publish static timelines",
    summary: "Promote a local timeline into public static assets.",
    detail: "Run `npm run publish:timeline -- <job-id-or-target>` to write `demosite/timelines/<target>/timeline.json` and screenshot files for a hosted read-only site."
  }
];

function AboutPage() {
  return (
    <main className="page paper-bg">
      <SiteNav />
      <section className="about-hero">
        <span className="eyebrow">
          <Archive size={16} />
          About the process
        </span>
        <h1>About the Retrosite demo</h1>
        <p>
          Retrosite demo site is a showcase of website timelines published by{" "}
          <a href="https://krynsky.com">Mark Krynsky</a>. The timelines leverage the{" "}
          <a href="https://web.archive.org/">Wayback Machine</a> to identify and create screenshots for each year
          represented in the lifespan of a website. You can browse finished timelines and suggest future ones, while
          report generation and editing stay in the local app. You can{" "}
          <a href="https://github.com/krynsky/retrosite">install and run</a> Retrosite on your own machine to generate
          reports.
        </p>
      </section>

      <section className="about-process" aria-label="Report creation process">
        {demoProcessSteps.map((step) => (
          <article key={step.number}>
            <span>{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.summary}</p>
            <p>{step.detail}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function HowToUsePage() {
  return (
    <main className="page paper-bg">
      <SiteNav />
      <section className="about-hero">
        <span className="eyebrow">
          <BookOpen size={16} />
          How to use
        </span>
        <h1>Run Retrosite locally and create website timelines</h1>
        <p>
          The local version is the full Retrosite app. It can create timeline jobs, render Wayback Machine screenshots,
          let you edit the generated draft, and export or publish the finished timeline.
        </p>
      </section>

      <section className="about-process" aria-label="Local Retrosite workflow">
        {localUseSteps.map((step) => (
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
          <h2>Useful commands</h2>
          <p>
            Use `npm run dev` for local development, `npm test` for the API and pipeline tests, `npm run check` for
            TypeScript, and `npm run build` before publishing changes.
          </p>
        </div>
        <div>
          <h2>Local data</h2>
          <p>
            Generated jobs and screenshots are stored under `server/generated/`. This folder is intentionally local and
            ignored by git.
          </p>
        </div>
        <div>
          <h2>Public demo publishing</h2>
          <p>
            After a timeline is curated locally, publish static assets with `npm run publish:timeline -- target`, then
            deploy the static timeline files with the site.
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

  if (pathname === "/how-to-use") {
    return <HowToUsePage />;
  }

  if (pathname === "/timeline") {
    return <ReportsPage />;
  }

  if (pathname === "/reports") {
    window.location.replace(`/timeline${window.location.search}${window.location.hash}`);
    return null;
  }

  const legacyTimelinePath = pathname.match(/^\/reports?\/(.+)$/);
  if (legacyTimelinePath) {
    window.location.replace(`/timeline/${legacyTimelinePath[1]}${window.location.search}${window.location.hash}`);
    return null;
  }

  const versionMatch = pathname.match(/^\/timeline\/(.+?)\/v\/(\d+)(?:\/share)?$/);
  if (versionMatch) {
    return <ReportPage domain={decodeTimelinePath(versionMatch[1])} version={Number(versionMatch[2])} />;
  }

  const reportMatch = pathname.match(/^\/timeline\/(.+)$/);
  if (reportMatch) {
    return <ReportPage domain={decodeTimelinePath(reportMatch[1].replace(/\/share$/, ""))} />;
  }

  return <HomePage />;
}
