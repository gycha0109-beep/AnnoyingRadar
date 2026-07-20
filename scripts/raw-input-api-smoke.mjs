const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
const cookieHeader = process.env.SUPABASE_AUTH_COOKIE;

if (!cookieHeader) {
  console.error("Missing SUPABASE_AUTH_COOKIE. Provide the full Cookie header value.");
  process.exit(1);
}

async function requestJson(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

function assertOk(label, result) {
  console.log(`${label}: ${result.status}`);

  if (!result.ok) {
    console.error(JSON.stringify(result.body, null, 2));
    process.exit(1);
  }
}

const rawText = `Annoying Radar smoke test ${new Date().toISOString()}`;

const createResult = await requestJson("/api/raw-inputs", {
  method: "POST",
  body: JSON.stringify({
    raw_text: rawText,
    source_type: "smoke_test",
    source_memo: "Raw Input API smoke test",
    language: "ko",
  }),
});
assertOk("POST /api/raw-inputs", createResult);

const rawInputId = createResult.body?.raw_input_id;
if (!rawInputId) {
  console.error("POST response did not include raw_input_id");
  process.exit(1);
}

const getResult = await requestJson(`/api/raw-inputs/${rawInputId}`);
assertOk("GET /api/raw-inputs/[rawInputId]", getResult);

const patchResult = await requestJson(`/api/raw-inputs/${rawInputId}`, {
  method: "PATCH",
  body: JSON.stringify({
    source_memo: "Raw Input API smoke test patched",
  }),
});
assertOk("PATCH /api/raw-inputs/[rawInputId]", patchResult);

const recentResult = await requestJson("/api/raw-inputs/recent");
assertOk("GET /api/raw-inputs/recent", recentResult);

console.log(
  JSON.stringify(
    {
      raw_input_id: rawInputId,
      create_status: createResult.body?.analysis_status,
      recent_count: recentResult.body?.raw_inputs?.length ?? 0,
    },
    null,
    2,
  ),
);
