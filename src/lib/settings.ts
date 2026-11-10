import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

async function fetchSettings() {
  const { data, error } = await supabase
    .from("settings")
    .select("id, key, label, description, value, unit, sort_order, updated_at, updated_by")
    .is("archived_at", null)
    .order("sort_order");
  if (error) throw error;
  return data;
}

export type Setting = Awaited<ReturnType<typeof fetchSettings>>[number];

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: fetchSettings,
});

export const SETTING_BOUNDS: Record<string, { min: number; max: number }> = {
  ans: { min: 40, max: 75 },
  mois: { min: 1, max: 120 },
  jours: { min: 1, max: 365 },
  minutes: { min: 5, max: 480 },
};
