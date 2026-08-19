import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  PieChart as PieIcon,
  ChevronLeft,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Building2,
  Calendar,
  Paperclip,
  TrendingUp,
  Sparkles,
  ArrowRight,
  UserCheck,
  Bell,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

interface Deal {
  id: string;
  title: string;
  stage: "lead" | "qualification" | "negotiation" | "won" | "lost" | string;
  customer_id?: string | null;
  customer_name?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  expected_close_date?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  req_number?: string;
  creator_name?: string;
  quote_file_url?: string | null;
  quote_file_name?: string | null;
}

const STAGES_CONFIG: Record<
  string,
  { title: string; color: string; hoverColor: string; bg: string; border: string; glow: string }
> = {
  lead: {
    title: "TAREFAS",
    color: "#38bdf8", // Sky blue
    hoverColor: "#0284c7",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    glow: "shadow-[0_0_20px_rgba(56,189,248,0.25)]",
  },
  qualification: {
    title: "ORÇAMENTOS",
    color: "#818cf8", // Indigo
    hoverColor: "#4f46e5",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    glow: "shadow-[0_0_20px_rgba(129,140,248,0.25)]",
  },
  negotiation: {
    title: "NEGOCIAÇÕES",
    color: "#fbbf24", // Amber
    hoverColor: "#d97706",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    glow: "shadow-[0_0_20px_rgba(251,191,36,0.25)]",
  },
  won: {
    title: "CONTRATOS",
    color: "#34d399", // Emerald
    hoverColor: "#059669",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    glow: "shadow-[0_0_20px_rgba(52,211,153,0.25)]",
  },
  lost: {
    title: "PERDIDOS",
    color: "#f87171", // Rose / Red
    hoverColor: "#dc2626",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    glow: "shadow-[0_0_20px_rgba(248,113,113,0.25)]",
  },
  completed: {
    title: "CONCLUÍDAS",
    color: "#c084fc", // Purple / Violet
    hoverColor: "#9333ea",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    glow: "shadow-[0_0_20px_rgba(192,132,252,0.25)]",
  },
};

const USER_PALETTE = [
  "#38bdf8", // Sky
  "#818cf8", // Indigo
  "#34d399", // Emerald
  "#fbbf24", // Amber
  "#f472b6", // Pink
  "#a78bfa", // Purple
  "#2dd4bf", // Teal
  "#fb923c", // Orange
  "#60a5fa", // Blue
  "#e879f9", // Fuchsia
];

export function CrmAnalytics() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [returnedHistoryList, setReturnedHistoryList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState<string>("ALL");
  const [isAlertsExpanded, setIsAlertsExpanded] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [dealsRes, custRes, profRes, histRes] = await Promise.all([
        supabase.from("crm_deals").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name, company_name"),
        supabase.from("profiles").select("id, display_name, email"),
        supabase.from("crm_deal_history").select("*").eq("action_type", "returned_to_creator"),
      ]);

      if (dealsRes.error) throw dealsRes.error;

      const custMap = new Map((custRes.data || []).map((c) => [c.id, c.company_name || c.name]));
      const profMap = new Map((profRes.data || []).map((p) => [p.id, p.display_name || p.email]));

      const enrichedDeals: Deal[] = (dealsRes.data || []).map((d: any) => ({
        ...d,
        customer_name: custMap.get(d.customer_id) || d.customer_name || "Cliente não vinculado",
        assigned_user_name: profMap.get(d.assigned_user_id) || "Sem responsável",
        creator_name: profMap.get(d.user_id) || "Usuário",
      }));

      setDeals(enrichedDeals);
      setCustomers(custRes.data || []);
      setProfiles(profRes.data || []);
      if (histRes.data) setReturnedHistoryList(histRes.data);
    } catch (err: any) {
      console.error("Erro ao carregar dados analíticos:", err);
      toast.error("Erro ao carregar dados do CRM");
    } finally {
      setLoading(false);
    }
  }

  // Alertas de Prazos Ultrapassados
  const overdueAlerts = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return deals.filter((d) => {
      if (!d.expected_close_date || d.stage === "won" || d.stage === "lost" || d.stage === "archived" || d.stage === "completed") {
        return false;
      }
      const deadDate = new Date(d.expected_close_date + "T00:00:00");
      const diffDays = Math.ceil((deadDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays < 0;
    });
  }, [deals]);

  // Alertas de Devolução ao Criador
  const returnedAlerts = useMemo(() => {
    const returnedDealIds = new Set(returnedHistoryList.map((h) => h.deal_id));
    return deals.filter(
      (d) =>
        (returnedDealIds.has(d.id) ||
          (d.user_id && d.assigned_user_id === d.user_id && d.notes?.includes("[DEVOLVIDA]"))) &&
        d.stage !== "won" &&
        d.stage !== "lost" &&
        d.stage !== "archived" &&
        d.stage !== "completed"
    );
  }, [deals, returnedHistoryList]);

  const totalAdminAlerts = overdueAlerts.length + returnedAlerts.length;

  // Deals filtrados por usuário se selecionado
  const filteredDeals = useMemo(() => {
    if (filterUser === "ALL") return deals;
    if (filterUser === "unassigned") return deals.filter((d) => !d.assigned_user_id);
    return deals.filter((d) => d.assigned_user_id === filterUser);
  }, [deals, filterUser]);

  // Dados do Gráfico de Pizza Geral por Colunas (Etapas)
  const stageChartData = useMemo(() => {
    const counts: Record<string, number> = {
      lead: 0,
      qualification: 0,
      negotiation: 0,
      won: 0,
      lost: 0,
    };

    filteredDeals.forEach((deal) => {
      if (counts[deal.stage] !== undefined) {
        counts[deal.stage]++;
      } else {
        counts[deal.stage] = (counts[deal.stage] || 0) + 1;
      }
    });

    return Object.entries(counts).map(([stageKey, count]) => {
      const cfg = STAGES_CONFIG[stageKey] || {
        title: stageKey.toUpperCase(),
        color: "#94a3b8",
        hoverColor: "#64748b",
        bg: "bg-slate-500/10",
        border: "border-slate-500/30",
        glow: "",
      };
      return {
        stageId: stageKey,
        name: cfg.title,
        value: count,
        color: cfg.color,
      };
    });
  }, [filteredDeals]);

  // Atividades da coluna selecionada no Drill-down
  const currentStageDeals = useMemo(() => {
    if (!selectedStageId) return [];
    return filteredDeals.filter((d) => d.stage === selectedStageId);
  }, [filteredDeals, selectedStageId]);

  // Dados do Gráfico de Pizza da Coluna por Responsável
  const userStageChartData = useMemo(() => {
    if (!selectedStageId) return [];
    const counts: Record<string, { count: number; name: string }> = {};

    currentStageDeals.forEach((deal) => {
      const key = deal.assigned_user_id || "unassigned";
      const name = deal.assigned_user_name || "Sem Responsável";
      if (!counts[key]) {
        counts[key] = { count: 0, name };
      }
      counts[key].count++;
    });

    return Object.entries(counts).map(([userId, data], idx) => ({
      userId,
      name: data.name,
      value: data.count,
      color: USER_PALETTE[idx % USER_PALETTE.length],
    }));
  }, [currentStageDeals, selectedStageId]);

  // Dados de Prazos da Coluna Selecionada
  const deadlineDistributionData = useMemo(() => {
    if (!selectedStageId) return [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let expired = 0;
    let today = 0;
    let oneDay = 0;
    let twoDays = 0;
    let threeDays = 0;
    let ok = 0;
    let noDeadline = 0;

    currentStageDeals.forEach((deal) => {
      if (!deal.expected_close_date) {
        noDeadline++;
        return;
      }
      const deadDate = new Date(deal.expected_close_date + "T00:00:00");
      const diffDays = Math.ceil((deadDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) expired++;
      else if (diffDays === 0) today++;
      else if (diffDays === 1) oneDay++;
      else if (diffDays === 2) twoDays++;
      else if (diffDays === 3) threeDays++;
      else ok++;
    });

    return [
      { name: "Vencido", count: expired, color: "#ef4444" },
      { name: "Hoje", count: today, color: "#f43f5e" },
      { name: "1 Dia", count: oneDay, color: "#fb7185" },
      { name: "2 Dias", count: twoDays, color: "#fbbf24" },
      { name: "3 Dias", count: threeDays, color: "#34d399" },
      { name: "> 3 Dias", count: ok, color: "#38bdf8" },
      { name: "Sem Prazo", count: noDeadline, color: "#94a3b8" },
    ].filter((item) => item.count > 0);
  }, [currentStageDeals, selectedStageId]);

  const totalDealsCount = filteredDeals.length;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground uppercase tracking-widest text-xs">
        Carregando gráficos e indicadores do CRM...
      </div>
    );
  }

  return (
    <div className="h-full flex-1 flex flex-col justify-between gap-3 min-h-0">
      {/* Cards de Métricas Rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 shrink-0">
        {Object.entries(STAGES_CONFIG).map(([stageKey, cfg]) => {
          const count = filteredDeals.filter((d) => d.stage === stageKey).length;
          const pct = totalDealsCount > 0 ? Math.round((count / totalDealsCount) * 100) : 0;
          const isSelected = selectedStageId === stageKey;

          return (
            <button
              key={stageKey}
              type="button"
              onClick={() => setSelectedStageId(isSelected ? null : stageKey)}
              className={`p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? `ring-2 ring-sky-400 border-sky-400 bg-sky-950/40 shadow-[0_0_25px_rgba(56,189,248,0.3)]`
                  : `${cfg.bg} ${cfg.border} hover:border-white/30 hover:scale-[1.02]`
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: cfg.color }}
                >
                  {cfg.title}
                </span>
                <span className="text-[9px] font-mono font-bold text-muted-foreground px-1.5 py-0.5 rounded bg-black/40 border border-white/5">
                  {pct}%
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-black font-mono text-white">{count}</span>
                <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground/70">
                  {isSelected ? "● Selecionado" : "Clique p/ ver"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* CASO A: DRILL-DOWN EXPANDIDO DA COLUNA SELECIONADA                       */}
      {/* ========================================================================= */}
      {selectedStageId ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Header da Coluna Selecionada */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-950 to-black border border-white/15 shadow-xl">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedStageId(null)}
                className="btn-ghost-neon p-2 rounded-xl text-muted-foreground hover:text-white cursor-pointer flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                title="Voltar ao gráfico geral"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Voltar ao Geral</span>
              </button>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: STAGES_CONFIG[selectedStageId]?.color }}
                  />
                  <h3
                    className="text-base font-black uppercase tracking-wider"
                    style={{ color: STAGES_CONFIG[selectedStageId]?.color }}
                  >
                    {STAGES_CONFIG[selectedStageId]?.title || selectedStageId}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {currentStageDeals.length}{" "}
                  {currentStageDeals.length === 1 ? "atividade encontrada" : "atividades encontradas"}{" "}
                  nesta etapa
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white px-3 py-1 rounded-xl bg-white/5 border border-white/10 font-mono">
                Total: {currentStageDeals.length}
              </span>
            </div>
          </div>

          {/* Gráficos Harmônicos Lado a Lado */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 1. Gráfico de Pizza: Distribuição por Responsável */}
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-xl flex flex-col justify-between min-h-[360px]">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-sky-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">
                    Distribuição por Responsável
                  </h4>
                </div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">
                  {userStageChartData.length} Responsáveis
                </span>
              </div>

              {userStageChartData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs uppercase font-bold text-muted-foreground/50">
                  Nenhuma atividade com responsável
                </div>
              ) : (
                <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                  <div className="w-full sm:w-1/2 h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={userStageChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                        >
                          {userStageChartData.map((entry, index) => (
                            <Cell key={`cell-user-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#020617",
                            borderColor: "rgba(255,255,255,0.15)",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            color: "#fff",
                            textTransform: "uppercase",
                          }}
                          formatter={(value: any, name: any) => [
                            `${value} atividades (${Math.round(
                              ((Number(value) || 0) / currentStageDeals.length) * 100
                            )}%)`,
                            name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legenda Lateral */}
                  <div className="w-full sm:w-1/2 space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                    {userStageChartData.map((item) => (
                      <div
                        key={item.userId}
                        className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-bold text-white truncate">{item.name}</span>
                        </div>
                        <span className="font-mono font-black text-sky-300 shrink-0">
                          {item.value} ({Math.round((item.value / currentStageDeals.length) * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Gráfico de Barras: Distribuição de Prazos */}
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-xl flex flex-col justify-between min-h-[360px]">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">
                    Status de Prazos de Entrega
                  </h4>
                </div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">
                  Controle Temporal
                </span>
              </div>

              {deadlineDistributionData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs uppercase font-bold text-muted-foreground/50">
                  Nenhuma atividade com prazo cadastrado
                </div>
              ) : (
                <div className="flex-1 h-[240px] pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deadlineDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="name"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                      />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderColor: "rgba(255,255,255,0.15)",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: "bold",
                          color: "#fff",
                        }}
                        formatter={(value: any) => [`${value} atividades`, "Quantidade"]}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {deadlineDistributionData.map((entry, index) => (
                          <Cell key={`bar-cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* 3. Lista Detalhada das Atividades daquela Coluna */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Lista de Atividades em "{STAGES_CONFIG[selectedStageId]?.title || selectedStageId}"
                </h4>
              </div>
              <span className="text-[10px] text-muted-foreground uppercase font-bold">
                {currentStageDeals.length} Registros
              </span>
            </div>

            {currentStageDeals.length === 0 ? (
              <div className="p-8 text-center text-xs uppercase font-bold text-muted-foreground/50">
                Nenhuma atividade nesta coluna
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                {currentStageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="p-3.5 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between gap-2 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs text-white block truncate uppercase">
                          {deal.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-sky-300 font-semibold truncate">
                          <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{deal.customer_name}</span>
                        </div>
                      </div>
                      {deal.quote_file_url && (
                        <span
                          title="Orçamento Oficial Anexado"
                          className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono font-black flex items-center gap-1 shrink-0"
                        >
                          <Paperclip className="h-2.5 w-2.5" /> DOC
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px]">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <UserCheck className="h-3 w-3 text-sky-400 shrink-0" />
                        <span className="font-bold text-slate-200 truncate max-w-[130px]">
                          {deal.assigned_user_name}
                        </span>
                      </div>

                      {deal.expected_close_date ? (
                        <div className="flex items-center gap-1 text-emerald-400 font-mono font-bold">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>{deal.expected_close_date.split("-").reverse().join("/")}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60 font-mono">Sem prazo</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* CASO B: VISÃO GERAL - GRÁFICO DE PIZZA PRINCIPAL DAS COLUNAS               */
        /* ========================================================================= */
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-3.5 pb-1">
          {/* Gráfico Donut de Pizza Principal */}
          <div className="lg:col-span-2 p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-xl flex flex-col justify-between h-full min-h-0">
            <div className="flex flex-wrap items-center justify-between pb-2.5 border-b border-white/10 gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  Distribuição de Atividades por Coluna
                </h3>
              </div>

              {/* Filtro por Responsável posicionado acima das atividades da pizza */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hidden sm:inline">
                  Filtrar Responsável:
                </span>
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="input-futuristic rounded-xl px-3 py-1 text-xs outline-none bg-black text-white font-bold border border-white/15 cursor-pointer max-w-[210px]"
                >
                  <option value="ALL">Todos os Responsáveis ({deals.length})</option>
                  <option value="unassigned">Sem Responsável</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900">
                      {p.display_name || p.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {totalDealsCount === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs uppercase font-bold text-muted-foreground/50">
                Nenhuma atividade registrada no CRM
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col md:flex-row items-center justify-center gap-6 py-2">
                <div className="w-full md:w-3/5 h-full min-h-[280px] sm:min-h-[340px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stageChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={125}
                        paddingAngle={4}
                        onClick={(entry) => {
                          if (entry && entry.stageId) {
                            setSelectedStageId(entry.stageId);
                          }
                        }}
                        className="cursor-pointer outline-none"
                      >
                        {stageChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            className="transition-all hover:opacity-80 hover:scale-105 cursor-pointer"
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          borderColor: "rgba(255,255,255,0.15)",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: "bold",
                          color: "#fff",
                          textTransform: "uppercase",
                        }}
                        formatter={(value: any, name: any) => [
                          `${value} atividades (${Math.round(((Number(value) || 0) / totalDealsCount) * 100)}%)`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legenda Interativa com Botão de Ação */}
                <div className="w-full md:w-2/5 space-y-1.5 shrink-0">
                  {stageChartData.map((item) => (
                    <button
                      key={item.stageId}
                      type="button"
                      onClick={() => setSelectedStageId(item.stageId)}
                      className="w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/20 transition-all text-xs cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-bold text-white uppercase group-hover:text-sky-300 transition-colors">
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-slate-200">
                          {item.value} ({totalDealsCount > 0 ? Math.round((item.value / totalDealsCount) * 100) : 0}%)
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-[10px] text-muted-foreground/70 text-center pt-2 border-t border-white/5 shrink-0">
              * Dica: Clique em qualquer fatia da pizza ou item da legenda para abrir a análise aprofundada da coluna.
            </div>
          </div>

          {/* Painel Lateral: Resumo de Conversão e Saúde do Funil */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-xl flex flex-col justify-between h-full min-h-0">
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2.5 border-b border-white/10">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  Saúde e Conversão
                </h3>
              </div>

              <div className="space-y-2.5">
                {/* Taxa de Conversão */}
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider block">
                    Taxa de Contratação
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl sm:text-2xl font-black font-mono text-emerald-300">
                      {totalDealsCount > 0
                        ? Math.round(
                            ((filteredDeals.filter((d) => d.stage === "won").length) / totalDealsCount) * 100
                          )
                        : 0}
                      %
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {filteredDeals.filter((d) => d.stage === "won").length} contratados
                    </span>
                  </div>
                </div>

                {/* Em Negociação / Andamento */}
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <span className="text-[10px] font-bold uppercase text-amber-400 tracking-wider block">
                    Em Andamento / Negociação
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl sm:text-2xl font-black font-mono text-amber-300">
                      {filteredDeals.filter((d) => d.stage === "negotiation").length}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {totalDealsCount > 0
                        ? Math.round(
                            ((filteredDeals.filter((d) => d.stage === "negotiation").length) / totalDealsCount) * 100
                          )
                        : 0}
                      % da base
                    </span>
                  </div>
                </div>

                {/* Tarefas e Orçamentos Abertos */}
                <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
                  <span className="text-[10px] font-bold uppercase text-sky-400 tracking-wider block">
                    Orçamentos & Tarefas em Aberto
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl sm:text-2xl font-black font-mono text-sky-300">
                      {filteredDeals.filter((d) => d.stage === "lead" || d.stage === "qualification").length}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Entrada no funil
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-muted-foreground">
              Total de {deals.length} atividades cadastradas no sistema.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
