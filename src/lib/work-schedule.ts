// src/lib/work-schedule.ts
// Regras e utilitários de horários de expediente, almoço, finais de semana e feriados nacionais

export interface WorkScheduleInfo {
  allowed: boolean;
  isWorkHours: boolean;
  isLunch: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  reason?: string;
  scheduleDescription: string;
  nextWorkTimeLabel?: string;
}

// Feriados Nacionais Fixos no Brasil
const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "Confraternização Universal (Ano Novo)",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "09-07": "Independência do Brasil",
  "10-12": "Nossa Senhora Aparecida",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "11-20": "Dia da Consciência Negra",
  "12-25": "Natal",
};

// Feriados Móveis para os anos recentes (Carnaval, Sexta-feira Santa, Corpus Christi)
const MOBILE_HOLIDAYS: Record<string, string> = {
  // 2026
  "2026-02-16": "Carnaval (Segunda-feira)",
  "2026-02-17": "Carnaval (Terça-feira)",
  "2026-04-03": "Sexta-feira Santa",
  "2026-06-04": "Corpus Christi",
  // 2027
  "2027-02-08": "Carnaval (Segunda-feira)",
  "2027-02-09": "Carnaval (Terça-feira)",
  "2027-03-26": "Sexta-feira Santa",
  "2027-05-27": "Corpus Christi",
};

export function isNationalHoliday(date: Date = new Date()): { isHoliday: boolean; holidayName?: string } {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();

  const monthDayKey = `${month}-${day}`;
  const fullDateKey = `${year}-${month}-${day}`;

  if (FIXED_HOLIDAYS[monthDayKey]) {
    return { isHoliday: true, holidayName: FIXED_HOLIDAYS[monthDayKey] };
  }

  if (MOBILE_HOLIDAYS[fullDateKey]) {
    return { isHoliday: true, holidayName: MOBILE_HOLIDAYS[fullDateKey] };
  }

  return { isHoliday: false };
}

export function getWorkDayCutoffMinutes(date: Date = new Date()): {
  startMinutes: number;
  lunchStartMinutes: number;
  lunchEndMinutes: number;
  endMinutes: number;
  dayName: string;
} {
  const day = date.getDay(); // 0 = Domingo, 1 = Segunda, ..., 5 = Sexta, 6 = Sábado
  const isFriday = day === 5;

  return {
    startMinutes: 7 * 60 + 30,       // 07:30 (450 min)
    lunchStartMinutes: 12 * 60,      // 12:00 (720 min)
    lunchEndMinutes: 13 * 60,        // 13:00 (780 min)
    endMinutes: isFriday ? 16 * 60 + 30 : 17 * 60 + 30, // Sex: 16:30 (990 min) | Seg-Qui: 17:30 (1050 min)
    dayName: ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][day],
  };
}

export function isBusinessWorkTime(date: Date = new Date()): WorkScheduleInfo {
  const day = date.getDay();
  const scheduleDescription = "Seg-Qui: 07h30 às 17h30 | Sex: 07h30 às 16h30 (Almoço: 12h00 às 13h00)";

  // 1. Finais de semana (Sábado e Domingo)
  if (day === 0 || day === 6) {
    return {
      allowed: false,
      isWorkHours: false,
      isLunch: false,
      isWeekend: true,
      isHoliday: false,
      reason: "Fora de expediente (final de semana).",
      scheduleDescription,
      nextWorkTimeLabel: "Próximo dia útil às 07h30",
    };
  }

  // 2. Feriados Nacionais
  const holidayCheck = isNationalHoliday(date);
  if (holidayCheck.isHoliday) {
    return {
      allowed: false,
      isWorkHours: false,
      isLunch: false,
      isWeekend: false,
      isHoliday: true,
      holidayName: holidayCheck.holidayName,
      reason: `Feriado Nacional (${holidayCheck.holidayName}).`,
      scheduleDescription,
      nextWorkTimeLabel: "Próximo dia útil às 07h30",
    };
  }

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  const limits = getWorkDayCutoffMinutes(date);

  // 3. Antes do início do expediente (< 07:30)
  if (currentMinutes < limits.startMinutes) {
    return {
      allowed: false,
      isWorkHours: false,
      isLunch: false,
      isWeekend: false,
      isHoliday: false,
      reason: "Antes do início do expediente (início às 07h30).",
      scheduleDescription,
      nextWorkTimeLabel: "Hoje às 07h30",
    };
  }

  // 4. Horário de Almoço (12:00 às 13:00)
  if (currentMinutes >= limits.lunchStartMinutes && currentMinutes < limits.lunchEndMinutes) {
    return {
      allowed: false,
      isWorkHours: false,
      isLunch: true,
      isWeekend: false,
      isHoliday: false,
      reason: "HORÁRIO DE ALMOÇO",
      scheduleDescription,
      nextWorkTimeLabel: "Hoje às 13h00",
    };
  }

  // 5. Após o encerramento do expediente
  if (currentMinutes >= limits.endMinutes) {
    const isFriday = day === 5;
    const endStr = isFriday ? "16h30" : "17h30";
    return {
      allowed: false,
      isWorkHours: false,
      isLunch: false,
      isWeekend: false,
      isHoliday: false,
      reason: `Expediente encerrado para hoje (${endStr}).`,
      scheduleDescription,
      nextWorkTimeLabel: isFriday ? "Segunda-feira às 07h30" : "Amanhã às 07h30",
    };
  }

  // 6. Dentro do expediente de trabalho
  return {
    allowed: true,
    isWorkHours: true,
    isLunch: false,
    isWeekend: false,
    isHoliday: false,
    scheduleDescription,
  };
}

// Verifica se uma sessão de trabalho iniciada ultrapassou algum corte de horário (12:00 ou 17:30/16:30)
export function getAutoCutoffInfo(startedAtIso: string, now: Date = new Date()): {
  shouldCutoff: boolean;
  cutoffTimeIso?: string;
  reason?: "auto_lunch" | "auto_end_of_day" | "auto_off_hours";
  reasonLabel?: string;
} {
  const startDate = new Date(startedAtIso);
  if (isNaN(startDate.getTime())) return { shouldCutoff: false };

  const startDay = startDate.getDay();
  const startHours = startDate.getHours();
  const startMinutes = startDate.getMinutes();
  const startTotalMinutes = startHours * 60 + startMinutes;

  const nowHours = now.getHours();
  const nowMinutes = now.getMinutes();
  const nowTotalMinutes = nowHours * 60 + nowMinutes;

  const limits = getWorkDayCutoffMinutes(now);

  // 1. Corte de Almoço: Se começou antes das 12:00 e o horário atual é >= 12:00
  if (startTotalMinutes < limits.lunchStartMinutes && nowTotalMinutes >= limits.lunchStartMinutes) {
    const cutoffDate = new Date(startDate);
    cutoffDate.setHours(12, 0, 0, 0);
    return {
      shouldCutoff: true,
      cutoffTimeIso: cutoffDate.toISOString(),
      reason: "auto_lunch",
      reasonLabel: "Encerramento automático: Horário de Almoço (12h00)",
    };
  }

  // 2. Corte de Fim de Expediente: Se começou antes do fim e o horário atual é >= fim
  if (startTotalMinutes < limits.endMinutes && nowTotalMinutes >= limits.endMinutes) {
    const cutoffDate = new Date(startDate);
    const endH = Math.floor(limits.endMinutes / 60);
    const endM = limits.endMinutes % 60;
    cutoffDate.setHours(endH, endM, 0, 0);
    return {
      shouldCutoff: true,
      cutoffTimeIso: cutoffDate.toISOString(),
      reason: "auto_end_of_day",
      reasonLabel: `Encerramento automático: Fim do Expediente (${String(endH).padStart(2, "0")}h${String(endM).padStart(2, "0")})`,
    };
  }

  // 3. Se a atividade ficou aberta de um dia anterior ou fim de semana
  const isDifferentDay = startDate.toDateString() !== now.toDateString();
  if (isDifferentDay) {
    const endH = Math.floor(limits.endMinutes / 60);
    const endM = limits.endMinutes % 60;
    const cutoffDate = new Date(startDate);
    cutoffDate.setHours(endH, endM, 0, 0);
    return {
      shouldCutoff: true,
      cutoffTimeIso: cutoffDate.toISOString(),
      reason: "auto_end_of_day",
      reasonLabel: "Encerramento automático: Atividade aberta em data anterior",
    };
  }

  return { shouldCutoff: false };
}
