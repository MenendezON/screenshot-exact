import { supabase } from "@/integrations/supabase/client";

/**
 * Vrai si l'utilisateur a un rôle qui exige l'authentification à deux facteurs et que la session
 * n'est pas encore passée au niveau « aal2 ». Cette garde ne sert qu'à guider l'utilisateur :
 * la base de données applique elle-même la règle (`mfa_ok()`). En cas d'erreur de lecture, on ne
 * bloque pas (l'accès aux données restera refusé par la base).
 */
export async function needsMfaStep(): Promise<boolean> {
  try {
    const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !aal) return false;
    if (aal.currentLevel === "aal2") return false;
    const { data: required, error: rpcError } = await supabase.rpc("my_mfa_required");
    if (rpcError) return false;
    return required === true;
  } catch {
    return false;
  }
}

export const MFA_CODE_PATTERN = /^\d{6}$/;

export function mfaCodeError(code: string): string | null {
  const trimmed = code.replace(/\s/g, "");
  if (trimmed === "") return "Saisissez le code à 6 chiffres.";
  if (!MFA_CODE_PATTERN.test(trimmed)) return "Le code comporte exactement 6 chiffres.";
  return null;
}
