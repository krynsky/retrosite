/**
 * Tech stack inference module.
 *
 * Exports:
 *   detectTechStack(html) — pure function, analyzes HTML string
 *   inferTechStack(page)  — async wrapper using a Playwright page
 */

/**
 * Extract the value of a meta[name] tag from raw HTML.
 * Returns null if not found.
 */
function extractMetaGenerator(html) {
  const match = html.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']generator["']/i);
  return match ? match[1] : null;
}

/**
 * Extract all src/href attribute values from an HTML string.
 */
function extractUrls(html) {
  const urls = [];
  const re = /(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

/**
 * Extract version string from a URL segment like `jquery-3.6.0.min.js`.
 * Returns null if no version found.
 */
function extractVersion(url, libName) {
  const re = new RegExp(`${libName}[._-]?(\\d+[\\d.]*(?:[._-]\\w+)?)`, "i");
  const match = url.match(re);
  return match ? match[1].replace(/[._-]min$/, "") : null;
}

function extractWordPressVersion(metaGenerator) {
  return metaGenerator?.match(/wordpress\s+([0-9]+(?:\.[0-9]+)*(?:[-.\w]*)?)/i)?.[1] ?? null;
}

function extractFrontPageLabel(metaGenerator) {
  const match = metaGenerator?.match(/(?:microsoft\s+)?frontpage\s+([0-9]+(?:\.[0-9]+)*)/i);
  if (match) {
    return `Microsoft FrontPage ${match[1]}`;
  }

  return metaGenerator && /frontpage/i.test(metaGenerator) ? "Microsoft FrontPage" : null;
}

const THEME_LABELS = new Map([
  ["astra", "Astra theme"],
  ["blocksy", "Blocksy theme"],
  ["cleaker", "Cleaker theme"],
  ["oceanwp", "OceanWP theme"],
  ["statement", "Statement theme"],
  ["twentytwentyfour", "Twenty Twenty-Four theme"]
]);

const PLUGIN_LABELS = new Map([
  ["af-extended-live-archive", "af-extended-live-archive plugin"],
  ["all-in-one-seo-pack", "All in One SEO Pack"],
  ["astra-addon", "Astra Pro"],
  ["astra-sites", "Astra Sites"],
  ["astra-widgets", "Astra Widgets"],
  ["blocksy-companion", "Blocksy Companion"],
  ["contact-form-7", "Contact Form 7"],
  ["digg-digg", "Digg Digg"],
  ["flickr-gallery", "Flickr Gallery"],
  ["jetpack", "Jetpack"],
  ["lastfm-records", "Last.fm Records"],
  ["lazy-k-gallery", "lazy-k-gallery plugin"],
  ["lifestream", "lifestream plugin"],
  ["mailpoet", "MailPoet"],
  ["myavatars", "MyAvatars"],
  ["sassy-social-share", "Sassy Social Share"],
  ["share-this", "ShareThis"],
  ["site-kit-by-google", "Site Kit by Google"],
  ["stimuli-lightbox2", "stimuli-lightbox2 plugin"],
  ["ultimate-addons-for-gutenberg", "Ultimate Addons for Gutenberg/Spectra"],
  ["utubevideo-gallery", "uTubeVideo Gallery"],
  ["wp-postrank", "WP-PostRank"]
]);

function humanizeSlug(slug) {
  return String(slug)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableThemeLabel(slug) {
  const normalized = String(slug).toLowerCase();
  if (THEME_LABELS.has(normalized)) {
    return THEME_LABELS.get(normalized);
  }

  return `${humanizeSlug(slug)} theme`;
}

function readablePluginLabel(slug) {
  const normalized = String(slug).toLowerCase();
  if (PLUGIN_LABELS.has(normalized)) {
    return PLUGIN_LABELS.get(normalized);
  }

  return `${humanizeSlug(slug)} plugin`;
}

function addUnique(items, label) {
  if (label && !items.includes(label)) {
    items.push(label);
  }
}

/**
 * Pure function: analyzes an HTML string and returns tech stack detection result.
 *
 * @param {string} html
 * @returns {{ techStack: string, techStackConfidence: "strong" | "weak" | "inferred" }}
 */
export function detectTechStack(html) {
  const primaryDetections = [];
  const supportingDetections = [];
  const legacyDetections = [];
  let highestTier = "inferred"; // inferred < weak < strong

  function setConfidence(confidence) {
    if (confidence === "strong") {
      highestTier = "strong";
    } else if (confidence === "weak" && highestTier !== "strong") {
      highestTier = "weak";
    }
  }

  function addPrimary(label, confidence) {
    addUnique(primaryDetections, label);
    setConfidence(confidence);
  }

  function addSupporting(label, confidence) {
    addUnique(supportingDetections, label);
    setConfidence(confidence);
  }

  function addLegacy(label) {
    addUnique(legacyDetections, label);
    setConfidence("weak");
  }

  const metaGenerator = extractMetaGenerator(html);
  const urls = extractUrls(html);
  const hrefLinks = [];
  const hrefRe = /href=["']([^"']+)["']/gi;
  let hrefMatch;
  while ((hrefMatch = hrefRe.exec(html)) !== null) {
    hrefLinks.push(hrefMatch[1]);
  }

  // --- WordPress ---
  let isWordPress = false;
  if (metaGenerator && /wordpress/i.test(metaGenerator)) {
    isWordPress = true;
  }
  if (!isWordPress && /\/wp-content\/|\/wp-includes\//i.test(html)) {
    isWordPress = true;
  }

  if (isWordPress) {
    const version = extractWordPressVersion(metaGenerator);
    const parts = [version ? `WordPress ${version}` : "WordPress"];

    // Extract theme name
    const themeMatch = html.match(/\/wp-content\/themes\/([^/"'?#]+)\//i);
    if (themeMatch) {
      parts.push(readableThemeLabel(themeMatch[1]));
    }

    // Extract plugin names (collect unique)
    const pluginNames = new Set();
    const pluginRe = /\/wp-content\/plugins\/([^/"'?#]+)\//gi;
    let pluginMatch;
    while ((pluginMatch = pluginRe.exec(html)) !== null) {
      pluginNames.add(pluginMatch[1]);
    }
    for (const name of pluginNames) {
      parts.push(readablePluginLabel(name));
    }

    addPrimary(parts.join(", "), "strong");
  }

  // --- FrontPage ---
  const frontPageLabel = extractFrontPageLabel(metaGenerator);
  if (frontPageLabel) {
    addPrimary(frontPageLabel, "strong");
  } else if (/\/_vti_bin\//i.test(html)) {
    addPrimary("Microsoft FrontPage", "strong");
  }

  // --- Squarespace ---
  if (/static\.squarespace\.com/i.test(html)) {
    addPrimary("Squarespace", "strong");
  }

  // --- Wix ---
  if (/static\.wixstatic\.com|wix\.com/i.test(html)) {
    addPrimary("Wix", "strong");
  }

  // --- Webflow ---
  if (/assets\.website-files\.com|webflow/i.test(html)) {
    addPrimary("Webflow", "strong");
  }

  // --- jQuery ---
  const jqueryUrl = urls.find((url) => /jquery/i.test(url) && /\.js/i.test(url));
  if (jqueryUrl) {
    const version = extractVersion(jqueryUrl, "jquery");
    addSupporting(version ? `jQuery ${version}` : "jQuery", "weak");
  }

  // --- Bootstrap ---
  const bootstrapUrl = urls.find((url) => /bootstrap/i.test(url) && /\.(css|js)/i.test(url));
  if (bootstrapUrl) {
    const version = extractVersion(bootstrapUrl, "bootstrap");
    addSupporting(version ? `Bootstrap ${version}` : "Bootstrap", "weak");
  }

  // --- Classic ASP ---
  const aspLinks = hrefLinks.filter((href) => /\.asp(\?|#|$)/i.test(href) || href.endsWith(".asp"));
  if (aspLinks.length >= 2) {
    if (primaryDetections.length > 0) {
      addLegacy("legacy ASP links");
    } else {
      addPrimary("Classic ASP", "strong");
    }
  }

  const detections = [...primaryDetections, ...supportingDetections, ...legacyDetections];

  // --- Static HTML fallback ---
  if (detections.length === 0) {
    return { techStack: "Static HTML", techStackConfidence: "inferred" };
  }

  return {
    techStack: detections.join(" · "),
    techStackConfidence: highestTier
  };
}

/**
 * Async wrapper: calls page.content() on a Playwright page,
 * then passes the HTML to detectTechStack.
 *
 * @param {import('playwright-core').Page} page
 * @returns {Promise<{ techStack: string, techStackConfidence: "strong" | "weak" | "inferred" }>}
 */
export async function inferTechStack(page) {
  const html = await page.content();
  return detectTechStack(html);
}
