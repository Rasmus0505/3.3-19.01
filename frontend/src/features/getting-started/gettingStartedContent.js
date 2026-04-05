import overviewImage from "../../assets/getting-started/step-01-overview.png";
import loginImage from "../../assets/getting-started/step-02-login.png";
import uploadImage from "../../assets/getting-started/step-03-upload.png";
import generateImage from "../../assets/getting-started/step-04-generate.png";
import historyImage from "../../assets/getting-started/step-05-history.png";
import learningImage from "../../assets/getting-started/step-06-learning.png";

export const GETTING_STARTED_OVERVIEW = {
  title: "先看真实页面，再跟着点一次",
  description: "先把这 5 步走通：登录、上传、等待生成、回到历史记录、开始学习。桌面端可跟着真实按钮点一次，移动端先看大图。",
  image: overviewImage,
  imageAlt: "新手教程首页真实截图，展示左侧学习导航和教程首页入口。",
};

export const GETTING_STARTED_STEPS = [
  {
    id: "login",
    index: "01",
    title: "登录或注册",
    summary: "填邮箱和密码；已有账号点登录，第一次使用点注册。",
    image: loginImage,
    imageAlt: "登录页真实截图，标出邮箱、密码、登录和注册按钮。",
  },
  {
    id: "upload",
    index: "02",
    title: "上传第一份素材",
    summary: "先选一段短英文素材，看到文件名后再继续。",
    image: uploadImage,
    imageAlt: "上传页真实截图，标出选择文件按钮、文件名和 Unlock 按钮。",
  },
  {
    id: "generate",
    index: "03",
    title: "等待课程生成",
    summary: "点“开始生成课程”后只看进度，等成功提示出现。",
    image: generateImage,
    imageAlt: "生成进度真实截图，标出总进度、阶段条和成功提示。",
  },
  {
    id: "history",
    index: "04",
    title: "回到历史记录",
    summary: "从左侧点进历史记录，先找最新那张课程卡。",
    image: historyImage,
    imageAlt: "历史记录真实截图，标出最新课程卡片和开始学习按钮。",
  },
  {
    id: "learning",
    index: "05",
    title: "开始学习第一句",
    summary: "点“开始学习”进入课程，先把第一句跑通。",
    image: learningImage,
    imageAlt: "学习页真实截图，标出媒体区、当前句子和返回按钮。",
  },
];
