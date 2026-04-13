import { Copy } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { Button } from "../ui";
import { copyErrorToClipboard, setActiveAdminError } from "../lib/errorFormatter";

export function ErrorCopyButton({ error, className }) {
  const handleCopy = useCallback(async () => {
    try {
      setActiveAdminError(error);
      await copyErrorToClipboard(error);
      console.debug("[DEBUG] admin-error-button-copy", error);
      toast.success("错误信息已复制到剪贴板");
    } catch (copyError) {
      toast.error(`复制失败: ${String(copyError)}`);
    }
  }, [error]);

  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={handleCopy} disabled={!error}>
      <Copy className="size-4" />
      复制错误信息
    </Button>
  );
}
