import { useEffect, useState } from "react";
import { Bell, Check, CloudRain, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { refreshWeatherAlerts } from "@/lib/weather-alerts.functions";

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export function NotificationsPopover({ userId }: { userId: string }) {
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const refreshWeather = useServerFn(refreshWeatherAlerts);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, title, body, read, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) {
        setNotifications(data);
      }
    };

    void fetchNotifications();
    // Trigger automatic weather alert check in background
    void refreshWeather()
      .then(() => fetchNotifications())
      .catch(() => undefined);

    // Listen to realtime notifications
    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchNotifications();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshWeather]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = async () => {
    if (notifications.length === 0) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="relative size-9 rounded-xl text-muted-foreground hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="size-4" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 rounded-xl text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-cta text-[11px] font-bold text-cta-foreground shadow-sm animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => void markAllAsRead()}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Check className="size-3" />
              Tout marquer comme lu
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto divide-y">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Aucune notification pour le moment.
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className={`p-3 text-xs transition-colors ${item.read ? "bg-card opacity-80" : "bg-primary/5 font-medium"}`}
              >
                <div className="flex items-start gap-2">
                  {item.kind === "weather_rain" ? (
                    <CloudRain className="size-4 text-blue-500 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold text-foreground">{item.title}</p>
                    <p className="text-muted-foreground leading-relaxed">{item.body}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
