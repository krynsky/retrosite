import { Archive, BookOpen } from "lucide-react";
import { HomePage } from "./components/HomePage";
import { ReportPage } from "./components/ReportPage";
import { ReportsPage } from "./components/ReportsPage";
import { SiteNav } from "./components/SiteNav";

const demoProcessSteps = [
  {
    number: "01",
    title: "Request",
    summary: "Submit a public domain or path you want turned into a timeline.",
    detail: "The public demo collects timeline requests for review. It does not run browser automation or generate screenshots directly on the hosted site."
  },
  {
    number: "02",
    title: "Review",
    summary: "Requested sites are reviewed before a timeline is created.",
    detail: "This keeps the demo simple and avoids exposing expensive or fragile screenshot generation to the public internet."
  },
  {
    number: "03",
    title: "Generate locally",
    summary: "Approved timelines are generated with the local Retrosite app.",
    detail: "The local app runs the Wayback discovery, screenshot rendering, curation, editing, and export workflow on a machine that has the required browser tooling."
  },
  {
    number: "04",
    title: "Publish",
    summary: "Finished timelines are uploaded to the demo as static pages.",
    detail: "Published timelines can be browsed on the hosted site, but the hosted site remains read-only."
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
    detail: "Run `npm run publish:timeline -- <job-id-or-target>` to write `krynsky-wayback/timelines/<target>/timeline.json` and screenshot files for a hosted read-only site."
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
          The hosted Retrosite demo is a read-only gallery and request form. You can browse published website
          timelines and submit a site request, but timeline generation and editing happen outside the public site.
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

      <section className="about-notes">
        <div>
          <h2>What you can do here</h2>
          <p>
            Browse published timelines, open Wayback source captures, switch between timeline and image-only views,
            and submit a request for a future timeline.
          </p>
        </div>
        <div>
          <h2>What is not available</h2>
          <p>
            The demo site does not generate new timelines, render screenshots, edit entries, or run the local report
            pipeline in your browser.
          </p>
        </div>
        <div>
          <h2>Why it works this way</h2>
          <p>
            Report generation uses browser automation, Wayback replay checks, local files, and screenshot review. Keeping
            that work local makes the public demo simpler, cheaper, and safer to host.
          </p>
        </div>
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

  const versionMatch = pathname.match(/^\/timeline\/([^/]+?)\/v\/(\d+)(?:\/share)?$/);
  if (versionMatch) {
    return <ReportPage domain={decodeURIComponent(versionMatch[1])} version={Number(versionMatch[2])} />;
  }

  const reportMatch = pathname.match(/^\/timeline\/([^/]+?)(?:\/share)?$/);
  if (reportMatch) {
    return <ReportPage domain={decodeURIComponent(reportMatch[1])} />;
  }

  return <HomePage />;
}
