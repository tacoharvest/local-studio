"use client";

import { useState, type ReactNode } from "react";
import { Square } from "lucide-react";
import { Button, UiModal, UiModalHeader } from "@/components/ui-kit";

type StopTriggerArgs = {
  open: () => void;
  stopping: boolean;
};

type ModelStopConfirmProps = {
  trigger: (args: StopTriggerArgs) => ReactNode;
  onStop: () => Promise<void> | void;
};

export function ModelStopConfirm({ trigger, onStop }: ModelStopConfirmProps) {
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmStop = async () => {
    setStopping(true);
    setError(null);
    try {
      await onStop();
      setOpen(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setStopping(false);
    }
  };

  return (
    <>
      {trigger({
        open: () => {
          setError(null);
          setOpen(true);
        },
        stopping,
      })}
      <UiModal isOpen={open} onClose={() => !stopping && setOpen(false)} maxWidth="max-w-sm">
        <UiModalHeader
          title="Stop model?"
          icon={<Square className="h-4 w-4 text-(--err)" fill="currentColor" />}
          onClose={() => !stopping && setOpen(false)}
        />
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm leading-6 text-(--dim)">
            This will stop the active inference process and free the GPU lease.
          </p>
          {error && (
            <div className="border border-(--err)/40 bg-(--err)/10 px-3 py-2 text-sm text-(--err)">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={stopping}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmStop} disabled={stopping}>
              {stopping ? "Stopping..." : "Stop model"}
            </Button>
          </div>
        </div>
      </UiModal>
    </>
  );
}
