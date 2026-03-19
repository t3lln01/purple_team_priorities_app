import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { SortDir } from "@/hooks/useSortTable";

interface Props {
  children: React.ReactNode;
  col: string;
  sortKey: string | null;
  sortDir: SortDir;
  toggle: (key: string) => void;
  className?: string;
  align?: "left" | "center" | "right";
}

export default function SortableTh({
  children,
  col,
  sortKey,
  sortDir,
  toggle,
  className = "",
  align = "left",
}: Props) {
  const active = sortKey === col;
  const alignClass =
    align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";

  return (
    <th
      className={`px-4 py-2.5 text-xs text-muted-foreground font-medium cursor-pointer select-none group whitespace-nowrap hover:text-foreground transition-colors ${className}`}
      onClick={() => toggle(col)}
    >
      <div className={`flex items-center gap-1 ${alignClass}`}>
        {children}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="w-3 h-3 text-primary flex-shrink-0" />
          ) : (
            <ArrowDown className="w-3 h-3 text-primary flex-shrink-0" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 flex-shrink-0 transition-opacity" />
        )}
      </div>
    </th>
  );
}
