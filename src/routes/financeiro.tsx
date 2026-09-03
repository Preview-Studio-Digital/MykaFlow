import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { TransactionList, type TxRow } from "@/components/TransactionList";
import { CategoryPie } from "@/components/CategoryPie";
import { EvolutionChart } from "@/components/EvolutionChart";

import { fmtCurrency, MONTHS_PT } from "@/lib/finance-constants";
import { ProfileDialog } from "@/components/ProfileDialog";
import { TransactionCreateDialog } from "@/components/TransactionCreateDialog";
import { InboxModal, getDealMentions, getDealCompletionNotifications, getDealNewTaskNotification } from "@/components/InboxModal";
import { LogOut, Zap, ChevronLeft, ShieldCheck, User as UserIcon, Lock, Users, LayoutGrid, AtSign, Inbox } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/financeiro")({
  component: Dashboard,
});

// Feriados nacionais brasileiros fixos (MM-DD)
const NATIONAL_HOLIDAYS = new Set([
  "01-01", // Ano Novo
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "12-25", // Natal
]);

function isBusinessDay(date: Date) {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Domingo ou Sábado
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return !NATIONAL_HOLIDAYS.has(`${mm}-${dd}`);
}

function Dashboard() {
  const { user, loading, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [aiAnalyses, setAiAnalyses] = useState<Record<string, { text: string; hash: string }>>({});
  const [isGeneratingAi, setIsGeneratingAi] = useState<Record<string, boolean>>({});
  const processingAiRef = useRef<Set<string>>(new Set()); // controla quais hashes já estão sendo processados
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addType, setAddType] = useState<"income" | "expense">("expense");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dashboardMode, setDashboardMode] = useState<"monthly" | "annual">("monthly");
  const [explanationModal, setExplanationModal] = useState<"diaria" | "hora" | "receita" | "despesa" | null>(null);
  const [employeesCount, setEmployeesCount] = useState(() => {
    if (typeof window === "undefined") return 5;
    return Number(localStorage.getItem("mykaflow_employees_count")) || 5;
  });

  // Proteção da rota financeira: perfis sem acesso ao financeiro são redirecionados para o CRM
  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate({ to: "/login" });
      } else {
        const canAccessFinance = role === "admin" || role === "financeiro";
        if (!canAccessFinance) {
          toast.error("Acesso restrito: seu perfil não possui permissão para o Módulo Financeiro.");
          navigate({ to: "/crm", replace: true });
        }
      }
    }
  }, [user, loading, role, navigate]);

  useEffect(() => {
    if (!user) return;
    const checkUnread = async () => {
      const { data } = await (supabase as any)
        .from("crm_deals")
        .select("id, title, stage, notes, req_number, created_at, user_id, assigned_user_id");
      if (data) {
        let count = 0;
        data.forEach((d: any) => {
          const mentions = getDealMentions(d);
          mentions.forEach((m) => {
            if (m.mentioned_user_id === user.id && !m.read_by_user) {
              count++;
            }
          });
          const notifs = getDealCompletionNotifications(d);
          notifs.forEach((n) => {
            if ((n.author_id === user.id || (!n.author_id && d.user_id === user.id)) && n.status === "pending_acceptance") {
              count++;
            }
          });
          const newTask = getDealNewTaskNotification(d, user.id);
          if (newTask && !newTask.read_by_user) {
            count++;
          }
        });
        setInboxUnreadCount(count);
      }
    };
    checkUnread();
    const interval = setInterval(checkUnread, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const averageMonthlyExpense = useMemo(() => {
    if (rows.length === 0) return 0;
    const expenseRows = rows.filter(
      (r) => r.type === "expense" && r.category !== "VENCIMENTO ANTECIPAÇÃO"
    );
    if (expenseRows.length === 0) return 0;

    const today = new Date();
    const currentYYYYMM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    const closedMonthSums = new Map<string, number>();
    const currentMonthSums = new Map<string, number>();

    expenseRows.forEach((r) => {
      if (!r.occurred_on) return;
      const yyyyMm = r.occurred_on.substring(0, 7); // "YYYY-MM"
      
      // Considera apenas meses rigorosamente passados/fechados
      if (yyyyMm < currentYYYYMM) {
        closedMonthSums.set(yyyyMm, (closedMonthSums.get(yyyyMm) ?? 0) + Number(r.amount));
      } 
      // Salva o atual apenas como fallback para sistemas sem histórico
      else if (yyyyMm === currentYYYYMM) {
        currentMonthSums.set(yyyyMm, (currentMonthSums.get(yyyyMm) ?? 0) + Number(r.amount));
      }
    });

    let totalExpenses = 0;
    let numMonths = 0;

    if (closedMonthSums.size > 0) {
      totalExpenses = Array.from(closedMonthSums.values()).reduce((sum, val) => sum + val, 0);
      numMonths = closedMonthSums.size;
    } else if (currentMonthSums.size > 0) {
      // Fallback: se não há histórico passado, usa o mês atual para não zerar os indicadores
      totalExpenses = Array.from(currentMonthSums.values()).reduce((sum, val) => sum + val, 0);
      numMonths = currentMonthSums.size;
    }

    return numMonths > 0 ? totalExpenses / numMonths : 0;
  }, [rows]);

  const averageMonthlyIncome = useMemo(() => {
    if (rows.length === 0) return 0;
    const incomeRows = rows.filter(
      (r) => r.type === "income" && r.category !== "VENCIMENTO ANTECIPAÇÃO"
    );
    if (incomeRows.length === 0) return 0;

    const today = new Date();
    const currentYYYYMM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    const closedMonthSums = new Map<string, number>();
    const currentMonthSums = new Map<string, number>();

    incomeRows.forEach((r) => {
      if (!r.occurred_on) return;
      const yyyyMm = r.occurred_on.substring(0, 7); // "YYYY-MM"
      
      // Considera apenas meses rigorosamente passados/fechados
      if (yyyyMm < currentYYYYMM) {
        closedMonthSums.set(yyyyMm, (closedMonthSums.get(yyyyMm) ?? 0) + Number(r.amount));
      } 
      // Salva o atual apenas como fallback para sistemas sem histórico
      else if (yyyyMm === currentYYYYMM) {
        currentMonthSums.set(yyyyMm, (currentMonthSums.get(yyyyMm) ?? 0) + Number(r.amount));
      }
    });

    let totalIncome = 0;
    let numMonths = 0;

    if (closedMonthSums.size > 0) {
      totalIncome = Array.from(closedMonthSums.values()).reduce((sum, val) => sum + val, 0);
      numMonths = closedMonthSums.size;
    } else if (currentMonthSums.size > 0) {
      totalIncome = Array.from(currentMonthSums.values()).reduce((sum, val) => sum + val, 0);
      numMonths = currentMonthSums.size;
    }

    return numMonths > 0 ? totalIncome / numMonths : 0;
  }, [rows]);

  // Detalhamento por mês fechado para os modais de Receita/Despesa Média Mensal
  function buildMonthlyBreakdown(type: "income" | "expense") {
    const filtered = rows.filter(
      (r) => r.type === type && r.category !== "VENCIMENTO ANTECIPAÇÃO"
    );
    const today = new Date();
    const currentYYYYMM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const closed = new Map<string, number>();
    const current = new Map<string, number>();
    filtered.forEach((r) => {
      if (!r.occurred_on) return;
      const k = r.occurred_on.substring(0, 7);
      if (k < currentYYYYMM) closed.set(k, (closed.get(k) ?? 0) + Number(r.amount));
      else if (k === currentYYYYMM) current.set(k, (current.get(k) ?? 0) + Number(r.amount));
    });
    const useClosed = closed.size > 0;
    const source = useClosed ? closed : current;
    const months = Array.from(source.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, value]) => ({ key, value }));
    const total = months.reduce((s, m) => s + m.value, 0);
    return { months, total, count: months.length, usedFallback: !useClosed && current.size > 0 };
  }

  const incomeBreakdown = useMemo(() => buildMonthlyBreakdown("income"), [rows]);
  const expenseBreakdown = useMemo(() => buildMonthlyBreakdown("expense"), [rows]);

  function formatMonthKey(key: string) {
    const [y, m] = key.split("-");
    const idx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
    return `${MONTHS_PT[idx]}/${y}`;
  }

  const businessDays = useMemo(() => {
    return getBusinessDaysInMonth(year, month);
  }, [year, month]);

  const diariaEmpresarial = useMemo(() => {
    return businessDays > 0 ? averageMonthlyExpense / businessDays : 0;
  }, [averageMonthlyExpense, businessDays]);

  const horaOperacional = useMemo(() => {
    return averageMonthlyExpense / (employeesCount * 160 * 0.70); // N * 160 * 0.70 (30% efficiency reduction)
  }, [averageMonthlyExpense, employeesCount]);

  const isWorkDay = isBusinessDay(new Date());

  const headerBtnBorderClass = isWorkDay
    ? "border-amber-500/20 hover:border-amber-400/40"
    : "border-white/10 hover:border-white/30";

  const headerBtnGradientClass = isWorkDay
    ? "from-amber-500/10 to-transparent"
    : "from-white/5 to-transparent";

  const headerBtnTextHoverClass = isWorkDay
    ? "group-hover:text-amber-400"
    : "group-hover:text-white";

  const headerBtnBarClass = isWorkDay
    ? "animate-pulse-yellow bg-amber-400"
    : "bg-white";

  const dismissAlert = (alertId: string) => {
    if (typeof window === "undefined") return;
    const dismissed = JSON.parse(localStorage.getItem("mykaflow_dismissed_alerts") || "[]");
    if (!dismissed.includes(alertId)) {
      dismissed.push(alertId);
      localStorage.setItem("mykaflow_dismissed_alerts", JSON.stringify(dismissed));
      setRefreshKey((prev) => prev + 1);
    }
  };

  const monthAlerts = useMemo(() => {
    if (rows.length === 0) return [];

    // 1. Agrupar transações do mês corrente por categoria e tipo
    const currentGroups: { [key: string]: { category: string; type: string; amount: number; date: string; description?: string } } = {};
    let totalIncomeCurr = 0;
    let totalExpenseCurr = 0;
    rows.forEach((r) => {
      if (!r.occurred_on) return;
      const d = new Date(r.occurred_on + "T00:00:00");
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = `${r.type}-${r.category.toUpperCase()}`;
        const isAntecipacao = r.category.toUpperCase() === "ANTECIPAÇÃO DE NOTAS" || r.category.toUpperCase() === "CUSTO ANTECIPAÇÃO";
        
        if (!currentGroups[key]) {
          currentGroups[key] = {
            category: r.category,
            type: r.type,
            amount: 0,
            date: r.occurred_on,
            description: isAntecipacao ? undefined : (r.description || undefined)
          };
        }
        currentGroups[key].amount += Number(r.amount);
        if (r.type === "income") totalIncomeCurr += Number(r.amount);
        else totalExpenseCurr += Number(r.amount);
      }
    });

    // 2. Agrupar transações do mês anterior por categoria e tipo
    const prevMonthDate = new Date(year, month - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    // Se o mês selecionado é o mês atual, limitar a comparação ao mesmo número de dias
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    const currentDay = today.getDate(); // ex: 20

    const prevGroups: { [key: string]: number } = {};
    let totalIncomePrev = 0;
    let totalExpensePrev = 0;
    rows.forEach((r) => {
      if (!r.occurred_on) return;
      const d = new Date(r.occurred_on + "T00:00:00");
      if (d.getFullYear() === prevYear && d.getMonth() === prevMonth) {
        // Se é mês atual, só considera dias do mês anterior até o mesmo dia de hoje
        if (isCurrentMonth && d.getDate() > currentDay) return;
        const key = `${r.type}-${r.category.toUpperCase()}`;
        if (!prevGroups[key]) prevGroups[key] = 0;
        prevGroups[key] += Number(r.amount);
        if (r.type === "income") totalIncomePrev += Number(r.amount);
        else totalExpensePrev += Number(r.amount);
      }
    });

    const netCurr = totalIncomeCurr - totalExpenseCurr;
    const netPrev = totalIncomePrev - totalExpensePrev;
    const netImproved = netCurr > netPrev;

    // 3. Comparar grupos e gerar alertas de variação
    const generated: any[] = [];
    const dismissed = typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("mykaflow_dismissed_alerts") || "[]")
      : [];

    Object.keys(currentGroups).forEach((key) => {
      const current = currentGroups[key];
      const prevVal = prevGroups[key] || 0;

      if (prevVal > 0) {
        const percentDiff = ((current.amount - prevVal) / prevVal) * 100;
        if (Math.abs(percentDiff) > 10) {
          const alertId = `alert-${current.type}-${current.category.toUpperCase()}-${year}-${month}`;
          if (dismissed.includes(alertId)) return;

          const isExpense = current.type === "expense";
          const isIncrease = percentDiff > 0;
          let isPositive = isExpense ? !isIncrease : isIncrease;
          let analysis = "";

          const isAntecipacaoIncome = !isExpense && current.category.toUpperCase() === "ANTECIPAÇÃO DE NOTAS";
          const isAntecipacaoExpense = isExpense && current.category.toUpperCase() === "CUSTO ANTECIPAÇÃO";

          if (isAntecipacaoIncome) {
             isPositive = !isIncrease;
             analysis = isIncrease 
                ? "Aumento de antecipações indica fluxo de caixa prejudicado para arcar com despesas imediatas."
                : "Redução nas antecipações aponta para um fluxo de caixa mais saudável e sustentável.";
          } else if (isAntecipacaoExpense) {
             isPositive = !isIncrease;
             analysis = isIncrease
                ? "Custo com antecipações aumentou, sinalizando um péssimo sinal financeiro."
                : "Menor custo com antecipações é um excelente sinal, indicando menos dependência.";
          } else {
            if (isExpense && isIncrease) {
              if (netImproved && netCurr > 0) {
                isPositive = true;
                analysis = "Despesa subiu, mas o lucro líquido melhorou — investimento vantajoso.";
              } else {
                analysis = "Revise fornecedores e contratos desta categoria para reduzir custo.";
              }
            } else if (isExpense && !isIncrease) {
              analysis = "Boa contenção de custo. Mantenha o controle e replique a prática.";
            } else if (!isExpense && isIncrease) {
              analysis = "Receita em alta. Reforce os canais que geraram esse crescimento.";
            } else {
              analysis = "Queda de receita. Investigue causas e reative ações comerciais.";
            }
          }

          generated.push({
            id: alertId,
            category: current.category,
            type: current.type,
            date: current.date,
            oldAmount: prevVal,
            newAmount: current.amount,
            percentChange: percentDiff,
            description: isAntecipacaoIncome || isAntecipacaoExpense ? undefined : (current.description || undefined),
            isPositive,
            analysis,
            isCurrentMonth,
            currentDay,
          });
        }
      }
    });

    return generated;
  }, [rows, month, year]);

  useEffect(() => {
    // Limpar entradas de erro do cache do localStorage automaticamente
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ai-')) {
        const val = localStorage.getItem(key) || '';
        if (val.includes('Não foi possível') || val.includes('Chave de API')) {
          localStorage.removeItem(key);
        }
      }
    }

    async function processAiAlerts() {
      if (!import.meta.env.VITE_GEMINI_API_KEY) {
        console.warn('[IA] VITE_GEMINI_API_KEY não encontrada no ambiente.');
        return;
      }
      console.log('[IA] Iniciando análises para', monthAlerts.length, 'alertas');
      
      const { generateAlertAnalysis } = await import("@/lib/ai-analysis");
      
      for (const alert of monthAlerts) {
        const hash = `ai-v3-${alert.category}-${alert.type}-${Math.round(alert.newAmount)}-${Math.round(alert.oldAmount)}`;
        
        if (processingAiRef.current.has(hash)) {
          console.log('[IA] Já processando:', alert.category);
          continue;
        }
        processingAiRef.current.add(hash);

        const cached = localStorage.getItem(hash);
        if (cached) {
          console.log('[IA] Cache encontrado para:', alert.category);
          setAiAnalyses(prev => ({ ...prev, [alert.id]: { text: cached, hash } }));
          continue;
        }

        console.log('[IA] Chamando Gemini para:', alert.category);
        setIsGeneratingAi(prev => ({ ...prev, [alert.id]: true }));
        try {
          const text = await generateAlertAnalysis(
            alert.category,
            alert.type,
            alert.newAmount,
            alert.oldAmount,
            alert.percentChange,
            alert.isCurrentMonth ? alert.currentDay : undefined
          );
          console.log('[IA] Resposta para', alert.category, ':', text);
          
          if (!text.includes('Não foi possível')) {
            localStorage.setItem(hash, text);
          } else {
            processingAiRef.current.delete(hash);
          }
          setAiAnalyses(prev => ({ ...prev, [alert.id]: { text, hash } }));
        } catch (err) {
          console.error('[IA] Erro ao gerar análise para', alert.category, ':', err);
          processingAiRef.current.delete(hash);
        } finally {
          setIsGeneratingAi(prev => ({ ...prev, [alert.id]: false }));
        }
      }
    }
    
    processAiAlerts();
  }, [monthAlerts]);

  const [activeTab, setActiveTab] = useState<"dashboard" | "transactions">("dashboard");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*, financial_subcategories:subcategory_id_v2(name)")
      .order("occurred_on", { ascending: false });
    if (!error && data) {
      setRows(data as TxRow[]);
      
      const { data: pData } = await supabase.from("profiles").select("id, display_name, email");
      let profilesList = pData || [];

      if (user && !profilesList.find(p => p.id === user.id)) {
        profilesList.push({
          id: user.id,
          display_name: (user.user_metadata?.display_name || user.email?.split("@")[0] || "USUÁRIO").toUpperCase(),
          email: user.email ?? null
        });
      }

      setProfiles(profilesList);
      setRefreshKey(prev => prev + 1);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  useEffect(() => {
    if (user) {
      load();
      const syncProfile = async () => {
        try {
          const profilePromise = supabase.from("profiles").upsert({
            id: user.id,
            display_name: (
              user.user_metadata?.display_name ||
              user.email?.split("@")[0] ||
              "USUÁRIO"
            ).toUpperCase(),
            email: user.email,
          });

          // Garante que o usuário tenha pelo menos a role 'user' se não tiver nada
          const rolePromise = supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .maybeSingle()
            .then(({ data }) => {
              if (!data) {
                return supabase.from("user_roles").insert({ user_id: user.id, role: "user" });
              }
            });

          await Promise.all([profilePromise, rolePromise]);

          const { data: pData } = await supabase.from("profiles").select("id, display_name, email");
          if (pData) setProfiles(pData);
        } catch (err) {
          console.error("Profile/Role sync fail:", err);
        }
      };
      syncProfile();
    }
  }, [user, load]);

  const monthRows = useMemo(
    () =>
      rows.filter((r) => {
        const d = new Date(r.occurred_on + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      }),
    [rows, year, month],
  );

  const yearRows = useMemo(
    () =>
      rows.filter((r) => {
        const d = new Date(r.occurred_on + "T00:00:00");
        return d.getFullYear() === year;
      }),
    [rows, year],
  );

  const activeRows = dashboardMode === "annual" ? yearRows : monthRows;
  const expenseByCat = useMemo(
    () => agg(activeRows.filter((r) => r.type === "expense")),
    [activeRows],
  );
  const incomeByCat = useMemo(
    () => agg(activeRows.filter((r) => r.type === "income")),
    [activeRows],
  );

  const totalIncome = monthRows
    .filter((r) => r.type === "income")
    .reduce((a, b) => a + Number(b.amount), 0);
  const totalExpense = monthRows
    .filter((r) => r.type === "expense")
    .reduce((a, b) => a + Number(b.amount), 0);
  const balance = totalIncome - totalExpense;

  const { minDate, maxDate } = useMemo(() => {
    if (rows.length === 0) {
      const now = new Date();
      return { minDate: now, maxDate: now };
    }
    const dates = rows.map((r) => new Date(r.occurred_on + "T00:00:00").getTime());
    return {
      minDate: new Date(Math.min(...dates)),
      maxDate: new Date(Math.max(...dates)),
    };
  }, [rows]);

  const comparisonData = useMemo(() => {
    const today = new Date();
    const isThisYear = today.getFullYear() === year;
    const isThisMonth = isThisYear && today.getMonth() === month;
    const currentDay = today.getDate();

    if (dashboardMode === "annual") {
      const prevY = year - 1;
      const prevYearRows = rows.filter((r) => {
        const [y] = r.occurred_on.split("-").map(Number);
        return y === prevY;
      });

      const prevIncome = prevYearRows
        .filter((r) => r.type === "income")
        .reduce((a, b) => a + Number(b.amount), 0);
      const prevExpense = prevYearRows
        .filter((r) => r.type === "expense")
        .reduce((a, b) => a + Number(b.amount), 0);

      return {
        prevIncome: prevYearRows.some((r) => r.type === "income") ? prevIncome : undefined,
        prevExpense: prevYearRows.some((r) => r.type === "expense") ? prevExpense : undefined,
      };
    } else {
      // Mês passado (Sempre o mês cheio para garantir que os dados apareçam)
      let prevM = month - 1;
      let prevY = year;
      if (prevM < 0) {
        prevM = 11;
        prevY--;
      }

      const prevMonthRows = rows.filter((r) => {
        const [y, m] = r.occurred_on.split("-").map(Number);
        return y === prevY && m - 1 === prevM;
      });

      const prevIncome = prevMonthRows
        .filter((r) => r.type === "income")
        .reduce((a, b) => a + Number(b.amount), 0);
      const prevExpense = prevMonthRows
        .filter((r) => r.type === "expense")
        .reduce((a, b) => a + Number(b.amount), 0);

      return {
        prevIncome: prevMonthRows.some((r) => r.type === "income") ? prevIncome : undefined,
        prevExpense: prevMonthRows.some((r) => r.type === "expense") ? prevExpense : undefined,
      };
    }
  }, [rows, month, year, dashboardMode]);

  function getNextPeriod(m: number, y: number, delta: number) {
    let nextM = m + delta;
    let nextY = y;
    while (nextM < 0) {
      nextM += 12;
      nextY--;
    }
    while (nextM > 11) {
      nextM -= 12;
      nextY++;
    }
    return { m: nextM, y: nextY };
  }

  function shiftMonth(delta: number) {
    const next = getNextPeriod(month, year, delta);
    setMonth(next.m);
    setYear(next.y);
  }

  function shiftMonthUnrestricted(delta: number) {
    const next = getNextPeriod(month, year, delta);
    setMonth(next.m);
    setYear(next.y);
  }

  const canShiftPrev = true;
  const canShiftNext = true;

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  // TRAVA DE SEGURANÇA: Apenas ADM e FINANCEIRO acessam o financeiro
  if (role !== "admin" && role !== "financeiro") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-background select-none">
        <div className="glass max-w-md w-full p-8 rounded-2xl text-center space-y-6 float-up">
          <div className="inline-flex p-4 rounded-full bg-accent/20 mb-4 pulse-glow">
            <Lock className="h-12 w-12 text-accent" />
          </div>
          <h1 className="text-2xl font-black tracking-widest text-gradient uppercase">ACESSO RESTRITO</h1>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Olá, <span className="text-white font-bold">{user.email}</span>!<br />
            Seu perfil atual de acesso não possui permissão para visualizar o módulo financeiro.
          </p>
          <div className="pt-6 border-t border-white/10 flex flex-col gap-2.5">
            <Link
              to="/crm"
              className="btn-futuristic w-full rounded-xl py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
            >
              Acessar Módulo Comercial
            </Link>
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
              className="btn-ghost-neon w-full rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 text-rose-400"
            >
              <LogOut className="h-4 w-4" /> Sair do Sistema
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 w-full min-h-screen">
      {/* TELA 1: CABEÇALHO + RECEITAS/DESPESAS + GRÁFICO (100VH) */}
      <div className="h-screen min-h-[100dvh] max-h-screen flex flex-col justify-between p-3 md:px-6 pb-2 overflow-hidden select-none">
        <header className="flex-shrink-0 mb-1 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between border-b border-white/5 pb-1.5">
        <div className="flex items-center gap-3 lg:w-1/4 lg:justify-start">
          <Link
            to="/"
            className="btn-ghost-neon h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white transition-all cursor-pointer shadow-sm hover:scale-105"
            title="Voltar ao Seletor de Módulos (Hub Inicial)"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div
            className="flex flex-col select-none justify-center focus:outline-none"
          >
            <svg
              className="w-[240px] sm:w-[265px] h-[26px] overflow-visible select-none drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]"
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
                GESTÃO FINANCEIRA
              </text>
            </svg>
          </div>
        </div>

        {/* 4 Glow Buttons / KPI Cards */}
        <div className="grid grid-cols-4 gap-2 w-max mx-auto">
          {/* Receita Média Mensal (Lado Esquerdo) */}
          <button
            onClick={() => setExplanationModal("receita")}
            className={`glass group relative overflow-hidden rounded-xl border px-3 py-1.5 hover:scale-105 active:scale-95 transition-all text-right flex items-center justify-end gap-2 w-full h-full ${headerBtnBorderClass}`}
            title="Clique para ver o detalhamento do cálculo"
          >
            <div className={`absolute inset-0 bg-gradient-to-l opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${headerBtnGradientClass}`} />
            <div className="text-right">
              <p className={`text-[9px] font-black uppercase tracking-wider text-muted-foreground transition-colors ${headerBtnTextHoverClass}`}>
                Receita Média Mensal
              </p>
              <p className="text-xs font-black font-mono text-white mt-0.5">
                {fmtCurrency(averageMonthlyIncome)}
              </p>
            </div>
            <div className={`w-1 h-7 rounded-full group-hover:scale-y-110 transition-transform ${headerBtnBarClass}`} />
          </button>

          {/* Diária Empresarial (Centro-Esquerdo) */}
          <button
            onClick={() => setExplanationModal("diaria")}
            className={`glass group relative overflow-hidden rounded-xl border px-3 py-1.5 hover:scale-105 active:scale-95 transition-all text-right flex items-center justify-end gap-2 w-full h-full ${headerBtnBorderClass}`}
            title="Clique para ver o detalhamento do cálculo"
          >
            <div className={`absolute inset-0 bg-gradient-to-l opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${headerBtnGradientClass}`} />
            <div className="text-right">
              <p className={`text-[9px] font-black uppercase tracking-wider text-muted-foreground transition-colors ${headerBtnTextHoverClass}`}>
                Diária Empresarial
              </p>
              <p className="text-xs font-black font-mono text-white mt-0.5">
                {fmtCurrency(diariaEmpresarial)}
              </p>
            </div>
            <div className={`w-1 h-7 rounded-full group-hover:scale-y-110 transition-transform ${headerBtnBarClass}`} />
          </button>

          {/* Hora Operacional (Centro-Direito) */}
          <button
            onClick={() => setExplanationModal("hora")}
            className={`glass group relative overflow-hidden rounded-xl border px-3 py-1.5 hover:scale-105 active:scale-95 transition-all text-left flex items-center justify-start gap-2 w-full h-full ${headerBtnBorderClass}`}
            title="Clique para ver o detalhamento do cálculo"
          >
            <div className={`absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${headerBtnGradientClass}`} />
            <div className={`w-1 h-7 rounded-full group-hover:scale-y-110 transition-transform ${headerBtnBarClass}`} />
            <div className="text-left">
              <p className={`text-[9px] font-black uppercase tracking-wider text-muted-foreground transition-colors ${headerBtnTextHoverClass}`}>
                Hora Operacional
              </p>
              <p className="text-xs font-black font-mono text-white mt-1">
                {fmtCurrency(horaOperacional)}
              </p>
            </div>
          </button>

          {/* Despesa Média Mensal (Lado Direito) */}
          <button
            onClick={() => setExplanationModal("despesa")}
            className={`glass group relative overflow-hidden rounded-xl border px-3 py-1.5 hover:scale-105 active:scale-95 transition-all text-left flex items-center justify-start gap-2 w-full h-full ${headerBtnBorderClass}`}
            title="Clique para ver o detalhamento do cálculo"
          >
            <div className={`w-1 h-7 rounded-full group-hover:scale-y-110 transition-transform ${headerBtnBarClass}`} />
            <div className="text-left">
              <p className={`text-[9px] font-black uppercase tracking-wider text-muted-foreground transition-colors ${headerBtnTextHoverClass}`}>
                Despesa Média Mensal
              </p>
              <p className="text-xs font-black font-mono text-white mt-0.5">
                {fmtCurrency(averageMonthlyExpense)}
              </p>
            </div>
            <div className={`absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${headerBtnGradientClass}`} />
          </button>
        </div>

        <div className="flex items-center gap-3 justify-between lg:w-1/4 lg:justify-end shrink-0">
          {/* Botão Caixa de Entrada Unificada (Inbox: Notificações + Menções) */}
          <button
            type="button"
            onClick={() => setIsInboxOpen(true)}
            className="btn-ghost-neon h-9 px-3 rounded-xl flex items-center justify-center gap-1.5 text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400/60 bg-cyan-500/10 shadow-sm transition-all hover:scale-105 cursor-pointer text-xs font-black uppercase tracking-wider"
            title="Abrir Inbox (Notificações e Menções)"
          >
            <Inbox className="h-3.5 w-3.5 text-cyan-400" />
            <span>INBOX</span>

            {/* Badge de Pendências Não Lidas */}
            {inboxUnreadCount > 0 && (
              <span
                className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white font-mono font-black text-[10px] shadow-[0_0_10px_rgba(244,63,94,0.9)] animate-pulse shrink-0 ml-0.5 leading-none select-none"
                title={`Você possui ${inboxUnreadCount} ${
                  inboxUnreadCount === 1 ? "pendência no Inbox" : "pendências no Inbox"
                }`}
              >
                {inboxUnreadCount}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            {role === "admin" && (
              <Link
                to="/admin"
                search={{ from: "financeiro" }}
                className="btn-ghost-neon h-9 rounded-xl px-3 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400/60 bg-cyan-500/10 shadow-sm transition-all hover:scale-105 cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                <span>ADM</span>
              </Link>
            )}

            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
              className="btn-ghost-neon h-9 rounded-xl px-3 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-rose-400 hover:text-rose-300 border border-rose-500/30 hover:border-rose-400/60 bg-rose-500/10 shadow-sm transition-all hover:scale-105 cursor-pointer"
              title="Sair do Sistema"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      <InboxModal
        isOpen={isInboxOpen}
        onClose={() => setIsInboxOpen(false)}
        currentUser={user}
      />

      <ProfileDialog
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={user}
      />
      <TransactionCreateDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={load}
        defaultType={addType}
        defaultMonth={month}
        defaultYear={year}
        onMonthShift={shiftMonthUnrestricted}
        onMonthYearChange={(m, y) => {
          setMonth(m);
          setYear(y);
        }}
      />

      {explanationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/60 animate-in fade-in duration-200">
          <div className="glass max-w-lg w-full rounded-2xl border border-white/10 p-6 md:p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden animate-in zoom-in-95 duration-200 space-y-6">
            {/* Ambient glows inside modal */}
            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-cyan-500/10 blur-[60px] pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-sky-500/10 blur-[60px] pointer-events-none" />

            {explanationModal === "diaria" ? (
              <>
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                    <h2 className="text-xl font-black uppercase tracking-wider text-cyan-400">
                      Diária Empresarial
                    </h2>
                  </div>
                  <button
                    onClick={() => setExplanationModal(null)}
                    className="text-muted-foreground hover:text-white transition-colors text-xs font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
                  >
                    Fechar
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    A <strong className="text-white">Diária Empresarial</strong> representa o custo operacional diário (baseado exclusivamente em <strong className="text-white">dias úteis</strong>) que a empresa precisa faturar para cobrir suas despesas correntes médias.
                  </p>

                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 text-center font-mono space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Fórmula Aplicada</p>
                    <p className="text-lg font-bold text-cyan-400">
                      Diária = Despesa Média / Dias Úteis
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">Detalhamento dos Valores:</h3>
                    
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between text-sm py-1.5 border-b border-white/[0.03]">
                        <span className="text-muted-foreground">1. Despesa Média Mensal:</span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-white">{fmtCurrency(averageMonthlyExpense)}</span>
                          <p className="text-[9px] text-muted-foreground uppercase mt-0.5">Soma despesas reais / meses fechados</p>
                        </div>
                      </div>

                      <div className="flex items-start justify-between text-sm py-1.5 border-b border-white/[0.03]">
                        <span className="text-muted-foreground">2. Dias Úteis (Segunda a Sexta):</span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-white">{businessDays} dias</span>
                          <p className="text-[9px] text-muted-foreground uppercase mt-0.5">Em {MONTHS_PT[month]} de {year}</p>
                        </div>
                      </div>

                      <div className="flex items-start justify-between text-sm pt-2">
                        <span className="text-cyan-400 font-bold">➔ Diária Útil Calculada:</span>
                        <div className="text-right">
                          <span className="font-mono font-black text-cyan-400 text-lg">{fmtCurrency(diariaEmpresarial)}</span>
                          <p className="text-[9px] text-cyan-400/80 uppercase mt-0.5">Custo por dia útil trabalhado</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-cyan-400 block mb-1">💡 Nota de Gestão:</strong>
                    Qualquer dia útil em que a empresa não faturar pelo menos este valor representa um déficit operacional acumulado que precisará ser compensado em outros dias.
                  </div>
                </div>
              </>
            ) : explanationModal === "hora" ? (
              <>
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping" />
                    <h2 className="text-xl font-black uppercase tracking-wider text-sky-400">
                      Hora Operacional
                    </h2>
                  </div>
                  <button
                    onClick={() => setExplanationModal(null)}
                    className="text-muted-foreground hover:text-white transition-colors text-xs font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
                  >
                    Fechar
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    A <strong className="text-white">Hora Operacional</strong> define o custo hora-homem real para manter a empresa funcionando. Ela assume o número de <strong className="text-white">funcionários operacionais indicados</strong> trabalhando <strong className="text-white">160 horas por mês cada</strong>, com uma <strong className="text-white">redução de 30% na eficiência operacional</strong>.
                  </p>

                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 text-center font-mono space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Fórmula Aplicada</p>
                    <p className="text-lg font-bold text-sky-400">
                      Hora = Despesa Média / {Math.round(employeesCount * 160 * 0.7)}h Operacionais
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">Detalhamento dos Valores:</h3>
                    
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between text-sm py-1.5 border-b border-white/[0.03]">
                        <span className="text-muted-foreground">1. Despesa Média Mensal:</span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-white">{fmtCurrency(averageMonthlyExpense)}</span>
                          <p className="text-[9px] text-muted-foreground uppercase mt-0.5">Soma despesas reais / meses fechados</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm py-1.5 border-b border-white/[0.03]">
                        <div>
                          <span className="text-muted-foreground">2. Número de Funcionários Operacionais:</span>
                          <p className="text-[9px] text-muted-foreground/70 mt-0.5 max-w-[200px]">
                            Conte apenas funcionários que produzem serviços relativos à atividade da empresa.
                          </p>
                        </div>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={employeesCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setEmployeesCount(val);
                            localStorage.setItem("mykaflow_employees_count", String(val));
                          }}
                          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-center font-mono font-bold text-white outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition-all"
                        />
                      </div>

                      <div className="flex items-start justify-between text-sm py-1.5 border-b border-white/[0.03]">
                        <span className="text-muted-foreground">3. Capacidade Operativa Nominal:</span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-white">{employeesCount * 160} Horas / mês</span>
                          <p className="text-[9px] text-muted-foreground uppercase mt-0.5">{employeesCount} funcionários x 160h</p>
                        </div>
                      </div>

                      <div className="flex items-start justify-between text-sm py-1.5 border-b border-white/[0.03]">
                        <span className="text-muted-foreground">4. Margem de Eficiência:</span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-rose-400">70% (-30% ineficiência)</span>
                          <p className="text-[9px] text-muted-foreground uppercase mt-0.5">Capacidade líquida real: {Math.round(employeesCount * 160 * 0.7)}h</p>
                        </div>
                      </div>

                      <div className="flex items-start justify-between text-sm pt-2">
                        <span className="text-sky-400 font-bold">➔ Custo Hora-Homem:</span>
                        <div className="text-right">
                          <span className="font-mono font-black text-sky-400 text-lg">{fmtCurrency(horaOperacional)}</span>
                          <p className="text-[9px] text-sky-400/80 uppercase mt-0.5">Valor mínimo de venda por hora/homem</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4 text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-sky-400 block mb-1">💡 Nota de Precificação:</strong>
                    Ao vender serviços, o valor cobrado por hora por colaborador deve ser superior a este custo de <strong className="text-white">{fmtCurrency(horaOperacional)}</strong> para gerar lucro real para a empresa.
                  </div>
                </div>
              </>
            ) : explanationModal === "receita" ? (
              <>
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    <h2 className="text-xl font-black uppercase tracking-wider text-emerald-400">
                      Receita Média Mensal
                    </h2>
                  </div>
                  <button
                    onClick={() => setExplanationModal(null)}
                    className="text-muted-foreground hover:text-white transition-colors text-xs font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
                  >
                    Fechar
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    A <strong className="text-white">Receita Média Mensal</strong> é a média aritmética das receitas totais de cada mês <strong className="text-white">já fechado</strong> (anteriores ao mês corrente).
                  </p>

                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 text-center font-mono space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Fórmula Aplicada</p>
                    <p className="text-lg font-bold text-emerald-400">
                      Média = Σ Receitas dos meses fechados / Nº de meses
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">
                      Detalhamento por Mês{incomeBreakdown.usedFallback ? " (mês atual — fallback)" : ""}:
                    </h3>

                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {incomeBreakdown.months.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Sem dados de meses fechados.</p>
                      ) : (
                        incomeBreakdown.months.map((m) => (
                          <div key={m.key} className="flex items-center justify-between text-sm py-1.5 border-b border-white/[0.03]">
                            <span className="text-muted-foreground uppercase text-xs">{formatMonthKey(m.key)}</span>
                            <span className="font-mono font-bold text-white">{fmtCurrency(m.value)}</span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-start justify-between text-sm py-1.5 border-t border-white/10 pt-3">
                      <span className="text-muted-foreground">Soma Total:</span>
                      <span className="font-mono font-bold text-white">{fmtCurrency(incomeBreakdown.total)}</span>
                    </div>
                    <div className="flex items-start justify-between text-sm py-1.5">
                      <span className="text-muted-foreground">Nº de Meses Considerados:</span>
                      <span className="font-mono font-bold text-white">{incomeBreakdown.count}</span>
                    </div>

                    <div className="flex items-start justify-between text-sm pt-2">
                      <span className="text-emerald-400 font-bold">➔ Receita Média Mensal:</span>
                      <div className="text-right">
                        <span className="font-mono font-black text-emerald-400 text-lg">{fmtCurrency(averageMonthlyIncome)}</span>
                        <p className="text-[9px] text-emerald-400/80 uppercase mt-0.5">Total / Nº de meses</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-emerald-400 block mb-1">💡 Nota:</strong>
                    O mês corrente não entra no cálculo por ainda não estar fechado. Caso não exista nenhum mês passado com dados, é usado o mês atual como referência mínima.
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
                    <h2 className="text-xl font-black uppercase tracking-wider text-rose-400">
                      Despesa Média Mensal
                    </h2>
                  </div>
                  <button
                    onClick={() => setExplanationModal(null)}
                    className="text-muted-foreground hover:text-white transition-colors text-xs font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
                  >
                    Fechar
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    A <strong className="text-white">Despesa Média Mensal</strong> é a média aritmética das despesas totais de cada mês <strong className="text-white">já fechado</strong> (anteriores ao mês corrente).
                  </p>

                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 text-center font-mono space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Fórmula Aplicada</p>
                    <p className="text-lg font-bold text-rose-400">
                      Média = Σ Despesas dos meses fechados / Nº de meses
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-white">
                      Detalhamento por Mês{expenseBreakdown.usedFallback ? " (mês atual — fallback)" : ""}:
                    </h3>

                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {expenseBreakdown.months.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Sem dados de meses fechados.</p>
                      ) : (
                        expenseBreakdown.months.map((m) => (
                          <div key={m.key} className="flex items-center justify-between text-sm py-1.5 border-b border-white/[0.03]">
                            <span className="text-muted-foreground uppercase text-xs">{formatMonthKey(m.key)}</span>
                            <span className="font-mono font-bold text-white">{fmtCurrency(m.value)}</span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-start justify-between text-sm py-1.5 border-t border-white/10 pt-3">
                      <span className="text-muted-foreground">Soma Total:</span>
                      <span className="font-mono font-bold text-white">{fmtCurrency(expenseBreakdown.total)}</span>
                    </div>
                    <div className="flex items-start justify-between text-sm py-1.5">
                      <span className="text-muted-foreground">Nº de Meses Considerados:</span>
                      <span className="font-mono font-bold text-white">{expenseBreakdown.count}</span>
                    </div>

                    <div className="flex items-start justify-between text-sm pt-2">
                      <span className="text-rose-400 font-bold">➔ Despesa Média Mensal:</span>
                      <div className="text-right">
                        <span className="font-mono font-black text-rose-400 text-lg">{fmtCurrency(averageMonthlyExpense)}</span>
                        <p className="text-[9px] text-rose-400/80 uppercase mt-0.5">Total / Nº de meses</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-rose-400 block mb-1">💡 Nota:</strong>
                    Este valor alimenta os cálculos de <strong className="text-white">Diária Empresarial</strong> e <strong className="text-white">Hora Operacional</strong>. Manter as despesas lançadas corretamente é essencial para a precisão de toda a gestão.
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      )}

        <section className="mb-1 grid grid-cols-2 gap-2 flex-shrink-0">
          <CategoryPie
            key={`income-${refreshKey}-${year}-${month}-${dashboardMode}`}
            title={dashboardMode === "annual" ? "Receitas Anuais" : `Receitas ${MONTHS_PT[month]}`}
            data={incomeByCat}
            transactions={monthRows.filter((r) => r.type === "income")}
            accent="oklch(0.8 0.16 150)"
            type="income"
            alignTitle="left"
            onAddClick={() => {
              setAddType("income");
              setIsAddOpen(true);
            }}
            prevTotal={comparisonData.prevIncome}
            comparisonLabel={
              dashboardMode === "annual" ? "EM RELAÇÃO AO ANO PASSADO" : "EM RELAÇÃO AO MÊS PASSADO"
            }
          />
          <CategoryPie
            key={`expense-${refreshKey}-${year}-${month}-${dashboardMode}`}
            title={dashboardMode === "annual" ? "Despesas Anuais" : `Despesas ${MONTHS_PT[month]}`}
            data={expenseByCat}
            transactions={monthRows.filter((r) => r.type === "expense")}
            accent="oklch(0.7 0.2 30)"
            type="expense"
            alignTitle="right"
            onAddClick={() => {
              setAddType("expense");
              setIsAddOpen(true);
            }}
            prevTotal={comparisonData.prevExpense}
            comparisonLabel={
              dashboardMode === "annual" ? "EM RELAÇÃO AO ANO PASSADO" : "EM RELAÇÃO AO MÊS PASSADO"
            }
          />
        </section>

        <section className="flex-1 flex flex-col min-h-0 my-1">
          <EvolutionChart
            key={`evolution-${refreshKey}-${year}-${month}-${dashboardMode}`}
            data={rows}
            year={year}
            month={month}
            onMonthChange={setMonth}
            onMonthShift={shiftMonth}
            forcedViewMode={dashboardMode === "annual" ? "annual" : "monthly"}
            dashboardMode={dashboardMode}
            onDashboardModeChange={setDashboardMode}
            canShiftPrev={canShiftPrev}
            canShiftNext={canShiftNext}
            averageMonthlyExpense={averageMonthlyExpense}
          />
        </section>

        {/* Botão de Atalho para Rolar para a Segunda Tela */}
        <div className="flex-shrink-0 flex items-center justify-center pt-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => {
              document.getElementById("extrato-lancamentos")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1 rounded-full border border-white/10 shadow-sm animate-bounce cursor-pointer"
          >
            <span>Ver Extrato e Lançamentos</span>
            <span>↓</span>
          </button>
        </div>
      </div>

      {/* TELA 2: LANÇAMENTOS E EXTRATO (SOMENTE NA SEGUNDA TELA) */}
      <div id="extrato-lancamentos" className="min-h-screen px-4 md:px-8 py-8 space-y-6">
        {monthAlerts.length > 0 && (() => {
          const positives = monthAlerts.filter((a) => a.isPositive);
          const negatives = monthAlerts.filter((a) => !a.isPositive);

          const renderAlert = (al: any) => {
            const formattedOld = Number(al.oldAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const formattedNew = Number(al.newAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const isExpense = al.type === "expense";
            const isIncrease = al.percentChange > 0;
            const tone = al.isPositive ? "text-emerald-400" : "text-rose-400";
            const typeText = isExpense ? "despesa" : "receita";
            return (
              <div key={al.id} className="flex flex-col gap-1.5 py-2.5 px-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all text-sm font-sans font-semibold">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-muted-foreground truncate min-w-0">
                    <span className={`${tone} font-bold uppercase truncate`}>{al.category}</span>
                    {al.description && <span className="uppercase text-xs opacity-75 truncate">({al.description})</span>}
                    <span className="truncate">{typeText}:</span>
                    <span className={`font-mono ${tone}`}>{formattedOld}</span>
                    <span>➔</span>
                    <span className={`font-mono ${tone}`}>{formattedNew}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`${tone} font-bold`}>
                      {isIncrease ? "+" : ""}{Number(al.percentChange).toFixed(1)}%
                    </span>
                    {role === "admin" ? (
                      <button
                        onClick={() => dismissAlert(al.id)}
                        className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 px-2.5 py-1 rounded-lg transition-all"
                      >
                        Dispensar
                      </button>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/30 bg-white/[0.01] border border-white/5 px-2.5 py-1 rounded-lg">
                        Apenas ADM
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[11px] font-normal text-muted-foreground/80 leading-snug pl-1">
                  {isGeneratingAi[al.id] ? (
                    <span className="flex items-center gap-2 animate-pulse text-accent">
                      <span className="h-1.5 w-1.5 bg-accent rounded-full animate-bounce" />
                      <span className="h-1.5 w-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <span className="h-1.5 w-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      Analisando cenário com IA...
                    </span>
                  ) : (
                    <span className="relative z-10 flex items-start gap-1.5">
                      {aiAnalyses[al.id]?.text || al.analysis}
                      {aiAnalyses[al.id] && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[8px] bg-accent/20 text-accent font-black uppercase tracking-widest border border-accent/30 flex-shrink-0 mt-0.5">
                          IA
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          };

          const panel = (
            title: string,
            accent: "emerald" | "rose",
            items: any[],
          ) => {
            const isPos = accent === "emerald";
            return (
              <div className={`glass rounded-2xl p-4 border ${isPos ? "border-emerald-500/20 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.05)]" : "border-rose-500/20 bg-rose-500/5 shadow-[0_0_15px_rgba(244,63,94,0.05)]"}`}>
                <h4 className={`text-[10px] font-black uppercase tracking-[0.25em] mb-3 flex items-center gap-2 ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                  <span className={`h-2 w-2 rounded-full ${isPos ? "bg-emerald-500" : "bg-rose-500"} animate-ping`} />
                  {title} ({items.length})
                </h4>
                {items.length > 0 ? (
                  <div className="flex flex-col gap-2">{items.map(renderAlert)}</div>
                ) : (
                  <p className="text-xs text-muted-foreground/70 italic">Nenhum alerta nesta categoria.</p>
                )}
              </div>
            );
          };

          return (
            <section className="mb-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="grid gap-3 md:grid-cols-2">
                {panel(`Positivos em ${MONTHS_PT[month]}`, "emerald", positives)}
                {panel(`Negativos em ${MONTHS_PT[month]}`, "rose", negatives)}
              </div>
            </section>
          );
        })()}

        <section>
          <TransactionList
            key={`list-${refreshKey}-${year}-${month}-${dashboardMode}`}
            rows={activeRows}
            onDeleted={load}
            allProfiles={profiles}
            title={
              dashboardMode === "annual"
                ? `Lançamentos de ${year}`
                : `Lançamentos de ${MONTHS_PT[month]}`
            }
          />
        </section>

        <footer className="mt-10 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
          MykaFlow • {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

function agg(list: TxRow[]) {
  const map = new Map<string, number>();
  for (const r of list) {
    if (r.category === "VENCIMENTO ANTECIPAÇÃO") continue;
    let catName = (r.category || "Outros").trim().toUpperCase();
    if (catName === "ESTRUTURA EMPRESARIAL") catName = "ESTRUTURA";
    if (catName === "CUSTO OPERAÇÃO") catName = "ANTECIPAÇÃO DE NOTAS";
    map.set(catName, (map.get(catName) ?? 0) + Number(r.amount));
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

function getBusinessDaysInMonth(year: number, month: number): number {
  let count = 0;
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    const day = date.getDay();
    if (day !== 0 && day !== 6) { // 0 = Sunday, 6 = Saturday
      count++;
    }
    date.setDate(date.getDate() + 1);
  }
  return count;
}
