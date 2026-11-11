import { z } from "zod";

import { optionalUuid, REQUIRED } from "@/lib/employee-schemas";
import type { Database } from "@/integrations/supabase/types";

export type ReviewRecord = Database["public"]["Tables"]["employee_reviews"]["Row"];

export const REVIEW_KINDS = ["contract", "performance", "other"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = {
  contract: "Appréciation de contrat",
  performance: "Évaluation de performance",
  other: "Autre",
};

export const RATING_LABELS: Record<number, string> = {
  1: "Insuffisant",
  2: "À améliorer",
  3: "Satisfaisant",
  4: "Très bien",
  5: "Excellent",
};

export const reviewSchema = z.object({
  kind: z.string().refine((v) => (REVIEW_KINDS as readonly string[]).includes(v), REQUIRED),
  reviewDate: z
    .string()
    .min(1, REQUIRED)
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Date non valide."),
  rating: z.string().refine((v) => v === "" || /^[1-5]$/.test(v), "La note va de 1 à 5."),
  title: z.string().trim().max(150, "Le titre : 150 caractères au plus."),
  comment: z
    .string()
    .trim()
    .min(1, REQUIRED)
    .max(4000, "Le commentaire : 4 000 caractères au plus."),
  contractId: optionalUuid,
});
export type ReviewForm = z.infer<typeof reviewSchema>;

export function toReviewPayload(v: ReviewForm) {
  return {
    kind: v.kind as ReviewKind,
    review_date: v.reviewDate,
    rating: v.rating === "" ? null : Number(v.rating),
    title: v.title.trim() === "" ? null : v.title.trim(),
    comment: v.comment.trim(),
    contract_id: v.contractId === "" ? null : v.contractId,
  };
}
