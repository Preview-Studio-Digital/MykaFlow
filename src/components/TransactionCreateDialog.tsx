import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TransactionForm } from "./TransactionForm";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultType: "income" | "expense";
  defaultMonth: number;
  defaultYear: number;
  onMonthShift: (delta: number) => void;
  onMonthYearChange: (m: number, y: number) => void;
}

export function TransactionCreateDialog({
  isOpen,
  onClose,
  onCreated,
  defaultType,
  defaultMonth,
  defaultYear,
  onMonthShift,
  onMonthYearChange,
}: Props) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-2xl relative animate-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-[102] rounded-lg p-2 text-muted-foreground transition-all hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <TransactionForm
          onCreated={() => {
            onCreated();
            onClose();
          }}
          defaultMonth={defaultMonth}
          defaultYear={defaultYear}
          onMonthShift={onMonthShift}
          onMonthYearChange={onMonthYearChange}
          initialType={defaultType}
        />
      </div>
    </div>,
    document.body
  );
}
