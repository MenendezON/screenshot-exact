import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import {
  IDLE_NOTICE_KEY,
  LAST_ACTIVITY_KEY,
  idleMinutesFromSettings,
  idleStatus,
  parseLastActivity,
  secondsLeft,
} from "@/lib/idle";
import { settingsQuery } from "@/lib/settings";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const;

function readLast(now: number): number {
  try {
    return parseLastActivity(window.localStorage.getItem(LAST_ACTIVITY_KEY), now);
  } catch {
    return now;
  }
}

function writeLast(at: number) {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // stockage indisponible : le minuteur de cet onglet reste la référence
  }
}

/**
 * Déconnecte après inactivité, uniquement pour les rôles qui exigent la double authentification.
 * L'horodatage de dernière activité est partagé entre onglets (localStorage) : une activité dans
 * un onglet repousse l'échéance des autres. Un avertissement précède la déconnexion.
 */
export function IdleLogout() {
  const { mfaRequired, loading, signOut } = useAuth();
  const { data: settings } = useQuery(settingsQuery);
  const idleMs = idleMinutesFromSettings(settings) * 60_000;
  const enabled = !loading && mfaRequired;

  const [left, setLeft] = useState<number | null>(null);
  const lastWrite = useRef(0);
  const loggingOut = useRef(false);

  const touch = useCallback(() => {
    const now = Date.now();
    lastWrite.current = now;
    writeLast(now);
    setLeft(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    loggingOut.current = false;
    touch();

    const check = () => {
      if (loggingOut.current) return;
      const now = Date.now();
      const last = readLast(now);
      const status = idleStatus(now, last, idleMs);
      if (status === "expired") {
        loggingOut.current = true;
        try {
          window.sessionStorage.setItem(IDLE_NOTICE_KEY, "1");
        } catch {
          // sans importance : seul le message d'information est perdu
        }
        void signOut();
      } else if (status === "warning") {
        setLeft(secondsLeft(now, last, idleMs));
      } else {
        setLeft(null);
      }
    };

    const onActivity = () => {
      const now = Date.now();
      // Pendant l'avertissement, seul le bouton « Rester connecté » prolonge la session.
      if (idleStatus(now, readLast(now), idleMs) !== "active") return;
      if (now - lastWrite.current < 1000) return;
      lastWrite.current = now;
      writeLast(now);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true });
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, 1000);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [enabled, idleMs, signOut, touch]);

  if (!enabled) return null;

  return (
    <AlertDialog open={left !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Toujours là ?</AlertDialogTitle>
          <AlertDialogDescription>
            Sans activité de votre part, vous serez déconnecté dans {left ?? 0} seconde
            {(left ?? 0) > 1 ? "s" : ""} pour protéger les données du personnel.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void signOut()}>Me déconnecter</AlertDialogCancel>
          <AlertDialogAction onClick={touch}>Rester connecté</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
