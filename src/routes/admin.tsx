import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck,
  ChevronLeft,
  ArrowLeft,
  Users,
  Plus,
  Trash2,
  Edit2,
  FolderTree,
  Save,
  X,
  TrendingUp,
  TrendingDown,
  User as UserIcon,
  Link2,
  PieChart as PieChartIcon,
  Bell as BellIcon,
  Clock,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { IntegrationManager } from "@/components/IntegrationManager";
import { CrmAnalytics } from "@/components/CrmAnalytics";
import { AdminAlertsManager } from "@/components/AdminAlertsManager";
import { WorkHoursManager } from "@/components/WorkHoursManager";
import { EditMemberDialog, type MemberProfile } from "@/components/EditMemberDialog";
import { DailySnapshotModal } from "@/components/DailySnapshotModal";
import { AdminPanel } from "@/components/AdminPanel";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      from: (search.from as string) || "",
      tab: (search.tab as string) || "",
    };
  },
  component: AdminPage,
});

interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  parent_id?: string | null;
  isTemporary?: boolean;
}

function formatElapsedLive(startedAt: string, currentMs: number = Date.now()) {
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return "0s";
  const sec = Math.max(0, Math.floor((currentMs - startMs) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function AdminPage() {
  const { user, role, loading: authLoading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const handleBack = () => {
    if (search.from === "crm") {
      navigate({ to: "/crm" });
    } else if (search.from === "financeiro") {
      navigate({ to: "/financeiro" });
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate({ to: "/" });
    }
  };

  const [activeTab, setActiveTab] = useState<"analytics" | "alerts" | "users" | "categories" | "integration">(() => {
    if (search.tab && ["analytics", "alerts", "users", "categories", "integration"].includes(search.tab)) {
      return search.tab as any;
    }
    const saved = localStorage.getItem("mykaflow_admin_tab");
    if (saved && ["analytics", "alerts", "users", "categories", "integration"].includes(saved)) {
      return saved as any;
    }
    return "users"; // Default direto para Equipe
  });

  const handleTabChange = (tab: "analytics" | "alerts" | "users" | "categories" | "integration") => {
    setActiveTab(tab);
    localStorage.setItem("mykaflow_admin_tab", tab);
  };

  const [profiles, setProfiles] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedUserToEdit, setSelectedUserToEdit] = useState<MemberProfile | null>(null);
  const [selectedUserForProductivity, setSelectedUserForProductivity] = useState<MemberProfile | null>(null);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);

  // Rastreamento de atividades ativas em tempo real
  const [activeActivities, setActiveActivities] = useState<
    Record<string, { dealId: string; title: string; reqNumber?: string | null; startedAt: string }>
  >({});
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function fetchActiveActivities() {
    try {
      // Busca no banco APENAS as atividades que estão com cronômetro ativo no momento
      const { data: deals, error: dealsErr } = await supabase
        .from("crm_deals")
        .select("id, title, notes")
        .like("notes", "%[WORK_ACTIVE:%");

      if (dealsErr) throw dealsErr;

      const activeMap: Record<
        string,
        { dealId: string; title: string; reqNumber?: string | null; startedAt: string }
      > = {};

      (deals || []).forEach((deal) => {
        if (!deal.notes || !deal.notes.includes("[WORK_ACTIVE:")) return;
        const match = deal.notes.match(/\[WORK_ACTIVE:(.*?)\]/);
        if (match && match[1]) {
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.userId && parsed.startedAt) {
              const reqMatch = deal.notes.match(/(?:REQ|Nº|Requisito)\s*[:#]?\s*([0-9.]+)/i);
              const reqNum = parsed.reqNumber || (reqMatch ? reqMatch[1] : null);
              activeMap[parsed.userId] = {
                dealId: deal.id,
                title: deal.title,
                reqNumber: reqNum,
                startedAt: parsed.startedAt,
              };
            }
          } catch (e) {}
        }
      });

      setActiveActivities(activeMap);
    } catch (err) {
      console.warn("Erro ao buscar atividades ativas em equipe:", err);
    }
  }

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const { data: profs, error: pErr } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (pErr) throw pErr;

      const { data: roles } = await supabase.from("user_roles").select("*");

      const profileMap = new Map<string, any>();
      (profs || []).forEach((p) => {
        profileMap.set(p.id, {
          id: p.id,
          email: p.email || "",
          name: p.display_name || p.email?.split("@")[0] || "Sem nome",
          role: roles?.find((r) => r.user_id === p.id)?.role || "user",
        });
      });

      (roles || []).forEach((r) => {
        if (!profileMap.has(r.user_id)) {
          profileMap.set(r.user_id, {
            id: r.user_id,
            email: "Aguardando sincronização",
            name: "Novo Membro",
            role: r.role || "user",
          });
        }
      });

      setProfiles(Array.from(profileMap.values()));
      await fetchActiveActivities();
    } catch (err: any) {
      console.error("Erro ao listar usuários:", err);
      toast.error(`Erro na lista: ${err.message || "Falha de conexão"}`);
      setProfiles([]);
    } finally {
      setUsersLoading(false);
    }
  }

  const isAdmin = role === "admin";

  useEffect(() => {
    if (user && activeTab === "users") {
      fetchUsers();
      const interval = setInterval(fetchActiveActivities, 4000);
      return () => clearInterval(interval);
    }
  }, [user, activeTab]);

  if (authLoading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground uppercase tracking-widest text-xs text-center">
        Carregando Central ADM...
      </div>
    );

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
        <ShieldCheck className="h-16 w-16 text-muted-foreground opacity-20" />
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-widest text-gradient uppercase">
            Acesso Restrito
          </h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Você precisa estar logado como administrador para acessar esta área.
          </p>
        </div>
        <Link
          to="/login"
          className="btn-futuristic rounded-xl px-8 py-3 text-xs font-bold uppercase tracking-widest"
        >
          Ir para Login
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
        <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 pulse-glow">
          <ShieldCheck className="h-12 w-12 text-red-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-widest text-red-500 uppercase">
            ACESSO NEGADO
          </h1>
          <p className="max-w-xs text-sm text-muted-foreground">
            Seu usuário ({user.email}) não tem permissões de administrador.
          </p>
        </div>
        <Link
          to="/"
          className="btn-ghost-neon rounded-xl px-8 py-3 text-xs font-bold uppercase tracking-widest"
        >
          Voltar ao Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen lg:h-screen lg:overflow-hidden p-3 md:px-6 pb-2 flex flex-col justify-start select-none">
      <div className="w-full flex-1 flex flex-col min-h-0">
        <header className="mb-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="btn-ghost-neon h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white transition-all cursor-pointer shadow-sm hover:scale-105"
              title={
                search.from === "crm"
                  ? "Voltar para Gestão Comercial"
                  : search.from === "financeiro"
                  ? "Voltar para Módulo Financeiro"
                  : "Voltar"
              }
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex flex-col justify-center">
              <svg
                viewBox="0 0 200 26"
                className="w-[185px] sm:w-[205px] h-[26px] overflow-visible select-none drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <text
                  x="0"
                  y="21"
                  className="font-saira-stencil"
                  fontSize="22"
                  fill="#22d3ee"
                  textLength="200"
                  lengthAdjust="spacing"
                >
                  ADMINISTRAÇÃO
                </text>
              </svg>
            </div>
          </div>

          <nav className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10 overflow-x-auto max-w-full no-scrollbar shrink-0">
            <button
              onClick={() => handleTabChange("users")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "users"
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <Users className="h-3.5 w-3.5" /> Equipe
            </button>
            <button
              onClick={() => handleTabChange("analytics")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "analytics"
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/25"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <PieChartIcon className="h-3.5 w-3.5" /> Atividades
            </button>
            <button
              onClick={() => handleTabChange("alerts")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "alerts"
                  ? "bg-amber-500 text-black font-black shadow-lg shadow-amber-500/25"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <BellIcon className="h-3.5 w-3.5" /> Alertas
            </button>
            <button
              onClick={() => handleTabChange("categories")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "categories"
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <FolderTree className="h-3.5 w-3.5" /> Categorias
            </button>
            <button
              onClick={() => handleTabChange("integration")}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "integration"
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <Link2 className="h-3.5 w-3.5" /> Integração
            </button>

            {/* Divisor Visual */}
            <div className="w-[1px] h-5 bg-white/10 mx-0.5 shrink-0" />

            {/* Botão de Snapshot Comercial do Dia */}
            <button
              type="button"
              onClick={() => setIsSnapshotModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap bg-gradient-to-r from-sky-500/20 via-sky-500/30 to-emerald-500/20 text-sky-300 hover:text-white border border-sky-400/40 hover:border-sky-400 hover:scale-105 shadow-[0_0_15px_rgba(56,189,248,0.25)]"
              title="Snapshot Comercial do Dia (Resumo Executivo para a Diretoria)"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-300 animate-pulse" />
              <span>Snapshot</span>
            </button>
          </nav>
        </header>

        <div className="float-up flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
          {activeTab === "analytics" ? (
            <CrmAnalytics />
          ) : activeTab === "alerts" ? (
            <AdminAlertsManager />
          ) : activeTab === "users" ? (
            <UserList
              profiles={profiles}
              loading={usersLoading}
              onRefresh={fetchUsers}
              selectedUserToEdit={selectedUserToEdit}
              setSelectedUserToEdit={setSelectedUserToEdit}
              setSelectedUserForProductivity={setSelectedUserForProductivity}
              activeActivities={activeActivities}
              nowMs={nowMs}
            />
          ) : activeTab === "categories" ? (
            <CategoryManager />
          ) : (
            <IntegrationManager />
          )}
        </div>
      </div>

      <DailySnapshotModal
        isOpen={isSnapshotModalOpen}
        onClose={() => setIsSnapshotModalOpen(false)}
      />

      <EditMemberDialog
        isOpen={Boolean(selectedUserToEdit)}
        onClose={() => setSelectedUserToEdit(null)}
        targetUser={selectedUserToEdit}
        onSuccess={() => {
          setSelectedUserToEdit(null);
          fetchUsers();
        }}
      />

      {/* Painel de Produtividade em Tela Cheia */}
      {selectedUserForProductivity && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white animate-in fade-in overflow-hidden">
          {/* Cabeçalho Fixo em Tela Cheia */}
          <div className="px-4 sm:px-6 py-2.5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 shrink-0 shadow-2xl gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setSelectedUserForProductivity(null)}
                className="btn-ghost-neon h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white transition-all cursor-pointer shadow-sm hover:scale-105 shrink-0"
                title="Voltar para a lista de equipe"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="flex flex-col select-none justify-center focus:outline-none shrink-0">
                <svg
                  className="w-[230px] sm:w-[260px] h-[26px] overflow-visible select-none drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                  viewBox="0 0 265 26"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <text
                    x="0"
                    y="21"
                    className="font-saira-stencil"
                    fontSize="22"
                    fill="#22d3ee"
                    textLength="265"
                    lengthAdjust="spacing"
                  >
                    GESTÃO INDIVIDUAL
                  </text>
                </svg>
              </div>

              <div className="h-6 w-px bg-white/15 hidden md:block shrink-0" />

              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`p-2 rounded-xl shrink-0 ${
                  activeActivities[selectedUserForProductivity.id]
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                    : "bg-slate-900 text-slate-500 border border-white/10"
                }`}>
                  <Clock className={`h-4 w-4 ${activeActivities[selectedUserForProductivity.id] ? "animate-pulse" : ""}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white truncate">
                      {selectedUserForProductivity.name}
                    </h3>
                  </div>

                  {/* Status ao vivo da Atividade no Cabeçalho */}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {activeActivities[selectedUserForProductivity.id] ? (
                      <div className="inline-flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/50 px-2.5 py-0.5 rounded-lg text-emerald-300 shadow-sm text-xs font-bold">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] shrink-0" />
                        <span className="font-mono text-[11px] uppercase tracking-wider">
                          TRABALHANDO EM:{" "}
                          <span className="text-white font-black">
                            {activeActivities[selectedUserForProductivity.id].reqNumber
                              ? `#${activeActivities[selectedUserForProductivity.id].reqNumber} - `
                              : ""}
                            {activeActivities[selectedUserForProductivity.id].title}
                          </span>
                        </span>
                        <span className="text-[10px] text-emerald-300 font-mono font-bold bg-emerald-900/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                          {formatElapsedLive(activeActivities[selectedUserForProductivity.id].startedAt, nowMs)}
                        </span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 bg-slate-900/90 border border-slate-700/60 px-2.5 py-0.5 rounded-lg text-slate-400 text-xs font-bold font-mono">
                        <span className="h-2 w-2 rounded-full bg-slate-500 shrink-0" />
                        <span className="text-[11px] uppercase tracking-wider">
                          INATIVO NO MOMENTO
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Corpo do Painel em Tela Cheia */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-slate-950/80 flex flex-col">
            <div className="w-full flex-1 flex flex-col min-h-0">
              <WorkHoursManager initialUserId={selectedUserForProductivity.id} />
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de Confirmação global caso necessário */}
    </div>
  );
}

function UserList({
  profiles,
  loading,
  onRefresh,
  selectedUserToEdit,
  setSelectedUserToEdit,
  setSelectedUserForProductivity,
  activeActivities,
  nowMs,
}: {
  profiles: any[];
  loading: boolean;
  onRefresh: () => void;
  selectedUserToEdit: MemberProfile | null;
  setSelectedUserToEdit: (user: MemberProfile | null) => void;
  setSelectedUserForProductivity: (user: MemberProfile | null) => void;
  activeActivities: Record<string, { dealId: string; title: string; reqNumber?: string | null; startedAt: string }>;
  nowMs: number;
}) {
  const { user: currentUser } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: React.ReactNode;
    confirmText?: string;
    variant?: "danger" | "warning" | "info";
    requireKeyword?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  function handleDeleteUser(targetUserId: string, userName: string) {
    setConfirmConfig({
      isOpen: true,
      title: "Excluir Usuário",
      description: `Tem certeza que deseja EXCLUIR DEFINITIVAMENTE o usuário ${userName.toUpperCase()}?\n\nEsta ação removerá todos os direitos de acesso e dados do perfil do sistema.`,
      confirmText: "Excluir Usuário",
      variant: "danger",
      onConfirm: async () => {
        setConfirmConfig(null);
        setBusy(targetUserId);
        try {
          const { error: rpcError } = await supabase.rpc("delete_user_completely", {
            target_user_id: targetUserId,
          });

          if (rpcError) {
            console.warn("Aviso ao excluir via RPC delete_user_completely:", rpcError);
            await supabase.from("user_roles").delete().eq("user_id", targetUserId);
            const { error: pErr } = await supabase.from("profiles").delete().eq("id", targetUserId);
            if (pErr) throw pErr;
          }

          toast.success(`Usuário ${userName.toUpperCase()} excluído com sucesso.`);
          onRefresh();
        } catch (err: any) {
          toast.error(`Erro ao excluir: ${err.message || "Erro desconhecido"}`);
        } finally {
          setBusy(null);
        }
      },
    });
  }

  if (loading)
    return (
      <div className="p-10 text-center opacity-50 uppercase tracking-widest text-[10px]">
        Carregando equipe...
      </div>
    );

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
        <h3 className="text-lg font-black tracking-widest text-gradient flex items-center gap-2 uppercase">
          <Users className="h-5 w-5 text-accent" /> Gestão de Equipe & Permissões
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest opacity-50 font-black">
            {profiles.length} Membros
          </span>
          <button
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            className="btn-futuristic py-2 px-4 text-[10px] rounded-lg cursor-pointer"
          >
            {showAdminPanel ? "FECHAR" : "CRIAR ACESSO"}
          </button>
        </div>
      </div>

      {showAdminPanel && (
        <div className="mb-6 p-4 rounded-2xl bg-black/40 border border-white/5 animate-in fade-in">
          <AdminPanel onSuccess={onRefresh} />
        </div>
      )}

      <div className="grid gap-3">
        {profiles.map((p) => {
          const isCurrentUser = currentUser?.id === p.id;
          const isAdmin = p.role === "admin";
          const isFinance = p.role === "financeiro";

          const roleTheme = isAdmin
            ? {
                card: "bg-gradient-to-r from-amber-500/15 via-amber-950/20 to-black/50 border-amber-500/35 hover:border-amber-400 hover:shadow-[0_0_25px_rgba(245,158,11,0.15)] border-l-4 border-l-amber-400",
                iconBox: "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.3)]",
                badge: "bg-amber-500/25 text-amber-300 border-amber-400/50 shadow-sm",
                nameHover: "group-hover:text-amber-300",
                label: "ADMINISTRADOR",
                Icon: ShieldCheck,
              }
            : isFinance
            ? {
                card: "bg-gradient-to-r from-emerald-500/15 via-emerald-950/20 to-black/50 border-emerald-500/35 hover:border-emerald-400 hover:shadow-[0_0_25px_rgba(16,185,129,0.15)] border-l-4 border-l-emerald-400",
                iconBox: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.3)]",
                badge: "bg-emerald-500/25 text-emerald-300 border-emerald-400/50 shadow-sm",
                nameHover: "group-hover:text-emerald-300",
                label: "FINANCEIRO",
                Icon: Wallet,
              }
            : {
                card: "bg-gradient-to-r from-sky-500/15 via-sky-950/20 to-black/50 border-sky-500/35 hover:border-sky-400 hover:shadow-[0_0_25px_rgba(56,189,248,0.15)] border-l-4 border-l-sky-400",
                iconBox: "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.3)]",
                badge: "bg-sky-500/25 text-sky-300 border-sky-400/50 shadow-sm",
                nameHover: "group-hover:text-sky-300",
                label: "COMERCIAL",
                Icon: Users,
              };

          return (
            <div
              key={p.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl transition-all gap-4 group ${roleTheme.card}`}
            >
              <div 
                onClick={() => setSelectedUserForProductivity(p)}
                className="flex items-center gap-4 min-w-0 flex-1 cursor-pointer"
                title={`Clique para visualizar os parâmetros e métricas de produtividade de ${p.name}`}
              >
                <div
                  className={`p-3 rounded-2xl transition-all shrink-0 ${roleTheme.iconBox}`}
                >
                  <roleTheme.Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-bold text-sm uppercase tracking-widest text-white transition-colors truncate ${roleTheme.nameHover}`}>
                      {p.name}
                    </p>
                    {isCurrentUser && (
                      <span className="text-[8px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded-md font-black">
                        VOCÊ
                      </span>
                    )}

                    {/* Role Badge */}
                    <span
                      className={`text-[9px] font-mono font-black px-2 py-0.5 rounded-lg border uppercase tracking-wider ${roleTheme.badge}`}
                    >
                      {roleTheme.label}
                    </span>
                  </div>

                  {/* Status da Atividade Atual / Inativo */}
                  <div className="mt-1.5">
                    {activeActivities[p.id] ? (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 max-w-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] shrink-0" />
                        <span className="font-mono uppercase truncate">
                          Atividade: {activeActivities[p.id].reqNumber ? `#${activeActivities[p.id].reqNumber} ` : ""}{activeActivities[p.id].title}
                        </span>
                        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-900/60 px-1 py-0.2 rounded border border-emerald-500/20 shrink-0">
                          {formatElapsedLive(activeActivities[p.id].startedAt, nowMs)}
                        </span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900/80 border border-slate-700/50 text-[10px] font-bold text-slate-400 font-mono">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-500 shrink-0" />
                        <span className="uppercase">Inativo</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => setSelectedUserForProductivity(p)}
                  className="btn-ghost-neon px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-400 border-emerald-500/30 flex items-center gap-1.5 hover:bg-emerald-500/10 cursor-pointer"
                  title={`Ver métricas de produtividade e horas de ${p.name}`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>Produtividade</span>
                </button>

                <button
                  onClick={() => setSelectedUserToEdit(p)}
                  className="btn-ghost-neon px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-cyan-300 border-cyan-500/30 flex items-center gap-1.5 hover:bg-cyan-500/10 cursor-pointer"
                  title="Editar dados e perfil do usuário"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Edição</span>
                </button>

                {!isCurrentUser && (
                  <button
                    onClick={() => handleDeleteUser(p.id, p.name)}
                    className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer border border-transparent hover:border-red-500/30"
                    title="Excluir Usuário"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Futurista de Confirmação */}
      {confirmConfig && (
        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          onClose={() => setConfirmConfig(null)}
          onConfirm={confirmConfig.onConfirm}
          title={confirmConfig.title}
          description={confirmConfig.description}
          confirmText={confirmConfig.confirmText}
          variant={confirmConfig.variant || "danger"}
          requireKeyword={confirmConfig.requireKeyword}
          isLoading={busy !== null}
        />
      )}
    </div>
  );
}

interface SubCategory {
  id: string;
  name: string;
  category_id: string;
  user_id?: string | null;
}

function CategoryManager() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<SubCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm: () => void;
    onConfirmWithInput?: (val: string) => void;
    isInputPrompt?: boolean;
    inputLabel?: string;
    inputPlaceholder?: string;
  } | null>(null);
 
   async function load() {
     setLoading(true);
     const [cats, subs] = await Promise.all([
       supabase.from("financial_categories").select("*").order("name"),
       supabase.from("financial_subcategories").select("*").order("name"),
     ]);
     if (!cats.error && cats.data) setCategories(cats.data as Category[]);
     if (!subs.error && subs.data) setSubcategories(subs.data as SubCategory[]);
     setLoading(false);
   }
 
   useEffect(() => {
     load();
   }, []);
 
   async function handleAdd() {
     if (!newName.trim() || !user) return;
     const { error } = await supabase.from("financial_categories").insert({
       name: newName.trim().toUpperCase(),
       type: newType,
       user_id: user.id,
     });
     if (error) {
       toast.error(error.message);
       return;
     }
     toast.success("Categoria adicionada com sucesso!");
     setNewName("");
     load();
   }
 
   function handleDelete(id: string) {
     setConfirmConfig({
       isOpen: true,
       title: "Excluir Categoria",
       description: "Deseja realmente excluir esta categoria? As subcategorias vinculadas a ela também serão removidas.",
       confirmText: "Excluir",
       variant: "danger",
       onConfirm: async () => {
         setConfirmConfig(null);
         const { error } = await supabase.from("financial_categories").delete().eq("id", id);
         if (error) {
           toast.error(error.message);
           return;
         }
         toast.success("Categoria excluída com sucesso!");
         load();
       },
     });
   }
 
   function handleAddSub(categoryId: string) {
     if (!user) return;
     setConfirmConfig({
       isOpen: true,
       title: "Nova Subcategoria",
       description: "Digite o nome da nova subcategoria para adicionar a esta categoria:",
       confirmText: "Adicionar",
       variant: "info",
       isInputPrompt: true,
       inputLabel: "Nome da Subcategoria",
       inputPlaceholder: "Ex: COMBUSTÍVEL, SOFTWARES, ALUGUEL...",
       onConfirmWithInput: async (name: string) => {
         if (!name.trim()) return;
         setConfirmConfig(null);
         const { error } = await supabase.from("financial_subcategories").insert({
           name: name.trim().toUpperCase(),
           category_id: categoryId,
           user_id: user.id,
         });
         if (error) {
           toast.error(error.message);
           return;
         }
         toast.success("Subcategoria adicionada com sucesso!");
         load();
       },
     });
   }
 
   function handleDeleteSub(id: string) {
     setConfirmConfig({
       isOpen: true,
       title: "Excluir Subcategoria",
       description: "Deseja realmente excluir esta subcategoria?",
       confirmText: "Excluir",
       variant: "danger",
       onConfirm: async () => {
         setConfirmConfig(null);
         const { error } = await supabase.from("financial_subcategories").delete().eq("id", id);
         if (error) {
           toast.error(error.message);
           return;
         }
         toast.success("Subcategoria excluída com sucesso!");
         load();
       },
     });
   }
 
   const incomeCategories = categories.filter((c) => c.type === "income");
   const expenseCategories = categories.filter((c) => c.type === "expense");
 
   function renderCategoryList(list: Category[], type: "income" | "expense") {
     if (list.length === 0) {
       return (
         <div className="p-6 text-center opacity-40 uppercase tracking-widest text-[10px]">
           Nenhuma categoria de {type === "income" ? "receita" : "despesa"}
         </div>
       );
     }
 
     return (
       <div className="space-y-2 pr-1">
         {list.map((c) => {
           const subs = subcategories.filter((s) => s.category_id === c.id);
           const isOpen = expandedId === c.id;
           return (
             <div
               key={c.id}
               className="rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all overflow-hidden"
             >
               <div className="flex items-center justify-between p-3 group">
                 <button
                   onClick={() => setExpandedId(isOpen ? null : c.id)}
                   className="flex items-center gap-3 flex-1 text-left cursor-pointer animate-in fade-in"
                 >
                   <div
                     className={`w-1.5 h-6 rounded-full transition-all ${c.type === "income" ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"}`}
                   />
                   <span className="text-xs font-bold uppercase tracking-widest text-white group-hover:text-accent transition-colors">{c.name}</span>
                   {subs.length > 0 && (
                     <span className="text-[9px] font-black opacity-60 px-1.5 py-0.5 rounded bg-white/10">
                       {subs.length}
                     </span>
                   )}
                 </button>
                 <div className="flex items-center gap-1">
                   <button
                     onClick={() => handleAddSub(c.id)}
                     className="p-2 text-muted-foreground hover:text-accent hover:bg-accent/10 rounded-lg transition-all cursor-pointer"
                     title="Nova subcategoria"
                   >
                     <Plus className="h-4 w-4" />
                   </button>
                   <button
                     onClick={() => handleDelete(c.id)}
                     className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                     title="Excluir categoria"
                   >
                     <Trash2 className="h-4 w-4" />
                   </button>
                 </div>
               </div>
 
               {isOpen && (
                 <div className="border-t border-white/5 bg-black/30 p-3 space-y-1 animate-in slide-in-from-top-2 duration-200">
                   {subs.length === 0 ? (
                     <div className="text-[10px] uppercase tracking-widest opacity-40 text-center py-2">
                       Nenhuma subcategoria. Clique no botão "+" ao lado do título para criar.
                     </div>
                   ) : (
                     subs.map((s) => (
                       <div
                         key={s.id}
                         className="flex items-center justify-between pl-6 pr-2 py-2 rounded-lg hover:bg-white/5 group/sub"
                       >
                         <div className="flex items-center gap-2">
                           <div className="w-2 h-px bg-white/20" />
                           <span className="text-[11px] font-bold uppercase tracking-widest opacity-80 text-white/95">
                             {s.name}
                           </span>
                         </div>
                         <button
                           onClick={() => handleDeleteSub(s.id)}
                           className="p-1.5 text-muted-foreground hover:text-red-500 opacity-0 group-hover/sub:opacity-100 transition-all cursor-pointer"
                           title="Excluir subcategoria"
                         >
                           <X className="h-3 w-3" />
                         </button>
                       </div>
                     ))
                   )}
                 </div>
               )}
             </div>
           );
         })}
       </div>
     );
   }
 
   return (
     <div className="glass rounded-3xl p-6 border-2 border-white/5 shadow-xl">
       <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
         <h3 className="text-lg font-black tracking-widest text-gradient flex items-center gap-2 uppercase">
           <FolderTree className="h-5 w-5 text-accent" /> Gestão de Categorias
         </h3>
       </div>
 
       <div className="mb-8 p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
         <div className="flex flex-col lg:flex-row gap-3">
           <input
             value={newName}
             onChange={(e) => setNewName(e.target.value.toUpperCase())}
             onKeyDown={(e) => e.key === "Enter" && handleAdd()}
             placeholder="NOME DA NOVA CATEGORIA"
             className="input-futuristic flex-1 rounded-xl px-4 py-4 text-sm uppercase font-bold bg-black/25 border-2 border-white/10 text-white focus:border-accent"
           />
           <div className="flex gap-2 p-1 rounded-xl bg-black/25 border border-white/10 self-start lg:self-auto w-full lg:w-auto justify-center">
             <button
               onClick={() => setNewType("expense")}
               className={`flex-1 lg:flex-none px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${newType === "expense" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-muted-foreground hover:text-white"}`}
             >
               <TrendingDown className="h-3 w-3 inline mr-1" /> Despesa
             </button>
             <button
               onClick={() => setNewType("income")}
               className={`flex-1 lg:flex-none px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer ${newType === "income" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "text-muted-foreground hover:text-white"}`}
             >
               <TrendingUp className="h-3 w-3 inline mr-1" /> Receita
             </button>
           </div>
           <button
             onClick={handleAdd}
             className="btn-futuristic rounded-xl px-8 py-4 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer shadow-glow-sm"
           >
             <Plus className="h-4 w-4" /> Adicionar Categoria
           </button>
         </div>
         <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black opacity-60">
           * Para criar subcategorias, clique no ícone "+" ao lado do título da categoria correspondente.
         </p>
       </div>
 
       {loading ? (
         <div className="p-12 text-center opacity-50 uppercase tracking-widest text-xs font-bold flex items-center justify-center gap-3">
           <FolderTree className="h-5 w-5 animate-pulse text-accent" /> Carregando categorias...
         </div>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Coluna de Receitas */}
           <div className="space-y-4 bg-white/[0.01] p-4 rounded-2xl border border-white/5">
             <div className="flex items-center justify-between border-b border-green-500/10 pb-3">
               <h4 className="text-xs font-black uppercase tracking-[0.2em] text-green-400 flex items-center gap-2">
                 <TrendingUp className="h-4 w-4" /> Receitas
               </h4>
               <span className="text-[9px] font-black uppercase tracking-wider bg-green-500/15 text-green-400 px-3 py-1 rounded-full border border-green-500/20">
                 {incomeCategories.length} categorias
               </span>
             </div>
             <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
               {renderCategoryList(incomeCategories, "income")}
             </div>
           </div>
 
           {/* Coluna de Despesas */}
           <div className="space-y-4 bg-white/[0.01] p-4 rounded-2xl border border-white/5">
             <div className="flex items-center justify-between border-b border-red-500/10 pb-3">
               <h4 className="text-xs font-black uppercase tracking-[0.2em] text-red-400 flex items-center gap-2">
                 <TrendingDown className="h-4 w-4" /> Despesas
               </h4>
               <span className="text-[9px] font-black uppercase tracking-wider bg-red-500/15 text-red-400 px-3 py-1 rounded-full border border-red-500/20">
                 {expenseCategories.length} categorias
               </span>
             </div>
             <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
               {renderCategoryList(expenseCategories, "expense")}
             </div>
           </div>
         </div>
       )}
 
       {/* Modal Futurista de Confirmação & Criação */}
       {confirmConfig && (
         <ConfirmModal
           isOpen={confirmConfig.isOpen}
           onClose={() => setConfirmConfig(null)}
           onConfirm={confirmConfig.onConfirm}
           onConfirmWithInput={confirmConfig.onConfirmWithInput}
           title={confirmConfig.title}
           description={confirmConfig.description}
           confirmText={confirmConfig.confirmText}
           variant={confirmConfig.variant || "danger"}
           isInputPrompt={confirmConfig.isInputPrompt}
           inputLabel={confirmConfig.inputLabel}
           inputPlaceholder={confirmConfig.inputPlaceholder}
         />
       )}
     </div>
   );
 }
