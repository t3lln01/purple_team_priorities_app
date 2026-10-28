import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useAuthorization } from "@/context/AuthContext";

type ManagedUser = {
  id: string;
  email: string;
  isAdmin: boolean;
  canWrite: boolean;
  createdAt: number;
  lastSignInAt: number | null;
};

export default function UserManagement() {
  const { isAdmin } = useAuthorization();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/access/users");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load users.");
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function addUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/access/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to create user.");
      setUsers((current) => [...current, data.user]);
      setEmail("");
      setPassword("");
      setSuccess("Write-enabled user created. They can sign in with these credentials.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create user.");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Administrator access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">Only the administrator can manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Users className="h-4 w-4" />
          Access control
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">User management</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create username and password accounts with write access to the dashboard.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={addUser} className="h-fit rounded-2xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-primary/15 p-2.5 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Add write-enabled user</h2>
              <p className="text-xs text-muted-foreground">The username is the user&apos;s email address.</p>
            </div>
          </div>

          <label className="mb-1.5 block text-xs font-medium text-foreground" htmlFor="new-user-email">
            Username
          </label>
          <input
            id="new-user-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            required
            className="mb-4 w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />

          <label className="mb-1.5 block text-xs font-medium text-foreground" htmlFor="new-user-password">
            Temporary password
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              id="new-user-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              placeholder="At least 8 characters"
              required
              className="w-full rounded-lg border border-border bg-input py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Share the temporary password securely. The password is sent directly to the identity service and is never stored by this app.
          </p>

          {error && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}
          {success && <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">{success}</div>}

          <button
            type="submit"
            disabled={saving}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create user
          </button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-6 py-5">
            <h2 className="font-semibold">Application users</h2>
            <p className="mt-1 text-xs text-muted-foreground">Administrators and users currently granted write access.</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading users
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No users found.</div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{user.email}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Added {new Date(user.createdAt).toLocaleDateString()}
                      {user.lastSignInAt ? ` · Last sign-in ${new Date(user.lastSignInAt).toLocaleDateString()}` : " · Never signed in"}
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    user.isAdmin
                      ? "border-purple-400/30 bg-purple-400/10 text-purple-300"
                      : user.canWrite
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-slate-400/30 bg-slate-400/10 text-slate-300"
                  }`}>
                    {user.isAdmin ? "Administrator" : user.canWrite ? "Write access" : "View only"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}