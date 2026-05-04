// 余额与消耗预估提示组件。

import { cn } from "../../../lib/utils";
import { Alert, AlertDescription } from "../../../shared/ui";

interface UploadBalanceAlertProps {
  surfaceClassName: string;
  balanceText: string;
  estimatedChargeText: string;
  contentDescription: string;
  zhTranslationHint: string | null;
  costHint: string | null;
  billingEnabled: boolean;
  billingStatus: string;
  billingMessage: string;
  recoverableTextClassName: string;
}

export function UploadBalanceAlert({
  surfaceClassName,
  balanceText,
  estimatedChargeText,
  contentDescription,
  zhTranslationHint,
  costHint,
  billingEnabled,
  billingStatus,
  billingMessage,
  recoverableTextClassName,
}: UploadBalanceAlertProps) {
  return (
    <Alert className={cn("border", surfaceClassName)}>
      <AlertDescription>
        <p className="text-muted-foreground">余额：{balanceText}</p>
        <p className="text-muted-foreground">预估消耗：{estimatedChargeText}</p>
        <p className="text-xs text-muted-foreground">{contentDescription}</p>
        {zhTranslationHint ? (
          <p className="text-xs text-muted-foreground">{zhTranslationHint}</p>
        ) : null}
        {costHint ? <p className="text-xs text-muted-foreground">{costHint}</p> : null}
        {billingEnabled && billingMessage ? (
          <p
            className={cn(
              "text-xs",
              billingStatus === "insufficient" ||
                billingStatus === "offline" ||
                billingStatus === "error"
                ? recoverableTextClassName
                : "text-muted-foreground",
            )}
          >
            {billingMessage}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
