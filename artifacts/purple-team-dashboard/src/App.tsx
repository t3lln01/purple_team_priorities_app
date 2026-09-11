import { useState, useRef, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, UserButton, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ActorPrioritisation from "@/pages/ActorPrioritisation";
import RiskCalculation from "@/pages/RiskCalculation";
import HighValueAssets from "@/pages/HighValueAssets";
import TidPriority from "@/pages/TidPriority";
import TacticsScores from "@/pages/TacticsScores";
import RiskRate from "@/pages/RiskRate";
import AllProcedures from "@/pages/AllProcedures";
import DataSources from "@/pages/DataSources";
import { TacticScoresProvider }    from "@/context/TacticScoresContext";
import { LikelihoodProvider }       from "@/context/LikelihoodContext";
import { AppDataProvider, useAppData } from "@/context/AppDataContext";
import { ImpactOverridesProvider }  from "@/context/ImpactOverridesContext";
import { HVAScoresProvider }        from "@/context/HVAScoresContext";
import { DateWindowProvider, useDateWindow, DATE_RANGE_LABELS, type DateRange } from "@/context/DateWindowContext";
import { Shield, Users, Activity, Target, ChartBar, AlertTriangle, List, Database, Table2, TrendingUp, CalendarRange, ChevronDown, Crosshair, BookOpen, UserCog } from "lucide-react";
import ImpactTable       from "@/pages/ImpactTable";
import LikelihoodTable   from "@/pages/LikelihoodTable";
import ThreatModel       from "@/pages/ThreatModel";
import ApiDocs           from "@/pages/ApiDocs";
import { AuthProvider, useAuthorization } from "@/context/AuthContext";
import { ThreatModelQuarterProvider } from "@/context/ThreatModelQuarterContext";
import UserManagement from "@/pages/UserManagement";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#a855f7",
    colorForeground: "#f8fafc",
    colorMutedForeground: "#94a3b8",
    colorDanger: "#ef4444",
    colorBackground: "#111827",
    colorInput: "#1e293b",
    colorInputForeground: "#f8fafc",
    colorNeutral: "#475569",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#111827] border border-[#334155] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-50",
    headerSubtitle: "text-slate-400",
    socialButtonsBlockButtonText: "text-slate-100",
    formFieldLabel: "text-slate-200",
    footerActionLink: "text-purple-400 hover:text-purple-300",
    footerActionText: "text-slate-400",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "text-purple-400",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-red-200",
    logoBox: "h-14",
    logoImage: "h-12 w-12",
    socialButtonsBlockButton: "border-slate-600 bg-slate-800 hover:bg-slate-700",
    socialButtons: "hidden",
    dividerRow: "hidden",
    formButtonPrimary: "bg-purple-600 hover:bg-purple-500 text-white",
    formFieldInput: "border-slate-600 bg-slate-800 text-slate-50",
    footerAction: "hidden",
    dividerLine: "bg-slate-700",
    alert: "border-red-900 bg-red-950",
    otpCodeFieldInput: "border-slate-600 bg-slate-800 text-slate-50",
    formFieldRow: "text-slate-100",
    main: "gap-5",
  },
};

const navItems = [
  { path: "/dashboard", label: "Actor Prioritisation", icon: Users },
  { path: "/threat-model", label: "Threat Model", icon: Crosshair },
  { path: "/risk-calculation", label: "Risk Calculation", icon: Activity },
  { path: "/impact-table",      label: "Impact Table",      icon: Table2 },
  { path: "/likelihood-table",  label: "Likelihood Table",  icon: TrendingUp },
  { path: "/high-value-assets", label: "High Value Assets", icon: Target },
  { path: "/tid-priority", label: "TID Priority", icon: ChartBar },
  { path: "/tactics-scores", label: "Tactic Scores", icon: AlertTriangle },
  { path: "/risk-rate", label: "Risk Rate", icon: Shield },
  { path: "/all-procedures", label: "All Procedures", icon: List },
  { path: "/data-sources", label: "Data Sources", icon: Database },
  { path: "/api-docs",     label: "API",          icon: BookOpen },
  { path: "/users", label: "Users", icon: UserCog, adminOnly: true },
];

function DatePickerWidget() {
  const { dateRange, setDateRange, customFrom, customTo, setCustomFrom, setCustomTo } = useDateWindow();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
          dateRange !== "all"
            ? "bg-primary/15 text-primary border-primary/40"
            : "bg-sidebar-accent/30 border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
        }`}
      >
        <CalendarRange className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate flex-1 text-left">{DATE_RANGE_LABELS[dateRange]}</span>
        {dateRange === "custom" && customFrom && customTo && (
          <span className="text-muted-foreground font-normal truncate">
            {new Date(customFrom).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}–{new Date(customTo).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-1.5 z-50 w-64 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Calculation date window</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Applies across all pages — filters to techniques observed in this period</p>
          </div>
          <div className="p-2 space-y-0.5">
            {(["all", "3m", "6m", "9m", "1y", "custom"] as DateRange[]).map(opt => (
              <button
                key={opt}
                onClick={() => { setDateRange(opt); if (opt !== "custom") setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors text-left ${
                  dateRange === opt ? "bg-primary/15 text-primary font-medium" : "text-foreground hover:bg-accent"
                }`}
              >
                <span>{DATE_RANGE_LABELS[opt]}</span>
                {dateRange === opt && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
          {dateRange === "custom" && (
            <div className="px-3 pb-3 pt-2 border-t border-border space-y-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground font-medium">From</label>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:dark]" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground font-medium">To</label>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring [color-scheme:dark]" />
              </div>
              {(customFrom || customTo) && (
                <button onClick={() => setOpen(false)}
                  className="w-full py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
                  Apply
                </button>
              )}
            </div>
          )}
          {dateRange !== "all" && (
            <div className="px-3 pb-3">
              <button
                onClick={() => { setDateRange("all"); setCustomFrom(""); setCustomTo(""); setOpen(false); }}
                className="w-full text-xs text-muted-foreground hover:text-foreground underline transition-colors text-center"
              >
                Reset to all time
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar() {
  const [location] = useLocation();
  const { mitreVersions, activeMitreVersionId } = useAppData();
  const activeVersion = activeMitreVersionId
    ? mitreVersions.find(v => v.id === activeMitreVersionId)
    : null;
  const mitreLabel = activeVersion?.label ?? "MITRE ATT&CK v16";
  const { isAdmin, canWrite, isSignedIn, email } = useAuthorization();

  return (
    <aside className="w-64 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-sm text-sidebar-foreground">Purple Team</div>
            <div className="text-xs text-muted-foreground">Adversary Prioritisation</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto flex flex-col gap-0.5">
        {navItems.filter((item) => !item.adminOnly || isAdmin).map(({ path, label, icon: Icon }) => {
          const isActive = location === path;
          return (
            <Link key={path} href={path}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-3">
        <DatePickerWidget />
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <UserButton />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-200">
                G
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-sidebar-foreground">
                {isSignedIn ? email : "Guest"}
              </div>
              <div className={`text-[10px] ${canWrite ? "text-emerald-400" : "text-amber-400"}`}>
                {isAdmin ? "Administrator" : canWrite ? "Write access" : "View only"}
              </div>
            </div>
          </div>
          {!isSignedIn && (
            <Link href="/sign-in">
              <span className="mt-2 block cursor-pointer text-xs text-primary hover:underline">
                Sign in for write access
              </span>
            </Link>
          )}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{mitreLabel}</div>
          <div className="text-xs text-muted-foreground">Purple Team Framework</div>
        </div>
      </div>
    </aside>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { canWrite, isSignedIn } = useAuthorization();
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {!canWrite && (
          <div className="sticky top-0 z-40 flex items-center justify-between border-b border-amber-400/20 bg-amber-400/10 px-6 py-2 text-xs text-amber-200 backdrop-blur">
            <span>
              {isSignedIn
                ? "View-only access — ask the administrator to grant write access."
                : "View-only access — sign in with a write-enabled account to make changes."}
            </span>
            {!isSignedIn && <Link href="/sign-in"><span className="cursor-pointer font-semibold text-amber-100 hover:underline">Sign in</span></Link>}
          </div>
        )}
        <fieldset
          disabled={!canWrite}
          className="m-0 min-w-0 border-0 p-0"
          onClickCapture={(event) => {
            if (
              !canWrite
              && (event.target as Element).closest(
                '[role="button"], [role="switch"], [role="checkbox"]',
              )
            ) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          {children}
        </fieldset>
      </main>
    </div>
  );
}

function DashboardRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/dashboard" component={ActorPrioritisation} />
        <Route path="/threat-model" component={ThreatModel} />
        <Route path="/risk-calculation" component={RiskCalculation} />
        <Route path="/impact-table"     component={ImpactTable} />
        <Route path="/likelihood-table" component={LikelihoodTable} />
        <Route path="/high-value-assets" component={HighValueAssets} />
        <Route path="/tid-priority" component={TidPriority} />
        <Route path="/tactics-scores" component={TacticsScores} />
        <Route path="/risk-rate" component={RiskRate} />
        <Route path="/all-procedures" component={AllProcedures} />
        <Route path="/data-sources" component={DataSources} />
        <Route path="/api-docs"     component={ApiDocs} />
        <Route path="/users" component={UserManagement} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function WelcomePage() {
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useAuthorization();

  useEffect(() => {
    if (isLoaded && isSignedIn) setLocation("/dashboard", { replace: true });
  }, [isLoaded, isSignedIn, setLocation]);

  if (!isLoaded || isSignedIn) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(168,85,247,0.18),transparent_42%)]" />
      <div className="relative w-full max-w-xl rounded-3xl border border-border bg-card/95 p-8 shadow-2xl sm:p-11">
        <img src={`${basePath}/logo.svg`} alt="" className="mb-6 h-14 w-14" />
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Purple Team</div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Adversary Prioritisation</h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
          Review threat actors, scoring evidence, risk calculations, and ATT&amp;CK priorities. Sign in with your username and password to edit, or continue with view-only guest access.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setLocation("/sign-in")}
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setLocation("/dashboard")}
            className="rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-semibold text-secondary-foreground transition hover:bg-accent"
          >
            Continue as guest
          </button>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Guests can view the entire dashboard but cannot save or modify data.
        </p>
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <SignIn routing="path" path={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/dashboard`} />
    </div>
  );
}

function AppProvidersAndRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in with your username and password" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <AuthProvider>
          <TooltipProvider>
            <ThreatModelQuarterProvider>
              <AppDataProvider>
                <DateWindowProvider>
                  <TacticScoresProvider>
                    <LikelihoodProvider>
                      <ImpactOverridesProvider>
                        <HVAScoresProvider>
                          <Switch>
                          <Route path="/" component={WelcomePage} />
                          <Route path="/sign-in/*?" component={SignInPage} />
                          <Route path="/dashboard" component={DashboardRouter} />
                          <Route path="/threat-model" component={DashboardRouter} />
                          <Route path="/risk-calculation" component={DashboardRouter} />
                          <Route path="/impact-table" component={DashboardRouter} />
                          <Route path="/likelihood-table" component={DashboardRouter} />
                          <Route path="/high-value-assets" component={DashboardRouter} />
                          <Route path="/tid-priority" component={DashboardRouter} />
                          <Route path="/tactics-scores" component={DashboardRouter} />
                          <Route path="/risk-rate" component={DashboardRouter} />
                          <Route path="/all-procedures" component={DashboardRouter} />
                          <Route path="/data-sources" component={DashboardRouter} />
                          <Route path="/api-docs" component={DashboardRouter} />
                          <Route path="/users" component={DashboardRouter} />
                          <Route><Redirect to="/" /></Route>
                          </Switch>
                        </HVAScoresProvider>
                      </ImpactOverridesProvider>
                    </LikelihoodProvider>
                  </TacticScoresProvider>
                </DateWindowProvider>
              </AppDataProvider>
            </ThreatModelQuarterProvider>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => addListener(({ user }) => {
    const nextUserId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== nextUserId) {
      queryClient.clear();
    }
    previousUserId.current = nextUserId;
  }), [addListener]);

  return null;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppProvidersAndRoutes />
    </WouterRouter>
  );
}

export default App;
