import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { Shield, Users, Activity, Target, ChartBar, AlertTriangle, List, Database, Table2, TrendingUp } from "lucide-react";
import ImpactTable       from "@/pages/ImpactTable";
import LikelihoodTable   from "@/pages/LikelihoodTable";

const queryClient = new QueryClient();

const navItems = [
  { path: "/", label: "Actor Prioritisation", icon: Users },
  { path: "/risk-calculation", label: "Risk Calculation", icon: Activity },
  { path: "/impact-table",      label: "Impact Table",      icon: Table2 },
  { path: "/likelihood-table",  label: "Likelihood Table",  icon: TrendingUp },
  { path: "/high-value-assets", label: "High Value Assets", icon: Target },
  { path: "/tid-priority", label: "TID Priority", icon: ChartBar },
  { path: "/tactics-scores", label: "Tactic Scores", icon: AlertTriangle },
  { path: "/risk-rate", label: "Risk Rate", icon: Shield },
  { path: "/all-procedures", label: "All Procedures", icon: List },
  { path: "/data-sources", label: "Data Sources", icon: Database },
];

function Sidebar() {
  const [location] = useLocation();
  const { mitreVersions, activeMitreVersionId } = useAppData();
  const activeVersion = activeMitreVersionId
    ? mitreVersions.find(v => v.id === activeMitreVersionId)
    : null;
  const mitreLabel = activeVersion?.label ?? "MITRE ATT&CK v16";

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
        {navItems.map(({ path, label, icon: Icon }) => {
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

      <div className="p-4 border-t border-sidebar-border">
        <div className="text-xs text-muted-foreground">{mitreLabel}</div>
        <div className="text-xs text-muted-foreground">Purple Team Framework</div>
      </div>
    </aside>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={ActorPrioritisation} />
        <Route path="/risk-calculation" component={RiskCalculation} />
        <Route path="/impact-table"     component={ImpactTable} />
        <Route path="/likelihood-table" component={LikelihoodTable} />
        <Route path="/high-value-assets" component={HighValueAssets} />
        <Route path="/tid-priority" component={TidPriority} />
        <Route path="/tactics-scores" component={TacticsScores} />
        <Route path="/risk-rate" component={RiskRate} />
        <Route path="/all-procedures" component={AllProcedures} />
        <Route path="/data-sources" component={DataSources} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppDataProvider>
          <TacticScoresProvider>
            <LikelihoodProvider>
              <ImpactOverridesProvider>
                <HVAScoresProvider>
                  <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                    <Router />
                  </WouterRouter>
                </HVAScoresProvider>
              </ImpactOverridesProvider>
            </LikelihoodProvider>
          </TacticScoresProvider>
        </AppDataProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
