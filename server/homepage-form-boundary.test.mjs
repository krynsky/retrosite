import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("demo home page entry does not include local-only depth controls", async () => {
  const homePage = await readFile("src/components/HomePage.tsx", "utf8");
  const localForm = await readFile("src/components/LocalTimelineForm.tsx", "utf8");

  assert.match(homePage, /lazy\(/);
  assert.match(homePage, /LocalTimelineForm/);
  assert.doesNotMatch(homePage, /DepthMode/);
  assert.doesNotMatch(homePage, /depth-field/);
  assert.doesNotMatch(homePage, /Timeline depth/);

  assert.match(localForm, /DepthMode/);
  assert.match(localForm, /depth-field/);
  assert.match(localForm, /Timeline depth/);
});

test("unselected rendered admin entries are labeled as candidates", async () => {
  const adminControls = await readFile("src/components/AdminControls.tsx", "utf8");

  assert.match(adminControls, /included \? "Included" : "Candidate"/);
  assert.doesNotMatch(adminControls, /included \? "Included" : "Excluded"/);
});

test("report reruns return to the homepage settings flow", async () => {
  const reportPage = await readFile("src/components/ReportPage.tsx", "utf8");
  const localForm = await readFile("src/components/LocalTimelineForm.tsx", "utf8");

  assert.match(reportPage, /New version/);
  assert.match(reportPage, /target=/);
  assert.doesNotMatch(reportPage, /\/rerun/);
  assert.match(localForm, /URLSearchParams\(window\.location\.search\)\.get\("target"\)/);
});
