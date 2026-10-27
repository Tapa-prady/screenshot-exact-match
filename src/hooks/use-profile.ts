import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AccountType = "student" | "driver";

/** The signed-in member's own role. `accountType` is null until known (or if the column is missing). */
export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("verified, account_type")
        .eq("id", userId as string)
        .maybeSingle();
      if (error || !data) return { verified: false, accountType: null as AccountType | null };
      return {
        verified: data.verified,
        accountType: (data.account_type === "driver" ? "driver" : "student") as AccountType,
      };
    },
  });
}
