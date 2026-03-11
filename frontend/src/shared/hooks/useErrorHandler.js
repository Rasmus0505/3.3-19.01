import { useCallback, useState } from "react";
import { toast } from "sonner";

import { formatError, getErrorMessage, setActiveAdminError } from "../lib/errorFormatter";

export function useErrorHandler() {
  const [error, setErrorState] = useState(null);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const captureError = useCallback((rawError, options = {}) => {
    const formatted = rawError?.copyable ? rawError : formatError(rawError, options.context);
    setErrorState(formatted);
    setActiveAdminError(formatted);
    console.debug("[DEBUG] admin-error-captured", formatted);
    if (options.toast !== false) {
      toast.error(getErrorMessage(formatted));
    }
    return formatted;
  }, []);

  return {
    error,
    clearError,
    captureError,
  };
}
