export const DEFAULT_PANEL_KEY = "history";

export const PANEL_ROUTE_ITEMS = [
  {
    key: "account",
    title: "个人中心",
    path: "/account",
    matchPaths: ["/account", "/redeem"],
  },
  {
    key: "history",
    title: "历史记录",
    path: "/",
    matchPaths: ["/"],
  },
  {
    key: "wordbook",
    title: "生词本",
    path: "/wordbook",
    matchPaths: ["/wordbook"],
  },
  {
    key: "upload",
    title: "上传素材",
    path: "/upload",
    matchPaths: ["/upload"],
  },
  {
    key: "reading",
    title: "阅读",
    path: "/reading",
    matchPaths: ["/reading"],
  },
];

export const LEARNING_PAGE_PATHS = Array.from(new Set(PANEL_ROUTE_ITEMS.flatMap((item) => item.matchPaths)));

export function getDefaultPanelItem() {
  return PANEL_ROUTE_ITEMS.find((item) => item.key === DEFAULT_PANEL_KEY) || PANEL_ROUTE_ITEMS[0];
}

export function getPanelItemByPathname(pathname) {
  return PANEL_ROUTE_ITEMS.find((item) => item.matchPaths.includes(pathname)) || getDefaultPanelItem();
}

export function getPanelPath(panelKey) {
  return PANEL_ROUTE_ITEMS.find((item) => item.key === panelKey)?.path || getDefaultPanelItem().path;
}
