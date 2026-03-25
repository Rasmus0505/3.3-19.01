/**
 * Bottle Desktop - Main App Component
 *
 * Entry point for the Electron renderer process.
 * Manages login state and renders the appropriate panel.
 */

import React, { useState, useEffect } from "react";
import DesktopUploadPanel from "./features/upload/DesktopUploadPanel";

interface AppInfo {
  version: string;
  isDev: boolean;
}

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo>({ version: "", isDev: false });

  useEffect(() => {
    if (window.electronAPI) {
      Promise.all([
        window.electronAPI.getAppVersion(),
        window.electronAPI.getIsDev(),
      ]).then(([version, isDev]) => {
        setAppInfo({ version, isDev });
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Bottle Desktop</h1>
          </div>
          <div className="flex items-center space-x-4">
            {appInfo.version && (
              <span className="text-xs text-gray-400">v{appInfo.version}</span>
            )}
            {appInfo.isDev && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                开发模式
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <DesktopUploadPanel />
      </main>
    </div>
  );
}

export default App;
