import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getServiceClientEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing Supabase service client environment variables: "
      + "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY "
      + "(or legacy SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  return { supabaseUrl, serviceKey };
}

export function createServiceClient() {
  const { supabaseUrl, serviceKey } = getServiceClientEnv();

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export const createClient = createServiceClient;
