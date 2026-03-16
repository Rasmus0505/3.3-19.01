import overviewImage from "../../assets/getting-started/step-01-overview.png";
import loginImage from "../../assets/getting-started/step-02-login.png";
import uploadImage from "../../assets/getting-started/step-03-upload.png";
import generateImage from "../../assets/getting-started/step-04-generate.png";
import historyImage from "../../assets/getting-started/step-05-history.png";
import learningImage from "../../assets/getting-started/step-06-learning.png";

export const GETTING_STARTED_OVERVIEW = {
  title: "先看真实页面，再跟着点一次",
  description:
    "这套新手教程只保留第一次最需要的 5 步：登录、上传、等待生成、从历史记录打开课程、开始学习第一句。桌面端支持真实点选引导，移动端先看图文。",
  image: overviewImage,
  imageAlt: "新手教程首页真实截图，展示左侧学习导航和教程首页入口。",
  flow: ["登录或注册", "上传素材", "等待生成", "历史记录", "开始学习"],
};

export const GETTING_STARTED_STEPS = [
  {
    id: "login",
    index: "01",
    title: "先登录或注册",
    image: loginImage,
    imageAlt: "登录页真实截图，标出邮箱、密码、登录和注册按钮。",
    goal: "在登录卡片里填邮箱和密码；已有账号点“登录”，第一次使用点“注册”。",
    actions: [
      "在邮箱输入框填常用邮箱。",
      "在密码输入框填至少 6 位密码。",
      "已有账号点“登录”；没有账号点“注册”。",
      "成功后你会看到左侧的“上传素材”“历史记录”等入口。",
    ],
    why: "登录后，课程、点数和学习进度才会和你的账号绑定。",
    success: "页面不再停留在登录卡片，并且能看到上传素材入口。",
    failureHint: "如果提示登录失效或网络错误，先重新登录，不要连续刷新页面。",
  },
  {
    id: "upload",
    index: "02",
    title: "上传第一份素材",
    image: uploadImage,
    imageAlt: "上传页真实截图，标出选择文件按钮、文件名和开始生成课程按钮。",
    goal: "进入“上传素材”后，先选一段 30 到 60 秒、发音清楚的英文素材。",
    actions: [
      "点击“选择文件”。",
      "优先选一段短英文音频或视频。",
      "确认页面已经显示文件名。",
      "再看一眼“开始生成课程”按钮是否可点。",
    ],
    why: "短素材最容易第一次跑通，也更容易判断按钮和结果是否正常。",
    success: "页面出现文件名，且“开始生成课程”按钮可以点击。",
    failureHint: "如果没有看到文件名，先重新选择一次文件，再继续下一步。",
  },
  {
    id: "generate",
    index: "03",
    title: "等待课程生成",
    image: generateImage,
    imageAlt: "生成进度真实截图，标出总进度、阶段条和成功提示。",
    goal: "点击“开始生成课程”后，只盯住进度和阶段条，等到页面出现成功提示。",
    actions: [
      "点击“开始生成课程”。",
      "观察总进度和阶段条是否继续变化。",
      "等页面出现“生成成功”或“课程已生成”。",
      "看到成功后，再按教程去历史记录。",
    ],
    why: "第一次最容易误以为没反应，其实系统正在识别、翻译和生成课程。",
    success: "页面出现成功状态，并能看到“去历史记录”按钮。",
    failureHint: "如果停在同一阶段很久，先看页面报错，再决定是否重试。",
  },
  {
    id: "history",
    index: "04",
    title: "回到历史记录找新课程",
    image: historyImage,
    imageAlt: "历史记录真实截图，标出最新课程卡片和开始学习按钮。",
    goal: "点左侧“历史记录”，找到刚刚生成的课程卡片。",
    actions: [
      "点击左侧“历史记录”。",
      "优先看最新时间的课程卡片。",
      "确认卡片上有标题、时间和“开始学习”按钮。",
      "准备进入第一课。",
    ],
    why: "以后每次回来继续学，你都会先从历史记录进入。",
    success: "你已经能指出最新课程卡片，并看到“开始学习”按钮。",
    failureHint: "如果没有找到课程，先回上传页确认是否真的生成成功。",
  },
  {
    id: "learning",
    index: "05",
    title: "开始学习第一句",
    image: learningImage,
    imageAlt: "学习页真实截图，标出媒体区、当前句子和返回按钮。",
    goal: "点击“开始学习”进入课程，先完成第一句，再知道怎么返回。",
    actions: [
      "点击课程卡片上的“开始学习”。",
      "进入学习页后先看当前句子和播放区域。",
      "先完成第一句练习。",
      "确认自己知道怎么返回主界面。",
    ],
    why: "只要第一句跑通，后面继续学就只是重复同一套动作。",
    success: "你已经进入学习页，并开始第一句的播放或练习。",
    failureHint: "如果不知道先做什么，就先从播放当前句子开始。",
  },
];
