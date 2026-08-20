import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Clock, Briefcase, Calendar, Users, Percent } from "lucide-react";
import { toast } from "sonner";

interface DealTimeSession {
  id: string;
  deal_id: string;
  user_id: string;
  user_name: string;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number;
  stop_reason?: string;
}

interface Deal {
  id: string;
  title: string;
  notes?: string | null;
  req_number?: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
}

export function WorkHoursManager() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "week" | "month" | "all">("all");
  const [dailyShiftHours, setDailyShiftHours] = useState<number>(8.5);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch crm_deals to extract WORK_LOGs
        const { data: dealsData, error: dealsErr } = await supabase
          .from("crm_deals")
          .select("id, title, notes, req_number");
        if (dealsErr) throw dealsErr;
        setDeals(dealsData || []);

        // Fetch user profiles
        const { data: profilesData, error: profilesErr } = await supabase
          .from("profiles")
          .select("id, email, display_name");
        if (profilesErr) throw profilesErr;
        
        const validProfiles = (profilesData || []).map(p => ({
          id: p.id,
          email: p.email || "",
          display_name: p.display_name || p.email?.split("@")[0] || "Sem nome"
        }));
        setProfiles(validProfiles);
        
        if (validProfiles.length > 0) {
          setSelectedUserId(validProfiles[0].id);
        }
      } catch (err: any) {
        console.error("Erro ao carregar dados de horas de trabalho:", err);
        toast.error("Erro ao carregar dados do relatório");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Parse all work sessions from deals notes
  const allSessions = useMemo(() => {
    const sessions: (DealTimeSession & { dealTitle: string; reqNumber: string })[] = [];
    deals.forEach((deal) => {
      if (!deal.notes) return;
      try {
        const regex = /\[WORK_LOG:(.*?)\]/g;
        let match;
        while ((match = regex.exec(deal.notes)) !== null) {
          if (match[1]) {
            const parsed = JSON.parse(match[1]) as DealTimeSession;
            sessions.push({
              ...parsed,
              dealTitle: deal.title,
              reqNumber: deal.req_number || ""
            });
          }
        }
      } catch (e) {
        console.warn("Erro ao fazer parse de WORK_LOG em deal:", deal.id, e);
      }
    });
    return sessions;
  }, [deals]);

  // Apply filters: User & Date range
  const filteredSessions = useMemo(() => {
    return allSessions.filter((session) => {
      // 1. User filter
      if (selectedUserId && session.user_id !== selectedUserId) {
        return false;
      }

      // 2. Date filter
      const sessionDate = new Date(session.started_at);
      const now = new Date();

      if (dateFilter === "today") {
        return sessionDate.toDateString() === now.toDateString();
      }
      if (dateFilter === "yesterday") {
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        return sessionDate.toDateString() === yesterday.toDateString();
      }
      if (dateFilter === "week") {
        // Simple 7-day range
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return sessionDate >= oneWeekAgo;
      }
      if (dateFilter === "month") {
        // Same month and year
        return (
          sessionDate.getMonth() === now.getMonth() &&
          sessionDate.getFullYear() === now.getFullYear()
        );
      }
      return true; // "all"
    });
  }, [allSessions, selectedUserId, dateFilter]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    let totalActiveSeconds = 0;
    const uniqueDays = new Set<string>();
    const activityMap: Record<string, { title: string; reqNumber: string; seconds: number; sessionsCount: number }> = {};

    filteredSessions.forEach((session) => {
      const duration = session.duration_seconds || 0;
      totalActiveSeconds += duration;

      // Unique days
      const dateKey = new Date(session.started_at).toDateString();
      uniqueDays.add(dateKey);

      // Group by activity
      const dealId = session.deal_id;
      if (!activityMap[dealId]) {
        activityMap[dealId] = {
          title: session.dealTitle,
          reqNumber: session.reqNumber,
          seconds: 0,
          sessionsCount: 0
        };
      }
      activityMap[dealId].seconds += duration;
      activityMap[dealId].sessionsCount += 1;
    });

    const daysWorked = uniqueDays.size;
    const expectedWorkSeconds = daysWorked * dailyShiftHours * 3600;
    const activeHours = totalActiveSeconds / 3600;
    
    // Inactive seconds is expected shift time minus active time
    const inactiveSeconds = Math.max(0, expectedWorkSeconds - totalActiveSeconds);
    const inactiveHours = inactiveSeconds / 3600;

    const efficiency = expectedWorkSeconds > 0
      ? Math.min(100, Math.round((totalActiveSeconds / expectedWorkSeconds) * 100))
      : 0;

    const activities = Object.entries(activityMap).map(([id, info]) => ({
      id,
      ...info,
      hours: info.seconds / 3600
    })).sort((a, b) => b.seconds - a.seconds);

    return {
      daysWorked,
      totalActiveSeconds,
      inactiveSeconds,
      efficiency,
      activeHours,
      inactiveHours,
      activities
    };
  }, [filteredSessions, dailyShiftHours]);

  const formatSeconds = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const chartData = useMemo(() => {
    return [
      { name: "Tempo Ativo", value: Math.round(metrics.activeHours * 10) / 10, color: "#34d399" },
      { name: "Tempo Inativo", value: Math.round(metrics.inactiveHours * 10) / 10, color: "#475569" }
    ];
  }, [metrics]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground uppercase tracking-widest text-xs">
        Carregando relação de horas de trabalho...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 min-h-0 bg-slate-950/20 rounded-2xl border border-white/5 overflow-y-auto custom-scrollbar">
      
      {/* Controles do Relatório */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-black/40 border border-white/5">
        
        {/* Filtro de Usuário */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            Usuário
          </label>
          <div className="relative">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="input-futuristic w-full rounded-xl px-3 py-2 text-xs bg-slate-900 border border-white/10 outline-none cursor-pointer"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-955 text-white">
                  {p.display_name} ({p.email})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtro de Data */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            Período
          </label>
          <select
            value={dateFilter}
            onChange={(e: any) => setDateFilter(e.target.value)}
            className="input-futuristic w-full rounded-xl px-3 py-2 text-xs bg-slate-900 border border-white/10 outline-none cursor-pointer"
          >
            <option value="today" className="bg-slate-955 text-white">Hoje</option>
            <option value="yesterday" className="bg-slate-955 text-white">Ontem</option>
            <option value="week" className="bg-slate-955 text-white">Últimos 7 dias</option>
            <option value="month" className="bg-slate-955 text-white">Este Mês</option>
            <option value="all" className="bg-slate-955 text-white">Todo o Período</option>
          </select>
        </div>

        {/* Carga Horária Esperada */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            Carga Horária Diária (Horas)
          </label>
          <input
            type="number"
            step="0.5"
            min="1"
            max="24"
            value={dailyShiftHours}
            onChange={(e) => setDailyShiftHours(parseFloat(e.target.value) || 8.5)}
            className="input-futuristic w-full rounded-xl px-3 py-1.5 text-xs bg-slate-900 border border-white/10 outline-none"
          />
        </div>

        {/* Informações Auxiliares */}
        <div className="flex items-end justify-end">
          <div className="text-right text-[10px] text-muted-foreground/60 italic">
            * Carga total calculada multiplicando os dias trabalhados no período pelas horas diárias definidas.
          </div>
        </div>

      </div>

      {/* Cards de Indicadores Rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
        
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
              Dias Trabalhados
            </span>
            <span className="text-xl font-bold text-sky-400">
              {metrics.daysWorked} {metrics.daysWorked === 1 ? "dia" : "dias"}
            </span>
          </div>
          <Calendar className="h-6 w-6 text-sky-500/40" />
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
              Tempo Ativo
            </span>
            <span className="text-xl font-bold text-emerald-400">
              {formatSeconds(metrics.totalActiveSeconds)}
            </span>
          </div>
          <Clock className="h-6 w-6 text-emerald-500/40" />
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
              Tempo Inativo
            </span>
            <span className="text-xl font-bold text-slate-400">
              {formatSeconds(metrics.inactiveSeconds)}
            </span>
          </div>
          <Clock className="h-6 w-6 text-slate-500/40" />
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
              Aproveitamento
            </span>
            <span className="text-xl font-bold text-indigo-400">
              {metrics.efficiency}%
            </span>
          </div>
          <Percent className="h-6 w-6 text-indigo-500/40" />
        </div>

      </div>

      {/* Gráfico e Breakdown de Atividades */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        
        {/* Painel Esquerdo: Gráfico de Pizza */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between min-h-[350px]">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">
              Gráfico de Horas de Trabalho
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Proporção de horas ativas e inativas (com base nos dias com registros)
            </p>
          </div>

          <div className="flex-1 h-[220px] flex items-center justify-center">
            {metrics.totalActiveSeconds === 0 && metrics.inactiveSeconds === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum registro de horas no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-hours-${index}`} fill={entry.color} />
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
                    }}
                    formatter={(value: any, name: any) => [
                      `${value}h`,
                      name,
                    ]}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value) => <span className="text-[10px] font-bold text-slate-400 uppercase">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Painel Direito: Lista de Atividades */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex flex-col min-h-[350px] overflow-hidden">
          <div className="mb-3 shrink-0">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">
              Breakdown por Atividades
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Relação de atividades trabalhadas pelo usuário no período
            </p>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2">
            {metrics.activities.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                Nenhuma atividade trabalhada no período.
              </div>
            ) : (
              metrics.activities.map((act) => (
                <div
                  key={act.id}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Briefcase className="h-4 w-4 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {act.title}
                      </p>
                      <p className="text-[9px] font-mono text-muted-foreground uppercase">
                        {act.reqNumber ? `Nº ${act.reqNumber}` : "Sem número"} • {act.sessionsCount} {act.sessionsCount === 1 ? "sessão" : "sessões"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-emerald-400 font-mono">
                      {formatSeconds(act.seconds)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
