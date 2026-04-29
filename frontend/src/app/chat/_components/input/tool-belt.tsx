// CRITICAL
"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AttachmentsPreview } from "./attachments-preview";
import { RecordingIndicator } from "./recording-indicator";
import { TranscriptionStatus } from "./transcription-status";
import { CallModeIndicator } from "./call-mode-indicator";
import { CommandPalette } from "./command-palette";
import { useAppStore } from "@/store";
import { useShallow } from "zustand/react/shallow";
import { ToolBeltToolbarContainer } from "./tool-belt/tool-belt-toolbar-container";
import { useComposerHeightCssVar } from "./tool-belt/use-composer-height-css-var";
import { useAutosizeTextarea } from "./tool-belt/use-autosize-textarea";
import { useAttachmentInputs } from "./tool-belt/use-attachment-inputs";
import { useAudioRecording } from "./tool-belt/use-audio-recording";
import { clearAttachmentUrls, formatDuration, formatFileSize } from "./tool-belt/utils";
import type { ToolBeltProps } from "./tool-belt/types";

export function ToolBelt({
  onSubmit,
  isLoading,
  placeholder = "Message...",
  onStop,
  onOpenResults,
  selectedModel,
  availableModels = [],
  onModelChange,
  toolsEnabled = false,
  onToolsToggle,
  artifactsEnabled = false,
  onArtifactsToggle,
  onOpenChatSettings,
  hasSystemPrompt = false,
  deepResearchEnabled = false,
  onDeepResearchToggle,
  planDrawer,
  callModeEnabled = false,
  onCallModeToggle,
  contextStats,
  onOpenContext,
}: ToolBeltProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isDisabled = false;
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Cmd/Ctrl+K opens the command palette (t3code parity).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const {
    value,
    setInput,
    queuedContext,
    setQueuedContext,
    attachments,
    setAttachments,
    updateAttachments,
    isRecording,
    setIsRecording,
    isTranscribing,
    setIsTranscribing,
    transcriptionError,
    setTranscriptionError,
    recordingDuration,
    setRecordingDuration,
    isTTSEnabled,
    setIsTTSEnabled,
    callModeSpeakingMessageId,
  } = useAppStore(
    useShallow((state) => ({
      value: state.input,
      setInput: state.setInput,
      queuedContext: state.queuedContext,
      setQueuedContext: state.setQueuedContext,
      attachments: state.attachments,
      setAttachments: state.setAttachments,
      updateAttachments: state.updateAttachments,
      isRecording: state.isRecording,
      setIsRecording: state.setIsRecording,
      isTranscribing: state.isTranscribing,
      setIsTranscribing: state.setIsTranscribing,
      transcriptionError: state.transcriptionError,
      setTranscriptionError: state.setTranscriptionError,
      recordingDuration: state.recordingDuration,
      setRecordingDuration: state.setRecordingDuration,
      isTTSEnabled: state.isTTSEnabled,
      setIsTTSEnabled: state.setIsTTSEnabled,
      callModeSpeakingMessageId: state.callModeSpeakingMessageId,
    })),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When loading ends, move any queued text into the real input so the user
  // can immediately send it instead of losing their typed message.
  const prevLoadingRef = useRef(isLoading);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      const queued = useAppStore.getState().queuedContext;
      if (queued) {
        setInput(queued);
        setQueuedContext("");
      }
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, setInput, setQueuedContext]);

  // Keep the transcript from disappearing under the fixed mobile composer by exposing its height as a CSS var.
  useComposerHeightCssVar(rootRef);
  useAutosizeTextarea({ textareaRef, value, isLoading, queuedContext });

  const {
    fileInputRef,
    imageInputRef,
    handleFileInputChange,
    handleImageInputChange,
    removeAttachment,
    handleAttachFile,
    handleAttachImage,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    isDragOver,
  } = useAttachmentInputs({ updateAttachments });

  const { startRecording, stopRecording } = useAudioRecording({
    textareaRef,
    isRecording,
    setIsRecording,
    setRecordingDuration,
    setIsTranscribing,
    setTranscriptionError,
    setInput,
    getCurrentInput: () => useAppStore.getState().input,
    getRecordingDuration: () => useAppStore.getState().recordingDuration,
  });

  const handleTTSToggle = useCallback(() => {
    const current = useAppStore.getState().isTTSEnabled;
    setIsTTSEnabled(!current);
  }, [setIsTTSEnabled]);

  const handleDismissTranscriptionError = useCallback(() => {
    setTranscriptionError(null);
  }, [setTranscriptionError]);

  const handleTextChange = useCallback(
    (nextValue: string) => {
      if (isLoading) setQueuedContext(nextValue);
      else setInput(nextValue);
    },
    [isLoading, setInput, setQueuedContext],
  );

  const handleSubmit = useCallback(async () => {
    if (isLoading) return;
    const state = useAppStore.getState();
    const inputValue = state.input;
    const currentAttachments = state.attachments;
    if (!inputValue.trim() && currentAttachments.length === 0) return;

    try {
      await Promise.resolve(
        onSubmit(inputValue, currentAttachments.length > 0 ? [...currentAttachments] : undefined),
      );
    } catch (err) {
      console.error("Failed to send message:", err);
      return;
    }

    clearAttachmentUrls(currentAttachments);
    setAttachments([]);
  }, [isLoading, onSubmit, setAttachments]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // `/` at start of an empty composer opens the command palette.
      if (e.key === "/" && !value && !isLoading) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, value, isLoading],
  );

  const canSend = value.trim().length > 0 || attachments.length > 0;

  return (
    <div ref={rootRef} className="px-3 md:px-4">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenChatSettings={onOpenChatSettings}
      />
      <div className="w-full max-w-none md:max-w-3xl md:mx-auto">
        <AttachmentsPreview
          attachments={attachments}
          onRemove={removeAttachment}
          formatFileSize={formatFileSize}
        />

        {isRecording && (
          <RecordingIndicator
            duration={recordingDuration}
            onStop={callModeEnabled ? (onCallModeToggle ?? stopRecording) : stopRecording}
            formatDuration={formatDuration}
          />
        )}

        {callModeEnabled && !isRecording && !isTranscribing && (
          <CallModeIndicator
            isSpeaking={callModeSpeakingMessageId !== null}
            onDisable={onCallModeToggle ?? (() => {})}
          />
        )}

        <TranscriptionStatus
          isTranscribing={isTranscribing}
          error={transcriptionError}
          onDismissError={handleDismissTranscriptionError}
        />

        {planDrawer ? <div className="hidden md:block mb-2">{planDrawer}</div> : null}

        <div
          className={`relative flex flex-col bg-(--surface) rounded-lg transition-colors border ${
            isDragOver
              ? "border-(--accent)/60 ring-1 ring-(--accent)/20"
              : isLoading
                ? "border-(--border) ring-1 ring-(--accent)/10"
                : "border-(--border)/60 focus-within:border-(--border) hover:border-(--border)"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-(--accent)/10 pointer-events-none">
              <span className="text-sm font-medium text-(--accent)">Drop files here</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={isLoading ? queuedContext : value}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isDisabled
                ? "No model running"
                : isLoading
                  ? "Type here to queue for next message..."
                  : placeholder
            }
            disabled={isDisabled}
            rows={1}
            className="w-full px-3 py-2.5 md:px-3.5 md:py-2.5 bg-transparent text-[13px] resize-none focus:outline-none disabled:opacity-50 placeholder:text-(--dim)/50 overflow-y-hidden min-h-[40px]"
            style={{ lineHeight: "1.5" }}
          />

          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInputChange}
            className="hidden"
            multiple
            accept="*/*"
          />
          <input
            ref={imageInputRef}
            type="file"
            onChange={handleImageInputChange}
            className="hidden"
            multiple
            accept="image/*"
          />

          <ToolBeltToolbarContainer
            isLoading={isLoading}
            recording={{ isRecording, isTranscribing, onStart: startRecording, onStop: stopRecording }}
            attachmentsCount={attachments.length}
            disabled={isDisabled}
            canSend={canSend}
            hasSystemPrompt={hasSystemPrompt}
            toolsEnabled={toolsEnabled}
            artifactsEnabled={artifactsEnabled}
            deepResearchEnabled={deepResearchEnabled}
            isTTSEnabled={isTTSEnabled}
            onOpenResults={onOpenResults}
            availableModels={availableModels}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            onOpenChatSettings={onOpenChatSettings}
            onToolsToggle={onToolsToggle}
            onArtifactsToggle={onArtifactsToggle}
            onDeepResearchToggle={onDeepResearchToggle}
            onTTSToggle={handleTTSToggle}
            onAttachFile={handleAttachFile}
            onAttachImage={handleAttachImage}
            onStop={onStop}
            onSubmit={handleSubmit}
            callModeEnabled={callModeEnabled}
            onCallModeToggle={onCallModeToggle}
            contextStats={contextStats}
            onOpenContext={onOpenContext}
          />
        </div>
      </div>
    </div>
  );
}
