import { LogOut, ScrollText, Settings2, Shield, Users } from "lucide-react";
import { useState } from "react";

import { AdminLogsTab } from "./features/admin-logs/AdminLogsTab";
import { AdminRatesTab } from "./features/admin-rates/AdminRatesTab";
import { AdminUsersTab } from "./features/admin-users/AdminUsersTab";
import { Badge, Button, Separator } from "./shared/ui";

export function AdminApp({ apiCall, onLogout }) {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="style-vega section-soft min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container-wrapper">
          <div className="container flex h-14 items-center gap-2">
            <Button size="icon-sm" variant="ghost" aria-label="logo">
              <Shield className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Admin</span>
              <Badge variant="outline">OneAPI Style</Badge>
            </div>
            <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />
            <div className="hidden items-center gap-2 md:flex">
              <Badge variant={activeTab === "users" ? "default" : "outline"}>用户</Badge>
              <Badge variant={activeTab === "logs" ? "default" : "outline"}>流水</Badge>
              <Badge variant={activeTab === "rates" ? "default" : "outline"}>计费</Badge>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { window.location.href = "/"; }}>
                返回学习页
              </Button>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="size-4" />
                退出
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container-wrapper pb-6">
        <div className="container space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={activeTab === "users" ? "default" : "outline"} onClick={() => setActiveTab("users")}>
              <Users className="size-4" />
              用户
            </Button>
            <Button variant={activeTab === "logs" ? "default" : "outline"} onClick={() => setActiveTab("logs")}>
              <ScrollText className="size-4" />
              流水
            </Button>
            <Button variant={activeTab === "rates" ? "default" : "outline"} onClick={() => setActiveTab("rates")}>
              <Settings2 className="size-4" />
              计费配置
            </Button>
          </div>

          {activeTab === "users" ? <AdminUsersTab apiCall={apiCall} /> : null}
          {activeTab === "logs" ? <AdminLogsTab apiCall={apiCall} /> : null}
          {activeTab === "rates" ? <AdminRatesTab apiCall={apiCall} /> : null}
        </div>
      </main>
    </div>
  );
}
