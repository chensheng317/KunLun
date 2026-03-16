import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { UserSettingsModal } from './components/UserSettingsModal';
// Pages
import { HomePage } from './pages/HomePage';
import { DigitalWorkersPage } from './pages/DigitalWorkersPage';
import { DigitalFactoryPage } from './pages/DigitalFactoryPage';
import { AssetLibraryPage } from './pages/AssetLibraryPage';
import { HistoryPage } from './pages/HistoryPage';
const navLabels: Record<string, string> = {
  home: '首页',
  workers: '数字员工',
  factory: '数字工厂',
  assets: '资产库',
  history: '历史'
};
export function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const activeTabLabel = navLabels[activeTab] || '首页';
  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <HomePage />;
      case 'workers':
        return <DigitalWorkersPage />;
      case 'factory':
        return <DigitalFactoryPage />;
      case 'assets':
        return <AssetLibraryPage />;
      case 'history':
        return <HistoryPage />;
      default:
        return <HomePage />;
    }
  };
  return (
    <div className="min-h-screen bg-nexus-bg flex font-sans text-nexus-text selection:bg-nexus-primary/30 selection:text-white">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onUserClick={() => setIsUserModalOpen(true)} />
      

      <div className="flex-1 flex flex-col min-w-0 ml-64">
        <TopBar activeTabLabel={activeTabLabel} />

        <main className="pt-16 flex-1 overflow-y-auto">{renderContent()}</main>
      </div>

      <UserSettingsModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)} />
      
    </div>);

}