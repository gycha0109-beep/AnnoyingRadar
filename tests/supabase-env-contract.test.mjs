import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [server, browser, service, envExample] = await Promise.all([
  read("lib/supabase/server.js"),
  read("lib/supabase/browser.js"),
  read("lib/supabase/service.js"),
  read(".env.local.example"),
]);

test("browser and SSR auth clients use publishable key with legacy anon fallback", () => {
  for (const source of [server, browser]) {
    assert.match(source, /NEXT_PUBLIC_SUPABASE_URL/);
    assert.match(source, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    assert.match(source, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.ok(
      source.indexOf("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        < source.indexOf("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    );
    assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  }
});

test("browser and SSR clients use the Supabase SSR package", () => {
  assert.match(browser, /createBrowserClient/);
  assert.match(server, /createServerClient/);
});

test("service client prefers secret key and retains legacy service-role fallback", () => {
  assert.match(service, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(service, /SUPABASE_SECRET_KEY/);
  assert.match(service, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.ok(service.indexOf("SUPABASE_SECRET_KEY") < service.indexOf("SUPABASE_SERVICE_ROLE_KEY"));
  assert.doesNotMatch(
    service,
    /NEXT_PUBLIC_SUPABASE_SECRET_KEY|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.match(service, /persistSession:\s*false/);
  assert.match(service, /autoRefreshToken:\s*false/);
  assert.match(service, /detectSessionInUrl:\s*false/);
});

test("example env advertises current Supabase key names first", () => {
  assert.match(envExample, /^NEXT_PUBLIC_SUPABASE_URL=/m);
  assert.match(envExample, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/m);
  assert.match(envExample, /^SUPABASE_SECRET_KEY=/m);
  assert.match(envExample, /^# NEXT_PUBLIC_SUPABASE_ANON_KEY=/m);
  assert.match(envExample, /^# SUPABASE_SERVICE_ROLE_KEY=/m);
});
