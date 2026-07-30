import { createClient } from "@supabase/supabase-js";
import { sanitizeUntrustedText } from "@/utils/untrusted-text";

const moduleSources: Record<string, Array<{ table: string; fields: string }>> = {
  transportation: [
    { table: "transport_trips", fields: "trip_number,status,origin,destination,created_at" },
    { table: "transport_commodities", fields: "name,description,created_at" },
  ],
  interiors: [
    { table: "interiors_projects", fields: "project_code,project_name,status,created_at" },
    { table: "interiors_site_updates", fields: "title,summary,progress_percent,created_at" },
  ],
  "digital-services": [
    { table: "ds_projects", fields: "code,title,status,service_type,created_at" },
    { table: "ds_leads", fields: "company_name,service_interest,status,created_at" },
  ],
  meetings: [
    { table: "meetings", fields: "title,description,status,scheduled_at" },
  ],
  support: [
    { table: "support_tickets", fields: "subject,category,status,priority,created_at" },
  ],
  legal: [
    { table: "legal_agreements", fields: "title,agreement_type,status,created_at" },
  ],
};

export async function collectEmsContext(modules: string[]): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !modules.length) return "";

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sources = modules.flatMap((module) => moduleSources[module] || []).slice(0, 8);
  const results = await Promise.all(
    sources.map(async ({ table, fields }) => {
      const { data, error } = await supabase
        .from(table)
        .select(fields)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return null;
      return { table, records: data || [] };
    }),
  );

  return sanitizeUntrustedText(
    JSON.stringify(results.filter(Boolean)),
    10000,
  );
}
