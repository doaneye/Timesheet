import React, { useState, useEffect, useMemo } from 'react';
import { 
  auth, db 
} from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc,
  deleteDoc,
  updateDoc,
  getDocFromServer,
  orderBy
} from 'firebase/firestore';
import { 
  Clock, 
  FileText, 
  Plus, 
  LogOut, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  LayoutDashboard,
  Calendar as CalendarIcon,
  Layers,
  Timer,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  Settings,
  X,
  Calendar as CalendarIconSmall,
  Play,
  Square,
  Edit2,
  MoreVertical,
  List,
  Tag,
  PoundSterling,
  CheckSquare,
  PlusCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Star,
  Archive
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  subDays,
  eachDayOfInterval, 
  startOfDay, 
  endOfDay, 
  addWeeks, 
  subWeeks,
  parseISO,
  isWithinInterval,
  setHours,
  setMinutes,
  getHours,
  getMinutes,
  differenceInMinutes,
  startOfToday,
  startOfYesterday,
  subMonths as subMonthsDateFns,
  isSameYear,
  parse
} from 'date-fns';
import * as XLSX from 'xlsx';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { UserProfile, TimesheetEntry, ClaimEntry, ModuleEntry } from './types';
import { ModuleDetailView } from './components/ModuleDetailView';
import { AppShell } from './app/AppShell';
import { AppViewSwitch } from './app/AppViewSwitch';
import { AppLoadingScreen } from './app/AppLoadingScreen';
import { AppSignedOutScreen } from './app/AppSignedOutScreen';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.message?.startsWith('{')) {
        try {
          const info = JSON.parse(event.error.message);
          setErrorMsg(`Firestore Error: ${info.error} during ${info.operationType} on ${info.path}`);
        } catch {
          setErrorMsg(event.error.message);
        }
      } else {
        setErrorMsg(event.error?.message || 'An unexpected error occurred');
      }
      setHasError(true);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full border border-red-200">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle size={32} />
            <h2 className="text-xl font-bold">Something went wrong</h2>
          </div>
          <p className="text-gray-600 mb-6">{errorMsg}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Data states
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [claims, setClaims] = useState<ClaimEntry[]>([]);
  const [modules, setModules] = useState<ModuleEntry[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Test connection
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if(error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration. ");
          }
        }

        // Get or create profile
        const profileRef = doc(db, 'users', u.uid);
        try {
          const profileSnap = await getDoc(profileRef);
          if (profileSnap.exists()) {
            setProfile(profileSnap.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: u.uid,
              displayName: u.displayName || 'User',
              email: u.email || '',
              role: u.email === 'doaneyip@gmail.com' ? 'admin' : 'user'
            };
            await setDoc(profileRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listeners
  useEffect(() => {
    if (!user) return;

    const tsQuery = profile?.role === 'admin' 
      ? collection(db, 'timesheets') 
      : query(collection(db, 'timesheets'), where('userId', '==', user.uid));
    
    const unsubscribeTs = onSnapshot(tsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimesheetEntry));
      setTimesheets(data.sort((a, b) => b.date.localeCompare(a.date)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'timesheets'));

    const clQuery = profile?.role === 'admin'
      ? collection(db, 'claims')
      : query(collection(db, 'claims'), where('userId', '==', user.uid));

    const unsubscribeCl = onSnapshot(clQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClaimEntry));
      setClaims(data.sort((a, b) => b.date.localeCompare(a.date)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'claims'));

    const modQuery = profile?.role === 'admin'
      ? collection(db, 'modules')
      : query(collection(db, 'modules'), where('userId', '==', user.uid));

    const unsubscribeMod = onSnapshot(modQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ModuleEntry));
      setModules(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'modules'));

    return () => {
      unsubscribeTs();
      unsubscribeCl();
      unsubscribeMod();
    };
  }, [user, profile]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return <AppLoadingScreen />;
  }

  if (!user) {
    return <AppSignedOutScreen onLogin={handleLogin} />;
  }

  return (
    <ErrorBoundary>
      <AppShell
        profile={profile}
        renderContent={({activeTab, setActiveTab, selectedModuleForDetail, setSelectedModuleForDetail}) => (
          <AppViewSwitch
            activeTab={activeTab}
            selectedModuleForDetail={selectedModuleForDetail}
            calendarView={<CalendarView key="calendar" timesheets={timesheets} user={user} modules={modules} />}
            modulesView={
              <ModulesView
                key="modules"
                user={user}
                modules={modules}
                timesheets={timesheets}
                isAdmin={profile?.role === 'admin'}
                onModuleClick={(module) => {
                  setSelectedModuleForDetail(module);
                  setActiveTab('module-detail');
                }}
              />
            }
            moduleDetailView={
              <ModuleDetailView
                user={user}
                module={selectedModuleForDetail ? (modules.find(m => m.id === selectedModuleForDetail.id) || selectedModuleForDetail) : selectedModuleForDetail}
                timesheets={timesheets}
                onBack={() => setActiveTab('modules')}
              />
            }
            timesheetsView={<TimesheetView key="timesheets" user={user} timesheets={timesheets} modules={modules} isAdmin={profile?.role === 'admin'} />}
            trackerView={<TimeTrackerView key="tracker" user={user} modules={modules} />}
            claimsView={<ClaimView key="claims" user={user} claims={claims} isAdmin={profile?.role === 'admin'} />}
            settingsView={<SettingsView key="settings" user={user} profile={profile} onLogout={handleLogout} />}
          />
        )}
      />
    </ErrorBoundary>
  );
}

function PlaceholderView({ title, icon }: { title: string, icon: React.ReactNode, key?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm"
    >
      <div className="mb-4 text-indigo-200">{icon}</div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
      <p>This module is coming soon.</p>
    </motion.div>
  );
}

function DatePickerPopover({ 
  currentDate, 
  onSelect, 
  viewMode, 
  onClose,
  align = 'left',
  singleMonth = false,
  hideSidebar = false
}: { 
  currentDate: Date, 
  onSelect: (date: Date) => void, 
  viewMode: 'month' | 'week' | 'day',
  onClose: () => void,
  align?: 'left' | 'right',
  singleMonth?: boolean,
  hideSidebar?: boolean
}) {
  const [displayMonth, setDisplayMonth] = useState(startOfMonth(currentDate));
  const popoverRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  const shortcuts = [
    { label: 'Today', getValue: () => new Date(), mode: 'day' },
    { label: 'Yesterday', getValue: () => subDays(new Date(), 1), mode: 'day' },
    { label: 'This week', getValue: () => startOfWeek(new Date(), { weekStartsOn: 1 }), mode: 'week' },
    { label: 'Last week', getValue: () => startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }), mode: 'week' },
    { label: 'This month', getValue: () => startOfMonth(new Date()), mode: 'month' },
    { label: 'Last month', getValue: () => startOfMonth(subMonths(new Date(), 1)), mode: 'month' },
  ].filter(s => s.mode === viewMode);

  const renderMonth = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];
    calendarDays.forEach(day => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    return (
      <div className="w-64">
        <div className="text-center font-bold text-gray-700 mb-4">
          {format(month, 'MMMM yyyy')}
        </div>
        <div className="flex">
          {viewMode === 'week' && (
            <div className="flex flex-col mr-2 border-r border-gray-100 pr-2">
              <div className="h-4 mb-2"></div>
              {weeks.map((week, i) => (
                <div key={i} className="h-8 flex items-center justify-center text-[10px] font-bold text-gray-400 mb-1">
                  W{format(week[0], 'I')}
                </div>
              ))}
            </div>
          )}
          <div className="flex-1">
            <div className="grid grid-cols-7 mb-2">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase">{d}</div>
              ))}
            </div>
            <div className="flex flex-col gap-y-1">
              {weeks.map((week, i) => {
                const isSelectedWeek = viewMode === 'week' && isWithinInterval(currentDate, { start: week[0], end: week[6] });
                return (
                  <div 
                    key={i} 
                    className={`grid grid-cols-7 rounded-lg ${isSelectedWeek ? 'bg-indigo-100' : (viewMode === 'week' ? 'hover:bg-indigo-600/[0.68] group cursor-pointer' : '')}`}
                  >
                    {week.map((day, j) => {
                      const isToday = isSameDay(day, new Date());
                      const isSelectedDay = viewMode === 'day' && isSameDay(day, currentDate);
                      const isCurrentMonth = isSameMonth(day, monthStart);
                      
                      let btnBg = '';
                      let textClass = !isCurrentMonth ? 'text-gray-300' : 'text-gray-700 opacity-[0.68]';
                      
                      if (isSelectedWeek) {
                        if (j === 0 || j === 6) {
                          btnBg = 'bg-indigo-600/[0.88]';
                          textClass = 'text-white opacity-100';
                        } else {
                          textClass = 'text-indigo-900 opacity-100';
                        }
                      }

                      let innerClass = 'flex items-center justify-center h-7 w-7';
                      if (isSelectedDay) {
                        innerClass += ' bg-indigo-600 text-white rounded-full opacity-100';
                        textClass = ''; 
                      } else if (isToday) {
                        innerClass += ' bg-gray-800 text-white rounded-full opacity-100';
                        textClass = ''; 
                      }

                      return (
                        <button
                          key={day.toString()}
                          onClick={() => onSelect(day)}
                          className={`h-8 w-full flex items-center justify-center text-xs transition-colors
                            ${btnBg} ${textClass}
                            ${!btnBg && !isSelectedWeek && viewMode !== 'week' ? 'hover:bg-indigo-50 hover:opacity-100' : ''}
                            ${j === 0 ? 'rounded-l-lg' : ''}
                            ${j === 6 ? 'rounded-r-lg' : ''}
                            ${viewMode === 'week' && !isSelectedWeek ? 'group-hover:text-white group-hover:opacity-100' : ''}
                          `}
                        >
                          <span className={innerClass}>
                            {format(day, 'd')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.div 
      ref={popoverRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex overflow-hidden`}
    >
      {/* Sidebar */}
      {!hideSidebar && (
        <div className="w-40 bg-gray-50 border-r border-gray-100 p-2 flex flex-col gap-1">
          {shortcuts.map(s => (
            <button
              key={s.label}
              onClick={() => onSelect(s.getValue())}
              className={`text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${(s.label === 'Today' && viewMode === 'day' && isSameDay(currentDate, new Date())) ||
                  (s.label === 'This week' && viewMode === 'week' && isSameDay(startOfWeek(currentDate, { weekStartsOn: 1 }), startOfWeek(new Date(), { weekStartsOn: 1 }))) ||
                  (s.label === 'This month' && viewMode === 'month' && isSameMonth(currentDate, new Date()))
                  ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}
              `}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Calendar */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setDisplayMonth(subMonths(displayMonth, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-400">
            <ChevronLeft size={20} />
          </button>
          <div className="flex gap-12">
            {renderMonth(displayMonth)}
            {!singleMonth && renderMonth(addMonths(displayMonth, 1))}
          </div>
          <button onClick={() => setDisplayMonth(addMonths(displayMonth, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-400">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function AddTimeEntryModal({ 
  user, 
  initialDate, 
  initialEntry,
  onClose,
  modules
}: { 
  user: User, 
  initialDate: Date, 
  initialEntry?: TimesheetEntry,
  onClose: () => void,
  modules: ModuleEntry[]
}) {
  const [formData, setFormData] = useState({
    date: initialEntry ? initialEntry.date : format(initialDate, 'yyyy-MM-dd'),
    startTime: initialEntry ? initialEntry.startTime : format(new Date(), 'HH:mm'),
    endTime: initialEntry ? initialEntry.endTime : format(addDays(new Date(), 0), 'HH:mm'),
    task: initialEntry ? initialEntry.task : '',
    moduleCode: initialEntry ? initialEntry.moduleCode : '',
    category: initialEntry ? initialEntry.category : '',
    description: initialEntry ? initialEntry.description || '' : ''
  });

  const selectedModule = modules.find(m => m.moduleCode === formData.moduleCode);
  const categories = selectedModule?.categories || [];
  const tasks = selectedModule?.tasks || [];

  useEffect(() => {
    if (formData.moduleCode && categories.length > 0 && !categories.includes(formData.category)) {
      setFormData(prev => ({ ...prev, category: categories[0] }));
    }
  }, [formData.moduleCode, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (initialEntry && initialEntry.id) {
        await updateDoc(doc(db, 'timesheets', initialEntry.id), {
          ...formData,
          duration: durationStr
        });
      } else {
        await addDoc(collection(db, 'timesheets'), {
          ...formData,
          userId: user.uid,
          duration: durationStr,
          status: 'pending'
        });
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, initialEntry ? OperationType.UPDATE : OperationType.CREATE, 'timesheets');
    }
  };

  const duration = Math.abs(differenceInMinutes(parseISO(`${formData.date}T${formData.endTime}`), parseISO(`${formData.date}T${formData.startTime}`)));
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  const durationStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">{initialEntry ? 'Edit time entry' : 'Add time entry'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-500">Time and date</p>
            <div className="flex items-center gap-3">
              <input 
                type="text" 
                readOnly
                className="w-24 p-2 bg-gray-50 border border-gray-200 rounded-lg text-center font-mono text-sm"
                value={durationStr}
              />
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1 px-2">
                <input 
                  type="time" 
                  className="outline-none text-sm"
                  value={formData.startTime}
                  onChange={e => setFormData({...formData, startTime: e.target.value})}
                />
                <span className="text-gray-400">-</span>
                <input 
                  type="time" 
                  className="outline-none text-sm"
                  value={formData.endTime}
                  onChange={e => setFormData({...formData, endTime: e.target.value})}
                />
              </div>
              <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2 px-3">
                <CalendarIconSmall size={16} className="text-gray-400" />
                <input 
                  type="date" 
                  className="outline-none text-sm w-full"
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Module *</label>
                <select 
                  required
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  value={formData.moduleCode}
                  onChange={e => {
                    const newModuleCode = e.target.value;
                    const newModuleData = modules.find(m => m.moduleCode === newModuleCode);
                    const newCategory = newModuleData?.categories?.[0] || '';
                    setFormData({
                      ...formData, 
                      moduleCode: newModuleCode,
                      category: newCategory,
                      task: ''
                    });
                  }}
                >
                  <option value="">Select Module</option>
                  {modules.map(m => <option key={m.id} value={m.moduleCode}>{m.moduleCode} - {m.moduleName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select 
                  required
                  className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value, task: ''})}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Task *</label>
              <select 
                required
                className="w-full p-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                value={formData.task}
                onChange={e => setFormData({...formData, task: e.target.value})}
              >
                <option value="">Select Task</option>
                {tasks.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea 
                placeholder="What have you worked on?"
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] resize-none"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-50 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              {initialEntry ? 'SAVE' : 'ADD'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function CalendarView({ timesheets, user, modules }: { timesheets: TimesheetEntry[], user: User, modules: ModuleEntry[], key?: string }) {
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEntry, setSelectedEntry] = useState<TimesheetEntry | undefined>(undefined);

  const next = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const prev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const getViewLabel = () => {
    if (viewMode === 'day') {
      if (isSameDay(currentDate, new Date())) return 'Today';
      if (isSameDay(currentDate, subDays(new Date(), 1))) return 'Yesterday';
      return format(currentDate, 'MMM d, yyyy');
    }
    if (viewMode === 'week') {
      if (isSameDay(startOfWeek(currentDate, { weekStartsOn: 1 }), startOfWeek(new Date(), { weekStartsOn: 1 }))) return 'This week';
      return `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d')}`;
    }
    if (viewMode === 'month') {
      if (isSameMonth(currentDate, new Date())) return 'This month';
      return format(currentDate, 'MMMM yyyy');
    }
    return '';
  };

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
      <div className="flex items-center gap-4 relative">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 transition-all font-bold text-gray-900 min-w-[140px]"
          >
            <CalendarIconSmall size={18} className="text-indigo-600" />
            <span>{getViewLabel()}</span>
          </button>
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            <button onClick={prev} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <button onClick={next} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        
        <AnimatePresence>
          {showDatePicker && (
            <DatePickerPopover 
              currentDate={currentDate} 
              viewMode={viewMode}
              onSelect={(date) => {
                setCurrentDate(date);
                setShowDatePicker(false);
              }}
              onClose={() => setShowDatePicker(false)}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
        <button 
          onClick={() => setViewMode('month')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <CalendarDays size={16} />
          Month
        </button>
        <button 
          onClick={() => setViewMode('week')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'week' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <CalendarRange size={16} />
          Week
        </button>
        <button 
          onClick={() => setViewMode('day')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <CalendarClock size={16} />
          Day
        </button>
      </div>
    </div>
  );

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    const rows: any[] = [];
    let days: any[] = [];

    calendarDays.forEach((day, i) => {
      const dayEntries = timesheets.filter(ts => isSameDay(parseISO(ts.date), day));
      
      days.push(
        <div 
          key={day.toString()} 
          onDoubleClick={() => {
            setSelectedDate(day);
            setSelectedEntry(undefined);
            setShowAddModal(true);
          }}
          className={`min-h-[120px] p-2 border-b border-r border-gray-100 transition-colors cursor-pointer select-none ${!isSameMonth(day, monthStart) ? 'bg-gray-50/50' : 'bg-white'} ${isSameDay(day, new Date()) ? 'bg-indigo-50/30' : 'hover:bg-gray-50/50'}`}
        >
          <div className="flex justify-between items-center mb-1">
            <span className={`text-sm font-semibold ${!isSameMonth(day, monthStart) ? 'text-gray-300' : isSameDay(day, new Date()) ? 'text-indigo-600' : 'text-gray-700'}`}>
              {format(day, 'd')}
            </span>
          </div>
          <div className="space-y-1">
            {dayEntries.slice(0, 3).map(ts => (
              <div 
                key={ts.id} 
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSelectedDate(day);
                  setSelectedEntry(ts);
                  setShowAddModal(true);
                }}
                className="text-[10px] p-1 bg-indigo-100 text-indigo-700 rounded border border-indigo-200 truncate font-medium hover:bg-indigo-200" 
                title={`${ts.moduleCode}: ${ts.category}, ${ts.task}`}
              >
                {ts.moduleCode}: {ts.category}, {ts.task}
              </div>
            ))}
            {dayEntries.length > 3 && (
              <div className="text-[10px] text-gray-400 pl-1">+{dayEntries.length - 3} more</div>
            )}
          </div>
        </div>
      );

      if ((i + 1) % 7 === 0) {
        rows.push(<div key={i} className="grid grid-cols-7">{days}</div>);
        days = [];
      }
    });

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">{d}</div>
          ))}
        </div>
        {rows}
      </div>
    );
  };

  const renderTimeGrid = (days: Date[]) => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[600px]">
        <div className="flex bg-gray-50 border-b border-gray-200 shrink-0">
          <div className="w-16 border-r border-gray-200"></div>
          {days.map(day => {
            const dayEntries = timesheets.filter(ts => isSameDay(parseISO(ts.date), day));
            const totalMinutes = dayEntries.reduce((acc, ts) => {
              const [startH, startM] = ts.startTime.split(':').map(Number);
              const [endH, endM] = ts.endTime.split(':').map(Number);
              return acc + ((endH * 60 + endM) - (startH * 60 + startM));
            }, 0);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

            return (
              <div key={day.toString()} className="flex-1 py-3 text-center border-r border-gray-100 last:border-r-0">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">{format(day, 'EEE, MMM d')}</div>
                <div className={`text-sm font-bold ${isSameDay(day, new Date()) ? 'text-indigo-600' : 'text-gray-900'}`}>{timeString}</div>
              </div>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto relative">
          <div className="flex min-h-full">
            <div className="w-16 bg-gray-50 border-r border-gray-200 shrink-0">
              {hours.map(h => (
                <div key={h} className="h-20 text-[10px] text-gray-400 text-right pr-2 pt-1 font-medium border-b border-gray-100">
                  {format(setHours(new Date(), h), 'h a')}
                </div>
              ))}
            </div>
            <div className="flex-1 flex relative">
              {days.map(day => {
                const dayEntries = timesheets.filter(ts => isSameDay(parseISO(ts.date), day));
                return (
                  <div 
                    key={day.toString()} 
                    onDoubleClick={() => {
                      setSelectedDate(day);
                      setSelectedEntry(undefined);
                      setShowAddModal(true);
                    }}
                    className="flex-1 border-r border-gray-100 last:border-r-0 relative group cursor-pointer select-none"
                  >
                    {hours.map(h => (
                      <div key={h} className="h-20 border-b border-gray-100 group-hover:bg-gray-50/30 transition-colors"></div>
                    ))}
                    {dayEntries.map(ts => {
                      const [startH, startM] = ts.startTime.split(':').map(Number);
                      const [endH, endM] = ts.endTime.split(':').map(Number);
                      const top = (startH * 80) + (startM / 60 * 80);
                      const duration = (endH * 60 + endM) - (startH * 60 + startM);
                      const height = (duration / 60 * 80);
                      
                      return (
                        <div 
                          key={ts.id}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(day);
                            setSelectedEntry(ts);
                            setShowAddModal(true);
                          }}
                          className="absolute left-1 right-1 bg-indigo-50 border-l-4 border-indigo-500 rounded p-1.5 overflow-hidden shadow-sm hover:z-10 hover:shadow-md transition-all cursor-pointer"
                          style={{ top: `${top}px`, height: `${height}px`, minHeight: '24px' }}
                        >
                          <div className="text-[10px] font-bold text-indigo-700 truncate">
                            {ts.moduleCode}: {ts.category}
                          </div>
                          <div className="text-[9px] text-indigo-600 truncate">{ts.task}</div>
                          <div className="text-[8px] text-indigo-400 mt-0.5">{ts.startTime} - {ts.endTime}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      {renderHeader()}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'week' && renderTimeGrid(eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) }))}
      {viewMode === 'day' && renderTimeGrid([currentDate])}

      <AnimatePresence>
        {showAddModal && (
          <AddTimeEntryModal 
            user={user} 
            initialDate={selectedDate} 
            initialEntry={selectedEntry}
            onClose={() => setShowAddModal(false)} 
            modules={modules}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AddModuleModal({ user, onClose, initialModule }: { user: User, onClose: () => void, initialModule?: ModuleEntry }) {
  const [formData, setFormData] = useState({
    moduleCode: initialModule?.moduleCode || '',
    moduleName: initialModule?.moduleName || '',
    programme: initialModule?.programme || '',
    status: initialModule?.status || 'Active',
    visibility: initialModule?.visibility || 'Public',
    categories: initialModule?.categories?.join(', ') || '',
    tasks: initialModule?.tasks?.join(', ') || '',
    estimatedHrs: initialModule?.estimatedHrs?.toString() || '0',
    rateGBP: initialModule?.rateGBP?.toString() || '0',
    description: initialModule?.description || '',
    note: initialModule?.note || '',
    remark: initialModule?.remark || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const moduleData = {
        userId: user.uid,
        moduleCode: formData.moduleCode,
        moduleName: formData.moduleName,
        programme: formData.programme,
        status: formData.status,
        visibility: formData.visibility,
        categories: formData.categories.split(',').map(s => s.trim()).filter(Boolean),
        tasks: formData.tasks.split(',').map(s => s.trim()).filter(Boolean),
        estimatedHrs: parseFloat(formData.estimatedHrs) || 0,
        rateGBP: parseFloat(formData.rateGBP) || 0,
        description: formData.description,
        note: formData.note,
        remark: formData.remark
      };

      if (initialModule?.id) {
        await updateDoc(doc(db, 'modules', initialModule.id), moduleData);
      } else {
        await addDoc(collection(db, 'modules'), moduleData);
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, initialModule ? OperationType.UPDATE : OperationType.CREATE, 'modules');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800">
            {initialModule ? 'Edit Module' : 'Create New Module'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Module Code *</label>
              <input
                required
                type="text"
                value={formData.moduleCode}
                onChange={e => setFormData({...formData, moduleCode: e.target.value})}
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Module Name *</label>
              <input
                required
                type="text"
                value={formData.moduleName}
                onChange={e => setFormData({...formData, moduleName: e.target.value})}
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Programme *</label>
              <input
                required
                type="text"
                value={formData.programme}
                onChange={e => setFormData({...formData, programme: e.target.value})}
                className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>
            {initialModule && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
                >
                  <option value="Active">Active</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>
            )}
          </div>

          {initialModule && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
                  <select
                    value={formData.visibility}
                    onChange={e => setFormData({...formData, visibility: e.target.value})}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
                  >
                    <option value="Public">Public</option>
                    <option value="Private">Private</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.estimatedHrs}
                    onChange={e => setFormData({...formData, estimatedHrs: e.target.value})}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rate (GBP)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.rateGBP}
                    onChange={e => setFormData({...formData, rateGBP: e.target.value})}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categories (comma separated)</label>
                  <input
                    type="text"
                    value={formData.categories}
                    onChange={e => setFormData({...formData, categories: e.target.value})}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tasks (comma separated)</label>
                <input
                  type="text"
                  value={formData.tasks}
                  onChange={e => setFormData({...formData, tasks: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                  <textarea
                    value={formData.note}
                    onChange={e => setFormData({...formData, note: e.target.value})}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
                  <textarea
                    value={formData.remark}
                    onChange={e => setFormData({...formData, remark: e.target.value})}
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-sky-500 focus:border-sky-500"
                    rows={2}
                  />
                </div>
              </div>
            </>
          )}

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-sky-500 hover:bg-sky-600 text-white px-6 py-2 rounded font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'SAVING...' : 'SAVE MODULE'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ModulesView({ user, modules, timesheets, isAdmin, onModuleClick }: { user: User, modules: ModuleEntry[], timesheets: TimesheetEntry[], isAdmin: boolean, key?: string, onModuleClick?: (module: ModuleEntry) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [moduleCodeFilter, setModuleCodeFilter] = useState('');
  const [moduleNameFilter, setModuleNameFilter] = useState('');
  const [programmeFilter, setProgrammeFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleEntry | undefined>(undefined);

  const [sortField, setSortField] = useState<string>('moduleCode');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [modulesToDelete, setModulesToDelete] = useState<ModuleEntry[]>([]);

  // Calculate tracked hours for each module
  const moduleStats = useMemo(() => {
    const stats: Record<string, { tracked: number }> = {};
    modules.forEach(m => {
      const moduleTimesheets = timesheets.filter(ts => ts.moduleCode === m.moduleCode);
      const trackedMinutes = moduleTimesheets.reduce((total, ts) => {
        const start = parseISO(`2000-01-01T${ts.startTime}`);
        const end = parseISO(`2000-01-01T${ts.endTime}`);
        return total + differenceInMinutes(end, start);
      }, 0);
      stats[m.moduleCode] = { tracked: trackedMinutes / 60 };
    });
    return stats;
  }, [modules, timesheets]);

  const filteredModules = modules.filter(m => {
    const matchesSearch = m.moduleName.toLowerCase().includes(searchTerm.toLowerCase()) || m.moduleCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' ? true : m.status === statusFilter;
    const matchesCode = moduleCodeFilter ? m.moduleCode === moduleCodeFilter : true;
    const matchesName = moduleNameFilter ? m.moduleName === moduleNameFilter : true;
    const matchesProg = programmeFilter ? m.programme === programmeFilter : true;
    return matchesSearch && matchesStatus && matchesCode && matchesName && matchesProg;
  });

  const sortedModules = [...filteredModules].sort((a, b) => {
    let valA: any = a[sortField as keyof ModuleEntry];
    let valB: any = b[sortField as keyof ModuleEntry];

    if (sortField === 'tracked') {
      valA = moduleStats[a.moduleCode]?.tracked || 0;
      valB = moduleStats[b.moduleCode]?.tracked || 0;
    } else if (sortField === 'progress') {
      const trackedA = moduleStats[a.moduleCode]?.tracked || 0;
      valA = a.estimatedHrs ? Math.min(100, Math.round((trackedA / a.estimatedHrs) * 100)) : 0;
      const trackedB = moduleStats[b.moduleCode]?.tracked || 0;
      valB = b.estimatedHrs ? Math.min(100, Math.round((trackedB / b.estimatedHrs) * 100)) : 0;
    } else if (typeof valA === 'string' && typeof valB === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const uniqueCodes = Array.from(new Set(modules.map(m => m.moduleCode)));
  const uniqueNames = Array.from(new Set(modules.map(m => m.moduleName)));
  const uniqueProgs = Array.from(new Set(modules.map(m => m.programme)));

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const exportMenuRef = React.useRef<HTMLDivElement>(null);

  const allColumns = [
    { id: 'moduleCode', label: 'Module Code' },
    { id: 'moduleName', label: 'Module Name' },
    { id: 'programme', label: 'Programme' },
    { id: 'visibility', label: 'Visibility' },
    { id: 'categories', label: 'Categories' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'tracked', label: 'Tracked (hrs)' },
    { id: 'estimated', label: 'Estimated (hrs)' },
    { id: 'claimed', label: 'Claimed (hrs)' },
    { id: 'remaining', label: 'Remaining (hrs)' },
    { id: 'overage', label: 'Overage (hrs)' },
    { id: 'progress', label: 'Progress (%)' },
    { id: 'rate', label: 'Rate (GBP)' },
    { id: 'amount', label: 'Amount (GBP)' },
    { id: 'description', label: 'Description' },
    { id: 'note', label: 'Note' },
    { id: 'remark', label: 'Remark' }
  ];

  const [selectedColumns, setSelectedColumns] = useState<string[]>(allColumns.map(c => c.id));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getExportData = () => {
    const headers = allColumns.filter(c => selectedColumns.includes(c.id)).map(c => c.label);
    const rows = sortedModules.map(m => {
      const tracked = moduleStats[m.moduleCode]?.tracked || 0;
      const progress = m.estimatedHrs ? Math.min(100, Math.round((tracked / m.estimatedHrs) * 100)) : 0;
      const remaining = Math.max(0, m.estimatedHrs - tracked);
      const overage = Math.max(0, tracked - m.estimatedHrs);
      const amount = tracked * m.rateGBP;
      
      const rowData: any = {};
      if (selectedColumns.includes('moduleCode')) rowData.moduleCode = m.moduleCode;
      if (selectedColumns.includes('moduleName')) rowData.moduleName = m.moduleName;
      if (selectedColumns.includes('programme')) rowData.programme = m.programme;
      if (selectedColumns.includes('status')) rowData.status = m.status;
      if (selectedColumns.includes('visibility')) rowData.visibility = m.visibility;
      if (selectedColumns.includes('categories')) rowData.categories = m.categories.join('; ');
      if (selectedColumns.includes('tasks')) rowData.tasks = m.tasks.join('; ');
      if (selectedColumns.includes('tracked')) rowData.tracked = tracked.toFixed(2);
      if (selectedColumns.includes('estimated')) rowData.estimated = m.estimatedHrs;
      if (selectedColumns.includes('claimed')) rowData.claimed = 0;
      if (selectedColumns.includes('remaining')) rowData.remaining = remaining.toFixed(2);
      if (selectedColumns.includes('overage')) rowData.overage = overage.toFixed(2);
      if (selectedColumns.includes('progress')) rowData.progress = progress;
      if (selectedColumns.includes('rate')) rowData.rate = m.rateGBP;
      if (selectedColumns.includes('amount')) rowData.amount = amount.toFixed(2);
      if (selectedColumns.includes('description')) rowData.description = m.description;
      if (selectedColumns.includes('note')) rowData.note = m.note;
      if (selectedColumns.includes('remark')) rowData.remark = m.remark;
      
      return allColumns.filter(c => selectedColumns.includes(c.id)).map(c => rowData[c.id]);
    });
    return [headers, ...rows];
  };

  const handleExportCSV = () => {
    const data = getExportData();
    const csvContent = data.map(e => e.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `modules_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleExportXLSX = () => {
    const wsData = getExportData();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modules");
    XLSX.writeFile(wb, `modules_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    setShowExportMenu(false);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <div className="flex flex-col ml-1 opacity-30"><ChevronUp size={10} className="-mb-1" /><ChevronDown size={10} /></div>;
    return sortDirection === 'asc' 
      ? <div className="flex flex-col ml-1"><ChevronUp size={10} className="text-gray-800 -mb-1" /><ChevronDown size={10} className="opacity-30" /></div>
      : <div className="flex flex-col ml-1"><ChevronUp size={10} className="opacity-30 -mb-1" /><ChevronDown size={10} className="text-gray-800" /></div>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Modules</h1>
        <button 
          onClick={() => { setSelectedModule(undefined); setShowAddModal(true); }}
          className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          CREATE NEW MODULE
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded flex items-center p-2 gap-4 text-sm">
        <span className="text-gray-500 font-medium px-2">FILTER</span>
        
        <select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value)}
          className="border-none bg-transparent focus:ring-0 text-gray-700 font-medium cursor-pointer"
        >
          <option value="Active">Active</option>
          <option value="Archived">Archived</option>
          <option value="All">All</option>
        </select>

        <select 
          value={moduleCodeFilter} 
          onChange={e => setModuleCodeFilter(e.target.value)}
          className="border-none bg-transparent focus:ring-0 text-gray-700 font-medium cursor-pointer"
        >
          <option value="">Module Code</option>
          {uniqueCodes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select 
          value={moduleNameFilter} 
          onChange={e => setModuleNameFilter(e.target.value)}
          className="border-none bg-transparent focus:ring-0 text-gray-700 font-medium cursor-pointer"
        >
          <option value="">Module Name</option>
          {uniqueNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <select 
          value={programmeFilter} 
          onChange={e => setProgrammeFilter(e.target.value)}
          className="border-none bg-transparent focus:ring-0 text-gray-700 font-medium cursor-pointer"
        >
          <option value="">Programme</option>
          {uniqueProgs.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <div className="flex-1 flex items-center border border-gray-200 rounded px-3 py-1.5 ml-auto max-w-xs">
          <Search size={16} className="text-gray-400 mr-2" />
          <input 
            type="text" 
            placeholder="Find by name" 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="border-none bg-transparent focus:ring-0 p-0 w-full text-sm"
          />
        </div>
        <button className="text-sky-500 border border-sky-500 px-4 py-1.5 rounded hover:bg-sky-50 transition-colors">
          APPLY FILTER
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded">
        <div className="flex justify-between items-center p-3 border-b border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-500 font-medium">Modules</span>
          <div className="relative" ref={exportMenuRef}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)} 
              className="text-xs text-gray-600 flex items-center gap-1 hover:text-gray-900"
            >
              Export <ChevronDown size={14} className={`transform transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showExportMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full right-0 mt-2 w-40 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50"
                >
                  <button 
                    onClick={handleExportCSV}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    Save as CSV
                  </button>
                  <button 
                    onClick={handleExportXLSX}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    Save as Excel
                  </button>
                  <button 
                    onClick={() => {
                      setShowExportMenu(false);
                      setShowCustomizeModal(true);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    Customize
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        {selectedModuleIds.length > 0 && (
          <div className="bg-[#1e1e1e] text-white p-3 flex items-center gap-4 text-sm">
            <span className="font-medium">All {selectedModuleIds.length} item selected</span>
            <div className="w-px h-4 bg-gray-600"></div>
            <button 
              onClick={async () => {
                try {
                  await Promise.all(selectedModuleIds.map(id => updateDoc(doc(db, 'modules', id), { status: 'Archived' })));
                  setSelectedModuleIds([]);
                } catch (error) {
                  handleFirestoreError(error, OperationType.UPDATE, 'modules');
                }
              }}
              className="flex items-center gap-1.5 hover:text-gray-300 transition-colors"
            >
              <Archive size={14} /> Archive
            </button>
            <button 
              onClick={() => {
                const modulesToDel = modules.filter(m => selectedModuleIds.includes(m.id));
                setModulesToDelete(modulesToDel);
              }}
              className="flex items-center gap-1.5 hover:text-gray-300 transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
            <button 
              onClick={() => setSelectedModuleIds([])} 
              className="ml-auto hover:text-gray-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="overflow-visible">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-white border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300"
                    checked={sortedModules.length > 0 && selectedModuleIds.length === sortedModules.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedModuleIds(sortedModules.map(m => m.id));
                      } else {
                        setSelectedModuleIds([]);
                      }
                    }}
                  />
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('moduleCode')}>
                  <div className="flex items-center">MODULE CODE <SortIcon field="moduleCode" /></div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('moduleName')}>
                  <div className="flex items-center">MODULE NAME <SortIcon field="moduleName" /></div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('programme')}>
                  <div className="flex items-center">PROGRAMME <SortIcon field="programme" /></div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('tracked')}>
                  <div className="flex items-center">TRACKED <SortIcon field="tracked" /></div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-50" onClick={() => handleSort('progress')}>
                  <div className="flex items-center">PROGRESS <SortIcon field="progress" /></div>
                </th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {sortedModules.map(module => {
                const tracked = moduleStats[module.moduleCode]?.tracked || 0;
                const progress = module.estimatedHrs ? Math.min(100, Math.round((tracked / module.estimatedHrs) * 100)) : 0;
                const isArchived = module.status === 'Archived';
                
                return (
                  <tr key={module.id} className={`border-b border-gray-100 ${isArchived ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300"
                        checked={selectedModuleIds.includes(module.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedModuleIds([...selectedModuleIds, module.id]);
                          } else {
                            setSelectedModuleIds(selectedModuleIds.filter(id => id !== module.id));
                          }
                        }}
                      />
                    </td>
                    <td 
                      className={`px-4 py-3 font-medium text-gray-900 flex items-center gap-2 ${isArchived ? '' : 'cursor-pointer hover:text-indigo-600'}`}
                      onClick={() => !isArchived && onModuleClick && onModuleClick(module)}
                    >
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      {module.moduleCode}
                    </td>
                    <td 
                      className={`px-4 py-3 text-gray-600 ${isArchived ? '' : 'cursor-pointer hover:text-indigo-600'}`}
                      onClick={() => !isArchived && onModuleClick && onModuleClick(module)}
                    >
                      {module.moduleName}
                    </td>
                    <td 
                      className={`px-4 py-3 text-gray-600 ${isArchived ? '' : 'cursor-pointer hover:text-indigo-600'}`}
                      onClick={() => !isArchived && onModuleClick && onModuleClick(module)}
                    >
                      {module.programme || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{tracked.toFixed(2)}h</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="flex items-center gap-2">
                        <span className="w-12">{progress}%</span>
                        <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-400 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      <div className="flex items-center gap-3 relative justify-end">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdownId(openDropdownId === module.id ? null : module.id);
                          }}
                          className="hover:text-gray-600 transition-colors"
                        >
                          <MoreVertical size={16} />
                        </button>
                        <AnimatePresence>
                          {openDropdownId === module.id && (
                            <motion.div 
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 5 }}
                              className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50"
                            >
                              {isArchived ? (
                                <>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(null);
                                      // Handle set as template
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                  >
                                    Set as template
                                  </button>
                                  <button 
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(null);
                                      try {
                                        await updateDoc(doc(db, 'modules', module.id), { status: 'Active' });
                                      } catch (error) {
                                        handleFirestoreError(error, OperationType.UPDATE, 'modules');
                                      }
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                  >
                                    Restore
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(null);
                                      setModulesToDelete([module]);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(null);
                                      setSelectedModule(module);
                                      setShowAddModal(true);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(null);
                                      // Handle set as template
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                  >
                                    Set as template
                                  </button>
                                  <button 
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(null);
                                      try {
                                        await updateDoc(doc(db, 'modules', module.id), { status: 'Archived' });
                                      } catch (error) {
                                        handleFirestoreError(error, OperationType.UPDATE, 'modules');
                                      }
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                  >
                                    Archive
                                  </button>
                                </>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedModules.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No modules found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <AddModuleModal 
            user={user} 
            onClose={() => setShowAddModal(false)} 
            initialModule={selectedModule}
          />
        )}
        {showCustomizeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            >
              <div className="flex justify-between items-center p-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">Customize Export Columns</h2>
                <button onClick={() => setShowCustomizeModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                <div className="mb-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.length === allColumns.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedColumns(allColumns.map(c => c.id));
                        } else {
                          setSelectedColumns([]);
                        }
                      }}
                      className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    />
                    <span className="text-gray-700 font-medium">Select all</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 pl-8">
                  {allColumns.map(col => (
                    <label key={col.id} className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={selectedColumns.includes(col.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedColumns([...selectedColumns, col.id]);
                          } else {
                            setSelectedColumns(selectedColumns.filter(id => id !== col.id));
                          }
                        }}
                        className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-600">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button 
                  onClick={() => setShowCustomizeModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setShowCustomizeModal(false)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {modulesToDelete.length > 0 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1e1e1e] rounded-xl shadow-xl border border-gray-800 w-full max-w-md overflow-hidden"
            >
              <div className="flex justify-between items-center p-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold text-white">Delete Module{modulesToDelete.length > 1 ? 's' : ''}</h2>
                <button onClick={() => setModulesToDelete([])} className="text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <p className="text-gray-300 text-sm">
                  Are you sure you want to delete {modulesToDelete.length === 1 ? `${modulesToDelete[0].moduleName} (${modulesToDelete[0].moduleCode})` : `${modulesToDelete.length} modules`}?
                </p>
                
                <div className="bg-[#2a241e] border border-[#4a3f32] rounded-lg p-4 mt-4">
                  <div className="flex items-center gap-2 text-amber-500 font-medium text-sm mb-2">
                    <AlertCircle size={16} />
                    This action cannot be reversed
                  </div>
                  <p className="text-gray-300 text-xs">
                    Deleting the Module will cause it to be removed from all Time Entries it has been added to.
                  </p>
                </div>
                
                <p className="text-gray-400 text-sm mt-4">
                  Consider archiving it instead. Archiving will prevent you from adding more time to the Module, but will still allow for reporting.
                </p>
              </div>
              
              <div className="p-4 flex flex-col gap-2">
                <button 
                  onClick={async () => {
                    try {
                      await Promise.all(modulesToDelete.map(m => updateDoc(doc(db, 'modules', m.id), { status: 'Archived' })));
                      setModulesToDelete([]);
                      setSelectedModuleIds([]);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.UPDATE, 'modules');
                    }
                  }}
                  className="w-full py-2.5 rounded-lg border border-gray-700 text-red-400 hover:bg-gray-800 transition-colors font-medium"
                >
                  Archive instead
                </button>
                <button 
                  onClick={async () => {
                    try {
                      // Delete modules
                      await Promise.all(modulesToDelete.map(m => deleteDoc(doc(db, 'modules', m.id))));
                      
                      // Delete associated timesheets
                      const timesheetsToDelete = timesheets.filter(ts => modulesToDelete.some(m => m.moduleCode === ts.moduleCode));
                      await Promise.all(timesheetsToDelete.map(ts => deleteDoc(doc(db, 'timesheets', ts.id))));
                      
                      setModulesToDelete([]);
                      setSelectedModuleIds([]);
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, 'modules');
                    }
                  }}
                  className="w-full py-2.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-medium"
                >
                  Delete
                </button>
                <button 
                  onClick={() => setModulesToDelete([])}
                  className="w-full py-2.5 rounded-lg border border-gray-700 text-white hover:bg-gray-800 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TimesheetView({ user, timesheets, modules, isAdmin }: { user: User, timesheets: TimesheetEntry[], modules: ModuleEntry[], isAdmin: boolean, key?: string }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  
  const next = () => setCurrentDate(addWeeks(currentDate, 1));
  const prev = () => setCurrentDate(subWeeks(currentDate, 1));
  
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const dateLabel = `${format(weekStart, 'dd/MM/yyyy')} - ${format(weekEnd, 'dd/MM/yyyy')}`;

  const getRelativeWeekLabel = () => {
    if (isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }))) return 'This week';
    if (isSameDay(weekStart, startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }))) return 'Last week';
    return `Week of ${format(weekStart, 'MMM d')}`;
  };

  const displayLabel = showCalendar ? dateLabel : getRelativeWeekLabel();

  const weekTimesheets = timesheets.filter(ts => {
    const tsDate = parseISO(ts.date);
    return isWithinInterval(tsDate, { start: weekStart, end: weekEnd });
  });

  const summary = weekTimesheets.reduce((acc: any, ts) => {
    if (!acc[ts.moduleCode]) acc[ts.moduleCode] = { categories: {}, tasks: {} };
    if (!acc[ts.moduleCode].categories[ts.category]) acc[ts.moduleCode].categories[ts.category] = 0;
    
    let durationHours = 0;
    if (ts.duration) {
      const parts = ts.duration.split(':');
      if (parts.length === 3) {
        durationHours = parseInt(parts[0]) + parseInt(parts[1]) / 60 + parseInt(parts[2]) / 3600;
      }
    } else {
      const [startH, startM] = ts.startTime.split(':').map(Number);
      const [endH, endM] = ts.endTime.split(':').map(Number);
      let diff = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
      if (diff < 0) diff += 24;
      durationHours = diff;
    }
    
    acc[ts.moduleCode].categories[ts.category] += durationHours;
    
    const taskKey = `${ts.category}-${ts.task}`;
    if (!acc[ts.moduleCode].tasks[taskKey]) {
      acc[ts.moduleCode].tasks[taskKey] = { category: ts.category, task: ts.task, hours: 0, descriptions: [] };
    }
    acc[ts.moduleCode].tasks[taskKey].hours += durationHours;
    if (ts.description && ts.description.trim() !== '') {
      acc[ts.moduleCode].tasks[taskKey].descriptions.push(ts.description.trim());
    }
    
    return acc;
  }, {});

  const allModuleCategories = Array.from(new Set(modules.flatMap(m => m.categories || [])));
  const allTimesheetCategories = Array.from(new Set(weekTimesheets.map(ts => ts.category)));
  
  let displayCategories = Array.from(new Set([...allModuleCategories, ...allTimesheetCategories]));
  if (displayCategories.length === 0) {
    displayCategories = ['Development', 'Meeting', 'Research', 'Admin', 'Other'];
  }

  const totalByCategory = displayCategories.reduce((acc: any, cat) => {
    acc[cat] = 0;
    return acc;
  }, {});

  Object.values(summary).forEach((mod: any) => {
    Object.entries(mod.categories).forEach(([cat, hours]: any) => {
      if (totalByCategory[cat] === undefined) {
        totalByCategory[cat] = 0;
        if (!displayCategories.includes(cat)) displayCategories.push(cat);
      }
      totalByCategory[cat] += hours;
    });
  });

  const grandTotal = Object.values(totalByCategory).reduce((a: any, b: any) => a + b, 0) as number;

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const exportMenuRef = React.useRef<HTMLDivElement>(null);

  const allColumns = [
    { id: 'date', label: 'Date' },
    { id: 'moduleName', label: 'Module Names' },
    { id: 'moduleCode', label: 'Module Codes' },
    { id: 'category', label: 'Categories' },
    { id: 'startTime', label: 'Start Time' },
    { id: 'endTime', label: 'End Time' },
    { id: 'hours', label: 'Hours' },
    { id: 'notes', label: 'Notes' }
  ];

  const [selectedColumns, setSelectedColumns] = useState<string[]>(allColumns.map(c => c.id));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotesForTimesheet = (ts: TimesheetEntry) => {
    let hours = 0;
    if (ts.duration) {
      const parts = ts.duration.split(':');
      if (parts.length === 3) {
        hours = parseInt(parts[0]) + parseInt(parts[1]) / 60 + parseInt(parts[2]) / 3600;
      }
    } else {
      const [startH, startM] = ts.startTime.split(':').map(Number);
      const [endH, endM] = ts.endTime.split(':').map(Number);
      hours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
      if (hours < 0) hours += 24;
    }
    const descStr = ts.description && ts.description.trim() !== '' ? ` (${ts.description.trim()})` : '';
    return `${ts.category}: ${ts.task} ${hours.toFixed(2)} hrs${descStr}`;
  };

  const getExportData = () => {
    const headers = allColumns.filter(c => selectedColumns.includes(c.id)).map(c => c.label);
    const rows = weekTimesheets.map(ts => {
      let hours = 0;
      if (ts.duration) {
        const parts = ts.duration.split(':');
        if (parts.length === 3) {
          hours = parseInt(parts[0]) + parseInt(parts[1]) / 60 + parseInt(parts[2]) / 3600;
        }
      } else {
        const [startH, startM] = ts.startTime.split(':').map(Number);
        const [endH, endM] = ts.endTime.split(':').map(Number);
        hours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
        if (hours < 0) hours += 24;
      }
      
      const rowData: any = {};
      if (selectedColumns.includes('date')) rowData.date = ts.date;
      if (selectedColumns.includes('moduleName')) rowData.moduleName = ts.moduleCode; // Fallback to code
      if (selectedColumns.includes('moduleCode')) rowData.moduleCode = ts.moduleCode;
      if (selectedColumns.includes('category')) rowData.category = ts.category;
      if (selectedColumns.includes('startTime')) rowData.startTime = ts.startTime;
      if (selectedColumns.includes('endTime')) rowData.endTime = ts.endTime;
      if (selectedColumns.includes('hours')) rowData.hours = hours.toFixed(2);
      if (selectedColumns.includes('notes')) rowData.notes = getNotesForTimesheet(ts);
      
      return allColumns.filter(c => selectedColumns.includes(c.id)).map(c => rowData[c.id]);
    });
    return [headers, ...rows];
  };

  const handleExportCSV = () => {
    const data = getExportData();
    const csvContent = data.map(e => e.map((val: any) => `"${val}"`).join(",")).join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `timesheets_${format(weekStart, 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const handleExportXLSX = () => {
    const wsData = getExportData();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timesheets");
    XLSX.writeFile(wb, `timesheets_${format(weekStart, 'yyyy-MM-dd')}.xlsx`);
    setShowExportMenu(false);
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Timesheets</h2>
        </div>
        <div className="relative flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
          <div 
            className="flex items-center gap-2 px-3 py-1.5 text-gray-600 cursor-pointer"
            onClick={() => setShowCalendar(!showCalendar)}
          >
            <CalendarRange size={18} />
            <span className="text-sm font-medium">
              {displayLabel}
            </span>
          </div>
          <div className="flex border-l border-gray-200">
            <button onClick={prev} className="p-2 hover:bg-gray-50 text-gray-500"><ChevronLeft size={18} /></button>
            <button onClick={next} className="p-2 hover:bg-gray-50 text-gray-500"><ChevronRight size={18} /></button>
          </div>
          <AnimatePresence>
            {showCalendar && (
              <DatePickerPopover 
                currentDate={currentDate} 
                viewMode="week"
                align="right"
                onSelect={(date) => {
                  setCurrentDate(date);
                  setShowCalendar(false);
                }}
                onClose={() => setShowCalendar(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 text-sm uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Modules</th>
                {displayCategories.map(cat => <th key={cat} className="px-6 py-4 font-medium">{cat}</th>)}
                <th className="px-6 py-4 font-medium">Totals</th>
                <th className="px-6 py-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(summary).map(([moduleCode, data]: any) => {
                const moduleTotal = Object.values(data.categories as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
                const formattedNotes = Object.values(data.tasks as Record<string, any>).reduce((acc: any, task: any) => {
                  if (!acc[task.category]) acc[task.category] = [];
                  const descStr = task.descriptions && task.descriptions.length > 0 ? ` (${task.descriptions.join(', ')})` : '';
                  acc[task.category].push(`${task.task} ${task.hours.toFixed(2)} hrs${descStr}`);
                  return acc;
                }, {});
                
                const notesString = Object.entries(formattedNotes).map(([cat, tasks]: any) => 
                  `${cat}: ${tasks.join(', ')}`
                ).join('; ');

                return (
                  <tr key={moduleCode} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-900 font-medium">{moduleCode}</td>
                    {displayCategories.map(cat => (
                      <td key={cat} className="px-6 py-4 text-gray-600">
                        {data.categories[cat] ? (data.categories[cat] as number).toFixed(2) : '-'}
                      </td>
                    ))}
                    <td className="px-6 py-4 text-gray-900 font-bold">{moduleTotal.toFixed(2)}</td>
                    <td className="px-6 py-4 text-gray-600 text-xs max-w-xs">{notesString}</td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-bold">
                <td className="px-6 py-4">Total</td>
                {displayCategories.map(cat => (
                  <td key={cat} className="px-6 py-4">{(totalByCategory[cat] as number).toFixed(2)}</td>
                ))}
                <td className="px-6 py-4">{grandTotal > 0 ? grandTotal.toFixed(2) : ''}</td>
                <td className="px-6 py-4"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-4 flex justify-between items-center">
        <div className="relative" ref={exportMenuRef}>
          <button 
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg shadow-sm hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            Export
            <ChevronRight size={16} className={`transform transition-transform ${showExportMenu ? 'rotate-90' : ''}`} />
          </button>
          <AnimatePresence>
            {showExportMenu && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 mt-2 w-40 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50"
              >
                <button 
                  onClick={handleExportCSV}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                >
                  Save as CSV
                </button>
                <button 
                  onClick={handleExportXLSX}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                >
                  Save as Excel
                </button>
                <div className="border-t border-gray-100 my-1"></div>
                <button 
                  onClick={() => {
                    setShowCustomizeModal(true);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                >
                  Customize...
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showCustomizeModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-100">
                <h3 className="text-xl font-bold text-gray-900">Timesheet export settings</h3>
                <button 
                  onClick={() => setShowCustomizeModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6">
                <div className="mb-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedColumns.length === allColumns.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedColumns(allColumns.map(c => c.id));
                        } else {
                          setSelectedColumns([]);
                        }
                      }}
                      className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    />
                    <span className="text-gray-700 font-medium">Select all</span>
                  </label>
                </div>
                
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 pl-8">
                  {allColumns.map(col => (
                    <label key={col.id} className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={selectedColumns.includes(col.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedColumns([...selectedColumns, col.id]);
                          } else {
                            setSelectedColumns(selectedColumns.filter(id => id !== col.id));
                          }
                        }}
                        className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      />
                      <span className="text-gray-600">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                <button 
                  onClick={() => setShowCustomizeModal(false)}
                  className="px-6 py-2 text-indigo-600 font-medium hover:bg-indigo-50 rounded-lg transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={() => setShowCustomizeModal(false)}
                  className="px-6 py-2 bg-[#42b9f5] text-white font-medium rounded-lg hover:bg-[#31a8e4] transition-colors"
                >
                  SAVE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TimeTrackerView({ user, modules }: { user: User, modules: ModuleEntry[], key?: string }) {
  const [mode, setMode] = useState<'timer' | 'manual'>('timer');
  const [moduleCode, setModuleCode] = useState('');
  const [category, setCategory] = useState('');
  const [task, setTask] = useState('');
  const [timesheets, setTimesheets] = useState<any[]>([]);
  
  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<any | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [bulkEditDates, setBulkEditDates] = useState<string[]>([]);
  const timerMenuRef = React.useRef<HTMLDivElement>(null);
  const listMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'timesheets'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc'),
      orderBy('startTime', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTimesheets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error fetching timesheets: ", error);
    });
    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timerMenuRef.current && !timerMenuRef.current.contains(event.target as Node)) {
        setShowTimerMenu(false);
        setShowDiscardConfirm(false);
      }
      if (listMenuRef.current && !listMenuRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Manual state
  const [manualStartTime, setManualStartTime] = useState(format(new Date(), 'HH:mm'));
  const [manualEndTime, setManualEndTime] = useState(format(new Date(), 'HH:mm'));
  const [manualDate, setManualDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [manualDateInput, setManualDateInput] = useState('');
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState('');
  const [manualDurationInput, setManualDurationInput] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const calculateManualDuration = () => {
    try {
      const start = parseISO(`1970-01-01T${manualStartTime}`);
      const end = parseISO(`1970-01-01T${manualEndTime}`);
      let diff = (end.getTime() - start.getTime()) / 1000;
      if (diff < 0) diff += 24 * 3600; // Handle overnight
      return formatTime(diff);
    } catch (e) {
      return '00:00:00';
    }
  };

  const handleStartStop = () => {
    if (isTimerRunning) {
      setIsTimerRunning(false);
      // Automatically add timesheet entry when stopping
      if (moduleCode && category && task && timerSeconds > 0) {
        const now = new Date();
        const start = new Date(now.getTime() - timerSeconds * 1000);
        
        addDoc(collection(db, 'timesheets'), {
          userId: user.uid,
          moduleCode,
          category,
          task,
          date: format(now, 'yyyy-MM-dd'),
          startTime: format(start, 'HH:mm'),
          endTime: format(now, 'HH:mm'),
          duration: formatTime(timerSeconds),
          status: 'pending'
        }).then(() => {
          setTimerSeconds(0);
          setModuleCode('');
          setCategory('');
          setTask('');
        }).catch(error => {
          console.error("Error adding document: ", error);
        });
      }
    } else {
      setIsTimerRunning(true);
    }
  };

  const handleAddManual = async () => {
    if (!moduleCode || !category || !task) return;
    
    let finalStartTime = manualStartTime;
    let finalEndTime = manualEndTime;
    let finalDuration = customDuration || calculateManualDuration();

    if (customDuration) {
      try {
        const parts = customDuration.split(':');
        if (parts.length === 3) {
          const durationSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
          const end = parseISO(`1970-01-01T${manualEndTime}`);
          const start = new Date(end.getTime() - durationSeconds * 1000);
          finalStartTime = format(start, 'HH:mm');
        }
      } catch (e) {}
    }

    try {
      await addDoc(collection(db, 'timesheets'), {
        userId: user.uid,
        moduleCode,
        category,
        task,
        date: format(manualDate, 'yyyy-MM-dd'),
        startTime: finalStartTime,
        endTime: finalEndTime,
        duration: finalDuration,
        status: 'pending'
      });
      // Reset
      setModuleCode('');
      setCategory('');
      setTask('');
      setCustomDuration('');
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };

  const selectedModuleData = modules.find(m => m.moduleCode === moduleCode);
  const availableCategories = selectedModuleData?.categories || [];
  const availableTasks = selectedModuleData?.tasks || [];

  useEffect(() => {
    if (moduleCode && availableCategories.length > 0 && !availableCategories.includes(category)) {
      setCategory(availableCategories[0]);
    }
  }, [moduleCode, availableCategories, category]);

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Time Tracker</h2>
      </div>

      <div className="bg-white rounded-sm shadow-sm border border-gray-200 p-3 flex items-center justify-between">
        {/* Left side: Inputs */}
        <div className="flex items-center flex-1 gap-2">
          {!moduleCode ? (
            <div className="relative">
              <button 
                className="flex items-center gap-1 text-[#00a8ff] hover:text-blue-600 font-medium text-sm px-2 py-1"
                onClick={() => {
                  // In a real app, this would open a dropdown to select a project
                  // For now, we'll just set it to the first mock module to simulate selection
                  setModuleCode(modules[0]?.moduleCode || '');
                }}
              >
                <PlusCircle size={16} />
                Module
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={moduleCode}
                onChange={(e) => {
                  setModuleCode(e.target.value);
                  setCategory('');
                  setTask('');
                }}
                className="border-0 bg-transparent focus:ring-0 text-sm text-[#00a8ff] font-medium w-auto cursor-pointer"
              >
                {modules.map(m => <option key={m.id} value={m.moduleCode}>{m.moduleCode} - {m.moduleName}</option>)}
              </select>
            </div>
          )}
          
          {moduleCode && (
            <>
              <select 
                value={category} 
                onChange={(e) => {
                  setCategory(e.target.value);
                  setTask('');
                }}
                className="border-0 bg-transparent focus:ring-0 text-sm text-gray-600 w-32 cursor-pointer"
              >
                <option value="">Category</option>
                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </>
          )}
          
          {moduleCode && category && (
            <>
              <select 
                value={task} 
                onChange={(e) => {
                  setTask(e.target.value);
                }}
                className="border-0 bg-transparent focus:ring-0 text-sm text-gray-600 flex-1 cursor-pointer"
              >
                <option value="">Task</option>
                {availableTasks.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </>
          )}
        </div>

        {/* Right side: Time and Controls */}
        <div className="flex items-center gap-4 ml-4">
          {mode === 'timer' ? (
            <div className="font-mono text-lg font-medium text-gray-900 w-24 text-center">
              {formatTime(timerSeconds)}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input 
                type="time" 
                value={manualStartTime}
                onChange={(e) => {
                  setManualStartTime(e.target.value);
                  setCustomDuration('');
                }}
                className="border border-gray-200 rounded p-1 focus:ring-1 focus:ring-blue-500 text-sm w-[72px] text-center text-gray-700 font-medium"
                style={{ WebkitAppearance: 'none' }}
              />
              <span className="text-gray-400">-</span>
              <input 
                type="time" 
                value={manualEndTime}
                onChange={(e) => {
                  setManualEndTime(e.target.value);
                  setCustomDuration('');
                }}
                className="border border-gray-200 rounded p-1 focus:ring-1 focus:ring-blue-500 text-sm w-[72px] text-center text-gray-700 font-medium"
                style={{ WebkitAppearance: 'none' }}
              />
              <div className="relative ml-2 flex items-center gap-2">
                <button 
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <CalendarIcon size={16} />
                </button>
                
                <span className="text-sm text-gray-700 w-20 text-center">
                  {isEditingDate ? (
                    <input 
                      autoFocus
                      value={manualDateInput}
                      onChange={e => setManualDateInput(e.target.value)}
                      onBlur={() => {
                        setIsEditingDate(false);
                        try {
                          const parsed = parse(manualDateInput, 'dd/MM/yyyy', new Date());
                          if (!isNaN(parsed.getTime())) {
                            setManualDate(parsed);
                          }
                        } catch (e) {}
                      }}
                      className="w-full border-b border-gray-300 focus:border-blue-500 outline-none text-center bg-transparent"
                      placeholder="DD/MM/YYYY"
                    />
                  ) : (
                    <span 
                      className="cursor-pointer hover:text-blue-600"
                      onClick={() => {
                        setIsEditingDate(true);
                        setManualDateInput(format(manualDate, 'dd/MM/yyyy'));
                      }}
                    >
                      {format(manualDate, 'dd/MM/yyyy') === format(new Date(), 'dd/MM/yyyy') ? 'Today' : format(manualDate, 'dd/MM/yyyy')}
                    </span>
                  )}
                </span>

                <AnimatePresence>
                  {showDatePicker && (
                    <DatePickerPopover 
                      currentDate={manualDate} 
                      viewMode="day"
                      align="right"
                      singleMonth={true}
                      hideSidebar={true}
                      onSelect={(date) => {
                        setManualDate(date);
                        setShowDatePicker(false);
                      }}
                      onClose={() => setShowDatePicker(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
              <div className="ml-4 text-center font-mono text-lg font-medium text-gray-700 w-24 border border-gray-200 rounded p-1">
                {isEditingDuration ? (
                  <input
                    autoFocus
                    value={manualDurationInput}
                    onChange={e => setManualDurationInput(e.target.value)}
                    onBlur={() => {
                      setIsEditingDuration(false);
                      setCustomDuration(manualDurationInput);
                    }}
                    className="w-full outline-none text-center bg-transparent"
                    placeholder="00:00:00"
                  />
                ) : (
                  <span 
                    className="cursor-pointer hover:text-blue-600"
                    onClick={() => {
                      setIsEditingDuration(true);
                      setManualDurationInput(customDuration || calculateManualDuration());
                    }}
                  >
                    {customDuration || calculateManualDuration()}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 relative" ref={timerMenuRef}>
            {mode === 'timer' ? (
              <button 
                onClick={handleStartStop}
                className={`px-6 py-2 rounded font-bold text-sm transition-colors ${
                  isTimerRunning 
                    ? 'bg-red-600 text-white hover:bg-red-700' 
                    : 'bg-[#00a8ff] text-white hover:bg-blue-500'
                }`}
              >
                {isTimerRunning ? 'STOP' : 'START'}
              </button>
            ) : (
              <button 
                onClick={handleAddManual}
                className="px-6 py-2 rounded font-bold text-sm transition-colors bg-[#00a8ff] text-white hover:bg-blue-500"
              >
                ADD
              </button>
            )}
            
            {isTimerRunning && mode === 'timer' && (
              <button 
                onClick={() => setShowTimerMenu(!showTimerMenu)}
                className="flex items-center justify-center text-blue-600 rounded-full border-2 border-blue-600 hover:bg-blue-50 transition-colors"
                style={{ width: '28px', height: '28px' }}
              >
                <MoreVertical size={16} />
              </button>
            )}
            
            <AnimatePresence>
              {showTimerMenu && !showDiscardConfirm && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full right-0 mt-2 w-32 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50"
                >
                  <button 
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setShowTimerMenu(false)}
                  >
                    Split
                  </button>
                  <button 
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    onClick={() => setShowDiscardConfirm(true)}
                  >
                    Discard
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showDiscardConfirm && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50 p-3 flex items-center gap-3 whitespace-nowrap"
                >
                  <span className="text-sm text-gray-700 font-medium">Are you sure?</span>
                  <button 
                    className="text-xs text-gray-500 hover:text-gray-700"
                    onClick={() => setShowDiscardConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="text-xs font-bold text-red-600 hover:text-red-700"
                    onClick={() => {
                      setTimerSeconds(0);
                      setIsTimerRunning(false);
                      setShowDiscardConfirm(false);
                      setShowTimerMenu(false);
                    }}
                  >
                    DISCARD
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mode toggles */}
          {!isTimerRunning && (
            <div className="flex flex-col gap-1 border-l border-gray-200 pl-4 ml-2">
              <button 
                onClick={() => setMode('timer')}
                className={`p-1 rounded transition-colors ${mode === 'timer' ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600'}`}
                title="Timer mode"
              >
                <Clock size={16} />
              </button>
              <button 
                onClick={() => setMode('manual')}
                className={`p-1 rounded transition-colors ${mode === 'manual' ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600'}`}
                title="Manual mode"
              >
                <List size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-medium text-gray-700">This week</h3>
          <span className="text-sm font-bold text-gray-900">
            {formatTime(timesheets.reduce((total, entry) => {
              if (entry.duration) {
                const parts = entry.duration.split(':');
                if (parts.length === 3) {
                  return total + parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
                }
              } else {
                try {
                  const start = parseISO(`1970-01-01T${entry.startTime}`);
                  const end = parseISO(`1970-01-01T${entry.endTime}`);
                  let diff = (end.getTime() - start.getTime()) / 1000;
                  if (diff < 0) diff += 24 * 3600;
                  return total + diff;
                } catch (e) {}
              }
              return total;
            }, 0))}
          </span>
        </div>
        <div className="space-y-6">
          {Object.entries(
            timesheets.reduce((acc, curr) => {
              if (!acc[curr.date]) acc[curr.date] = [];
              acc[curr.date].push(curr);
              return acc;
            }, {} as Record<string, any[]>)
          ).map(([dateStr, entries]: [string, any[]]) => {
          const date = parseISO(dateStr);
          const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          const isYesterday = format(date, 'yyyy-MM-dd') === format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
          const headerText = isToday ? 'Today' : isYesterday ? 'Yesterday' : format(date, 'EEE, d MMM');
          
          let totalSeconds = 0;
          entries.forEach(entry => {
            if (entry.duration) {
              const parts = entry.duration.split(':');
              if (parts.length === 3) {
                totalSeconds += parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
              }
            } else {
              try {
                const start = parseISO(`1970-01-01T${entry.startTime}`);
                const end = parseISO(`1970-01-01T${entry.endTime}`);
                let diff = (end.getTime() - start.getTime()) / 1000;
                if (diff < 0) diff += 24 * 3600;
                totalSeconds += diff;
              } catch (e) {}
            }
          });
          const totalDuration = formatTime(totalSeconds);

          const formatAmPm = (time24: string) => {
            if (!time24) return '';
            try {
              const [h, m] = time24.split(':');
              const d = new Date();
              d.setHours(parseInt(h, 10));
              d.setMinutes(parseInt(m, 10));
              return format(d, 'hh:mm a');
            } catch (e) {
              return time24;
            }
          };

          return (
            <div key={dateStr} className="mb-6 border border-gray-200 rounded-sm">
              <div className="bg-[#f2f4f7] px-4 py-2 flex justify-between items-center border-b border-gray-200">
                <span className="text-sm font-medium text-gray-500">{format(date, 'EEE, MMM d')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">Total:</span>
                  <span className="text-sm font-bold text-gray-900">{totalDuration}</span>
                  <button 
                    onClick={() => {
                      setBulkEditDates(prev => 
                        prev.includes(dateStr) 
                          ? prev.filter(d => d !== dateStr)
                          : [...prev, dateStr]
                      );
                    }}
                    className={`ml-1 ${bulkEditDates.includes(dateStr) ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <CheckSquare size={16} />
                  </button>
                </div>
              </div>
              <div className="flex flex-col">
                {entries.map(entry => {
                  let duration = entry.duration || '00:00:00';
                  if (!entry.duration) {
                    try {
                      const start = parseISO(`1970-01-01T${entry.startTime}`);
                      const end = parseISO(`1970-01-01T${entry.endTime}`);
                      let diff = (end.getTime() - start.getTime()) / 1000;
                      if (diff < 0) diff += 24 * 3600;
                      duration = formatTime(diff);
                    } catch (e) {}
                  }

                  return (
                    <div key={entry.id} className="bg-white flex items-center justify-between p-2 border-b border-gray-200 last:border-0 group">
                      <div className="flex-1 flex items-center gap-2 px-2">
                        {bulkEditDates.includes(dateStr) && (
                          <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2" />
                        )}
                        <select
                          value={entry.moduleCode}
                          onChange={async (e) => {
                            try {
                              const newModuleCode = e.target.value;
                              const newModuleData = modules.find(m => m.moduleCode === newModuleCode);
                              const newCategory = newModuleData?.categories?.[0] || '';
                              await updateDoc(doc(db, 'timesheets', entry.id), { 
                                moduleCode: newModuleCode,
                                category: newCategory,
                                task: ''
                              });
                            } catch (error) {
                              console.error("Error updating module code:", error);
                            }
                          }}
                          className="border border-transparent group-hover:border-gray-300 hover:border-gray-300 rounded-sm bg-transparent focus:ring-1 focus:ring-blue-500 text-sm text-[#00a8ff] font-medium w-auto cursor-pointer py-1 px-1"
                        >
                          {modules.map(m => <option key={m.id} value={m.moduleCode}>{m.moduleCode} - {m.moduleName}</option>)}
                        </select>
                        
                        <select
                          value={entry.category}
                          onChange={async (e) => {
                            try {
                              await updateDoc(doc(db, 'timesheets', entry.id), { 
                                category: e.target.value,
                                task: ''
                              });
                            } catch (error) {
                              console.error("Error updating category:", error);
                            }
                          }}
                          className="border border-transparent group-hover:border-gray-300 hover:border-gray-300 rounded-sm bg-transparent focus:ring-1 focus:ring-blue-500 text-sm text-gray-600 w-auto cursor-pointer py-1 px-1"
                        >
                          <option value="">Category</option>
                          {(modules.find(m => m.moduleCode === entry.moduleCode)?.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        
                        <select
                          value={entry.task}
                          onChange={async (e) => {
                            try {
                              await updateDoc(doc(db, 'timesheets', entry.id), { task: e.target.value });
                            } catch (error) {
                              console.error("Error updating task:", error);
                            }
                          }}
                          className="border border-transparent group-hover:border-gray-300 hover:border-gray-300 rounded-sm bg-transparent focus:ring-1 focus:ring-blue-500 text-sm text-gray-600 flex-1 cursor-pointer py-1 px-1"
                        >
                          <option value="">Task</option>
                          {(modules.find(m => m.moduleCode === entry.moduleCode)?.tasks || []).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      
                      <div className="flex items-center">
                        <div className="px-3 border-r border-gray-200 border-dotted flex items-center gap-2">
                          <input 
                            type="time" 
                            value={entry.startTime} 
                            onChange={async (e) => {
                              try {
                                const newStart = e.target.value;
                                const start = parseISO(`1970-01-01T${newStart}`);
                                const end = parseISO(`1970-01-01T${entry.endTime}`);
                                let diff = (end.getTime() - start.getTime()) / 1000;
                                if (diff < 0) diff += 24 * 3600;
                                const newDuration = formatTime(diff);
                                await updateDoc(doc(db, 'timesheets', entry.id), { 
                                  startTime: newStart,
                                  duration: newDuration
                                });
                              } catch (error) {
                                console.error("Error updating start time:", error);
                              }
                            }}
                            className="border border-transparent group-hover:border-gray-300 hover:border-gray-300 rounded-sm px-1 py-1 text-sm text-gray-700 w-[72px] text-center focus:ring-1 focus:ring-blue-500 bg-transparent" 
                            style={{ WebkitAppearance: 'none' }}
                          />
                          <span className="text-gray-400">-</span>
                          <input 
                            type="time" 
                            value={entry.endTime} 
                            onChange={async (e) => {
                              try {
                                const newEnd = e.target.value;
                                const start = parseISO(`1970-01-01T${entry.startTime}`);
                                const end = parseISO(`1970-01-01T${newEnd}`);
                                let diff = (end.getTime() - start.getTime()) / 1000;
                                if (diff < 0) diff += 24 * 3600;
                                const newDuration = formatTime(diff);
                                await updateDoc(doc(db, 'timesheets', entry.id), { 
                                  endTime: newEnd,
                                  duration: newDuration
                                });
                              } catch (error) {
                                console.error("Error updating end time:", error);
                              }
                            }}
                            className="border border-transparent group-hover:border-gray-300 hover:border-gray-300 rounded-sm px-1 py-1 text-sm text-gray-700 w-[72px] text-center focus:ring-1 focus:ring-blue-500 bg-transparent" 
                            style={{ WebkitAppearance: 'none' }}
                          />
                        </div>
                        <div className="px-3 border-r border-gray-200 border-dotted relative">
                          <input 
                            type="date"
                            value={entry.date}
                            onChange={async (e) => {
                              try {
                                await updateDoc(doc(db, 'timesheets', entry.id), { date: e.target.value });
                              } catch (error) {
                                console.error("Error updating date:", error);
                              }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                          <CalendarIcon size={16} className="text-gray-400 cursor-pointer" />
                        </div>
                        <div className="px-3 border-r border-gray-200 border-dotted">
                          <input 
                            type="text" 
                            value={duration} 
                            onChange={async (e) => {
                              try {
                                const newDuration = e.target.value;
                                const updates: any = { duration: newDuration };
                                
                                // Try to adjust start time based on new duration
                                try {
                                  const parts = newDuration.split(':');
                                  if (parts.length === 3) {
                                    const durationSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
                                    const end = parseISO(`1970-01-01T${entry.endTime}`);
                                    const start = new Date(end.getTime() - durationSeconds * 1000);
                                    updates.startTime = format(start, 'HH:mm');
                                  }
                                } catch (err) {}
                                
                                await updateDoc(doc(db, 'timesheets', entry.id), updates);
                              } catch (error) {
                                console.error("Error updating duration:", error);
                              }
                            }}
                            className="border border-transparent group-hover:border-gray-300 hover:border-gray-300 rounded-sm px-2 py-1 text-sm font-bold text-gray-900 w-24 text-center focus:ring-1 focus:ring-blue-500 bg-transparent" 
                          />
                        </div>
                        <div className="px-3 border-r border-gray-200 border-dotted">
                          <button 
                            onClick={() => {
                              setModuleCode(entry.moduleCode);
                              setCategory(entry.category);
                              setTask(entry.task);
                              setMode('timer');
                              setIsTimerRunning(true);
                            }}
                            className="text-gray-400 hover:text-[#00a8ff] transition-colors"
                            title="Continue this task"
                          >
                            <Play size={18} />
                          </button>
                        </div>
                        <div className="px-3 relative">
                          <button 
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === entry.id ? null : entry.id);
                            }}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            title="More options"
                          >
                            <MoreVertical size={18} />
                          </button>
                          {activeDropdown === entry.id && (
                            <div 
                              ref={listMenuRef}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="absolute right-0 top-full mt-1 w-32 bg-white rounded-md shadow-lg border border-gray-200 z-50 py-1"
                            >
                              <button 
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                onClick={() => setActiveDropdown(null)}
                              >
                                Split
                              </button>
                              <button 
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                onClick={async () => {
                                  try {
                                    const { id, ...entryData } = entry;
                                    await addDoc(collection(db, 'timesheets'), entryData);
                                    setActiveDropdown(null);
                                  } catch (error) {
                                    console.error("Error duplicating timesheet:", error);
                                  }
                                }}
                              >
                                Duplicate
                              </button>
                              <button 
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEntryToDelete(entry);
                                  setActiveDropdown(null);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </motion.div>
  );
}

function ClaimView({ user, claims, isAdmin }: { user: User, claims: ClaimEntry[], isAdmin: boolean, key?: string }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    category: 'Travel',
    description: '',
    receiptUrl: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'claims'), {
        ...formData,
        userId: user.uid,
        status: 'pending'
      });
      setShowForm(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        category: 'Travel',
        description: '',
        receiptUrl: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'claims');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'claims', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `claims/${id}`);
    }
  };

  const handleStatusUpdate = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'claims', id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `claims/${id}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Expense Claims</h2>
          <p className="text-gray-500">Submit and track your reimbursement requests.</p>
        </div>
        {!isAdmin && (
          <button 
            onClick={() => setShowForm(!showForm)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-md"
          >
            <Plus size={20} />
            New Claim
          </button>
        )}
      </div>

      {showForm && (
        <motion.form 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8 overflow-hidden"
          onSubmit={handleSubmit}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input 
                type="date" 
                required
                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input 
                type="number" 
                required
                step="0.01"
                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select 
                required
                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
              >
                <option value="Travel">Travel</option>
                <option value="Meals">Meals</option>
                <option value="Office Supplies">Office Supplies</option>
                <option value="Software">Software</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input 
                type="text" 
                placeholder="What was this expense for?"
                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Receipt URL (Optional)</label>
              <input 
                type="url" 
                placeholder="https://..."
                className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                value={formData.receiptUrl}
                onChange={e => setFormData({...formData, receiptUrl: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Submit Claim</button>
          </div>
        </motion.form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 text-sm uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Category</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Description</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map(cl => (
                <tr key={cl.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-900 font-medium">{cl.date}</td>
                  <td className="px-6 py-4 text-gray-600">{cl.category}</td>
                  <td className="px-6 py-4 text-gray-900 font-bold">${cl.amount.toFixed(2)}</td>
                  <td className="px-6 py-4 text-gray-600 max-w-xs truncate">{cl.description}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      cl.status === 'approved' ? 'bg-green-100 text-green-700' :
                      cl.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {cl.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {isAdmin && cl.status === 'pending' && (
                        <>
                          <button onClick={() => handleStatusUpdate(cl.id!, 'approved')} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Approve">
                            <CheckCircle size={18} />
                          </button>
                          <button onClick={() => handleStatusUpdate(cl.id!, 'rejected')} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Reject">
                            <XCircle size={18} />
                          </button>
                        </>
                      )}
                      {(isAdmin || cl.status === 'pending') && (
                        <button onClick={() => handleDelete(cl.id!)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">No claims found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

function SettingsView({ user, profile, onLogout }: { user: User, profile: UserProfile | null, onLogout: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">User Settings</h2>
        <p className="text-gray-500 mt-1">Manage your account and preferences</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden max-w-2xl">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Profile Information</h3>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-2xl shrink-0">
              {profile?.displayName?.[0] || user.email?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="text-lg font-medium text-gray-900">{profile?.displayName || 'User'}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
              <p className="text-xs text-gray-400 mt-1 capitalize">Role: {profile?.role || 'User'}</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 bg-gray-50">
          <h3 className="text-sm font-medium text-gray-900 mb-4 uppercase tracking-wider">Account Actions</h3>
          <button 
            onClick={onLogout}
            className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium shadow-sm"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
