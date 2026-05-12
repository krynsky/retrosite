import { Archive, BookOpen } from "lucide-react";
import { HomePage } from "./components/HomePage";
import { ReportPage } from "./components/ReportPage";
import { ReportsPage } from "./components/ReportsPage";
import { SiteNav } from "./components/SiteNav";
import { decodeTimelinePath } from "./helpers";

const timelineRequestStatusUrl =
  "https://github.com/search?q=repo%3Akrynsky%2Fretrosite%20is%3Aissue%20label%3Atimeline-request&type=issues";

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
    title: "Review timeline request status",
    summary: "Check the review queue for current and past timeline submissions.",
    detail: (
      <>
        Each submission creates a GitHub issue with the submitted domain or path, original URL, and created time. Review
        the filtered{" "}
        <a href={timelineRequestStatusUrl}>timeline request issues</a>
        {" "}to see open and closed requests without mixing in unrelated project issues.
      </>
    )
  },
  {
    number: "04",
    title: "Author publishes updates",
    summary: "Approved timelines are generated, curated, and promoted into the demo.",
    detail: "The author runs Retrosite locally, reviews the Wayback captures and screenshots, publishes the finished timeline as static assets, then deploys the update so the new timeline appears in the public gallery."
  },
  {
    number: "05",
    title: "Run your own copy",
    summary: "Anyone can create their own reports by downloading Retrosite from GitHub.",
    detail: "Clone or download the app from github.com/krynsky/retrosite, install the dependencies, run it on your own machine, and enter a public domain or path. Your local copy can discover Wayback captures, render screenshots, curate entries, and export a report without depending on the demo site."
  }
];

const localUseSteps = [
  {
    number: "01",
    title: "Install",
    summary: "Install from GitHub or Pinokio.",
    detail: "Pinokio installs and starts the app for you. If you clone the repository directly, run `npm install` from the project folder. Both install paths include the same local app and starter timelines."
  },
  {
    number: "02",
    title: "Open Retrosite",
    summary: "Run the local web app on your machine.",
    detail: "Pinokio opens Retrosite from its app screen. For a repository install, run `npm run dev`, then open `http://127.0.0.1:5173/`. Local mode enables report generation and edit controls by default."
  },
  {
    number: "03",
    title: "Browse starter timelines",
    summary: "Start with a small curated set of example timelines.",
    detail: "Local and Pinokio installs include a few starter timelines so you can inspect the finished report format before generating your own. The larger public demo gallery is kept separate from normal installs."
  },
  {
    number: "04",
    title: "Inspect Archive",
    summary: "Preview archive quality and find useful archived paths.",
    detail: "This summarizes the Wayback history before rendering and discovers archived paths in one request. Retrosite reports the capture range, capture count, covered years, unique digest count, weak years, estimated archive size, render cap, and Wayback instability warnings. It also filters out assets and suggests likely targets such as `/`, `/index.html`, `/home.html`, `/about`, `/main.asp`, and other older entry points. Choosing a suggested path updates the target field and switches Source to Specific path."
  },
  {
    number: "05",
    title: "Choose Depth",
    summary: "Control how much Retrosite renders.",
    detail: "Depth controls how much Retrosite renders. Higher depth can improve coverage, but large or unstable archives take longer and may produce more weak captures to curate."
  },
  {
    number: "06",
    title: "Choose Source",
    summary: "Control where Retrosite searches the Wayback Machine.",
    detail: "Source controls where Retrosite searches the Wayback Machine before it chooses candidate pages to render. Use it to decide whether Retrosite should stay on the homepage, use a specific path, or broaden discovery across the site when exact homepage captures are weak."
  },
  {
    number: "07",
    title: "Create a timeline",
    summary: "Enter a public domain or path, then create the timeline.",
    detail: "Examples include `example.com`, `krynsky.com`, or `friendfeed.com/krynsky`. Retrosite asks Wayback to save the current live page while it queries existing captures. If Wayback returns that new capture in time, Retrosite adds it as a current candidate so the report can end with today's version. Retrosite also uses CDX filters for successful HTML captures, collapses repeated digests, samples across years, broadens discovery when exact homepage captures are too thin, renders screenshots in Chrome, and builds an editable draft. If the target already has a finished report, submitting it again from the homepage creates a new version using the selected depth and source."
  },
  {
    number: "08",
    title: "Edit and curate",
    summary: "Review screenshots, labels, notes, and tech-stack fields.",
    detail: "Use the timeline view and local edit controls to choose better screenshots, exclude weak captures, and correct the text before exporting."
  },
  {
    number: "09",
    title: "Export",
    summary: "Export Markdown or HTML with included screenshot assets.",
    detail: "Generated exports are zip packages so the timeline document and its screenshots stay together for your own archive, notes, or site."
  }
];

const sourceModeNotes = [
  {
    title: "Best page per year",
    detail:
      "Default mode. Starts with exact homepage or path captures, then broadens to prefix, host, or domain discovery when exact captures are weak."
  },
  {
    title: "Homepage only",
    detail:
      "Uses exact homepage variants only. Choose this when you want the timeline to represent the root site even if subpages have richer archives."
  },
  {
    title: "Specific path",
    detail:
      "Uses exact captures for the path in the input, such as `example.com/about`. Inspect Archive path suggestions switch to this mode after you select a suggested path."
  },
  {
    title: "Whole domain",
    detail:
      "Uses broader domain-level discovery. Choose this when old homepages are weak and you want Retrosite to look for stronger archived pages across the site."
  }
];

const depthOptionNotes = [
  {
    title: "Adaptive",
    detail:
      "Recommended default. Retrosite estimates archive size and Wayback stability, then adjusts the render budget so small archives get normal coverage and large or unstable archives stay reliable."
  },
  {
    title: "Quick",
    detail:
      "Fastest option. Renders fewer candidates, currently capped around 10 final screenshots, and is useful for a quick preview or for very unstable archives."
  },
  {
    title: "Standard",
    detail:
      "Normal option. Uses the default screenshot depth, currently around 35 final screenshots, and is a good fit for average-sized archives."
  },
  {
    title: "Deep",
    detail:
      "Most thorough option. Uses the maximum configured depth, currently around 50 final screenshots, and can take longer on large archives."
  }
];

function AboutPage() {
  return (
    <main className="page paper-bg about-page">
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
    <main className="page paper-bg howto-page">
      <SiteNav />
      <section className="about-hero">
        <span className="eyebrow">
          <BookOpen size={16} />
          How to use
        </span>
        <h1>Run Retrosite locally and create website timelines</h1>
        <p>
          The local and Pinokio versions are built for private timeline generation on your own machine. They include a
          small starter set of timelines, can render Wayback Machine screenshots, let you edit generated drafts, and
          export finished timelines without depending on the hosted demo site.
        </p>
      </section>

      <section className="howto-doc" aria-label="Local Retrosite instructions">
        <section className="howto-section">
          <h2>Basic workflow</h2>
          <ol className="howto-list">
            {localUseSteps.map((step) => (
              <li key={step.number}>
                <strong>{step.title}.</strong> {step.summary} {step.detail}
                {step.number === "05" && (
                  <dl className="howto-definition-list">
                    {depthOptionNotes.map((note) => (
                      <div key={note.title}>
                        <dt>{note.title}</dt>
                        <dd>{note.detail}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {step.number === "06" && (
                  <dl className="howto-definition-list">
                    {sourceModeNotes.map((note) => (
                      <div key={note.title}>
                        <dt>{note.title}</dt>
                        <dd>{note.detail}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ol>
        </section>
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
