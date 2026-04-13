import { useCallback, useEffect, useState } from "react";
import { parseResponse, toErrorText } from "../../shared/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui";
import { Button } from "../../shared/ui";
import { Loader2, AlertCircle } from "lucide-react";

export function TranslationDialog({
  open,
  onClose,
  text,
  apiCall,
}) {
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && text) {
      void translateText(text);
    }
  }, [open, text]);

  const translateText = useCallback(async (textToTranslate) => {
    setLoading(true);
    setError(null);
    setTranslation("");
    try {
      const resp = await apiCall("/api/wordbook/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToTranslate }),
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        setError(toErrorText(data, "翻译失败"));
        return;
      }
      setTranslation(data.translation || "");
    } catch (err) {
      setError(`网络错误: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const handleRetry = useCallback(() => {
    if (text) {
      void translateText(text);
    }
  }, [text, translateText]);

  const handleClose = useCallback(() => {
    setTranslation("");
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>局部翻译</DialogTitle>
          <DialogDescription>
            对选中的内容进行即时翻译
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Original text */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">原文</p>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm">{text}</p>
            </div>
          </div>

          {/* Translation result */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">翻译</p>
            {loading ? (
              <div className="flex items-center justify-center rounded-lg border bg-muted/30 p-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">翻译中...</span>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 mt-0.5 text-destructive shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRetry}
                      className="h-7 text-xs"
                    >
                      重试
                    </Button>
                  </div>
                </div>
              </div>
            ) : translation ? (
              <div className="rounded-lg border bg-primary/5 p-3">
                <p className="text-sm">{translation}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">暂无翻译结果</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
