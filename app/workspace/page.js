import { redirect } from "next/navigation";

import PersonalWorkspace from "../components/personal-workspace.js";
import { createServerSupabaseClient } from "../../lib/supabase/server.js";
import { createServiceClient } from "../../lib/supabase/service.js";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;

  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const { data: curator, error } = await serviceClient
    .from("ar_radar_curators")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;

  return <PersonalWorkspace curatorRole={curator?.role ?? null} user={user} />;
}
