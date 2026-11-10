import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { FormRow, SelectInput } from "@/components/employees/common";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createApiClient,
  listApiCalls,
  listApiClients,
  revokeApiClient,
} from "@/lib/api-keys.functions";
import { API_LEVELS, clientStatus, LEVEL_INFO, type ApiLevel } from "@/lib/api/keys";
import { formatDateTime } from "@/lib/format";
import { logError, userMessage } from "@/lib/log";
import { sitesQuery } from "@/lib/referentials";
import { useCurrentUser } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/api-cles")({
  head: () => ({
    meta: [{ title: "API et clés — Fabrimétal Personnel" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});

const STATUS_LABEL = { active: "Active", expired: "Expirée", revoked: "Révoquée" } as const;

function Page() {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <LoadingState />;
  if (user?.role !== "admin_it")
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
        <h1 className="text-xl font-bold">Accès réservé</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          La gestion de l'API est réservée à l'administrateur IT.
        </p>
      </div>
    );
  return <ApiAdmin />;
}

function ApiAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listApiClients);
  const calls = useServerFn(listApiCalls);
  const revoke = useServerFn(revokeApiClient);
  const clients = useQuery({ queryKey: ["api", "clients"], queryFn: () => list() });
  const log = useQuery({ queryKey: ["api", "calls"], queryFn: () => calls({ data: {} }) });
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<{ name: string; key: string } | null>(null);
  const base = typeof window === "undefined" ? "" : window.location.origin;

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Clé révoquée.");
      void qc.invalidateQueries({ queryKey: ["api"] });
    },
    onError: (e) => {
      logError("api.revoke", e);
      toast.error(userMessage(e));
    },
  });
  const nameOf = new Map((clients.data ?? []).map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="API et clés d'accès"
        description="Donnez à la paie, au pointage ou à une autre application un accès en lecture seule, limité à un niveau de données."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nouvelle clé
          </Button>
        }
      />

      <section className="mb-6 rounded-lg border bg-card p-5 text-sm">
        <h2 className="font-semibold">Utilisation</h2>
        <p className="mt-2 text-muted-foreground">
          Adresse de base : <code>{base}/api/v1</code> — ressources : <code>/employees</code>,{" "}
          <code>/employees/&#123;matricule&#125;</code>, <code>/contracts</code> (niveau 2 et plus).
          Documentation complète : <code>docs/api.md</code>.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">{`curl -H "Authorization: Bearer fms_xxxxxxxx_…" "${base}/api/v1/employees?presence=actifs&per_page=100"`}</pre>
      </section>

      <section aria-label="Clés" className="rounded-lg border bg-card">
        {clients.isLoading ? (
          <LoadingState />
        ) : clients.error ? (
          <ErrorState error={clients.error} onRetry={() => clients.refetch()} />
        ) : !clients.data?.length ? (
          <EmptyState
            title="Aucune clé d'API"
            hint="Créez une clé par application (paie, pointage…)."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  {["Application", "Niveau", "Clé", "Expire", "Dernier appel", "État", ""].map(
                    (h) => (
                      <th key={h} className="px-4 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {clients.data.map((c) => {
                  const st = clientStatus(c);
                  return (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">
                        {c.name}
                        {c.description && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {c.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">{LEVEL_INFO[c.level].label.split(" — ")[0]}</td>
                      <td className="px-4 py-2">
                        <code>fms_{c.key_prefix}_…</code>
                      </td>
                      <td className="px-4 py-2">
                        {c.expires_at ? formatDateTime(c.expires_at) : "Jamais"}
                      </td>
                      <td className="px-4 py-2">
                        {c.last_used_at ? formatDateTime(c.last_used_at) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={st === "active" ? "default" : "secondary"}>
                          {STATUS_LABEL[st]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {st !== "revoked" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={revokeMut.isPending}
                            onClick={() =>
                              window.confirm(
                                `Révoquer la clé « ${c.name} » ? L'application perdra l'accès immédiatement.`,
                              ) && revokeMut.mutate(c.id)
                            }
                          >
                            Révoquer
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Journal des appels" className="mt-6 rounded-lg border bg-card">
        <h2 className="border-b px-4 py-3 font-semibold">100 derniers appels</h2>
        {log.isLoading ? (
          <LoadingState />
        ) : log.error ? (
          <ErrorState error={log.error} onRetry={() => log.refetch()} />
        ) : !log.data?.length ? (
          <EmptyState title="Aucun appel pour le moment" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  {["Date", "Application", "Requête", "Statut", "Lignes"].map((h) => (
                    <th key={h} className="px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.data.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-2">{nameOf.get(r.client_id) ?? "—"}</td>
                    <td className="px-4 py-2">
                      <code>
                        {r.method} {r.path}
                      </code>
                    </td>
                    <td className="px-4 py-2">{r.status}</td>
                    <td className="px-4 py-2">{r.row_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(name, key) => {
          setShown({ name, key });
          void qc.invalidateQueries({ queryKey: ["api"] });
        }}
      />

      <Dialog open={!!shown} onOpenChange={(o) => !o && setShown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clé créée : {shown?.name}</DialogTitle>
            <DialogDescription>
              Copiez-la maintenant et transmettez-la de façon sécurisée. Elle ne sera plus jamais
              affichée ; en cas de perte, révoquez-la et créez-en une autre.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-muted p-2 text-xs">
              {shown?.key}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copier la clé"
              onClick={() =>
                shown &&
                navigator.clipboard.writeText(shown.key).then(() => toast.success("Clé copiée."))
              }
            >
              <Copy />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (name: string, key: string) => void;
}) {
  const create = useServerFn(createApiClient);
  const sites = useQuery({ ...sitesQuery, enabled: open });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<ApiLevel>("identite");
  const [siteId, setSiteId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          description: description || undefined,
          level,
          siteId: siteId || null,
          expiresAt: expiresAt || null,
        },
      }),
    onSuccess: (r) => {
      onCreated(name, r.key);
      onOpenChange(false);
      setName("");
      setDescription("");
      setLevel("identite");
      setSiteId("");
      setExpiresAt("");
    },
    onError: (e) => {
      logError("api.create", e);
      toast.error(userMessage(e));
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle clé d'API</DialogTitle>
          <DialogDescription>Une clé par application. Lecture seule.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <FormRow label="Application">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Paie, Pointage…"
              required
              minLength={2}
              maxLength={80}
            />
          </FormRow>
          <FormRow label="Description (facultatif)">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </FormRow>
          <FormRow label="Niveau d'accès">
            <SelectInput
              value={level}
              onChange={(v) => setLevel(v as ApiLevel)}
              options={API_LEVELS.map((l) => ({ value: l, label: LEVEL_INFO[l].label }))}
            />
          </FormRow>
          <p className="text-xs text-muted-foreground">
            {LEVEL_INFO[level].description} Exemple : {LEVEL_INFO[level].example}.
          </p>
          <FormRow label="Limiter à un site (facultatif)">
            <SelectInput
              value={siteId}
              onChange={setSiteId}
              emptyLabel="Tous les sites"
              options={(sites.data ?? [])
                .filter((s) => !s.archived_at)
                .map((s) => ({ value: s.id, label: s.name }))}
            />
          </FormRow>
          <FormRow label="Expire le (facultatif)">
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </FormRow>
          <Button type="submit" disabled={mut.isPending || name.trim().length < 2}>
            <KeyRound /> Créer la clé
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
