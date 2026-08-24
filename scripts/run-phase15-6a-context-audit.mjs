import { mkdir, writeFile } from "node:fs/promises";
import { fetchSourceFullContext } from "../lib/sources/source-full-context-fetch.mjs";

const SOURCES = [
  ["a6841585-fab9-4562-8224-db7d31511dd2", "https://blog.naver.com/chlovely__/224378532198"],
  ["988b812c-0a45-4b82-9b92-095e67bffaf4", "https://blog.naver.com/chlovely__/224378549612"],
  ["8d36f7e3-4181-4356-946e-38a0294783dd", "https://blog.naver.com/jwparkbgy/224385180054"],
  ["408ade70-6242-43ca-8478-aab9e8c19b06", "https://blog.naver.com/enhewvyk/224383577255"],
  ["4654fbca-95e6-426b-8ebf-6807db69c3fa", "https://blog.naver.com/eund0924/224383694485"],
  ["bb353d4f-8e53-4733-830a-7367a268484e", "https://blog.naver.com/dhoon508/224350795552"],
  ["f3fe48d8-35fc-4a5b-843e-0c247301546a", "https://blog.naver.com/parang1777/224384634612"],
  ["da59976e-8d5b-40d3-98cb-07d069a6ce58", "https://blog.naver.com/goodkmj1228/224381851971"],
  ["0a0f394e-e2d7-45c6-a701-68e418aeb278", "https://blog.naver.com/sing_ry/224369088080"],
  ["5e4d7f0a-ddad-46ea-a0d0-5f1d338c1296", "https://blog.naver.com/beadols/224354863703"],
  ["f9ff3e18-954f-40a8-8c7e-ef58cbcdff96", "https://blog.naver.com/hin1530/224299332233"],
  ["137ffbf8-bf00-4221-9752-6e5131ada34b", "https://blog.naver.com/furnsolai/224385240595"],
  ["c2507345-08a1-4dc8-bd93-9dc16a87724f", "https://blog.naver.com/daun4125/224383282326"],
  ["cd5938ce-0795-4579-a1e0-3ccd84353abf", "https://blog.naver.com/csj00917/224339264315"],
  ["defa940f-b51c-4e8c-a134-f9522ee810be", "https://blog.naver.com/tpoyns/224383414011"],
  ["f96d57a4-6986-4294-9185-98474fe1a788", "https://blog.naver.com/majljk/224384659102"],
  ["b12f82f8-04fb-458e-a8e6-db5728121ae2", "https://blog.naver.com/thedaysofdoree/224333944655"],
];

const results = [];
for (const [id, canonical_url] of SOURCES) {
  const full = await fetchSourceFullContext({ id, source_platform: "naver_blog", canonical_url });
  results.push({ id, canonical_url, ...full });
  console.log(JSON.stringify({ id, status: full.status, chars: full.original_char_count, error_code: full.error_code }));
}

await mkdir(".artifacts", { recursive: true });
await writeFile(".artifacts/phase15-6a-context.json", JSON.stringify({ generated_at: new Date().toISOString(), count: results.length, results }, null, 2));

const failures = results.filter((row) => row.status !== "resolved");
if (failures.length) {
  console.error(`PHASE15_6A_FETCH_FAILURES=${failures.length}`);
  process.exitCode = 1;
} else {
  console.log(`PHASE15_6A_FETCH_SUCCESS=${results.length}`);
}
