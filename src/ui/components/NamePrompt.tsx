import { useEffect, useRef, useState } from "preact/hooks";

interface NamePromptProps {
  /** Shown above the field, e.g. "Add your name to comment". */
  title?: string;
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  style?: { left: number; top: number };
}

/**
 * A one-field "what should we call you?" step. Appears the first time an
 * unnamed viewer tries to comment or reply; the name is remembered afterwards.
 */
export function NamePrompt({
  title = "Add your name",
  initial = "",
  onSubmit,
  onCancel,
  style,
}: NamePromptProps) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    const name = value.trim();
    if (name) onSubmit(name);
  };

  return (
    <div
      class="poke-card"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div class="poke-card__head">
        <span class="poke-card__title">{title}</span>
        <button class="poke-iconbtn" title="Cancel" onClick={onCancel}>
          ✕
        </button>
      </div>
      <div class="poke-card__foot">
        <p class="poke-note">
          Shown next to your comments. Saved in this browser so you won’t be
          asked again.
        </p>
        <input
          ref={ref}
          class="poke-input poke-input--single"
          placeholder="e.g. Sam Rivera"
          value={value}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        <div class="poke-row">
          <button
            class="poke-btn poke-btn--primary"
            disabled={!value.trim()}
            onClick={submit}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
