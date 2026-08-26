import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Clock, Briefcase, Calendar, Users, Percent, Hourglass, ArrowLeft, ArrowRight, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getWorkdayProgress } from "@/lib/work-schedule";

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
  created_at?: string;
}

function getDealReqNumber(deal: Deal, allDeals?: Deal[]): string {
  if (deal.req_number && deal.req_number.trim()) {
    return deal.req_number.trim().replace(/\//g, ".");
  }

  const d = new Date(deal.created_at || Date.now());
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `${yy}.${mm}`;

  if (!allDeals || allDeals.length === 0) {
    return `${prefix}.01`;
  }

  const sameMonthDeals = allDeals
    .filter((other) => {
      const otherDate = new Date(other.created_at || Date.now());
      const otherYY = String(otherDate.getFullYear()).slice(-2);
      const otherMM = String(otherDate.getMonth() + 1).padStart(2, "0");
      return `${otherYY}.${otherMM}` === prefix;
    })
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  const index = sameMonthDeals.findIndex((other) => other.id === deal.id);
  const seq = index >= 0 ? index + 1 : sameMonthDeals.length + 1;
  return `${prefix}.${String(seq).padStart(2, "0")}`;
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
}

export interface WorkHoursManagerProps {
  initialUserId?: string;
}

export function WorkHoursManager({ initialUserId }: WorkHoursManagerProps = {}) {
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId || "");
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "week" | "month" | "all">("today");
  const [isExpandedActive, setIsExpandedActive] = useState(false);
  const [highlightedActivityId, setHighlightedActivityId] = useState<string | null>(null);
  const [hoveredSlice, setHoveredSlice] = useState<any>(null);
  const [tooltipCorner, setTooltipCorner] = useState<"top-left" | "top-right" | "bottom-left" | "bottom-right">("bottom-right");

  const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const midX = rect.width / 2;
    const midY = rect.height / 2;

    if (relX < midX && relY < midY) {
      setTooltipCorner("top-left");
    } else if (relX >= midX && relY < midY) {
      setTooltipCorner("top-right");
    } else if (relX < midX && relY >= midY) {
      setTooltipCorner("bottom-left");
    } else {
      setTooltipCorner("bottom-right");
    }
  };

  const handleOpenActivityCard = (dealId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!dealId) return;
    sessionStorage.setItem("mykaflow_open_deal_id", dealId);
    navigate({ to: "/crm", search: { dealId } as any });
  };
  
  // Expediente padrão: 8h na Sexta e 9h de Segunda a Quinta (conforme horário de funcionamento)
  const defaultShift = new Date().getDay() === 5 ? 8.0 : 9.0;
  const [dailyShiftHours, setDailyShiftHours] = useState<number>(defaultShift);

  // Ticker de 1 segundo para atualizar sessões ativas em tempo real
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (initialUserId !== undefined) {
      setSelectedUserId(initialUserId);
    }
  }, [initialUserId]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch crm_deals to extract WORK_LOGs e WORK_ACTIVEs
        const { data: dealsData, error: dealsErr } = await supabase
          .from("crm_deals")
          .select("*");
        if (dealsErr) throw dealsErr;
        setDeals(dealsData || []);

        // Fetch user profiles
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, email, display_name");
        
        const profileMap = new Map<string, UserProfile>();
        (profilesData || []).forEach(p => {
          profileMap.set(p.id, {
            id: p.id,
            email: p.email || "",
            display_name: p.display_name || p.email?.split("@")[0] || "Sem nome"
          });
        });

        // Also check if any WORK_LOG or WORK_ACTIVE in crm_deals has users not yet in profiles
        (dealsData || []).forEach(d => {
          if (!d.notes) return;
          const regex = /\[WORK_LOG:(.*?)\]/g;
          let match;
          while ((match = regex.exec(d.notes)) !== null) {
            try {
              if (match[1]) {
                const parsed = JSON.parse(match[1]);
                if (parsed.user_id && !profileMap.has(parsed.user_id)) {
                  profileMap.set(parsed.user_id, {
                    id: parsed.user_id,
                    email: "",
                    display_name: parsed.user_name || "Usuário"
                  });
                }
              }
            } catch (e) {}
          }

          if (d.notes.includes("[WORK_ACTIVE:")) {
            try {
              const activeMatch = d.notes.match(/\[WORK_ACTIVE:(.*?)\]/);
              if (activeMatch && activeMatch[1]) {
                const parsed = JSON.parse(activeMatch[1]);
                if (parsed.userId && !profileMap.has(parsed.userId)) {
                  profileMap.set(parsed.userId, {
                    id: parsed.userId,
                    email: "",
                    display_name: parsed.userName || "Usuário"
                  });
                }
              }
            } catch (e) {}
          }
        });

        const validProfiles = Array.from(profileMap.values());
        setProfiles(validProfiles);
      } catch (err: any) {
        console.error("Erro ao carregar dados de horas de trabalho:", err);
        toast.error("Erro ao carregar dados do relatório");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Parse all work sessions from deals notes (concluídas e em andamento)
  const allSessions = useMemo(() => {
    const sessions: (DealTimeSession & { dealTitle: string; reqNumber: string; isActive?: boolean })[] = [];
    deals.forEach((deal) => {
      if (!deal.notes) return;
      const dealReqNum = getDealReqNumber(deal, deals);

      // 1. Sessões Concluídas (WORK_LOG)
      try {
        const regex = /\[WORK_LOG:(.*?)\]/g;
        let match;
        while ((match = regex.exec(deal.notes)) !== null) {
          if (match[1]) {
            const parsed = JSON.parse(match[1]) as DealTimeSession;
            sessions.push({
              ...parsed,
              dealTitle: deal.title,
              reqNumber: dealReqNum,
              isActive: false,
            });
          }
        }
      } catch (e) {
        console.warn("Erro ao fazer parse de WORK_LOG em deal:", deal.id, e);
      }

      // 2. Sessões Ativas em Andamento (WORK_ACTIVE)
      try {
        if (deal.notes.includes("[WORK_ACTIVE:")) {
          const activeMatch = deal.notes.match(/\[WORK_ACTIVE:(.*?)\]/);
          if (activeMatch && activeMatch[1]) {
            const parsed = JSON.parse(activeMatch[1]);
            if (parsed.startedAt && parsed.userId) {
              const startMs = new Date(parsed.startedAt).getTime();
              const elapsedSec = Math.max(0, Math.floor((currentTime - startMs) / 1000));
              sessions.push({
                id: `active-${deal.id}`,
                deal_id: deal.id,
                user_id: parsed.userId,
                user_name: parsed.userName || "Usuário",
                started_at: parsed.startedAt,
                ended_at: null,
                duration_seconds: elapsedSec,
                dealTitle: deal.title,
                reqNumber: dealReqNum,
                isActive: true,
              });
            }
          }
        }
      } catch (e) {
        console.warn("Erro ao fazer parse de WORK_ACTIVE em deal:", deal.id, e);
      }
    });
    return sessions;
  }, [deals, currentTime]);

  // Apply filters: User & Date range
  const filteredSessions = useMemo(() => {
    return allSessions.filter((session) => {
      // 1. User filter
      if (selectedUserId && session.user_id !== selectedUserId) {
        return false;
      }

      // 2. Date filter
      const sessionDate = new Date(session.started_at);
      const now = new Date(currentTime);

      if (dateFilter === "today") {
        return sessionDate.toDateString() === now.toDateString();
      }
      if (dateFilter === "yesterday") {
        const yesterday = new Date(currentTime);
        yesterday.setDate(now.getDate() - 1);
        return sessionDate.toDateString() === yesterday.toDateString();
      }
      if (dateFilter === "week") {
        // Simple 7-day range
        const oneWeekAgo = new Date(currentTime);
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
  }, [allSessions, selectedUserId, dateFilter, currentTime]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    let totalActiveSeconds = 0;
    const uniqueDays = new Set<string>();
    const activityMap: Record<
      string,
      { title: string; reqNumber: string; seconds: number; sessionsCount: number; hasActiveSession: boolean }
    > = {};

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
          sessionsCount: 0,
          hasActiveSession: false,
        };
      }
      activityMap[dealId].seconds += duration;
      activityMap[dealId].sessionsCount += 1;
      if (session.isActive) {
        activityMap[dealId].hasActiveSession = true;
      }
    });

    const effectiveDays = new Set(uniqueDays);
    if (dateFilter === "today" && effectiveDays.size === 0) {
      effectiveDays.add(new Date(currentTime).toDateString());
    }

    // Calcula dia a dia: horas esperadas de turno, horas já decorridas do expediente até agora, e horas restantes
    let autoExpectedSeconds = 0;
    let elapsedWorkdaySeconds = 0;
    let remainingShiftSeconds = 0;

    const todayStr = new Date(currentTime).toDateString();
    const todayProgress = getWorkdayProgress(new Date(currentTime));

    effectiveDays.forEach((dateStr) => {
      const d = new Date(dateStr);
      const dayOfWeek = d.getDay(); // 0 = Dom, 1 = Seg, ..., 5 = Sex, 6 = Sáb
      const isFriday = dayOfWeek === 5;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dailyBaseSeconds = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;

      autoExpectedSeconds += dailyBaseSeconds;

      if (dateStr === todayStr) {
        // Para o dia de hoje: considera o expediente transcorrido até o momento atual
        elapsedWorkdaySeconds += todayProgress.elapsedWorkdaySeconds;
        remainingShiftSeconds += todayProgress.remainingShiftSeconds;
      } else {
        // Para dias passados já encerrados: todo o expediente já transcorreu
        elapsedWorkdaySeconds += dailyBaseSeconds;
      }
    });

    const defaultShiftToday = new Date(currentTime).getDay() === 5 ? 8.0 : 9.0;
    const isCustomShift = Math.abs(dailyShiftHours - defaultShiftToday) > 0.01;
    const expectedWorkSeconds = isCustomShift && effectiveDays.size > 0
      ? effectiveDays.size * dailyShiftHours * 3600
      : (autoExpectedSeconds > 0 ? autoExpectedSeconds : effectiveDays.size * dailyShiftHours * 3600);

    const daysWorked = effectiveDays.size;
    const activeHours = totalActiveSeconds / 3600;
    const expectedHours = expectedWorkSeconds / 3600;
    
    // Tempo Inativo é o tempo de expediente JÁ TRANSCORRIDO até agora menos o tempo trabalhado
    const inactiveSeconds = Math.max(0, elapsedWorkdaySeconds - totalActiveSeconds);
    const inactiveHours = inactiveSeconds / 3600;

    // Tempo Restante da jornada
    const remainingSeconds = Math.max(0, expectedWorkSeconds - totalActiveSeconds - inactiveSeconds);
    const remainingHours = remainingSeconds / 3600;

    // Taxa de aproveitamento sobre o tempo de expediente decorrido até agora
    const efficiency = elapsedWorkdaySeconds > 0
      ? Math.min(100, Math.round((totalActiveSeconds / elapsedWorkdaySeconds) * 100))
      : totalActiveSeconds > 0 ? 100 : 0;

    const activities = Object.entries(activityMap).map(([id, info]) => ({
      id,
      ...info,
      hours: info.seconds / 3600
    })).sort((a, b) => b.seconds - a.seconds);

    return {
      daysWorked,
      totalActiveSeconds,
      inactiveSeconds,
      remainingSeconds,
      expectedWorkSeconds,
      expectedHours,
      efficiency,
      activeHours,
      inactiveHours,
      remainingHours,
      activities
    };
  }, [filteredSessions, dailyShiftHours, dateFilter, currentTime]);

  const formatSeconds = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const chartData = useMemo(() => {
    const activeH = Math.round((metrics.totalActiveSeconds / 3600) * 100) / 100;
    const inactiveH = Math.round((metrics.inactiveSeconds / 3600) * 100) / 100;
    const remainingH = Math.round((metrics.remainingSeconds / 3600) * 100) / 100;

    const list: any[] = [
      { 
        name: "Tempo Ativo", 
        value: activeH, 
        rawSeconds: metrics.totalActiveSeconds,
        color: "#10b981", 
        isRemaining: false,
        description: "Horas trabalhadas em atividades" 
      },
      { 
        name: "Tempo Inativo", 
        value: inactiveH, 
        rawSeconds: metrics.inactiveSeconds,
        color: "#ef4444", 
        isRemaining: false,
        description: "Expediente decorrido sem produção ativa" 
      },
    ];

    if (metrics.remainingSeconds > 0) {
      list.push({
        name: "Tempo Restante",
        value: remainingH,
        rawSeconds: metrics.remainingSeconds,
        color: "#64748b", 
        isRemaining: true,
        description: "Jornada restante do expediente (não trabalhado)"
      });
    }

    return list;
  }, [metrics]);

  const ACTIVITY_PALETTE = [
    "#10b981", // Emerald
    "#06b6d4", // Cyan
    "#3b82f6", // Blue
    "#8b5cf6", // Purple
    "#f59e0b", // Amber
    "#ec4899", // Pink
    "#14b8a6", // Teal
    "#a855f7", // Fuchsia
    "#6366f1", // Indigo
    "#f43f5e", // Rose
  ];

  const activeActivitiesChartData = useMemo(() => {
    if (!metrics.activities || metrics.activities.length === 0) return [];
    return metrics.activities.map((act, index) => {
      const valH = Math.round((act.seconds / 3600) * 100) / 100;
      const label = act.title;
      return {
        id: act.id,
        name: label,
        shortLabel: act.title.slice(0, 15),
        value: valH,
        rawSeconds: act.seconds,
        color: ACTIVITY_PALETTE[index % ACTIVITY_PALETTE.length],
        hasActiveSession: act.hasActiveSession,
        sessionsCount: act.sessionsCount,
        isRemaining: false,
        description: `${act.sessionsCount} ${act.sessionsCount === 1 ? "sessão registrada" : "sessões registradas"}`
      };
    });
  }, [metrics.activities]);

  const currentChartData = isExpandedActive ? activeActivitiesChartData : chartData;

  const activeHoveredData = useMemo(() => {
    if (!hoveredSlice) return null;
    const match = currentChartData.find(c => c.name === hoveredSlice.name || (c.id && c.id === hoveredSlice.id));
    if (match) return match;
    if (isExpandedActive && hoveredSlice.name === "Tempo Ativo") return null;
    if (!isExpandedActive && hoveredSlice.id) return null;
    return hoveredSlice;
  }, [hoveredSlice, currentChartData, isExpandedActive]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground uppercase tracking-widest text-xs">
        Carregando relatório de produtividade...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 min-h-0 bg-slate-950/20 rounded-2xl border border-white/5 overflow-y-auto custom-scrollbar">
      
      {/* Cards de Indicadores Rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
        
        {/* Tempo Ativo */}
        <div 
          onClick={() => {
            setHoveredSlice(null);
            setIsExpandedActive((prev) => !prev);
          }}
          className={`p-4 rounded-xl border transition-all flex items-center justify-between cursor-pointer group ${
            isExpandedActive
              ? "bg-emerald-950/40 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400"
              : "bg-black/40 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)] hover:border-emerald-500/50 hover:bg-emerald-950/20"
          }`}
          title="Clique para expandir/voltar o detalhamento de atividades no gráfico"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                Tempo Ativo
              </span>
              <span className="text-[8px] font-mono uppercase font-bold text-emerald-400/80 bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-500/30 group-hover:bg-emerald-500 group-hover:text-black transition-colors">
                {isExpandedActive ? "Expandido" : "Fatiar"}
              </span>
            </div>
            <span className="text-xl font-bold text-emerald-300 font-mono">
              {formatSeconds(metrics.totalActiveSeconds)}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-xs font-black font-mono text-emerald-300 shadow-inner">
              {metrics.expectedWorkSeconds > 0
                ? `${Math.round((metrics.totalActiveSeconds / metrics.expectedWorkSeconds) * 100)}%`
                : "0%"}
            </span>
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              do dia
            </span>
          </div>
        </div>

        {/* Tempo Inativo */}
        <div className="p-4 rounded-xl bg-black/40 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.05)] flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 block">
              Tempo Inativo
            </span>
            <span className="text-xl font-bold text-rose-300 font-mono">
              {formatSeconds(metrics.inactiveSeconds)}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/40 text-xs font-black font-mono text-rose-300 shadow-inner">
              {metrics.expectedWorkSeconds > 0
                ? `${Math.round((metrics.inactiveSeconds / metrics.expectedWorkSeconds) * 100)}%`
                : "0%"}
            </span>
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              do dia
            </span>
          </div>
        </div>

        {/* Tempo Restante (Sem preenchimento / Borda tracejada) */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-dashed border-slate-700/60 shadow-[0_0_15px_rgba(100,116,139,0.05)] flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
              Tempo Restante
            </span>
            <span className="text-xl font-bold text-slate-300 font-mono">
              {formatSeconds(metrics.remainingSeconds)}
            </span>
          </div>
          <Hourglass className="h-6 w-6 text-slate-500/50" />
        </div>

        {/* Aproveitamento */}
        <div className="p-4 rounded-xl bg-black/40 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.05)] flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block">
              Aproveitamento
            </span>
            <span className="text-xl font-bold text-indigo-300 font-mono">
              {metrics.efficiency}%
            </span>
          </div>
          <Percent className="h-6 w-6 text-indigo-500/50" />
        </div>

      </div>

      {/* Gráfico e Breakdown de Atividades */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        
        {/* Painel Esquerdo: Gráfico de Pizza */}
        <div className="p-5 rounded-2xl bg-black/40 border border-white/5 flex flex-col justify-between min-h-[420px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
            <div>
              <div className="flex items-center gap-2">
                <h3 
                  className="text-xs font-black uppercase tracking-widest text-slate-200"
                  title={isExpandedActive ? "Fatiamento de tempo por cada atividade realizada" : "Composição da jornada: Ativo, Inativo e Restante"}
                >
                  {isExpandedActive ? "Atividades Detalhadas" : "Gráfico de Produtividade"}
                </h3>
              </div>
            </div>

            {/* Filtro de Período e Tag de Modo no Canto do Card */}
            <div className="flex items-center gap-2.5 shrink-0">
              <span className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold border uppercase tracking-wider ${
                isExpandedActive
                  ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-300"
                  : "bg-slate-900/90 border-white/10 text-slate-400"
              }`}>
                {isExpandedActive ? "Atividades Detalhadas" : "Composição Geral"}
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Período:
                </span>
                <select
                  value={dateFilter}
                  onChange={(e: any) => setDateFilter(e.target.value)}
                  className="input-futuristic rounded-xl px-3 py-1.5 text-xs bg-slate-900 border border-white/20 outline-none cursor-pointer text-white font-bold tracking-wide shadow-inner"
                >
                  <option value="today" className="bg-[#0f172a] text-white font-bold">Hoje</option>
                  <option value="yesterday" className="bg-[#0f172a] text-white font-bold">Ontem</option>
                  <option value="week" className="bg-[#0f172a] text-white font-bold">Últimos 7 dias</option>
                  <option value="month" className="bg-[#0f172a] text-white font-bold">Este Mês</option>
                  <option value="all" className="bg-[#0f172a] text-white font-bold">Todo o Período</option>
                </select>
              </div>
            </div>
          </div>

          <div 
            onMouseMove={handleChartMouseMove}
            className="flex-1 h-[340px] min-h-[340px] relative flex items-center justify-center my-1"
          >
            {/* Botão VOLTAR no Centro do Gráfico quando expandido */}
            {isExpandedActive && (
              <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 select-none"
              >
                <button
                  type="button"
                  onClick={() => {
                    setHoveredSlice(null);
                    setIsExpandedActive(false);
                  }}
                  className="pointer-events-auto px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-950 hover:border-emerald-400 hover:text-white hover:scale-105 transition-all shadow-[0_0_15px_rgba(16,185,129,0.25)] font-mono text-xs font-black uppercase tracking-widest text-center cursor-pointer"
                  title="Clique para voltar à composição geral"
                >
                  VOLTAR
                </button>
              </div>
            )}
            {metrics.totalActiveSeconds === 0 && metrics.inactiveSeconds === 0 && metrics.remainingSeconds === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum registro de horas no período.</p>
            ) : isExpandedActive && activeActivitiesChartData.length === 0 ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground italic">Nenhuma atividade registrada para fatiamento.</p>
                <button
                  type="button"
                  onClick={() => {
                    setHoveredSlice(null);
                    setIsExpandedActive(false);
                  }}
                  className="px-3 py-1 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  Voltar ao Gráfico Geral
                </button>
              </div>
            ) : (
              <>
            {/* Balão Informativo no Canto Mais Próximo (Sem tampar o gráfico) */}
            {activeHoveredData && (
              <div className={`absolute ${
                tooltipCorner === "top-left" 
                  ? "top-2 left-2" 
                  : tooltipCorner === "top-right" 
                  ? "top-2 right-2" 
                  : tooltipCorner === "bottom-left" 
                  ? "bottom-2 left-2" 
                  : "bottom-2 right-2"
              } z-20 p-3.5 rounded-2xl bg-slate-950/95 border border-white/20 shadow-[0_0_30px_rgba(0,0,0,0.9)] backdrop-blur-xl min-w-[220px] max-w-[280px] pointer-events-none select-none transition-all duration-150`}>
                <div className="flex items-center gap-2.5 mb-2 pb-1.5 border-b border-white/10">
                  <span
                    className={`h-3 w-3 rounded-full shrink-0 ${activeHoveredData.isRemaining ? "border-2 border-dashed border-slate-400 bg-transparent" : "shadow-sm"}`}
                    style={{ 
                      backgroundColor: activeHoveredData.isRemaining ? "transparent" : activeHoveredData.color, 
                      boxShadow: activeHoveredData.isRemaining ? "none" : `0 0 10px ${activeHoveredData.color}` 
                    }}
                  />
                  <span className={`text-xs font-black uppercase tracking-wider ${activeHoveredData.isRemaining ? "text-slate-400 italic" : "text-white"} truncate`}>
                    {activeHoveredData.name}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <p className={`text-base font-black font-mono leading-none ${activeHoveredData.isRemaining ? "text-slate-400" : isExpandedActive ? "text-emerald-300" : "text-white"}`}>
                    {formatSeconds(activeHoveredData.rawSeconds)}
                  </p>

                  {activeHoveredData.description && (
                    <p className="text-[10px] text-muted-foreground font-mono leading-tight">
                      {activeHoveredData.description}
                    </p>
                  )}

                  <div className="pt-0.5">
                    <span className="font-bold text-slate-300 bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono inline-block">
                      {isExpandedActive 
                        ? `${metrics.totalActiveSeconds > 0 ? Math.round((activeHoveredData.rawSeconds / metrics.totalActiveSeconds) * 100) : 0}% do tempo ativo`
                        : `${metrics.expectedWorkSeconds > 0 ? Math.round((activeHoveredData.rawSeconds / metrics.expectedWorkSeconds) * 100) : 0}% da jornada`
                      }
                    </span>
                  </div>

                  {/* Indicação da quantidade de atividades que tomaram tempo */}
                  {!isExpandedActive && activeHoveredData.name === "Tempo Ativo" && (
                    <div className="pt-2 mt-1.5 border-t border-white/10 flex items-center gap-1.5 text-[10px] font-mono text-emerald-300 font-bold">
                      <Briefcase className="h-3 w-3 text-emerald-400" />
                      <span>{metrics.activities.length} {metrics.activities.length === 1 ? "atividade realizada" : "atividades realizadas"}</span>
                    </div>
                  )}

                  {isExpandedActive && activeHoveredData.hasActiveSession && (
                    <div className="pt-1.5 mt-1 border-t border-emerald-500/20 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 font-bold">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                      <span>Sessão em andamento</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  isAnimationActive={false}
                  data={currentChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={135}
                  paddingAngle={isExpandedActive ? 2 : 3}
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth={2}
                  labelLine={false}
                  label={({ cx, cy, midAngle, innerRadius, outerRadius, index }: any) => {
                    const item = currentChartData[index];
                    if (!item || !item.rawSeconds || item.rawSeconds <= 0) return null;

                    const slicePercent = !isExpandedActive
                      ? (metrics.expectedWorkSeconds > 0 ? Math.round((item.rawSeconds / metrics.expectedWorkSeconds) * 100) : 0)
                      : (metrics.totalActiveSeconds > 0 ? Math.round((item.rawSeconds / metrics.totalActiveSeconds) * 100) : 0);

                    if (slicePercent < 4) return null; // Não sobrepõe fatias muito pequenas

                    const RADIAN = Math.PI / 180;
                    const radius = innerRadius + (outerRadius - innerRadius) * 0.54;
                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                    const y = cy + radius * Math.sin(-midAngle * RADIAN);

                    const isRemaining = !isExpandedActive && (item.name === "Tempo Restante" || item.isRemaining);

                    return (
                      <text
                        x={x}
                        y={y}
                        fill={isRemaining ? "#cbd5e1" : "#ffffff"}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="15"
                        fontWeight="900"
                        className="font-mono font-black pointer-events-none select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] tracking-tight"
                      >
                        {slicePercent}%
                      </text>
                    );
                  }}
                  onMouseEnter={(_: any, index: number) => {
                    const item = currentChartData[index];
                    if (item) setHoveredSlice(item);
                  }}
                  onMouseLeave={() => {
                    setHoveredSlice(null);
                  }}
                  onClick={(entry: any) => {
                    if (!isExpandedActive) {
                      const sliceName = entry?.name || entry?.payload?.name;
                      // Só expande se o clique for EXCLUSIVAMENTE na fatia de Tempo Ativo
                      if (sliceName === "Tempo Ativo") {
                        setHoveredSlice(null);
                        setIsExpandedActive(true);
                      }
                    } else {
                      const actId = entry?.id || entry?.payload?.id;
                      if (actId) {
                        setHighlightedActivityId((prev) => prev === actId ? null : actId);
                      }
                    }
                  }}
                >
                  {currentChartData.map((entry: any, index) => {
                    const isRemaining = !isExpandedActive && (entry.name === "Tempo Restante" || entry.isRemaining);
                    const isHovered = activeHoveredData?.name === entry.name || (activeHoveredData?.id && activeHoveredData?.id === entry.id);
                    
                    if (!isExpandedActive) {
                      const isTempoAtivo = entry.name === "Tempo Ativo";
                      return (
                        <Cell 
                          key={`cell-hours-${index}`} 
                          fill={isRemaining ? "rgba(100, 116, 139, 0.04)" : entry.color} 
                          stroke={isRemaining ? "#64748b" : (isTempoAtivo && isHovered) ? "#34d399" : "rgba(0,0,0,0.6)"}
                          strokeWidth={(isTempoAtivo && isHovered) ? 5 : (isRemaining ? 2 : 2)}
                          strokeDasharray={isRemaining ? "5 4" : undefined}
                          className={
                            isTempoAtivo 
                              ? "cursor-pointer hover:brightness-110 transition-all duration-150" 
                              : "cursor-default pointer-events-auto"
                          }
                          onMouseEnter={() => setHoveredSlice(entry)}
                          onMouseLeave={() => setHoveredSlice(null)}
                        />
                      );
                    }

                    // Modo Detalhado (todas as atividades fatiadas)
                    return (
                      <Cell 
                        key={`cell-hours-${index}`} 
                        fill={entry.color} 
                        stroke={isHovered ? "#ffffff" : "rgba(0,0,0,0.6)"}
                        strokeWidth={isHovered ? 4 : 2}
                        className="cursor-pointer hover:brightness-110 transition-all duration-150"
                        onMouseEnter={() => setHoveredSlice(entry)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      />
                    );
                  })}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
              </>
            )}
          </div>
        </div>

        {/* Painel Direito: Lista de Atividades */}
        <div className="p-5 rounded-2xl bg-black/40 border border-white/5 flex flex-col min-h-[420px] overflow-hidden">
          <div className="mb-3 shrink-0 flex items-center justify-between">
            <div>
              <h3 
                className="text-xs font-black uppercase tracking-widest text-slate-300"
                title="Relação de atividades trabalhadas pelo usuário no período"
              >
                Breakdown por Atividades
              </h3>
            </div>
            {highlightedActivityId && (
              <button
                type="button"
                onClick={() => setHighlightedActivityId(null)}
                className="px-2 py-0.5 rounded-lg text-[9px] font-mono uppercase bg-white/10 text-slate-300 hover:text-white cursor-pointer"
              >
                Limpar seleção
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2">
            {metrics.activities.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                Nenhuma atividade trabalhada no período.
              </div>
            ) : (
              metrics.activities.map((act, index) => {
                const isSelected = highlightedActivityId === act.id;
                const paletteColor = ACTIVITY_PALETTE[index % ACTIVITY_PALETTE.length];

                return (
                  <div
                    key={act.id}
                    onClick={() => handleOpenActivityCard(act.id)}
                    className={`group p-3 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? "bg-emerald-950/40 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)] ring-2 ring-emerald-400"
                        : act.hasActiveSession
                        ? "bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-400/40 hover:border-emerald-400 hover:bg-emerald-950/50"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-sky-500/30 hover:shadow-md"
                    }`}
                    title="Clique para abrir o card detalhado desta atividade no CRM"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm group-hover:scale-125 transition-transform"
                        style={{ backgroundColor: paletteColor, boxShadow: `0 0 8px ${paletteColor}` }}
                      />
                      <Briefcase className={`h-4 w-4 shrink-0 ${act.hasActiveSession ? "text-emerald-400 animate-pulse" : "text-sky-400 group-hover:text-white"}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-white truncate group-hover:text-sky-300 transition-colors">
                            {act.title}
                          </p>
                          {act.hasActiveSession && (
                            <span className="font-mono text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 uppercase tracking-widest inline-flex items-center gap-1 animate-pulse shrink-0">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                              Ao Vivo
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground uppercase">
                          <span>{act.reqNumber ? `Nº ${act.reqNumber} • ` : ""}{act.sessionsCount} {act.sessionsCount === 1 ? "sessão" : "sessões"}</span>
                          <span className="opacity-0 group-hover:opacity-100 text-sky-400 font-bold lowercase tracking-normal flex items-center gap-0.5 transition-opacity">
                            abrir card <ExternalLink className="h-2.5 w-2.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2.5">
                      <span className={`text-xs font-black font-mono ${act.hasActiveSession ? "text-emerald-300 animate-pulse" : "text-emerald-400"}`}>
                        {formatSeconds(act.seconds)}
                      </span>
                      <div className="p-1 rounded-lg bg-white/5 border border-white/10 text-muted-foreground group-hover:text-sky-300 group-hover:bg-sky-500/20 group-hover:border-sky-400/40 transition-all">
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
