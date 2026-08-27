import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const TARGET_TITLE = "숙소 예약 플랫폼의 예약 확정이 실제 숙소 예약·이행으로 이어지지 않을 수 있다";
const baseUrl = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3109");
const outputArg = process.argv.find((item) => item.startsWith("--output="));
const outputPath = outputArg?.slice("--output=".length) || "phase15-9a-public-surface-smoke.json";

const playwright = await import("playwright");
const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(baseUrl.href, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "사람들이 요즘, 무엇을 불편해하고 있을까요?" }).waitFor();

  const targetCard = page.getByRole("link", { name: new RegExp(TARGET_TITLE) });
  await targetCard.waitFor({ state: "visible" });
  assert.match(await targetCard.innerText(), /2건의 공개 근거/);
  assert.match(await targetCard.innerText(), /여행/);
  assert.doesNotMatch(await targetCard.innerText(), /travel_booking/);

  await page.getByRole("link", { name: "여행", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("category") === "여행");
  const filteredTarget = page.getByRole("link", { name: new RegExp(TARGET_TITLE) });
  await filteredTarget.waitFor({ state: "visible" });

  const detailHref = await filteredTarget.getAttribute("href");
  assert.match(detailHref ?? "", /^\/radar\/problems\//);
  await page.goto(new URL(detailHref, baseUrl).href, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: TARGET_TITLE, exact: true }).waitFor();
  await page.getByText("2건의 공개 근거에서 확인", { exact: true }).waitFor();
  assert.equal(await page.locator("figure.radar-evidence-card").count(), 2);

  const sourceLinks = page.getByRole("link", { name: "원문 보기 ↗", exact: true });
  assert.equal(await sourceLinks.count(), 2);
  for (let index = 0; index < 2; index += 1) {
    const href = await sourceLinks.nth(index).getAttribute("href");
    assert.ok(href && /^https?:\/\//.test(href), "Public Evidence source link must be HTTP(S)");
  }

  await page.getByRole("link", { name: "여행 문제 더 보기", exact: true }).waitFor();
  const body = await page.locator("body").innerText();
  for (const internal of ["travel_booking", "source_key", "source_signal_id", "incident_id", "lodging_reservation_fulfillment_gap"]) {
    assert.equal(body.includes(internal), false, `public UI must not expose ${internal}`);
  }
  assert.deepEqual(pageErrors, []);

  const artifact = {
    phase: "15.9A",
    surface: "local_render_against_hosted_public_projection",
    explore_target_visible: true,
    evidence_count_visible: 2,
    travel_chip_target_visible: true,
    detail_target_visible: true,
    detail_evidence_cards: 2,
    source_links_present: 2,
    internal_category_hidden: true,
    internal_lineage_hidden: true,
    browser_page_errors: 0,
    database_writes: 0,
  };
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "PUBLIC_RADAR_POST_PUBLICATION_SMOKE_PASS", ...artifact }, null, 2));
} finally {
  await browser.close();
}
