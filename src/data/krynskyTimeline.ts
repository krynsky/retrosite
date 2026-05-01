export type TimelineEntry = {
  date: string;
  title: string;
  techStack: string;
  source: string;
  image: string;
  notes: string;
  focusScale?: number;
  focusOrigin?: string;
  focusHeight?: string;
};

export const krynskyTimeline: TimelineEntry[] = [
  {
    date: "1997-01-08",
    title: "Desperate Dialogue portrait homepage",
    techStack: "Microsoft FrontPage 2.0",
    source: "https://web.archive.org/web/19970108062205if_/http://krynsky.com:80/",
    image: "/screenshots/19970108062205-desperate-dialogue-portrait-homepage.png",
    notes: "Earliest fully rendered design: black background, portrait image, and small poetic navigation.",
    focusScale: 2.35,
    focusOrigin: "center top",
    focusHeight: "34rem"
  },
  {
    date: "1998-02-03",
    title: "Black vertical-navigation portal",
    techStack: "Microsoft FrontPage 3.0",
    source: "https://web.archive.org/web/19980203201236if_/http://www.krynsky.com:80/",
    image: "/screenshots/19980203201236-black-vertical-navigation-portal.png",
    notes: "Fully styled portal with vertical krynsky.com branding and stacked content blocks.",
    focusScale: 1.95,
    focusOrigin: "left top"
  },
  {
    date: "1999-10-11",
    title: "Grey textured portal layout",
    techStack: "Microsoft FrontPage 4.0",
    source: "https://web.archive.org/web/19991011212658if_/http://krynsky.com:80/",
    image: "/screenshots/19991011212658-grey-textured-portal-layout.png",
    notes: "Last good render of the grey textured portal before the red splash redesign.",
    focusScale: 1.18,
    focusOrigin: "center top"
  },
  {
    date: "2000-03-02",
    title: "Red krynsky.com splash layout",
    techStack: "Classic ASP-era links/pages, Microsoft FrontPage 4.0",
    source: "https://web.archive.org/web/20000302102838if_/http://krynsky.com:80/",
    image: "/screenshots/20000302102838-red-krynsky.com-splash-layout.png",
    notes: "Short-lived red design with a compact black content panel.",
    focusScale: 1.75,
    focusOrigin: "left top"
  },
  {
    date: "2001-01-24",
    title: "Desperate Dialogue magazine layout",
    techStack: "Classic ASP-era links/pages",
    source: "https://web.archive.org/web/20010124021500if_/http://krynsky.com:80/",
    image: "/screenshots/20010124021500-desperate-dialogue-magazine-layout.png",
    notes: "Full long-form editorial page with side navigation and dense text.",
    focusScale: 1.12,
    focusOrigin: "center top"
  },
  {
    date: "2005-03-03",
    title: "Boxed Desperate Dialogue weblog layout",
    techStack: "Classic ASP/custom HTML weblog layout; static/table-based design elements",
    source: "https://web.archive.org/web/20050303173137if_/http://www.krynsky.com:80/",
    image: "/screenshots/20050303173137-boxed-desperate-dialogue-weblog-layout.png",
    notes: "Best late capture of the boxed Desperate Dialogue design before the WordPress transition.",
    focusScale: 1.12,
    focusOrigin: "center top"
  },
  {
    date: "2008-12-23",
    title: "Blue WordPress blog theme",
    techStack: "WordPress 2.6.2, Cleaker theme, lazy-k-gallery plugin",
    source: "https://web.archive.org/web/20081223045627if_/http://krynsky.com:80/",
    image: "/screenshots/20081223045627-blue-wordpress-blog-theme.png",
    notes: "Full styled blog theme with header, sidebars, search, and post content.",
    focusScale: 1.08,
    focusOrigin: "center top"
  },
  {
    date: "2009-07-03",
    title: "Red and white magazine blog theme",
    techStack: "WordPress 2.7, Statement theme, gallery/lightbox/lifestream plugins",
    source: "https://web.archive.org/web/20090703172553if_/http://krynsky.com:80/",
    image: "/screenshots/20090703172553-red-and-white-magazine-blog-theme.png",
    notes: "Best complete capture of the 2009 red/white theme before later captures became visually degraded.",
    focusScale: 1.08,
    focusOrigin: "center top"
  },
  {
    date: "2013-12-25",
    title: "Black-header tiled magazine layout",
    techStack: "WordPress 3.6, jQuery",
    source: "https://web.archive.org/web/20131225102652if_/http://krynsky.com/",
    image: "/screenshots/20131225102652-black-header-tiled-magazine-layout.png",
    notes: "Last good render of the image-heavy tiled magazine layout before the 2014-2017 replay gap.",
    focusScale: 1.08,
    focusOrigin: "center top"
  },
  {
    date: "2018-05-11",
    title: "Card-grid homepage with right sidebar",
    techStack: "WordPress 4.9.5, Sassy Social Share, All in One SEO Pack",
    source: "https://web.archive.org/web/20180511224610if_/https://krynsky.com/",
    image: "/screenshots/20180511224610-card-grid-homepage-with-right-sidebar.png",
    notes: "Fully styled grid homepage with social icons, post cards, and sidebar widgets."
  },
  {
    date: "2019-01-20",
    title: "Personal hero homepage",
    techStack: "WordPress 5.0.3, OceanWP theme, All in One SEO Pack",
    source: "https://web.archive.org/web/20190120054205if_/https://krynsky.com/",
    image: "/screenshots/20190120054205-personal-hero-homepage.png",
    notes: "Hero photo design introducing Mark Krynsky, with project/site tiles below."
  },
  {
    date: "2020-05-31",
    title: "OceanWP My Websites homepage",
    techStack: "WordPress/OceanWP inferred from source paths",
    source: "https://web.archive.org/web/20200531191853if_/https://krynsky.com/",
    image: "/screenshots/20200531191853-oceanwp-my-websites-homepage.png",
    notes: "Best 2020 replay: the hero image and My Websites project tiles render correctly."
  },
  {
    date: "2021-11-30",
    title: "Dark-header project-card homepage",
    techStack: "WordPress 5.8.2, Astra/Astra child theme, Jetpack, Site Kit by Google",
    source: "https://web.archive.org/web/20211130083954if_/https://krynsky.com/",
    image: "/screenshots/20211130083954-dark-header-project-card-homepage.png",
    notes: "Last good render of the dark header/project-card layout before later content and layout revisions."
  },
  {
    date: "2025-09-25",
    title: "Current-style projects and recent posts homepage",
    techStack: "WordPress 6.8.2, Astra theme, Astra Sites, Ultimate Addons for Gutenberg/Spectra, Site Kit by Google",
    source: "https://web.archive.org/web/20250925164329if_/https://krynsky.com/",
    image: "/screenshots/20250925164329-current-style-projects-and-recent-posts-homepage.png",
    notes: "Latest fully rendered capture in the archive index, with projects, recent posts, and featured articles."
  }
];
