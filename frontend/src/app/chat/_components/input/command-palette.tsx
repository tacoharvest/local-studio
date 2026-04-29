"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  GitBranch,
  Copy,
  Layers,
  GitFork,
  Cpu,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/store";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenChatSettings?: () => void;
  onOpenModelPicker?: () => void;
}

interface CommandEntry {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  run: () => void;
}

/**
 * Command palette stub — t3code visual parity. Slash commands are listed
 * (`/fork`, `/clone`, `/compact`, `/tree`, `/model`, `/settings`); only model
 * + settings actually wire to existing handlers. The rest emit a "coming soon"
 * toast. Open with Cmd/Ctrl+K, or by typing `/` at start of an empty composer
 * (handled by callers).
 */
export function CommandPalette({
  open,
  onClose,
  onOpenChatSettings,
  onOpenModelPicker,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pushToast = useAppStore((s) => s.pushToast);

  const comingSoon = (name: string) =>
    pushToast({
      kind: "info",
      title: `${name} coming soon`,
      message: "This command is part of the t3code parity roadmap.",
    });

  const commands: CommandEntry[] = useMemo(
    () => [
      {
        id: "fork",
        label: "/fork",
        description: "Branch session from this point",
        icon: GitFork,
        run: () => comingSoon("/fork"),
      },
      {
        id: "clone",
        label: "/clone",
        description: "Duplicate active branch",
        icon: Copy,
        run: () => comingSoon("/clone"),
      },
      {
        id: "compact",
        label: "/compact",
        description: "Compact session history",
        icon: Layers,
        run: () => comingSoon("/compact"),
      },
      {
        id: "tree",
        label: "/tree",
        description: "Navigate session history",
        icon: GitBranch,
        run: () => comingSoon("/tree"),
      },
      {
        id: "model",
        label: "/model",
        description: "Switch model",
        icon: Cpu,
        run: () => onOpenModelPicker?.(),
      },
      {
        id: "settings",
        label: "/settings",
        description: "Open chat settings",
        icon: SettingsIcon,
        run: () => onOpenChatSettings?.(),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOpenChatSettings, onOpenModelPicker],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\//, "");
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIdx(0);
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) {
        cmd.run();
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-(--border) bg-(--surface) shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          className="w-full px-3.5 py-2.5 bg-transparent text-[13px] text-(--fg) placeholder:text-(--dim)/50 border-b border-(--border)/40 focus:outline-none"
        />
        <ul className="max-h-[320px] overflow-y-auto py-1 scrollbar-thin">
          {filtered.length === 0 ? (
            <li className="px-3.5 py-2 text-[12px] text-(--dim)/60">No commands match.</li>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon;
              const active = i === activeIdx;
              return (
                <li key={cmd.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => {
                      cmd.run();
                      onClose();
                    }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                      active ? "bg-(--fg)/[0.05] text-(--fg)" : "text-(--dim) hover:text-(--fg)"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="font-mono text-[12px] shrink-0">{cmd.label}</span>
                    <span className="text-[11px] text-(--dim)/60 truncate ml-1">{cmd.description}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
