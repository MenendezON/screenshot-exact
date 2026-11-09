<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Access control lives in the database: roles in `public.user_roles` (one active row per user, `archived_at` = deactivated), checked through `has_role` / `has_any_role` / `get_my_role` security-definer functions in RLS. UI role checks are cosmetic only.
- Every app table carries `id, created_at, updated_at, created_by, updated_by, archived_at`, plus the `set_audit_columns` (BEFORE) and `log_audit` (AFTER) triggers; clients get no DELETE grant, so rows are archived, never removed.
- Business parameters are rows in `public.settings` (integer value + unit); code reads them, never hardcodes them.
- Computed HR fields (age, seniority, remaining days, retirement date) must be SQL views, never stored columns.
- Display formatting (FCFA, dates in Africa/Dakar) goes through `src/lib/format.ts` so the rule stays in one tested place.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate) and render inside `AppShell`; admin-only screens wrap content in `RequireRole`.
- Privileged auth operations (inviting users) run in `createServerFn` with `requireSupabaseAuth`, verify `has_role` first, then load the admin client inside the handler.
- Public sign-up is disabled; the first account created when no active admin exists is auto-promoted to `admin_rh` by the `handle_new_user` trigger.
