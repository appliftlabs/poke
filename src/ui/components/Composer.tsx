import { useEffect, useRef, useState } from "preact/hooks";

interface ComposerProps {
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
}

/** A textarea + submit/cancel. ⌘/Ctrl+Enter submits, Esc cancels. */
export function Composer({
  placeholder = "Leave a comment…",
  submitLabel = "Comment",
  autoFocus = true,
  onSubmit,
  onCancel,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const body = value.trim();
    if (!body) return;
    onSubmit(body);
    setValue("");
  };

  return (
    <div class="poke-card__foot">
      <textarea
        ref={ref}
        class="poke-input"
        placeholder={placeholder}
        value={value}
        onInput={(e) => setValue((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel?.();
          }
        }}
      />
      <div class={`poke-row${onCancel ? " poke-row--between" : ""}`}>
        {onCancel && (
          <button class="poke-btn poke-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          class="poke-btn poke-btn--primary"
          disabled={!value.trim()}
          onClick={submit}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
