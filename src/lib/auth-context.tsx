import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/roles";
import type { CurrentUser } from "@/lib/roles";

export type AssuranceLevel = "aal1" | "aal2" | null;

export type AuthContextValue = {
  /** Vrai tant que la session ou le rôle n'ont pas fini de se charger. */
  loading: boolean;
  session: Session | null;
  user: CurrentUser | null;
  /** Niveau d'assurance de la session : aal2 = deuxième facteur validé. */
  aal: AssuranceLevel;
  /** Le rôle de l'utilisateur impose la double authentification. */
  mfaRequired: boolean;
  /** Session complète : pas de deuxième facteur exigé, ou déjà validé. */
  mfaSatisfied: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Déconnexion complète : vide le cache (données RH), ferme la session, retourne à l'accueil. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }, [queryClient, navigate]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const { data: user, isLoading: userLoading } = useCurrentUser();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Pas d'appel Supabase ici (risque d'interblocage) : on ne fait que mettre l'état à jour.
      setSession(next);
      setSessionReady(true);
      if (event === "SIGNED_OUT" || event === "MFA_CHALLENGE_VERIFIED") {
        // Le niveau d'accès a changé : tout ce qui a été lu avec l'ancien niveau est périmé.
        setTimeout(() => queryClient.invalidateQueries(), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user.id ?? null;
  const assurance = useQuery({
    queryKey: ["auth-assurance", userId, session?.access_token ?? null],
    enabled: userId !== null,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: aal }, { data: required }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.rpc("my_mfa_required"),
      ]);
      return {
        aal: (aal?.currentLevel ?? null) as AssuranceLevel,
        mfaRequired: required === true,
      };
    },
  });

  const value = useMemo<AuthContextValue>(() => {
    const aal = assurance.data?.aal ?? null;
    const mfaRequired = assurance.data?.mfaRequired ?? false;
    return {
      loading: !sessionReady || (userId !== null && (userLoading || assurance.isLoading)),
      session,
      user: user ?? null,
      aal,
      mfaRequired,
      mfaSatisfied: !mfaRequired || aal === "aal2",
      signOut,
    };
  }, [
    sessionReady,
    userId,
    userLoading,
    assurance.isLoading,
    assurance.data,
    session,
    user,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un <AuthProvider>.");
  return ctx;
}
