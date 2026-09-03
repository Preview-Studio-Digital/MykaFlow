import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { 
  ChevronLeft, 
  AtSign, 
  Search, 
  Inbox, 
  MessageSquare, 
  ExternalLink,
  Bell,
  CheckCircle2,
  CheckCheck,
  Clock,
  Send,
  User,
  UserCheck,
  FolderPlus,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

function formatElapsedLive(startedAt: string, currentMs: number = Date.now()): string {
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return "00m 00s";
  const sec = Math.max(0, Math.floor((currentMs - startMs) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mFormatted = String(m).padStart(2, "0");
  const sFormatted = String(s).padStart(2, "0");
  if (h > 0) return `${h}h ${mFormatted}m ${sFormatted}s`;
  return `${mFormatted}m ${sFormatted}s`;
}

function LiveElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => formatElapsedLive(startedAt));

  useEffect(() => {
    setElapsed(formatElapsedLive(startedAt));
    const timer = setInterval(() => {
      setElapsed(formatElapsedLive(startedAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return <>{elapsed}</>;
}

export interface TaskCompletionNotification {
  id: string;
  deal_id: string;
  deal_title: string;
  req_number: string;
  author_id: string;
  author_name: string;
  concluded_by_user_id: string;
  concluded_by_user_name: string;
  completion_notes: string;
  created_at: string;
  status: "pending_acceptance" | "accepted";
  accepted_at?: string | null;
  accepted_by_user_id?: string | null;
  accepted_by_user_name?: string | null;
}

export interface DealMentionReply {
  id: string;
  mention_id: string;
  deal_id: string;
  user_id: string;
  user_name: string;
  reply_text: string;
  created_at: string;
}

export interface DealMention {
  id: string;
  deal_id: string;
  author_id: string;
  author_name: string;
  mentioned_user_id: string;
  mentioned_user_name: string;
  content: string;
  created_at: string;
  read_by_user?: boolean;
  replies?: DealMentionReply[];
}

export interface NewTaskNotification {
  id: string;
  deal_id: string;
  deal_title: string;
  req_number: string;
  creator_id: string;
  creator_name: string;
  assigned_user_id: string;
  assigned_user_name: string;
  created_at: string;
  read_by_user: boolean;
  read_at?: string | null;
  expected_close_date?: string | null;
}

export interface MentionDeal {
  id: string;
  title: string;
  stage: string;
  notes?: string | null;
  req_number?: string | null;
  customer_name?: string | null;
  customer_id?: string | null;
  created_at?: string;
  user_id?: string | null;
  assigned_user_id?: string | null;
  expected_close_date?: string | null;
}

export function getCleanDescriptionSnippet(notes?: string | null): string {
  if (!notes) return "";
  return notes
    .replace(/\[[A-Z0-9_]+:[\s\S]*?\]/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

export function getDealNewTaskNotification(
  deal: MentionDeal | null,
  currentUserId?: string,
  teamMembers: Array<{ id: string; display_name?: string | null; email?: string }> = []
): NewTaskNotification | null {
  if (!deal || !currentUserId) return null;

  // Regra estrita: Se o próprio usuário criar uma atividade a ele mesmo, essa notificação NÃO DEVE OCORRER
  if (deal.user_id === currentUserId && deal.assigned_user_id === currentUserId) {
    return null;
  }

  // 1. Verifica se há tag explícita [NEW_TASK_NOTIFICATION:...]
  let explicitTag: any = null;
  if (deal.notes) {
    try {
      const match = deal.notes.match(/\[NEW_TASK_NOTIFICATION:(.*?)\]/);
      if (match && match[1]) {
        explicitTag = JSON.parse(match[1]);
      }
    } catch (e) {}
  }

  if (explicitTag) {
    if (explicitTag.assigned_user_id !== currentUserId) return null;
    if (explicitTag.creator_id === currentUserId) return null;

    const hasReadTag = Boolean(
      deal.notes?.includes(`[NEW_TASK_READ:{"user_id":"${currentUserId}"`) ||
      deal.notes?.includes(`"user_id":"${currentUserId}","action":"read_new_task"`)
    );

    const isRead = Boolean(explicitTag.read_by_user || hasReadTag);
    const creator = teamMembers.find((m) => m.id === explicitTag.creator_id);
    const creatorName = explicitTag.creator_name || creator?.display_name || creator?.email?.split("@")[0] || "Colega";

    return {
      id: explicitTag.id || `notif-new-task-${deal.id}`,
      deal_id: deal.id,
      deal_title: deal.title,
      req_number: deal.req_number || "",
      creator_id: explicitTag.creator_id,
      creator_name: creatorName,
      assigned_user_id: currentUserId,
      assigned_user_name: "Você",
      created_at: explicitTag.created_at || deal.created_at || new Date().toISOString(),
      read_by_user: isRead,
      read_at: explicitTag.read_at || null,
      expected_close_date: deal.expected_close_date || null,
    };
  }

  // 2. Fallback retrocompatível: atividade atribuída ao usuário por outro colega
  if (deal.assigned_user_id === currentUserId && deal.user_id && deal.user_id !== currentUserId) {
    const hasReadTag = Boolean(
      deal.notes?.includes(`[NEW_TASK_READ:{"user_id":"${currentUserId}"`) ||
      deal.notes?.includes(`"user_id":"${currentUserId}","action":"read_new_task"`)
    );

    const isArchived = deal.stage === "archived";
    const isRead = hasReadTag || isArchived;

    const creator = teamMembers.find((m) => m.id === deal.user_id);
    const creatorName = creator?.display_name || creator?.email?.split("@")[0] || "Colega";

    return {
      id: `notif-new-task-${deal.id}`,
      deal_id: deal.id,
      deal_title: deal.title,
      req_number: deal.req_number || "",
      creator_id: deal.user_id,
      creator_name: creatorName,
      assigned_user_id: currentUserId,
      assigned_user_name: "Você",
      created_at: deal.created_at || new Date().toISOString(),
      read_by_user: isRead,
      read_at: null,
      expected_close_date: deal.expected_close_date || null,
    };
  }

  return null;
}

export function getDealCompletionNotifications(deal: { notes?: string | null } | null): TaskCompletionNotification[] {
  if (!deal || !deal.notes) return [];
  const notifs: TaskCompletionNotification[] = [];
  try {
    const regex = /\[TASK_COMPLETION_NOTIFICATION:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.id && (parsed.author_id || parsed.authorId)) {
            notifs.push({
              id: parsed.id,
              deal_id: parsed.deal_id || parsed.dealId || "",
              deal_title: parsed.deal_title || parsed.dealTitle || "",
              req_number: parsed.req_number || parsed.reqNumber || "",
              author_id: parsed.author_id || parsed.authorId || "",
              author_name: parsed.author_name || parsed.authorName || "Autor",
              concluded_by_user_id: parsed.concluded_by_user_id || parsed.concludedByUserId || "",
              concluded_by_user_name: parsed.concluded_by_user_name || parsed.concludedByUserName || "Responsável",
              completion_notes: parsed.completion_notes || parsed.completionNotes || "",
              created_at: parsed.created_at || parsed.createdAt || new Date().toISOString(),
              status: parsed.status || "pending_acceptance",
              accepted_at: parsed.accepted_at || parsed.acceptedAt || null,
              accepted_by_user_id: parsed.accepted_by_user_id || parsed.acceptedByUserId || null,
              accepted_by_user_name: parsed.accepted_by_user_name || parsed.acceptedByUserName || null,
            });
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn("Erro ao fazer parse de notificações:", e);
  }
  return notifs;
}

export function isDealPendingAuthorAcceptance(deal: { notes?: string | null } | null): boolean {
  if (!deal || !deal.notes) return false;
  const notifs = getDealCompletionNotifications(deal);
  return notifs.some((n) => n.status === "pending_acceptance");
}

export function getDealMentions(deal: MentionDeal | null): DealMention[] {
  if (!deal || !deal.notes) return [];
  const mentions: DealMention[] = [];
  try {
    const regex = /\[MENTION:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.id && parsed.mentioned_user_id) {
            mentions.push(parsed);
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn("Erro ao fazer parse de menções em deal:", deal.id, e);
  }
  return mentions;
}

export function getDealMentionReplies(deal: MentionDeal | null): DealMentionReply[] {
  if (!deal || !deal.notes) return [];
  const replies: DealMentionReply[] = [];
  try {
    const regex = /\[MENTION_REPLY:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.id && parsed.mention_id) {
            replies.push(parsed);
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn("Erro ao fazer parse de respostas de menções em deal:", deal.id, e);
  }
  return replies;
}

export function getDealReqNumber(deal: MentionDeal, allDeals?: MentionDeal[]): string {
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

export function getCleanDealTitle(title: string): string {
  return (title || "")
    .replace(/^\[.*?\]\s*/, "")
    .replace(/\s*-\s*REQUISITO\s*#?[0-9.]+/i, "")
    .trim();
}

function formatSimpleDeadline(dateStr?: string | null) {
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

function getSimpleDeadlineStatus(dateStr?: string | null) {
  if (!dateStr) return { badge: null, badgeClass: "", colorClass: "text-slate-400 font-medium" };
  try {
    const cleanDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(cleanDate + "T00:00:00");
    const diffMs = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      return {
        badge: `Vencida há ${absDays} ${absDays === 1 ? "dia" : "dias"}`,
        badgeClass: "bg-red-950/90 text-red-300 border border-red-600 font-black animate-pulse rounded-md px-2 py-0.5",
        colorClass: "text-red-400 font-black animate-pulse",
      };
    }
    if (diffDays === 0) {
      return {
        badge: "HOJE",
        badgeClass: "bg-rose-950/90 text-rose-200 border border-rose-500 font-black tracking-tight animate-pulse rounded-md px-2 py-0.5",
        colorClass: "text-rose-400 font-black animate-pulse",
      };
    }
    if (diffDays <= 3) {
      return {
        badge: `${diffDays} ${diffDays === 1 ? "DIA" : "DIAS"}`,
        badgeClass: "bg-amber-950/90 text-amber-200 border border-amber-500 font-bold rounded-md px-2 py-0.5",
        colorClass: "text-amber-300 font-bold",
      };
    }
    return {
      badge: "EM DIA",
      badgeClass: "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-bold rounded-md px-2 py-0.5",
      colorClass: "text-slate-300 font-medium",
    };
  } catch {
    return { badge: null, badgeClass: "", colorClass: "text-slate-400 font-medium" };
  }
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getMentionTextForUser(
  userNameOrId: string | undefined | null,
  teamMembersList: Array<{ id: string; display_name?: string | null; email?: string }> = []
): string {
  if (!userNameOrId) return "";
  const cleanSearch = userNameOrId.replace(/^@/, "").trim().toLowerCase();
  if (!cleanSearch) return "";

  let member = teamMembersList.find((m) => m.id === userNameOrId);
  if (!member) {
    member = teamMembersList.find((m) => {
      const name = (m.display_name || "").trim().toLowerCase();
      const email = (m.email || "").trim().toLowerCase();
      const first = name.split(" ")[0];
      return name === cleanSearch || email === cleanSearch || first === cleanSearch;
    });
  }

  if (member) {
    const name = member.display_name || member.email || "";
    const firstName = name.split(" ")[0];
    return `@${firstName} `;
  }

  const firstName = cleanSearch.split(" ")[0];
  return `@${firstName} `;
}

interface InboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  deals?: MentionDeal[];
  teamMembers?: Array<{ id: string; display_name?: string | null; email?: string }>;
  onOpenDeal?: (deal: MentionDeal) => void;
  onAcceptCompletion?: (deal: MentionDeal, notificationId?: string) => Promise<void> | void;
  onMarkMentionAsRead?: (deal: MentionDeal, mentionId: string) => Promise<void> | void;
  onMarkNewTaskAsRead?: (deal: MentionDeal, notificationId: string) => Promise<void> | void;
}

export function InboxModal({
  isOpen,
  onClose,
  currentUser,
  deals: propDeals,
  teamMembers: propTeamMembers,
  onOpenDeal,
  onAcceptCompletion,
  onMarkMentionAsRead,
  onMarkNewTaskAsRead,
}: InboxModalProps) {
  const navigate = useNavigate();
  const [internalDeals, setInternalDeals] = useState<MentionDeal[]>([]);
  const [internalTeamMembers, setInternalTeamMembers] = useState<Array<{ id: string; display_name?: string | null; email?: string }>>([]);
  const teamMembers = propTeamMembers && propTeamMembers.length > 0 ? propTeamMembers : internalTeamMembers;
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [newTasksFilterTab, setNewTasksFilterTab] = useState<"all" | "unread" | "read">("unread");
  const [notifFilterTab, setNotifFilterTab] = useState<"all" | "pending" | "accepted">("pending");
  const [mentionsFilterTab, setMentionsFilterTab] = useState<"all" | "unread" | "read">("unread");
  
  // Respostas rápidas para menções
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyingToMentionId, setReplyingToMentionId] = useState<string | null>(null);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [acceptingNotifId, setAcceptingNotifId] = useState<string | null>(null);

  const deals = propDeals && propDeals.length > 0 ? propDeals : internalDeals;

  const fetchDeals = async () => {
    const { data } = await supabase
      .from("crm_deals")
      .select("id, title, stage, notes, req_number, created_at, user_id, assigned_user_id, expected_close_date, customer_id");
    if (data) {
      setInternalDeals(data as MentionDeal[]);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!propDeals || propDeals.length === 0) {
      fetchDeals();
    }
    if (!propTeamMembers || propTeamMembers.length === 0) {
      supabase.from("profiles").select("id, display_name, email").then(({ data }) => {
        if (data) setInternalTeamMembers(data);
      });
    }
  }, [isOpen, propDeals, propTeamMembers]);

  // Atividade em andamento do usuário logado (Trabalhando Ao Vivo)
  const activeDeal = useMemo(() => {
    return (deals || []).find((d) => {
      if (!d || !d.notes || !d.notes.includes("[WORK_ACTIVE:")) return false;
      try {
        const match = d.notes.match(/\[WORK_ACTIVE:(.*?)\]/);
        if (match && match[1]) {
          const parsed = JSON.parse(match[1]);
          return parsed.userId === currentUser?.id;
        }
      } catch (e) {}
      return false;
    }) || null;
  }, [deals, currentUser]);

  const activeWorkerInfo = useMemo(() => {
    if (!activeDeal?.notes) return null;
    try {
      const match = activeDeal.notes.match(/\[WORK_ACTIVE:(.*?)\]/);
      if (match && match[1]) {
        return JSON.parse(match[1]) as { userId: string; userName: string; startedAt: string };
      }
    } catch (e) {}
    return null;
  }, [activeDeal]);

  // 1. Notificações destinadas ao usuário logado (onde ele é o autor)
  const userNotificationsData = useMemo(() => {
    if (!currentUser) return { all: [], pendingCount: 0 };
    const myId = currentUser.id;
    const allNotifs: Array<{ notification: TaskCompletionNotification; deal: MentionDeal }> = [];

    deals.forEach((deal) => {
      const notifs = getDealCompletionNotifications(deal);
      notifs.forEach((n) => {
        // Se a notificação for direcionada ao usuário como autor (ou se for o criador do deal)
        if (n.author_id === myId || (!n.author_id && deal.user_id === myId)) {
          allNotifs.push({
            notification: n,
            deal,
          });
        }
      });
    });

    allNotifs.sort(
      (a, b) => new Date(b.notification.created_at).getTime() - new Date(a.notification.created_at).getTime()
    );

    const pendingCount = allNotifs.filter((item) => item.notification.status === "pending_acceptance").length;

    return {
      all: allNotifs,
      pendingCount,
    };
  }, [deals, currentUser]);

  // 2. Menções destinadas ao usuário logado
  const userMentionsData = useMemo(() => {
    if (!currentUser) return { all: [], unreadCount: 0 };
    const myId = currentUser.id;
    const allMentions: Array<{ mention: DealMention; deal: MentionDeal; replies: DealMentionReply[] }> = [];

    deals.forEach((deal) => {
      const mentions = getDealMentions(deal);
      const allReplies = getDealMentionReplies(deal);

      mentions.forEach((m) => {
        if (m.mentioned_user_id === myId) {
          const repliesForThis = allReplies.filter((r) => r.mention_id === m.id);
          allMentions.push({
            mention: m,
            deal,
            replies: repliesForThis,
          });
        }
      });
    });

    allMentions.sort(
      (a, b) => new Date(b.mention.created_at).getTime() - new Date(a.mention.created_at).getTime()
    );

    const unreadCount = allMentions.filter((item) => !item.mention.read_by_user).length;

    return {
      all: allMentions,
      unreadCount,
    };
  }, [deals, currentUser]);

  // 3. Novas Atividades destinadas ao usuário logado (criadas por colegas e atribuídas a ele)
  const userNewTasksData = useMemo(() => {
    if (!currentUser) return { all: [], unreadCount: 0 };
    const myId = currentUser.id;
    const allNewTasks: Array<{ notification: NewTaskNotification; deal: MentionDeal }> = [];

    deals.forEach((deal) => {
      const notif = getDealNewTaskNotification(deal, myId, teamMembers);
      if (notif) {
        allNewTasks.push({
          notification: notif,
          deal,
        });
      }
    });

    allNewTasks.sort(
      (a, b) => new Date(b.notification.created_at).getTime() - new Date(a.notification.created_at).getTime()
    );

    const unreadCount = allNewTasks.filter((item) => !item.notification.read_by_user).length;

    return {
      all: allNewTasks,
      unreadCount,
    };
  }, [deals, currentUser, teamMembers]);

  const handleSelectDeal = (deal: MentionDeal) => {
    onClose();
    if (onOpenDeal) {
      onOpenDeal(deal);
    } else {
      sessionStorage.setItem("mykaflow_open_deal_id", deal.id);
      navigate({ to: "/crm", search: { dealId: deal.id } as any });
    }
  };

  // Aceitar Armazenamento de Tarefa / Notificação
  const handleDirectAcceptCompletion = async (deal: MentionDeal, notification: TaskCompletionNotification) => {
    setAcceptingNotifId(notification.id);
    try {
      if (onAcceptCompletion) {
        await onAcceptCompletion(deal, notification.id);
      } else {
        const notifs = getDealCompletionNotifications(deal);
        const nowIso = new Date().toISOString();
        const userName = currentUser?.user_metadata?.display_name || currentUser?.email || "Autor";

        const updatedNotifs = notifs.map((n) =>
          n.id === notification.id
            ? {
                ...n,
                status: "accepted" as const,
                accepted_at: nowIso,
                accepted_by_user_id: currentUser?.id,
                accepted_by_user_name: userName,
              }
            : n
        );

        let cleanNotes = (deal.notes || "")
          .replace(/\[TASK_COMPLETION_NOTIFICATION:.*?\]\s*/g, "")
          .trim();
        const notifTags = updatedNotifs.map((n) => `[TASK_COMPLETION_NOTIFICATION:${JSON.stringify(n)}]`).join("\n");
        const originStage = deal.stage === "archived" ? "lead" : deal.stage;
        const originTag = (deal.notes || "").includes("<!-- ORIGIN_STAGE:") ? "" : `<!-- ORIGIN_STAGE:${originStage} -->\n`;
        const autoLog = `${userName} aceitou o armazenamento da atividade. Atividade arquivada e armazenada com sucesso.`;
        const finalNotes = `${originTag}${notifTags}\n${cleanNotes}\n\n${autoLog}`.trim();

        const { error } = await supabase
          .from("crm_deals")
          .update({
            stage: "archived",
            notes: finalNotes,
            updated_at: nowIso,
          })
          .eq("id", deal.id);

        if (error) throw error;

        try {
          await supabase.from("crm_deal_history").insert({
            deal_id: deal.id,
            user_id: currentUser?.id,
            user_name: userName,
            action_type: "completion_accepted",
            description: `Armazenamento aceito por ${userName}. Atividade arquivada e armazenada.`,
          });
        } catch (hErr) {}

        toast.success("Armazenamento aceito com sucesso! A atividade foi arquivada.");
        await fetchDeals();
      }
    } catch (err: any) {
      toast.error("Erro ao aceitar armazenamento: " + (err.message || "Tente novamente"));
    } finally {
      setAcceptingNotifId(null);
    }
  };

  // Marcar menção como lida
  const handleMarkMentionAsRead = async (deal: MentionDeal, mentionId: string) => {
    if (!currentUser) return;

    if (onMarkMentionAsRead) {
      await onMarkMentionAsRead(deal, mentionId);
      return;
    }

    const mentions = getDealMentions(deal);
    const targetMention = mentions.find((m) => m.id === mentionId);

    // Regra estrita: Somente o próprio destinatário pode marcar como lida
    if (targetMention && targetMention.mentioned_user_id !== currentUser.id) {
      toast.error("Somente o destinatário da menção pode marcá-la como lida.");
      return;
    }

    if (targetMention?.read_by_user) return;

    const updatedMentions = mentions.map((m) =>
      m.id === mentionId ? { ...m, read_by_user: true } : m
    );

    let cleanNotes = (deal.notes || "").replace(/\[MENTION:[\s\S]*?\]\s*/g, "").trim();
    const newTags = updatedMentions.map((m) => `[MENTION:${JSON.stringify(m)}]`).join("\n");
    const updatedNotes = newTags ? `${newTags}\n${cleanNotes}`.trim() : cleanNotes;

    try {
      const { error } = await supabase.from("crm_deals").update({ notes: updatedNotes }).eq("id", deal.id);
      if (error) throw error;

      setInternalDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, notes: updatedNotes } : d))
      );
      toast.success("Menção marcada como lida!");
    } catch (e: any) {
      toast.error("Erro ao marcar como lida: " + (e?.message || "Tente novamente"));
    }
  };

  // Enviar resposta rápida à menção
  const handleSendMentionReply = async (deal: MentionDeal, mention: DealMention) => {
    const text = replyText[mention.id]?.trim();
    if (!text || !currentUser) return;

    setIsSendingReply(true);
    const userName = currentUser?.user_metadata?.display_name || currentUser?.email || "Usuário";
    const nowIso = new Date().toISOString();

    const newReply: DealMentionReply = {
      id: crypto.randomUUID(),
      mention_id: mention.id,
      deal_id: deal.id,
      user_id: currentUser.id,
      user_name: userName,
      reply_text: text,
      created_at: nowIso,
    };

    // Detecta menções no texto para notificar os membros citados (inclusive o autor da menção)
    const mentionTags: string[] = [];
    teamMembers.forEach((member) => {
      const memberName = member.display_name || member.email || "";
      const firstName = memberName.split(" ")[0];
      const nameEscaped = escapeRegExp(memberName);
      const firstEscaped = escapeRegExp(firstName);
      const emailEscaped = escapeRegExp(member.email || "");
      const mentionRegex = new RegExp(`@(${nameEscaped}|${firstEscaped}|${emailEscaped})(?:$|[^A-Za-z0-9À-ÿ_])`, "i");
      if (mentionRegex.test(text)) {
        const mentionObj: DealMention = {
          id: crypto.randomUUID(),
          deal_id: deal.id,
          author_id: currentUser.id,
          author_name: userName,
          mentioned_user_id: member.id,
          mentioned_user_name: memberName,
          content: text,
          created_at: nowIso,
          read_by_user: false,
        };
        mentionTags.push(`[MENTION:${JSON.stringify(mentionObj)}]`);
      }
    });

    const replyTag = `[MENTION_REPLY:${JSON.stringify(newReply)}]`;
    const tagsBlock = mentionTags.length > 0 ? mentionTags.join("\n") + "\n" : "";
    const updatedNotes = `${replyTag}\n${tagsBlock}${deal.notes || ""}`.trim();
    const historyDesc = `↩ Resposta à atualização:\n${text}`;

    try {
      await supabase.from("crm_deals").update({ notes: updatedNotes, updated_at: nowIso }).eq("id", deal.id);
      try {
        await supabase.from("crm_deal_history").insert({
          id: newReply.id,
          deal_id: deal.id,
          user_id: currentUser.id,
          user_name: userName,
          action_type: "reply",
          description: historyDesc,
          created_at: nowIso,
        });
      } catch (hErr) {}

      // Marca como lida ao responder
      await handleMarkMentionAsRead(deal, mention.id);

      setReplyText((prev) => ({ ...prev, [mention.id]: "" }));
      setReplyingToMentionId(null);
      toast.success("Resposta enviada com sucesso!");
      await fetchDeals();
    } catch (e: any) {
      toast.error("Erro ao enviar resposta: " + e.message);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Marcar Nova Atividade como vista
  const handleMarkNewTaskAsRead = async (deal: MentionDeal, notificationId: string) => {
    if (!currentUser) return;

    if (onMarkNewTaskAsRead) {
      await onMarkNewTaskAsRead(deal, notificationId);
      return;
    }

    const notif = getDealNewTaskNotification(deal, currentUser.id, teamMembers);
    if (notif?.read_by_user) return;

    let updatedNotes = deal.notes || "";
    const nowIso = new Date().toISOString();

    if (updatedNotes.includes("[NEW_TASK_NOTIFICATION:")) {
      try {
        updatedNotes = updatedNotes.replace(/\[NEW_TASK_NOTIFICATION:(.*?)\]/g, (match, p1) => {
          try {
            const parsed = JSON.parse(p1);
            if (parsed.assigned_user_id === currentUser.id) {
              return `[NEW_TASK_NOTIFICATION:${JSON.stringify({
                ...parsed,
                read_by_user: true,
                read_at: nowIso,
              })}]`;
            }
          } catch (e) {}
          return match;
        });
      } catch (e) {}
    } else {
      const readTag = `[NEW_TASK_READ:${JSON.stringify({ user_id: currentUser.id, read_at: nowIso })}]`;
      updatedNotes = `${readTag}\n${updatedNotes}`.trim();
    }

    try {
      const { error } = await supabase.from("crm_deals").update({ notes: updatedNotes }).eq("id", deal.id);
      if (error) throw error;

      setInternalDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, notes: updatedNotes } : d))
      );
      toast.success("Atividade marcada como vista!");
    } catch (e: any) {
      toast.error("Erro ao marcar como vista: " + (e?.message || "Tente novamente"));
    }
  };

  if (!isOpen) return null;

  // Filtragem de Novas Atividades
  const filteredNewTasks = userNewTasksData.all.filter((item) => {
    if (newTasksFilterTab === "unread" && item.notification.read_by_user) return false;
    if (newTasksFilterTab === "read" && !item.notification.read_by_user) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchCreator = item.notification.creator_name?.toLowerCase().includes(term);
      const matchTitle = item.deal.title?.toLowerCase().includes(term);
      const matchReq = getDealReqNumber(item.deal, deals)?.toLowerCase().includes(term);
      const matchNotes = item.deal.notes?.toLowerCase().includes(term);
      if (!matchCreator && !matchTitle && !matchReq && !matchNotes) return false;
    }
    return true;
  });

  // Filtragem de Notificações
  const filteredNotifications = userNotificationsData.all.filter((item) => {
    if (notifFilterTab === "pending" && item.notification.status !== "pending_acceptance") return false;
    if (notifFilterTab === "accepted" && item.notification.status !== "accepted") return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchConcludedBy = item.notification.concluded_by_user_name?.toLowerCase().includes(term);
      const matchTitle = item.deal.title?.toLowerCase().includes(term);
      const matchNotes = item.notification.completion_notes?.toLowerCase().includes(term);
      const matchReq = getDealReqNumber(item.deal, deals)?.toLowerCase().includes(term);
      if (!matchConcludedBy && !matchTitle && !matchNotes && !matchReq) return false;
    }
    return true;
  });

  // Filtragem de Menções
  const filteredMentions = userMentionsData.all.filter((item) => {
    if (mentionsFilterTab === "unread" && item.mention.read_by_user) return false;
    if (mentionsFilterTab === "read" && !item.mention.read_by_user) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchAuthor = item.mention.author_name?.toLowerCase().includes(term);
      const matchTitle = item.deal.title?.toLowerCase().includes(term);
      const matchContent = item.mention.content?.toLowerCase().includes(term);
      const matchReq = getDealReqNumber(item.deal, deals)?.toLowerCase().includes(term);
      if (!matchAuthor && !matchTitle && !matchContent && !matchReq) return false;
    }
    return true;
  });

  const totalUnreadCount = 
    userNotificationsData.pendingCount + 
    userMentionsData.unreadCount + 
    userNewTasksData.unreadCount;

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-[#020617] text-white animate-in fade-in select-none overflow-hidden">
      {/* 1. Cabeçalho Superior da Página */}
      <header className="shrink-0 bg-slate-950/90 backdrop-blur-xl border-b border-sky-500/20 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost-neon h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white border-white/10 shrink-0 cursor-pointer transition-all hover:scale-105"
            title="Voltar"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Título SVG com a mesma fonte e estilo das outras páginas */}
          <div className="flex flex-col select-none justify-center focus:outline-none shrink-0">
            <svg
              className="w-[85px] sm:w-[95px] h-[26px] overflow-visible select-none drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]"
              viewBox="0 0 95 26"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <text
                x="0"
                y="21"
                className="font-saira-stencil"
                fontSize="22"
                fill="#22d3ee"
                textLength="95"
                lengthAdjust="spacing"
              >
                INBOX
              </text>
            </svg>
          </div>

          <div className="h-6 w-px bg-white/15 hidden md:block shrink-0" />

          {/* Usuário e Status de Atividade em Tempo Real */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Ícone de Usuário com status online/ativo */}
            <div
              className={`relative h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 transition-all shadow-md ${
                activeWorkerInfo
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                  : "bg-slate-900 border-white/10 text-slate-400"
              }`}
            >
              {activeWorkerInfo ? (
                <UserCheck className="h-4.5 w-4.5 text-emerald-400" />
              ) : (
                <User className="h-4.5 w-4.5 text-slate-400" />
              )}

              {/* Ponto indicador de atividade em tempo real */}
              {activeWorkerInfo && (
                <>
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-ping" />
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                </>
              )}
            </div>

            {/* Nome do Usuário e Pill de Atividade / Inatividade */}
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate leading-none">
                  {currentUser?.user_metadata?.display_name || currentUser?.email?.split("@")[0] || "Usuário"}
                </span>
                {totalUnreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-black animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)] shrink-0">
                    {totalUnreadCount} pendências
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-1">
                {activeWorkerInfo && activeDeal ? (
                  <div
                    onClick={() => {
                      if (onOpenDeal) {
                        onOpenDeal(activeDeal);
                      }
                    }}
                    className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-950/80 text-emerald-300 shadow-sm text-xs font-bold cursor-pointer hover:bg-emerald-900/80 transition-colors"
                    title="Clique para abrir detalhes da atividade em andamento"
                  >
                    <div className="flex items-center gap-2 pl-2.5 pr-2 py-0.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] shrink-0" />
                      <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-wider truncate max-w-[180px] sm:max-w-[280px] md:max-w-[400px]">
                        ATIVO EM:{" "}
                        <span className="text-white font-black">
                          {getCleanDealTitle(activeDeal.title)}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center rounded-full border border-emerald-500/50 bg-emerald-900/80 px-2.5 py-0.5 text-[10px] sm:text-[11px] text-emerald-300 font-mono font-bold shrink-0 -my-px -mr-px">
                      <LiveElapsedTimer startedAt={activeWorkerInfo.startedAt} />
                    </div>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-slate-900/90 border border-slate-700/60 px-2.5 py-0.5 rounded-full text-slate-400 text-xs font-bold font-mono">
                    <span className="h-2 w-2 rounded-full bg-slate-500 shrink-0" />
                    <span className="text-[10px] sm:text-[11px] uppercase tracking-wider">
                      INATIVO NO MOMENTO
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Pesquisa Geral */}
        <div className="relative flex-1 sm:w-80 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nº, título, responsável, autor..."
            className="w-full bg-slate-900 border border-white/15 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-cyan-400/60 font-mono transition-all"
          />
        </div>
      </header>

      {/* 2. Conteúdo Dividido em 3 Colunas: Novas Atividades | Notificações de Armazenamento | Menções */}
      <main className="flex-1 min-h-0 overflow-hidden p-3 sm:p-5 max-w-[1850px] w-full mx-auto flex flex-col">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full min-h-0 flex-1 items-stretch overflow-hidden">
          
          {/* ========================================================= */}
          {/* COLUNA 1: NOVAS ATIVIDADES ATRIBUÍDAS                     */}
          {/* ========================================================= */}
          <section className="flex flex-col h-full min-h-0 bg-slate-950/60 border border-cyan-500/25 rounded-2xl p-3.5 sm:p-4 shadow-xl shadow-cyan-950/10 space-y-3 overflow-hidden">
            {/* Header da Coluna de Novas Atividades */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-cyan-500/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                  <FolderPlus className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-cyan-300">
                      Novas Atividades
                    </h3>
                    {userNewTasksData.unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-black animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]">
                        {userNewTasksData.unreadCount} pendentes
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Atividades criadas por colegas e atribuídas a você.
                  </p>
                </div>
              </div>

              {/* Filtros Rápidos de Novas Atividades */}
              <div className="flex items-center gap-1 bg-slate-900 border border-white/10 p-1 rounded-xl font-mono text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setNewTasksFilterTab("unread")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    newTasksFilterTab === "unread"
                      ? "bg-rose-500 text-white shadow-sm"
                      : "text-rose-400 hover:text-rose-200"
                  }`}
                >
                  Pendentes ({userNewTasksData.unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setNewTasksFilterTab("read")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    newTasksFilterTab === "read"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-400 hover:text-emerald-200"
                  }`}
                >
                  Aceitas ({userNewTasksData.all.length - userNewTasksData.unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setNewTasksFilterTab("all")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    newTasksFilterTab === "all"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Todas ({userNewTasksData.all.length})
                </button>
              </div>
            </div>

            {/* Lista de Novas Atividades - ROLAGEM EXCLUSIVAMENTE INTERNA DA COLUNA */}
            <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1.5 custom-scrollbar">
              {filteredNewTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <FolderPlus className="h-8 w-8 text-cyan-400/50 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    Nenhuma nova atividade
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                    Quando um colega criar uma atividade e direcionar para você, ela aparecerá aqui.
                  </p>
                </div>
              ) : (
                filteredNewTasks.map(({ notification, deal }, idx) => {
                  const isUnread = !notification.read_by_user;
                  const reqNum = notification.req_number || getDealReqNumber(deal, deals);
                  const cleanTitle = getCleanDealTitle(deal.title);
                  const isSubtask = deal.title?.toUpperCase().includes("[TAREFA]") || Boolean(deal.notes?.includes("[PARENT_DEAL:"));
                  const cardCustomerName = deal.customer_name && deal.customer_name !== "Uso Interno / Empresa" ? deal.customer_name : null;
                  const assignedMember = teamMembers.find((m) => m.id === deal.assigned_user_id);
                  const assignedDisplayName = assignedMember?.display_name || assignedMember?.email || deal.assigned_user_name || "Você";
                  const deadlineDateStr = deal.expected_close_date || notification.expected_close_date;
                  const hasDeadline = Boolean(deadlineDateStr);
                  const deadlineText = formatSimpleDeadline(deadlineDateStr);
                  const deadlineStyle = getSimpleDeadlineStatus(deadlineDateStr);
                  const formattedCreationDate = new Date(notification.created_at || deal.created_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  });

                  return (
                    <div
                      key={notification.id || `new-task-${deal.id}-${idx}`}
                      className="flex flex-col space-y-1.5 p-2 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-cyan-500/30 transition-all shadow-md"
                    >
                      {/* O PRÓPRIO CARD REDUZIDO EXATAMENTE COMO APARECE NA TELA DE QUADROS */}
                      <div
                        onClick={() => {
                          if (isUnread) handleMarkNewTaskAsRead(deal, notification.id);
                          handleSelectDeal(deal);
                        }}
                        className={`group crm-card w-full relative rounded-xl border px-3 py-2.5 transition-all duration-200 ease-out flex flex-col justify-between h-[88px] min-h-[88px] max-h-[88px] overflow-hidden select-none cursor-pointer hover:shadow-lg shadow-sm ${
                          isUnread
                            ? "bg-slate-900 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:border-cyan-400"
                            : "bg-slate-900/90 border-white/10 hover:border-sky-500/40 shadow-black/40"
                        }`}
                        title="Clique para abrir detalhes da atividade"
                      >
                        {/* 1. Primeira Linha: Cliente - Título da Atividade */}
                        <div className="w-full min-w-0 h-[18px] flex items-center justify-between gap-1 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {isSubtask && (
                              <span className="font-mono text-[8px] font-black px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-400/40 uppercase shrink-0">
                                VINCULADA
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
                                  <span className="text-white/90">{cardCustomerName.trim().toUpperCase()}</span>
                                  <span className="opacity-70 mx-1.5">-</span>
                                  <span>{cleanTitle}</span>
                                </>
                              ) : (
                                <span>{cleanTitle}</span>
                              )}
                            </h3>
                          </div>
                          {isUnread && (
                            <span className="font-mono text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse shrink-0">
                              PENDENTE
                            </span>
                          )}
                        </div>

                        {/* 2. Segunda Linha: Registro + Responsável */}
                        <div className="w-full relative flex items-center justify-between h-[22px] min-h-[22px] max-h-[22px] gap-1.5">
                          <div className="flex items-center shrink-0">
                            <span
                              title={`Registro: ${reqNum}`}
                              className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-black/50 text-sky-300 border border-sky-400/40 tracking-wider shadow-inner flex items-center justify-center h-[20px]"
                            >
                              #{reqNum}
                            </span>
                          </div>

                          <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/50 border border-white/15 text-white h-[20px] flex items-center gap-1 max-w-[155px] ml-auto">
                            <UserCheck className="h-3 w-3 text-sky-400 shrink-0" />
                            <span className="truncate">{assignedDisplayName}</span>
                          </div>
                        </div>

                        {/* 3. Terceira Linha / Rodapé: Prazo se houver ou Data de Criação */}
                        <div className="flex items-center justify-between gap-2 text-[10px] min-w-0 h-[20px] min-h-[20px] max-h-[20px]">
                          {hasDeadline ? (
                            <div className="flex items-center gap-1.5 truncate min-w-0">
                              {deadlineStyle.badge && (
                                <span className={`font-mono text-[9px] font-black flex items-center justify-center shadow-sm tracking-tight shrink-0 ${deadlineStyle.badgeClass}`}>
                                  {deadlineStyle.badge}
                                </span>
                              )}
                              <span className={`font-mono truncate ${deadlineStyle.colorClass}`} title={deadlineText || ""}>
                                {deadlineText}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-slate-500 font-mono text-[9px]">
                              <Clock className="h-2.5 w-2.5" />
                              <span>Criada em {formattedCreationDate}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* BOTÕES ABAIXO DO CARD */}
                      <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                        <div className="flex items-center gap-1 min-w-0 text-[11px] text-slate-400 font-mono truncate">
                          <span className="text-slate-500">De:</span>
                          <span className="font-bold text-cyan-300 uppercase truncate" title={notification.creator_name}>
                            {notification.creator_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isUnread && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkNewTaskAsRead(deal, notification.id);
                              }}
                              className="btn-ghost-neon px-2.5 py-1 rounded-lg text-[11px] font-bold text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-400/60 bg-emerald-500/10 flex items-center gap-1 cursor-pointer transition-all"
                              title="Marcar como vista"
                            >
                              <CheckCheck className="h-3 w-3" />
                              <span>Marcar como Vista</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isUnread) handleMarkNewTaskAsRead(deal, notification.id);
                              handleSelectDeal(deal);
                            }}
                            className="btn-ghost-neon px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider text-slate-300 hover:text-white border border-white/15 hover:border-white/40 flex items-center gap-1 cursor-pointer transition-all"
                            title="Abrir atividade"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Ver Atividade</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* ========================================================= */}
          {/* COLUNA 2: NOTIFICAÇÕES DE ARMAZENAMENTO (ACEITE DO AUTOR) */}
          {/* ========================================================= */}
          <section className="flex flex-col h-full min-h-0 bg-slate-950/60 border border-cyan-500/25 rounded-2xl p-3.5 sm:p-4 shadow-xl shadow-cyan-950/10 space-y-3 overflow-hidden">
            {/* Header da Coluna de Notificações */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-cyan-500/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-cyan-300">
                      Notificações de Armazenamento
                    </h3>
                    {userNotificationsData.pendingCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-black animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]">
                        {userNotificationsData.pendingCount} pendentes
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Atividades criadas por você que foram armazenadas pelos responsáveis.
                  </p>
                </div>
              </div>

              {/* Filtros Rápidos de Notificações */}
              <div className="flex items-center gap-1 bg-slate-900 border border-white/10 p-1 rounded-xl font-mono text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setNotifFilterTab("pending")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    notifFilterTab === "pending"
                      ? "bg-rose-500 text-white shadow-sm"
                      : "text-rose-400 hover:text-rose-200"
                  }`}
                >
                  Pendentes ({userNotificationsData.pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifFilterTab("accepted")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    notifFilterTab === "accepted"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-400 hover:text-emerald-200"
                  }`}
                >
                  Aceitas ({userNotificationsData.all.length - userNotificationsData.pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifFilterTab("all")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    notifFilterTab === "all"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Todas ({userNotificationsData.all.length})
                </button>
              </div>
            </div>

            {/* Lista de Notificações */}
            <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1.5 custom-scrollbar">
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <CheckCircle2 className="h-8 w-8 text-cyan-400/50 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    Nenhuma notificação de armazenamento
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                    Quando um responsável atribuído armazenar uma tarefa criada por você, o aviso de aceite aparecerá aqui.
                  </p>
                </div>
              ) : (
                filteredNotifications.map(({ notification, deal }) => {
                  const isPending = notification.status === "pending_acceptance";
                  const reqNum = notification.req_number || getDealReqNumber(deal, deals);
                  const cleanTitle = (() => {
                    const notifTitle = notification.deal_title ? getCleanDealTitle(notification.deal_title) : "";
                    if (notifTitle && notifTitle.includes(" - ")) {
                      return notifTitle;
                    }
                    const custName = (deal as any)?.customer_name;
                    const baseTitle = notifTitle || getCleanDealTitle(deal.title);
                    if (custName && custName !== "Uso Interno / Empresa" && !baseTitle.startsWith(custName.toUpperCase())) {
                      return `${custName.trim().toUpperCase()} - ${baseTitle}`;
                    }
                    return baseTitle;
                  })();

                  return (
                    <div
                      key={notification.id}
                      className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col space-y-3 shadow-lg ${
                        isPending
                          ? "bg-slate-900 border-cyan-500/50 shadow-cyan-950/30 hover:border-cyan-400"
                          : "bg-slate-900/50 border-white/10 shadow-black/40 hover:border-cyan-500/30"
                      }`}
                    >
                      {/* Topo do Card de Notificação: Nº, Status e Data */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-xs font-black px-2.5 py-0.5 rounded-lg border ${
                            isPending
                              ? "bg-cyan-950/80 text-cyan-300 border-cyan-500/40"
                              : "bg-emerald-950/60 text-emerald-300 border-emerald-500/30"
                          }`}>
                            #{reqNum}
                          </span>

                          <span className={`font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                            isPending
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isPending ? "bg-rose-400" : "bg-emerald-400"}`} />
                            {isPending ? "PENDENTE" : "ACEITA"}
                          </span>
                        </div>

                        <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(notification.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Informações da Atividade e Responsável */}
                      <div className="space-y-1">
                        <p className="text-xs text-slate-300">
                          <span className="font-bold text-cyan-400 uppercase">
                            {notification.concluded_by_user_name}
                          </span>{" "}
                          armazenou a sua atividade:
                        </p>
                        <h4 className="text-sm font-black uppercase text-white tracking-wide">
                          {cleanTitle}
                        </h4>
                      </div>

                      {/* Notas de Conclusão / Comentário deixado */}
                      {notification.completion_notes && (
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs text-slate-200 italic font-sans leading-relaxed">
                          "{notification.completion_notes}"
                        </div>
                      )}

                      {/* Ações: Aceitar Conclusão e Ver Atividade */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => handleSelectDeal(deal)}
                          className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white border border-white/15 hover:border-white/40 flex items-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Ver Atividade</span>
                        </button>

                        {isPending && (
                          <button
                            type="button"
                            disabled={acceptingNotifId === notification.id}
                            onClick={() => handleDirectAcceptCompletion(deal, notification)}
                            className="px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-black bg-emerald-400 hover:bg-emerald-300 border border-emerald-300 flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-105 cursor-pointer transition-all"
                          >
                            <CheckCheck className="h-4 w-4" />
                            <span>{acceptingNotifId === notification.id ? "Aceitando..." : "Aceitar Armazenamento"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* ========================================================= */}
          {/* COLUNA DIREITA: MENÇÕES COM @ (@USUÁRIO)                  */}
          {/* ========================================================= */}
          <section className="flex flex-col h-full min-h-0 bg-slate-950/60 border border-cyan-500/25 rounded-2xl p-3.5 sm:p-4 shadow-xl shadow-cyan-950/10 space-y-3 overflow-hidden">
            {/* Header da Coluna de Menções */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-cyan-500/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                  <AtSign className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-cyan-300">
                      Menções (@)
                    </h3>
                    {userMentionsData.unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-black animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]">
                        {userMentionsData.unreadCount} pendentes
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Citações feitas por colegas nos comentários das atividades.
                  </p>
                </div>
              </div>

              {/* Filtros Rápidos de Menções */}
              <div className="flex items-center gap-1 bg-slate-900 border border-white/10 p-1 rounded-xl font-mono text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setMentionsFilterTab("unread")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    mentionsFilterTab === "unread"
                      ? "bg-rose-500 text-white shadow-sm"
                      : "text-rose-400 hover:text-rose-200"
                  }`}
                >
                  Pendentes ({userMentionsData.unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMentionsFilterTab("read")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    mentionsFilterTab === "read"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-400 hover:text-emerald-200"
                  }`}
                >
                  Aceitas ({userMentionsData.all.length - userMentionsData.unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMentionsFilterTab("all")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    mentionsFilterTab === "all"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Todas ({userMentionsData.all.length})
                </button>
              </div>
            </div>

            {/* Lista de Menções */}
            <div className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1.5 custom-scrollbar">
              {filteredMentions.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <MessageSquare className="h-8 w-8 text-cyan-400/50 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    Nenhuma menção encontrada
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                    Quando alguém citar seu @ em uma atividade, a mensagem aparecerá aqui para fácil resposta.
                  </p>
                </div>
              ) : (
                filteredMentions.map(({ mention, deal, replies }, idx) => {
                  const isUnread = !mention.read_by_user;
                  const itemNumber = userMentionsData.all.length - idx;
                  const formattedNumber = String(itemNumber).padStart(2, "0");
                  const custName = (deal as any)?.customer_name;
                  const rawCleanTitle = getCleanDealTitle(deal.title);
                  const cleanTitle =
                    custName && custName !== "Uso Interno / Empresa" && !rawCleanTitle.startsWith(custName.toUpperCase())
                      ? `${custName.trim().toUpperCase()} - ${rawCleanTitle}`
                      : rawCleanTitle;
                  const dealReqNumber = getDealReqNumber(deal, deals);
                  const isReplying = replyingToMentionId === mention.id;

                  return (
                    <div
                      key={mention.id}
                      className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col space-y-3 shadow-lg ${
                        isUnread
                          ? "bg-slate-900 border-cyan-500/50 shadow-cyan-950/20 hover:border-cyan-400"
                          : "bg-slate-900/50 border-white/10 shadow-black/40 hover:border-cyan-500/30"
                      }`}
                    >
                      {/* Topo do Card de Menção */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-xs font-black px-2 py-0.5 rounded-lg border ${
                            isUnread
                              ? "bg-cyan-950/80 text-cyan-300 border-cyan-500/40"
                              : "bg-slate-800 text-slate-300 border-white/10"
                          }`}>
                            #{formattedNumber}
                          </span>

                          <span className={`font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                            isUnread
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isUnread ? "bg-rose-400" : "bg-emerald-400"}`} />
                            {isUnread ? "PENDENTE" : "ACEITA"}
                          </span>
                        </div>

                        <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(mention.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Informações da Mensagem e Atividade */}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-black uppercase font-mono text-cyan-400">
                            @{mention.author_name}
                          </span>
                          <span className="text-muted-foreground">citou você em</span>
                          <span className="font-bold text-white uppercase truncate max-w-full">
                            #{dealReqNumber} - {cleanTitle}
                          </span>
                        </div>

                        {/* Conteúdo da Mensagem Citada */}
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs text-slate-200 font-sans leading-relaxed">
                          "{mention.content}"
                        </div>
                      </div>

                      {/* Respostas Anteriores */}
                      {replies && replies.length > 0 && (
                        <div className="space-y-1.5 pl-3 border-l-2 border-cyan-500/30">
                          {replies.map((rep) => (
                            <div key={rep.id} className="text-[11px] text-slate-300">
                              <span className="font-bold text-cyan-300">{rep.user_name}:</span> {rep.reply_text}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Campo de Resposta Rápida Aberto */}
                      {isReplying && (
                        <div className="space-y-2 pt-2 border-t border-white/10 animate-in fade-in">
                          <textarea
                            value={replyText[mention.id] || ""}
                            onChange={(e) => setReplyText({ ...replyText, [mention.id]: e.target.value })}
                            placeholder={`Responder para @${mention.author_name}...`}
                            rows={2}
                            className="w-full bg-slate-900 border border-cyan-400/40 rounded-xl p-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-cyan-400 font-sans resize-none"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setReplyingToMentionId(null)}
                              className="px-3 py-1 rounded-lg text-xs text-muted-foreground hover:text-white"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={isSendingReply || !replyText[mention.id]?.trim()}
                              onClick={() => handleSendMentionReply(deal, mention)}
                              className="px-3 py-1 rounded-lg text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Send className="h-3 w-3" />
                              <span>Enviar Resposta</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ações da Menção */}
                      {!isReplying && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                          {isUnread && (
                            <button
                              type="button"
                              onClick={() => handleMarkMentionAsRead(deal, mention.id)}
                              className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 flex items-center gap-1 cursor-pointer"
                              title="Marcar como aceita"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              <span>Marcar como Aceita</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const authorMention = getMentionTextForUser(mention.author_name || mention.author_id, teamMembers);
                              setReplyText((prev) => ({
                                ...prev,
                                [mention.id]: prev[mention.id] || authorMention,
                              }));
                              setReplyingToMentionId(mention.id);
                            }}
                            className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold text-cyan-400 hover:text-white border border-cyan-500/30 flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>Responder</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (isUnread) handleMarkMentionAsRead(deal, mention.id);
                              handleSelectDeal(deal);
                            }}
                            className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white border border-white/15 hover:border-white/40 flex items-center gap-1.5 cursor-pointer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Ver Atividade</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
