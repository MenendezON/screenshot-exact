import type { EmployeeRecord, EmployeeRow, MetricsRow } from "@/lib/employees";
import type { Action, Resource } from "@/lib/permissions";

export type FicheContext = {
  id: string;
  record: EmployeeRecord;
  current: EmployeeRow | null;
  metrics: MetricsRow | null;
  /** Droits du rôle (la base applique en plus le périmètre : site, unité, équipe). */
  can: (resource: Resource, action: Action) => boolean;
  userId: string | null;
};
