import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkAndNotifyWeatherAlerts } from "./weather-alerts.server";

export const refreshWeatherAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const alerts = await checkAndNotifyWeatherAlerts(context.supabase, context.userId);
      return { ok: true as const, alerts };
    } catch {
      return { ok: false as const, alerts: [] };
    }
  });
