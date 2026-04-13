import { useEffect } from "react";
import { toast } from "sonner";

import { copyErrorToClipboard, getActiveAdminError } from "../lib/errorFormatter";

export function useErrorCopyShortcut() {
  useEffect(() => {
    async function handleKeyDown(event) {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== "c") return;
      const error = getActiveAdminError();
      if (!error) return;
      event.preventDefault();
      try {
        await copyErrorToClipboard(error);
        console.debug("[DEBUG] admin-error-shortcut-copy", error);
        toast.success("错误信息已复制 (Ctrl+Shift+C)");
      } catch (copyError) {
        toast.error(`复制失败: ${String(copyError)}`);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
