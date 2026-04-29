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

/**
 * Pure function: analyzes an HTML string and returns tech stack detection result.
 *
 * @param {string} html
 * @returns {{ techStack: string, techStackConfidence: "strong" | "weak" | "inferred" }}
 */
export function detectTechStack(html) {
  const detections = [];
  let highestTier = "inferred"; // inferred < weak < strong

  function addDetection(label, confidence) {
    detections.push(label);
    if (confidence === "strong") {
      highestTier = "strong";
    } else if (confidence === "weak" && highestTier !== "strong") {
      highestTier = "weak";
    }
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
    const parts = ["WordPress"];

    // Extract theme name
    const themeMatch = html.match(/\/wp-content\/themes\/([^/"'?#]+)\//i);
    if (themeMatch) {
      parts.push(`theme: ${themeMatch[1]}`);
    }

    // Extract plugin names (collect unique)
    const pluginNames = new Set();
    const pluginRe = /\/wp-content\/plugins\/([^/"'?#]+)\//gi;
    let pluginMatch;
    while ((pluginMatch = pluginRe.exec(html)) !== null) {
      pluginNames.add(pluginMatch[1]);
    }
    for (const name of pluginNames) {
      parts.push(`plugin: ${name}`);
    }

    addDetection(parts.join(", "), "strong");
  }

  // --- FrontPage ---
  if (metaGenerator && /frontpage/i.test(metaGenerator)) {
    addDetection("FrontPage", "strong");
  } else if (/\/_vti_bin\//i.test(html)) {
    addDetection("FrontPage", "strong");
  }

  // --- Squarespace ---
  if (/static\.squarespace\.com/i.test(html)) {
    addDetection("Squarespace", "strong");
  }

  // --- Wix ---
  if (/static\.wixstatic\.com|wix\.com/i.test(html)) {
    addDetection("Wix", "strong");
  }

  // --- Webflow ---
  if (/assets\.website-files\.com|webflow/i.test(html)) {
    addDetection("Webflow", "strong");
  }

  // --- jQuery ---
  const jqueryUrl = urls.find((url) => /jquery/i.test(url) && /\.js/i.test(url));
  if (jqueryUrl) {
    const version = extractVersion(jqueryUrl, "jquery");
    addDetection(version ? `jQuery ${version}` : "jQuery", "weak");
  }

  // --- Bootstrap ---
  const bootstrapUrl = urls.find((url) => /bootstrap/i.test(url) && /\.(css|js)/i.test(url));
  if (bootstrapUrl) {
    const version = extractVersion(bootstrapUrl, "bootstrap");
    addDetection(version ? `Bootstrap ${version}` : "Bootstrap", "weak");
  }

  // --- Classic ASP ---
  const aspLinks = hrefLinks.filter((href) => /\.asp(\?|#|$)/i.test(href) || href.endsWith(".asp"));
  if (aspLinks.length >= 2) {
    addDetection("Classic ASP", "strong");
  }

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
