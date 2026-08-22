// src/lib/work-time-tracker.ts
// Motor de Auditoria e Rastreamento de Métricas de Produtividade (Login, Atividades, Inatividade)

import { isBusinessWorkTime } from "./work-schedule";

export interface LoginAuditLog {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  loggedAtIso: string;
  expectedStartLabel: string;
  status: "on_time" | "late" | "off_hours" | "weekend_or_holiday";
  statusDescription: string;
}

export interface ActivityAuditLog {
  id: string;
  dealId: string;
  dealTitle: string;
  userId: string;
  userName: string;
  startedAtIso: string;
  endedAtIso: string;
  durationSeconds: number;
  durationFormatted: string;
  closeType: "manual" | "auto_lunch" | "auto_end_of_day" | "auto_off_hours";
  notes?: string;
}

export interface InactivityAuditLog {
  id: string;
  userId: string;
  userName: string;
  dateStr: string; // YYYY-MM-DD
  totalIdleSeconds: number;
  lastActiveAtIso: string;
}

const STORAGE_KEYS = {
  LOGIN_LOGS: "mykaflow_audit_login_logs_v1",
  ACTIVITY_LOGS: "mykaflow_audit_activity_logs_v1",
  INACTIVITY_LOGS: "mykaflow_audit_inactivity_logs_v1",
};

// 1. Registro de Auditoria de Login ("Ponto Digital")
export function recordLoginAudit(user: {
  id: string;
  email?: string;
  user_metadata?: { display_name?: string; full_name?: string };
}): LoginAuditLog {
  const now = new Date();
  const schedule = isBusinessWorkTime(now);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  const startExpedienteMinutes = 7 * 60 + 30; // 07:30

  let status: LoginAuditLog["status"] = "off_hours";
  let statusDescription = "Login fora do expediente";

  if (schedule.isWeekend || schedule.isHoliday) {
    status = "weekend_or_holiday";
    statusDescription = schedule.isHoliday
      ? `Login em feriado (${schedule.holidayName})`
      : "Login em final de semana";
  } else if (schedule.isLunch) {
    status = "off_hours";
    statusDescription = "Login no horário de almoço";
  } else if (currentMinutes <= startExpedienteMinutes + 10) {
    // Até 07:40 tolerância normal
    status = "on_time";
    statusDescription = "Login pontual no início do expediente";
  } else if (currentMinutes < 12 * 60) {
    const minAtraso = currentMinutes - startExpedienteMinutes;
    status = "late";
    statusDescription = `Entrada com ${minAtraso} min após início das 07h30`;
  } else {
    status = "on_time";
    statusDescription = "Login no expediente da tarde";
  }

  const log: LoginAuditLog = {
    id: crypto.randomUUID(),
    userId: user.id,
    userEmail: user.email || "sem_email",
    userName: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário",
    loggedAtIso: now.toISOString(),
    expectedStartLabel: "07h30",
    status,
    statusDescription,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOGIN_LOGS);
    const list: LoginAuditLog[] = raw ? JSON.parse(raw) : [];
    list.unshift(log);
    // Limita aos últimos 1000 registros para controle de tamanho
    localStorage.setItem(STORAGE_KEYS.LOGIN_LOGS, JSON.stringify(list.slice(0, 1000)));
  } catch (e) {
    console.warn("Erro ao salvar auditoria de login:", e);
  }

  return log;
}

// 2. Registro de Auditoria de Sessão de Atividade
export function recordActivitySessionAudit(session: {
  dealId: string;
  dealTitle: string;
  userId: string;
  userName: string;
  startedAtIso: string;
  endedAtIso: string;
  durationSeconds: number;
  durationFormatted: string;
  closeType: ActivityAuditLog["closeType"];
  notes?: string;
}): ActivityAuditLog {
  const log: ActivityAuditLog = {
    id: crypto.randomUUID(),
    dealId: session.dealId,
    dealTitle: session.dealTitle,
    userId: session.userId,
    userName: session.userName,
    startedAtIso: session.startedAtIso,
    endedAtIso: session.endedAtIso,
    durationSeconds: session.durationSeconds,
    durationFormatted: session.durationFormatted,
    closeType: session.closeType,
    notes: session.notes,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOGS);
    const list: ActivityAuditLog[] = raw ? JSON.parse(raw) : [];
    list.unshift(log);
    localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOGS, JSON.stringify(list.slice(0, 2000)));
  } catch (e) {
    console.warn("Erro ao salvar auditoria de atividade:", e);
  }

  return log;
}

// 3. Registro de Inatividade Durante o Expediente (Logged In, Sem Atividade Ativa)
export function recordInactivitySeconds(
  userId: string,
  userName: string,
  addedSeconds: number
): void {
  const now = new Date();
  const schedule = isBusinessWorkTime(now);
  // Apenas contabiliza inatividade se estiver DENTRO do horário de expediente
  if (!schedule.allowed) return;

  const dateStr = now.toISOString().split("T")[0];

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INACTIVITY_LOGS);
    const list: InactivityAuditLog[] = raw ? JSON.parse(raw) : [];
    const index = list.findIndex((item) => item.userId === userId && item.dateStr === dateStr);

    if (index >= 0) {
      list[index].totalIdleSeconds += addedSeconds;
      list[index].lastActiveAtIso = now.toISOString();
    } else {
      list.push({
        id: crypto.randomUUID(),
        userId,
        userName,
        dateStr,
        totalIdleSeconds: addedSeconds,
        lastActiveAtIso: now.toISOString(),
      });
    }

    localStorage.setItem(STORAGE_KEYS.INACTIVITY_LOGS, JSON.stringify(list.slice(-365)));
  } catch (e) {
    console.warn("Erro ao salvar tempo de inatividade:", e);
  }
}

// Utilitário para consultar o resumo de métricas de um usuário ou geral
export function getProductivityAuditSummary(userId?: string) {
  try {
    const rawLogins = localStorage.getItem(STORAGE_KEYS.LOGIN_LOGS);
    const rawActivities = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOGS);
    const rawInactivity = localStorage.getItem(STORAGE_KEYS.INACTIVITY_LOGS);

    let logins: LoginAuditLog[] = rawLogins ? JSON.parse(rawLogins) : [];
    let activities: ActivityAuditLog[] = rawActivities ? JSON.parse(rawActivities) : [];
    let inactivity: InactivityAuditLog[] = rawInactivity ? JSON.parse(rawInactivity) : [];

    if (userId) {
      logins = logins.filter((l) => l.userId === userId);
      activities = activities.filter((a) => a.userId === userId);
      inactivity = inactivity.filter((i) => i.userId === userId);
    }

    const totalWorkSeconds = activities.reduce((sum, a) => sum + (a.durationSeconds || 0), 0);
    const totalIdleSeconds = inactivity.reduce((sum, i) => sum + (i.totalIdleSeconds || 0), 0);

    return {
      logins,
      activities,
      inactivity,
      totalWorkSeconds,
      totalIdleSeconds,
      totalActivitiesCount: activities.length,
      autoCutoffCount: activities.filter((a) => a.closeType !== "manual").length,
    };
  } catch {
    return {
      logins: [],
      activities: [],
      inactivity: [],
      totalWorkSeconds: 0,
      totalIdleSeconds: 0,
      totalActivitiesCount: 0,
      autoCutoffCount: 0,
    };
  }
}
