import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  professional: "Profesional",
  secretary: "Secretaría",
  administrator: "Administración",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const params = await searchParams;
  if (params.code) {
    redirect(`/actualizar-clave?code=${encodeURIComponent(params.code)}`);
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role, active")
    .eq("id", userId)
    .single();

  if (
    profileError ||
    !profile ||
    !profile.active ||
    !["professional", "secretary", "administrator"].includes(profile.role)
  ) {
    redirect("/login?error=access");
  }

  return (
    <DashboardClient
      profileName={profile.full_name || "Personal autorizado"}
      profileRole={profile.role}
      roleLabel={roleLabels[profile.role] || "Personal autorizado"}
    />
  );
}
