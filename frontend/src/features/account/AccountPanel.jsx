import { Bell, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CircleUserRound, Save } from "lucide-react";
import { toast } from "sonner";

import { writeStoredUser, writeCollinsLevel } from "../../app/authStorage";
import { parseResponse, toErrorText } from "../../shared/api/client";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, RadioGroup, RadioGroupItem, ScrollArea } from "../../shared/ui";
import { useAppStore } from "../../store";
import { RedeemCodePanel } from "../wallet/components/RedeemCodePanel";
import { addAutoDisplayEntry as addAutoEntry, readLearningSettings, removeAutoDisplayEntry as removeAutoEntry } from "../../features/immersive/learningSettings";

function formatDate(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch (_) {
    return "";
  }
}

const COLLINS_LEVELS = [
  { value: 5, label: "5 星", description: "最常见、最基础的词。更适合刚起步的学习者。" },
  { value: 4, label: "4 星", description: "高频常用词。适合已经掌握 5 星词后继续扩展。" },
  { value: 3, label: "3 星", description: "常见但开始有一定门槛，适合作为中间层。" },
  { value: 2, label: "2 星", description: "偏进阶词。通常会明显更有挑战。" },
  { value: 1, label: "1 星", description: "相对更难、更不常见的词。" },
];

export function AccountPanel({ apiCall, currentUser, onWalletChanged }) {
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const collinsLevel = useAppStore((state) => state.collinsLevel);
  const setCollinsLevel = useAppStore((state) => state.setCollinsLevel);
  const [username, setUsername] = useState(currentUser?.username || "");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [changelogItems, setChangelogItems] = useState([]);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());

  useEffect(() => {
    setUsername(currentUser?.username || "");
  }, [currentUser?.username]);

  // Fetch changelog announcements
  useEffect(() => {
    let canceled = false;
    async function loadChangelog() {
      setChangelogLoading(true);
      try {
        const resp = await apiCall("/api/announcements/active", {});
        if (canceled) return;
        if (resp.ok) {
          const data = await resp.json();
          if (!canceled && Array.isArray(data)) {
            const sorted = data
              .filter((a) => a.type === "changelog")
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setChangelogItems(sorted);
          }
        }
      } catch (_) {
        // Silently ignore — changelog is non-critical.
      } finally {
        if (!canceled) setChangelogLoading(false);
      }
    }
    void loadChangelog();
    return () => {
      canceled = true;
    };
  }, [apiCall]);

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRename(event) {
    event.preventDefault();
    if (!username.trim()) {
      setStatus("请输入新的用户名");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const resp = await apiCall("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, "更新用户名失败");
        setStatus(message);
        toast.error(message);
        return;
      }
      writeStoredUser(data);
      setCurrentUser(data);
      setUsername(String(data?.username || ""));
      setStatus("用户名已更新");
      toast.success("用户名已更新");
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCollinsLevelChange(newLevel) {
    try {
      const resp = await apiCall("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser?.username, collins_level: Number(newLevel) }),
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        toast.error(toErrorText(data, "更新 Collins 等级失败"));
        return;
      }
      setCollinsLevel(Number(newLevel));
      writeCollinsLevel(Number(newLevel));
      toast.success("Collins 等级已更新");
    } catch (error) {
      toast.error(`网络错误: ${String(error)}`);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleUserRound className="size-4" />
            个人中心
          </CardTitle>
          <CardDescription>这里统一管理用户名、登录身份和兑换码充值，不再单独拆分账户入口。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border bg-muted/10 px-4 py-3">
              <p className="text-xs text-muted-foreground">当前用户名</p>
              <p className="mt-1 text-sm font-medium">{currentUser?.username || "未设置"}</p>
            </div>
            <div className="rounded-2xl border bg-muted/10 px-4 py-3">
              <p className="text-xs text-muted-foreground">登录邮箱</p>
              <p className="mt-1 text-sm font-medium">{currentUser?.email || "未读取到邮箱"}</p>
            </div>
          </div>

          <form className="space-y-3" onSubmit={handleRename}>
            <div className="space-y-2">
              <p className="text-sm font-medium">修改用户名</p>
              <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="例如 Unlock Anything Learner" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading} className="h-9 px-4">
                <Save className="size-4" />
                {loading ? "保存中..." : "保存用户名"}
              </Button>
            </div>
          </form>

          {status ? (
            <Alert>
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {/* Collins Level Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">学习词汇等级</CardTitle>
          <CardDescription>设置你当前适合的 Collins 星级，影响 i+1 绿色和高难红色下划线。</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={String(collinsLevel)}
            onValueChange={(value) => handleCollinsLevelChange(Number(value))}
            className="grid grid-cols-1 gap-2"
          >
            {COLLINS_LEVELS.map((level) => (
              <div
                key={level.value}
                className="flex items-start gap-3 rounded-xl border p-3 hover:bg-muted/40 transition-colors"
              >
                <RadioGroupItem value={String(level.value)} id={`collins-${level.value}`} className="mt-0.5" />
                <Label htmlFor={`collins-${level.value}`} className="flex-1 cursor-pointer">
                  <span className="text-sm font-bold text-foreground">{level.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{level.description}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Auto-display Words/Phrases */}
      <AutoDisplaySettingsCard apiCall={apiCall} />

      <RedeemCodePanel apiCall={apiCall} onWalletChanged={onWalletChanged} />

      {/* Changelog section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4" />
            更新日志
          </CardTitle>
          <CardDescription>关注 Unlock Anything 最新动态，不错过任何新功能</CardDescription>
        </CardHeader>
        <CardContent>
          {changelogLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : changelogItems.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm font-medium text-foreground">暂无更新日志</p>
              <p className="mt-1 text-xs text-muted-foreground">关注 Unlock Anything 最新动态，不错过任何新功能</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-2 pr-4">
                {changelogItems.map((item) => {
                  const isExpanded = expandedIds.has(item.id);
                  return (
                    <div key={item.id} className="rounded-xl border bg-card">
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                        onClick={() => toggleExpand(item.id)}
                      >
                        <span className="shrink-0 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatDate(item.created_at)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span>
                        <Badge variant="outline" className="shrink-0 bg-secondary text-xs">
                          更新日志
                        </Badge>
                      </button>
                      {isExpanded ? (
                        <div className="border-t px-4 py-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                            {item.content}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <AutoDisplaySettingsCard apiCall={apiCall} />

    </div>
  );
}

function AutoDisplaySettingsCard({ apiCall }) {
  const [entries, setEntries] = useState(() => readLearningSettings().autoDisplayEntries || []);
  const [inputValue, setInputValue] = useState("");
  const [inputType, setInputType] = useState("word");
  const refreshEntries = useCallback(() => {
    setEntries(readLearningSettings().autoDisplayEntries || []);
  }, []);

  useEffect(() => {
    const handler = () => refreshEntries();
    window.addEventListener("immersive-learning-settings-updated", handler);
    return () => window.removeEventListener("immersive-learning-settings-updated", handler);
  }, [refreshEntries]);

  function handleAdd() {
    const value = String(inputValue || "").trim();
    if (!value) {
      toast.error("请输入要添加的单词或短语");
      return;
    }
    if (addAutoEntry({ type: inputType, value })) {
      toast.success(`已添加「${value}」`);
      setInputValue("");
      refreshEntries();
    } else {
      toast.error("该条目已存在");
    }
  }

  function handleRemove(type, value) {
    removeAutoEntry(type, value);
    refreshEntries();
  }

  const wordEntries = entries.filter((e) => e.type === "word");
  const phraseEntries = entries.filter((e) => e.type === "phrase");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="size-4" />
          自动显示设置
        </CardTitle>
        <CardDescription>
          设置在沉浸学习中自动显示（无需手动输入）的单词或短语。短语需完整连续出现才触发。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">单词或短语</p>
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="例如: um 或 you know"
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setInputType("word")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${inputType === "word" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              单词
            </button>
            <button
              type="button"
              onClick={() => setInputType("phrase")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${inputType === "phrase" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              短语
            </button>
          </div>
          <Button size="sm" className="h-9 gap-1" onClick={handleAdd}>
            <Plus className="size-3.5" />
            添加
          </Button>
        </div>

        {entries.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">暂无设置，输入单词或短语后添加</p>
        ) : (
          <div className="space-y-2">
            {wordEntries.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">单词 ({wordEntries.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {wordEntries.map((entry) => (
                    <span
                      key={`word:${entry.value}`}
                      className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-xs"
                    >
                      {entry.value}
                      <button
                        type="button"
                        onClick={() => handleRemove("word", entry.value)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {phraseEntries.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">短语 ({phraseEntries.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {phraseEntries.map((entry) => (
                    <span
                      key={`phrase:${entry.value}`}
                      className="inline-flex items-center gap-1 rounded-full border bg-blue-50/50 px-2.5 py-1 text-xs text-blue-800"
                    >
                      <span className="font-medium">{entry.value}</span>
                      <button
                        type="button"
                        onClick={() => handleRemove("phrase", entry.value)}
                        className="text-blue-400 hover:text-red-500 transition-colors"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

