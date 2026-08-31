import { supabase } from "@/integrations/supabase/client";
import { getWorkdayProgress } from "@/lib/work-schedule";

export interface UserSalaryConfig {
  userId: string;
  baseSalary: number; // Salário base mensal em R$ (ex: 3500.00)
  chargesMultiplier: number; // Multiplicador de encargos (ex: 1.8 = 80% de encargos)
  monthlyHours: number; // Horas úteis de trabalho base/mês (padrão 160h)
  updatedAt?: string;
}

export interface WorkSessionCostItem {
  sessionId: string;
  dealId: string;
  dealTitle: string;
  reqNumber: string;
  isSubtask: boolean;
  subtaskTitle?: string;
  userId: string;
  userName: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds: number;
  isActive: boolean;
  baseSalary: number;
  chargesMultiplier: number;
  hourlyRate: number; // R$/hora
  sessionCost: number; // R$ total daquela sessão
}

export interface UserCostSummary {
  userId: string;
  userName: string;
  baseSalary: number;
  chargesMultiplier: number;
  totalMonthlyCost: number;
  hourlyRate: number;
  totalSeconds: number;
  totalHoursFormatted: string;
  totalCost: number;
  sessionsCount: number;
}

export interface DealCostAnalysis {
  dealId: string;
  dealTitle: string;
  reqNumber: string;
  isSubtaskDeal?: boolean;
  parentDealInfo?: { id?: string; title?: string; reqNumber?: string } | null;
  totalCost: number;
  totalSeconds: number;
  totalHoursFormatted: string;
  mainDealCost: number;
  mainDealSeconds: number;
  subtasksCost: number;
  subtasksSeconds: number;
  subtasksCount: number;
  collaboratorsCount: number;
  userSummaries: UserCostSummary[];
  allSessions: WorkSessionCostItem[];
  hasActiveSession: boolean;
}

const SALARY_STORAGE_KEY = "mykaflow_team_salary_configs_v1";

// Cache local em memória
let memorySalaryCache: Record<string, UserSalaryConfig> | null = null;

export function getLocalSalaryConfigs(): Record<string, UserSalaryConfig> {
  if (memorySalaryCache) return memorySalaryCache;
  try {
    const raw = localStorage.getItem(SALARY_STORAGE_KEY);
    if (raw) {
      memorySalaryCache = JSON.parse(raw);
      return memorySalaryCache || {};
    }
  } catch (e) {
    console.warn("Aviso ao ler configurações locais de salário:", e);
  }
  return {};
}

export function saveLocalSalaryConfig(config: UserSalaryConfig): void {
  const current = getLocalSalaryConfigs();
  const updated = {
    ...current,
    [config.userId]: {
      ...config,
      updatedAt: new Date().toISOString(),
    },
  };
  memorySalaryCache = updated;
  try {
    localStorage.setItem(SALARY_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn("Aviso ao salvar configurações locais de salário:", e);
  }
}

/**
 * Sincroniza todas as configurações de salário salvas na nuvem (Supabase)
 * e sobe automaticamente qualquer configuração existente no localStorage para a nuvem
 */
export async function syncSalaryConfigsFromSupabase(): Promise<Record<string, UserSalaryConfig>> {
  try {
    const local = { ...getLocalSalaryConfigs() };
    const cloudMap: Record<string, UserSalaryConfig> = {};

    // 1. Busca prioritária da tabela oficial profiles
    try {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, base_salary, charges_multiplier, monthly_hours, updated_at");

      if (profs && profs.length > 0) {
        profs.forEach((p: any) => {
          if (p.id) {
            cloudMap[p.id] = {
              userId: p.id,
              baseSalary: Number(p.base_salary) || 0,
              chargesMultiplier: Number(p.charges_multiplier) || 1.0,
              monthlyHours: Number(p.monthly_hours) || 160,
              updatedAt: p.updated_at || undefined,
            };
          }
        });
      }
    } catch (profErr) {
      console.warn("Aviso ao ler salários da tabela profiles:", profErr);
    }

    // 2. Fallback de histórico de alterações
    try {
      const { data, error } = await supabase
        .from("crm_deal_history")
        .select("*")
        .eq("action_type", "team_salary_config_updated")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        data.forEach((row) => {
          try {
            if (row.description) {
              const parsed = JSON.parse(row.description) as UserSalaryConfig;
              if (parsed.userId && !cloudMap[parsed.userId]?.baseSalary) {
                cloudMap[parsed.userId] = {
                  userId: parsed.userId,
                  baseSalary: Number(parsed.baseSalary) || 0,
                  chargesMultiplier: Number(parsed.chargesMultiplier) || 1.0,
                  monthlyHours: Number(parsed.monthlyHours) || 160,
                  updatedAt: parsed.updatedAt || row.created_at,
                };
              }
            }
          } catch (e) {}
        });
      }
    } catch (histErr) {}

    // 3. Mesclar tudo (nuvem + local)
    const finalMerged = { ...local, ...cloudMap };
    memorySalaryCache = finalMerged;
    try {
      localStorage.setItem(SALARY_STORAGE_KEY, JSON.stringify(finalMerged));
    } catch (e) {}

    return finalMerged;
  } catch (err) {
    console.warn("Aviso ao sincronizar configurações de salário do Supabase:", err);
  }
  return getLocalSalaryConfigs();
}

// Sincronização inicial automática em background
syncSalaryConfigsFromSupabase();

/**
 * Obtém a configuração de salário de um usuário (com valores padrão se não configurado)
 */
export function getUserSalaryConfig(userId: string): UserSalaryConfig {
  const configs = getLocalSalaryConfigs();
  if (configs[userId]) {
    return {
      userId,
      baseSalary: Number(configs[userId].baseSalary) || 0,
      chargesMultiplier: Number(configs[userId].chargesMultiplier) || 1.0,
      monthlyHours: Number(configs[userId].monthlyHours) || 160,
      updatedAt: configs[userId].updatedAt,
    };
  }
  return {
    userId,
    baseSalary: 0,
    chargesMultiplier: 1.0,
    monthlyHours: 160,
  };
}

/**
 * Salva a configuração de salário do usuário (no storage local e persiste no Supabase em tempo real)
 */
export async function saveUserSalaryConfig(
  userId: string,
  baseSalary: number,
  chargesMultiplier: number,
  monthlyHours: number = 160
): Promise<void> {
  const config: UserSalaryConfig = {
    userId,
    baseSalary: Math.max(0, Number(baseSalary) || 0),
    chargesMultiplier: Math.max(1.0, Number(chargesMultiplier) || 1.0),
    monthlyHours: Math.max(1, Number(monthlyHours) || 160),
    updatedAt: new Date().toISOString(),
  };

  // 1. Salvar no cache local e localStorage para resposta instantânea
  saveLocalSalaryConfig(config);

  // 2. Persistir diretamente na tabela profiles
  try {
    await supabase
      .from("profiles")
      .update({
        base_salary: config.baseSalary,
        charges_multiplier: config.chargesMultiplier,
        monthly_hours: config.monthlyHours,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", userId);
  } catch (profErr) {
    console.warn("Aviso ao atualizar profiles com salário:", profErr);
  }

  // 3. Registrar auditoria em crm_deal_history
  try {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id || null;
    const currentUserEmail = authData?.user?.email || "Admin";

    await supabase.from("crm_deal_history").insert({
      deal_id: null as any,
      action_type: "team_salary_config_updated",
      user_id: currentUserId,
      user_name: currentUserEmail,
      description: JSON.stringify(config),
      created_at: new Date().toISOString(),
    });
  } catch (supabaseErr) {
    console.warn("Aviso ao salvar histórico de salário:", supabaseErr);
  }
}

/**
 * Calcula a taxa horária de um colaborador
 * Custo Mensal Total = Salário Base * Multiplicador
 * Taxa Horária = Custo Mensal Total / 160h
 */
export function computeHourlyRate(
  baseSalary: number,
  chargesMultiplier: number = 1.0,
  monthlyHours: number = 160
): number {
  const safeSalary = Math.max(0, Number(baseSalary) || 0);
  const safeMult = Math.max(1.0, Number(chargesMultiplier) || 1.0);
  const safeHours = Math.max(1, Number(monthlyHours) || 160);
  const monthlyTotal = safeSalary * safeMult;
  return monthlyTotal / safeHours;
}

/**
 * Calcula o custo de uma sessão em função da sua duração em segundos
 */
export function computeSessionCost(durationSeconds: number, hourlyRate: number): number {
  const safeDuration = Math.max(0, Number(durationSeconds) || 0);
  const safeRate = Math.max(0, Number(hourlyRate) || 0);
  const hours = safeDuration / 3600;
  return hours * safeRate;
}

/**
 * Formata segundos em formato legível: "2h 45m 10s"
 */
export function formatSecondsDetailed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

/**
 * Extrai número da requisição de uma atividade
 */
function extractReqNumber(deal: any, allDeals: any[]): string {
  if (deal.req_number) return deal.req_number;
  if (!deal.created_at) return "01";
  const dealDate = new Date(deal.created_at);
  const d = String(dealDate.getDate()).padStart(2, "0");
  const m = String(dealDate.getMonth() + 1).padStart(2, "0");
  const y = String(dealDate.getFullYear()).slice(-2);

  const sameDayDeals = (allDeals || [])
    .filter((other) => {
      if (!other.created_at) return false;
      const otherDate = new Date(other.created_at);
      return (
        otherDate.getDate() === dealDate.getDate() &&
        otherDate.getMonth() === dealDate.getMonth() &&
        otherDate.getFullYear() === dealDate.getFullYear()
      );
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const index = sameDayDeals.findIndex((item) => item.id === deal.id);
  const seq = index !== -1 ? String(index + 1).padStart(2, "0") : "01";
  return `${d}.${m}.${y} #${seq}`;
}

/**
 * Extrai e calcula todas as sessões de trabalho e o custo total da atividade principal e suas vinculadas
 */
export function extractDealCostAnalysis(
  mainDeal: any,
  allDeals: any[],
  nowMs: number = Date.now()
): DealCostAnalysis {
  if (!mainDeal) {
    return {
      dealId: "",
      dealTitle: "",
      reqNumber: "",
      totalCost: 0,
      totalSeconds: 0,
      totalHoursFormatted: "0s",
      mainDealCost: 0,
      mainDealSeconds: 0,
      subtasksCost: 0,
      subtasksSeconds: 0,
      subtasksCount: 0,
      collaboratorsCount: 0,
      userSummaries: [],
      allSessions: [],
      hasActiveSession: false,
    };
  }

  const mainReqNumber = extractReqNumber(mainDeal, allDeals);

  // 1. Identificar todas as subtarefas vinculadas a esta atividade principal
  const linkedSubtasks = (allDeals || []).filter((d) => {
    if (!d || d.id === mainDeal.id) return false;
    if (!d.notes) return false;

    // A. Busca via Tag [PARENT_DEAL:{...}]
    try {
      if (d.notes.includes("[PARENT_DEAL:")) {
        const startIdx = d.notes.indexOf("[PARENT_DEAL:");
        const jsonStart = startIdx + "[PARENT_DEAL:".length;
        const endIdx = d.notes.indexOf("}]", jsonStart);
        let parsed: any = null;
        if (endIdx !== -1) {
          parsed = JSON.parse(d.notes.substring(jsonStart, endIdx + 1));
        } else {
          const match = d.notes.match(/\[PARENT_DEAL:(\{.*?\})\]/s) || d.notes.match(/\[PARENT_DEAL:(.*?)\]/s);
          if (match && match[1]) parsed = JSON.parse(match[1]);
        }

        if (parsed) {
          const parentId = parsed.parentId || parsed.id;
          const parentReq = parsed.parentReq || parsed.reqNumber;
          if (parentId && parentId === mainDeal.id) return true;
          if (parentReq && (parentReq === mainReqNumber || parentReq === mainDeal.req_number)) return true;
        }
      }
    } catch (e) {}

    // B. Fallback via texto nos notes: "Atividade vinculada a: ... (Nº ...)"
    try {
      const match = d.notes.match(/(?:Tarefa|Atividade)\s*vinculada\s*a:\s*(.*?)\s*\(Nº\s*([0-9.]+)\)/i);
      if (match && match[2]) {
        const reqNum = match[2].trim();
        if (reqNum === mainReqNumber || reqNum === mainDeal.req_number) return true;
      }
    } catch (e) {}

    return false;
  });

  // Identificar se a atividade aberta é ela mesma uma atividade vinculada a outra primária
  let parentDealInfo: { id?: string; title?: string; reqNumber?: string } | null = null;
  try {
    if (mainDeal.notes?.includes("[PARENT_DEAL:")) {
      const startIdx = mainDeal.notes.indexOf("[PARENT_DEAL:");
      const jsonStart = startIdx + "[PARENT_DEAL:".length;
      const endIdx = mainDeal.notes.indexOf("}]", jsonStart);
      let parsed: any = null;
      if (endIdx !== -1) {
        parsed = JSON.parse(mainDeal.notes.substring(jsonStart, endIdx + 1));
      } else {
        const match = mainDeal.notes.match(/\[PARENT_DEAL:(\{.*?\})\]/s) || mainDeal.notes.match(/\[PARENT_DEAL:(.*?)\]/s);
        if (match && match[1]) parsed = JSON.parse(match[1]);
      }
      if (parsed) {
        parentDealInfo = {
          id: parsed.parentId || parsed.id,
          title: parsed.parentTitle || parsed.title,
          reqNumber: parsed.parentReq || parsed.reqNumber,
        };
      }
    }
  } catch (e) {}

  const allRelevantDeals = [
    { deal: mainDeal, isSubtask: false, subtaskTitle: undefined },
    ...linkedSubtasks.map((st) => ({
      deal: st,
      isSubtask: true,
      subtaskTitle: st.title.replace(/^\[TAREFA\]\s*/i, "").replace(/^\[VINCULADA\]\s*/i, "").trim(),
    })),
  ];

  const sessions: WorkSessionCostItem[] = [];
  let hasActiveSession = false;

  allRelevantDeals.forEach(({ deal, isSubtask, subtaskTitle }) => {
    if (!deal || !deal.notes) return;
    const dealReq = extractReqNumber(deal, allDeals);

    // A. Sessões Concluídas [WORK_LOG:{...}]
    try {
      const regex = /\[WORK_LOG:(.*?)\]/g;
      let match;
      while ((match = regex.exec(deal.notes)) !== null) {
        if (match[1]) {
          const parsed = JSON.parse(match[1]);
          const userId = parsed.user_id;
          const salaryConfig = getUserSalaryConfig(userId);
          const hourlyRate = computeHourlyRate(salaryConfig.baseSalary, salaryConfig.chargesMultiplier, salaryConfig.monthlyHours);
          const durationSeconds = Number(parsed.duration_seconds) || 0;
          const sessionCost = computeSessionCost(durationSeconds, hourlyRate);

          sessions.push({
            sessionId: parsed.id || `log-${Math.random().toString(36).slice(2, 8)}`,
            dealId: deal.id,
            dealTitle: deal.title,
            reqNumber: dealReq,
            isSubtask,
            subtaskTitle,
            userId,
            userName: (parsed.user_name || "Colaborador").toUpperCase(),
            startedAt: parsed.started_at,
            endedAt: parsed.ended_at,
            durationSeconds,
            isActive: false,
            baseSalary: salaryConfig.baseSalary,
            chargesMultiplier: salaryConfig.chargesMultiplier,
            hourlyRate,
            sessionCost,
          });
        }
      }
    } catch (e) {}

    // B. Sessão Ativa em Tempo Real [WORK_ACTIVE:{...}]
    try {
      if (deal.notes.includes("[WORK_ACTIVE:")) {
        const activeMatch = deal.notes.match(/\[WORK_ACTIVE:(.*?)\]/);
        if (activeMatch && activeMatch[1]) {
          const parsed = JSON.parse(activeMatch[1]);
          const userId = parsed.userId;
          const startedAtMs = new Date(parsed.startedAt).getTime();
          const liveDuration = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
          const salaryConfig = getUserSalaryConfig(userId);
          const hourlyRate = computeHourlyRate(salaryConfig.baseSalary, salaryConfig.chargesMultiplier, salaryConfig.monthlyHours);
          const sessionCost = computeSessionCost(liveDuration, hourlyRate);

          hasActiveSession = true;

          sessions.push({
            sessionId: parsed.id || `active-${deal.id}`,
            dealId: deal.id,
            dealTitle: deal.title,
            reqNumber: dealReq,
            isSubtask,
            subtaskTitle,
            userId,
            userName: (parsed.userName || "Colaborador").toUpperCase(),
            startedAt: parsed.startedAt,
            endedAt: null,
            durationSeconds: liveDuration,
            isActive: true,
            baseSalary: salaryConfig.baseSalary,
            chargesMultiplier: salaryConfig.chargesMultiplier,
            hourlyRate,
            sessionCost,
          });
        }
      }
    } catch (e) {}
  });

  // Ordenar sessões da mais recente para a mais antiga
  sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // 2. Agrupamento e Totais por Usuário
  const userMap = new Map<string, UserCostSummary>();

  sessions.forEach((sess) => {
    const existing = userMap.get(sess.userId) || {
      userId: sess.userId,
      userName: sess.userName,
      baseSalary: sess.baseSalary,
      chargesMultiplier: sess.chargesMultiplier,
      totalMonthlyCost: sess.baseSalary * sess.chargesMultiplier,
      hourlyRate: sess.hourlyRate,
      totalSeconds: 0,
      totalHoursFormatted: "0s",
      totalCost: 0,
      sessionsCount: 0,
    };

    existing.totalSeconds += sess.durationSeconds;
    existing.totalCost += sess.sessionCost;
    existing.sessionsCount += 1;
    userMap.set(sess.userId, existing);
  });

  const userSummaries: UserCostSummary[] = Array.from(userMap.values()).map((u) => ({
    ...u,
    totalHoursFormatted: formatSecondsDetailed(u.totalSeconds),
  }));

  // Ordenar usuários por maior custo gerado
  userSummaries.sort((a, b) => b.totalCost - a.totalCost);

  // 3. Totais Globais
  let totalCost = 0;
  let totalSeconds = 0;
  let mainDealCost = 0;
  let mainDealSeconds = 0;
  let subtasksCost = 0;
  let subtasksSeconds = 0;

  sessions.forEach((s) => {
    totalCost += s.sessionCost;
    totalSeconds += s.durationSeconds;

    if (s.isSubtask) {
      subtasksCost += s.sessionCost;
      subtasksSeconds += s.durationSeconds;
    } else {
      mainDealCost += s.sessionCost;
      mainDealSeconds += s.durationSeconds;
    }
  });

  return {
    dealId: mainDeal.id,
    dealTitle: mainDeal.title,
    reqNumber: mainReqNumber,
    isSubtaskDeal: Boolean(parentDealInfo),
    parentDealInfo,
    totalCost,
    totalSeconds,
    totalHoursFormatted: formatSecondsDetailed(totalSeconds),
    mainDealCost,
    mainDealSeconds,
    subtasksCost,
    subtasksSeconds,
    subtasksCount: linkedSubtasks.length,
    collaboratorsCount: userSummaries.length,
    userSummaries,
    allSessions: sessions,
    hasActiveSession,
  };
}

/**
 * Calcula o total de segundos trabalhados por um usuário em um determinado mês
 */
export function getUserMonthlyWorkedSeconds(
  userId: string,
  deals: Array<{ id: string; notes?: string | null }>,
  targetDate: Date = new Date(),
  currentLiveStartedAt?: string | null
): number {
  if (!userId || !deals) return 0;
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();

  let totalSeconds = 0;

  deals.forEach((deal) => {
    if (!deal.notes) return;

    // 1. Sessões Concluídas [WORK_LOG:{...}]
    try {
      const regex = /\[WORK_LOG:(.*?)\]/g;
      let match;
      while ((match = regex.exec(deal.notes)) !== null) {
        if (match[1]) {
          const parsed = JSON.parse(match[1]);
          if (parsed.user_id === userId && parsed.started_at) {
            const sessDate = new Date(parsed.started_at);
            if (sessDate.getFullYear() === targetYear && sessDate.getMonth() === targetMonth) {
              totalSeconds += Number(parsed.duration_seconds) || 0;
            }
          }
        }
      }
    } catch (e) {}
  });

  // 2. Sessão ativa em tempo real
  if (currentLiveStartedAt) {
    try {
      const liveDate = new Date(currentLiveStartedAt);
      if (liveDate.getFullYear() === targetYear && liveDate.getMonth() === targetMonth) {
        const liveSec = Math.max(0, Math.floor((Date.now() - liveDate.getTime()) / 1000));
        totalSeconds += liveSec;
      }
    } catch (e) {}
  }

  return totalSeconds;
}

/**
 * Calcula a taxa de ocupação / produtividade histórica do colaborador e o custo efetivo / hora
 * sincronizada 100% com o cálculo de "Média Usuário" do WorkHoursManager:
 * 
 * 1. Coleta todas as sessões do usuário (WORK_LOG + WORK_ACTIVE).
 * 2. Mapeia os dias únicos em que o usuário teve atividade.
 * 3. Para cada dia com atividade:
 *    - Se for hoje: usa os segundos transcorridos de expediente até o momento (todayProgress.elapsedWorkdaySeconds).
 *    - Se for dia anterior: usa o expediente do dia (9h seg-qui, 8h sex).
 * 4. Taxa de Ocupação Média do Usuário (%) = (userTotalActiveSec / userTotalElapsedSec)
 * 5. Custo Efetivo / h = Custo Nominal / (userAvgActivePct / 100)
 */
export function computeHistoricalProductivityRate(
  userId: string,
  deals: Array<{ id: string; notes?: string | null }>,
  baseSalary: number,
  chargesMultiplier: number = 1.0,
  nominalMonthlyHours: number = 160,
  currentLiveStartedAt?: string | null
): {
  effectiveHourlyRate: number;
  nominalHourlyRate: number;
  occupancyRate: number;
  totalWorkedHours: number;
  expectedWorkHours: number;
  totalMonthlyCost: number;
  daysAnalyzed: number;
} {
  const safeSalary = Math.max(0, Number(baseSalary) || 0);
  const safeMult = Math.max(1.0, Number(chargesMultiplier) || 1.0);
  const totalMonthlyCost = safeSalary * safeMult;
  const safeNominalHours = Math.max(1, Number(nominalMonthlyHours) || 160);
  const nominalHourlyRate = totalMonthlyCost / safeNominalHours;

  if (!userId || !deals || totalMonthlyCost <= 0) {
    return {
      effectiveHourlyRate: nominalHourlyRate,
      nominalHourlyRate,
      occupancyRate: 1.0,
      totalWorkedHours: 0,
      expectedWorkHours: 0,
      totalMonthlyCost,
      daysAnalyzed: 0,
    };
  }

  // 1. Extrair todas as sessões do usuário
  let userTotalActiveSec = 0;
  const userUniqueDays = new Set<string>();
  const today = new Date();
  const todayStr = today.toDateString();
  const todayProgress = getWorkdayProgress(today);

  deals.forEach((deal) => {
    if (!deal.notes) return;
    try {
      const regex = /\[WORK_LOG:(.*?)\]/g;
      let match;
      while ((match = regex.exec(deal.notes)) !== null) {
        if (match[1]) {
          const parsed = JSON.parse(match[1]);
          if (parsed.user_id === userId && parsed.started_at) {
            const sec = Number(parsed.duration_seconds) || 0;
            userTotalActiveSec += sec;
            userUniqueDays.add(new Date(parsed.started_at).toDateString());
          }
        }
      }
    } catch (e) {}
  });

  // Sessão ao vivo atual
  if (currentLiveStartedAt) {
    try {
      const liveDate = new Date(currentLiveStartedAt);
      const liveSec = Math.max(0, Math.floor((Date.now() - liveDate.getTime()) / 1000));
      userTotalActiveSec += liveSec;
      userUniqueDays.add(liveDate.toDateString());
    } catch (e) {}
  }

  // 2. Calcular o tempo de expediente transcorrido nos dias de atividade do colaborador
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

  // 3. Taxa de ocupação percentual idêntica à do card de horas
  let userAvgActivePct = 100;
  if (userTotalElapsedSec > 0) {
    userAvgActivePct = Math.min(100, Math.round((userTotalActiveSec / userTotalElapsedSec) * 100));
  } else if (userTotalActiveSec > 0) {
    userAvgActivePct = 100;
  }

  const occupancyRate = Math.max(0.10, userAvgActivePct / 100);
  const effectiveHourlyRate = nominalHourlyRate / occupancyRate;

  return {
    effectiveHourlyRate,
    nominalHourlyRate,
    occupancyRate: userAvgActivePct / 100,
    totalWorkedHours: userTotalActiveSec / 3600,
    expectedWorkHours: userTotalElapsedSec / 3600,
    totalMonthlyCost,
    daysAnalyzed: userUniqueDays.size,
  };
}
