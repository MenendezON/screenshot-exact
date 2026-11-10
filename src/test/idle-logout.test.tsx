import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => {});
const auth = { mfaRequired: true, loading: false };

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ ...auth, signOut }),
}));
vi.mock("@/lib/settings", async () => {
  const { queryOptions } = await import("@tanstack/react-query");
  return {
    settingsQuery: queryOptions({
      queryKey: ["settings"],
      queryFn: async () => [{ key: "session_idle_minutes", value: 5 }],
    }),
  };
});

import { IdleLogout } from "@/components/idle-logout";

function mount() {
  const client = new QueryClient();
  client.setQueryData(["settings"], [{ key: "session_idle_minutes", value: 5 }]);
  return render(
    <QueryClientProvider client={client}>
      <IdleLogout />
    </QueryClientProvider>,
  );
}

describe("IdleLogout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    signOut.mockClear();
    auth.mfaRequired = true;
  });
  afterEach(() => vi.useRealTimers());

  it("avertit puis déconnecte un rôle soumis à la double authentification", () => {
    mount();
    act(() => void vi.advanceTimersByTime(3 * 60_000));
    expect(screen.queryByText("Toujours là ?")).toBeNull();
    act(() => void vi.advanceTimersByTime(90_000)); // 4 min 30 s : dernière minute
    expect(screen.getByText("Toujours là ?")).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(31_000));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("fabrimetal:idle-logout")).toBe("1");
  });

  it("l'activité repousse l'échéance", () => {
    mount();
    act(() => void vi.advanceTimersByTime(3.5 * 60_000));
    act(() => void window.dispatchEvent(new Event("keydown")));
    act(() => void vi.advanceTimersByTime(90_000));
    expect(screen.queryByText("Toujours là ?")).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("« Rester connecté » ferme l'avertissement", () => {
    mount();
    act(() => void vi.advanceTimersByTime(4.5 * 60_000));
    act(() => screen.getByText("Rester connecté").click());
    expect(screen.queryByText("Toujours là ?")).toBeNull();
    act(() => void vi.advanceTimersByTime(2 * 60_000));
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ne fait rien pour un rôle sans double authentification", () => {
    auth.mfaRequired = false;
    mount();
    act(() => void vi.advanceTimersByTime(60 * 60_000));
    expect(signOut).not.toHaveBeenCalled();
  });
});
