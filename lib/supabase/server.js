import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getServerClientEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase server client environment variables: "
      + "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "
      + "(or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }

  return { supabaseUrl, supabaseKey };
}

function createRuntimeSmokeAnonymousClient() {
  return {
    auth: {
      async getUser() {
        return { data: { user: null }, error: null };
      },
    },
  };
}

export async function createServerSupabaseClient() {
  if (process.env.AR_RUNTIME_SMOKE === "1") {
    return createRuntimeSmokeAnonymousClient();
  }

  const { supabaseUrl, supabaseKey } = getServerClientEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Route handlers can write cookies; server components cannot.
        }
      },
    },
  });
}

export const createClient = createServerSupabaseClient;
