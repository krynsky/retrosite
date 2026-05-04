import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectTechStack } from "./techstack.mjs";

describe("detectTechStack", () => {
  it("detects WordPress from meta generator tag with strong confidence", () => {
    const html = `<html><head><meta name="generator" content="WordPress 6.4.2"></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("WordPress"), `Expected WordPress in techStack, got: ${result.techStack}`);
    assert.ok(result.techStack.includes("WordPress 6.4.2"), `Expected WordPress version in techStack, got: ${result.techStack}`);
    assert.equal(result.techStackConfidence, "strong");
  });

  it("detects WordPress theme from wp-content path", () => {
    const html = `<html><head><link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css"></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("WordPress"), `Expected WordPress in techStack, got: ${result.techStack}`);
    assert.equal(result.techStackConfidence, "strong");
  });

  it("detects WordPress plugin from wp-content path", () => {
    const html = `<html><head></head><body><script src="/wp-content/plugins/contact-form-7/script.js"></script></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("WordPress"), `Expected WordPress in techStack, got: ${result.techStack}`);
    assert.equal(result.techStackConfidence, "strong");
  });

  it("detects jQuery from script src", () => {
    const html = `<html><head></head><body><script src="/js/jquery-3.6.0.min.js"></script></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("jQuery"), `Expected jQuery in techStack, got: ${result.techStack}`);
  });

  it("detects Bootstrap from stylesheet", () => {
    const html = `<html><head><link rel="stylesheet" href="/css/bootstrap-5.3.0.min.css"></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Bootstrap"), `Expected Bootstrap in techStack, got: ${result.techStack}`);
  });

  it("detects FrontPage from meta generator tag with strong confidence", () => {
    const html = `<html><head><meta name="generator" content="Microsoft FrontPage 5.0"></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Microsoft FrontPage 5.0"), `Expected FrontPage version in techStack, got: ${result.techStack}`);
    assert.equal(result.techStackConfidence, "strong");
  });

  it("formats WordPress themes and plugins as readable labels", () => {
    const html = `<html><head>
      <meta name="generator" content="WordPress 5.0.3">
      <link rel="stylesheet" href="/wp-content/themes/oceanwp/style.css">
      <script src="/wp-content/plugins/all-in-one-seo-pack/app.js"></script>
      <script src="/wp-content/plugins/ultimate-addons-for-gutenberg/blocks.js"></script>
    </head><body></body></html>`;
    const result = detectTechStack(html);
    assert.equal(
      result.techStack,
      "WordPress 5.0.3, OceanWP theme, All in One SEO Pack, Ultimate Addons for Gutenberg/Spectra"
    );
    assert.equal(result.techStackConfidence, "strong");
  });

  it("marks asp links as legacy when a stronger platform is present", () => {
    const html = `<html><head>
      <meta name="generator" content="WordPress 2.6.2">
      <link rel="stylesheet" href="/wp-content/themes/Cleaker/style.css">
    </head><body><a href="/archive.asp">Archive</a><a href="/about.asp">About</a></body></html>`;
    const result = detectTechStack(html);
    assert.equal(result.techStack, "WordPress 2.6.2, Cleaker theme · legacy ASP links");
  });

  it("detects Classic ASP from multiple .asp links", () => {
    const html = `<html><body><a href="/page1.asp">Page 1</a><a href="/page2.asp">Page 2</a></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Classic ASP"), `Expected Classic ASP in techStack, got: ${result.techStack}`);
  });

  it("does not detect Classic ASP from only one .asp link", () => {
    const html = `<html><body><a href="/page1.asp">Page 1</a></body></html>`;
    const result = detectTechStack(html);
    assert.ok(!result.techStack.includes("Classic ASP"), `Expected no Classic ASP with only 1 link, got: ${result.techStack}`);
  });

  it("detects Squarespace from static.squarespace.com", () => {
    const html = `<html><head><script src="https://static.squarespace.com/static/main.js"></script></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Squarespace"), `Expected Squarespace in techStack, got: ${result.techStack}`);
    assert.equal(result.techStackConfidence, "strong");
  });

  it("detects Wix from static.wixstatic.com", () => {
    const html = `<html><head><script src="https://static.wixstatic.com/services/main.js"></script></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Wix"), `Expected Wix in techStack, got: ${result.techStack}`);
    assert.equal(result.techStackConfidence, "strong");
  });

  it("detects Webflow from assets.website-files.com", () => {
    const html = `<html><head><script src="https://assets.website-files.com/abc123/main.js"></script></head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("Webflow"), `Expected Webflow in techStack, got: ${result.techStack}`);
    assert.equal(result.techStackConfidence, "strong");
  });

  it("falls back to Static HTML with inferred confidence when nothing matches", () => {
    const html = `<html><head><title>My Page</title></head><body><p>Hello world</p></body></html>`;
    const result = detectTechStack(html);
    assert.equal(result.techStack, "Static HTML");
    assert.equal(result.techStackConfidence, "inferred");
  });

  it("combines multiple detections with a middle dot separator", () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/wp-content/themes/mytheme/style.css">
      <script src="/js/jquery-3.6.0.min.js"></script>
    </head><body></body></html>`;
    const result = detectTechStack(html);
    assert.ok(result.techStack.includes("WordPress"), `Expected WordPress in combined, got: ${result.techStack}`);
    assert.ok(result.techStack.includes("jQuery"), `Expected jQuery in combined, got: ${result.techStack}`);
    assert.ok(result.techStack.includes(" · "), `Expected · separator in combined, got: ${result.techStack}`);
  });
});
