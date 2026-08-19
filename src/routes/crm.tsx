import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { ProfileDialog } from "@/components/ProfileDialog";
import {
  Users,
  Kanban,
  Plus,
  ArrowLeft,
  Briefcase,
  Layers,
  Clock,
  CheckCircle2,
  Lock,
  LogOut,
  ShieldCheck,
  User as UserIcon,
  History,
  Send,
  MessageSquare,
  UserCheck,
  AlertCircle,
  AlertTriangle,
  Bell,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  Calendar,
  Sparkles,
  Building,
  Globe,
  Search,
  Filter,
  ArrowRight,
  FileText,
  Save,
  Trash2,
  Archive,
  ArchiveRestore,
  FolderArchive,
  Menu,
  PlusCircle,
  CheckSquare,
  Building2,
  Phone,
  FolderKanban,
  Paperclip,
  UploadCloud,
  FileCheck,
  Eye,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  ChevronDown,
  ChevronRight,
  GitFork,
  ListTree,
  Pencil,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/crm")({
  component: CrmDashboard,
});

export interface DealHistoryItem {
  id: string;
  deal_id: string;
  user_name: string;
  action_type: string;
  description: string;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
}

export interface Deal {
  id: string;
  customer_id?: string | null;
  customer_name?: string;
  title: string;
  value: number;
  stage: "lead" | "qualification" | "proposal" | "negotiation" | "won" | "lost" | "archived";
  expected_close_date?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  user_id?: string;
  creator_name?: string;
  latest_update_author?: string;
  notes?: string;
  req_number?: string | null;
  quote_file_url?: string | null;
  quote_file_name?: string | null;
  quote_file_uploaded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  company_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  status: string;
}

// Helper de Formatação / Geração do Número de Requisição no padrão: AA.MM.01...
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
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const index = sameMonthDeals.findIndex((other) => other.id === deal.id);
  const seq = index >= 0 ? index + 1 : sameMonthDeals.length + 1;
  return `${prefix}.${String(seq).padStart(2, "0")}`;
}

function generateNextReqNumber(existingDeals: Deal[], targetDate = new Date()): string {
  const yy = String(targetDate.getFullYear()).slice(-2);
  const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
  const prefix = `${yy}.${mm}`;

  let maxSeq = 0;
  for (const d of existingDeals) {
    const rawNum = d.req_number || getDealReqNumber(d, existingDeals);
    const num = rawNum ? rawNum.replace(/\//g, ".") : "";
    if (num && num.startsWith(prefix)) {
      const parts = num.split(".");
      const lastPart = parseInt(parts[parts.length - 1].trim(), 10);
      if (!isNaN(lastPart) && lastPart > maxSeq) {
        maxSeq = lastPart;
      }
    }
  }

  return `${prefix}.${String(maxSeq + 1).padStart(2, "0")}`;
}

const STAGES: { id: Deal["stage"]; title: string; color: string; border: string; glow: string; bg?: string }[] = [
  { id: "lead", title: "TAREFAS", color: "text-slate-300", border: "border-slate-700/60", glow: "from-slate-600/20", bg: "!bg-slate-900/90 !bg-gradient-to-b !from-slate-800/40 !via-slate-900/60 !to-slate-950/90" },
  { id: "qualification", title: "ORÇAMENTOS", color: "text-sky-400", border: "border-sky-500/20", glow: "from-sky-500/10" },
  { id: "negotiation", title: "NEGOCIAÇÕES", color: "text-sky-400", border: "border-sky-500/20", glow: "from-sky-500/10" },
  { id: "won", title: "CONTRATOS", color: "text-sky-400", border: "border-sky-500/20", glow: "from-sky-500/10" },
  { id: "lost", title: "PERDIDOS", color: "text-sky-400", border: "border-sky-500/20", glow: "from-sky-500/10" },
];

function fmtCurrency(val: number) {
  return Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Helper de Formatação de Data com Dia da Semana: "PRAZO: dd/mm/aa - dia da semana"
function formatDeadlineWithWeekday(dateStr?: string | null) {
  if (!dateStr) return null;
  try {
    const cleanDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const parts = cleanDate.split("-");
    if (parts.length < 3) return `PRAZO: ${dateStr}`;

    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (isNaN(d.getTime())) return `PRAZO: ${dateStr}`;

    const weekdays = [
      "domingo",
      "segunda-feira",
      "terça-feira",
      "quarta-feira",
      "quinta-feira",
      "sexta-feira",
      "sábado",
    ];
    const weekday = weekdays[d.getDay()] || "";
    const shortYear = year.slice(-2);
    return `PRAZO: ${day}/${month}/${shortYear}${weekday ? ` - ${weekday}` : ""}`;
  } catch {
    return `PRAZO: ${dateStr}`;
  }
}

// Helpers para Formatação e Máscara de CNPJ e Telefone
function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

// Helper padronizado para remover prefixos de categoria (ex: [REQ. INTERNA], [TAREFA], [ORÇAMENTO], etc.)
export function getCleanDealTitle(title: string | undefined | null): string {
  if (!title) return "";
  return title.replace(/^\[[^\]]+\]\s*/i, "").trim().toUpperCase();
}

// Helper para extrair informações do arquivo de orçamento oficial
export function getDealQuoteFile(deal: Deal | null, _historyList?: DealHistoryItem[]): { url: string; name: string; uploadedAt: string } | null {
  if (!deal) return null;
  if (deal.quote_file_url) {
    return {
      url: deal.quote_file_url,
      name: deal.quote_file_name || "orcamento_oficial",
      uploadedAt: deal.quote_file_uploaded_at || deal.updated_at || deal.created_at,
    };
  }
  if (deal.notes && deal.notes.includes("[QUOTE_FILE:")) {
    try {
      const match = deal.notes.match(/\[QUOTE_FILE:(.*?)\]/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (parsed.url) {
          return {
            url: parsed.url,
            name: parsed.name || "orcamento_oficial",
            uploadedAt: parsed.uploadedAt || deal.updated_at || deal.created_at,
          };
        }
      }
    } catch (e) {}
  }
  return null;
}

// Helper para otimização e compressão leve no client-side antes do upload
async function compressImageForUpload(file: File): Promise<{ file: Blob; fileName: string; isImage: boolean }> {
  if (!file.type.startsWith("image/")) {
    return { file, fileName: file.name, isImage: false };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Dimensão máxima de 1500px para garantir leitura nítida com tamanho mínimo
        const maxDimension = 1500;
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
        }

        // Converte para WebP (ou JPEG) com qualidade 0.70
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const baseName = file.name.replace(/\.[^/.]+$/, "");
              resolve({
                file: blob,
                fileName: `${baseName}_otimizado.webp`,
                isImage: true,
              });
            } else {
              resolve({ file, fileName: file.name, isImage: true });
            }
          },
          "image/webp",
          0.70
        );
      };
      img.onerror = () => resolve({ file, fileName: file.name, isImage: true });
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve({ file, fileName: file.name, isImage: true });
    reader.readAsDataURL(file);
  });
}

// Algoritmo de Cores e Texto de Hover do Prazo:
function getDeadlineInfo(dateStr?: string | null) {
  if (!dateStr) return { colorClass: "text-accent font-bold", hoverText: "", tooltipColorClass: "" };

  try {
    const cleanDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const parts = cleanDate.split("-");
    if (parts.length < 3) return { colorClass: "text-accent font-bold", hoverText: "", tooltipColorClass: "" };

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return { colorClass: "text-accent font-bold", hoverText: "", tooltipColorClass: "" };
    }

    const now = new Date();
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetZero = new Date(year, month - 1, day).getTime();

    // Diferença exata em dias corridos
    const diffDays = Math.round((targetZero - todayZero) / (1000 * 60 * 60 * 24));

    let hoverText = "";
    let colorClass = "";
    let tooltipColorClass = "";

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      hoverText = `Vencida há ${absDays} ${absDays === 1 ? "dia" : "dias"}`;
      colorClass = "text-red-400 font-black animate-pulse";
      tooltipColorClass = "bg-rose-950/95 text-rose-200 border-rose-500/80 shadow-rose-950/60";
    } else if (diffDays === 0) {
      hoverText = "Vence hoje";
      colorClass = "text-rose-400 font-black animate-pulse";
      tooltipColorClass = "bg-rose-950/95 text-rose-200 border-rose-500/80 shadow-rose-950/60";
    } else if (diffDays === 1) {
      hoverText = "Resta 1 dia";
      colorClass = "text-rose-400 font-bold animate-pulse";
      tooltipColorClass = "bg-rose-950/95 text-rose-200 border-rose-500/80 shadow-rose-950/60";
    } else if (diffDays === 2) {
      hoverText = "Restam 2 dias";
      colorClass = "text-amber-400 font-bold animate-pulse";
      tooltipColorClass = "bg-amber-950/95 text-amber-200 border-amber-500/80 shadow-amber-950/60";
    } else if (diffDays === 3) {
      hoverText = "Restam 3 dias";
      colorClass = "text-emerald-400 font-bold";
      tooltipColorClass = "bg-emerald-950/95 text-emerald-200 border-emerald-500/80 shadow-emerald-950/60";
    } else {
      hoverText = `Restam ${diffDays} dias`;
      colorClass = "text-slate-300 font-medium";
      tooltipColorClass = "bg-slate-900/95 text-slate-200 border-white/20 shadow-slate-950/50";
    }

    return { colorClass, hoverText, tooltipColorClass, diffDays };
  } catch {
    return { colorClass: "text-accent font-bold", hoverText: "Prazo da atividade", tooltipColorClass: "bg-slate-900 text-white border-white/20" };
  }
}

function getInternalDeadlineStyle(deadlineStr?: string | null) {
  const deadlineInfo = getDeadlineInfo(deadlineStr);
  const diffDays = deadlineInfo.diffDays;

  // Cor de fundo e borda padrão do card (borda segue o padrão)
  const defaultCardClass = "bg-slate-900/90 border-white/10 text-white shadow-sm";

  // Se não tiver prazo ou o vencimento for de mais de 3 dias (> 3 dias): sem indicador e texto neutro
  if (diffDays === undefined || diffDays > 3) {
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-slate-900/95 text-slate-200 border-white/20 shadow-slate-950/50",
      dotColor: "bg-slate-400",
      hoverText: diffDays === undefined ? "Sem prazo definido" : `Prazo: restam ${diffDays} dias`,
      colorClass: "text-slate-300 font-medium",
      indicatorBadge: null,
      indicatorBadgeClass: "",
      isExpired: false,
      diffDays,
    };
  }

  // Ultrapassou o prazo (< 0 dias) -> Tag e texto vermelhos pulsantes
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-red-950/95 text-red-200 border-red-500/80 shadow-black",
      dotColor: "bg-red-500",
      hoverText: `Vencida há ${absDays} ${absDays === 1 ? "dia" : "dias"}`,
      colorClass: "text-red-400 font-black animate-pulse",
      indicatorBadge: `Vencida há ${absDays} ${absDays === 1 ? "dia" : "dias"}`,
      indicatorBadgeClass: "bg-red-950/90 text-red-300 border-red-600 font-black animate-pulse rounded-md px-2 py-0.5",
      isExpired: true,
      diffDays,
    };
  }

  // Vence hoje (0 dias) -> Tag "HOJE" e texto vermelhos pulsantes
  if (diffDays === 0) {
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-rose-950/95 text-rose-200 border-rose-500/80 shadow-rose-950/60",
      dotColor: "bg-rose-400",
      hoverText: "Vence hoje",
      colorClass: "text-rose-400 font-black animate-pulse",
      indicatorBadge: "HOJE",
      indicatorBadgeClass: "bg-rose-950/90 text-rose-200 border-rose-500 font-black tracking-tight animate-pulse rounded-md px-2 py-0.5",
      isExpired: false,
      diffDays,
    };
  }

  // 1 dia para o fim do prazo -> Tag "1 DIA" e texto vermelhos pulsantes
  if (diffDays === 1) {
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-rose-950/95 text-rose-200 border-rose-400/70 shadow-rose-900/50",
      dotColor: "bg-rose-400",
      hoverText: "Resta 1 dia",
      colorClass: "text-rose-400 font-bold animate-pulse",
      indicatorBadge: "1 DIA",
      indicatorBadgeClass: "bg-rose-950/80 text-rose-300 border-rose-500/70 font-black animate-pulse rounded-md px-2 py-0.5",
      isExpired: false,
      diffDays,
    };
  }

  // 2 dias para o fim do prazo -> Tag "2 DIAS" e texto amarelos pulsantes
  if (diffDays === 2) {
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-amber-950/95 text-amber-200 border-amber-400/70 shadow-amber-900/50",
      dotColor: "bg-amber-400",
      hoverText: "Restam 2 dias",
      colorClass: "text-amber-400 font-bold animate-pulse",
      indicatorBadge: "2 DIAS",
      indicatorBadgeClass: "bg-amber-950/80 text-amber-300 border-amber-500/70 font-black animate-pulse rounded-md px-2 py-0.5",
      isExpired: false,
      diffDays,
    };
  }

  // 3 dias para o fim do prazo -> Tag "3 DIAS" e texto verdes
  return {
    cardClass: defaultCardClass,
    tooltipClass: "bg-emerald-950/95 text-emerald-200 border-emerald-400/70 shadow-emerald-900/50",
    dotColor: "bg-emerald-400",
    hoverText: "Restam 3 dias",
    colorClass: "text-emerald-400 font-bold",
    indicatorBadge: "3 DIAS",
    indicatorBadgeClass: "bg-emerald-950/80 text-emerald-300 border-emerald-500/70 font-black rounded-md px-2 py-0.5",
    isExpired: false,
    diffDays,
  };
}

// Algoritmo de Cores Vivas de Inatividade (Fundo Preenchido e Visível):
// 1º dia (0 a <1 d): Verde Vivo ("atualização hoje")
// 2º dia (1 a <2 d): Verde-Lima / Amarelado ("há 2 dias")
// 3º dia (2 a <3 d): Amarelo Intenso ("há 3 dias")
// Helper para cálculo de dias civis / efetivos (comparação por data calendário, desconsiderando horas corridas)
export function getEffectiveCalendarDays(dateStrOrTimestamp?: string | number | Date | null): number {
  if (!dateStrOrTimestamp) return 0;
  try {
    const d = new Date(dateStrOrTimestamp);
    if (isNaN(d.getTime())) return 0;

    const now = new Date();
    const targetMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const diff = Math.round((todayMidnight - targetMidnight) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  } catch {
    return 0;
  }
}

// Algoritmo de Cores Vivas de Inatividade (Fundo Preenchido e Visível):
// HOJE (0 d) e 1º dia (1 d): Verde Esmeralda ("atualizado hoje" / "há 1 dia")
// 2º dia (2 d): Verde-Lima / Amarelado ("há 2 dias")
// 3º dia (3 d): Amarelo Intenso ("há 3 dias")
// 4º dia (4 d): Laranja Forte ("há 4 dias")
// 5º ao 10º dia (5 a 10 d): Vermelho Vibrante ("há X dias")
// > 10 dias até 15 dias: Magenta Intenso ("há X dias")
// > 15 dias: Preto / Grafite Escuro ("+15 dias sem atualização")
function getDealAgingStyle(updatedAtStr: string) {
  const diffDays = getEffectiveCalendarDays(updatedAtStr);

  let hoverText = "";
  if (diffDays === 0) {
    hoverText = "Atualizado hoje";
  } else if (diffDays === 1) {
    hoverText = "Atualizado há 1 dia";
  } else if (diffDays <= 15) {
    hoverText = `Atualizado há ${diffDays} dias`;
  } else {
    hoverText = "+15 dias sem atualização";
  }

  // > 15 dias: Preto / Grafite Escuro
  if (diffDays > 15) {
    return {
      days: diffDays,
      hoverText,
      label: `+15 dias sem atualização`,
      badgeClass: "bg-black text-white border-zinc-700",
      cardClass: "bg-zinc-950 border-zinc-700 shadow-xl shadow-black/80 text-white",
      dotColor: "bg-zinc-500",
      accentText: "text-zinc-300",
      tooltipClass: "bg-zinc-950/95 text-zinc-300 border-zinc-700 shadow-black/80",
    };
  }

  // 11 a 15 dias: Magenta / Fúcsia Intenso
  if (diffDays > 10) {
    return {
      days: diffDays,
      hoverText,
      label: `há ${diffDays} dias`,
      badgeClass: "bg-fuchsia-950 text-fuchsia-200 border-fuchsia-400/60",
      cardClass: "bg-gradient-to-br from-fuchsia-900/90 via-fuchsia-950/95 to-slate-950 border-fuchsia-500/60 shadow-lg shadow-fuchsia-900/30 text-white",
      dotColor: "bg-fuchsia-400",
      accentText: "text-fuchsia-300",
      tooltipClass: "bg-fuchsia-950/95 text-fuchsia-200 border-fuchsia-400/70 shadow-fuchsia-900/50",
    };
  }

  // 5 a 10 dias: Vermelho Vibrante
  if (diffDays >= 5) {
    return {
      days: diffDays,
      hoverText,
      label: `há ${diffDays} dias`,
      badgeClass: "bg-rose-950 text-rose-200 border-rose-400/60",
      cardClass: "bg-gradient-to-br from-rose-900/90 via-rose-950/95 to-slate-950 border-rose-500/60 shadow-lg shadow-rose-900/30 text-white",
      dotColor: "bg-rose-400",
      accentText: "text-rose-300",
      tooltipClass: "bg-rose-950/95 text-rose-200 border-rose-400/70 shadow-rose-900/50",
    };
  }

  // 4º dia (4 dias): Laranja Forte
  if (diffDays === 4) {
    return {
      days: diffDays,
      hoverText,
      label: `há 4 dias`,
      badgeClass: "bg-orange-950 text-orange-200 border-orange-400/60",
      cardClass: "bg-gradient-to-br from-orange-900/90 via-orange-950/95 to-slate-950 border-orange-500/60 shadow-lg shadow-orange-900/30 text-white",
      dotColor: "bg-orange-400",
      accentText: "text-orange-300",
      tooltipClass: "bg-orange-950/95 text-orange-200 border-orange-400/70 shadow-orange-900/50",
    };
  }

  // 3º dia (3 dias): Amarelo Intenso
  if (diffDays === 3) {
    return {
      days: diffDays,
      hoverText,
      label: `há 3 dias`,
      badgeClass: "bg-amber-950 text-amber-200 border-amber-400/60",
      cardClass: "bg-gradient-to-br from-amber-900/90 via-amber-950/95 to-slate-950 border-amber-500/60 shadow-lg shadow-amber-900/30 text-white",
      dotColor: "bg-amber-400",
      accentText: "text-amber-300",
      tooltipClass: "bg-amber-950/95 text-amber-200 border-amber-400/70 shadow-amber-900/50",
    };
  }

  // 2º dia (2 dias): Verde-Lima / Amarelado
  if (diffDays === 2) {
    return {
      days: diffDays,
      hoverText,
      label: `há 2 dias`,
      badgeClass: "bg-lime-950 text-lime-200 border-lime-400/60",
      cardClass: "bg-gradient-to-br from-lime-900/90 via-lime-950/95 to-slate-950 border-lime-500/60 shadow-lg shadow-lime-900/30 text-white",
      dotColor: "bg-lime-400",
      accentText: "text-lime-300",
      tooltipClass: "bg-lime-950/95 text-lime-200 border-lime-400/70 shadow-lime-900/50",
    };
  }

  // HOJE (0 d) e 1º dia (1 d): Verde Esmeralda
  return {
    days: diffDays,
    hoverText,
    label: diffDays === 0 ? "atualização hoje" : "há 1 dia",
    badgeClass: "bg-emerald-950 text-emerald-200 border-emerald-400/60",
    cardClass: "bg-gradient-to-br from-emerald-900/90 via-emerald-950/95 to-slate-950 border-emerald-500/60 shadow-lg shadow-emerald-900/30 text-white",
    dotColor: "bg-emerald-400",
    accentText: "text-emerald-300",
    tooltipClass: "bg-emerald-950/95 text-emerald-200 border-emerald-400/70 shadow-emerald-900/50",
  };
}

function CrmDashboard() {
  const { user, loading: authLoading, role, signOut } = useAuth();
  const navigate = useNavigate();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Modal Abertura de Requisição: 'interna' ou 'externa'
  const [activeReqModal, setActiveReqModal] = useState<"interna" | "externa" | null>(null);
  const [externalSubtype, setExternalSubtype] = useState<"orcamento" | "visita_tecnica">("orcamento");
  const [newDealTitle, setNewDealTitle] = useState("");
  const [newDealCustomerId, setNewDealCustomerId] = useState("");
  const [newDealAssignedTo, setNewDealAssignedTo] = useState("");
  const [newDealDeadline, setNewDealDeadline] = useState(
    new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0]
  );
  const [newDealNotes, setNewDealNotes] = useState("");
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [inlineCompanyName, setInlineCompanyName] = useState("");
  const [inlineCustomerDoc, setInlineCustomerDoc] = useState("");
  const [inlineContactName, setInlineContactName] = useState("");
  const [inlineCustomerEmail, setInlineCustomerEmail] = useState("");
  const [inlineCustomerPhone, setInlineCustomerPhone] = useState("");

  // Filtros e busca por coluna / usuário
  const [internalFilterUser, setInternalFilterUser] = useState<string>("ALL");
  const [stageSearchTerms, setStageSearchTerms] = useState<Record<string, string>>({});
  const [openSearchStageId, setOpenSearchStageId] = useState<string | null>(null);
  const [userSearchTerms, setUserSearchTerms] = useState<Record<string, string>>({});
  const [openSearchUserId, setOpenSearchUserId] = useState<string | null>(null);
  const [hoveredSubcolUser, setHoveredSubcolUser] = useState<string | null>(null);

  // Fechar barra de pesquisa ao clicar em qualquer lugar da tela fora da busca
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".crm-search-box")) {
        setOpenSearchStageId(null);
        setOpenSearchUserId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Modal Detalhes e Histórico de Requisição
  const [selectedDealForHistory, setSelectedDealForHistory] = useState<Deal | null>(null);
  const [selectedCustomerForDetails, setSelectedCustomerForDetails] = useState<Customer | null>(null);
  const [dealHistoryList, setDealHistoryList] = useState<DealHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [autoGeneratedLogs, setAutoGeneratedLogs] = useState<string[]>([]);
  const [stageToMove, setStageToMove] = useState<Deal["stage"] | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [isSavingUpdate, setIsSavingUpdate] = useState(false);

  // Helper para adicionar logs automáticos imutáveis sempre terminados com ponto final
  const appendAutoLog = (logText: string) => {
    let clean = logText.trim();
    if (!clean) return;
    if (!clean.endsWith(".")) {
      clean += ".";
    }
    setAutoGeneratedLogs((prev) => [...prev, clean]);
  };

  // Modo de Atualização: Comentário/Reatribuição, Criar Tarefa Vinculada ou Orçamento Oficial
  const [modalUpdateTab, setModalUpdateTab] = useState<"comment" | "subtask" | "quote_file">("comment");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskAssignedTo, setSubtaskAssignedTo] = useState("");
  const [subtaskDeadline, setSubtaskDeadline] = useState("");
  const [subtaskNotes, setSubtaskNotes] = useState("");
  const [isCreatingSubtask, setIsCreatingSubtask] = useState(false);
  const [isSubtaskModalOpen, setIsSubtaskModalOpen] = useState(false);
  const [isUploadingQuoteFile, setIsUploadingQuoteFile] = useState(false);
  const [isQuoteUploaderOpen, setIsQuoteUploaderOpen] = useState(false);
  const [previewingQuoteFile, setPreviewingQuoteFile] = useState<{ url: string; name: string } | null>(null);

  // Alertas de Tarefas Vinculadas Concluídas (Bolinha de Alerta no Card)
  const [unreadParentAlerts, setUnreadParentAlerts] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("mykaflow_crm_parent_alerts");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const saveParentAlerts = (newAlerts: Record<string, boolean>) => {
    setUnreadParentAlerts(newAlerts);
    try {
      localStorage.setItem("mykaflow_crm_parent_alerts", JSON.stringify(newAlerts));
    } catch (e) {
      console.warn("Erro ao salvar alertas:", e);
    }
  };

  const handleMarkAlertAsSeen = (dealId: string) => {
    saveParentAlerts({ ...unreadParentAlerts, [dealId]: false });
    toast.success("Alerta marcado como visto!");
  };

  // Edição de Prazo pelo Administrador
  const [adminEditDeadline, setAdminEditDeadline] = useState<string>("");
  const [isEditingDeadline, setIsEditingDeadline] = useState<boolean>(false);
  const [isSavingDeadline, setIsSavingDeadline] = useState<boolean>(false);

  // Edição de Título pelo Autor da Atividade ou Administrador
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editingTitleValue, setEditingTitleValue] = useState<string>("");
  const [isSavingTitle, setIsSavingTitle] = useState<boolean>(false);

  // Central de Alertas ADM (Prazos ultrapassados e Devoluções aos criadores)
  const [isAdminAlertsOpen, setIsAdminAlertsOpen] = useState(false);
  const [returnedHistoryList, setReturnedHistoryList] = useState<any[]>([]);

  // Isolamento de Coluna / Tipo de Requisição na Tela
  const [isolatedStageId, setIsolatedStageId] = useState<string | null>(null);

  // Movimentação Manual Drag and Drop entre Etapas e Reordenação de Prioridade
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [dragOverTargetDealId, setDragOverTargetDealId] = useState<string | null>(null);
  const [dragDropPosition, setDragDropPosition] = useState<"before" | "after">("before");
  const quoteFileInputRef = useRef<HTMLInputElement | null>(null);
  const isDraggingRef = useRef(false);
  const draggingDealIdRef = useRef<string | null>(null);

  // Ordenação de prioridade personalizada por coluna (persistido localmente para o usuário)
  const [stageCustomOrders, setStageCustomOrders] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem("mykaflow_crm_stage_order");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Controle de recolhimento / expansão de tarefas vinculadas no Kanban (via clique ou hover)
  const [expandedSubtaskDealIds, setExpandedSubtaskDealIds] = useState<Record<string, boolean>>({});
  const [hoveredSubtasksDealId, setHoveredSubtasksDealId] = useState<string | null>(null);

  const toggleSubtasks = (dealId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedSubtaskDealIds((prev) => ({
      ...prev,
      [dealId]: !prev[dealId],
    }));
  };

  // Modal de Atualização Obrigatória ao Mover de Coluna / Etapa
  const [movingDealState, setMovingDealState] = useState<{
    deal: Deal;
    targetStage: Deal["stage"];
    updateText: string;
    updatedNotes: string;
    reassignTo: string;
  } | null>(null);
  const [isSavingMove, setIsSavingMove] = useState(false);

  // Modal Fechar Contrato / Integração Fluxo de Caixa
  const [contractModalDeal, setContractModalDeal] = useState<Deal | null>(null);
  const [contractInstallments, setContractInstallments] = useState(1);
  const [contractStartDate, setContractStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal / Gaveta de Requisições Internas Arquivadas
  const [isArchivedModalOpen, setIsArchivedModalOpen] = useState(false);
  const [archivedSearchTerm, setArchivedSearchTerm] = useState("");

  // Menu Lateral Flutuante / Off-Canvas
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);

  const handleExit = async () => {
    setIsSideMenuOpen(false);
    if (role === "admin") {
      navigate({ to: "/" });
    } else {
      await signOut();
      navigate({ to: "/login" });
    }
  };

  // Alternar filtro rápido por usuário clicável
  function handleToggleUserFilter(userId?: string | null, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!userId) return;
    setIsolatedStageId(null);
    setSelectedDealForHistory(null);
    setInternalFilterUser((prev) => (prev === userId ? "ALL" : userId));
  }

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  // Listener Global da tecla ESC para fechar qualquer modal, gaveta, formulário ou card aberto
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Se houver preview de arquivo ou modal específico aberto no topo, fecha o mais específico primeiro
        if (previewingQuoteFile) {
          setPreviewingQuoteFile(null);
          return;
        }
        if (isQuoteUploaderOpen) {
          setIsQuoteUploaderOpen(false);
          return;
        }
        if (isSubtaskModalOpen) {
          setIsSubtaskModalOpen(false);
          return;
        }
        if (isNewCustomerModalOpen) {
          setIsNewCustomerModalOpen(false);
          return;
        }
        if (selectedCustomerForDetails) {
          setSelectedCustomerForDetails(null);
          return;
        }
        if (isEditingTitle) {
          setIsEditingTitle(false);
          return;
        }
        if (isEditingDeadline) {
          setIsEditingDeadline(false);
          return;
        }
        if (isTimelineOpen) {
          setIsTimelineOpen(false);
          return;
        }
        if (activeReqModal) {
          setActiveReqModal(null);
          return;
        }
        if (movingDealState) {
          setMovingDealState(null);
          return;
        }
        if (contractModalDeal) {
          setContractModalDeal(null);
          return;
        }
        if (isAdminAlertsOpen) {
          setIsAdminAlertsOpen(false);
          return;
        }
        if (isArchivedModalOpen) {
          setIsArchivedModalOpen(false);
          return;
        }
        if (isSideMenuOpen) {
          setIsSideMenuOpen(false);
          return;
        }
        if (isProfileOpen) {
          setIsProfileOpen(false);
          return;
        }
        if (selectedDealForHistory) {
          setSelectedDealForHistory(null);
          return;
        }
        if (isolatedStageId) {
          setIsolatedStageId(null);
          return;
        }
        if (openSearchStageId || openSearchUserId) {
          setOpenSearchStageId(null);
          setOpenSearchUserId(null);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    previewingQuoteFile,
    isQuoteUploaderOpen,
    isSubtaskModalOpen,
    isNewCustomerModalOpen,
    selectedCustomerForDetails,
    isEditingTitle,
    isEditingDeadline,
    isTimelineOpen,
    activeReqModal,
    movingDealState,
    contractModalDeal,
    isAdminAlertsOpen,
    isArchivedModalOpen,
    isSideMenuOpen,
    isProfileOpen,
    selectedDealForHistory,
    isolatedStageId,
    openSearchStageId,
    openSearchUserId,
  ]);

  async function loadCrmData() {
    setLoading(true);
    try {
      const { data: custData } = await supabase
        .from("crm_customers")
        .select("*")
        .order("name");

      const { data: profsData } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .order("display_name");

      const { data: dealsData } = await supabase
        .from("crm_deals")
        .select("*, crm_customers(name)")
        .order("updated_at", { ascending: false });

      // Busca histórico recente para obter o autor da última atualização de cada atividade
      let historyMap = new Map<string, string>();
      try {
        const { data: recentHistory } = await supabase
          .from("crm_deal_history")
          .select("deal_id, user_name, created_at")
          .order("created_at", { ascending: false })
          .limit(300);

        if (recentHistory) {
          recentHistory.forEach((h: any) => {
            if (h.deal_id && h.user_name && !historyMap.has(h.deal_id)) {
              historyMap.set(h.deal_id, h.user_name);
            }
          });
        }
      } catch (hErr) {
        console.warn("Aviso ao buscar histórico para autores de atualização:", hErr);
      }

      if (custData) setCustomers(custData);
      if (profsData) {
        setTeamMembers(
          profsData.map((p) => ({
            ...p,
            display_name: p.display_name ? p.display_name.toUpperCase() : p.display_name,
          }))
        );
      }
      if (dealsData) {
        const mappedDeals: Deal[] = dealsData.map((d: any) => {
          const creatorProf = profsData?.find((p) => p.id === d.user_id);
          const mappedStage = d.stage === "proposal" ? "negotiation" : d.stage;
          const creatorName = (
            creatorProf?.display_name ||
            creatorProf?.email ||
            (d.user_id === user?.id
              ? user?.user_metadata?.display_name || user?.email || "Você"
              : "Autor")
          ).toUpperCase();
          const rawLatestAuthor = historyMap.get(d.id);
          const latestAuthor = (rawLatestAuthor || creatorName).toUpperCase();
          const assignedProf = profsData?.find((p) => p.id === d.assigned_user_id);
          const assignedName = (
            assignedProf?.display_name ||
            assignedProf?.email ||
            "Não atribuído"
          ).toUpperCase();

          return {
            ...d,
            stage: mappedStage,
            customer_name:
              d.crm_customers?.company_name ||
              d.crm_customers?.name ||
              "Uso Interno / Empresa",
            creator_name: creatorName,
            latest_update_author: latestAuthor,
            assigned_user_name: assignedName,
          };
        });

        // Sincroniza e corrige automaticamente o stage de todas as tarefas vinculadas existentes
        // para que fiquem exatamente na mesma coluna da atividade mãe
        const syncedDeals = mappedDeals.map((deal) => {
          if (!deal.notes || !deal.title.includes("[TAREFA]")) return deal;

          let parentId: string | null = null;
          let parentReq: string | null = null;

          if (deal.notes.includes("[PARENT_DEAL:")) {
            try {
              const match = deal.notes.match(/\[PARENT_DEAL:(.*?)\]/);
              if (match && match[1]) {
                const data = JSON.parse(match[1]);
                parentId = data.parentId;
                parentReq = data.parentReq;
              }
            } catch (e) {}
          }
          if (!parentId) {
            const match = deal.notes.match(/Tarefa vinculada a:\s*(.*?)\s*\(Nº\s*([0-9.]+)\)/i);
            if (match) {
              parentReq = match[2].trim();
            }
          }

          if (parentId || parentReq) {
            const parent = mappedDeals.find(
              (p) => (parentId && p.id === parentId) || (parentReq && getDealReqNumber(p, mappedDeals) === parentReq)
            );
            if (parent && parent.stage && parent.stage !== deal.stage) {
              // Atualiza no banco de dados para persistir a correção
              supabase
                .from("crm_deals")
                .update({ stage: parent.stage })
                .eq("id", deal.id)
                .then();

              return {
                ...deal,
                stage: parent.stage,
              };
            }
          }

          return deal;
        });

        setDeals(syncedDeals);
      }

      // Busca histórico de devoluções para alerta dos administradores
      try {
        const { data: retHistory } = await supabase
          .from("crm_deal_history")
          .select("*")
          .eq("action_type", "returned_to_creator")
          .order("created_at", { ascending: false })
          .limit(30);

        if (retHistory) setReturnedHistoryList(retHistory);
      } catch (historyErr) {
        console.warn("Aviso ao carregar histórico de devoluções:", historyErr);
      }
    } catch (err: any) {
      console.error("Erro ao carregar dados do CRM:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadCrmData();
    }
  }, [user]);

  function openNewRequestModal(type: "interna" | "externa") {
    setActiveReqModal(type);
    setNewDealTitle("");
    setNewDealCustomerId("");
    setNewDealAssignedTo("");
    setNewDealNotes("");
    setIsNewCustomerModalOpen(false);
    setInlineCompanyName("");
    setInlineCustomerDoc("");
    setInlineContactName("");
    setInlineCustomerEmail("");
    setInlineCustomerPhone("");
    setNewDealDeadline(
      type === "interna"
        ? new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0]
        : ""
    );
  }

  // Helper para identificar vínculo de atividade primária
  const getParentDealInfo = (deal: Deal | null) => {
    if (!deal || !deal.notes) return null;

    // 1. Tag [PARENT_DEAL:{...}]
    if (deal.notes.includes("[PARENT_DEAL:")) {
      try {
        const match = deal.notes.match(/\[PARENT_DEAL:(.*?)\]/);
        if (match && match[1]) {
          const data = JSON.parse(match[1]);
          const found = deals.find((d) => d.id === data.parentId);
          return {
            id: data.parentId,
            title: data.parentTitle,
            reqNumber: data.parentReq,
            deal: found,
          };
        }
      } catch (e) {
        console.warn("Erro ao parsear PARENT_DEAL:", e);
      }
    }

    // 2. Regex nos notes: Tarefa vinculada a: ... (Nº ...)
    const match = deal.notes.match(/Tarefa vinculada a:\s*(.*?)\s*\(Nº\s*([0-9.]+)\)/i);
    if (match) {
      const title = match[1].trim();
      const reqNumber = match[2].trim();
      const found = deals.find((d) => getDealReqNumber(d, deals) === reqNumber);
      return {
        id: found?.id || "",
        title: found?.title || title,
        reqNumber,
        deal: found,
      };
    }

    return null;
  };

  // Helper para obter o cliente de um deal (incluindo herança de atividade primária)
  const getDealCustomer = (deal: Deal | null): Customer | null => {
    if (!deal) return null;
    if (deal.customer_id) {
      const found = customers.find((c) => c.id === deal.customer_id);
      if (found) return found;
    }
    if (deal.customer_name && deal.customer_name !== "Uso Interno / Empresa") {
      const found = customers.find(
        (c) =>
          c.company_name?.toUpperCase() === deal.customer_name?.toUpperCase() ||
          c.name?.toUpperCase() === deal.customer_name?.toUpperCase()
      );
      if (found) return found;
    }
    const parentInfo = getParentDealInfo(deal);
    if (parentInfo?.deal) {
      return getDealCustomer(parentInfo.deal);
    }
    return null;
  };

  // Helper para limpar notas para exibição no hover do card
  const getCleanHoverNote = (notes?: string | null) => {
    if (!notes) return "Sem atualizações registradas.";
    const clean = notes
      .replace(/\[PARENT_DEAL:.*?\]\s*/g, "")
      .replace(/\[QUOTE_FILE:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_LINK:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_COMPLETED:.*?\]\s*/g, "")
      .replace(/\[DEVOLVIDA\]\s*/g, "")
      .replace(/\[HISTÓRICO_.*?:.*?\]\s*/g, "")
      .trim();
    return clean || "Sem atualizações registradas.";
  };

  // Helper unificado para renderizar descrições com botões clicáveis (criação e conclusão de tarefas)
  const renderInteractiveDescription = (rawText: string) => {
    if (!rawText) return null;
    const sanitized = rawText
      .replace(/\[PARENT_DEAL:.*?\]\s*/g, "")
      .replace(/\[QUOTE_FILE:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_LINK:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_COMPLETED:.*?\]\s*/g, "")
      .replace(/\[DEVOLVIDA\]\s*/g, "")
      .replace(/\[HISTÓRICO_.*?:.*?\]\s*/g, "")
      .trim();

    if (!sanitized) return null;

    const lines = sanitized.split("\n");

    return (
      <div className="space-y-1 pt-0.5">
        {lines.map((line, lineIdx) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return <div key={lineIdx} className="h-1" />;

          // 1. Criação de Tarefa Vinculada
          const createMatch = trimmedLine.match(/^([A-Za-z0-9À-ÿ\s._-]+?)\s+criou a tarefa\s+"([^"]+)"\s+para o\s+([A-Za-z0-9À-ÿ\s._-]+)$/i);
          if (createMatch) {
            const creatorName = createMatch[1].trim();
            const subtaskTitle = createMatch[2].trim();
            const assignedName = createMatch[3].trim();

            const creatorUser = teamMembers.find(
              (m) =>
                m.display_name?.toUpperCase() === creatorName.toUpperCase() ||
                m.email?.toUpperCase() === creatorName.toUpperCase()
            );
            const assignedUser = teamMembers.find(
              (m) =>
                m.display_name?.toUpperCase() === assignedName.toUpperCase() ||
                m.email?.toUpperCase() === assignedName.toUpperCase()
            );
            const matchedDeal = deals.find(
              (d) =>
                d.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "").trim().toUpperCase() === subtaskTitle.toUpperCase() ||
                d.title.toUpperCase().includes(subtaskTitle.toUpperCase())
            );

            return (
              <div
                key={lineIdx}
                className="flex flex-wrap items-center gap-1.5 text-xs text-white/90 py-1 pl-3 border-l-2 border-emerald-400 my-1"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleUserFilter(creatorUser?.id || null, e);
                  }}
                  className="font-bold text-white hover:underline cursor-pointer uppercase"
                  title={`Filtrar por ${creatorName}`}
                >
                  {creatorName}
                </button>
                <span className="text-white/80">criou a tarefa</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (matchedDeal) {
                      openDealHistory(matchedDeal);
                    } else {
                      toast.info(`Tarefa: ${subtaskTitle}`);
                    }
                  }}
                  className="font-black text-emerald-300 hover:text-white hover:underline inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 px-2 py-0.5 rounded-md cursor-pointer shadow-sm transition-all"
                  title="Clique para abrir esta tarefa"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{subtaskTitle}</span>
                </button>
                <span className="text-white/80">para o</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleUserFilter(assignedUser?.id || null, e);
                  }}
                  className="font-bold text-white hover:underline cursor-pointer uppercase"
                  title={`Filtrar por ${assignedName}`}
                >
                  {assignedName}
                </button>
              </div>
            );
          }

          // 2. Conclusão de Tarefa Vinculada
          const completeMatch = trimmedLine.match(/^([A-Za-z0-9À-ÿ\s._-]+?)\s+concluiu a tarefa\s+"([^"]+)"(.*)$/i);
          if (completeMatch) {
            const userName = completeMatch[1].trim();
            const subtaskTitle = completeMatch[2].trim();
            const extraNotes = completeMatch[3] ? completeMatch[3].trim() : "";

            const userObj = teamMembers.find(
              (m) =>
                m.display_name?.toUpperCase() === userName.toUpperCase() ||
                m.email?.toUpperCase() === userName.toUpperCase()
            );
            const matchedDeal = deals.find(
              (d) =>
                d.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "").trim().toUpperCase() === subtaskTitle.toUpperCase() ||
                d.title.toUpperCase().includes(subtaskTitle.toUpperCase())
            );

            return (
              <div
                key={lineIdx}
                className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-300 py-1 pl-3 border-l-2 border-emerald-500 my-1"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleUserFilter(userObj?.id || null, e);
                  }}
                  className="font-bold text-white hover:underline cursor-pointer uppercase"
                  title={`Filtrar por ${userName}`}
                >
                  {userName}
                </button>
                <span className="text-emerald-100/90">concluiu a tarefa</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (matchedDeal) {
                      openDealHistory(matchedDeal);
                    } else {
                      toast.info(`Tarefa: ${subtaskTitle}`);
                    }
                  }}
                  className="font-black text-emerald-200 hover:text-white hover:underline inline-flex items-center gap-1.5 bg-emerald-500/30 hover:bg-emerald-500/40 border border-emerald-400/50 px-2 py-0.5 rounded-md cursor-pointer shadow-sm transition-all"
                  title="Clique para abrir esta tarefa"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{subtaskTitle}</span>
                </button>
                {extraNotes && <span className="text-white/80 text-xs ml-1">{extraNotes}</span>}
              </div>
            );
          }

          // 3. Orçamento Oficial Anexado na Linha do Tempo
          const quoteDocMatch = trimmedLine.match(/^(\[QUOTE_DOC:.*?\]\s*)?([A-Za-z0-9À-ÿ\s._-]+?)\s+anexou o documento de orçamento oficial\s+"([^"]+)"\s*(?:\(([^)]+)\))?.*$/i);
          if (quoteDocMatch || trimmedLine.includes("[QUOTE_DOC:")) {
            let docUrl = "";
            let fileName = "orcamento_oficial";
            let fileSize = "";
            let userName = "Usuário";

            if (trimmedLine.includes("[QUOTE_DOC:")) {
              try {
                const jsonStr = trimmedLine.match(/\[QUOTE_DOC:(.*?)\]/)?.[1];
                if (jsonStr) {
                  const parsed = JSON.parse(jsonStr);
                  docUrl = parsed.url;
                  fileName = parsed.name || fileName;
                  fileSize = parsed.sizeKb ? `${parsed.sizeKb} KB` : "";
                }
              } catch (e) {}
            }

            if (quoteDocMatch) {
              userName = quoteDocMatch[2]?.trim() || userName;
              fileName = quoteDocMatch[3]?.trim() || fileName;
              if (quoteDocMatch[4]) fileSize = quoteDocMatch[4].trim();
            }

            const currentDoc = getDealQuoteFile(selectedDealForHistory, dealHistoryList);
            const finalUrl = docUrl || currentDoc?.url;

            return (
              <div
                key={lineIdx}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border border-emerald-500/40 my-1 shadow-sm"
              >
                <div className="flex items-center gap-2.5 text-xs">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                    <FileCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white uppercase">{userName}</span>
                    <span className="text-emerald-200/90 ml-1 font-semibold">anexou o Orçamento Oficial</span>
                    <p className="font-mono text-[11px] text-emerald-300 font-bold mt-0.5 truncate max-w-[260px]">
                      {fileName} {fileSize ? `(${fileSize})` : ""}
                    </p>
                  </div>
                </div>

                {finalUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewingQuoteFile({ url: finalUrl, name: fileName });
                    }}
                    className="btn-futuristic px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow cursor-pointer shrink-0 ml-auto"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Visualizar</span>
                  </button>
                )}
              </div>
            );
          }

          return (
            <p key={lineIdx} className="text-white/90 text-xs whitespace-pre-wrap leading-relaxed">
              {line}
            </p>
          );
        })}
      </div>
    );
  };

  async function openDealHistory(deal: Deal) {
    setSelectedDealForHistory(deal);
    setModalUpdateTab("comment");
    setNewComment("");
    setAutoGeneratedLogs([]);
    setStageToMove(null);
    setReassignTo("");
    setIsSubtaskModalOpen(false);
    setIsQuoteUploaderOpen(false);
    setAdminEditDeadline(deal.expected_close_date || new Date().toISOString().split("T")[0]);
    setIsEditingDeadline(false);
    setIsEditingTitle(false);
    setIsTimelineOpen(false);
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("crm_deal_history")
        .select("*")
        .eq("deal_id", deal.id)
        .order("created_at", { ascending: false });

      if (error && error.code !== "42P01") {
        console.warn("Aviso ao carregar histórico:", error.message);
      }
      const formattedHistory = (data || []).map((h) => ({
        ...h,
        user_name: (h.user_name || "Usuário").toUpperCase(),
      }));
      setDealHistoryList(formattedHistory);
    } catch (err: any) {
      console.error("Erro ao buscar histórico:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Abertura automática de atividade requisitada via Central de Alertas ADM ou URL
  useEffect(() => {
    if (deals.length > 0 && !selectedDealForHistory) {
      const storedDealId = sessionStorage.getItem("mykaflow_open_deal_id");
      const urlParams = new URLSearchParams(window.location.search);
      const paramDealId = urlParams.get("dealId") || storedDealId;

      if (paramDealId) {
        sessionStorage.removeItem("mykaflow_open_deal_id");
        const found = deals.find((d) => d.id === paramDealId);
        if (found) {
          openDealHistory(found);
        }
      }
    }
  }, [deals]);

  const handleStartEditTitle = () => {
    if (!selectedDealForHistory) return;
    const cleanTitle = getCleanDealTitle(selectedDealForHistory.title);
    setEditingTitleValue(cleanTitle);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (!selectedDealForHistory || !editingTitleValue.trim()) return;

    // Apenas o autor da atividade ou o administrador podem alterar o título
    const canEditTitle = role === "admin" || selectedDealForHistory.user_id === user?.id;
    if (!canEditTitle) {
      return toast.error("Apenas o autor da atividade ou o administrador podem alterar o título.");
    }

    setIsSavingTitle(true);
    const deal = selectedDealForHistory;
    const nowIso = new Date().toISOString();
    const oldTitleClean = getCleanDealTitle(deal.title);
    const newTitleClean = editingTitleValue.trim().toUpperCase();

    // Se o título não mudou, apenas fecha a edição
    if (oldTitleClean === newTitleClean) {
      setIsEditingTitle(false);
      setIsSavingTitle(false);
      return;
    }

    try {
      const prefixMatch = deal.title.match(/^\[[^\]]+\]\s*/i);
      const prefix = prefixMatch ? prefixMatch[0] : "";
      const finalTitle = `${prefix}${newTitleClean}`;

      const { error } = await supabase
        .from("crm_deals")
        .update({
          title: finalTitle,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      const desc = `Título da atividade alterado de "${oldTitleClean}" para "${newTitleClean}" por ${user?.user_metadata?.display_name || user?.email}.`;

      await registerHistoryEntry(deal.id, "title_changed", desc);

      const historyEntry: DealHistoryItem = {
        id: crypto.randomUUID(),
        deal_id: deal.id,
        user_name: user?.user_metadata?.display_name || user?.email || "Usuário",
        action_type: "title_changed",
        description: desc,
        created_at: nowIso,
      };

      setDealHistoryList((prev) => [historyEntry, ...prev]);

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, title: finalTitle, updated_at: nowIso }
            : d
        )
      );

      setSelectedDealForHistory((prev) =>
        prev
          ? {
              ...prev,
              title: finalTitle,
              updated_at: nowIso,
            }
          : null
      );

      setIsEditingTitle(false);
      toast.success("Título da atividade atualizado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao alterar título: " + (err.message || "Tente novamente"));
    } finally {
      setIsSavingTitle(false);
    }
  };

  async function handleAdminUpdateDeadline() {
    if (!selectedDealForHistory || !adminEditDeadline) return;
    if (role !== "admin") {
      return toast.error("Apenas administradores podem alterar o prazo de qualquer requisição");
    }

    setIsSavingDeadline(true);
    const deal = selectedDealForHistory;
    const nowIso = new Date().toISOString();
    const oldDeadlineFmt = deal.expected_close_date
      ? deal.expected_close_date.split("-").reverse().join("/")
      : "Não definido";
    const newDeadlineFmt = adminEditDeadline.split("-").reverse().join("/");

    try {
      const { error } = await supabase
        .from("crm_deals")
        .update({
          expected_close_date: adminEditDeadline,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      const desc = `Prazo alterado de ${oldDeadlineFmt} para ${newDeadlineFmt} pelo Administrador (${user?.user_metadata?.display_name || user?.email}).`;

      await registerHistoryEntry(
        deal.id,
        "deadline_changed",
        desc
      );

      const historyEntry: DealHistoryItem = {
        id: crypto.randomUUID(),
        deal_id: deal.id,
        user_name: user?.user_metadata?.display_name || user?.email || "Administrador",
        action_type: "deadline_changed",
        description: desc,
        created_at: nowIso,
      };

      setDealHistoryList((prev) => [historyEntry, ...prev]);

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, expected_close_date: adminEditDeadline, updated_at: nowIso }
            : d
        )
      );

      setSelectedDealForHistory((prev) =>
        prev
          ? {
              ...prev,
              expected_close_date: adminEditDeadline,
              updated_at: nowIso,
            }
          : null
      );

      setIsEditingDeadline(false);
      toast.success(`Prazo alterado para ${newDeadlineFmt} com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao alterar prazo: " + err.message);
    } finally {
      setIsSavingDeadline(false);
    }
  }

  async function registerHistoryEntry(
    dealId: string,
    actionType: string,
    description: string,
    oldVal?: string,
    newVal?: string
  ) {
    const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
    const nowIso = new Date().toISOString();

    try {
      await supabase.from("crm_deal_history").insert({
        deal_id: dealId,
        user_id: user?.id,
        user_name: userName,
        action_type: actionType,
        description: description,
        old_value: oldVal || null,
        new_value: newVal || null,
        created_at: nowIso,
      });

      await supabase
        .from("crm_deals")
        .update({ updated_at: nowIso })
        .eq("id", dealId);

      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, updated_at: nowIso } : d))
      );
    } catch (err) {
      console.warn("Erro ao gravar histórico:", err);
    }
  }

  const [isDeletingDeal, setIsDeletingDeal] = useState<boolean>(false);

  async function handleDeleteDeal(deal: Deal) {
    if (role !== "admin") {
      return toast.error("Apenas administradores podem remover requisições do sistema");
    }

    const reqNum = getDealReqNumber(deal, deals);
    const cleanTitle = deal.title.replace(/^\[REQ\.\s*(INTERNA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "");
    const confirmDelete = window.confirm(
      `Tem certeza que deseja excluir permanentemente a Requisição Nº ${reqNum} ("${cleanTitle}")?\n\nEsta ação removerá a requisição e todo o seu histórico e não poderá ser desfeita.`
    );

    if (!confirmDelete) return;

    setIsDeletingDeal(true);
    try {
      // 1. Remove histórico vinculado
      try {
        await supabase
          .from("crm_deal_history")
          .delete()
          .eq("deal_id", deal.id);
      } catch (hErr) {
        console.warn("Aviso ao remover histórico da requisição:", hErr);
      }

      // 2. Remove a requisição do CRM
      const { error } = await supabase
        .from("crm_deals")
        .delete()
        .eq("id", deal.id);

      if (error) throw error;

      // 3. Atualiza estado local
      setDeals((prev) => prev.filter((d) => d.id !== deal.id));
      setSelectedDealForHistory(null);
      toast.success(`Requisição Nº ${reqNum} excluída com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao excluir requisição: " + (err.message || "Tente novamente"));
    } finally {
      setIsDeletingDeal(false);
    }
  }

  // Notificação Automática para Atividade Mãe quando uma Tarefa Vinculada é Concluída
  async function notifyParentDealIfSubtask(completedDeal: Deal, completionNote?: string) {
    try {
      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";

      // Procura histórico no CRM onde esta tarefa foi vinculada a uma atividade mãe
      const { data: linkHistories } = await supabase
        .from("crm_deal_history")
        .select("deal_id, description")
        .ilike("description", `%${completedDeal.id}%`)
        .order("created_at", { ascending: false });

      let parentDealId: string | null = null;
      if (linkHistories && linkHistories.length > 0) {
        parentDealId = linkHistories[0].deal_id;
      }

      if (!parentDealId && completedDeal.notes) {
        const match = completedDeal.notes.match(/Tarefa vinculada a:\s*(.*?)\s*\(Nº\s*([0-9.]+)\)/i);
        if (match && match[2]) {
          const found = deals.find((d) => getDealReqNumber(d, deals) === match[2]);
          if (found) parentDealId = found.id;
        }
      }

      if (parentDealId && parentDealId !== completedDeal.id) {
        const cleanSubtaskTitle = completedDeal.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA)\]\s*/i, "");
        const metaObj = {
          type: "subtask_completed",
          subtaskId: completedDeal.id,
          subtaskTitle: cleanSubtaskTitle,
          userName,
          userId: user?.id,
        };
        const subtaskCompTag = `[SUBTASK_COMPLETED:${JSON.stringify(metaObj)}]`;
        const noteSuffix = completionNote ? ` - "${completionNote}"` : "";
        const desc = `${subtaskCompTag} ${userName} concluiu a tarefa "${cleanSubtaskTitle}"${noteSuffix}`;

        await registerHistoryEntry(parentDealId, "subtask_completed", desc);

        // Marca o alerta visual no card da atividade mãe
        const currentAlerts = { ...unreadParentAlerts, [parentDealId]: true };
        saveParentAlerts(currentAlerts);
      }
    } catch (err) {
      console.warn("Aviso ao notificar atividade mãe sobre conclusão de subtarefa:", err);
    }
  }

  // Criação de Nova Tarefa Vinculada a partir do Card Expandido
  async function handleCreateSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDealForHistory) return;
    if (!subtaskTitle.trim()) {
      return toast.error("Informe o título da tarefa.");
    }
    if (!subtaskAssignedTo) {
      return toast.error("Selecione o responsável pela tarefa.");
    }

    setIsCreatingSubtask(true);
    try {
      const generatedReqNumber = generateNextReqNumber(deals);
      const assignedProf = teamMembers.find((m) => m.id === subtaskAssignedTo);
      const assignedName = assignedProf?.display_name || assignedProf?.email || "Responsável";
      const creatorName = user?.user_metadata?.display_name || user?.email || "Você";

      const parentReqNum = getDealReqNumber(selectedDealForHistory, deals);
      const parentCleanTitle = selectedDealForHistory.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "");
      const parentMeta = {
        parentId: selectedDealForHistory.id,
        parentTitle: parentCleanTitle,
        parentReq: parentReqNum,
      };
      const parentDealTag = `[PARENT_DEAL:${JSON.stringify(parentMeta)}]`;
      const targetStage = (
        selectedDealForHistory.stage === "proposal" ? "negotiation" : selectedDealForHistory.stage
      ) as Deal["stage"];

      const subtaskPayload = {
        title: `[TAREFA] ${subtaskTitle.trim().toUpperCase()}`,
        stage: targetStage,
        customer_id: selectedDealForHistory.customer_id || null,
        user_id: user?.id,
        assigned_user_id: subtaskAssignedTo,
        expected_close_date: subtaskDeadline || null,
        notes: `${parentDealTag} Tarefa vinculada a: ${parentCleanTitle} (Nº ${parentReqNum})\nInstruções: ${subtaskNotes.trim()}`,
      };

      const { data: createdData, error } = await supabase
        .from("crm_deals")
        .insert(subtaskPayload)
        .select()
        .single();

      if (error) throw error;

      // 1. Cria histórico da própria nova tarefa
      try {
        await supabase.from("crm_deal_history").insert({
          deal_id: createdData.id,
          user_id: user?.id,
          user_name: creatorName,
          action_type: "created",
          description: `Tarefa criada a partir da atividade "${selectedDealForHistory.title}" e direcionada para ${assignedName}.`,
        });
      } catch (hErr) {
        console.warn("Aviso ao criar histórico da subtarefa:", hErr);
      }

      // 2. Monta o texto limpo da criação da tarefa e insere na lista de logs imutáveis
      const subtaskText = `${creatorName} criou a tarefa "${subtaskTitle.trim().toUpperCase()}" para o ${assignedName}.`;

      // Adiciona a nova tarefa na lista local de deals
      const newDealItem: Deal = {
        ...createdData,
        req_number: createdData.req_number || generatedReqNumber,
        creator_name: creatorName,
        latest_update_author: creatorName,
        customer_name: selectedDealForHistory.customer_name || "Uso Interno / Empresa",
        assigned_user_name: assignedName,
      };

      setDeals((prev) => [...prev, newDealItem]);

      // Insere o registro imutável no bloco de atualização
      appendAutoLog(subtaskText);

      // Limpa formulário da subtarefa e muda para a aba de Nova Atualização
      setSubtaskTitle("");
      setSubtaskAssignedTo("");
      setSubtaskDeadline("");
      setSubtaskNotes("");
      setIsSubtaskModalOpen(false);
      setModalUpdateTab("comment");

      toast.success(`Tarefa criada! O registro foi inserido no campo de Nova Atualização.`);
    } catch (err: any) {
      toast.error("Erro ao criar tarefa vinculada: " + (err.message || "Tente novamente"));
    } finally {
      setIsCreatingSubtask(false);
    }
  }

  // Upload e Otimização Automática do Arquivo de Orçamento Oficial
  async function handleUploadQuoteFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedDealForHistory) return;

    setIsUploadingQuoteFile(true);
    const toastId = toast.loading("Otimizando e comprimindo arquivo...");

    try {
      // 1. Compressão client-side (Imagens são convertidas para WebP 1500px máx e ~100KB)
      const { file: optimizedBlob, fileName } = await compressImageForUpload(file);
      const originalSizeKb = Math.round(file.size / 1024);
      const optimizedSizeKb = Math.round(optimizedBlob.size / 1024);

      toast.loading(`Salvando documento (${optimizedSizeKb} KB - reduzido de ${originalSizeKb} KB)...`, { id: toastId });

      // 2. Upload para o Supabase Storage
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `quotes/${selectedDealForHistory.id}/${Date.now()}_${sanitizedName}`;

      let publicUrl = "";
      try {
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("crm-attachments")
          .upload(path, optimizedBlob, {
            upsert: true,
            contentType: optimizedBlob.type || (fileName.endsWith(".pdf") ? "application/pdf" : "image/webp"),
          });

        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage.from("crm-attachments").getPublicUrl(path);
          publicUrl = urlData.publicUrl;
        } else if (uploadError?.message?.toLowerCase().includes("not found")) {
          await supabase.storage.createBucket("crm-attachments", { public: true });
          const { data: retryData, error: retryErr } = await supabase.storage
            .from("crm-attachments")
            .upload(path, optimizedBlob, { upsert: true, contentType: optimizedBlob.type });
          if (!retryErr && retryData) {
            const { data: urlData } = supabase.storage.from("crm-attachments").getPublicUrl(path);
            publicUrl = urlData.publicUrl;
          }
        }
      } catch (storageErr) {
        console.warn("Storage upload warning, falling back to data URL:", storageErr);
      }

      if (!publicUrl) {
        publicUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(optimizedBlob);
        });
      }

      const nowIso = new Date().toISOString();
      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";

      const quoteTag = `[QUOTE_FILE:${JSON.stringify({ url: publicUrl, name: fileName, uploadedAt: nowIso })}]`;
      const cleanNotes = (selectedDealForHistory.notes || "").replace(/\[QUOTE_FILE:.*?\]\s*/g, "").trim();
      const updatedNotesWithQuote = `${quoteTag}\n${cleanNotes}`.trim();

      try {
        await supabase
          .from("crm_deals")
          .update({
            quote_file_url: publicUrl,
            quote_file_name: fileName,
            quote_file_uploaded_at: nowIso,
            notes: updatedNotesWithQuote,
            updated_at: nowIso,
          })
          .eq("id", selectedDealForHistory.id);
      } catch {
        await supabase
          .from("crm_deals")
          .update({
            notes: updatedNotesWithQuote,
            updated_at: nowIso,
          })
          .eq("id", selectedDealForHistory.id);
      }

      const docMeta = JSON.stringify({ url: publicUrl, name: fileName, sizeKb: optimizedSizeKb, uploadedAt: nowIso });
      await registerHistoryEntry(
        selectedDealForHistory.id,
        "quote_file_uploaded",
        `[QUOTE_DOC:${docMeta}] ${userName} anexou o documento de orçamento oficial "${fileName}" (${optimizedSizeKb} KB).`
      );

      const updatedDeal: Deal = {
        ...selectedDealForHistory,
        quote_file_url: publicUrl,
        quote_file_name: fileName,
        quote_file_uploaded_at: nowIso,
        notes: updatedNotesWithQuote,
        updated_at: nowIso,
      };

      setSelectedDealForHistory(updatedDeal);
      setDeals((prev) => prev.map((d) => (d.id === updatedDeal.id ? updatedDeal : d)));
      setIsQuoteUploaderOpen(false);
      setPreviewingQuoteFile({ url: publicUrl, name: fileName });

      // Insere linha imutável no bloco de atualização do card expandido
      const quoteActionText = `${userName} anexou o orçamento "${fileName}" (${optimizedSizeKb} KB).`;
      appendAutoLog(quoteActionText);

      toast.success(`Orçamento anexado com sucesso! (${optimizedSizeKb} KB)`, { id: toastId });
    } catch (err: any) {
      toast.error("Erro ao anexar orçamento: " + (err.message || "Tente novamente"), { id: toastId });
    } finally {
      setIsUploadingQuoteFile(false);
      e.target.value = "";
    }
  }

  // Remover Arquivo de Orçamento Oficial
  async function handleRemoveQuoteFile() {
    if (!selectedDealForHistory) return;
    const confirmRemove = window.confirm("Deseja remover o arquivo de orçamento anexado?");
    if (!confirmRemove) return;

    try {
      const nowIso = new Date().toISOString();
      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
      const cleanNotes = (selectedDealForHistory.notes || "").replace(/\[QUOTE_FILE:.*?\]\s*/g, "").trim();

      try {
        await supabase
          .from("crm_deals")
          .update({
            quote_file_url: null,
            quote_file_name: null,
            quote_file_uploaded_at: null,
            notes: cleanNotes || null,
            updated_at: nowIso,
          })
          .eq("id", selectedDealForHistory.id);
      } catch {
        await supabase
          .from("crm_deals")
          .update({
            notes: cleanNotes || null,
            updated_at: nowIso,
          })
          .eq("id", selectedDealForHistory.id);
      }

      await registerHistoryEntry(
        selectedDealForHistory.id,
        "quote_file_removed",
        `${userName} removeu o documento de orçamento.`
      );

      const updatedDeal: Deal = {
        ...selectedDealForHistory,
        quote_file_url: null,
        quote_file_name: null,
        quote_file_uploaded_at: null,
        notes: cleanNotes || undefined,
        updated_at: nowIso,
      };

      setSelectedDealForHistory(updatedDeal);
      setDeals((prev) => prev.map((d) => (d.id === updatedDeal.id ? updatedDeal : d)));

      // Insere linha imutável no bloco de atualização do card expandido
      const removeQuoteText = `${userName} removeu o orçamento anexado.`;
      appendAutoLog(removeQuoteText);

      toast.success("Orçamento removido.");
    } catch (err: any) {
      toast.error("Erro ao remover: " + err.message);
    }
  }

  // Concluir Tarefa Vinculada (Fecha e armazena como concluída, gera linhas automáticas na tarefa e na atividade mãe)
  async function handleCompleteSubtask(deal: Deal) {
    if (!newComment.trim()) {
      toast.error("É obrigatório preencher o campo de atualização com o andamento/conclusão da tarefa.");
      return;
    }

    const reqNum = getDealReqNumber(deal, deals);
    const cleanTitle = getCleanDealTitle(deal.title);

    const confirmComplete = window.confirm(
      `Deseja concluir a Tarefa Vinculada Nº ${reqNum} ("${cleanTitle}")?\n\nEla será fechada e armazenada como concluída, e a atividade vinculada principal receberá a notificação de conclusão.`
    );
    if (!confirmComplete) return;

    try {
      const nowIso = new Date().toISOString();
      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
      const completionText = newComment.trim();

      // 1. Linha automática imutável da conclusão na tarefa
      const autoLogLine = `${userName} concluiu a tarefa vinculada "${cleanTitle}".`;
      const combinedNotesText = [...autoGeneratedLogs, autoLogLine, completionText].filter(Boolean).join("\n\n");

      const { error } = await supabase
        .from("crm_deals")
        .update({
          stage: "archived",
          notes: combinedNotesText,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      await registerHistoryEntry(
        deal.id,
        "subtask_completed",
        `Tarefa vinculada concluída por ${userName}. Atualização: "${completionText}"`
      );

      // 2. Notifica a atividade principal vinculada e insere a linha imutável de conclusão nela também
      const parentInfo = getParentDealInfo(deal);
      const parentDeal = parentInfo?.deal || deals.find((d) => d.id === parentInfo?.id || getDealReqNumber(d, deals) === parentInfo?.reqNumber);

      if (parentDeal) {
        const parentAutoLog = `${userName} concluiu a tarefa vinculada "${cleanTitle}" (Nº ${reqNum}).`;
        const updatedParentNotes = parentDeal.notes ? `${parentDeal.notes}\n\n${parentAutoLog}` : parentAutoLog;

        await supabase
          .from("crm_deals")
          .update({
            notes: updatedParentNotes,
            updated_at: nowIso,
          })
          .eq("id", parentDeal.id);

        await registerHistoryEntry(
          parentDeal.id,
          "subtask_completed",
          `${parentAutoLog} Descrição: "${completionText}"`
        );

        // Atualiza o estado da atividade pai na lista local
        setDeals((prev) =>
          prev.map((d) =>
            d.id === parentDeal.id
              ? {
                  ...d,
                  notes: updatedParentNotes,
                  latest_update_author: userName,
                  updated_at: nowIso,
                }
              : d
          )
        );

        // Ativa o alerta no card da atividade mãe
        const currentAlerts = { ...unreadParentAlerts, [parentDeal.id]: true };
        saveParentAlerts(currentAlerts);
      }

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, stage: "archived", notes: combinedNotesText, latest_update_author: userName, updated_at: nowIso }
            : d
        )
      );

      setNewComment("");
      setAutoGeneratedLogs([]);
      setSelectedDealForHistory(null);
      toast.success(`Tarefa Vinculada Nº ${reqNum} concluída com sucesso!`);
    } catch (err: any) {
      toast.error(`Erro ao concluir tarefa: ${err.message || "Erro desconhecido"}`);
    }
  }

  // Arquivar Tarefa (Armazena os cards em categoria de arquivo sem excluir)
  async function handleArchiveDeal(deal: Deal) {
    if (!newComment.trim()) {
      toast.error("Preencha o campo Nova Atualização antes de arquivar a atividade.");
      return;
    }

    const reqNum = getDealReqNumber(deal, deals);
    const cleanTitle = deal.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "");

    const confirmArchive = window.confirm(
      `Deseja arquivar a Tarefa Nº ${reqNum} ("${cleanTitle}")?\n\nEla sairá do quadro ativo e ficará armazenada na gaveta de "Arquivadas" com todo o seu histórico preservado.`
    );
    if (!confirmArchive) return;

    try {
      const nowIso = new Date().toISOString();
      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
      const finalNotes = newComment.trim();

      const { error } = await supabase
        .from("crm_deals")
        .update({
          stage: "archived",
          notes: finalNotes,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      await registerHistoryEntry(
        deal.id,
        "archived",
        `Tarefa arquivada por ${userName}. Atualização final: "${finalNotes}"`
      );

      // Notifica a atividade mãe se esta for uma subtarefa vinculada
      await notifyParentDealIfSubtask(deal, finalNotes);

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, stage: "archived", notes: finalNotes, latest_update_author: userName, updated_at: nowIso }
            : d
        )
      );

      setNewComment("");
      setReassignTo("");
      setSelectedDealForHistory(null);
      toast.success(`Tarefa Nº ${reqNum} arquivada com sucesso!`);
    } catch (err: any) {
      toast.error(`Erro ao arquivar tarefa: ${err.message || "Erro desconhecido"}`);
    }
  }

  // Desarquivar / Restaurar Tarefa ao Quadro Ativo
  async function handleUnarchiveDeal(deal: Deal) {
    const reqNum = getDealReqNumber(deal, deals);
    try {
      const nowIso = new Date().toISOString();
      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";

      const { error } = await supabase
        .from("crm_deals")
        .update({ stage: "lead", updated_at: nowIso })
        .eq("id", deal.id);

      if (error) throw error;

      await registerHistoryEntry(
        deal.id,
        "unarchived",
        `Tarefa desarquivada e restaurada ao quadro ativo por ${userName}.`
      );

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, stage: "lead", updated_at: nowIso }
            : d
        )
      );

      setSelectedDealForHistory(null);
      toast.success(`Requisição Nº ${reqNum} restaurada ao quadro com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao desarquivar requisição: " + (err.message || "Tente novamente"));
    }
  }

  // Cadastrar Novo Cliente no Modal Exclusivo
  async function handleSaveNewCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!inlineCompanyName.trim()) return toast.error("Informe o Nome da Empresa / Razão Social");

    const cleanDoc = inlineCustomerDoc.replace(/\D/g, "");
    if (!cleanDoc) return toast.error("Informe o CNPJ da empresa");
    if (cleanDoc.length !== 14) {
      return toast.error("O CNPJ deve ser preenchido por completo no formato 00.000.000/0000-00 (14 dígitos)");
    }

    if (!inlineContactName.trim()) return toast.error("Informe o Contato Principal");
    if (!inlineCustomerEmail.trim()) return toast.error("Informe o E-mail de Contato");

    const cleanPhone = inlineCustomerPhone.replace(/\D/g, "");
    if (!cleanPhone) return toast.error("Informe o Telefone / WhatsApp");
    if (cleanPhone.length !== 11) {
      return toast.error("O Telefone deve ser preenchido por completo no formato (XX) X XXXX-XXXX (11 dígitos)");
    }

    setIsSavingCustomer(true);
    try {
      const { data: newCust, error: newCustErr } = await supabase
        .from("crm_customers")
        .insert({
          company_name: inlineCompanyName.trim(),
          document: inlineCustomerDoc.trim(),
          name: inlineContactName.trim(),
          email: inlineCustomerEmail.trim(),
          phone: inlineCustomerPhone.trim(),
          user_id: user?.id,
        })
        .select()
        .single();

      if (newCustErr) throw newCustErr;

      setCustomers((prev) => [...prev, newCust]);
      setNewDealCustomerId(newCust.id);
      setIsNewCustomerModalOpen(false);
      setInlineCompanyName("");
      setInlineCustomerDoc("");
      setInlineContactName("");
      setInlineCustomerEmail("");
      setInlineCustomerPhone("");
      toast.success(`Cliente "${newCust.company_name || newCust.name}" cadastrado e selecionado!`);
    } catch (err: any) {
      toast.error("Erro ao cadastrar cliente: " + (err.message || "Tente novamente"));
    } finally {
      setIsSavingCustomer(false);
    }
  }

  // Criar Requisição
  async function handleCreateDeal(e: React.FormEvent) {
    e.preventDefault();

    let targetCustomerId = newDealCustomerId;

    if (activeReqModal === "externa") {
      if (!targetCustomerId) return toast.error("Selecione ou cadastre um cliente");
    } else {
      targetCustomerId = null;
      if (!newDealDeadline) {
        return toast.error("Informe o prazo de execução da tarefa interna");
      }
    }

    if (!newDealTitle.trim()) return toast.error("Informe o título da requisição");
    if (!newDealAssignedTo) return toast.error("O direcionamento ao responsável é obrigatório");
    if (!newDealNotes.trim()) return toast.error("As instruções da atividade são obrigatórias");

    const typePrefix =
      activeReqModal === "interna"
        ? "[TAREFA]"
        : "[ORÇAMENTO]";

    const fullTitle = `${typePrefix} ${newDealTitle.trim().toUpperCase()}`;

    // Apenas Tarefa nasce na coluna 'lead' (Tarefas). Orçamentos nascem em 'qualification' (Orçamentos).
    const initialStage = activeReqModal === "interna" ? "lead" : "qualification";

    const assignedProf = teamMembers.find((m) => m.id === newDealAssignedTo);
    const assignedName = assignedProf?.display_name || assignedProf?.email || "Responsável";

    try {
      const generatedReqNumber = generateNextReqNumber(deals);

      const { data: createdData, error } = await supabase
        .from("crm_deals")
        .insert({
          title: fullTitle,
          stage: initialStage,
          customer_id: targetCustomerId,
          user_id: user?.id,
          assigned_user_id: newDealAssignedTo,
          expected_close_date: newDealDeadline ? newDealDeadline : null,
          notes: newDealNotes.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Cria o primeiro registro no Histórico / Linha do Tempo
      try {
        await supabase.from("crm_deal_history").insert({
          deal_id: createdData.id,
          user_id: user?.id,
          user_name: user?.user_metadata?.display_name || user?.email || "Usuário",
          description: `Atividade criada e direcionada para ${assignedName}. Instruções: ${newDealNotes.trim()}`,
        });
      } catch (hErr) {
        console.warn("Aviso ao registrar histórico inicial:", hErr);
      }

      toast.success(
        activeReqModal === "interna"
          ? `Tarefa Nº ${generatedReqNumber} criada com sucesso para ${newDealDeadline.split("-").reverse().join("/")}!`
          : `Orçamento Nº ${generatedReqNumber} criado e direcionado com sucesso!`
      );

      const resolvedCust = customers.find((c) => c.id === targetCustomerId);
      const customerDisplayName =
        activeReqModal === "interna"
          ? "Uso Interno / Empresa"
          : resolvedCust?.company_name ||
            resolvedCust?.name ||
            inlineCompanyName ||
            inlineContactName ||
            "Cliente não informado";

      // Adiciona a nova atividade no final da ordem da coluna (na base da coluna)
      setStageCustomOrders((prevOrders) => {
        const currentStageOrder = prevOrders[initialStage] || [];
        const updatedOrder = [...currentStageOrder.filter((id) => id !== createdData.id), createdData.id];
        const nextOrders = {
          ...prevOrders,
          [initialStage]: updatedOrder,
        };
        try {
          localStorage.setItem("mykaflow_crm_stage_order", JSON.stringify(nextOrders));
        } catch (e) {
          console.error("Erro ao salvar ordem ao criar atividade:", e);
        }
        return nextOrders;
      });

      setDeals((prev) => [
        ...prev,
        {
          ...createdData,
          req_number: createdData.req_number || generatedReqNumber,
          creator_name: user?.user_metadata?.display_name || user?.email || "Você",
          latest_update_author: user?.user_metadata?.display_name || user?.email || "Você",
          customer_name: customerDisplayName,
          assigned_user_name: assignedName,
        },
      ]);

      setActiveReqModal(null);
    } catch (err: any) {
      toast.error("Erro ao criar requisição: " + (err.message || "Tente novamente"));
    }
  }

  function handleMoveStage(deal: Deal, newStage: Deal["stage"]) {
    if (deal.stage === newStage) return;

    const isStandaloneInternal =
      (deal.title.includes("[REQ. INTERNA]") || deal.stage === "lead") &&
      !deal.title.includes("[TAREFA]") &&
      !deal.notes?.includes("[PARENT_DEAL:");

    // 1. Tarefa interna avulsa nunca pode ser movida para etapas de orçamentos
    if (isStandaloneInternal && newStage !== "lead") {
      return toast.error("Uma tarefa interna avulsa não pode ser movida para as colunas de orçamentos.");
    }

    // 2. Orçamento nunca pode ser movido para a coluna de Tarefas
    if (!isStandaloneInternal && !deal.title.includes("[TAREFA]") && newStage === "lead") {
      return toast.error("Um orçamento não pode ser movido para a coluna de Tarefas.");
    }

    const currentStageId = deal.stage === "proposal" ? "negotiation" : deal.stage;
    const currentIndex = STAGES.findIndex((s) => s.id === currentStageId);
    const targetIndex = STAGES.findIndex((s) => s.id === newStage);

    // Regra 1: Não é permitido retroceder de coluna/etapa
    if (currentIndex !== -1 && targetIndex < currentIndex) {
      return toast.error("Uma atividade não pode retroceder de coluna.");
    }

    // Regra 2: Um orçamento ou atividade não pode pular etapas (não pode passar direto para contratos ou perdidos sem ter passado por negociações)
    if (currentIndex !== -1 && targetIndex > currentIndex + 1) {
      const nextAllowedTitle = STAGES[currentIndex + 1]?.title || "próxima etapa";
      return toast.error(
        `Não é permitido pular etapas. A atividade deve avançar para "${nextAllowedTitle}" antes de prosseguir.`
      );
    }

    // Regra 3: Tarefa/Orçamento só pode avançar para a etapa NEGOCIAÇÕES se o orçamento oficial estiver anexado
    if (newStage === "negotiation") {
      const parentInfo = getParentDealInfo(deal);
      const parentDeal = parentInfo?.deal || deals.find((d) => d.id === parentInfo?.id);
      const hasQuoteAttached = Boolean(
        getDealQuoteFile(deal, dealHistoryList) ||
        (parentDeal && getDealQuoteFile(parentDeal))
      );

      if (!hasQuoteAttached) {
        return toast.error(
          "Não é possível mover para a etapa NEGOCIAÇÕES sem o orçamento anexado na atividade. Anexe o orçamento antes de prosseguir."
        );
      }
    }

    // Fecha qualquer modal de histórico aberto antes de abrir o modal de movimentação
    setSelectedDealForHistory(null);

    setMovingDealState({
      deal,
      targetStage: newStage,
      updateText: "",
      updatedNotes: deal.notes || "",
      reassignTo: deal.assigned_user_id || "",
    });
  }

  function handleReorderDealWithinStage(
    stageId: Deal["stage"],
    sourceDealId: string,
    targetDealId: string,
    position: "before" | "after"
  ) {
    if (sourceDealId === targetDealId) return;

    setStageCustomOrders((prev) => {
      const currentStageDeals = visibleDeals.filter((d) => d.stage === stageId);
      const existingOrder = prev[stageId] || [];

      // Ordenar conforme ordem salva atual
      const sorted = [...currentStageDeals].sort((a, b) => {
        const indexA = existingOrder.indexOf(a.id);
        const indexB = existingOrder.indexOf(b.id);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return (
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
        );
      });

      const dealIds = sorted.map((d) => d.id);
      const sourceIdx = dealIds.indexOf(sourceDealId);
      if (sourceIdx !== -1) {
        dealIds.splice(sourceIdx, 1);
      }

      const targetIdx = dealIds.indexOf(targetDealId);
      if (targetIdx === -1) {
        dealIds.push(sourceDealId);
      } else {
        const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
        dealIds.splice(insertIdx, 0, sourceDealId);
      }

      const updated = {
        ...prev,
        [stageId]: dealIds,
      };

      try {
        localStorage.setItem("mykaflow_crm_stage_order", JSON.stringify(updated));
      } catch (e) {
        console.error("Erro ao salvar ordem de prioridades:", e);
      }

      return updated;
    });

    toast.success("Prioridade atualizada!", { duration: 1500 });
  }

  async function handleConfirmMoveStage(e: React.FormEvent) {
    e.preventDefault();
    if (!movingDealState) return;

    const { deal, targetStage, updateText, updatedNotes, reassignTo } = movingDealState;

    if (!updateText.trim()) {
      return toast.error("É obrigatório descrever a atualização das informações para mover a requisição.");
    }

    if (targetStage === "negotiation") {
      const parentInfo = getParentDealInfo(deal);
      const parentDeal = parentInfo?.deal || deals.find((d) => d.id === parentInfo?.id);
      const hasQuoteAttached = Boolean(
        getDealQuoteFile(deal, dealHistoryList) ||
        (parentDeal && getDealQuoteFile(parentDeal))
      );

      if (!hasQuoteAttached) {
        return toast.error(
          "Não é possível mover para a etapa NEGOCIAÇÕES sem o orçamento oficial anexado na atividade. Anexe o orçamento antes de prosseguir."
        );
      }
    }

    setIsSavingMove(true);
    try {
      const nowIso = new Date().toISOString();
      const currentAssigned = teamMembers.find((m) => m.id === deal.assigned_user_id)?.display_name || "Anterior";
      const newAssignedMember = teamMembers.find((m) => m.id === reassignTo);
      const newAssignedName = newAssignedMember?.display_name || newAssignedMember?.email || deal.assigned_user_name || "Novo Responsável";
      const isReassigned = Boolean(reassignTo && reassignTo !== deal.assigned_user_id);
      const isReturnedToCreator = Boolean(
        isReassigned && deal.user_id && reassignTo === deal.user_id && deal.assigned_user_id !== deal.user_id
      );

      const oldStageTitle = STAGES.find((s) => s.id === deal.stage)?.title || deal.stage;
      const newStageTitle = STAGES.find((s) => s.id === targetStage)?.title || targetStage;
      const targetAssignedUserId = isReassigned ? (reassignTo || null) : (deal.assigned_user_id || null);

      // Preserva tags de arquivos anexados e atividades vinculadas
      const existingQuoteTag = deal.notes?.match(/\[QUOTE_FILE:.*?\]/)?.[0] || (deal.quote_file_url ? `[QUOTE_FILE:${JSON.stringify({ url: deal.quote_file_url, name: deal.quote_file_name || "orcamento_oficial", uploadedAt: deal.quote_file_uploaded_at || nowIso })}]` : "");
      const existingParentTag = deal.notes?.match(/\[PARENT_DEAL:.*?\]/)?.[0] || "";
      const cleanUpdate = updateText.trim();
      const metaTags = [existingQuoteTag, existingParentTag].filter(Boolean).join("\n");
      const latestActivityNotes = metaTags ? `${metaTags}\n${cleanUpdate}`.trim() : cleanUpdate;

      const { error } = await supabase
        .from("crm_deals")
        .update({
          stage: targetStage,
          notes: latestActivityNotes,
          assigned_user_id: targetAssignedUserId,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      let desc = `Mudança de etapa: "${oldStageTitle}" ➔ "${newStageTitle}". Atualização: "${updateText.trim()}"`;
      if (isReturnedToCreator) {
        desc += ` (Devolvido ao criador ${newAssignedName})`;
      } else if (isReassigned) {
        desc += ` (Encaminhado para ${newAssignedName})`;
      }

      await registerHistoryEntry(
        deal.id,
        "status_changed",
        desc,
        oldStageTitle,
        newStageTitle
      );

      if (targetStage === "won") {
        await notifyParentDealIfSubtask(deal, updateText);
      }

      // Se a atividade movida possuir tarefas vinculadas, atualiza também a etapa das tarefas vinculadas para acompanharem a atividade mãe na mesma coluna
      const linkedSubtaskIds = new Set<string>();
      deals.forEach((d) => {
        const pInfo = getParentDealInfo(d);
        if (pInfo?.id === deal.id || (pInfo?.reqNumber && pInfo.reqNumber === getDealReqNumber(deal, deals))) {
          linkedSubtaskIds.add(d.id);
        }
      });

      if (linkedSubtaskIds.size > 0) {
        for (const subId of Array.from(linkedSubtaskIds)) {
          try {
            await supabase
              .from("crm_deals")
              .update({ stage: targetStage, updated_at: nowIso })
              .eq("id", subId);
          } catch (subErr) {
            console.warn("Aviso ao mover subtarefa vinculada com a mãe:", subErr);
          }
        }
      }

      setDeals((prev) =>
        prev.map((d) => {
          if (d.id === deal.id) {
            return {
              ...d,
              stage: targetStage,
              notes: latestActivityNotes || d.notes,
              assigned_user_id: targetAssignedUserId,
              assigned_user_name: isReassigned ? newAssignedName : d.assigned_user_name,
              updated_at: nowIso,
            };
          }
          if (linkedSubtaskIds.has(d.id)) {
            return {
              ...d,
              stage: targetStage,
              updated_at: nowIso,
            };
          }
          return d;
        })
      );

      // Adiciona a atividade movida na base da nova etapa
      setStageCustomOrders((prevOrders) => {
        const currentStageOrder = prevOrders[targetStage] || [];
        const updatedOrder = [...currentStageOrder.filter((id) => id !== deal.id), deal.id];
        const nextOrders = {
          ...prevOrders,
          [targetStage]: updatedOrder,
          [deal.stage]: (prevOrders[deal.stage] || []).filter((id) => id !== deal.id),
        };
        try {
          localStorage.setItem("mykaflow_crm_stage_order", JSON.stringify(nextOrders));
        } catch (e) {
          console.error("Erro ao salvar ordem ao mover de etapa:", e);
        }
        return nextOrders;
      });

      setMovingDealState(null);
      toast.success(`Requisição atualizada e movida para "${newStageTitle}"!`);
    } catch (err: any) {
      toast.error("Erro ao salvar atualização e mover etapa: " + (err.message || "Tente novamente"));
    } finally {
      setIsSavingMove(false);
    }
  }

  async function handleAddHistoryOrReassign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDealForHistory) return;

    if (role !== "admin" && selectedDealForHistory.assigned_user_id !== user?.id) {
      return toast.error("Esta tarefa está com outro responsável e não pode ser editada por você no momento");
    }

    if (!newComment.trim()) {
      return toast.error("É obrigatório preencher o campo de atualização com o andamento da atividade.");
    }

    setIsSavingUpdate(true);
    const deal = selectedDealForHistory;
    const nowIso = new Date().toISOString();
    const currentAssigned = teamMembers.find((m) => m.id === deal.assigned_user_id)?.display_name || "Anterior";
    const newAssignedMember = teamMembers.find((m) => m.id === reassignTo);
    const newAssignedName = newAssignedMember?.display_name || newAssignedMember?.email || "Novo Responsável";

    try {
      const isReassigned = Boolean(reassignTo && reassignTo !== deal.assigned_user_id);
      const isReturnedToCreator = Boolean(
        isReassigned && deal.user_id && reassignTo === deal.user_id && deal.assigned_user_id !== deal.user_id
      );

      const targetStage = stageToMove || deal.stage;
      const isStageChanged = Boolean(stageToMove && stageToMove !== deal.stage);

      const combinedNotesText = [...autoGeneratedLogs, newComment.trim()].filter(Boolean).join("\n\n");

      const updatePayload: any = { updated_at: nowIso };
      if (isStageChanged) updatePayload.stage = targetStage;
      if (isReassigned) updatePayload.assigned_user_id = reassignTo;
      if (combinedNotesText) {
        const existingQuoteTag = deal.notes?.match(/\[QUOTE_FILE:.*?\]/)?.[0] || (deal.quote_file_url ? `[QUOTE_FILE:${JSON.stringify({ url: deal.quote_file_url, name: deal.quote_file_name || "orcamento_oficial", uploadedAt: deal.quote_file_uploaded_at || nowIso })}]` : "");
        const existingParentTag = deal.notes?.match(/\[PARENT_DEAL:.*?\]/)?.[0] || "";
        const metaTags = [existingQuoteTag, existingParentTag].filter(Boolean).join("\n");
        updatePayload.notes = metaTags ? `${metaTags}\n${combinedNotesText}`.trim() : combinedNotesText;
      }

      await supabase
        .from("crm_deals")
        .update(updatePayload)
        .eq("id", deal.id);

      let desc = "";
      if (isReturnedToCreator) {
        desc = `🔄 ALERTA ADM: Atividade devolvida ao criador original (${newAssignedName}) por ${currentAssigned}.${
          combinedNotesText ? ` Motivo: "${combinedNotesText}"` : ""
        }`;
      } else if (isReassigned && combinedNotesText) {
        desc = `Encaminhado de ${currentAssigned} para ${newAssignedName}. Motivo/Instrução: "${combinedNotesText}"`;
      } else if (isReassigned) {
        desc = `Encaminhado de ${currentAssigned} para ${newAssignedName}.`;
      } else {
        desc = `Atualização de andamento: "${combinedNotesText}"`;
      }

      const actionType = isReturnedToCreator
        ? "returned_to_creator"
        : isStageChanged
        ? "stage_change"
        : isReassigned
        ? "reassigned"
        : "comment";

      await registerHistoryEntry(
        deal.id,
        actionType,
        desc,
        currentAssigned,
        newAssignedName
      );

      const newHistoryItem: DealHistoryItem = {
        id: crypto.randomUUID(),
        deal_id: deal.id,
        user_name: user?.user_metadata?.display_name || user?.email || "Você",
        action_type: actionType,
        description: desc,
        created_at: nowIso,
      };

      if (isReturnedToCreator) {
        setReturnedHistoryList((prev) => [newHistoryItem, ...prev]);
      }

      const currentUserName = user?.user_metadata?.display_name || user?.email || "Você";
      setDealHistoryList((prev) => [newHistoryItem, ...prev]);
      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? {
                ...d,
                stage: targetStage,
                notes: combinedNotesText ? combinedNotesText : d.notes,
                latest_update_author: combinedNotesText ? currentUserName : (d.latest_update_author || currentUserName),
                assigned_user_id: isReassigned ? reassignTo : d.assigned_user_id,
                assigned_user_name: isReassigned ? newAssignedName : d.assigned_user_name,
                updated_at: nowIso,
              }
            : d
        )
      );

      setSelectedDealForHistory(null);
      setNewComment("");
      setAutoGeneratedLogs([]);
      setStageToMove(null);
      toast.success(
        isReturnedToCreator
          ? `Atividade devolvida ao criador (${newAssignedName})! Alerta gerado para ADM.`
          : isReassigned
            ? `Atividade encaminhada para ${newAssignedName} com sucesso!`
            : "Atualização salva com sucesso!"
      );
    } catch (err: any) {
      toast.error("Erro ao registrar atualização: " + err.message);
    } finally {
      setIsSavingUpdate(false);
    }
  }

  async function handleConfirmWonContract() {
    if (!contractModalDeal) return;
    setIsSyncing(true);

    try {
      const deal = contractModalDeal;
      const totalVal = Number(deal.value) || 0;
      const installmentsCount = Math.max(1, contractInstallments);
      const installmentVal = totalVal / installmentsCount;
      const nowIso = new Date().toISOString();

      await supabase.from("crm_deals").update({ stage: "won", updated_at: nowIso }).eq("id", deal.id);

      await registerHistoryEntry(
        deal.id,
        "status_changed",
        `Requisição fechada/ganha com sucesso por ${user?.user_metadata?.display_name || user?.email}. Contrato integrado no Fluxo de Caixa.`
      );

      const { data: contract } = await supabase
        .from("crm_contracts")
        .insert({
          deal_id: deal.id,
          customer_id: deal.customer_id,
          total_value: totalVal,
          start_date: contractStartDate,
          installments_count: installmentsCount,
          billing_type: installmentsCount > 1 ? "installments" : "single",
          status: "active",
          user_id: user?.id,
        })
        .select()
        .single();

      const startDateObj = new Date(contractStartDate);
      for (let i = 0; i < installmentsCount; i++) {
        const dueDate = new Date(startDateObj);
        dueDate.setMonth(dueDate.getMonth() + i);
        const dateStr = dueDate.toISOString().split("T")[0];

        const desc =
          installmentsCount > 1
            ? `Receita Contrato: ${deal.title} (${deal.customer_name}) [Parcela ${i + 1}/${installmentsCount}]`
            : `Receita Contrato: ${deal.title} (${deal.customer_name})`;

        const { data: txData, error: txErr } = await supabase
          .from("transactions")
          .insert({
            user_id: user?.id,
            type: "income",
            nature: "variable",
            category: "Contratos / Vendas CRM",
            description: desc,
            amount: Number(installmentVal.toFixed(2)),
            occurred_on: dateStr,
          })
          .select()
          .single();

        if (!txErr && contract && txData) {
          await supabase.from("crm_contract_installments").insert({
            contract_id: contract.id,
            installment_number: i + 1,
            amount: installmentVal,
            due_date: dateStr,
            transaction_id: txData.id,
            status: "pending",
          });
        }
      }

      const oldStageTitle = STAGES.find((s) => s.id === deal.stage)?.title || deal.stage;
      await registerHistoryEntry(
        deal.id,
        "status_changed",
        `🎉 Contrato Fechado! Movido de "${oldStageTitle}" para "CONTRATOS" por ${user?.user_metadata?.display_name || user?.email}.`,
        oldStageTitle,
        "CONTRATOS"
      );

      toast.success(
        `🎉 Contrato Fechado! Lançado ${installmentsCount}x de ${fmtCurrency(installmentVal)} no Fluxo de Caixa.`
      );
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage: "won", updated_at: nowIso } : d)));
      setContractModalDeal(null);
    } catch (err: any) {
      toast.error("Erro na integração: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  }

  // Filtro de Visibilidade por Permissão:
  // - Administrador: visualiza todas as atividades de todos os usuários
  // - Usuário comum: visualiza estritamente as suas próprias atividades (como responsável ou criador)
  const visibleDeals = useMemo(() => {
    if (role === "admin") {
      return deals;
    }
    return deals.filter(
      (d) => d.assigned_user_id === user?.id || (d as any).user_id === user?.id
    );
  }, [deals, role, user?.id]);

  // Alertas automáticos para Administradores (apenas requisições internas ativas possuem prazo)
  const overdueAlerts = useMemo(() => {
    return deals.filter(
      (d) =>
        (d.title.includes("[REQ. INTERNA]") || d.stage === "lead") &&
        d.expected_close_date &&
        d.stage !== "won" &&
        d.stage !== "lost" &&
        d.stage !== "archived" &&
        getDeadlineInfo(d.expected_close_date).diffDays !== undefined &&
        getDeadlineInfo(d.expected_close_date).diffDays! < 0
    );
  }, [deals]);

  const returnedAlerts = useMemo(() => {
    const returnedDealIds = new Set(returnedHistoryList.map((h) => h.deal_id));
    return deals.filter(
      (d) =>
        (returnedDealIds.has(d.id) ||
          (d.user_id && d.assigned_user_id === d.user_id && d.notes?.includes("[DEVOLVIDA]"))) &&
        d.stage !== "won" &&
        d.stage !== "lost" &&
        d.stage !== "archived"
    );
  }, [deals, returnedHistoryList]);

  const totalAdminAlerts = overdueAlerts.length + returnedAlerts.length;

  const totalArchivedCount = useMemo(() => {
    return visibleDeals.filter((d) => d.stage === "archived").length;
  }, [visibleDeals]);

  const archivedDealsList = useMemo(() => {
    return visibleDeals.filter(
      (d) =>
        d.stage === "archived" &&
        (!archivedSearchTerm.trim() ||
          d.title.toLowerCase().includes(archivedSearchTerm.toLowerCase()) ||
          getDealReqNumber(d, deals).toLowerCase().includes(archivedSearchTerm.toLowerCase()) ||
          (d.notes && d.notes.toLowerCase().includes(archivedSearchTerm.toLowerCase())))
    );
  }, [visibleDeals, archivedSearchTerm, deals]);

  const pipelineMetrics = useMemo(() => {
    const totalDeals = visibleDeals.filter((d) => d.stage !== "archived").length;
    const wonDeals = visibleDeals.filter((d) => d.stage === "won");
    const activeReqs = visibleDeals.filter(
      (d) => d.stage !== "won" && d.stage !== "lost" && d.stage !== "archived"
    );
    const internalReqs = visibleDeals.filter(
      (d) =>
        (d.stage === "lead" || d.title.toUpperCase().includes("[REQ. INTERNA]")) &&
        d.stage !== "archived"
    );
    const externalReqs = visibleDeals.filter(
      (d) =>
        d.stage !== "lead" &&
        !d.title.toUpperCase().includes("[REQ. INTERNA]") &&
        d.stage !== "archived"
    );

    return {
      totalDeals,
      wonDeals: wonDeals.length,
      activeReqs: activeReqs.length,
      internalCount: internalReqs.length,
      externalCount: externalReqs.length,
    };
  }, [visibleDeals]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent glow" />
          <p className="font-mono text-sm tracking-widest text-muted-foreground uppercase animate-pulse">
            Carregando CRM...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        onClick={() => {
          if (isolatedStageId) setIsolatedStageId(null);
          if (internalFilterUser !== "ALL") setInternalFilterUser("ALL");
        }}
        className="relative z-10 h-screen max-h-screen flex flex-col overflow-hidden px-4 pt-3 pb-3 md:px-6"
      >
      {/* BACKDROP FLUTUANTE COM DESFOQUE SUAVE DO RESTANTE DA PÁGINA (SEM EMPURRAR COMPONENTES) */}
      {isSideMenuOpen && (
        <div
          onClick={() => setIsSideMenuOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
        />
      )}

      {/* MENU LATERAL ESQUERDO FLUTUANTE (OFF-CANVAS) */}
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-950/95 border-r border-white/15 flex flex-col justify-between p-4 backdrop-blur-2xl shadow-2xl transition-transform duration-300 ease-in-out ${
          isSideMenuOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
      >
        {/* Topo do Menu */}
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
            <svg
              className="w-[125px] h-[30px] overflow-visible select-none"
              viewBox="0 0 125 30"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <text
                x="0"
                y="14"
                className="font-saira-stencil"
                fontSize="15"
                fill="#22d3ee"
                textLength="125"
                lengthAdjust="spacing"
              >
                MYKAFLOW
              </text>
              <text
                x="0"
                y="27"
                fontSize="8.5"
                fontWeight="600"
                fill="#94a3b8"
                fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                textLength="125"
                lengthAdjust="spacing"
              >
                CRM & ATIVIDADES
              </text>
            </svg>
          </div>

          {/* Seção 1: Nova Atividade */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 px-1">
              Nova Atividade
            </p>
            
            <button
              type="button"
              onClick={() => {
                setIsSideMenuOpen(false);
                openNewRequestModal("interna");
              }}
              className="w-full btn-ghost-neon rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2.5 text-muted-foreground hover:text-white border-white/10 hover:border-white/20 hover:bg-white/5 shadow-sm transition-all text-left group"
            >
              <Building className="h-4 w-4 text-muted-foreground group-hover:text-white shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate">Tarefa</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSideMenuOpen(false);
                openNewRequestModal("externa");
              }}
              className="w-full btn-ghost-neon rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2.5 text-muted-foreground hover:text-white border-white/10 hover:border-white/20 hover:bg-white/5 shadow-sm transition-all text-left group"
            >
              <Globe className="h-4 w-4 text-muted-foreground group-hover:text-white shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate">Orçamento</span>
            </button>
          </div>

          {/* Separador */}
          <div className="border-t border-white/10 pt-2" />

          {/* Seção 2: Repositório */}
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 px-1">
              Repositório
            </p>

            <button
              type="button"
              onClick={() => {
                setIsSideMenuOpen(false);
                setIsArchivedModalOpen(true);
              }}
              className="w-full btn-ghost-neon rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-between gap-2 text-muted-foreground hover:text-white border-white/10 hover:border-white/20 hover:bg-white/5 shadow-sm transition-all text-left group"
              title="Visualizar repositório de atividades arquivadas"
            >
              <div className="flex items-center gap-2.5 truncate">
                <FolderArchive className="h-4 w-4 text-muted-foreground group-hover:text-white shrink-0" />
                <span className="truncate">Arquivadas</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-white font-mono text-[10px] font-bold border border-white/15 shrink-0">
                {totalArchivedCount}
              </span>
            </button>
          </div>
        </div>

        {/* Rodapé do Menu Lateral: Sair (ADM vai para o menu de plataformas; Usuário Comum faz logout) */}
        <div className="border-t border-white/10 pt-3 mt-4 space-y-2">
          <button
            type="button"
            onClick={handleExit}
            className="w-full btn-ghost-neon rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2.5 text-muted-foreground hover:text-rose-400 border-white/10 hover:border-rose-500/30 hover:bg-rose-500/10 shadow-sm transition-all text-left group"
            title={role === "admin" ? "Voltar ao Seletor de Módulos" : "Sair do Sistema"}
          >
            <LogOut className="h-4 w-4 text-muted-foreground group-hover:text-rose-400 shrink-0" />
            <span className="truncate">Sair</span>
          </button>
        </div>
      </aside>

      {/* Header com botão do Menu Lateral */}
      <header className="shrink-0 mb-1 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between pb-0">
        <div className="flex items-center gap-3 lg:w-1/3 lg:justify-start">
          <button
            type="button"
            onClick={() => setIsSideMenuOpen(true)}
            className="btn-ghost-neon p-2 rounded-xl flex items-center justify-center text-accent hover:text-white border border-accent/30 hover:border-accent/60 bg-accent/10 shadow-sm transition-all hover:scale-105 cursor-pointer"
            title="Abrir Menu de Ações"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex flex-col select-none justify-center">
            <svg
              className="w-[280px] sm:w-[305px] h-[36px] overflow-visible select-none"
              viewBox="0 0 305 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <text
                x="0"
                y="21"
                className="font-saira-stencil"
                fontSize="24"
                fill="#22d3ee"
                textLength="305"
                lengthAdjust="spacing"
              >
                CRM & ATIVIDADES
              </text>
              <text
                x="0"
                y="33"
                fontSize="9"
                fontWeight="500"
                fill="#94a3b8"
                fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                textLength="305"
                lengthAdjust="spacing"
              >
                MYKAFLOW GESTÃO FINANCEIRA, COMERCIAL E TAREFAS
              </text>
            </svg>
          </div>
        </div>

          {/* 4 Cards de Métricas Estilo Glass / Glow do Financeiro */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mx-auto select-none">
            <button
              type="button"
              onClick={() => {
                setIsolatedStageId(null);
                setInternalFilterUser("ALL");
              }}
              className={`glass relative overflow-hidden rounded-xl border px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.03] text-left ${
                !isolatedStageId && internalFilterUser === "ALL"
                  ? "border-accent/60 bg-accent/15 shadow-[0_0_15px_rgba(250,204,21,0.2)]"
                  : "border-white/10 hover:border-white/25 hover:bg-white/5"
              }`}
              title="Mostrar todas as colunas e atividades"
            >
              <div className="w-1 h-7 rounded-full bg-accent animate-pulse-yellow" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                  Total Geral
                </p>
                <p className="text-xs font-black font-mono text-white mt-0.5">
                  {pipelineMetrics.totalDeals} criadas
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsolatedStageId((prev) => (prev === "lead" ? null : "lead"));
                setInternalFilterUser("ALL");
              }}
              className={`glass relative overflow-hidden rounded-xl border px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.03] text-left ${
                isolatedStageId === "lead"
                  ? "border-sky-400/60 bg-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/40"
                  : "border-white/10 hover:border-sky-400/30 hover:bg-white/5"
              }`}
              title="Expandir e visualizar colunas de Tarefas"
            >
              <div className="w-1 h-7 rounded-full bg-sky-400" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                  Tarefas
                </p>
                <p className="text-xs font-black font-mono text-sky-400 mt-0.5">
                  {pipelineMetrics.internalCount} ativas
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsolatedStageId((prev) => (prev === "qualification" ? null : "qualification"));
                setInternalFilterUser("ALL");
              }}
              className={`glass relative overflow-hidden rounded-xl border px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.03] text-left ${
                isolatedStageId === "qualification"
                  ? "border-indigo-400/60 bg-indigo-500/20 shadow-[0_0_15px_rgba(129,140,248,0.25)] ring-1 ring-indigo-400/40"
                  : "border-white/10 hover:border-indigo-400/30 hover:bg-white/5"
              }`}
              title="Expandir e visualizar colunas de Orçamentos"
            >
              <div className="w-1 h-7 rounded-full bg-indigo-400" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                  Orçamentos
                </p>
                <p className="text-xs font-black font-mono text-indigo-400 mt-0.5">
                  {pipelineMetrics.externalCount} clientes
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsolatedStageId((prev) => (prev === "won" ? null : "won"));
                setInternalFilterUser("ALL");
              }}
              className={`glass relative overflow-hidden rounded-xl border px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-all duration-200 hover:scale-[1.03] text-left ${
                isolatedStageId === "won"
                  ? "border-emerald-400/60 bg-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.25)] ring-1 ring-emerald-400/40"
                  : "border-white/10 hover:border-emerald-400/30 hover:bg-white/5"
              }`}
              title="Expandir e visualizar colunas de Concluídas"
            >
              <div className="w-1 h-7 rounded-full bg-emerald-400" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                  Concluídas
                </p>
                <p className="text-xs font-black font-mono text-emerald-400 mt-0.5">
                  {pipelineMetrics.wonDeals} ganhas
                </p>
              </div>
            </button>
          </div>

          {/* Lado Direito: Perfil, Central de Alertas ADM, ADM e Sair */}
          <div className="flex items-center gap-3 justify-between lg:w-1/3 lg:justify-end shrink-0">
            <div className="flex flex-col items-end">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground opacity-60">
                {role === "admin" ? "Administrador" : "Equipe"}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="text-accent hover:text-white transition-colors hover:scale-110"
                >
                  <UserIcon className="h-5 w-5" />
                </button>
                <p className="text-sm font-black uppercase tracking-widest text-white">
                  {user?.user_metadata?.display_name || user?.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {role === "admin" && (
                <Link
                  to="/admin"
                  className="btn-ghost-neon rounded-lg px-3.5 py-2 text-xs flex items-center gap-1.5 text-accent hover:text-accent-foreground"
                >
                  <ShieldCheck className="h-4 w-4" /> ADM
                </Link>
              )}

              <button
                type="button"
                onClick={handleExit}
                className="btn-ghost-neon rounded-lg px-3.5 py-2 text-xs flex items-center gap-1.5 text-rose-400 hover:text-rose-300"
                title={role === "admin" ? "Voltar ao Seletor de Módulos" : "Sair do Sistema"}
              >
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>
          </div>
        </header>

      {/* Quadro de Tarefas / Atividades Kanban com Estilo Futurista Glass e Rolagem Própria por Coluna */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden pt-0">
        {/* Topo Centralizado das Colunas: Destaque com Letra Maior ao Clicar em Usuário ou Etapa (Muda para FECHAR no hover para voltar ao Quadro Geral) */}
        {(internalFilterUser !== "ALL" || isolatedStageId) && (() => {
          return (
            <div className="shrink-0 flex items-center justify-center w-full py-2 animate-in fade-in slide-in-from-top-1" onClick={(e) => e.stopPropagation()}>
              {isolatedStageId && internalFilterUser !== "ALL" ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsolatedStageId(null);
                    setInternalFilterUser("ALL");
                  }}
                  className="group inline-flex items-center justify-center px-5 py-1.5 rounded-xl bg-sky-950/75 hover:bg-rose-950/60 border border-sky-400/50 hover:border-rose-400/60 shadow-[0_0_20px_rgba(56,189,248,0.25)] hover:shadow-[0_0_20px_rgba(244,63,94,0.35)] backdrop-blur-xl transition-all duration-200 cursor-pointer animate-in fade-in select-none max-w-[90vw]"
                  title="Clique para fechar e voltar ao quadro geral"
                >
                  <span className="text-base sm:text-lg font-black uppercase tracking-wider text-sky-300 group-hover:text-rose-300 leading-none transition-colors group-hover:hidden truncate">
                    {`${STAGES.find((s) => s.id === isolatedStageId)?.title || "ATIVIDADE"} - ${
                      teamMembers.find((m) => m.id === internalFilterUser)?.display_name ||
                      teamMembers.find((m) => m.id === internalFilterUser)?.email ||
                      deals.find((d) => d.assigned_user_id === internalFilterUser)?.assigned_user_name ||
                      "USUÁRIO"
                    }`}
                  </span>
                  <span className="text-base sm:text-lg font-black uppercase tracking-wider text-rose-300 leading-none transition-colors hidden group-hover:inline">
                    FECHAR
                  </span>
                </button>
              ) : isolatedStageId ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsolatedStageId(null);
                    setInternalFilterUser("ALL");
                  }}
                  className="group inline-flex items-center justify-center px-5 py-1.5 rounded-xl bg-sky-950/75 hover:bg-rose-950/60 border border-sky-400/50 hover:border-rose-400/60 shadow-[0_0_20px_rgba(56,189,248,0.25)] hover:shadow-[0_0_20px_rgba(244,63,94,0.35)] backdrop-blur-xl transition-all duration-200 cursor-pointer animate-in fade-in select-none max-w-[90vw]"
                  title="Clique para fechar e voltar ao quadro geral"
                >
                  <span className="text-base sm:text-lg font-black uppercase tracking-wider text-sky-300 group-hover:text-rose-300 leading-none transition-colors group-hover:hidden truncate">
                    {STAGES.find((s) => s.id === isolatedStageId)?.title || "ATIVIDADE"}
                  </span>
                  <span className="text-base sm:text-lg font-black uppercase tracking-wider text-rose-300 leading-none transition-colors hidden group-hover:inline">
                    FECHAR
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsolatedStageId(null);
                    setInternalFilterUser("ALL");
                  }}
                  className="group inline-flex items-center justify-center px-5 py-1.5 rounded-xl bg-sky-950/75 hover:bg-rose-950/60 border border-sky-400/50 hover:border-rose-400/60 shadow-[0_0_20px_rgba(56,189,248,0.25)] hover:shadow-[0_0_20px_rgba(244,63,94,0.35)] backdrop-blur-xl transition-all duration-200 cursor-pointer animate-in fade-in select-none max-w-[90vw]"
                  title="Clique para fechar e voltar ao quadro geral"
                >
                  <span className="text-base sm:text-lg font-black uppercase tracking-wider text-sky-300 group-hover:text-rose-300 leading-none transition-colors group-hover:hidden truncate">
                    {teamMembers.find((m) => m.id === internalFilterUser)?.display_name ||
                      teamMembers.find((m) => m.id === internalFilterUser)?.email ||
                      deals.find((d) => d.assigned_user_id === internalFilterUser)?.assigned_user_name ||
                      "USUÁRIO"}
                  </span>
                  <span className="text-base sm:text-lg font-black uppercase tracking-wider text-rose-300 leading-none transition-colors hidden group-hover:inline">
                    FECHAR
                  </span>
                </button>
              )}
            </div>
          );
        })()}

        {/* Exibição das Colunas (Modo Normal: 5 Colunas de Etapas | Modo Isolado: Colunas Kanban por Usuário Responsável) */}
        {(() => {
          // Helper para buscar tarefas vinculadas a uma atividade primária
          const getSubtasksForDeal = (parentDeal: Deal, pool: Deal[]) => {
            const parentReq = getDealReqNumber(parentDeal, deals);
            return pool.filter((other) => {
              if (other.id === parentDeal.id) return false;
              const pInfo = getParentDealInfo(other);
              if (!pInfo) return false;
              return (
                pInfo.id === parentDeal.id ||
                (pInfo.reqNumber && pInfo.reqNumber === parentReq) ||
                (pInfo.deal && pInfo.deal.id === parentDeal.id)
              );
            });
          };

          // Helper para verificar se um deal é subtarefa cujo pai está presente no pool
          const isSubtaskWithParentInPool = (deal: Deal, pool: Deal[]) => {
            const pInfo = getParentDealInfo(deal);
            if (!pInfo) return false;
            return pool.some((other) => {
              if (other.id === deal.id) return false;
              const otherReq = getDealReqNumber(other, deals);
              return (
                (pInfo.id && other.id === pInfo.id) ||
                (pInfo.reqNumber && otherReq === pInfo.reqNumber)
              );
            });
          };

          // Helper unificado para renderizar cards de atividade em qualquer modo
          const renderDealCard = (
            deal: Deal,
            stageId: string,
            isCompactView: boolean = false,
            isSubtaskCard: boolean = false
          ) => {
            const pInfo = getParentDealInfo(deal);
            const isSubtask = isSubtaskCard || Boolean(pInfo);
            const linkedSubtasks = !isSubtask ? getSubtasksForDeal(deal, deals) : [];
            const isExpanded = Boolean(expandedSubtaskDealIds[deal.id]);

            const reqNumber = getDealReqNumber(deal, deals);
            const canModifyDeal = role === "admin" || deal.assigned_user_id === user?.id;

            const hasDeadline = Boolean(deal.expected_close_date);
            const internalStyle = getInternalDeadlineStyle(deal.expected_close_date);
            const aging = getDealAgingStyle(deal.updated_at || deal.created_at);

            const cardBgClass = isSubtask
              ? "bg-slate-950/80 border-sky-500/30 text-white shadow-sm hover:border-sky-400"
              : aging.cardClass;

            const isBeingDragged = draggingDealId === deal.id;

            const cardCustomer = getDealCustomer(deal);
            const cardCustomerName =
              cardCustomer?.company_name ||
              cardCustomer?.name ||
              (deal.customer_name && deal.customer_name !== "Uso Interno / Empresa"
                ? deal.customer_name
                : null);

            // Remove prefixos repetitivos para manter o card limpo e direto
            const cleanTitle = getCleanDealTitle(deal.title);

            const cardElement = (
              <div
                key={deal.id}
                draggable={canModifyDeal}
                onDragStart={(e) => {
                  if (!canModifyDeal) {
                    e.preventDefault();
                    return;
                  }
                  isDraggingRef.current = true;
                  draggingDealIdRef.current = deal.id;
                  setDraggingDealId(deal.id);
                  e.dataTransfer.setData("text/plain", deal.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setTimeout(() => {
                    draggingDealIdRef.current = null;
                    setDraggingDealId(null);
                    setDragOverStageId(null);
                    setDragOverTargetDealId(null);
                    isDraggingRef.current = false;
                  }, 200);
                }}
                onDragOver={(e) => {
                  if (!canModifyDeal) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const draggedId = draggingDealIdRef.current || draggingDealId;
                  if (draggedId && draggedId !== deal.id) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const pos = e.clientY < midY ? "before" : "after";
                    if (dragOverTargetDealId !== deal.id || dragDropPosition !== pos) {
                      setDragOverTargetDealId(deal.id);
                      setDragDropPosition(pos);
                    }
                  }
                }}
                onDragLeave={(e) => {
                  if (
                    dragOverTargetDealId === deal.id &&
                    !e.currentTarget.contains(e.relatedTarget as Node)
                  ) {
                    setDragOverTargetDealId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const sourceDealId =
                    e.dataTransfer.getData("text/plain") ||
                    draggingDealIdRef.current ||
                    draggingDealId;
                  setDragOverTargetDealId(null);
                  setDragOverStageId(null);

                  if (sourceDealId && sourceDealId !== deal.id) {
                    const sourceDeal = deals.find((d) => d.id === sourceDealId);
                    if (!sourceDeal) return;

                    if (role !== "admin" && sourceDeal.assigned_user_id !== user?.id) {
                      return toast.error("Você só pode alterar a prioridade das atividades sob sua responsabilidade.");
                    }

                    if (sourceDeal.stage === stageId) {
                      handleReorderDealWithinStage(
                        stageId as Deal["stage"],
                        sourceDealId,
                        deal.id,
                        dragDropPosition
                      );
                    } else {
                      handleMoveStage(sourceDeal, stageId as Deal["stage"]);
                    }
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDraggingRef.current) return;
                  openDealHistory(deal);
                }}
                className={`group crm-card w-full relative rounded-xl border px-3 py-2.5 transition-all duration-150 flex flex-col justify-between ${
                  isSubtask ? "h-[80px] min-h-[80px] max-h-[80px]" : "h-[88px] min-h-[88px] max-h-[88px]"
                } overflow-hidden select-none ${
                  canModifyDeal ? "cursor-grab active:cursor-grabbing hover:border-white/30" : "cursor-pointer"
                } ${
                  isBeingDragged
                    ? "opacity-25 scale-95 border-dashed border-sky-400 ring-2 ring-sky-400 bg-sky-950/40"
                    : "hover:shadow-lg shadow-sm"
                } ${
                  dragOverTargetDealId === deal.id
                    ? "ring-2 ring-sky-400 border-sky-400 shadow-lg shadow-sky-950/50"
                    : ""
                } ${cardBgClass}`}
              >
                {/* Linha indicadora de Drop para Reordenação de Prioridade */}
                {canModifyDeal && dragOverTargetDealId === deal.id && (
                  <div
                    className={`absolute left-0 right-0 z-30 pointer-events-none flex items-center justify-between px-3 h-4 bg-sky-500/20 border-sky-400 border-dashed ${
                      dragDropPosition === "before" ? "top-0 border-t-2" : "bottom-0 border-b-2"
                    }`}
                  >
                    <span className="font-mono text-[8px] font-black text-sky-300 uppercase tracking-widest bg-slate-950 px-1.5 py-0.5 rounded shadow-sm">
                      {dragDropPosition === "before" ? "▲ INSERIR ACIMA" : "▼ INSERIR ABAIXO"}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping" />
                  </div>
                )}

                {/* Alerta de Tarefa Vinculada Concluída (Bolinha no Canto Superior visível ao responsável) */}
                {unreadParentAlerts[deal.id] && (deal.assigned_user_id === user?.id || role === "admin") && (
                  <span
                    className="absolute top-1.5 right-1.5 flex h-3 w-3 z-30 pointer-events-none"
                    title="Uma tarefa vinculada a esta atividade foi concluída!"
                  >
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-950 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                  </span>
                )}

                {/* OVERLAY DE ATUALIZAÇÃO NO HOVER: MOSTRA [AUTOR DA ATUALIZAÇÃO]: [ATUALIZAÇÃO] */}
                <div className="crm-hover-update-overlay absolute inset-0 rounded-xl bg-slate-950/95 backdrop-blur-md p-3 flex flex-col justify-start text-left opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-20 overflow-hidden">
                  <p className="text-[11px] font-medium text-slate-100 leading-snug line-clamp-5 overflow-hidden whitespace-pre-wrap flex-1">
                    <strong className="text-sky-300 font-bold">[{deal.latest_update_author || deal.creator_name || "Usuário"}]: </strong>
                    {getCleanHoverNote(deal.notes)}
                  </p>
                </div>

                {/* 1. PRIMEIRA LINHA: CLIENTE - TÍTULO DA ATIVIDADE NA MESMA COR */}
                <div className="w-full min-w-0 h-[18px] flex items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {isSubtask && (
                      <span className="font-mono text-[8px] font-black px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-400/40 uppercase shrink-0">
                        TAREFA
                      </span>
                    )}
                    <h3
                      className={`font-black uppercase tracking-wider truncate leading-none flex-1 ${
                        isSubtask ? "text-sky-300" : "text-sky-400"
                      }`}
                      title={cardCustomerName ? `${cardCustomerName.trim().toUpperCase()} - ${cleanTitle}` : cleanTitle}
                    >
                      {cardCustomerName && cardCustomerName.trim() !== "" ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (cardCustomer) {
                                setSelectedCustomerForDetails(cardCustomer);
                              } else {
                                toast.info(`Cliente: ${cardCustomerName}`);
                              }
                            }}
                            className="hover:underline cursor-pointer hover:text-sky-200 transition-colors"
                            title="Clique para ver a ficha do cliente"
                          >
                            {cardCustomerName.trim().toUpperCase()}
                          </button>
                          <span className="opacity-70 mx-1.5">-</span>
                          <span>{cleanTitle}</span>
                        </>
                      ) : (
                        <span>{cleanTitle}</span>
                      )}
                    </h3>
                  </div>
                </div>

                {/* 2. SEGUNDA LINHA: NÚMERO DE REGISTRO + ALERTA DE TAREFAS VINCULADAS (CENTRALIZADO) + RESPONSÁVEL */}
                <div className="relative flex items-center justify-between h-[22px] min-h-[22px] max-h-[22px] gap-1.5">
                  {/* Esquerda: Registro */}
                  <span
                    title={`Registro: ${reqNumber}`}
                    className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-black/50 text-sky-300 border border-sky-400/40 tracking-wider shadow-inner flex items-center justify-center shrink-0 h-[20px]"
                  >
                    {reqNumber}
                  </span>

                  {/* Centro: Badge de Tarefas Vinculadas */}
                  <div className="flex-1 flex items-center justify-center min-w-0 px-1">
                    {!isSubtask && linkedSubtasks.length > 0 && (
                      <div
                        title={`Esta atividade possui ${linkedSubtasks.length} ${
                          linkedSubtasks.length === 1 ? "tarefa vinculada" : "tarefas vinculadas"
                        }`}
                        className="font-mono text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-950/90 text-sky-300 border border-sky-500/50 flex items-center gap-1 shrink-0 h-[20px] shadow-sm select-none"
                      >
                        <GitFork className="h-2.5 w-2.5 text-sky-400" />
                        <span>{linkedSubtasks.length} {linkedSubtasks.length === 1 ? "TAREFA" : "TAREFAS"}</span>
                      </div>
                    )}
                  </div>

                  {/* Direita: Usuário Responsável Clicável para Filtrar */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleUserFilter(deal.assigned_user_id, e)}
                    className={`group/userbtn shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/50 border transition-all cursor-pointer shadow-sm h-[20px] flex items-center gap-1 max-w-[155px] ml-auto ${
                      internalFilterUser === deal.assigned_user_id
                        ? "text-rose-300 border-rose-400/50 hover:bg-rose-500/25 hover:shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                        : "text-white hover:text-emerald-300 border-white/15 hover:border-emerald-400/50 hover:bg-emerald-500/20 hover:shadow-[0_0_12px_rgba(52,211,153,0.3)]"
                    }`}
                    title={internalFilterUser === deal.assigned_user_id ? "Contrair Responsável" : "Expandir Responsável"}
                  >
                    <UserCheck
                      className={`h-3 w-3 shrink-0 transition-colors ${
                        internalFilterUser === deal.assigned_user_id
                          ? "text-rose-400"
                          : "text-sky-400 group-hover/userbtn:text-emerald-400"
                      }`}
                    />
                    <span className="truncate group-hover/userbtn:hidden">{deal.assigned_user_name}</span>
                    <span
                      className={`hidden group-hover/userbtn:inline-flex items-center gap-1 truncate animate-in fade-in duration-150 ${
                        internalFilterUser === deal.assigned_user_id
                          ? "text-rose-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.7)]"
                          : "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                      }`}
                    >
                      <span className="truncate">{deal.assigned_user_name}</span>
                      <span className="opacity-60">-</span>
                      <span>{internalFilterUser === deal.assigned_user_id ? "CONTRAIR" : "EXPANDIR"}</span>
                    </span>
                  </button>
                </div>

                {/* 3. RODAPÉ DO CARD: PRAZO SE HOUVER (INTERNAS OU EXTERNAS COM PRAZO) / DIAS EM ABERTO SE NÃO HOUVER PRAZO */}
                <div className="flex items-center justify-between gap-2 text-[10px] h-[20px] min-h-[20px] max-h-[20px] min-w-0">
                  {hasDeadline ? (
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      {internalStyle.isExpired ? (
                        <span
                          title={`Prazo original: ${formatDeadlineWithWeekday(deal.expected_close_date) || ""}`}
                          className={`font-mono text-[9px] font-black flex items-center justify-center shadow-sm tracking-tight shrink-0 ${internalStyle.indicatorBadgeClass}`}
                        >
                          {internalStyle.indicatorBadge}
                        </span>
                      ) : (
                        <>
                          {internalStyle.indicatorBadge && (
                            <span
                              title={internalStyle.hoverText}
                              className={`font-mono text-[9px] font-black flex items-center justify-center shadow-sm tracking-tight shrink-0 ${internalStyle.indicatorBadgeClass}`}
                            >
                              {internalStyle.indicatorBadge}
                            </span>
                          )}
                          <span
                            className={`font-mono truncate ${internalStyle.colorClass}`}
                            title={formatDeadlineWithWeekday(deal.expected_close_date) || ""}
                          >
                            {formatDeadlineWithWeekday(deal.expected_close_date)}
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      {(() => {
                        const days = getEffectiveCalendarDays(deal.created_at);
                        
                        if (days === 0) {
                          return (
                            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 truncate">
                              aberta hoje
                            </span>
                          );
                        }

                        return (
                          <span
                            title={`Atividade aberta há ${days} ${days === 1 ? "dia" : "dias"}`}
                            className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/80 truncate"
                          >
                            {`aberta há ${days} ${days === 1 ? "dia" : "dias"}`}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );

            // Se for card de subtarefa renderizado dentro do container aninhado, retorna diretamente o elemento do card
            if (isSubtask) {
              return cardElement;
            }

            // Se for atividade primária (com ou sem tarefas vinculadas), retorna o card e a lista recolhida/expandida no hover ou clique
            const isHoveredOrExpanded = isExpanded || hoveredSubtasksDealId === deal.id;

            return (
              <div
                key={deal.id}
                onMouseEnter={() => {
                  if (linkedSubtasks.length > 0) {
                    setHoveredSubtasksDealId(deal.id);
                  }
                }}
                onMouseLeave={() => {
                  if (hoveredSubtasksDealId === deal.id) {
                    setHoveredSubtasksDealId(null);
                  }
                }}
                className="w-full flex flex-col space-y-1.5 transition-all duration-200"
              >
                {cardElement}

                {/* Lista de Tarefas Vinculadas (Exibida dinamicamente no hover da atividade, empurrando as demais) */}
                {isHoveredOrExpanded && linkedSubtasks.length > 0 && (
                  <div className="pl-3.5 ml-2.5 border-l-2 border-dashed border-sky-400/40 space-y-1.5 pt-0.5 pb-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-sky-300/80 px-1 py-0.5">
                      <GitFork className="h-3 w-3 text-sky-400" />
                      <span>Tarefas Vinculadas ({linkedSubtasks.length})</span>
                    </div>
                    {linkedSubtasks.map((subtask) =>
                      renderDealCard(subtask, stageId, isCompactView, true)
                    )}
                  </div>
                )}
              </div>
            );
          };

          // CASO 1: MODO ISOLADO / EXPANDIDO (Colunas Kanban por Usuário Responsável)
          if (isolatedStageId) {
            const currentStage = STAGES.find((s) => s.id === isolatedStageId) || STAGES[0];
            let stageDeals = visibleDeals.filter((d) => d.stage === currentStage.id);

            if (internalFilterUser !== "ALL") {
              if (internalFilterUser === "unassigned") {
                stageDeals = stageDeals.filter((d) => !d.assigned_user_id);
              } else {
                stageDeals = stageDeals.filter((d) => d.assigned_user_id === internalFilterUser);
              }
            }

            const currentStageTerm = (stageSearchTerms[currentStage.id] || "").trim().toLowerCase();
            if (currentStageTerm) {
              stageDeals = stageDeals.filter(
                (d) =>
                  d.title?.toLowerCase().includes(currentStageTerm) ||
                  d.req_number?.toLowerCase().includes(currentStageTerm) ||
                  getDealReqNumber(d, deals).toLowerCase().includes(currentStageTerm) ||
                  d.notes?.toLowerCase().includes(currentStageTerm) ||
                  d.assigned_user_name?.toLowerCase().includes(currentStageTerm) ||
                  d.creator_name?.toLowerCase().includes(currentStageTerm) ||
                  (d.customer_name && d.customer_name.toLowerCase().includes(currentStageTerm))
              );
            }

            // Agrupamento por Usuário
            const userGroupsMap = new Map<string, { id: string; name: string; deals: Deal[] }>();
            stageDeals.forEach((deal) => {
              const uId = deal.assigned_user_id || "unassigned";
              const uName = deal.assigned_user_name || "Sem Responsável";
              if (!userGroupsMap.has(uId)) {
                userGroupsMap.set(uId, { id: uId, name: uName, deals: [] });
              }
              userGroupsMap.get(uId)!.deals.push(deal);
            });

            const userGroups = Array.from(userGroupsMap.values()).sort((a, b) => {
              if (a.id === "unassigned") return 1;
              if (b.id === "unassigned") return -1;
              return a.name.localeCompare(b.name);
            });

            const isManyUsers = userGroups.length > 4;

            return (
              <div className="flex-1 min-h-0 flex gap-3.5 h-full overflow-x-auto overflow-y-hidden pt-1 pb-1 px-0.5">
                {userGroups.length === 0 ? (
                  <div className="w-full flex items-center justify-center p-12 text-muted-foreground uppercase tracking-widest text-xs border border-dashed border-white/10 rounded-2xl">
                    Nenhuma atividade encontrada nesta etapa.
                  </div>
                ) : (
                  userGroups.map((group) => {
                    const uTerm = (userSearchTerms[group.id] || "").trim().toLowerCase();
                    let displayedUserDeals = group.deals;
                    if (uTerm) {
                      displayedUserDeals = displayedUserDeals.filter(
                        (d) =>
                          d.title?.toLowerCase().includes(uTerm) ||
                          d.req_number?.toLowerCase().includes(uTerm) ||
                          getDealReqNumber(d, deals).toLowerCase().includes(uTerm) ||
                          d.notes?.toLowerCase().includes(uTerm) ||
                          (d.customer_name && d.customer_name.toLowerCase().includes(uTerm))
                      );
                    }

                    const isUserSearchOpen = openSearchUserId === group.id;
                    const topLevelUserDeals = displayedUserDeals.filter(
                      (deal) => !isSubtaskWithParentInPool(deal, displayedUserDeals)
                    );

                    return (
                      <div
                        key={group.id}
                        onClick={(e) => e.stopPropagation()}
                        className={`glass flex flex-col rounded-2xl border ${currentStage.border} ${currentStage.bg || ""} overflow-hidden shadow-xl transition-all h-full max-h-full ${
                          isManyUsers ? "min-w-[280px] max-w-[280px]" : "flex-1 min-w-[280px]"
                        }`}
                      >
                        {/* Header da Coluna do Usuário com Hover Interno e Ações de Expandir */}
                        <div
                          onClick={() => {
                            if (group.id !== "unassigned") {
                              setInternalFilterUser((prev) => (prev === group.id ? "ALL" : group.id));
                            }
                          }}
                          className={`group/subcol shrink-0 flex items-center justify-between p-3 border-b select-none cursor-pointer transition-all duration-200 relative overflow-hidden ${
                            internalFilterUser === group.id
                              ? "border-white/10 bg-gradient-to-b from-rose-500/20 via-rose-950/40 to-transparent hover:bg-rose-500/25 hover:border-rose-400/50 shadow-[inset_0_1px_15px_rgba(244,63,94,0.15)] hover:shadow-[inset_0_1px_20px_rgba(244,63,94,0.3)]"
                              : `border-white/10 bg-gradient-to-b ${currentStage.glow} to-transparent hover:bg-emerald-500/20 hover:border-emerald-400/50 hover:shadow-[inset_0_1px_20px_rgba(52,211,153,0.25)]`
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`p-1.5 rounded-xl border shrink-0 pointer-events-none transition-colors ${
                                internalFilterUser === group.id
                                  ? "bg-rose-500/20 text-rose-300 border-rose-400/30"
                                  : "bg-sky-500/20 text-sky-300 border-sky-400/30 group-hover/subcol:bg-emerald-500/20 group-hover/subcol:text-emerald-300 group-hover/subcol:border-emerald-400/30"
                              }`}
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex flex-col justify-center">
                              {/* Nome do Responsável */}
                              <button
                                type="button"
                                onMouseEnter={() => setHoveredSubcolUser(group.id)}
                                onMouseLeave={() => setHoveredSubcolUser(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (group.id !== "unassigned") {
                                    setIsolatedStageId(null);
                                    setInternalFilterUser(group.id);
                                  }
                                }}
                                className="text-xs font-black uppercase tracking-wider text-white hover:text-indigo-300 transition-colors text-left truncate block max-w-[170px] cursor-pointer leading-tight hover:underline"
                                title="Expandir todas as atividades deste responsável"
                              >
                                {group.name}
                              </button>

                              {/* Surge abaixo do nome: 'Expandir Responsável' se o mouse estiver sobre o nome, ou 'Expandir Atividade' se estiver na área do topo */}
                              {hoveredSubcolUser === group.id ? (
                                <span className="text-[9px] uppercase font-bold tracking-wider text-indigo-300 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] truncate pointer-events-none animate-in fade-in duration-150 leading-none mt-1">
                                  Expandir Responsável
                                </span>
                              ) : (
                                <span
                                  className={`text-[9px] uppercase font-bold tracking-wider hidden group-hover/subcol:block truncate pointer-events-none animate-in fade-in duration-150 leading-none mt-1 ${
                                    internalFilterUser === group.id
                                      ? "text-rose-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.7)]"
                                      : "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                                  }`}
                                >
                                  {internalFilterUser === group.id ? "Contrair Atividade" : "Expandir Atividade"}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="relative flex items-center crm-search-box">
                              {isUserSearchOpen ? (
                                <div className="flex items-center gap-1 bg-black/80 border border-sky-400/50 rounded-lg px-2 py-0.5 animate-in fade-in max-w-[120px] shadow-sm">
                                  <Search className="h-3 w-3 text-sky-400 shrink-0" />
                                  <input
                                    type="text"
                                    placeholder="Pesquisar..."
                                    value={userSearchTerms[group.id] || ""}
                                    onChange={(e) =>
                                      setUserSearchTerms((prev) => ({ ...prev, [group.id]: e.target.value }))
                                    }
                                    className="bg-transparent text-[10px] text-white outline-none w-full placeholder:text-white/40 font-medium"
                                    autoFocus
                                  />
                                  {userSearchTerms[group.id] ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setUserSearchTerms((prev) => ({ ...prev, [group.id]: "" }))
                                      }
                                      className="text-[10px] text-muted-foreground hover:text-white px-0.5"
                                      title="Limpar busca"
                                    >
                                      ✕
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setOpenSearchUserId(null)}
                                      className="text-[10px] text-muted-foreground hover:text-white px-0.5"
                                      title="Fechar busca"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setOpenSearchUserId(group.id)}
                                  className={`p-1.5 rounded-lg text-xs transition-all flex items-center gap-1 cursor-pointer ${
                                    userSearchTerms[group.id]
                                      ? "bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-sm"
                                      : "bg-white/5 text-muted-foreground hover:text-white border border-white/10 hover:border-white/20"
                                  }`}
                                  title={`Pesquisar atividades de ${group.name}`}
                                >
                                  <Search className="h-3.5 w-3.5" />
                                  {userSearchTerms[group.id] && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                                  )}
                                </button>
                              )}
                            </div>

                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white font-mono shrink-0">
                              {displayedUserDeals.length}
                            </span>
                          </div>
                        </div>

                        {/* Lista de Cards deste Usuário */}
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 w-full px-1.5 py-1.5 no-scrollbar pb-10">
                          {topLevelUserDeals.map((deal) => renderDealCard(deal, currentStage.id, isManyUsers))}
                        </div>

                        {/* Efeito desfoque suave e gradiente na base da coluna com altura ampliada */}
                        <div className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent backdrop-blur-[2px] rounded-b-2xl z-10" />
                      </div>
                    );
                  })
                )}
              </div>
            );
          }

          // CASO 2: MODO NORMAL (5 Colunas de Etapas do Kanban)
          return (
            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 h-full overflow-x-auto overflow-y-hidden pt-1 pb-1 px-0.5">
              {STAGES.map((stage) => {
                let stageDeals = visibleDeals.filter((d) => d.stage === stage.id);

                if (internalFilterUser !== "ALL") {
                  if (internalFilterUser === "unassigned") {
                    stageDeals = stageDeals.filter((d) => !d.assigned_user_id);
                  } else {
                    stageDeals = stageDeals.filter(
                      (d) => d.assigned_user_id === internalFilterUser
                    );
                  }
                }

                const stageTerm = (stageSearchTerms[stage.id] || "").trim().toLowerCase();
                if (stageTerm) {
                  stageDeals = stageDeals.filter(
                    (d) =>
                      d.title?.toLowerCase().includes(stageTerm) ||
                      d.req_number?.toLowerCase().includes(stageTerm) ||
                      getDealReqNumber(d, deals).toLowerCase().includes(stageTerm) ||
                      d.notes?.toLowerCase().includes(stageTerm) ||
                      d.assigned_user_name?.toLowerCase().includes(stageTerm) ||
                      d.creator_name?.toLowerCase().includes(stageTerm) ||
                      (d.customer_name && d.customer_name.toLowerCase().includes(stageTerm))
                  );
                }

                const customOrder = Array.isArray(stageCustomOrders?.[stage.id]) ? stageCustomOrders[stage.id] : [];
                if (customOrder.length > 0) {
                  stageDeals = [...stageDeals].sort((a, b) => {
                    const indexA = customOrder.indexOf(a.id);
                    const indexB = customOrder.indexOf(b.id);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    const timeA = new Date(a.created_at || a.updated_at || 0).getTime();
                    const timeB = new Date(b.created_at || b.updated_at || 0).getTime();
                    return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
                  });
                } else {
                  stageDeals = [...stageDeals].sort((a, b) => {
                    const timeA = new Date(a.created_at || a.updated_at || 0).getTime();
                    const timeB = new Date(b.created_at || b.updated_at || 0).getTime();
                    return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
                  });
                }

                const isStageSearchOpen = openSearchStageId === stage.id;
                const topLevelDeals = stageDeals.filter(
                  (deal) => !isSubtaskWithParentInPool(deal, stageDeals)
                );

                return (
                  <div
                    key={stage.id}
                    onClick={(e) => e.stopPropagation()}
                    className={`glass flex flex-col rounded-2xl border ${stage.border} ${stage.bg || ""} overflow-hidden shadow-xl transition-all h-full max-h-full ${
                      dragOverStageId === stage.id ? "ring-2 ring-sky-400 border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.35)] bg-sky-950/25" : ""
                    }`}
                  >
                    {/* Header da Coluna com Hover Interno */}
                    <div
                      onClick={() => {
                        setIsolatedStageId((prev) => (prev === stage.id ? null : stage.id));
                      }}
                      className={`group/header shrink-0 flex items-center justify-between p-3 border-b select-none cursor-pointer transition-all duration-200 relative overflow-hidden ${
                        isolatedStageId === stage.id
                          ? "border-white/10 bg-gradient-to-b from-rose-500/20 via-rose-950/40 to-transparent hover:bg-rose-500/25 hover:border-rose-400/50 shadow-[inset_0_1px_15px_rgba(244,63,94,0.15)] hover:shadow-[inset_0_1px_20px_rgba(244,63,94,0.3)]"
                          : `border-white/10 bg-gradient-to-b ${stage.glow} to-transparent hover:bg-emerald-500/20 hover:border-emerald-400/50 hover:shadow-[inset_0_1px_20px_rgba(52,211,153,0.25)]`
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`h-2.5 w-2.5 rounded-full shadow-[0_0_8px_currentColor] shrink-0 transition-colors ${
                            isolatedStageId === stage.id
                              ? "bg-rose-400 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                              : `${stage.color.replace("text-", "bg-")} group-hover/header:bg-emerald-400 group-hover/header:text-emerald-400 group-hover/header:shadow-[0_0_8px_rgba(52,211,153,0.8)]`
                          }`}
                        />
                        <div className="min-w-0 flex flex-col justify-center">
                          {/* Título da Atividade sempre visível */}
                          <span className={`text-xs font-black uppercase tracking-widest ${stage.color} block truncate leading-tight`}>
                            {stage.title}
                          </span>
                          {/* Surge abaixo do título no hover da coluna */}
                          <span
                            className={`text-[9px] uppercase font-bold tracking-wider hidden group-hover/header:block truncate pointer-events-none animate-in fade-in duration-150 leading-none mt-1 ${
                              isolatedStageId === stage.id
                                ? "text-rose-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.7)]"
                                : "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                            }`}
                          >
                            {isolatedStageId === stage.id ? "Contrair Atividade" : "Expandir Atividade"}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center crm-search-box">
                          {isStageSearchOpen ? (
                            <div className="flex items-center gap-1 bg-black/80 border border-sky-400/50 rounded-lg px-2 py-0.5 animate-in fade-in max-w-[120px] sm:max-w-[140px] shadow-sm">
                              <Search className="h-3 w-3 text-sky-400 shrink-0" />
                              <input
                                type="text"
                                placeholder="Pesquisar..."
                                value={stageSearchTerms[stage.id] || ""}
                                onChange={(e) =>
                                  setStageSearchTerms((prev) => ({ ...prev, [stage.id]: e.target.value }))
                                }
                                className="bg-transparent text-[10px] text-white outline-none w-full placeholder:text-white/40 font-medium"
                                autoFocus
                              />
                              {stageSearchTerms[stage.id] ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStageSearchTerms((prev) => ({ ...prev, [stage.id]: "" }))
                                  }
                                  className="text-[10px] text-muted-foreground hover:text-white px-0.5"
                                  title="Limpar busca"
                                >
                                  ✕
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setOpenSearchStageId(null)}
                                  className="text-[10px] text-muted-foreground hover:text-white px-0.5"
                                  title="Fechar busca"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOpenSearchStageId(stage.id)}
                              className={`p-1.5 rounded-lg text-xs transition-all flex items-center gap-1 cursor-pointer ${
                                stageSearchTerms[stage.id]
                                    ? "bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-sm"
                                    : "bg-white/5 text-muted-foreground hover:text-white border border-white/10 hover:border-white/20"
                              }`}
                              title={`Pesquisar em ${stage.title}`}
                            >
                              <Search className="h-3.5 w-3.5" />
                              {stageSearchTerms[stage.id] && (
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                              )}
                            </button>
                          )}
                        </div>

                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white font-mono">
                          {stageDeals.length}
                        </span>
                      </div>
                    </div>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverStageId !== stage.id) {
                          setDragOverStageId(stage.id);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverStageId(null);
                        setDragOverTargetDealId(null);
                        const dealId =
                          e.dataTransfer.getData("text/plain") ||
                          draggingDealIdRef.current ||
                          draggingDealId;

                        if (dealId) {
                          const targetDeal = deals.find((d) => d.id === dealId);
                          if (targetDeal) {
                            if (role !== "admin" && targetDeal.assigned_user_id !== user?.id) {
                              return toast.error("Você só pode mover ou alterar atividades sob sua responsabilidade.");
                            }
                            if (targetDeal.stage !== stage.id) {
                              handleMoveStage(targetDeal, stage.id);
                            }
                          }
                        }
                      }}
                      className="flex-1 min-h-0 overflow-y-auto space-y-2 w-full px-1.5 py-1.5 no-scrollbar pb-10"
                    >
                      {topLevelDeals.length === 0 ? (
                        <div className="h-full min-h-[140px] flex items-center justify-center p-6 border border-dashed border-white/5 rounded-xl text-[11px] uppercase font-bold tracking-widest text-muted-foreground/40 text-center">
                          Sem atividades nesta etapa
                        </div>
                      ) : (
                        <>
                          {topLevelDeals.map((deal) => renderDealCard(deal, stage.id))}
                          {dragOverStageId === stage.id && !dragOverTargetDealId && (
                            <div className="w-full py-2.5 px-2 rounded-xl border-2 border-dashed border-sky-400/70 bg-sky-500/10 text-sky-300 flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider animate-pulse shadow-md">
                              <ArrowRight className="h-3.5 w-3.5 text-sky-400" />
                              <span>Mover para {stage.title}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Efeito desfoque suave e gradiente na base da coluna com altura ampliada */}
                    <div className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent backdrop-blur-[2px] rounded-b-2xl z-10" />
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {selectedDealForHistory && (() => {
        const hasModalDeadline = Boolean(selectedDealForHistory.expected_close_date);
        const modalStyle = hasModalDeadline
          ? getInternalDeadlineStyle(selectedDealForHistory.expected_close_date)
          : getDealAgingStyle(selectedDealForHistory.updated_at || selectedDealForHistory.created_at);

        return (
          <div
            onClick={() => {
              setSelectedDealForHistory(null);
              setIsTimelineOpen(false);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in overflow-hidden"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl max-h-[98vh] h-[98vh] rounded-2xl border border-white/15 bg-slate-950/95 p-4 sm:p-5 shadow-2xl flex flex-col backdrop-blur-2xl transition-all text-white overflow-hidden"
            >
              {/* Header Fixo do Card Expandido com Estrutura 100% Centralizada */}
              <div className="shrink-0 flex flex-col items-center justify-center border-b border-white/10 pb-3 relative">
                {/* Botão Fechar no Canto Superior Direito */}
                <button
                  onClick={() => {
                    setSelectedDealForHistory(null);
                    setIsTimelineOpen(false);
                  }}
                  className="absolute top-0 right-0 btn-ghost-neon p-1.5 rounded-xl text-muted-foreground hover:text-white cursor-pointer z-10"
                  title="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* LINHA 1 - TÍTULO E CLIENTE NA MESMA LINHA (CLIENTE CLICÁVEL) + EDIÇÃO DE TÍTULO PARA O AUTOR */}
                {(() => {
                  const dealCust = getDealCustomer(selectedDealForHistory);
                  const modalCustomerName =
                    dealCust?.company_name ||
                    dealCust?.name ||
                    (selectedDealForHistory.customer_name && selectedDealForHistory.customer_name !== "Uso Interno / Empresa"
                      ? selectedDealForHistory.customer_name
                      : null);
                  const isAuthor = selectedDealForHistory.user_id === user?.id || role === "admin";
                  const cleanTitle = getCleanDealTitle(selectedDealForHistory.title);

                  return (
                    <div className="w-full text-center px-10 pt-0.5">
                      {isEditingTitle ? (
                        <div className="flex items-center justify-center gap-2 max-w-xl mx-auto py-1 animate-in fade-in">
                          <input
                            type="text"
                            value={editingTitleValue}
                            onChange={(e) => setEditingTitleValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveTitle();
                              if (e.key === "Escape") setIsEditingTitle(false);
                            }}
                            autoFocus
                            disabled={isSavingTitle}
                            className="input-futuristic uppercase flex-1 rounded-xl px-3 py-1.5 text-sm font-black text-sky-300 bg-black/80 border border-sky-400 outline-none shadow-inner"
                            placeholder="Novo título da atividade..."
                          />
                          <button
                            type="button"
                            disabled={isSavingTitle || !editingTitleValue.trim()}
                            onClick={handleSaveTitle}
                            className="p-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/50 cursor-pointer transition-all disabled:opacity-50"
                            title="Salvar novo título"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isSavingTitle}
                            onClick={() => setIsEditingTitle(false)}
                            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white border border-white/10 cursor-pointer transition-all"
                            title="Cancelar edição"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center gap-2 max-w-full flex-wrap">
                          <h2
                            className="text-lg sm:text-xl font-black uppercase tracking-wider text-sky-300 leading-snug"
                            title={
                              modalCustomerName && modalCustomerName.trim() !== ""
                                ? `${modalCustomerName.trim().toUpperCase()} - ${cleanTitle}`
                                : selectedDealForHistory.title
                            }
                          >
                            {modalCustomerName && modalCustomerName.trim() !== "" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (dealCust) {
                                      setSelectedCustomerForDetails(dealCust);
                                    } else {
                                      toast.info(`Cliente: ${modalCustomerName}`);
                                    }
                                  }}
                                  className="text-white hover:text-sky-300 font-bold cursor-pointer transition-colors"
                                  title="Clique para ver a ficha completa do cliente"
                                >
                                  {modalCustomerName.trim().toUpperCase()}
                                </button>
                                <span className="text-white/60 mx-2">-</span>
                                <span>{cleanTitle}</span>
                              </>
                            ) : (
                              <span>{cleanTitle}</span>
                            )}
                          </h2>

                          {isAuthor && (
                            <button
                              type="button"
                              onClick={handleStartEditTitle}
                              className="p-1 rounded-lg text-white/40 hover:text-sky-300 hover:bg-sky-500/10 border border-transparent hover:border-sky-400/30 transition-all cursor-pointer"
                              title="Alterar título da atividade (autor/administrador)"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* LINHA 2 - ETAPA (CONFORME A ETAPA QUE OCUPA) / NÚMERO */}
                <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300 mt-1">
                  <span className="font-mono font-bold text-slate-300">
                    ETAPA: {STAGES.find((s) => s.id === selectedDealForHistory.stage)?.title || "ATIVIDADE"}
                  </span>
                  <span>•</span>
                  <span className="font-mono font-bold">
                    Nº {getDealReqNumber(selectedDealForHistory, deals)}
                  </span>
                </div>

                {/* LINHA 3 - AUTOR, RESPONSÁVEL, CRIAÇÃO (Cor branca homogênea e clicável) */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
                  <p>
                    Autor:{" "}
                    <button
                      type="button"
                      onClick={(e) => handleToggleUserFilter(selectedDealForHistory.user_id, e)}
                      className="text-white font-medium hover:underline cursor-pointer uppercase"
                      title={`Filtrar por autor: ${selectedDealForHistory.creator_name || "Autor"}`}
                    >
                      {selectedDealForHistory.creator_name || "Autor"}
                    </button>
                  </p>
                  <span>•</span>
                  <p>
                    Responsável:{" "}
                    <button
                      type="button"
                      onClick={(e) => handleToggleUserFilter(selectedDealForHistory.assigned_user_id, e)}
                      className="text-white font-medium hover:underline cursor-pointer uppercase"
                      title={`Filtrar por responsável: ${selectedDealForHistory.assigned_user_name || "Responsável"}`}
                    >
                      {selectedDealForHistory.assigned_user_name || "Nenhum"}
                    </button>
                  </p>
                  <span>•</span>
                  <p>
                    Criada em: <span className="font-mono text-white/90">{new Date(selectedDealForHistory.created_at).toLocaleString("pt-BR")}</span>
                  </p>
                </div>

                {/* LINHA 4 - PRAZO */}
                {hasModalDeadline && (
                  <div className="flex items-center justify-center gap-2 mt-1">
                    {modalStyle.indicatorBadge && (
                      <span
                        title={modalStyle.hoverText}
                        className={`font-mono text-[9px] font-black px-2 py-0.5 rounded border flex items-center justify-center shadow-sm tracking-tight shrink-0 ${modalStyle.indicatorBadgeClass}`}
                      >
                        {modalStyle.indicatorBadge}
                      </span>
                    )}
                    <p className={`font-mono text-xs font-bold ${modalStyle.colorClass}`}>
                      {formatDeadlineWithWeekday(selectedDealForHistory.expected_close_date)}
                    </p>
                  </div>
                )}
              </div>

              {/* Alerta de Notificação de Tarefa Vinculada Concluída */}
              {unreadParentAlerts[selectedDealForHistory.id] && (
                <div className="shrink-0 mt-2 p-3 rounded-xl bg-emerald-950/80 border border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.2)] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-2.5 text-xs text-emerald-200">
                    <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-wider text-[11px] text-emerald-300">
                        Tarefa Vinculada Concluída!
                      </p>
                      <p className="text-white/80 text-[11px] mt-0.5">
                        Uma ou mais tarefas vinculadas a esta atividade foram finalizadas.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMarkAlertAsSeen(selectedDealForHistory.id)}
                    className="btn-ghost-neon px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider text-emerald-300 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 shrink-0 transition-all cursor-pointer shadow-sm"
                  >
                    Marcar como Visto
                  </button>
                </div>
              )}

              {/* Banner Interativo: Vínculo com Atividade Primária Clicável */}
              {(() => {
                const parentInfo = getParentDealInfo(selectedDealForHistory);
                if (!parentInfo) return null;

                const parentDeal = parentInfo.deal || deals.find((d) => d.id === parentInfo.id || getDealReqNumber(d, deals) === parentInfo.reqNumber);
                const parentCustomer = parentDeal ? getDealCustomer(parentDeal) : null;
                const parentCustomerName =
                  parentCustomer?.company_name ||
                  parentCustomer?.name ||
                  (parentDeal?.customer_name && parentDeal.customer_name !== "Uso Interno / Empresa"
                    ? parentDeal.customer_name
                    : null);

                const cleanParentTitle = getCleanDealTitle(parentInfo.title);

                return (
                  <div className="shrink-0 mt-2 p-2.5 rounded-xl bg-sky-950/70 border border-sky-400/40 flex items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-2.5 text-xs text-sky-200 min-w-0">
                      <div className="p-1 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div className="truncate">
                        <span className="text-[10px] font-black uppercase tracking-wider text-sky-400/90 block leading-none">
                          Atividade Vinculada
                        </span>
                        <span className="font-bold text-white uppercase text-xs truncate block mt-0.5">
                          {parentCustomerName && (
                            <>
                              <span className="text-sky-300 font-bold">{parentCustomerName.trim().toUpperCase()}</span>
                              <span className="text-white/60 mx-1.5">-</span>
                            </>
                          )}
                          <span>{cleanParentTitle}</span>{" "}
                          <span className="font-mono text-sky-300">(Nº {parentInfo.reqNumber})</span>
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (parentDeal) {
                          openDealHistory(parentDeal);
                        } else {
                          toast.info(`Atividade Vinculada: ${cleanParentTitle} (Nº ${parentInfo.reqNumber})`);
                        }
                      }}
                      className="btn-ghost-neon px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider text-sky-300 hover:text-white bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 shrink-0 cursor-pointer transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <span>Abrir Atividade</span>
                    </button>
                  </div>
                );
              })()}

              {/* CORPO DO MODAL: LINHA DO TEMPO EM TELA CHEIA DO CARD OU FORMULÁRIO DE DETALHES */}
              {isTimelineOpen ? (
                <div className="flex-1 min-h-0 flex flex-col space-y-3 pt-2.5 overflow-hidden animate-in fade-in duration-200">
                  <div className="shrink-0 flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sky-300">
                      <History className="h-4 w-4 text-accent" /> Linha do Tempo Completa ({dealHistoryList.length} eventos)
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsTimelineOpen(false)}
                      className="btn-ghost-neon px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-white border-white/20 hover:bg-white/10 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <span>Voltar</span>
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1.5 custom-scrollbar">
                    {historyLoading ? (
                      <p className="text-xs text-muted-foreground text-center py-12 animate-pulse">Carregando histórico completo...</p>
                    ) : dealHistoryList.length === 0 ? (
                      <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
                        <p className="text-xs text-muted-foreground/60 uppercase font-bold tracking-widest">Nenhum evento registrado ainda nesta atividade.</p>
                      </div>
                    ) : (
                      dealHistoryList.map((item) => (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1.5 text-xs shadow-inner"
                        >
                          <div className="flex items-center justify-between text-muted-foreground border-b border-white/5 pb-1">
                            <span className="font-bold text-white uppercase text-[11px] flex items-center gap-1.5">
                              <UserIcon className="h-3.5 w-3.5 text-accent" />
                              {item.user_name}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {new Date(item.created_at).toLocaleString("pt-BR")}
                            </span>
                          </div>

                          {/* Renderização Inteligente com Links Clicáveis */}
                          {renderInteractiveDescription(item.description)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col justify-between pt-2.5 gap-2.5 overflow-hidden">
                  {/* Informações do Topo */}
                  <div className="shrink-0 space-y-2">
                    {selectedDealForHistory.notes && (
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                          <div className="flex flex-wrap items-center gap-2.5 text-xs">
                            <span className="font-black uppercase tracking-widest text-accent flex items-center gap-1.5 text-xs">
                              <AlertCircle className="h-4 w-4" /> Última Atualização
                            </span>
                            <span className="text-white/30">•</span>
                            <span className="text-slate-300">
                              Autor:{" "}
                              <button
                                type="button"
                                onClick={(e) => handleToggleUserFilter(selectedDealForHistory.user_id, e)}
                                className="text-white font-bold hover:underline cursor-pointer uppercase text-xs sm:text-sm"
                                title={`Filtrar por autor: ${selectedDealForHistory.creator_name || "Autor"}`}
                              >
                                {selectedDealForHistory.creator_name || "Autor"}
                              </button>
                            </span>
                            <span className="text-white/30">•</span>
                            <span className="text-slate-300">
                              Responsável:{" "}
                              <button
                                type="button"
                                onClick={(e) => handleToggleUserFilter(selectedDealForHistory.assigned_user_id, e)}
                                className="text-white font-bold hover:underline cursor-pointer uppercase text-xs sm:text-sm"
                                title={`Filtrar por responsável: ${selectedDealForHistory.assigned_user_name || "Nenhum"}`}
                              >
                                {selectedDealForHistory.assigned_user_name || "Nenhum"}
                              </button>
                            </span>
                          </div>
                          <span className="text-xs font-mono font-bold text-sky-300 bg-sky-500/10 border border-sky-400/30 px-2.5 py-1 rounded-md flex items-center gap-1.5 shrink-0">
                            <Clock className="h-3.5 w-3.5 text-sky-400" />
                            {new Date(selectedDealForHistory.updated_at || selectedDealForHistory.created_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {(() => {
                          const notes = selectedDealForHistory.notes || "";
                          const cleanNotes = notes
                            .replace(/\[SUBTASK_LINK:.*?\]\s*/g, "")
                            .replace(/\[SUBTASK_COMPLETED:.*?\]\s*/g, "")
                            .replace(/\[PARENT_DEAL:.*?\]\s*/g, "")
                            .trim();

                          if (!cleanNotes) return null;

                          return (
                            <div className="text-sm leading-relaxed text-slate-100 font-medium">
                              {renderInteractiveDescription(cleanNotes)}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    </div>

                  {/* Formulário de Atualização Integrado */}
                  {role === "admin" || selectedDealForHistory.assigned_user_id === user?.id ? (
                    <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
                      <div className="flex-1 min-h-0 flex flex-col p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5">
                        {/* Linha Única de Ações: Tarefa Vinculada, Orçamento, Etapa e Responsável */}
                        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-white/10">
                          {/* Ações da Esquerda: Tarefa Vinculada e Orçamento (Apenas para atividades primárias) */}
                          {(() => {
                            const isSubtaskDeal =
                              selectedDealForHistory.title.toLowerCase().includes("[tarefa]") ||
                              Boolean(getParentDealInfo(selectedDealForHistory)) ||
                              Boolean(selectedDealForHistory.notes?.includes("[PARENT_DEAL:")) ||
                              Boolean(selectedDealForHistory.notes?.toLowerCase().includes("tarefa vinculada a:"));

                            if (isSubtaskDeal) {
                              return (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-sky-950/40 border border-sky-500/30 text-sky-300 text-xs font-bold">
                                  <GitFork className="h-3.5 w-3.5 text-sky-400" />
                                  <span>Tarefa Vinculada</span>
                                </div>
                              );
                            }

                            const quoteDoc = getDealQuoteFile(selectedDealForHistory, dealHistoryList);

                            return (
                              <div className="flex flex-wrap items-center gap-2">
                                {/* 1. Tarefa Vinculada */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSubtaskTitle("");
                                    setSubtaskAssignedTo("");
                                    setSubtaskDeadline("");
                                    setSubtaskNotes("");
                                    setIsSubtaskModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-300 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 transition-all cursor-pointer shadow-sm"
                                  title="Criar tarefa vinculada a esta atividade"
                                >
                                  <PlusCircle className="h-3.5 w-3.5 text-emerald-400" /> Tarefa Vinculada
                                </button>

                                {/* 2. Orçamento */}
                                <input
                                  ref={quoteFileInputRef}
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={handleUploadQuoteFile}
                                  disabled={isUploadingQuoteFile}
                                  className="hidden"
                                />
                                <button
                                  type="button"
                                  disabled={isUploadingQuoteFile}
                                  onClick={() => {
                                    if (quoteDoc) {
                                      setPreviewingQuoteFile({ url: quoteDoc.url, name: quoteDoc.name });
                                    } else {
                                      quoteFileInputRef.current?.click();
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-300 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                                  title={quoteDoc ? "Clique para visualizar o orçamento anexado" : "Clique para selecionar e anexar orçamento"}
                                >
                                  {isUploadingQuoteFile ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                                      <span>ENVIANDO ORÇAMENTO...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                                      <span>{quoteDoc ? "ORÇAMENTO ANEXADO" : "ANEXAR ORÇAMENTO"}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })()}

                          {/* Menus da Direita: Etapa e Responsável Juntos */}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* 3. Etapa: [Etapa atual / Mover] */}
                            {(() => {
                              const isInternalDeal =
                                selectedDealForHistory.title.toLowerCase().includes("[req. interna]") ||
                                selectedDealForHistory.stage === "lead";

                              const isLinkedSubtask =
                                selectedDealForHistory.title.toLowerCase().includes("[tarefa]") ||
                                Boolean(getParentDealInfo(selectedDealForHistory)) ||
                                Boolean(selectedDealForHistory.notes?.includes("[PARENT_DEAL:")) ||
                                Boolean(selectedDealForHistory.notes?.toLowerCase().includes("tarefa vinculada a:"));

                              const currentStageName = STAGES.find((s) => s.id === selectedDealForHistory.stage)?.title || selectedDealForHistory.stage;

                              if (isInternalDeal || isLinkedSubtask) {
                                return (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Etapa:</span>
                                    <span className="font-bold text-sky-400 uppercase">{currentStageName}</span>
                                  </div>
                                );
                              }

                              const curStageIndex = STAGES.findIndex((s) => s.id === (selectedDealForHistory.stage === "proposal" ? "negotiation" : selectedDealForHistory.stage));

                              // Regra: Uma atividade não pode retroceder. Um orçamento não pode passar direto para contratos ou perdidos sem ter passado por negociações.
                              const availableStages = STAGES.filter((s) => {
                                if (s.id === selectedDealForHistory.stage) return true;
                                const sIdx = STAGES.findIndex((st) => st.id === s.id);
                                if (sIdx < curStageIndex) return false; // Bloqueia retrocesso
                                if (selectedDealForHistory.stage === "qualification") {
                                  // Se está em orçamentos, só pode avançar para negociações
                                  return s.id === "negotiation";
                                }
                                if (selectedDealForHistory.stage === "negotiation" || (selectedDealForHistory.stage as string) === "proposal") {
                                  // Se está em negociações, pode ir para CONTRATOS (won) ou PERDIDOS (lost)
                                  return s.id === "won" || s.id === "lost";
                                }
                                return sIdx === curStageIndex + 1;
                              });

                              const canChangeStage =
                                role === "admin" ||
                                !selectedDealForHistory.assigned_user_id ||
                                selectedDealForHistory.assigned_user_id === user?.id ||
                                selectedDealForHistory.user_id === user?.id;

                              return (
                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Etapa:</span>
                                  {canChangeStage && availableStages.length > 1 ? (
                                    <select
                                      value={stageToMove || selectedDealForHistory.stage}
                                      onChange={(e) => {
                                        const targetStage = e.target.value as Deal["stage"];
                                        if (targetStage && targetStage !== (stageToMove || selectedDealForHistory.stage)) {
                                          if (targetStage === "negotiation") {
                                            const parentInfo = getParentDealInfo(selectedDealForHistory);
                                            const parentDeal = parentInfo?.deal || deals.find((d) => d.id === parentInfo?.id);
                                            const hasQuoteAttached = Boolean(
                                              getDealQuoteFile(selectedDealForHistory, dealHistoryList) ||
                                              (parentDeal && getDealQuoteFile(parentDeal))
                                            );
                                            if (!hasQuoteAttached) {
                                              return toast.error("Não é possível avançar para NEGOCIAÇÕES sem o orçamento anexado.");
                                            }
                                          }

                                          const fromStageName = STAGES.find((s) => s.id === (stageToMove || selectedDealForHistory.stage))?.title || selectedDealForHistory.stage;
                                          const toStageName = STAGES.find((s) => s.id === targetStage)?.title || targetStage;
                                          const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
                                          const stageLine = `${userName} alterou a etapa de "${fromStageName}" para "${toStageName}".`;
                                          
                                          // Remove alteração anterior de etapa da lista se houver e adiciona a nova
                                          setAutoGeneratedLogs((prev) => [
                                            ...prev.filter((l) => !l.includes("alterou a etapa de")),
                                            stageLine,
                                          ]);
                                          setStageToMove(targetStage);
                                        }
                                      }}
                                      className="input-futuristic rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-transparent text-accent border border-accent/40 outline-none cursor-pointer hover:border-accent"
                                    >
                                      {availableStages.map((s) => (
                                        <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                                          {s.id === (stageToMove || selectedDealForHistory.stage) ? s.title : `➔ ${s.title}`}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="font-bold text-accent uppercase">{currentStageName}</span>
                                  )}
                                </div>
                              );
                            })()}

                            {/* 4. Responsável: [Usuário] */}
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Responsável:
                              </span>
                              <select
                                value={reassignTo || selectedDealForHistory.assigned_user_id || ""}
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  setReassignTo(selectedId);
                                  const selectedMember = teamMembers.find((m) => m.id === selectedId);
                                  const newName = selectedMember?.display_name || selectedMember?.email || "Novo Responsável";
                                  const currentName = selectedDealForHistory.assigned_user_name || "Anterior";
                                  const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
                                  if (selectedId !== selectedDealForHistory.assigned_user_id) {
                                    const reassignLine = `${userName} alterou o responsável de "${currentName}" para "${newName}".`;
                                    appendAutoLog(reassignLine);
                                  }
                                }}
                                className="input-futuristic rounded px-2 py-0.5 text-xs outline-none bg-transparent font-bold border border-white/15 cursor-pointer max-w-[200px]"
                              >
                                <option value={selectedDealForHistory.assigned_user_id || ""} className="bg-slate-900">
                                  {selectedDealForHistory.assigned_user_name || "Nenhum"}
                                </option>
                                {teamMembers
                                  .filter((m) => m.id !== selectedDealForHistory.assigned_user_id)
                                  .map((m) => (
                                    <option key={m.id} value={m.id} className="bg-slate-900">
                                      {m.display_name || m.email}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* FORMULÁRIO DE ATUALIZAÇÃO SEMPRE VISÍVEL E PRONTO PARA DIGITAR */}
                        <form onSubmit={handleAddHistoryOrReassign} className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
                          {/* Bloco de Linhas Automáticas Imutáveis */}
                          {autoGeneratedLogs.length > 0 && (
                            <div className="shrink-0 space-y-1.5 p-2.5 rounded-xl bg-sky-950/30 border border-sky-500/20 max-h-[100px] overflow-y-auto custom-scrollbar">
                              {autoGeneratedLogs.map((log, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-xs font-semibold text-sky-200">
                                  <span className="text-sky-400 font-bold">•</span>
                                  <span className="select-none leading-tight">{log}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <textarea
                            placeholder="Descreva a nova atualização desta atividade..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            className="input-futuristic flex-1 min-h-[140px] w-full rounded-xl p-3.5 text-xs outline-none resize-none leading-relaxed custom-scrollbar"
                            autoFocus
                          />

                          {/* Botões de Ação */}
                          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                            {/* Ações Especiais conforme o Tipo de Atividade */}
                            {(() => {
                              const isLinkedSubtask =
                                selectedDealForHistory.title.toLowerCase().includes("[tarefa]") ||
                                Boolean(getParentDealInfo(selectedDealForHistory)) ||
                                Boolean(selectedDealForHistory.notes?.includes("[PARENT_DEAL:")) ||
                                Boolean(selectedDealForHistory.notes?.toLowerCase().includes("tarefa vinculada a:"));

                              if (isLinkedSubtask && selectedDealForHistory.stage !== "archived") {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleCompleteSubtask(selectedDealForHistory)}
                                    className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm cursor-pointer"
                                    title="Concluir e fechar esta tarefa vinculada"
                                  >
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                    <span>Concluir Tarefa</span>
                                  </button>
                                );
                              }

                              if (
                                selectedDealForHistory.title.includes("[REQ. INTERNA]") ||
                                selectedDealForHistory.stage === "lead" ||
                                selectedDealForHistory.stage === "archived"
                              ) {
                                return selectedDealForHistory.stage === "archived" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleUnarchiveDeal(selectedDealForHistory)}
                                    className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm cursor-pointer"
                                  >
                                    <ArchiveRestore className="h-4 w-4" /> Desarquivar / Restaurar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleArchiveDeal(selectedDealForHistory)}
                                    className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 border border-sky-500/30 flex items-center gap-1.5 shadow-sm cursor-pointer"
                                    title="Arquivar esta requisição interna sem excluí-la"
                                  >
                                    <Archive className="h-4 w-4" /> Arquivar
                                  </button>
                                );
                              }

                              return null;
                            })()}

                            <div className="flex items-center gap-2 ml-auto">
                              <button
                                type="submit"
                                disabled={isSavingUpdate}
                                className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 border border-sky-500/30 flex items-center gap-1.5 shadow-sm cursor-pointer"
                              >
                                <Save className="h-4 w-4 text-sky-400" />
                                <span>{isSavingUpdate ? "Gravando..." : "Atualizar"}</span>
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-3 shrink-0">
                      <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                        <Lock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-bold uppercase tracking-wider text-[11px] text-amber-300">
                          Modo de Apenas Leitura
                        </p>
                        <p className="text-white/80 mt-0.5 leading-relaxed">
                          Esta atividade foi encaminhada e está sob a responsabilidade de <strong className="text-emerald-400">{selectedDealForHistory.assigned_user_name}</strong>. Os dados não podem ser alterados até que ela retorne para sua responsabilidade.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Botão de Expansão da Linha do Tempo */}
                  <button
                    type="button"
                    onClick={() => setIsTimelineOpen(true)}
                    className="shrink-0 w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 transition-all text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-white shadow-sm"
                  >
                    <span className="flex items-center gap-2">
                      <History className="h-4 w-4 text-accent" /> Abrir Linha do Tempo
                    </span>
                    <span className="text-[10px] font-mono font-bold text-accent px-2 py-0.5 rounded bg-accent/10 border border-accent/20">
                      {dealHistoryList.length} {dealHistoryList.length === 1 ? "evento" : "eventos"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
      );
    })()}

      {/* Modal: Abertura de Requisição (Interna ou Externa) */}
      {/* Modal: Abertura de Requisição (Interna ou Externa) com Ocupação Vertical Completa */}
      {activeReqModal && (
        <div
          onClick={() => setActiveReqModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in overflow-hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-2xl rounded-2xl border border-white/15 p-5 sm:p-6 flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-gradient flex items-center gap-2">
                {activeReqModal === "interna" ? (
                  <>
                    <Building className="h-4 w-4 text-sky-400" /> Nova Tarefa
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 text-accent" /> Novo Orçamento
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setActiveReqModal(null)}
                className="btn-ghost-neon p-1.5 rounded-lg text-muted-foreground hover:text-white"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDeal} className="flex flex-col space-y-3 pt-3">
              {/* Campos do Topo */}
              <div className="space-y-3">
                {/* Título da Requisição */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    {activeReqModal === "interna" ? "Título da Tarefa" : "Título do Orçamento"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      activeReqModal === "interna"
                        ? "Ex: Orçar... Avaliar... Planejar... Verificar... Comprar... Buscar..."
                        : "Ex: Manutenção... Locação... Peças..."
                    }
                    value={newDealTitle}
                    onChange={(e) => setNewDealTitle(e.target.value.toUpperCase())}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs uppercase font-bold outline-none"
                  />
                </div>

                {/* Se for Requisição Interna -> Prazo e Direcionamento na Mesma Linha */}
                {activeReqModal === "interna" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                        Prazo para Execução
                      </label>
                      <input
                        type="date"
                        required
                        value={newDealDeadline}
                        onChange={(e) => setNewDealDeadline(e.target.value)}
                        className="input-futuristic w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                        Direcionar para Usuário Responsável
                      </label>
                      <select
                        required
                        value={newDealAssignedTo}
                        onChange={(e) => setNewDealAssignedTo(e.target.value)}
                        className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black/60"
                      >
                        <option value="">Selecione o usuário responsável</option>
                        {teamMembers.map((m) => (
                          <option key={m.id} value={m.id} className="bg-slate-900">
                            {m.display_name || m.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  /* Se for Orçamento -> Cliente, Responsável e Prazo (Opcional) */
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                        Cliente
                      </label>
                      <select
                        required
                        value={newDealCustomerId}
                        onChange={(e) => {
                          if (e.target.value === "__NEW__") {
                            setIsNewCustomerModalOpen(true);
                          } else {
                            setNewDealCustomerId(e.target.value);
                          }
                        }}
                        className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black/60 font-semibold"
                      >
                        <option value="" disabled>
                          Selecione o cliente
                        </option>
                        <option value="__NEW__" className="text-sky-300 font-bold bg-slate-900">
                          + CADASTRAR NOVO CLIENTE...
                        </option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id} className="bg-slate-900">
                            {c.company_name || c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                        Responsável
                      </label>
                      <select
                        required
                        value={newDealAssignedTo}
                        onChange={(e) => setNewDealAssignedTo(e.target.value)}
                        className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black/60"
                      >
                        <option value="">Selecione o responsável</option>
                        {teamMembers.map((m) => (
                          <option key={m.id} value={m.id} className="bg-slate-900">
                            {m.display_name || m.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                        Prazo de Envio (Opcional)
                      </label>
                      <input
                        type="date"
                        value={newDealDeadline}
                        onChange={(e) => setNewDealDeadline(e.target.value)}
                        className="input-futuristic w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* INSTRUÇÕES DA ATIVIDADE */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                  INSTRUÇÕES DA ATIVIDADE
                </label>
                <textarea
                  required
                  placeholder={
                    activeReqModal === "interna"
                      ? "Descreva detalhadamente o escopo da tarefa interna, instruções de execução, prioridades ou recomendações para o responsável..."
                      : "Descreva detalhadamente o escopo do orçamento comercial, orientações sobre o cliente, detalhes técnicos para o orçamento ou visita técnica..."
                  }
                  value={newDealNotes}
                  onChange={(e) => setNewDealNotes(e.target.value)}
                  className="input-futuristic w-full h-[120px] rounded-xl p-3.5 text-xs outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Rodapé com Botões de Ação */}
              <div className="shrink-0 flex justify-end gap-2.5 pt-3 border-t border-white/10 mt-1">
                <button
                  type="button"
                  onClick={() => setActiveReqModal(null)}
                  className="btn-ghost-neon rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-futuristic rounded-xl px-6 py-2.5 text-xs font-bold uppercase tracking-wider shadow-lg"
                >
                  Criar {activeReqModal === "interna" ? "Tarefa" : "Orçamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Fechar Contrato & Sincronizar Fluxo de Caixa */}
      {contractModalDeal && (
        <div
          onClick={() => setContractModalDeal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-md rounded-2xl border border-emerald-500/40 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 glow">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">
                  Fechar Contrato 🎉
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Integração direta com o Fluxo de Caixa
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Negócio:</span>
                <span className="font-bold text-white uppercase">{contractModalDeal.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-bold text-white">{contractModalDeal.customer_name}</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-1.5">
                <span className="text-muted-foreground">Valor Total:</span>
                <span className="font-mono font-black text-emerald-400">
                  {fmtCurrency(contractModalDeal.value)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                  Condição de Pagamento / Parcelas
                </label>
                <select
                  value={contractInstallments}
                  onChange={(e) => setContractInstallments(Number(e.target.value))}
                  className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black/60"
                >
                  <option value={1} className="bg-slate-900">À vista (1x de {fmtCurrency(contractModalDeal.value)})</option>
                  <option value={2} className="bg-slate-900">2 parcelas de {fmtCurrency(contractModalDeal.value / 2)}</option>
                  <option value={3} className="bg-slate-900">3 parcelas de {fmtCurrency(contractModalDeal.value / 3)}</option>
                  <option value={6} className="bg-slate-900">6 parcelas de {fmtCurrency(contractModalDeal.value / 6)}</option>
                  <option value={12} className="bg-slate-900">12 parcelas de {fmtCurrency(contractModalDeal.value / 12)}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                  Primeiro Vencimento
                </label>
                <input
                  type="date"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                  className="input-futuristic w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => setContractModalDeal(null)}
                className="btn-ghost-neon rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleConfirmWonContract}
                className="btn-futuristic rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                {isSyncing ? "Integrando..." : "Lançar no Financeiro"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Central de Alertas para Administradores */}
      {isAdminAlertsOpen && (
        <div
          onClick={() => setIsAdminAlertsOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-2xl rounded-2xl border border-amber-500/30 p-6 space-y-5 shadow-2xl my-8"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Bell className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                    Central de Alertas ADM
                    <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px]">
                      {totalAdminAlerts}
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Monitoramento automático de prazos ultrapassados e devoluções aos criadores
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAdminAlertsOpen(false)}
                className="btn-ghost-neon p-2 rounded-xl text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              {/* Seção 1: Prazos Ultrapassados */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> Prazos Ultrapassados ({overdueAlerts.length})
                  </h4>
                </div>

                {overdueAlerts.length === 0 ? (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-muted-foreground/60 text-center">
                    Nenhuma atividade com prazo vencido. Tudo em dia!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {overdueAlerts.map((deal) => {
                      const deadline = getDeadlineInfo(deal.expected_close_date);
                      const reqNum = getDealReqNumber(deal, deals);
                      return (
                        <div
                          key={deal.id}
                          onClick={() => {
                            setIsAdminAlertsOpen(false);
                            openDealHistory(deal);
                          }}
                          className="p-3.5 rounded-xl bg-black/70 hover:bg-black/90 border border-red-500/50 hover:border-red-400 transition-all cursor-pointer flex items-center justify-between gap-3 group shadow-md"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40">
                                Nº {reqNum}
                              </span>
                              <span className="text-xs font-black uppercase text-white truncate group-hover:text-red-300">
                                {deal.title.replace(/^\[REQ\.\s*(INTERNA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                              <span>Autor: <strong className="text-white">{deal.creator_name || "Autor"}</strong></span>
                              <span>Responsável: <strong className="text-emerald-400">{deal.assigned_user_name}</strong></span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-red-400 font-mono block">
                              {deadline.hoverText}
                            </span>
                            <span className="text-[10px] text-accent hover:underline font-bold mt-0.5 block">
                              Ver detalhes →
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Seção 2: Atividades Devolvidas ao Criador */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                    <RotateCcw className="h-4 w-4" /> Devolvidas ao Criador Original ({returnedAlerts.length})
                  </h4>
                </div>

                {returnedAlerts.length === 0 ? (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-muted-foreground/60 text-center">
                    Nenhuma devolução de atividade registrada recentemente.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {returnedAlerts.map((deal) => {
                      const reqNum = getDealReqNumber(deal, deals);
                      return (
                        <div
                          key={deal.id}
                          onClick={() => {
                            setIsAdminAlertsOpen(false);
                            openDealHistory(deal);
                          }}
                          className="p-3.5 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/40 hover:border-amber-400 transition-all cursor-pointer flex items-center justify-between gap-3 group shadow-md"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40">
                                Nº {reqNum}
                              </span>
                              <span className="text-xs font-black uppercase text-white truncate group-hover:text-amber-300">
                                {deal.title.replace(/^\[REQ\.\s*(INTERNA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                              <span>Criador & Responsável Atual: <strong className="text-emerald-400">{deal.creator_name}</strong></span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded block">
                              Devolvida ao Criador
                            </span>
                            <span className="text-[10px] text-accent hover:underline font-bold mt-1 block">
                              Ver histórico →
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Atualização Obrigatória ao Mover de Coluna */}
      {movingDealState && (
        <div
          onClick={() => setMovingDealState(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-lg rounded-2xl border border-white/15 p-6 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-black px-2.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40">
                    Nº {getDealReqNumber(movingDealState.deal, deals)}
                  </span>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Mover de Etapa
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-sm">
                  {movingDealState.deal.title.replace(/^\[REQ\.\s*(INTERNA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovingDealState(null)}
                className="btn-ghost-neon p-2 rounded-xl text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Transição de Etapa Visual */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Etapa Atual</span>
                <span className="text-xs font-black uppercase text-slate-300">
                  {STAGES.find((s) => s.id === movingDealState.deal.stage)?.title || movingDealState.deal.stage}
                </span>
              </div>
              <div className="text-accent text-base font-black">➔</div>
              <div className="space-y-0.5 text-right">
                <span className="text-[9px] font-bold uppercase tracking-widest text-accent block">Nova Etapa</span>
                <span className="text-xs font-black uppercase text-accent">
                  {STAGES.find((s) => s.id === movingDealState.targetStage)?.title || movingDealState.targetStage}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmMoveStage} className="space-y-3.5">
              {/* Descrever Atualização (Obrigatório) */}
              {/* Descrever Nova Atualização / Atividade Atual (Obrigatório) */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-1 mb-1">
                  <FileText className="h-3 w-3 text-accent" /> Descrever Nova Atualização / Atividade Atual <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  autoFocus
                  value={movingDealState.updateText}
                  onChange={(e) =>
                    setMovingDealState((prev) =>
                      prev ? { ...prev, updateText: e.target.value } : null
                    )
                  }
                  placeholder="Descreva o que foi realizado/definido nesta etapa (esta mensagem será a nova Atividade Atual)..."
                  className="input-futuristic w-full rounded-xl p-3 text-xs outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Encaminhar para outro membro (opcional) */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                  Encaminhar Responsável (Opcional)
                </label>
                <select
                  value={movingDealState.reassignTo}
                  onChange={(e) =>
                    setMovingDealState((prev) =>
                      prev ? { ...prev, reassignTo: e.target.value } : null
                    )
                  }
                  className="input-futuristic w-full rounded-xl p-2.5 text-xs outline-none"
                >
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id} className="bg-slate-900 text-white">
                      {member.display_name || member.email} {member.id === movingDealState.deal.assigned_user_id ? "(Atual)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setMovingDealState(null)}
                  className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingMove}
                  className="btn-futuristic px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-950 flex items-center gap-1.5 shadow-lg shadow-accent/20"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{isSavingMove ? "Salvando..." : "Salvar e Mover"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Repositório de Requisições Arquivadas */}
      {isArchivedModalOpen && (
        <div
          onClick={() => setIsArchivedModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-2xl border border-sky-500/30 bg-slate-950/95 p-6 space-y-5 shadow-2xl my-8 backdrop-blur-xl transition-all max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                  <FolderArchive className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                    Repositório de Atividades Arquivadas
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/40">
                      {archivedDealsList.length}
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Tarefas e orçamentos armazenados sem exclusão. Podem ser consultados ou restaurados ao quadro a qualquer momento.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsArchivedModalOpen(false)}
                className="btn-ghost-neon p-2 rounded-xl text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Campo de Busca */}
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por Nº de registro, título ou atualização..."
                value={archivedSearchTerm}
                onChange={(e) => setArchivedSearchTerm(e.target.value)}
                className="input-futuristic w-full rounded-xl px-4 py-2.5 text-xs outline-none bg-black/50"
              />
            </div>

            {/* Lista de Cards Arquivados */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[250px] max-h-[55vh]">
              {archivedDealsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-2">
                  <Archive className="h-10 w-10 text-white/20" />
                  <p className="text-xs font-semibold uppercase tracking-wider">
                    {archivedSearchTerm ? "Nenhuma atividade arquivada encontrada para a busca" : "Nenhuma atividade arquivada no momento"}
                  </p>
                </div>
              ) : (
                archivedDealsList.map((d) => (
                  <div
                    key={d.id}
                    className="p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-sky-500/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30">
                          Nº {getDealReqNumber(d, deals)}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/10">
                          {d.title.includes("[REQ. INTERNA]") || d.title.includes("[TAREFA]") || d.stage === "lead" ? "Tarefa" : "Orçamento"}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Arquivada/Atualizada em: {new Date(d.updated_at || d.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-white uppercase tracking-wide truncate">
                        {d.title.replace(/^\[REQ\.\s*(INTERNA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                      </h4>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <p>
                          Responsável: <strong className="text-emerald-400 font-medium">{d.assigned_user_name || "Não informado"}</strong>
                        </p>
                        <p>
                          Criador: <strong className="text-white/80 font-medium">{d.creator_name || "Autor"}</strong>
                        </p>
                      </div>

                      {d.notes && (
                        <p className="text-[11px] text-white/70 line-clamp-1 italic bg-black/40 px-2.5 py-1 rounded-lg border border-white/5">
                          "{d.notes}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsArchivedModalOpen(false);
                          openDealHistory(d);
                        }}
                        className="btn-ghost-neon px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-sky-300 hover:text-sky-200 border-sky-500/30 flex items-center gap-1.5"
                      >
                        <History className="h-3.5 w-3.5" /> Detalhes
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUnarchiveDeal(d)}
                        className="btn-futuristic px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md"
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" /> Restaurar
                      </button>

                      {role === "admin" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDeal(d)}
                          disabled={isDeletingDeal}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 border border-rose-500/30 transition-all"
                          title="Excluir permanentemente"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsArchivedModalOpen(false)}
                className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ficha Completa e Detalhes do Cliente */}
      {selectedCustomerForDetails && (
        <div
          onClick={() => setSelectedCustomerForDetails(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] rounded-2xl border border-sky-400/30 bg-slate-950/95 p-5 sm:p-6 shadow-2xl flex flex-col backdrop-blur-2xl transition-all text-white overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/40">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
                    {selectedCustomerForDetails.company_name || selectedCustomerForDetails.name}
                  </h3>
                  <p className="text-xs text-sky-300 font-semibold uppercase tracking-wider">
                    Ficha Completa do Cliente
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerForDetails(null)}
                className="btn-ghost-neon p-2 rounded-xl text-muted-foreground hover:text-white cursor-pointer"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Dados Cadastrais */}
            <div className="flex-1 overflow-y-auto space-y-4 py-4 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Nome da Empresa / Razão Social
                  </span>
                  <p className="text-xs font-bold text-white uppercase">
                    {selectedCustomerForDetails.company_name || "-"}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    CNPJ / CPF
                  </span>
                  <p className="text-xs font-mono font-bold text-sky-300">
                    {selectedCustomerForDetails.document || "-"}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Contato Principal
                  </span>
                  <p className="text-xs font-bold text-white uppercase">
                    {selectedCustomerForDetails.name || "-"}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    E-mail de Contato
                  </span>
                  <p className="text-xs font-mono text-slate-200 truncate">
                    {selectedCustomerForDetails.email ? (
                      <a
                        href={`mailto:${selectedCustomerForDetails.email}`}
                        className="text-sky-400 hover:underline"
                      >
                        {selectedCustomerForDetails.email}
                      </a>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Telefone / WhatsApp
                  </span>
                  <p className="text-xs font-mono text-slate-200">
                    {selectedCustomerForDetails.phone ? (
                      <a
                        href={`https://wa.me/${selectedCustomerForDetails.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-1.5"
                      >
                        <Phone className="h-3 w-3" />
                        {selectedCustomerForDetails.phone}
                      </a>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                    Status do Cliente
                  </span>
                  <p className="text-xs font-bold uppercase text-emerald-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    {selectedCustomerForDetails.status || "Ativo"}
                  </p>
                </div>
              </div>

              {/* Atividades Vinculadas a este Cliente */}
              {(() => {
                const customerDeals = deals.filter(
                  (d) =>
                    d.customer_id === selectedCustomerForDetails.id ||
                    (selectedCustomerForDetails.company_name &&
                      d.customer_name?.toUpperCase() === selectedCustomerForDetails.company_name.toUpperCase()) ||
                    (selectedCustomerForDetails.name &&
                      d.customer_name?.toUpperCase() === selectedCustomerForDetails.name.toUpperCase())
                );

                return (
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-sky-300 flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-accent" />
                        Atividades Vinculadas ({customerDeals.length})
                      </span>
                    </div>

                    {customerDeals.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-white/10 rounded-xl">
                        Nenhuma atividade vinculada a este cliente no momento.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-[30vh] overflow-y-auto custom-scrollbar pr-1">
                        {customerDeals.map((d) => (
                          <div
                            key={d.id}
                            className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between gap-2 hover:border-sky-400/40 transition-all"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white uppercase truncate">
                                {d.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                <span className="font-mono text-sky-300 font-bold">
                                  Nº {getDealReqNumber(d, deals)}
                                </span>
                                <span>•</span>
                                <span className="text-white/80 uppercase">
                                  {STAGES.find((s) => s.id === d.stage)?.title || d.stage}
                                </span>
                                <span>•</span>
                                <span className="text-muted-foreground uppercase">
                                  {d.assigned_user_name || "Sem responsável"}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomerForDetails(null);
                                openDealHistory(d);
                              }}
                              className="btn-ghost-neon px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-sky-300 hover:text-white bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 shrink-0 cursor-pointer"
                            >
                              Abrir
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-end border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setSelectedCustomerForDetails(null)}
                className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white border border-white/20 hover:bg-white/10 cursor-pointer transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Exclusivo: Cadastro de Novo Cliente */}
      {isNewCustomerModalOpen && (
        <div
          onClick={() => setIsNewCustomerModalOpen(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-xl rounded-2xl border border-sky-400/30 bg-slate-950/95 p-5 sm:p-6 shadow-2xl flex flex-col backdrop-blur-2xl transition-all text-white overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/40">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">
                    Cadastrar Novo Cliente
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Preencha os dados da empresa. O cliente será vinculado automaticamente ao formulário de orçamento.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCustomerModalOpen(false)}
                className="btn-ghost-neon p-1.5 rounded-lg text-muted-foreground hover:text-white cursor-pointer"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveNewCustomer} className="space-y-3 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Razão Social / Nome da Empresa */}
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Nome da Empresa / Razão Social <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: APEX MANUTENÇÃO E PEÇAS LTDA"
                    value={inlineCompanyName}
                    onChange={(e) => setInlineCompanyName(e.target.value.toUpperCase())}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs uppercase font-bold outline-none"
                    autoFocus
                  />
                </div>

                {/* CNPJ */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    CNPJ <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={18}
                    placeholder="00.000.000/0000-00"
                    value={inlineCustomerDoc}
                    onChange={(e) => setInlineCustomerDoc(formatCNPJ(e.target.value))}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none font-mono"
                  />
                </div>

                {/* Contato Principal */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Contato Principal <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nome do responsável"
                    value={inlineContactName}
                    onChange={(e) => setInlineContactName(e.target.value.toUpperCase())}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs uppercase font-bold outline-none"
                  />
                </div>

                {/* E-mail */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    E-mail de Contato <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="contato@empresa.com.br"
                    value={inlineCustomerEmail}
                    onChange={(e) => setInlineCustomerEmail(e.target.value.toLowerCase())}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none font-mono"
                  />
                </div>

                {/* Telefone / WhatsApp */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Telefone / WhatsApp <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={16}
                    placeholder="(00) 0 0000-0000"
                    value={inlineCustomerPhone}
                    onChange={(e) => setInlineCustomerPhone(formatPhone(e.target.value))}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none font-mono"
                  />
                </div>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setIsNewCustomerModalOpen(false)}
                  className="btn-ghost-neon rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer}
                  className="btn-futuristic rounded-xl px-5 py-2 text-xs font-bold uppercase tracking-wider shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" />
                  {isSavingCustomer ? "Cadastrando..." : "Cadastrar e Vincular"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Pré-visualização do Documento de Orçamento Oficial */}
      {previewingQuoteFile && (
        <div
          onClick={() => setPreviewingQuoteFile(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-3 sm:p-6 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl h-[90vh] rounded-2xl border border-white/20 bg-slate-950 p-4 sm:p-5 shadow-2xl flex flex-col text-white relative overflow-hidden"
          >
            {/* Header da Visualização */}
            <div className="shrink-0 flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 truncate pr-4">
                <FileCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                <span className="font-bold text-sm uppercase tracking-wider truncate text-sky-300">
                  {previewingQuoteFile.name}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href={previewingQuoteFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={previewingQuoteFile.name}
                  className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-400 hover:text-white border-emerald-500/40 hover:bg-emerald-500/20 flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Baixar arquivo original"
                >
                  <Download className="h-4 w-4" /> Download
                </a>

                <label className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-sky-400 hover:text-white border-sky-400/40 hover:bg-sky-500/20 flex items-center gap-1.5 cursor-pointer shadow-sm">
                  <UploadCloud className="h-4 w-4" />
                  <span>Substituir</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleUploadQuoteFile}
                    disabled={isUploadingQuoteFile}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={async () => {
                    await handleRemoveQuoteFile();
                    setPreviewingQuoteFile(null);
                  }}
                  className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 border-rose-500/40 flex items-center gap-1.5 cursor-pointer"
                  title="Excluir orçamento oficial"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewingQuoteFile(null)}
                  className="btn-ghost-neon p-1.5 rounded-xl text-muted-foreground hover:text-white cursor-pointer ml-1"
                  title="Fechar visualizador"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Conteúdo do Documento */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-2 mt-2 bg-black/60 rounded-xl border border-white/5 overflow-hidden">
              {previewingQuoteFile.url.includes("application/pdf") || previewingQuoteFile.name.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={previewingQuoteFile.url}
                  title={previewingQuoteFile.name}
                  className="w-full h-full rounded-lg border-0"
                />
              ) : (
                <img
                  src={previewingQuoteFile.url}
                  alt={previewingQuoteFile.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Exclusivo: Criar Tarefa Vinculada em Tela Isolada */}
      {isSubtaskModalOpen && selectedDealForHistory && (
        <div
          onClick={() => setIsSubtaskModalOpen(false)}
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-emerald-500/40 bg-slate-950/95 p-5 sm:p-6 shadow-2xl flex flex-col backdrop-blur-2xl transition-all text-white space-y-4 shadow-emerald-950/30"
          >
            {/* Header do Modal Isolado */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 truncate">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black uppercase tracking-wider text-white truncate">
                    Criar Tarefa Vinculada
                  </h3>
                  <p className="text-xs text-emerald-300 font-bold uppercase truncate mt-0.5">
                    Vinculada à: {getCleanDealTitle(selectedDealForHistory.title)} (Nº {getDealReqNumber(selectedDealForHistory, deals)})
                  </p>
                </div>
              </div>
            </div>

            {/* Formulário de Criação da Tarefa Vinculada */}
            <form onSubmit={handleCreateSubtask} className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                  Título da Tarefa <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Orçar... Avaliar... Planejar... Verificar... Comprar... Buscar..."
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value.toUpperCase())}
                  className="input-futuristic w-full rounded-xl px-3.5 py-2 text-xs uppercase font-bold outline-none"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Responsável <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={subtaskAssignedTo}
                    onChange={(e) => setSubtaskAssignedTo(e.target.value)}
                    className="input-futuristic w-full rounded-xl px-3 py-2.5 text-xs outline-none bg-black text-white cursor-pointer font-bold"
                    required
                  >
                    <option value="">Selecione o responsável...</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id} className="bg-slate-900">
                        {m.display_name || m.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Prazo de Conclusão (Opcional)
                  </label>
                  <input
                    type="date"
                    value={subtaskDeadline}
                    onChange={(e) => setSubtaskDeadline(e.target.value)}
                    className="input-futuristic w-full rounded-xl px-3 py-2.5 text-xs outline-none bg-black text-white cursor-pointer font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                  Instruções e Detalhes da Tarefa
                </label>
                <textarea
                  placeholder="Descreva as orientações, detalhes técnicos ou recomendações para o responsável executar esta tarefa..."
                  value={subtaskNotes}
                  onChange={(e) => setSubtaskNotes(e.target.value)}
                  className="input-futuristic w-full h-[120px] rounded-xl p-3.5 text-xs outline-none resize-none leading-relaxed custom-scrollbar"
                />
              </div>

              <div className="text-[10px] text-muted-foreground/80 bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                * A tarefa será criada automaticamente na mesma coluna da atividade mãe e exibirá o vínculo em seu cabeçalho.
              </div>

              {/* Botões do Rodapé */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsSubtaskModalOpen(false)}
                  className="btn-ghost-neon rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSubtask}
                  className="btn-futuristic rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <PlusCircle className="h-4 w-4" />
                  {isCreatingSubtask ? "Criando Tarefa..." : "Criar Tarefa Vinculada"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      <ProfileDialog
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={user}
      />
    </div>
  </TooltipProvider>
  );
}
