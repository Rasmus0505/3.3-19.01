import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  CircleAlert,
  CirclePlay,
  History,
  KeyRound,
  LoaderCircle,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from "../shared/ui";
import { useAppStore } from "../store";

const GUIDE_MODULES = [
  {
    id: "overview",
    index: "00",
    eyebrow: "30 秒看懂整套流程",
    title: "先建立一张完整脑图",
    goal: "先看懂产品只做 5 件事：登录、上传、等待生成、从历史记录打开课程、开始学习。",
    steps: [
      "先知道首页不是信息页，而是你的学习入口。",
      "上传一个 30 到 60 秒的英文音频或视频，系统会自动生成课程。",
      "课程生成后回到历史记录，找到最新课程并点击开始学习。",
    ],
    why: "先有全流程脑图，后面每一步就不会迷路。",
    success: "你能复述登录、上传、生成、历史记录、学习这条主线。",
    failureHint: "如果你还分不清上传页和历史记录页，先不要急着操作，继续看下一张卡片。",
    script: [
      "镜头 1：展示帮助中心首页和 5 个步骤时间线。",
      "镜头 2：高亮去登录并上传主按钮。",
      "镜头 3：收尾强调只要先走通一节课就够了。",
    ],
    preview: "overview",
  },
  {
    id: "auth",
    index: "01",
    eyebrow: "第一步 登录或注册",
    title: "先拿到可以上传的账号状态",
    goal: "在登录卡片里输入邮箱和密码；没有账号就直接点注册，已有账号点登录。",
    steps: [
      "在邮箱框填一个你能收到邮件的常用邮箱。",
      "在密码框填至少 6 位密码。",
      "没有账号就点注册，已有账号就点登录。",
      "成功后会进入产品首页，并出现上传、历史记录等入口。",
    ],
    why: "登录后系统才能识别你的课程、点数和学习进度。",
    success: "你能看到登录成功提示，并进入产品主界面。",
    failureHint: "如果提示登录失效或网络错误，先重新登录；不要反复刷新页面。",
    script: [
      "镜头 1：输入邮箱和密码。",
      "镜头 2：分别演示注册和登录按钮位置。",
      "镜头 3：展示登录成功后的页面变化。",
    ],
    preview: "auth",
  },
  {
    id: "upload",
    index: "02",
    eyebrow: "第二步 上传素材",
    title: "把一段英文素材变成课程",
    goal: "进入上传素材后选择一个 30 到 60 秒的英文样例文件，再点击开始生成。",
    steps: [
      "优先选一段短一点、语音清晰的英文素材。",
      "选中文件后，检查页面有没有出现文件名和预计消耗。",
      "确认无误后开始上传并生成课程。",
    ],
    why: "短素材最容易第一次跑通，也更适合确认按钮和结果是否都正常。",
    success: "页面能看到文件名、进度状态和开始生成后的任务反馈。",
    failureHint: "如果没有文件名或按钮不可点，先重新选择文件，再检查是否已经登录。",
    script: [
      "镜头 1：在上传页选择样例文件。",
      "镜头 2：展示文件名、预计消耗和开始按钮。",
      "镜头 3：点击开始生成，切到进度状态。",
    ],
    preview: "upload",
  },
  {
    id: "progress",
    index: "03",
    eyebrow: "第三步 等待生成课程",
    title: "只看懂进度，不要中途乱切",
    goal: "上传后重点看任务状态和阶段变化，知道系统正在转写、翻译和生成课程。",
    steps: [
      "看顶部进度文案，确认任务没有卡死。",
      "看阶段条依次经过转音频、识别、翻译、生成。",
      "等待出现课程生成完成或类似成功提示。",
    ],
    why: "第一次生成最容易误以为没反应，其实只是后台还在处理中。",
    success: "你能看到阶段条前进，最后出现成功状态。",
    failureHint: "如果长时间停在同一阶段，先看页面提示，再看下方 FAQ。",
    script: [
      "镜头 1：展示进度条和阶段列表。",
      "镜头 2：高亮识别、翻译、生成的变化。",
      "镜头 3：停在成功态，说明下一步去历史记录。",
    ],
    preview: "progress",
  },
  {
    id: "history",
    index: "04",
    eyebrow: "第四步 从历史记录打开课程",
    title: "回到课程列表找刚生成的那一课",
    goal: "进入历史记录，找到最新生成的课程卡片，确认封面、标题和开始学习按钮都在。",
    steps: [
      "切回历史记录面板。",
      "优先看列表最上方或最新时间的课程卡片。",
      "确认卡片上能看到课程标题、时间和开始学习按钮。",
    ],
    why: "以后你每次回来继续学，都会先从历史记录进入。",
    success: "你能准确指出刚生成的课程卡片，并准备进入学习。",
    failureHint: "如果没有看到课程，先回上传页确认是否真的生成成功，再刷新历史记录。",
    script: [
      "镜头 1：从上传成功回到历史记录。",
      "镜头 2：高亮最新课程卡片。",
      "镜头 3：停在开始学习按钮上。",
    ],
    preview: "history",
  },
  {
    id: "learning",
    index: "05",
    eyebrow: "第五步 开始学习第一课",
    title: "先完成第一句，再学会退出",
    goal: "点击开始学习进入学习页，先完成第一句练习，再知道怎么返回主界面。",
    steps: [
      "点击课程卡片上的开始学习。",
      "进入学习页后先看当前句子和播放区域。",
      "先完成第一句，再确认自己知道如何退出回主界面。",
    ],
    why: "第一次只要走通一节课，后面继续学就只是重复这个动作。",
    success: "你已经进入学习页，开始播放或练习第一句。",
    failureHint: "如果进了页面不知道做什么，先从播放按钮和当前句子开始。",
    script: [
      "镜头 1：点击开始学习进入课程。",
      "镜头 2：展示播放区、当前句子和学习状态。",
      "镜头 3：说明完成第一句后如何退出返回。",
    ],
    preview: "learning",
  },
];

const APPENDIX_CARDS = [
  {
    id: "wallet",
    title: "兑换码与点数",
    description: "只在你已经会上传之后再看，避免第一次上手被计费概念打断。",
    bullets: [
      "点数决定你能否继续生成课程。",
      "兑换码入口在产品内独立面板。",
      "第一次只要确认能上传成功，不必先研究复杂计费规则。",
    ],
  },
  {
    id: "errors",
    title: "常见报错",
    description: "只留最常见的三类问题，先帮你判断下一步该看哪里。",
    bullets: [
      "登录失效：重新登录后再继续。",
      "上传无反应：先检查是否真的选中了文件。",
      "生成卡住：先看进度提示，再看下方 FAQ。",
    ],
  },
];

const DEEP_READING = [
  {
    id: "deep-upload-flow",
    title: "深入阅读：上传、ASR、转写、任务流",
    sourcePath: "教学/第06章_文件上传_ASR_转写_任务流.md",
    summary: "这部分只适合你已经完成第一次上传后再看。它会解释上传后到底经过了哪些处理步骤。",
    bullets: [
      "核心接口固定是 POST /api/transcribe/file，不要随意改路径和关键字段。",
      "系统会经历接收文件、媒体处理、ASR 识别、切句、翻译、写课程这几步。",
      "如果生成失败，通常先看上游识别、媒体处理或超时，而不是先怀疑学习页。",
    ],
  },
  {
    id: "deep-faq",
    title: "深入阅读：术语表与高频问题",
    sourcePath: "教学/第11章_术语表_高频问题_学习建议.md",
    summary: "当你遇到健康检查、转写、课程、点数这些词开始混乱时，再来这里查词和 FAQ。",
    bullets: [
      "/health 只说明服务活着，不代表业务就绪；这是给排障用的，不是给第一次上手用的。",
      "上传成功和学习成功是两件事，第一轮先把上传到课程生成跑通。",
      "如果你打算部署到 Zeabur，另看 README 和 教学/第08章_GitHub_Zeabur_部署全流程.md。",
    ],
  },
];

function GuidePreview({ variant }) {
  if (variant === "overview") {
    return (
      <div className="grid gap-3">
        {["登录/注册", "上传素材", "等待生成", "历史记录", "开始学习"].map((label, index) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border bg-background/90 px-4 py-3 shadow-sm">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{label}</p>
            </div>
            {index < 4 ? <ArrowRight className="size-4 text-muted-foreground" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "auth") {
    return (
      <div className="rounded-[28px] border bg-background/95 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <Badge variant="outline">登录卡片</Badge>
          <KeyRound className="size-4 text-muted-foreground" />
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">邮箱</p>
            <p className="text-sm font-medium">you@example.com</p>
          </div>
          <div className="rounded-2xl border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">密码</p>
            <p className="text-sm font-medium tracking-[0.3em]">******</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">登录</div>
            <div className="rounded-2xl border border-dashed px-3 py-2 text-center text-sm">注册</div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "upload") {
    return (
      <div className="space-y-3 rounded-[28px] border bg-background/95 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <Badge variant="outline">上传素材</Badge>
          <UploadCloud className="size-4 text-muted-foreground" />
        </div>
        <div className="rounded-3xl border border-dashed bg-muted/35 px-4 py-8 text-center">
          <p className="text-sm font-medium">sample-lesson.mp4</p>
          <p className="mt-1 text-xs text-muted-foreground">30 到 60 秒英文样例素材最适合第一次跑通</p>
        </div>
        <div className="rounded-2xl border bg-muted/35 px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>预计消耗</span>
            <span>约 12 点</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 w-2/3 rounded-full bg-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "progress") {
    return (
      <div className="space-y-3 rounded-[28px] border bg-background/95 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <Badge variant="outline">生成进度</Badge>
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        </div>
        <div className="rounded-2xl border bg-muted/35 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">识别字幕 6/12</p>
            <p className="text-xs text-muted-foreground">处理中</p>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 w-[58%] rounded-full bg-primary" />
          </div>
        </div>
        {["转音频", "识别", "翻译", "生成"].map((label, index) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border bg-background px-3 py-2">
            <span className="text-sm">{label}</span>
            <Badge variant={index < 2 ? "default" : "outline"}>{index < 1 ? "完成" : index === 1 ? "进行中" : "等待中"}</Badge>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "history") {
    return (
      <div className="space-y-3 rounded-[28px] border bg-background/95 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <Badge variant="outline">历史记录</Badge>
          <History className="size-4 text-muted-foreground" />
        </div>
        {["今日 19:08", "今日 18:35"].map((timeValue, index) => (
          <div
            key={timeValue}
            className={`rounded-3xl border px-4 py-4 ${index === 0 ? "border-primary bg-primary/5" : "bg-muted/20"}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">{index === 0 ? "最新生成课程" : "上一节课程"}</p>
              <Badge variant={index === 0 ? "default" : "outline"}>{timeValue}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">看到最新时间和按钮就对了</p>
              <div className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">开始学习</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[28px] border bg-background/95 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <Badge variant="outline">学习页</Badge>
        <CirclePlay className="size-4 text-muted-foreground" />
      </div>
      <div className="rounded-3xl border bg-muted/20 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CirclePlay className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">播放当前句子</p>
            <p className="text-xs text-muted-foreground">先从第一句开始，不要一次点完所有按钮</p>
          </div>
        </div>
        <div className="rounded-2xl border bg-background px-4 py-3">
          <p className="text-sm font-medium">Current sentence</p>
          <p className="mt-1 text-xs text-muted-foreground">完成第一句，再确认你知道怎么返回主界面。</p>
        </div>
      </div>
    </div>
  );
}

function GuideModuleCard({ module }) {
  return (
    <Card id={module.id} className="overflow-hidden border-border/80 bg-card/95 shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">模块 {module.index}</Badge>
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{module.eyebrow}</span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">{module.title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{module.goal}</p>

          <ol className="mt-6 space-y-3">
            {module.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 rounded-2xl border bg-muted/20 px-4 py-3">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {index + 1}
                </div>
                <p className="text-sm leading-6">{step}</p>
              </li>
            ))}
          </ol>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-background px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">为什么做</p>
              <p className="mt-2 text-sm leading-6">{module.why}</p>
            </div>
            <div className="rounded-2xl border bg-emerald-50/60 px-4 py-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="size-4" />
                <p className="text-xs font-medium uppercase tracking-[0.16em]">成功验证</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">{module.success}</p>
            </div>
            <div className="rounded-2xl border bg-amber-50/70 px-4 py-3">
              <div className="flex items-center gap-2 text-amber-700">
                <CircleAlert className="size-4" />
                <p className="text-xs font-medium uppercase tracking-[0.16em]">失败先看这里</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">{module.failureHint}</p>
            </div>
          </div>
        </div>

        <div className="border-t bg-muted/25 p-6 md:p-8 lg:border-l lg:border-t-0">
          <div className="rounded-[32px] border border-border/80 bg-background/80 p-4 shadow-inner">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">带标注截图</p>
                <p className="text-xs text-muted-foreground">V1 先内置演示画面，后续可替换为真实截图。</p>
              </div>
              <Sparkles className="size-4 text-muted-foreground" />
            </div>
            <GuidePreview variant={module.preview} />
          </div>

          <div className="mt-4 rounded-[32px] border border-dashed bg-background/85 p-4">
            <div className="mb-3 flex items-center gap-2">
              <CirclePlay className="size-4 text-muted-foreground" />
              <p className="text-sm font-medium">短视频镜头脚本</p>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">建议录制 30 到 90 秒，顺着下面的镜头顺序录就够了。</p>
            <ol className="mt-3 space-y-2">
              {module.script.map((item, index) => (
                <li key={item} className="rounded-2xl border bg-muted/20 px-3 py-2 text-sm leading-6">
                  <span className="mr-2 font-medium text-muted-foreground">镜头 {index + 1}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function GettingStartedHelpPage() {
  const navigate = useNavigate();
  const accessToken = useAppStore((state) => state.accessToken);
  const hasStoredToken = useAppStore((state) => state.hasStoredToken);
  const currentUser = useAppStore((state) => state.currentUser);

  const hasSession = Boolean(accessToken || hasStoredToken);
  const primaryCta = hasSession
    ? { label: "去上传素材", target: "/upload", description: "已经登录就直接去上传，先跑通第一节课。" }
    : { label: "去登录并上传", target: "/", description: "第一次使用先登录或注册，再开始上传素材。" };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "新手教程 | Unlock Anything";
    console.debug("[DEBUG] help.getting-started.view", {
      hasSession,
      hasStoredToken,
      userId: Number(currentUser?.id || 0),
    });
    return () => {
      document.title = previousTitle;
    };
  }, [currentUser?.id, hasSession, hasStoredToken]);

  function handleNavigate(target, source) {
    console.debug("[DEBUG] help.getting-started.cta", { target, source, hasSession });
    navigate(target);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.06),_transparent_28%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(244,244,245,0.92))]">
      <div className="container-wrapper py-6 md:py-8">
        <div className="container space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">产品内帮助中心</Badge>
              <Badge variant="outline">路径 /help/getting-started</Badge>
              {hasSession ? <Badge>已识别登录状态</Badge> : <Badge variant="secondary">未登录也能看</Badge>}
            </div>
            <Button asChild variant="ghost">
              <Link to="/">返回产品</Link>
            </Button>
          </div>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_430px]">
            <Card className="overflow-hidden border-border/80 bg-card/95 shadow-sm">
              <CardHeader className="border-b bg-[linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(51,65,85,0.92))] text-primary-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-white/14 text-white hover:bg-white/14">新手教程 V1</Badge>
                  <Badge className="bg-white/10 text-white/92 hover:bg-white/10">5 到 8 分钟走通主线</Badge>
                </div>
                <CardTitle className="text-3xl md:text-4xl">第一次上手，只做一件事：先走通第一节课。</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6 text-white/78">
                  这页只保留产品新手最需要的动作。先登录，再上传一个短英文素材，等系统生成课程，最后从历史记录进入学习。
                  Zeabur 部署、管理台和开发原理都不放进这条主线里。
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_280px] md:p-8">
                <div className="space-y-5">
                  <div className="rounded-3xl border bg-muted/25 p-5">
                    <p className="text-sm font-medium">你会完成什么</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {["登录或注册", "上传一个英文样例", "看懂生成进度", "找到刚生成课程", "开始学习第一句", "知道下一步去哪"].map((item) => (
                        <div key={item} className="flex items-center gap-2 rounded-2xl border bg-background px-3 py-2 text-sm">
                          <CheckCircle2 className="size-4 text-emerald-600" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => handleNavigate(primaryCta.target, "hero-primary")}>
                      {primaryCta.label}
                      <ArrowRight className="size-4" />
                    </Button>
                    {hasSession ? (
                      <Button variant="outline" onClick={() => handleNavigate("/", "hero-history")}>
                        去历史记录开始学习
                      </Button>
                    ) : (
                      <Button variant="outline" asChild>
                        <a href="#deep-faq">先看高频问题</a>
                      </Button>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground">{primaryCta.description}</p>
                </div>

                <div className="rounded-[32px] border bg-muted/20 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <BookOpenText className="size-4 text-muted-foreground" />
                    <p className="text-sm font-medium">今日上手路线</p>
                  </div>
                  <div className="space-y-3">
                    {GUIDE_MODULES.map((module, index) => (
                      <a
                        key={module.id}
                        href={`#${module.id}`}
                        className="flex items-center gap-3 rounded-2xl border bg-background px-3 py-3 transition-colors hover:bg-muted/25"
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{module.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{module.eyebrow}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {APPENDIX_CARDS.map((item) => (
                <Card key={item.id} className="border-border/80 bg-card/95 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription className="text-sm leading-6">{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {item.bullets.map((bullet) => (
                      <div key={bullet} className="rounded-2xl border bg-muted/20 px-3 py-2 text-sm leading-6">
                        {bullet}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}

              <Card className="border-border/80 bg-card/95 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">不在这条主线里的内容</CardTitle>
                  <CardDescription className="text-sm leading-6">
                    Zeabur 部署、管理台和开发原理不放在第一次上手里，避免你还没跑通主线就被信息打散。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                  <p>如果你要部署服务，请看 README 和 教学/第08章_GitHub_Zeabur_部署全流程.md。</p>
                  <p>如果你要看接口或代码链路，请跳到仓库里的 教学/第06章、第09章、第11章。</p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">主线教程</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  每一张卡片都固定回答 5 件事：这一步做什么、怎么做、为什么做、做完怎么验证、失败先看哪里。
                </p>
              </div>
              <Badge variant="outline">共 {GUIDE_MODULES.length} 个模块</Badge>
            </div>
            <div className="space-y-5">
              {GUIDE_MODULES.map((module) => (
                <GuideModuleCard key={module.id} module={module} />
              ))}
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">附录与深入阅读</h2>
                <p className="mt-2 text-sm text-muted-foreground">只有当你已经跑通第一节课，才需要继续读这里。</p>
              </div>
              <Badge variant="outline">原理库入口</Badge>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              {DEEP_READING.map((section) => (
                <Card key={section.id} id={section.id} className="border-border/80 bg-card/95 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-xl">{section.title}</CardTitle>
                    <CardDescription className="text-sm leading-6">{section.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border bg-muted/20 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">对应仓库文档</p>
                      <p className="mt-2 text-sm font-medium">{section.sourcePath}</p>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      {section.bullets.map((bullet) => (
                        <div key={bullet} className="rounded-2xl border bg-background px-4 py-3 text-sm leading-6">
                          {bullet}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="rounded-[36px] border border-border/80 bg-card/95 p-6 shadow-sm md:p-8">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">最后一步</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight">看完后，不要继续读更多文档，直接回产品开始做。</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  第一轮目标不是把所有功能学完，而是让你自己独立完成一次登录、上传、生成、学习。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => handleNavigate(primaryCta.target, "footer-primary")}>
                  {primaryCta.label}
                  <ArrowRight className="size-4" />
                </Button>
                {hasSession ? (
                  <Button variant="outline" onClick={() => handleNavigate("/", "footer-history")}>
                    去历史记录开始学习
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <a href="#overview">回到主线开头</a>
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
