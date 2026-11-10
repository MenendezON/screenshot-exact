import { Bell } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  describeNotification,
  markNotificationsRead,
  notificationsQuery,
  unreadCount,
} from "@/lib/contracts";
import { formatDate } from "@/lib/format";

export function NotificationBell({ inverted = false }: { inverted?: boolean }) {
  const queryClient = useQueryClient();
  const { data: rows = [], isError } = useQuery(notificationsQuery);
  const unread = unreadCount(rows);

  const markRead = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsQuery.queryKey }),
  });
  const unreadIds = rows.filter((n) => n.read_at === null).map((n) => n.id);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0
              ? `Notifications : ${unread} non lue${unread > 1 ? "s" : ""}`
              : "Notifications"
          }
          className={`relative rounded-md p-2 ${inverted ? "hover:bg-sidebar-accent" : "hover:bg-muted"}`}
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={unread === 0 || markRead.isPending}
            onClick={() => markRead.mutate(unreadIds)}
          >
            Tout marquer comme lu
          </Button>
        </div>
        {isError ? (
          <p className="px-4 py-6 text-sm text-destructive">
            Impossible de charger les notifications.
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Aucune notification.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {rows.map((n) => {
              const { title, detail } = describeNotification(n);
              const isUnread = n.read_at === null;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    disabled={!isUnread}
                    onClick={() => markRead.mutate([n.id])}
                    className="block w-full px-4 py-3 text-left text-sm enabled:hover:bg-muted"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {isUnread && (
                        <span className="size-2 shrink-0 bg-primary" aria-label="Non lue" />
                      )}
                      {title}
                    </span>
                    {detail && <span className="mt-0.5 block text-muted-foreground">{detail}</span>}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatDate(n.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
