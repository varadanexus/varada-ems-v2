import { createClient } from "@/lib/supabase/server";

export async function requireUser(): Promise<
  { id: string; email?: string } | null
> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { id: "local-development", email: "local@varadanexus.com" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email } : null;
}
