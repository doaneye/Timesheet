import React from 'react';
import {AnimatePresence} from 'motion/react';
import {ModuleEntry} from '../types';

export function AppViewSwitch({
  activeTab,
  selectedModuleForDetail,
  calendarView,
  modulesView,
  moduleDetailView,
  timesheetsView,
  trackerView,
  claimsView,
  settingsView,
}: {
  activeTab: string;
  selectedModuleForDetail: ModuleEntry | null;
  calendarView: React.ReactNode;
  modulesView: React.ReactNode;
  moduleDetailView: React.ReactNode;
  timesheetsView: React.ReactNode;
  trackerView: React.ReactNode;
  claimsView: React.ReactNode;
  settingsView: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait">
      {activeTab === 'calendar' && calendarView}
      {activeTab === 'modules' && modulesView}
      {activeTab === 'module-detail' && selectedModuleForDetail && moduleDetailView}
      {activeTab === 'timesheets' && timesheetsView}
      {activeTab === 'tracker' && trackerView}
      {activeTab === 'claims' && claimsView}
      {activeTab === 'settings' && settingsView}
    </AnimatePresence>
  );
}
