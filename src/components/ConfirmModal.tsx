import React, { useState, useEffect } from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, X } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  onConfirmWithInput?: (value: string) => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info" | "success";
  requireKeyword?: string;
  requireKeywordPlaceholder?: string;
  isInputPrompt?: boolean;
  inputPlaceholder?: string;
  inputInitialValue?: string;
  inputLabel?: string;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  onConfirmWithInput,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
  requireKeyword,
  requireKeywordPlaceholder,
  isInputPrompt = false,
  inputPlaceholder = "Digite aqui...",
  inputInitialValue = "",
  inputLabel,
  isLoading = false,
}: ConfirmModalProps) {
  const [typedKeyword, setTypedKeyword] = useState("");
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTypedKeyword("");
      setInputValue(inputInitialValue);
    }
  }, [isOpen, inputInitialValue]);

  if (!isOpen) return null;

  const isKeywordValid = requireKeyword
    ? typedKeyword.trim() === requireKeyword.trim()
    : isInputPrompt
    ? inputValue.trim().length > 0
    : true;

  const variantStyles = {
    danger: {
      border: "border-red-500/40",
      glow: "shadow-[0_0_30px_rgba(239,68,68,0.25)]",
      iconBg: "bg-red-500/15 border-red-500/30 text-red-400",
      title: "text-red-400",
      btnConfirm:
        "bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-lg shadow-red-600/30",
      icon: <AlertTriangle className="h-6 w-6" />,
    },
    warning: {
      border: "border-amber-500/40",
      glow: "shadow-[0_0_30px_rgba(245,158,11,0.25)]",
      iconBg: "bg-amber-500/15 border-amber-500/30 text-amber-400",
      title: "text-amber-400",
      btnConfirm:
        "bg-amber-600 hover:bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-600/30",
      icon: <AlertCircle className="h-6 w-6" />,
    },
    info: {
      border: "border-sky-500/40",
      glow: "shadow-[0_0_30px_rgba(56,189,248,0.25)]",
      iconBg: "bg-sky-500/15 border-sky-500/30 text-sky-400",
      title: "text-sky-400",
      btnConfirm:
        "bg-sky-500 hover:bg-sky-400 text-slate-950 border-sky-300 shadow-lg shadow-sky-500/30 font-black",
      icon: <Info className="h-6 w-6" />,
    },
    success: {
      border: "border-emerald-500/40",
      glow: "shadow-[0_0_30px_rgba(16,185,129,0.25)]",
      iconBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
      title: "text-emerald-400",
      btnConfirm:
        "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-600/30",
      icon: <CheckCircle2 className="h-6 w-6" />,
    },
  }[variant];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl border ${variantStyles.border} bg-slate-950/95 p-6 space-y-5 ${variantStyles.glow} backdrop-blur-xl transition-all animate-in zoom-in-95 duration-150`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${variantStyles.iconBg}`}>
              {variantStyles.icon}
            </div>
            <div>
              <h3 className={`text-sm font-black uppercase tracking-wider ${variantStyles.title}`}>
                {title}
              </h3>
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">
                Confirmação do Sistema
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-ghost-neon p-1.5 rounded-lg text-muted-foreground hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mensagem / Descrição */}
        <div className="text-xs text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
          {description}
        </div>

        {/* Input de palavra-chave (se houver) */}
        {requireKeyword && (
          <div className="space-y-1.5 p-3 rounded-xl bg-black/50 border border-white/10">
            <label className="text-[10px] uppercase font-bold text-muted-foreground block">
              Digite <strong className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">{requireKeyword}</strong> para confirmar:
            </label>
            <input
              type="text"
              value={typedKeyword}
              onChange={(e) => setTypedKeyword(e.target.value)}
              placeholder={requireKeywordPlaceholder || `Digite ${requireKeyword}...`}
              className="input-futuristic w-full rounded-lg px-3 py-2 text-xs font-mono uppercase font-bold outline-none bg-black text-white"
              autoFocus
            />
          </div>
        )}

        {/* Input Prompt (para cadastrar nomes, etc) */}
        {isInputPrompt && (
          <div className="space-y-1.5 p-3 rounded-xl bg-black/50 border border-white/10">
            {inputLabel && (
              <label className="text-[10px] uppercase font-bold text-cyan-300 block">
                {inputLabel}
              </label>
            )}
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isKeywordValid && !isLoading) {
                  if (onConfirmWithInput) onConfirmWithInput(inputValue);
                  else if (onConfirm) onConfirm();
                }
              }}
              placeholder={inputPlaceholder}
              className="input-futuristic w-full rounded-lg px-3 py-2 text-xs font-bold outline-none bg-black text-white"
              autoFocus
            />
          </div>
        )}

        {/* Botões de Ação */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="btn-ghost-neon px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={() => {
              if (isKeywordValid && !isLoading) {
                if (onConfirmWithInput) onConfirmWithInput(inputValue);
                else if (onConfirm) onConfirm();
              }
            }}
            disabled={!isKeywordValid || isLoading}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
              !isKeywordValid || isLoading
                ? "opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-muted-foreground"
                : `${variantStyles.btnConfirm} hover:scale-105`
            }`}
          >
            <span>{isLoading ? "Processando..." : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
