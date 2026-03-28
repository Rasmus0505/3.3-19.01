import { useEffect, useState } from "react";

import { cn } from "../../lib/utils";

function toInputTextValue(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

export function Input({ className, type = "text", value, defaultValue, onChange, onFocus, onBlur, ...props }) {
  const isNumberInput = type === "number";
  const [draftValue, setDraftValue] = useState(() => toInputTextValue(value ?? defaultValue));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isNumberInput || isFocused) return;
    setDraftValue(toInputTextValue(value));
  }, [isFocused, isNumberInput, value]);

  if (!isNumberInput) {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          "cn-input file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        {...props}
      />
    );
  }

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "cn-input file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      value={value !== undefined ? (isFocused ? draftValue : toInputTextValue(value)) : draftValue}
      defaultValue={undefined}
      onChange={(event) => {
        setDraftValue(event.target.value);
        onChange?.(event);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        setDraftValue(event.target.value);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        setDraftValue(value !== undefined ? toInputTextValue(value) : event.target.value);
        onBlur?.(event);
      }}
      {...props}
    />
  );
}
