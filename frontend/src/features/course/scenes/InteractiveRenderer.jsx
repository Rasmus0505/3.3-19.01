/**
 * InteractiveRenderer — Renders AI-generated HTML in a sandboxed iframe.
 */
import { useState } from "react";
import { Card } from "../../../components/ui/card";
import { MousePointer, AlertCircle, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "../../../components/ui/button";

export function InteractiveRenderer({ scene }) {
  const content = scene.content || {};
  const html = content.html || "";
  const instructions = content.instructions || "";
  const activityType = content.activity_type || "";
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!html) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Card className="p-8 text-center">
          <MousePointer className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Interactive Activity</h2>
          <p className="text-muted-foreground">Activity is being generated...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-background" : "h-full flex flex-col"}>
      {/* Header */}
      {!isFullscreen && (
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
              <MousePointer className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium">{scene.title || "Interactive Activity"}</h3>
              {instructions && <p className="text-xs text-muted-foreground">{instructions}</p>}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {/* Iframe */}
      <div className="flex-1 relative">
        <iframe
          srcDoc={html}
          sandbox="allow-scripts"
          className="w-full h-full border-0"
          title={scene.title || "Interactive Activity"}
        />
      </div>
    </div>
  );
}
