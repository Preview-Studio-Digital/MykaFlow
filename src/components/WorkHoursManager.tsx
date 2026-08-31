import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Clock, Briefcase, Calendar, Users, Percent, Hourglass, ArrowLeft, ArrowRight, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  getWorkdayProgress,
  getWorkdaySessionOverlapSeconds,
  getAutoCutoffInfo,
  isBusinessWorkTime,
} from "@/lib/work-schedule";

interface DealTimeSession {
  id: string;
  deal_id: string;
  user_id: string;
  user_name: string;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number;
  stop_reason?: string;
  isInternal?: boolean;
}

interface Deal {
  id: string;
  title: string;
  stage?: string | null;
  notes?: string | null;
  req_number?: string | null;
  created_at?: string;
}

function isInternalDeal(deal?: Deal | any): boolean {
  if (!deal) return false;
  const stage = deal.stage;
  const title = deal.title || "";
  return stage === "lead" || title.includes("[TAREFA]") || title.includes("[REQ. INTERNA]") || title.toLowerCase().includes("tarefa");
}

const STAGE_COLOR_MAP: Record<
  string,
  {
    color: string;
    hex: string;
    glow: string;
    textClass: string;
    activeCardClass: string;
    activeBadgeClass: string;
    activeDotClass: string;
  }
> = {
  lead: {
    color: "#f59e0b",
    hex: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.8)",
    textClass: "text-amber-400",
    activeCardClass: "bg-amber-950/30 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.2)] ring-1 ring-amber-400/40 hover:border-amber-400 hover:bg-amber-950/50",
    activeBadgeClass: "bg-amber-500/25 text-amber-300 border-amber-400/50",
    activeDotClass: "bg-amber-400",
  },
  qualification: {
    color: "#38bdf8",
    hex: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.8)",
    textClass: "text-sky-400",
    activeCardClass: "bg-sky-950/30 border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.2)] ring-1 ring-sky-400/40 hover:border-sky-400 hover:bg-sky-950/50",
    activeBadgeClass: "bg-sky-500/25 text-sky-300 border-sky-400/50",
    activeDotClass: "bg-sky-400",
  },
  negotiation: {
    color: "#38bdf8",
    hex: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.8)",
    textClass: "text-sky-400",
    activeCardClass: "bg-sky-950/30 border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.2)] ring-1 ring-sky-400/40 hover:border-sky-400 hover:bg-sky-950/50",
    activeBadgeClass: "bg-sky-500/25 text-sky-300 border-sky-400/50",
    activeDotClass: "bg-sky-400",
  },
  won: {
    color: "#38bdf8",
    hex: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.8)",
    textClass: "text-sky-400",
    activeCardClass: "bg-sky-950/30 border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.2)] ring-1 ring-sky-400/40 hover:border-sky-400 hover:bg-sky-950/50",
    activeBadgeClass: "bg-sky-500/25 text-sky-300 border-sky-400/50",
    activeDotClass: "bg-sky-400",
  },
  completed: {
    color: "#10b981",
    hex: "#10b981",
    glow: "rgba(16, 185, 129, 0.8)",
    textClass: "text-emerald-400",
    activeCardClass: "bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/40 hover:border-emerald-400 hover:bg-emerald-950/50",
    activeBadgeClass: "bg-emerald-500/25 text-emerald-300 border-emerald-400/50",
    activeDotClass: "bg-emerald-400",
  },
  lost: {
    color: "#f43f5e",
    hex: "#f43f5e",
    glow: "rgba(244, 63, 94, 0.8)",
    textClass: "text-rose-400",
    activeCardClass: "bg-rose-950/30 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.2)] ring-1 ring-rose-400/40 hover:border-rose-400 hover:bg-rose-950/50",
    activeBadgeClass: "bg-rose-500/25 text-rose-300 border-rose-400/50",
    activeDotClass: "bg-rose-400",
  },
};

function getStageStyle(stage?: string | null, isInternal?: boolean, title?: string) {
  if (isInternal || stage === "lead" || (title && (title.includes("[TAREFA]") || title.includes("[REQ. INTERNA]")))) {
    return STAGE_COLOR_MAP.lead;
  }
  if (stage === "completed" || (title && title.includes("[CONCLUÍDO]"))) {
    return STAGE_COLOR_MAP.completed;
  }
  if (stage === "lost" || (title && title.includes("[PERDIDO]"))) {
    return STAGE_COLOR_MAP.lost;
  }
  if (stage && STAGE_COLOR_MAP[stage]) {
    return STAGE_COLOR_MAP[stage];
  }
  return STAGE_COLOR_MAP.qualification; // default sky (orçamentos / externas)
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
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId || "");
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

        // Fetch user roles para identificar administradores
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("user_id, role");
        
        const adminSet = new Set<string>();
        (rolesData || []).forEach(r => {
          if (r.role === "admin") {
            adminSet.add(r.user_id);
          }
        });
        setAdminUserIds(adminSet);
        
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
    const sessions: (DealTimeSession & { dealTitle: string; reqNumber: string; isActive?: boolean; isInternal?: boolean; stage?: string | null })[] = [];
    deals.forEach((deal) => {
      if (!deal.notes) return;
      const dealReqNum = getDealReqNumber(deal, deals);
      const isInternal = isInternalDeal(deal);

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
              isInternal,
              stage: deal.stage,
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
              const cutoffInfo = getAutoCutoffInfo(parsed.startedAt, new Date(currentTime));
              const schedule = isBusinessWorkTime(new Date(currentTime));
              const isUserAdmin = adminUserIds.has(parsed.userId);

              if (cutoffInfo.shouldCutoff && cutoffInfo.cutoffTimeIso) {
                // Sessão atingiu o horário de corte: interrompe no horário exato de corte
                const cutoffMs = new Date(cutoffInfo.cutoffTimeIso).getTime();
                const sessionDurationSec = Math.max(0, Math.floor((cutoffMs - startMs) / 1000));
                sessions.push({
                  id: `active-cutoff-${deal.id}`,
                  deal_id: deal.id,
                  user_id: parsed.userId,
                  user_name: parsed.userName || "Usuário",
                  started_at: parsed.startedAt,
                  ended_at: cutoffInfo.cutoffTimeIso,
                  duration_seconds: sessionDurationSec,
                  dealTitle: deal.title,
                  reqNumber: dealReqNum,
                  isActive: false, // Interrompido pelo corte!
                  isInternal,
                  stage: deal.stage,
                });
              } else if (!schedule.allowed && !isUserAdmin) {
                // Fora do expediente: usuário não-admin não acumula horas fora do expediente
                sessions.push({
                  id: `active-blocked-${deal.id}`,
                  deal_id: deal.id,
                  user_id: parsed.userId,
                  user_name: parsed.userName || "Usuário",
                  started_at: parsed.startedAt,
                  ended_at: parsed.startedAt,
                  duration_seconds: 0,
                  dealTitle: deal.title,
                  reqNumber: dealReqNum,
                  isActive: false,
                  isInternal,
                  stage: deal.stage,
                });
              } else {
                // Sessão ativa válida (Admin fora do expediente que iniciou após o corte, ou qualquer usuário dentro do expediente)
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
                  isInternal,
                  stage: deal.stage,
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn("Erro ao fazer parse de WORK_ACTIVE em deal:", deal.id, e);
      }
    });
    return sessions;
  }, [deals, currentTime]);

  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "thisWeek" | "last7" | "last15" | "month" | "last30" | "all">("today");

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
      if (dateFilter === "thisWeek") {
        // Semana atual (a partir de segunda-feira)
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(currentTime);
        monday.setDate(now.getDate() - diffToMonday);
        monday.setHours(0, 0, 0, 0);
        return sessionDate >= monday;
      }
      if (dateFilter === "last7") {
        // Últimos 7 dias
        const sevenDaysAgo = new Date(currentTime);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return sessionDate >= sevenDaysAgo;
      }
      if (dateFilter === "last15") {
        // Últimos 15 dias
        const fifteenDaysAgo = new Date(currentTime);
        fifteenDaysAgo.setDate(now.getDate() - 15);
        return sessionDate >= fifteenDaysAgo;
      }
      if (dateFilter === "month") {
        // Mês atual
        return (
          sessionDate.getMonth() === now.getMonth() &&
          sessionDate.getFullYear() === now.getFullYear()
        );
      }
      if (dateFilter === "last30") {
        // Últimos 30 dias
        const thirtyDaysAgo = new Date(currentTime);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return sessionDate >= thirtyDaysAgo;
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
      { title: string; reqNumber: string; seconds: number; sessionsCount: number; hasActiveSession: boolean; isInternal: boolean; stage?: string | null; latestStartedAt?: string; firstStartedAt?: string }
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
          isInternal: Boolean(session.isInternal),
          stage: session.stage,
          latestStartedAt: session.started_at,
          firstStartedAt: session.started_at,
        };
      }
      activityMap[dealId].seconds += duration;
      activityMap[dealId].sessionsCount += 1;

      const sessionStartMs = new Date(session.started_at).getTime();
      const currentLatestMs = activityMap[dealId].latestStartedAt ? new Date(activityMap[dealId].latestStartedAt!).getTime() : 0;
      if (sessionStartMs > currentLatestMs) {
        activityMap[dealId].latestStartedAt = session.started_at;
      }

      const currentFirstMs = activityMap[dealId].firstStartedAt ? new Date(activityMap[dealId].firstStartedAt!).getTime() : Infinity;
      if (sessionStartMs < currentFirstMs) {
        activityMap[dealId].firstStartedAt = session.started_at;
      }

      if (session.isActive) {
        activityMap[dealId].hasActiveSession = true;
      }
    });

    const todayStr = new Date(currentTime).toDateString();
    const todayProgress = getWorkdayProgress(new Date(currentTime));

    // Determina a lista de usuários a avaliar (usuário selecionado ou todos os perfis da equipe)
    const targetUserIds = selectedUserId
      ? [selectedUserId]
      : Array.from(new Set([
          ...profiles.map((p) => p.id),
          ...filteredSessions.map((s) => s.user_id),
        ])).filter(Boolean);

    let totalElapsedWorkdaySeconds = 0;
    let totalExpectedWorkSeconds = 0;
    let totalInactiveSeconds = 0;

    // Para cada usuário, calcula o expediente e seu tempo inativo isolado
    targetUserIds.forEach((uid) => {
      let userElapsedSec = 0;
      let userExpectedSec = 0;
      let userInactiveSec = 0;

      uniqueDays.forEach((dateStr) => {
        const d = new Date(dateStr);
        const dayOfWeek = d.getDay(); // 0 = Dom, 1 = Seg, ..., 5 = Sex, 6 = Sáb
        const isFriday = dayOfWeek === 5;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dailyBaseSeconds = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;
        const isToday = dateStr === todayStr;

        userExpectedSec += dailyBaseSeconds;

        const dayElapsedSec = isToday ? todayProgress.elapsedWorkdaySeconds : dailyBaseSeconds;
        userElapsedSec += dayElapsedSec;

        // Calcula o tempo ativo deste usuário especificamente dentro da grade de expediente deste dia
        let dayWorkdayActiveSec = 0;
        filteredSessions
          .filter((s) => s.user_id === uid && new Date(s.started_at).toDateString() === dateStr)
          .forEach((s) => {
            const sessionEnd = s.ended_at || (s.isActive ? new Date(currentTime).toISOString() : new Date(new Date(s.started_at).getTime() + (s.duration_seconds || 0) * 1000).toISOString());
            const overlap = getWorkdaySessionOverlapSeconds(
              s.started_at,
              sessionEnd,
              d,
              isToday ? new Date(currentTime) : undefined
            );
            dayWorkdayActiveSec += overlap;
          });

        const cappedDayActiveSec = Math.min(dayElapsedSec, dayWorkdayActiveSec);
        const dayInactiveSec = Math.max(0, dayElapsedSec - cappedDayActiveSec);
        userInactiveSec += dayInactiveSec;
      });

      totalElapsedWorkdaySeconds += userElapsedSec;
      totalExpectedWorkSeconds += userExpectedSec;
      totalInactiveSeconds += userInactiveSec;
    });

    const daysWorked = uniqueDays.size;
    const inactiveSeconds = totalInactiveSeconds;
    const expectedWorkSeconds = totalExpectedWorkSeconds;
    const remainingSeconds = Math.max(0, totalExpectedWorkSeconds - totalElapsedWorkdaySeconds);

    const activeHours = Math.round((totalActiveSeconds / 3600) * 10) / 10;
    const inactiveHours = Math.round((inactiveSeconds / 3600) * 10) / 10;
    const remainingHours = Math.round((remainingSeconds / 3600) * 10) / 10;
    const expectedHours = Math.round((expectedWorkSeconds / 3600) * 10) / 10;

    // Taxa de aproveitamento e porcentagens sobre o tempo de expediente decorrido até agora
    const activePct = totalElapsedWorkdaySeconds > 0
      ? Math.min(100, Math.round((totalActiveSeconds / totalElapsedWorkdaySeconds) * 100))
      : totalActiveSeconds > 0 ? 100 : 0;

    const inactivePct = totalElapsedWorkdaySeconds > 0
      ? Math.min(100, Math.max(0, 100 - activePct))
      : 0;

    const efficiency = activePct;

    // Numeração cronológica de execução (#1 para a primeira atividade trabalhada no período, #2 para a segunda, etc.)
    const chronologicalOrder = Object.entries(activityMap).sort(
      ([, a], [, b]) => new Date(a.firstStartedAt || 0).getTime() - new Date(b.firstStartedAt || 0).getTime()
    );
    const orderNumberMap: Record<string, number> = {};
    chronologicalOrder.forEach(([id], idx) => {
      orderNumberMap[id] = idx + 1;
    });

    const activities = Object.entries(activityMap).map(([id, info]) => ({
      id,
      ...info,
      workOrderNumber: orderNumberMap[id] || 1,
      hours: info.seconds / 3600
    })).sort((a, b) => {
      // 1. Atividade em andamento (Ao Vivo) sempre ocupa o topo absoluto
      if (a.hasActiveSession && !b.hasActiveSession) return -1;
      if (!a.hasActiveSession && b.hasActiveSession) return 1;

      // 2. Ordena pelas atividades mais recentes primeiro
      const timeA = new Date(a.latestStartedAt || 0).getTime();
      const timeB = new Date(b.latestStartedAt || 0).getTime();
      if (timeA !== timeB) return timeB - timeA;

      // 3. Critério de desempate por tempo trabalhado
      return b.seconds - a.seconds;
    });

    return {
      daysWorked,
      totalActiveSeconds,
      inactiveSeconds,
      remainingSeconds,
      expectedWorkSeconds,
      expectedHours,
      totalElapsedWorkdaySeconds,
      efficiency,
      activePct,
      inactivePct,
      activeHours,
      inactiveHours,
      remainingHours,
      activities
    };
  }, [filteredSessions, profiles, selectedUserId, dailyShiftHours, dateFilter, currentTime]);

  // Médias Históricas do Usuário e da Empresa
  const averages = useMemo(() => {
    const todayStr = new Date(currentTime).toDateString();
    const todayProgress = getWorkdayProgress(new Date(currentTime));

    // 1. Média do Usuário Selecionado (ou do período atual no caso de visão geral)
    let userAvgActivePct = 0;
    let userAvgInactivePct = 0;
    const userSessions = selectedUserId
      ? allSessions.filter((s) => s.user_id === selectedUserId)
      : allSessions;

    if (userSessions.length > 0) {
      let userTotalActiveSec = 0;
      const userUniqueDays = new Set<string>();
      userSessions.forEach((s) => {
        userTotalActiveSec += s.duration_seconds || 0;
        userUniqueDays.add(new Date(s.started_at).toDateString());
      });

      let userTotalElapsedSec = 0;
      userUniqueDays.forEach((dateStr) => {
        const d = new Date(dateStr);
        const dayOfWeek = d.getDay();
        const isFriday = dayOfWeek === 5;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dailyBaseSeconds = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;
        if (dateStr === todayStr) {
          userTotalElapsedSec += todayProgress.elapsedWorkdaySeconds;
        } else {
          userTotalElapsedSec += dailyBaseSeconds;
        }
      });

      if (userTotalElapsedSec > 0) {
        userAvgActivePct = Math.min(100, Math.round((userTotalActiveSec / userTotalElapsedSec) * 100));
        userAvgInactivePct = Math.max(0, 100 - userAvgActivePct);
      } else if (userTotalActiveSec > 0) {
        userAvgActivePct = 100;
        userAvgInactivePct = 0;
      }
    }

    // 2. Média Geral de Toda a Empresa (Histórico Consolidado)
    let companyAvgActivePct = 0;
    let companyAvgInactivePct = 0;
    if (allSessions.length > 0) {
      let compTotalActiveSec = 0;
      const compUniqueDays = new Set<string>();
      allSessions.forEach((s) => {
        compTotalActiveSec += s.duration_seconds || 0;
        compUniqueDays.add(new Date(s.started_at).toDateString());
      });

      const allTargetUserIds = Array.from(
        new Set([...profiles.map((p) => p.id), ...allSessions.map((s) => s.user_id)])
      ).filter(Boolean);

      let compTotalElapsedSec = 0;
      allTargetUserIds.forEach(() => {
        compUniqueDays.forEach((dateStr) => {
          const d = new Date(dateStr);
          const dayOfWeek = d.getDay();
          const isFriday = dayOfWeek === 5;
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const dailyBaseSeconds = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;
          if (dateStr === todayStr) {
            compTotalElapsedSec += todayProgress.elapsedWorkdaySeconds;
          } else {
            compTotalElapsedSec += dailyBaseSeconds;
          }
        });
      });

      if (compTotalElapsedSec > 0) {
        companyAvgActivePct = Math.min(100, Math.round((compTotalActiveSec / compTotalElapsedSec) * 100));
        companyAvgInactivePct = Math.max(0, 100 - companyAvgActivePct);
      } else if (compTotalActiveSec > 0) {
        companyAvgActivePct = 100;
        companyAvgInactivePct = 0;
      }
    }

    const elapsedForPacing = metrics.totalElapsedWorkdaySeconds > 0
      ? metrics.totalElapsedWorkdaySeconds
      : metrics.totalActiveSeconds;

    const userPacedActiveSec = Math.round(elapsedForPacing * (userAvgActivePct / 100));
    const companyPacedActiveSec = Math.round(elapsedForPacing * (companyAvgActivePct / 100));

    return {
      userAvgActivePct,
      userAvgInactivePct,
      companyAvgActivePct,
      companyAvgInactivePct,
      userPacedActiveSec,
      companyPacedActiveSec,
    };
  }, [allSessions, profiles, selectedUserId, currentTime, metrics.totalElapsedWorkdaySeconds, metrics.totalActiveSeconds]);

  const allPeriodEfficiency = averages.userAvgActivePct;

  // Métricas de Tempo Médio e Proporção (Internas vs Externas) para o Usuário e para a Empresa no período selecionado
  const benchmarkMetrics = useMemo(() => {
    // 1. Dados do Usuário no período ativo (filteredSessions)
    const userInternalSessions = filteredSessions.filter((s) => s.isInternal);
    const userExternalSessions = filteredSessions.filter((s) => !s.isInternal);

    const userInternalDeals = new Set(userInternalSessions.map((s) => s.deal_id));
    const userExternalDeals = new Set(userExternalSessions.map((s) => s.deal_id));

    const userInternalSec = userInternalSessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const userExternalSec = userExternalSessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const userTotalSec = userInternalSec + userExternalSec;

    const userAvgInternalSec = userInternalDeals.size > 0 ? Math.round(userInternalSec / userInternalDeals.size) : 0;
    const userAvgExternalSec = userExternalDeals.size > 0 ? Math.round(userExternalSec / userExternalDeals.size) : 0;

    const userPctInternal = userTotalSec > 0 ? Math.round((userInternalSec / userTotalSec) * 100) : 0;
    const userPctExternal = userTotalSec > 0 ? Math.round((userExternalSec / userTotalSec) * 100) : 0;

    // 2. Dados de Toda a Empresa no MESMO período ativo
    const companyPeriodSessions = allSessions.filter((session) => {
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
      if (dateFilter === "thisWeek") {
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(currentTime);
        monday.setDate(now.getDate() - diffToMonday);
        monday.setHours(0, 0, 0, 0);
        return sessionDate >= monday;
      }
      if (dateFilter === "last7") {
        const sevenDaysAgo = new Date(currentTime);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return sessionDate >= sevenDaysAgo;
      }
      if (dateFilter === "last15") {
        const fifteenDaysAgo = new Date(currentTime);
        fifteenDaysAgo.setDate(now.getDate() - 15);
        return sessionDate >= fifteenDaysAgo;
      }
      if (dateFilter === "month") {
        return (
          sessionDate.getMonth() === now.getMonth() &&
          sessionDate.getFullYear() === now.getFullYear()
        );
      }
      if (dateFilter === "last30") {
        const thirtyDaysAgo = new Date(currentTime);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return sessionDate >= thirtyDaysAgo;
      }
      return true; // "all"
    });

    const companyInternalSessions = companyPeriodSessions.filter((s) => s.isInternal);
    const companyExternalSessions = companyPeriodSessions.filter((s) => !s.isInternal);

    const companyInternalDeals = new Set(companyInternalSessions.map((s) => s.deal_id));
    const companyExternalDeals = new Set(companyExternalSessions.map((s) => s.deal_id));

    const companyInternalSec = companyInternalSessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const companyExternalSec = companyExternalSessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const companyTotalSec = companyInternalSec + companyExternalSec;

    const companyAvgInternalSec = companyInternalDeals.size > 0 ? Math.round(companyInternalSec / companyInternalDeals.size) : 0;
    const companyAvgExternalSec = companyExternalDeals.size > 0 ? Math.round(companyExternalSec / companyExternalDeals.size) : 0;

    const companyPctInternal = companyTotalSec > 0 ? Math.round((companyInternalSec / companyTotalSec) * 100) : 0;
    const companyPctExternal = companyTotalSec > 0 ? Math.round((companyExternalSec / companyTotalSec) * 100) : 0;

    return {
      userAvgInternalSec,
      companyAvgInternalSec,
      userAvgExternalSec,
      companyAvgExternalSec,
      userPctInternal,
      userPctExternal,
      companyPctInternal,
      companyPctExternal,
    };
  }, [filteredSessions, allSessions, dateFilter, currentTime]);

  const formatSeconds = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const formatApproxTime = (totalSeconds: number) => {
    if (!totalSeconds || totalSeconds <= 0) return "0m";
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.round((totalSeconds % 3600) / 60);
    if (h === 0) {
      return `${Math.max(1, m)}m`;
    }
    if (m === 0) {
      return `${h}h`;
    }
    return `${h}h ${m}m`;
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

  // Gráfico Temporal de Produtividade (%) - Usuário vs Empresa ao longo do tempo + Faixa Padrão de Mercado
  const productivityTimelineData = useMemo(() => {
    const now = new Date(currentTime);
    const result: Array<{
      label: string;
      fullLabel: string;
      userPct: number;
      companyPct: number;
      userSeconds: number;
      companySeconds: number;
      marketMin: number;
      marketMax: number;
      marketRange: [number, number];
    }> = [];

    const allUserIds = Array.from(
      new Set([...profiles.map((p) => p.id), ...allSessions.map((s) => s.user_id)])
    ).filter(Boolean);
    const compUsersCount = Math.max(1, allUserIds.length);
    const companyBenchmarkPct = averages.companyAvgActivePct || 17;

    // Curva dinâmica de tolerância / mercado ao longo do dia
    const getHourlyMarketRange = (h: number): [number, number] => {
      if (h <= 7) return [0, 20];
      if (h === 8) return [10, 30];
      if (h === 9) return [20, 45];
      if (h === 10) return [30, 55];
      if (h === 11) return [35, 55];
      if (h === 12 || h === 13) return [30, 50]; // Almoço
      if (h === 14 || h === 15) return [35, 55]; // Pico da Tarde
      return [35, 50]; // Fechamento do Dia
    };

    if (dateFilter === "today" || dateFilter === "yesterday") {
      // Evolução Horária Intraday (07h às 17h)
      const targetDate = new Date(currentTime);
      if (dateFilter === "yesterday") {
        targetDate.setDate(targetDate.getDate() - 1);
      }
      const isToday = dateFilter === "today";
      const currentHour = now.getHours();

      // Horários do expediente (07h às 17h)
      for (let h = 7; h <= 17; h++) {
        // Se for hoje e o horário for no futuro, para
        if (isToday && h > currentHour) {
          continue;
        }

        const hourLabel = `${String(h).padStart(2, "0")}h`;
        const pointDate = new Date(targetDate);
        if (isToday && h === currentHour) {
          pointDate.setTime(now.getTime());
        } else {
          pointDate.setHours(h + 1, 0, 0, 0);
        }

        const workdayProgress = getWorkdayProgress(pointDate);
        const elapsedWorkdaySec = workdayProgress.elapsedWorkdaySeconds;

        // Calcula tempo ativo acumulado do início do dia (07h30) até o ponto atual
        let userAccumActiveSec = 0;
        let companyAccumActiveSec = 0;

        allSessions.forEach((s) => {
          const sDate = new Date(s.started_at);
          if (sDate.toDateString() === targetDate.toDateString()) {
            const sEnd = s.ended_at
              ? new Date(s.ended_at)
              : s.isActive
              ? pointDate
              : new Date(sDate.getTime() + (s.duration_seconds || 0) * 1000);

            const overlap = getWorkdaySessionOverlapSeconds(
              s.started_at,
              sEnd,
              targetDate,
              pointDate
            );

            if (selectedUserId && s.user_id === selectedUserId) {
              userAccumActiveSec += overlap;
            }
            companyAccumActiveSec += overlap;
          }
        });

        const userPct = elapsedWorkdaySec > 0
          ? Math.min(100, Math.round((userAccumActiveSec / elapsedWorkdaySec) * 100))
          : 0;

        const companyPct = elapsedWorkdaySec > 0 && compUsersCount > 0
          ? Math.min(100, Math.round((companyAccumActiveSec / (elapsedWorkdaySec * compUsersCount)) * 100))
          : 0;

        const [marketMin, marketMax] = getHourlyMarketRange(h);

        result.push({
          label: hourLabel,
          fullLabel: isToday && h === currentHour
            ? `${hourLabel} (${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} - Ao Vivo)`
            : `${hourLabel}:00`,
          userPct,
          companyPct,
          userSeconds: userAccumActiveSec,
          companySeconds: Math.round(companyAccumActiveSec / compUsersCount),
          marketMin,
          marketMax,
          marketRange: [marketMin, marketMax],
        });
      }
    } else if (dateFilter === "thisWeek") {
      // Semana atual (a partir de segunda-feira até hoje, garantindo pelo menos 5 dias no gráfico)
      const dayOfWeek = now.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      
      const daysToDraw = Math.max(5, diffToMonday + 1);
      const startDate = new Date(currentTime);
      startDate.setDate(now.getDate() - (daysToDraw - 1));

      for (let i = 0; i < daysToDraw; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dateStr = d.toDateString();
        const dOfWeek = d.getDay();
        const isWeekend = dOfWeek === 0 || dOfWeek === 6;
        const isFriday = dOfWeek === 5;
        const baseDaySec = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;

        const dayName = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][dOfWeek];
        const dayFormatted = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        const isToday = dateStr === new Date(currentTime).toDateString();
        const dayElapsedSec = isToday ? getWorkdayProgress(new Date(currentTime)).elapsedWorkdaySeconds : baseDaySec;

        let userDayActiveSec = 0;
        let companyDayActiveSec = 0;

        allSessions.forEach((s) => {
          if (new Date(s.started_at).toDateString() === dateStr) {
            const sec = s.duration_seconds || 0;
            if (selectedUserId && s.user_id === selectedUserId) {
              userDayActiveSec += sec;
            }
            companyDayActiveSec += sec;
          }
        });

        const effectiveExpected = dayElapsedSec > 0 ? dayElapsedSec : 1;
        const userPct = isWeekend && userDayActiveSec === 0 ? 0 : Math.min(100, Math.round((userDayActiveSec / effectiveExpected) * 100));
        const companyPct = isWeekend && companyDayActiveSec === 0 ? 0 : Math.min(100, Math.round((companyDayActiveSec / (effectiveExpected * compUsersCount)) * 100));

        const marketMin = isWeekend ? 0 : 35;
        const marketMax = isWeekend ? 0 : 50;

        result.push({
          label: `${dayName} (${dayFormatted})`,
          fullLabel: d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }),
          userPct,
          companyPct,
          userSeconds: userDayActiveSec,
          companySeconds: Math.round(companyDayActiveSec / compUsersCount),
          marketMin,
          marketMax,
          marketRange: [marketMin, marketMax],
        });
      }
    } else if (dateFilter === "last7") {
      // Últimos 7 dias
      for (let i = 6; i >= 0; i--) {
        const d = new Date(currentTime);
        d.setDate(d.getDate() - i);
        const dateStr = d.toDateString();
        const dayOfWeek = d.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isFriday = dayOfWeek === 5;
        const baseDaySec = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;

        const dayName = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][dayOfWeek];
        const dayFormatted = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        const isToday = dateStr === new Date(currentTime).toDateString();
        const dayElapsedSec = isToday ? getWorkdayProgress(new Date(currentTime)).elapsedWorkdaySeconds : baseDaySec;

        let userDayActiveSec = 0;
        let companyDayActiveSec = 0;

        allSessions.forEach((s) => {
          if (new Date(s.started_at).toDateString() === dateStr) {
            const sec = s.duration_seconds || 0;
            if (selectedUserId && s.user_id === selectedUserId) {
              userDayActiveSec += sec;
            }
            companyDayActiveSec += sec;
          }
        });

        const effectiveExpected = dayElapsedSec > 0 ? dayElapsedSec : 1;
        const userPct = isWeekend && userDayActiveSec === 0 ? 0 : Math.min(100, Math.round((userDayActiveSec / effectiveExpected) * 100));
        const companyPct = isWeekend && companyDayActiveSec === 0 ? 0 : Math.min(100, Math.round((companyDayActiveSec / (effectiveExpected * compUsersCount)) * 100));

        const marketMin = isWeekend ? 0 : 35;
        const marketMax = isWeekend ? 0 : 50;

        result.push({
          label: `${dayName} (${dayFormatted})`,
          fullLabel: d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }),
          userPct,
          companyPct,
          userSeconds: userDayActiveSec,
          companySeconds: Math.round(companyDayActiveSec / compUsersCount),
          marketMin,
          marketMax,
          marketRange: [marketMin, marketMax],
        });
      }
    } else if (dateFilter === "last15") {
      // Últimos 15 dias
      for (let i = 14; i >= 0; i--) {
        const d = new Date(currentTime);
        d.setDate(d.getDate() - i);
        const dateStr = d.toDateString();
        const dayOfWeek = d.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isFriday = dayOfWeek === 5;
        const baseDaySec = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;
        const isToday = dateStr === new Date(currentTime).toDateString();
        const dayElapsedSec = isToday ? getWorkdayProgress(new Date(currentTime)).elapsedWorkdaySeconds : baseDaySec;

        let userDayActiveSec = 0;
        let companyDayActiveSec = 0;

        allSessions.forEach((s) => {
          if (new Date(s.started_at).toDateString() === dateStr) {
            const sec = s.duration_seconds || 0;
            if (selectedUserId && s.user_id === selectedUserId) {
              userDayActiveSec += sec;
            }
            companyDayActiveSec += sec;
          }
        });

        const effectiveExpected = dayElapsedSec > 0 ? dayElapsedSec : 1;
        const userPct = isWeekend && userDayActiveSec === 0 ? 0 : Math.min(100, Math.round((userDayActiveSec / effectiveExpected) * 100));
        const companyPct = isWeekend && companyDayActiveSec === 0 ? 0 : Math.min(100, Math.round((companyDayActiveSec / (effectiveExpected * compUsersCount)) * 100));

        const marketMin = isWeekend ? 0 : 35;
        const marketMax = isWeekend ? 0 : 50;
        const dayFormatted = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

        result.push({
          label: dayFormatted,
          fullLabel: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }),
          userPct,
          companyPct,
          userSeconds: userDayActiveSec,
          companySeconds: Math.round(companyDayActiveSec / compUsersCount),
          marketMin,
          marketMax,
          marketRange: [marketMin, marketMax],
        });
      }
    } else if (dateFilter === "month") {
      // Dias do mês atual até hoje (garantindo pelo menos os últimos 5 dias se o mês estiver começando)
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const lastDay = now.getDate();

      const daysToDraw = Math.max(5, lastDay);
      const startDate = new Date(currentTime);
      startDate.setDate(now.getDate() - (daysToDraw - 1));

      for (let i = 0; i < daysToDraw; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dateStr = d.toDateString();
        const dayOfWeek = d.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isFriday = dayOfWeek === 5;
        const baseDaySec = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;
        const isToday = dateStr === new Date(currentTime).toDateString();
        const dayElapsedSec = isToday ? getWorkdayProgress(new Date(currentTime)).elapsedWorkdaySeconds : baseDaySec;

        let userDayActiveSec = 0;
        let companyDayActiveSec = 0;

        allSessions.forEach((s) => {
          if (new Date(s.started_at).toDateString() === dateStr) {
            const sec = s.duration_seconds || 0;
            if (selectedUserId && s.user_id === selectedUserId) {
              userDayActiveSec += sec;
            }
            companyDayActiveSec += sec;
          }
        });

        const effectiveExpected = dayElapsedSec > 0 ? dayElapsedSec : 1;
        const userPct = isWeekend && userDayActiveSec === 0 ? 0 : Math.min(100, Math.round((userDayActiveSec / effectiveExpected) * 100));
        const companyPct = isWeekend && companyDayActiveSec === 0 ? 0 : Math.min(100, Math.round((companyDayActiveSec / (effectiveExpected * compUsersCount)) * 100));

        const marketMin = isWeekend ? 0 : 35;
        const marketMax = isWeekend ? 0 : 50;

        result.push({
          label: `${String(d.getDate()).padStart(2, "0")}`,
          fullLabel: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", weekday: "short" }),
          userPct,
          companyPct,
          userSeconds: userDayActiveSec,
          companySeconds: Math.round(companyDayActiveSec / compUsersCount),
          marketMin,
          marketMax,
          marketRange: [marketMin, marketMax],
        });
      }
    } else if (dateFilter === "last30") {
      // Últimos 30 dias
      for (let i = 29; i >= 0; i--) {
        const d = new Date(currentTime);
        d.setDate(d.getDate() - i);
        const dateStr = d.toDateString();
        const dayOfWeek = d.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isFriday = dayOfWeek === 5;
        const baseDaySec = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;
        const isToday = dateStr === new Date(currentTime).toDateString();
        const dayElapsedSec = isToday ? getWorkdayProgress(new Date(currentTime)).elapsedWorkdaySeconds : baseDaySec;

        let userDayActiveSec = 0;
        let companyDayActiveSec = 0;

        allSessions.forEach((s) => {
          if (new Date(s.started_at).toDateString() === dateStr) {
            const sec = s.duration_seconds || 0;
            if (selectedUserId && s.user_id === selectedUserId) {
              userDayActiveSec += sec;
            }
            companyDayActiveSec += sec;
          }
        });

        const effectiveExpected = dayElapsedSec > 0 ? dayElapsedSec : 1;
        const userPct = isWeekend && userDayActiveSec === 0 ? 0 : Math.min(100, Math.round((userDayActiveSec / effectiveExpected) * 100));
        const companyPct = isWeekend && companyDayActiveSec === 0 ? 0 : Math.min(100, Math.round((companyDayActiveSec / (effectiveExpected * compUsersCount)) * 100));

        const marketMin = isWeekend ? 0 : 35;
        const marketMax = isWeekend ? 0 : 50;
        const dayFormatted = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

        result.push({
          label: dayFormatted,
          fullLabel: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }),
          userPct,
          companyPct,
          userSeconds: userDayActiveSec,
          companySeconds: Math.round(companyDayActiveSec / compUsersCount),
          marketMin,
          marketMax,
          marketRange: [marketMin, marketMax],
        });
      }
    } else {
      // Todo o Período / Histórico: Desde o primeiro registro coletado
      if (allSessions.length === 0) {
        return [];
      }

      // Encontra a data mais antiga entre todas as sessões registradas
      let earliestTime = new Date(currentTime).getTime();
      allSessions.forEach((s) => {
        const t = new Date(s.started_at).getTime();
        if (t < earliestTime) {
          earliestTime = t;
        }
      });

      const firstDate = new Date(earliestTime);
      firstDate.setHours(0, 0, 0, 0);

      const todayDate = new Date(currentTime);
      todayDate.setHours(0, 0, 0, 0);

      const diffTime = Math.max(0, todayDate.getTime() - firstDate.getTime());
      const totalDays = Math.max(1, Math.round(diffTime / (1000 * 3600 * 24)) + 1);

      // Se o período total for de até 60 dias (início de operação / poucos meses), plota DIA A DIA desde o início
      if (totalDays <= 60) {
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(firstDate);
          d.setDate(firstDate.getDate() + i);
          const dateStr = d.toDateString();
          const dayOfWeek = d.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const isFriday = dayOfWeek === 5;
          const baseDaySec = isWeekend ? 0 : isFriday ? 8 * 3600 : 9 * 3600;
          const isToday = dateStr === new Date(currentTime).toDateString();
          const dayElapsedSec = isToday ? getWorkdayProgress(new Date(currentTime)).elapsedWorkdaySeconds : baseDaySec;

          let userDayActiveSec = 0;
          let companyDayActiveSec = 0;

          allSessions.forEach((s) => {
            if (new Date(s.started_at).toDateString() === dateStr) {
              const sec = s.duration_seconds || 0;
              if (selectedUserId && s.user_id === selectedUserId) {
                userDayActiveSec += sec;
              }
              companyDayActiveSec += sec;
            }
          });

          const effectiveExpected = dayElapsedSec > 0 ? dayElapsedSec : 1;
          const userPct = isWeekend && userDayActiveSec === 0 ? 0 : Math.min(100, Math.round((userDayActiveSec / effectiveExpected) * 100));
          const companyPct = isWeekend && companyDayActiveSec === 0 ? 0 : Math.min(100, Math.round((companyDayActiveSec / (effectiveExpected * compUsersCount)) * 100));

          const marketMin = isWeekend ? 0 : 35;
          const marketMax = isWeekend ? 0 : 50;
          const dayFormatted = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

          result.push({
            label: dayFormatted,
            fullLabel: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
            userPct,
            companyPct,
            userSeconds: userDayActiveSec,
            companySeconds: Math.round(companyDayActiveSec / compUsersCount),
            marketMin,
            marketMax,
            marketRange: [marketMin, marketMax],
          });
        }
      } else {
        // Se houver mais de 60 dias (histórico maduro longo), agrupa por mês
        const monthMap = new Map<string, { userSec: number; compSec: number; days: Set<string>; monthDate: Date }>();
        allSessions.forEach((s) => {
          const d = new Date(s.started_at);
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!monthMap.has(mKey)) {
            monthMap.set(mKey, { userSec: 0, compSec: 0, days: new Set(), monthDate: d });
          }
          const entry = monthMap.get(mKey)!;
          entry.days.add(d.toDateString());
          const sec = s.duration_seconds || 0;
          if (selectedUserId && s.user_id === selectedUserId) {
            entry.userSec += sec;
          }
          entry.compSec += sec;
        });

        const sortedMonths = Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b));
        sortedMonths.forEach(([, val]) => {
          const expectedSec = Math.max(1, val.days.size * 8.8 * 3600);
          const userPct = Math.min(100, Math.round((val.userSec / expectedSec) * 100));
          const companyPct = Math.min(100, Math.round((val.compSec / (expectedSec * compUsersCount)) * 100));
          const mName = val.monthDate.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

          result.push({
            label: mName.toUpperCase(),
            fullLabel: val.monthDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
            userPct,
            companyPct,
            userSeconds: val.userSec,
            companySeconds: Math.round(val.compSec / compUsersCount),
            marketMin: 35,
            marketMax: 50,
            marketRange: [35, 50],
          });
        });
      }
    }

    return result;
  }, [allSessions, selectedUserId, dateFilter, currentTime, profiles, averages.companyAvgActivePct]);

  // Gradiente dinâmico para a linha do usuário: verde se >= empresa, vermelho se < empresa
  const userGradientStops = useMemo(() => {
    if (!productivityTimelineData.length) return [];
    const len = productivityTimelineData.length;
    if (len === 1) {
      const isAbove = productivityTimelineData[0].userPct >= productivityTimelineData[0].companyPct;
      const color = isAbove ? "#10b981" : "#f43f5e";
      return [
        { offset: "0%", color },
        { offset: "100%", color },
      ];
    }

    const stops: Array<{ offset: string; color: string }> = [];
    productivityTimelineData.forEach((pt, idx) => {
      const isAbove = pt.userPct >= pt.companyPct;
      const color = isAbove ? "#10b981" : "#f43f5e";
      const pct = (idx / (len - 1)) * 100;
      stops.push({ offset: `${pct.toFixed(1)}%`, color });
    });
    return stops;
  }, [productivityTimelineData]);

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
    return metrics.activities.map((act) => {
      const valH = Math.round((act.seconds / 3600) * 100) / 100;
      const label = act.title;
      const stageStyle = getStageStyle(act.stage, act.isInternal, act.title);
      return {
        id: act.id,
        name: label,
        shortLabel: act.title.slice(0, 15),
        value: valH,
        rawSeconds: act.seconds,
        color: stageStyle.hex,
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
      
      {/* Topo: 6 Cards de Indicadores (3 de Jornada + 3 de Benchmark Operacional: Internas x Externas) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 shrink-0">
        
        {/* Bloco 1 (Metade Esquerda): Jornada de Trabalho */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Card 1: Tempo Ativo */}
          <div 
            onClick={() => {
              setHoveredSlice(null);
              setIsExpandedActive((prev) => !prev);
            }}
            className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between cursor-pointer group ${
              isExpandedActive
                ? "bg-emerald-950/40 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400"
                : "bg-black/40 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)] hover:border-emerald-500/50 hover:bg-emerald-950/20"
            }`}
            title="Clique para expandir/voltar o detalhamento de atividades no gráfico"
          >
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block truncate">
                  Tempo Ativo
                </span>
                <span className="text-[8px] font-mono uppercase font-bold text-emerald-400/80 bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-500/30 group-hover:bg-emerald-500 group-hover:text-black transition-colors">
                  {isExpandedActive ? "Expandido" : "Fatiar"}
                </span>
              </div>
              <span className="text-3xl font-bold text-emerald-300 font-mono block">
                {metrics.activePct}%
              </span>
            </div>

            <div className="pt-2 mt-2 border-t border-white/5 flex flex-col gap-1 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">{selectedUserId ? "Média Usuário:" : "Média Período:"}</span>
                <span className="text-emerald-400 font-bold">{averages.userAvgActivePct}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">Média Empresa:</span>
                <span className="text-slate-300 font-bold">{averages.companyAvgActivePct}%</span>
              </div>
            </div>
          </div>

          {/* Card 2: Tempo Inativo */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.05)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 block truncate">
                  Tempo Inativo
                </span>
              </div>
              <span className="text-3xl font-bold text-rose-300 font-mono block">
                {metrics.inactivePct}%
              </span>
            </div>

            <div className="pt-2 mt-2 border-t border-white/5 flex flex-col gap-1 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">{selectedUserId ? "Média Usuário:" : "Média Período:"}</span>
                <span className="text-rose-400 font-bold">{averages.userAvgInactivePct}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">Média Empresa:</span>
                <span className="text-slate-300 font-bold">{averages.companyAvgInactivePct}%</span>
              </div>
            </div>
          </div>

          {/* Card 3: Total de Horas Trabalhadas (Volume Bruto com Média Proporcional ao Tempo Decorrido) */}
          <div
            className="p-3.5 rounded-xl bg-black/40 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.05)] flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <span
                  className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block truncate"
                  title="Total de tempo trabalhado em atividades no período"
                >
                  TOTAL DE HORAS
                </span>
              </div>
              <span className="text-3xl font-bold text-indigo-300 font-mono block">
                {formatApproxTime(metrics.totalActiveSeconds)}
              </span>
            </div>

            <div className="pt-2 mt-2 border-t border-white/5 flex flex-col gap-1 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">{selectedUserId ? "Média Usuário:" : "Média Período:"}</span>
                <span className="text-indigo-300 font-bold">{formatApproxTime(averages.userPacedActiveSec)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">Média Empresa:</span>
                <span className="text-slate-300 font-bold">{formatApproxTime(averages.companyPacedActiveSec)}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bloco 2 (Metade Direita): Benchmark Operacional (Internas vs Externas) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          
          {/* Card 4: TEMPO MÉDIO ATIVIDADES INTERNAS */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block truncate" title="Tempo médio do colaborador por tarefa interna trabalhada">
                  TEMPO MÉDIO ATIVIDADES INTERNAS
                </span>
              </div>
              <span className="text-3xl font-bold text-amber-300 font-mono block">
                {formatApproxTime(benchmarkMetrics.userAvgInternalSec)}
              </span>
            </div>

            <div className="pt-2 mt-2 border-t border-white/5 flex flex-col gap-1 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">{selectedUserId ? "Média Usuário:" : "Média Período:"}</span>
                <span className="text-amber-400 font-bold">{formatApproxTime(benchmarkMetrics.userAvgInternalSec)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">Média Empresa:</span>
                <span className="text-slate-300 font-bold">{formatApproxTime(benchmarkMetrics.companyAvgInternalSec)}</span>
              </div>
            </div>
          </div>

          {/* Card 5: TEMPO MÉDIO ATIVIDADES EXTERNAS */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.05)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-sky-400 block truncate" title="Tempo médio do colaborador por atividade externa / cliente">
                  TEMPO MÉDIO ATIVIDADES EXTERNAS
                </span>
              </div>
              <span className="text-3xl font-bold text-sky-300 font-mono block">
                {formatApproxTime(benchmarkMetrics.userAvgExternalSec)}
              </span>
            </div>

            <div className="pt-2 mt-2 border-t border-white/5 flex flex-col gap-1 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">{selectedUserId ? "Média Usuário:" : "Média Período:"}</span>
                <span className="text-sky-400 font-bold">{formatApproxTime(benchmarkMetrics.userAvgExternalSec)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">Média Empresa:</span>
                <span className="text-slate-300 font-bold">{formatApproxTime(benchmarkMetrics.companyAvgExternalSec)}</span>
              </div>
            </div>
          </div>

          {/* Card 6: ATIVIDADES INTERNAS x ATIVIDADES EXTERNAS */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-1 text-[10px] font-black uppercase tracking-widest mb-1">
                <span className="text-amber-400 truncate">INTERNAS</span>
                <span className="text-muted-foreground font-mono text-[10px]">x</span>
                <span className="text-sky-400 truncate">EXTERNAS</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-3xl font-bold font-mono text-amber-300">
                  {benchmarkMetrics.userPctInternal}%
                </span>
                <div className="h-1.5 flex-1 mx-2.5 rounded-full bg-slate-800/80 overflow-hidden flex">
                  <div 
                    className="bg-amber-400 h-full transition-all duration-300" 
                    style={{ width: `${benchmarkMetrics.userPctInternal}%` }} 
                  />
                  <div 
                    className="bg-sky-400 h-full transition-all duration-300" 
                    style={{ width: `${benchmarkMetrics.userPctExternal}%` }} 
                  />
                </div>
                <span className="text-3xl font-bold font-mono text-sky-300">
                  {benchmarkMetrics.userPctExternal}%
                </span>
              </div>
            </div>

            <div className="pt-2 mt-2 border-t border-white/5 flex flex-col gap-1 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">{selectedUserId ? "Média Usuário:" : "Média Período:"}</span>
                <span className="text-amber-400 font-bold">{benchmarkMetrics.userPctInternal}% <span className="text-slate-500 font-normal">/</span> <span className="text-sky-400">{benchmarkMetrics.userPctExternal}%</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase">Média Empresa:</span>
                <span className="text-slate-300 font-bold">{benchmarkMetrics.companyPctInternal}% <span className="text-slate-500 font-normal">/</span> <span className="text-slate-300">{benchmarkMetrics.companyPctExternal}%</span></span>
              </div>
            </div>
          </div>

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
                  <option value="thisWeek" className="bg-[#0f172a] text-white font-bold">Esta Semana</option>
                  <option value="last7" className="bg-[#0f172a] text-white font-bold">Últimos 7 dias</option>
                  <option value="last15" className="bg-[#0f172a] text-white font-bold">Últimos 15 dias</option>
                  <option value="month" className="bg-[#0f172a] text-white font-bold">Este Mês</option>
                  <option value="last30" className="bg-[#0f172a] text-white font-bold">Últimos 30 dias</option>
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

        {/* Painel Direito: Gráfico de Produtividade (%) Temporal OU Breakdown quando Expandido */}
        <div className="p-5 rounded-2xl bg-black/40 border border-white/5 flex flex-col min-h-[420px] overflow-hidden justify-between">
          <div className="mb-3 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 
                className="text-xs font-black uppercase tracking-widest text-slate-300"
                title={isExpandedActive ? "Relação de atividades trabalhadas no período" : "Evolução percentual de tempo ativo (produtividade) ao longo do período"}
              >
                {isExpandedActive ? "Breakdown por Atividades" : "Evolução da Produtividade (%)"}
              </h3>
              {!isExpandedActive && (
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
                  Usuário x Empresa
                </span>
              )}
            </div>

            {isExpandedActive ? (
              <div className="flex items-center gap-2">
                {highlightedActivityId && (
                  <button
                    type="button"
                    onClick={() => setHighlightedActivityId(null)}
                    className="px-2 py-0.5 rounded-lg text-[9px] font-mono uppercase bg-white/10 text-slate-300 hover:text-white cursor-pointer"
                  >
                    Limpar seleção
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsExpandedActive(false)}
                  className="px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase bg-slate-900 border border-white/20 text-slate-300 hover:text-white hover:border-emerald-400 cursor-pointer transition-all"
                >
                  Ver Gráfico
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-[10px] font-mono flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  <span className="text-emerald-300 font-bold uppercase">{selectedUserId ? "Média Usuário" : "Média Período"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                  <span className="text-amber-300 font-bold uppercase">Média Empresa</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2.5 rounded-sm bg-slate-400/30 border border-slate-400/60" />
                  <span className="text-slate-400 font-bold uppercase">Padrão Mercado</span>
                </div>
              </div>
            )}
          </div>

          {isExpandedActive ? (
            /* Lista de Atividades Detalhada (Breakdown) */
            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2">
              {metrics.activities.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                  Nenhuma atividade trabalhada no período.
                </div>
              ) : (
                metrics.activities.map((act) => {
                  const isSelected = highlightedActivityId === act.id;
                  const stageStyle = getStageStyle(act.stage, act.isInternal, act.title);

                  return (
                    <div
                      key={act.id}
                      onClick={() => handleOpenActivityCard(act.id)}
                      className={`group p-3 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? `${stageStyle.activeCardClass} ring-2 ring-emerald-400`
                          : act.hasActiveSession
                          ? stageStyle.activeCardClass
                          : "bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-sky-500/30 hover:shadow-md"
                      }`}
                      title="Clique para abrir o card detalhado desta atividade no CRM"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`font-mono text-[10px] font-black shrink-0 min-w-[18px] ${stageStyle.textClass}`}>
                          #{act.workOrderNumber}
                        </span>
                        <Briefcase className={`h-4 w-4 shrink-0 transition-colors ${stageStyle.textClass} ${act.hasActiveSession ? "animate-pulse" : "group-hover:brightness-125"}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={`text-xs font-bold truncate transition-colors ${stageStyle.textClass} group-hover:brightness-125`}>
                              {act.title}
                            </p>
                            {act.hasActiveSession && (
                              <span className={`font-mono text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest inline-flex items-center gap-1 animate-pulse shrink-0 ${stageStyle.activeBadgeClass}`}>
                                <span className={`h-1.5 w-1.5 rounded-full animate-ping ${stageStyle.activeDotClass}`} />
                                Ao Vivo
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground uppercase">
                            <span>
                              {act.reqNumber ? (
                                <>
                                  <span className={`font-bold ${stageStyle.textClass}`}>Nº {act.reqNumber}</span>
                                  <span> • </span>
                                </>
                              ) : null}
                              {act.sessionsCount} {act.sessionsCount === 1 ? "sessão" : "sessões"}
                            </span>
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
          ) : (
            /* Gráfico de Linha / Área de Produtividade (%) Temporal em Tela Cheia do Card */
            <div className="flex-1 w-full h-full min-h-[340px] pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={productivityTimelineData}
                  margin={{ top: 10, right: 10, left: -22, bottom: -5 }}
                >
                  <defs>
                    {/* Gradiente dinâmico na linha: Verde se >= empresa, Vermelho se < empresa */}
                    <linearGradient id="userStrokeGrad" x1="0" y1="0" x2="1" y2="0">
                      {userGradientStops.map((stop, i) => (
                        <stop key={`stroke-stop-${i}`} offset={stop.offset} stopColor={stop.color} />
                      ))}
                    </linearGradient>

                    {/* Gradiente dinâmico no preenchimento de área */}
                    <linearGradient id="userFillGrad" x1="0" y1="0" x2="1" y2="0">
                      {userGradientStops.map((stop, i) => (
                        <stop key={`fill-stop-${i}`} offset={stop.offset} stopColor={stop.color} stopOpacity={0.25} />
                      ))}
                    </linearGradient>

                    {/* Gradiente Amarelo / Âmbar para a Média Empresa */}
                    <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis 
                    dataKey="label" 
                    stroke="#64748b" 
                    fontSize={10} 
                    fontFamily="monospace"
                    tickLine={false}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    ticks={[0, 25, 50, 75, 100]} 
                    stroke="#64748b" 
                    fontSize={10} 
                    fontFamily="monospace"
                    unit="%"
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      const isAboveCompany = data ? data.userPct >= data.companyPct : true;
                      const userColor = isAboveCompany ? "#10b981" : "#f43f5e";

                      return (
                        <div className="p-3 rounded-xl bg-slate-950/95 border border-white/20 shadow-[0_0_25px_rgba(0,0,0,0.9)] backdrop-blur-md text-xs font-mono">
                          <div className="flex items-center justify-between gap-3 mb-2 pb-1 border-b border-white/10">
                            <p className="font-black text-white uppercase text-[11px]">
                              {data?.fullLabel || label}
                            </p>
                            <span className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase ${
                              isAboveCompany ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                            }`}>
                              {isAboveCompany ? "Acima da Empresa" : "Abaixo da Empresa"}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-4">
                              <span className="font-bold flex items-center gap-1.5" style={{ color: userColor }}>
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: userColor }} />
                                {selectedUserId ? "Média Usuário:" : "Média Período:"}
                              </span>
                              <span className="text-white font-black">{data?.userPct}% ({formatSeconds(data?.userSeconds || 0)})</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-amber-400 font-bold flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-amber-400" />
                                Média Empresa:
                              </span>
                              <span className="text-white font-black">{data?.companyPct}% ({formatSeconds(data?.companySeconds || 0)})</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 pt-1 mt-0.5 border-t border-white/5 text-[10px]">
                              <span className="text-slate-400 flex items-center gap-1.5">
                                <span className="h-1.5 w-2 rounded-sm bg-slate-400/40 border border-slate-400/60" />
                                Padrão Mercado:
                              </span>
                              <span className="text-slate-300 font-bold">{data?.marketMin}% a {data?.marketMax}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />

                  {/* 1. Faixa Padrão de Mercado em Tom Cinza Sombreado ao Fundo */}
                  <Area
                    type="monotone"
                    dataKey="marketRange"
                    name="Padrão Mercado"
                    stroke="rgba(148, 163, 184, 0.45)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    fill="rgba(148, 163, 184, 0.12)"
                    isAnimationActive={false}
                  />

                  {/* 2. Média da Empresa em Linha Amarela / Âmbar */}
                  <Area
                    type="monotone"
                    dataKey="companyPct"
                    name="Média Empresa"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#compGrad)"
                    dot={{ fill: "#f59e0b", r: 2.5, strokeWidth: 1.5, stroke: "#451a03" }}
                    activeDot={{ r: 4.5, fill: "#fbbf24", stroke: "#ffffff", strokeWidth: 2 }}
                  />

                  {/* 3. Média do Usuário em Linha Sólida Dinâmica (Verde / Vermelho) no Topo */}
                  <Area
                    type="monotone"
                    dataKey="userPct"
                    name={selectedUserId ? "Média Usuário" : "Média Período"}
                    stroke="url(#userStrokeGrad)"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#userFillGrad)"
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (cx === undefined || cy === undefined || !payload) return null;
                      const isAboveOrEqual = payload.userPct >= payload.companyPct;
                      const color = isAboveOrEqual ? "#10b981" : "#f43f5e";
                      return (
                        <circle
                          key={`user-dot-${props.index}`}
                          cx={cx}
                          cy={cy}
                          r={3.5}
                          fill={color}
                          stroke="#0f172a"
                          strokeWidth={1.5}
                        />
                      );
                    }}
                    activeDot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (cx === undefined || cy === undefined || !payload) return null;
                      const isAboveOrEqual = payload.userPct >= payload.companyPct;
                      const color = isAboveOrEqual ? "#34d399" : "#fb7185";
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5.5}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      );
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
