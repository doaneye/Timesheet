import React, {useState} from 'react';
import {
  Clock,
  FileText,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Calendar as CalendarIcon,
  Layers,
  Timer,
  Settings,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {ModuleEntry, UserProfile} from '../types';

export interface AppShellRenderState {
  activeTab: string;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  selectedModuleForDetail: ModuleEntry | null;
  setSelectedModuleForDetail: React.Dispatch<React.SetStateAction<ModuleEntry | null>>;
}

export function AppShell({
  profile,
  showDevBypassIndicator = false,
  renderContent,
}: {
  profile: UserProfile | null;
  showDevBypassIndicator?: boolean;
  renderContent: (state: AppShellRenderState) => React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<string>('timesheets');
  const [selectedModuleForDetail, setSelectedModuleForDetail] = useState<ModuleEntry | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarItems, setSidebarItems] = useState([
    {id: 'calendar', label: 'Calendar', icon: CalendarIcon},
    {id: 'modules', label: 'Modules', icon: Layers},
    {id: 'timesheets', label: 'Timesheets', icon: LayoutDashboard},
    {id: 'tracker', label: 'Time Tracker', icon: Timer},
    {id: 'claims', label: 'Claims', icon: FileText},
    {id: 'settings', label: 'Settings', icon: Settings},
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const {active, over} = event;
    if (over && active.id !== over.id) {
      setSidebarItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-full md:w-64'}`}>
        <div className={`p-6 border-b border-gray-100 flex items-center justify-between ${isSidebarCollapsed ? 'px-4' : ''}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-indigo-600 p-2 rounded-lg shrink-0">
              <Clock className="text-white" size={20} />
            </div>
            {!isSidebarCollapsed && <span className="font-bold text-xl text-gray-900 whitespace-nowrap">TimeClaim</span>}
          </div>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-1 hover:bg-gray-100 rounded-md text-gray-400 hidden md:block"
          >
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sidebarItems.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {sidebarItems.map((item) => (
                <SortableNavItem
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  icon={item.icon}
                  isActive={activeTab === item.id}
                  onClick={() => setActiveTab(item.id)}
                  isCollapsed={isSidebarCollapsed}
                />
              ))}
            </SortableContext>
          </DndContext>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-0' : 'px-2'}`}>
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
              {profile?.displayName?.[0]}
            </div>
            {!isSidebarCollapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium text-gray-900 truncate">{profile?.displayName}</p>
                <p className="text-xs text-gray-500 truncate capitalize">{profile?.role}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className={`flex-1 overflow-y-auto ${activeTab === 'module-detail' ? '' : 'p-4 md:p-8'}`}>
        <div className={activeTab === 'module-detail' ? 'h-full' : 'max-w-6xl mx-auto'}>
          {showDevBypassIndicator && activeTab !== 'module-detail' && (
            <div className="mb-4 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              Dev auth bypass active with mock local data
            </div>
          )}
          {renderContent({
            activeTab,
            setActiveTab,
            selectedModuleForDetail,
            setSelectedModuleForDetail,
          })}
        </div>
      </main>
    </div>
  );
}

function SortableNavItem({ id, label, icon: Icon, isActive, onClick, isCollapsed }: {
  id: string,
  label: string,
  icon: any,
  isActive: boolean,
  onClick: () => void,
  isCollapsed: boolean,
  key?: string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex items-center"
    >
      {!isCollapsed && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600 transition-opacity"
        >
          <GripVertical size={14} />
        </div>
      )}
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'} ${isCollapsed ? 'justify-center px-2' : 'pl-7'}`}
        title={isCollapsed ? label : undefined}
      >
        <Icon size={20} className="shrink-0" />
        {!isCollapsed && <span>{label}</span>}
      </button>
    </div>
  );
}
