import React, { useState, useMemo, useRef, useEffect } from "react";
import { ModuleEntry, TimesheetEntry, UserProfile } from "../types";
import {
  ChevronRight,
  Clock,
  PoundSterling,
  CheckSquare,
  AlertCircle,
  ChevronDown,
  X,
  MoreHorizontal,
  Search,
  PlusCircle,
  Calendar,
  ChevronLeft,
  BarChart2,
  Table as TableIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export function ModuleDetailView({
  user,
  module,
  timesheets,
  onBack,
}: {
  user: UserProfile;
  module: ModuleEntry;
  timesheets: TimesheetEntry[];
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "tasks" | "forecast" | "remark" | "setting"
  >("dashboard");
  const [forecastMode, setForecastMode] = useState<"time" | "amount">("time");
  const [showAlerts, setShowAlerts] = useState(false);
  const alertsRef = useRef<HTMLDivElement>(null);

  // Tasks View State
  const [taskFilter, setTaskFilter] = useState<"Active" | "Done" | "All">(
    "All",
  );
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTask, setNewTask] = useState({
    name: "",
    category: "",
    deadline: "",
  });
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [editingEstimateTask, setEditingEstimateTask] = useState<string | null>(
    null,
  );
  const [editingEstimateValue, setEditingEstimateValue] = useState("");
  const [openTaskMenu, setOpenTaskMenu] = useState<string | null>(null);

  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  const [editingTaskRow, setEditingTaskRow] = useState<string | null>(null);
  const [editTaskData, setEditTaskData] = useState({ name: '', category: '', deadline: '' });

  const addTaskRowRef = useRef<HTMLTableRowElement>(null);
  const editTaskRowRef = useRef<HTMLTableRowElement>(null);
  const categoryDropdownRef = useRef<HTMLTableCellElement>(null);
  
  const newTaskRef = useRef(newTask);
  const editTaskDataRef = useRef(editTaskData);
  
  const handleAddTaskRef = useRef<() => Promise<void>>(async () => {});
  const handleSaveEditRowRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    newTaskRef.current = newTask;
  }, [newTask]);

  useEffect(() => {
    editTaskDataRef.current = editTaskData;
  }, [editTaskData]);

  const [remarkText, setRemarkText] = useState(module.remark || "");

  // Forecast state
  const [forecastViewType, setForecastViewType] = useState<'table' | 'graph'>('table');
  const [forecastDateRange, setForecastDateRange] = useState<'Day' | 'Week' | 'Month'>('Month');
  const [forecastCurrentDate, setForecastCurrentDate] = useState(new Date());

  useEffect(() => {
    setRemarkText(module.remark || "");
  }, [module.remark]);

  const handleRemarkBlur = async () => {
    if (remarkText !== module.remark) {
      await handleUpdateModule({ remark: remarkText });
    }
  };

  const nextForecastDate = () => {
    if (forecastDateRange === 'Day') setForecastCurrentDate(addDays(forecastCurrentDate, 1));
    if (forecastDateRange === 'Week') setForecastCurrentDate(addWeeks(forecastCurrentDate, 1));
    if (forecastDateRange === 'Month') setForecastCurrentDate(addMonths(forecastCurrentDate, 1));
  };
  const prevForecastDate = () => {
    if (forecastDateRange === 'Day') setForecastCurrentDate(subDays(forecastCurrentDate, 1));
    if (forecastDateRange === 'Week') setForecastCurrentDate(subWeeks(forecastCurrentDate, 1));
    if (forecastDateRange === 'Month') setForecastCurrentDate(subMonths(forecastCurrentDate, 1));
  };

  const getForecastDateLabel = () => {
    if (forecastDateRange === 'Day') return format(forecastCurrentDate, 'MMM dd, yyyy');
    if (forecastDateRange === 'Week') {
      const start = startOfWeek(forecastCurrentDate, { weekStartsOn: 1 });
      const end = endOfWeek(forecastCurrentDate, { weekStartsOn: 1 });
      return `${format(start, 'MMM dd, yyyy')} - ${format(end, 'MMM dd, yyyy')}`;
    }
    if (forecastDateRange === 'Month') {
      const start = startOfMonth(forecastCurrentDate);
      const end = endOfMonth(forecastCurrentDate);
      return `${format(start, 'MMM dd, yyyy')} - ${format(end, 'MMM dd, yyyy')}`;
    }
    return '';
  };

  const getForecastChartData = () => {
    return (module.tasks || []).map(task => {
      const details = module.taskDetails?.[task] || {};
      const submissions = details.submissions || 0;
      const estTimePerSubmission = details.estTimePerSubmission || 0;
      const estimatedTime = submissions * estTimePerSubmission;
      
      const actualTime = moduleTimesheets
        .filter(ts => ts.task === task)
        .reduce((acc, ts) => {
          if (ts.duration) {
            const parts = ts.duration.split(':');
            if (parts.length === 3) {
              return acc + parseInt(parts[0]) + parseInt(parts[1]) / 60 + parseInt(parts[2]) / 3600;
            }
          }
          return acc;
        }, 0);

      return {
        name: task,
        Estimate: estimatedTime,
        Actual: Math.round(actualTime * 10) / 10
      };
    });
  };

  const handleUpdateTaskForecast = async (task: string, field: 'submissions' | 'estTimePerSubmission', value: number) => {
    const updatedTaskDetails = {
      ...module.taskDetails,
      [task]: { ...(module.taskDetails?.[task] || {}), [field]: value },
    };
    await handleUpdateModule({ taskDetails: updatedTaskDetails });
  };
  const handleUpdateModule = async (updates: Partial<ModuleEntry>) => {
    if (!module.id) return;
    try {
      await updateDoc(doc(db, "modules", module.id), updates);
    } catch (error) {
      console.error("Error updating module:", error);
    }
  };

  const handleAddTask = async () => {
    if (!newTask.name.trim()) return;

    const updatedTasks = [...(module.tasks || []), newTask.name];
    const updatedTaskDetails = {
      ...(module.taskDetails || {}),
      [newTask.name]: {
        category: newTask.category,
        deadline: newTask.deadline,
        status: "active" as const,
        estimate: 0,
      },
    };

    await handleUpdateModule({
      tasks: updatedTasks,
      taskDetails: updatedTaskDetails,
    });
    setIsAddingTask(false);
    setNewTask({ name: "", category: "", deadline: "" });
  };

  const handleSaveEditRow = async () => {
    if (!editingTaskRow || !editTaskDataRef.current.name.trim()) {
      setEditingTaskRow(null);
      return;
    }
    
    const oldTaskName = editingTaskRow;
    const newTaskName = editTaskDataRef.current.name.trim();
    
    let updatedTasks = [...(module.tasks || [])];
    const updatedTaskDetails = { ...module.taskDetails };
    
    if (oldTaskName !== newTaskName) {
      updatedTasks = updatedTasks.map(t => t === oldTaskName ? newTaskName : t);
      updatedTaskDetails[newTaskName] = {
        ...(updatedTaskDetails[oldTaskName] || {}),
        category: editTaskDataRef.current.category,
        deadline: editTaskDataRef.current.deadline
      };
      delete updatedTaskDetails[oldTaskName];
    } else {
      updatedTaskDetails[oldTaskName] = {
        ...(updatedTaskDetails[oldTaskName] || {}),
        category: editTaskDataRef.current.category,
        deadline: editTaskDataRef.current.deadline
      };
    }
    
    await handleUpdateModule({ tasks: updatedTasks, taskDetails: updatedTaskDetails });
    setEditingTaskRow(null);
  };

  useEffect(() => {
    handleAddTaskRef.current = handleAddTask;
  }, [handleAddTask]);

  useEffect(() => {
    handleSaveEditRowRef.current = handleSaveEditRow;
  }, [handleSaveEditRow]);

  const handleBulkAction = async (action: "done" | "undone" | "delete") => {
    if (selectedTasks.length === 0) return;

    if (action === "delete") {
      const updatedTasks = (module.tasks || []).filter(
        (t) => !selectedTasks.includes(t),
      );
      const updatedTaskDetails = { ...module.taskDetails };
      selectedTasks.forEach((t) => delete updatedTaskDetails[t]);

      await handleUpdateModule({
        tasks: updatedTasks,
        taskDetails: updatedTaskDetails,
      });
    } else {
      const status =
        action === "done" ? ("done" as const) : ("active" as const);
      const updatedTaskDetails = { ...module.taskDetails };
      selectedTasks.forEach((t) => {
        if (updatedTaskDetails[t]) {
          updatedTaskDetails[t] = { ...updatedTaskDetails[t], status };
        } else {
          updatedTaskDetails[t] = { status };
        }
      });
      await handleUpdateModule({ taskDetails: updatedTaskDetails });
    }
    setSelectedTasks([]);
  };

  const handleTaskAction = async (
    task: string,
    action: "done" | "undone" | "delete",
  ) => {
    if (action === "delete") {
      const updatedTasks = (module.tasks || []).filter((t) => t !== task);
      const updatedTaskDetails = { ...module.taskDetails };
      delete updatedTaskDetails[task];
      await handleUpdateModule({
        tasks: updatedTasks,
        taskDetails: updatedTaskDetails,
      });
    } else {
      const status =
        action === "done" ? ("done" as const) : ("active" as const);
      const updatedTaskDetails = {
        ...module.taskDetails,
        [task]: { ...(module.taskDetails?.[task] || {}), status },
      };
      await handleUpdateModule({ taskDetails: updatedTaskDetails });
    }
    setOpenTaskMenu(null);
  };

  const handleSaveEstimate = async (task: string) => {
    const estimate = parseFloat(editingEstimateValue) || 0;
    const updatedTaskDetails = {
      ...module.taskDetails,
      [task]: { ...(module.taskDetails?.[task] || {}), estimate },
    };
    await handleUpdateModule({ taskDetails: updatedTaskDetails });
    setEditingEstimateTask(null);
  };

  const filteredTasks = useMemo(() => {
    const tasks = module.tasks || [];
    if (taskFilter === "All") return tasks;
    return tasks.filter((task) => {
      const status = module.taskDetails?.[task]?.status || "active";
      return taskFilter === "Active" ? status === "active" : status === "done";
    });
  }, [module.tasks, module.taskDetails, taskFilter]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        alertsRef.current &&
        !alertsRef.current.contains(target)
      ) {
        setShowAlerts(false);
      }
      
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(target)
      ) {
        setIsCategoryDropdownOpen(false);
      }

      if (
        isAddingTask &&
        addTaskRowRef.current &&
        !addTaskRowRef.current.contains(target) &&
        (!categoryDropdownRef.current || !categoryDropdownRef.current.contains(target))
      ) {
        if (newTaskRef.current.name.trim()) {
          handleAddTaskRef.current();
        } else {
          setIsAddingTask(false);
        }
      }

      if (
        editingTaskRow &&
        editTaskRowRef.current &&
        !editTaskRowRef.current.contains(target) &&
        (!categoryDropdownRef.current || !categoryDropdownRef.current.contains(target))
      ) {
        handleSaveEditRowRef.current();
      }
      if (
        openTaskMenu &&
        !(target as Element).closest('.task-menu-container')
      ) {
        setOpenTaskMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isAddingTask, editingTaskRow, openTaskMenu]);

  const moduleTimesheets = useMemo(() => {
    return timesheets.filter((ts) => ts.moduleCode === module.moduleCode);
  }, [timesheets, module.moduleCode]);

  const taskProgress = useMemo(() => {
    const progress: Record<string, number> = {};
    moduleTimesheets.forEach((ts) => {
      if (ts.task) {
        let hours = 0;
        if (ts.duration) {
          const parts = ts.duration.split(":");
          if (parts.length === 3) {
            hours =
              parseInt(parts[0]) +
              parseInt(parts[1]) / 60 +
              parseInt(parts[2]) / 3600;
          }
        } else {
          const [startH, startM] = ts.startTime.split(":").map(Number);
          const [endH, endM] = ts.endTime.split(":").map(Number);
          hours = (endH * 60 + endM - (startH * 60 + startM)) / 60;
          if (hours < 0) hours += 24;
        }
        progress[ts.task] = (progress[ts.task] || 0) + hours;
      }
    });
    return progress;
  }, [moduleTimesheets]);

  const stats = useMemo(() => {
    let tracked = 0;
    moduleTimesheets.forEach((ts) => {
      if (ts.duration) {
        const parts = ts.duration.split(":");
        if (parts.length === 3) {
          tracked +=
            parseInt(parts[0]) +
            parseInt(parts[1]) / 60 +
            parseInt(parts[2]) / 3600;
        }
      } else {
        const [startH, startM] = ts.startTime.split(":").map(Number);
        const [endH, endM] = ts.endTime.split(":").map(Number);
        let hours = (endH * 60 + endM - (startH * 60 + startM)) / 60;
        if (hours < 0) hours += 24;
        tracked += hours;
      }
    });

    return {
      tracked,
      billableHours: tracked, // Assuming all tracked hours are billable for now
      billableAmount: tracked * (module.rateGBP || 0),
    };
  }, [moduleTimesheets, module.rateGBP]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e] text-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white transition-colors"
          >
            Modules
          </button>
          <ChevronRight size={14} className="text-gray-600" />
          <div className="flex items-center gap-2 text-emerald-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            {module.moduleCode}
          </div>
        </div>
        <div
          className="flex items-center gap-4 text-sm relative"
          ref={alertsRef}
        >
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-red-500"></span> Alerts
          </button>

          <AnimatePresence>
            {showAlerts && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full right-0 mt-2 w-64 bg-[#2a2a2a] rounded-lg shadow-xl border border-gray-700 overflow-hidden z-50"
              >
                <div className="p-3 border-b border-gray-700">
                  <h3 className="text-sm font-medium text-white">Alerts</h3>
                </div>
                <div className="p-2">
                  <div className="p-2 hover:bg-[#333] rounded transition-colors cursor-pointer flex items-start gap-3">
                    <AlertCircle
                      size={16}
                      className="text-amber-500 mt-0.5 shrink-0"
                    />
                    <div>
                      <p className="text-sm text-gray-200">Deadlines</p>
                      <p className="text-xs text-gray-400">
                        No upcoming deadlines.
                      </p>
                    </div>
                  </div>
                  <div className="p-2 hover:bg-[#333] rounded transition-colors cursor-pointer flex items-start gap-3">
                    <AlertCircle
                      size={16}
                      className="text-red-500 mt-0.5 shrink-0"
                    />
                    <div>
                      <p className="text-sm text-gray-200">Overage</p>
                      <p className="text-xs text-gray-400">
                        {stats.tracked > module.estimatedHrs
                          ? `${(stats.tracked - module.estimatedHrs).toFixed(1)} hrs over budget`
                          : "Within budget limits."}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between px-4 border-b border-gray-800">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "dashboard" ? "border-pink-500 text-pink-500" : "border-transparent text-gray-400 hover:text-gray-200"}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "tasks" ? "border-pink-500 text-pink-500" : "border-transparent text-gray-400 hover:text-gray-200"}`}
          >
            Tasks
          </button>
          <button
            onClick={() => setActiveTab("forecast")}
            className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "forecast" ? "border-pink-500 text-pink-500" : "border-transparent text-gray-400 hover:text-gray-200"}`}
          >
            Forecast
          </button>
          <button
            onClick={() => setActiveTab("remark")}
            className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "remark" ? "border-pink-500 text-pink-500" : "border-transparent text-gray-400 hover:text-gray-200"}`}
          >
            Remark
          </button>
          <button
            onClick={() => setActiveTab("setting")}
            className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "setting" ? "border-pink-500 text-pink-500" : "border-transparent text-gray-400 hover:text-gray-200"}`}
          >
            Setting
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "dashboard" && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Forecast Section */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-white">
                Module time tracking forecast
              </h2>
              <div className="flex bg-gray-900 rounded-md p-1 border border-gray-700">
                <button
                  onClick={() => setForecastMode("time")}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors ${forecastMode === "time" ? "bg-gray-800 text-pink-400 border border-pink-500/30" : "text-gray-400 hover:text-gray-200"}`}
                >
                  <Clock size={12} /> Time tracking
                </button>
                <button
                  onClick={() => setForecastMode("amount")}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors ${forecastMode === "amount" ? "bg-gray-800 text-pink-400 border border-pink-500/30" : "text-gray-400 hover:text-gray-200"}`}
                >
                  <PoundSterling size={12} /> Amounts
                </button>
              </div>
            </div>

            {/* Main Chart Area Placeholder */}
            <div className="h-64 flex flex-col items-center justify-center text-gray-500 border-b border-gray-800 pb-8">
              <p className="text-sm">No data... yet</p>
              <p className="text-xs">Start tracking time to see the graph.</p>
            </div>

            {/* Summary Section */}
            <div className="grid grid-cols-4 gap-6 pt-6">
              <div className="col-span-3 bg-gray-900/50 rounded-lg border border-gray-800 p-6 flex flex-col items-center justify-center min-h-[200px]">
                <div className="w-full text-left mb-auto">
                  <h3 className="text-xs font-medium text-gray-400">
                    Total hours
                  </h3>
                </div>
                <div className="text-center text-gray-500">
                  <p className="text-sm">No data... yet</p>
                  <p className="text-xs">
                    Start tracking time to see the graph.
                  </p>
                </div>
                <div className="mt-auto"></div>
              </div>

              <div className="flex flex-col justify-center gap-6 pl-6 border-l border-gray-800">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                    TOTAL HOURS
                  </p>
                  <p className="text-2xl font-semibold text-white">
                    {Math.floor(stats.tracked)}:
                    {Math.round((stats.tracked % 1) * 60)
                      .toString()
                      .padStart(2, "0")}
                    :00
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                    BILLABLE HOURS
                  </p>
                  <p className="text-2xl font-semibold text-white">
                    {Math.floor(stats.billableHours)}:
                    {Math.round((stats.billableHours % 1) * 60)
                      .toString()
                      .padStart(2, "0")}
                    :00
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                    BILLABLE AMOUNT
                  </p>
                  <p className="text-2xl font-semibold text-white flex items-baseline gap-1">
                    <span className="text-sm text-gray-500">£</span>{" "}
                    {stats.billableAmount.toFixed(0)}
                  </p>
                </div>

                {/* Donut Chart Placeholder */}
                <div className="mt-4 w-24 h-24 rounded-full border-8 border-white flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-[#1e1e1e]"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="flex gap-8 h-full max-w-[1400px] mx-auto">
            {/* Left side: Tasks Table */}
            <div className="flex-1 bg-[#1e1e1e] rounded-lg border border-gray-800 flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                {selectedTasks.length > 0 ? (
                  <div className="flex items-center gap-4 w-full">
                    <span className="text-sm text-gray-300">
                      {selectedTasks.length === filteredTasks.length
                        ? `All ${selectedTasks.length} items selected`
                        : `${selectedTasks.length} item(s) selected`}
                    </span>
                    <div className="flex items-center gap-4 ml-auto">
                      {selectedTasks.some(
                        (t) =>
                          (module.taskDetails?.[t]?.status || "active") ===
                          "active",
                      ) && (
                        <button
                          onClick={() => handleBulkAction("done")}
                          className="text-sm text-gray-300 hover:text-white transition-colors"
                        >
                          Mark as done
                        </button>
                      )}
                      {selectedTasks.some(
                        (t) => module.taskDetails?.[t]?.status === "done",
                      ) && (
                        <button
                          onClick={() => handleBulkAction("undone")}
                          className="text-sm text-gray-300 hover:text-white transition-colors"
                        >
                          Mark as undone
                        </button>
                      )}
                      <button
                        onClick={() => handleBulkAction("delete")}
                        className="text-sm text-red-400 hover:text-red-300 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setSelectedTasks([])}
                        className="text-sm text-gray-500 hover:text-gray-300 ml-2 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <button
                        onClick={() =>
                          setIsFilterDropdownOpen(!isFilterDropdownOpen)
                        }
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
                      >
                        Show {taskFilter.toLowerCase()}{" "}
                        <ChevronDown size={14} />
                      </button>
                      {isFilterDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 w-32 bg-[#2a2a2a] border border-gray-700 rounded shadow-lg z-10">
                          {["Active", "Done", "All"].map((filter) => (
                            <button
                              key={filter}
                              onClick={() => {
                                setTaskFilter(filter as any);
                                setIsFilterDropdownOpen(false);
                              }}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                            >
                              {filter}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setIsAddingTask(true)}
                      className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors"
                    >
                      <span className="text-lg leading-none">+</span> Add Task
                    </button>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-gray-500 border-b border-gray-800">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={
                            filteredTasks.length > 0 &&
                            selectedTasks.length === filteredTasks.length
                          }
                          onChange={(e) => {
                            if (e.target.checked)
                              setSelectedTasks(filteredTasks);
                            else setSelectedTasks([]);
                          }}
                          className="rounded border-gray-700 bg-transparent"
                        />
                      </th>
                      <th className="px-4 py-3 font-medium">TASKS</th>
                      <th className="px-4 py-3 font-medium">CATEGORIES</th>
                      <th className="px-4 py-3 font-medium">DEADLINES</th>
                      <th className="px-4 py-3 font-medium">RATE</th>
                      <th className="px-4 py-3 font-medium">PROGRESS</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {isAddingTask && (
                      <tr className="bg-gray-800/30" ref={addTaskRowRef}>
                        <td className="px-4 py-4"></td>
                        <td className="px-4 py-4">
                          <input
                            type="text"
                            value={newTask.name}
                            onChange={(e) =>
                              setNewTask({ ...newTask, name: e.target.value })
                            }
                            placeholder="Task name"
                            className="bg-transparent border-b border-gray-600 focus:border-pink-500 outline-none text-white text-sm w-full"
                            autoFocus
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleAddTask()
                            }
                          />
                        </td>
                        <td className="px-4 py-4 relative" ref={categoryDropdownRef}>
                          <div 
                            className="bg-transparent border-b border-gray-600 focus-within:border-pink-500 text-white text-sm w-full cursor-pointer py-1"
                            onClick={() => setIsCategoryDropdownOpen(true)}
                          >
                            {newTask.category || <span className="text-gray-500">Select category</span>}
                          </div>
                          {isCategoryDropdownOpen && (
                            <div className="absolute top-full left-4 mt-1 w-64 bg-[#2a2a2a] border border-gray-700 rounded shadow-lg z-50 text-gray-200 overflow-hidden">
                              <div className="p-2 border-b border-gray-700 flex items-center gap-2">
                                <Search size={14} className="text-gray-400" />
                                <input 
                                  type="text" 
                                  placeholder="Search Category" 
                                  className="w-full outline-none text-sm bg-transparent text-white placeholder-gray-500"
                                  value={categorySearch}
                                  onChange={e => setCategorySearch(e.target.value)}
                                  autoFocus
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto py-1">
                                {module.categories?.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase())).map(c => (
                                  <div 
                                    key={c} 
                                    className="px-3 py-1.5 text-sm hover:bg-gray-700 cursor-pointer flex items-center justify-between transition-colors group"
                                    onClick={() => {
                                      setNewTask({...newTask, category: c});
                                      setIsCategoryDropdownOpen(false);
                                      setCategorySearch('');
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-pink-500"></div>
                                      {c}
                                    </div>
                                    <X 
                                      size={12} 
                                      className="hidden group-hover:block text-gray-400 hover:text-red-500" 
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        const updatedCategories = (module.categories || []).filter(cat => cat !== c);
                                        await handleUpdateModule({ categories: updatedCategories });
                                        if (newTask.category === c) {
                                          setNewTask({...newTask, category: ''});
                                        }
                                      }}
                                    />
                                  </div>
                                ))}
                                {(!module.categories || module.categories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase())).length === 0) && (
                                  <div className="px-3 py-2 text-xs text-gray-500">No categories found</div>
                                )}
                              </div>
                              <div 
                                className="p-2 border-t border-gray-700 text-sm text-pink-500 hover:bg-gray-700 cursor-pointer flex items-center gap-2 transition-colors"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const newCat = categorySearch.trim();
                                  if (newCat) {
                                    const updatedCategories = [...(module.categories || []), newCat];
                                    await handleUpdateModule({ categories: updatedCategories });
                                    setNewTask({...newTask, category: newCat});
                                    setIsCategoryDropdownOpen(false);
                                    setCategorySearch('');
                                  } else {
                                    // If empty, just focus the input so they can type
                                    const input = e.currentTarget.parentElement?.querySelector('input');
                                    if (input) input.focus();
                                  }
                                }}
                              >
                                <PlusCircle size={14} /> {categorySearch.trim() ? `Create "${categorySearch.trim()}"` : "Type to create new category"}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <input
                            type="date"
                            value={newTask.deadline}
                            onChange={(e) =>
                              setNewTask({
                                ...newTask,
                                deadline: e.target.value,
                              })
                            }
                            className="bg-transparent border-b border-gray-600 focus:border-pink-500 outline-none text-white text-sm w-full [color-scheme:dark]"
                          />
                        </td>
                        <td className="px-4 py-4"></td>
                        <td className="px-4 py-4"></td>
                        <td className="px-4 py-4"></td>
                      </tr>
                    )}
                    {filteredTasks.length > 0
                      ? filteredTasks.map((task, i) => {
                          const details = module.taskDetails?.[task] || {};
                          const isSelected = selectedTasks.includes(task);
                          const isHovered = hoveredTask === task;
                          const isDone = details.status === "done";
                          const isEditing = editingTaskRow === task;

                          if (isEditing) {
                            return (
                              <tr key={i} className="bg-gray-800/30" ref={editTaskRowRef}>
                                <td className="px-4 py-4"></td>
                                <td className="px-4 py-4">
                                  <input
                                    type="text"
                                    value={editTaskData.name}
                                    onChange={(e) =>
                                      setEditTaskData({ ...editTaskData, name: e.target.value })
                                    }
                                    placeholder="Task name"
                                    className="bg-transparent border-b border-gray-600 focus:border-pink-500 outline-none text-white text-sm w-full"
                                    autoFocus
                                    onKeyDown={(e) =>
                                      e.key === "Enter" && handleSaveEditRow()
                                    }
                                  />
                                </td>
                                <td className="px-4 py-4 relative" ref={categoryDropdownRef}>
                                  <div 
                                    className="bg-transparent border-b border-gray-600 focus-within:border-pink-500 text-white text-sm w-full cursor-pointer py-1"
                                    onClick={() => setIsCategoryDropdownOpen(true)}
                                  >
                                    {editTaskData.category || <span className="text-gray-500">Select category</span>}
                                  </div>
                                  {isCategoryDropdownOpen && (
                                    <div className="absolute top-full left-4 mt-1 w-64 bg-[#2a2a2a] border border-gray-700 rounded shadow-lg z-50 text-gray-200 overflow-hidden">
                                      <div className="p-2 border-b border-gray-700 flex items-center gap-2">
                                        <Search size={14} className="text-gray-400" />
                                        <input 
                                          type="text" 
                                          placeholder="Search Category" 
                                          className="w-full outline-none text-sm bg-transparent text-white placeholder-gray-500"
                                          value={categorySearch}
                                          onChange={e => setCategorySearch(e.target.value)}
                                          autoFocus
                                        />
                                      </div>
                                      <div className="max-h-48 overflow-y-auto py-1">
                                        {module.categories?.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase())).map(c => (
                                          <div 
                                            key={c} 
                                            className="px-3 py-1.5 text-sm hover:bg-gray-700 cursor-pointer flex items-center justify-between transition-colors group"
                                            onClick={() => {
                                              setEditTaskData({...editTaskData, category: c});
                                              setIsCategoryDropdownOpen(false);
                                              setCategorySearch('');
                                            }}
                                          >
                                            <div className="flex items-center gap-2">
                                              <div className="w-1.5 h-1.5 rounded-full bg-pink-500"></div>
                                              {c}
                                            </div>
                                            <X 
                                              size={12} 
                                              className="hidden group-hover:block text-gray-400 hover:text-red-500" 
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                const updatedCategories = (module.categories || []).filter(cat => cat !== c);
                                                await handleUpdateModule({ categories: updatedCategories });
                                                if (editTaskData.category === c) {
                                                  setEditTaskData({...editTaskData, category: ''});
                                                }
                                              }}
                                            />
                                          </div>
                                        ))}
                                        {(!module.categories || module.categories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase())).length === 0) && (
                                          <div className="px-3 py-2 text-xs text-gray-500">No categories found</div>
                                        )}
                                      </div>
                                      <div 
                                        className="p-2 border-t border-gray-700 text-sm text-pink-500 hover:bg-gray-700 cursor-pointer flex items-center gap-2 transition-colors"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          const newCat = categorySearch.trim();
                                          if (newCat) {
                                            const updatedCategories = [...(module.categories || []), newCat];
                                            await handleUpdateModule({ categories: updatedCategories });
                                            setEditTaskData({...editTaskData, category: newCat});
                                            setIsCategoryDropdownOpen(false);
                                            setCategorySearch('');
                                          } else {
                                            const input = e.currentTarget.parentElement?.querySelector('input');
                                            if (input) input.focus();
                                          }
                                        }}
                                      >
                                        <PlusCircle size={14} /> {categorySearch.trim() ? `Create "${categorySearch.trim()}"` : "Type to create new category"}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-4">
                                  <input
                                    type="date"
                                    value={editTaskData.deadline}
                                    onChange={(e) =>
                                      setEditTaskData({
                                        ...editTaskData,
                                        deadline: e.target.value,
                                      })
                                    }
                                    className="bg-transparent border-b border-gray-600 focus:border-pink-500 outline-none text-white text-sm w-full [color-scheme:dark]"
                                  />
                                </td>
                                <td className="px-4 py-4"></td>
                                <td className="px-4 py-4"></td>
                                <td className="px-4 py-4"></td>
                              </tr>
                            );
                          }

                          return (
                            <tr
                              key={i}
                              className={`transition-colors cursor-pointer ${isSelected ? "bg-gray-800/80" : "hover:bg-gray-800/50"} ${isDone ? "opacity-50" : ""}`}
                              onMouseEnter={() => setHoveredTask(task)}
                              onMouseLeave={() => setHoveredTask(null)}
                              onClick={() => {
                                setEditingTaskRow(task);
                                setEditTaskData({
                                  name: task,
                                  category: details.category || '',
                                  deadline: details.deadline || ''
                                });
                              }}
                            >
                              <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                                {(isHovered || isSelected) && (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked)
                                        setSelectedTasks([
                                          ...selectedTasks,
                                          task,
                                        ]);
                                      else
                                        setSelectedTasks(
                                          selectedTasks.filter(
                                            (t) => t !== task,
                                          ),
                                        );
                                    }}
                                    className="rounded border-gray-700 bg-transparent"
                                  />
                                )}
                              </td>
                              <td
                                className={`px-4 py-4 text-gray-200 ${isDone ? "line-through" : ""}`}
                              >
                                {task}
                              </td>
                              <td className="px-4 py-4 text-gray-400">
                                {details.category || ""}
                              </td>
                              <td className="px-4 py-4 text-gray-400">
                                {details.deadline || ""}
                              </td>
                              <td className="px-4 py-4 text-gray-400">
                                {module.rateGBP
                                  ? `${module.rateGBP.toFixed(2)} GBP`
                                  : "0.00 GBP"}
                              </td>
                              <td className="px-4 py-4 text-gray-400 relative group" onClick={e => e.stopPropagation()}>
                                {editingEstimateTask === task ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={editingEstimateValue}
                                      onChange={(e) =>
                                        setEditingEstimateValue(e.target.value)
                                      }
                                      className="w-16 bg-gray-800 border border-gray-600 rounded px-1 text-white text-sm outline-none focus:border-pink-500"
                                      autoFocus
                                      onKeyDown={(e) =>
                                        e.key === "Enter" &&
                                        handleSaveEstimate(task)
                                      }
                                      onBlur={() => handleSaveEstimate(task)}
                                    />
                                    <span>h</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between">
                                    <span className="group-hover:hidden">
                                      {Math.round(
                                        (taskProgress[task] || 0) * 10,
                                      ) / 10}{" "}
                                      h
                                    </span>
                                    <button
                                      onClick={() => {
                                        setEditingEstimateTask(task);
                                        setEditingEstimateValue(
                                          (details.estimate || 0).toString(),
                                        );
                                      }}
                                      className="hidden group-hover:block text-xs text-pink-500 hover:text-pink-400 transition-opacity"
                                    >
                                      Edit estimate
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-4 relative task-menu-container" onClick={e => e.stopPropagation()}>
                                {(isHovered || openTaskMenu === task) && (
                                  <button
                                    onClick={() =>
                                      setOpenTaskMenu(
                                        openTaskMenu === task ? null : task,
                                      )
                                    }
                                    className="text-gray-400 hover:text-white transition-colors"
                                  >
                                    <MoreHorizontal size={16} />
                                  </button>
                                )}
                                {openTaskMenu === task && (
                                  <div className="absolute right-4 top-10 w-32 bg-[#2a2a2a] border border-gray-700 rounded shadow-lg z-10">
                                    <button
                                      onClick={() =>
                                        handleTaskAction(
                                          task,
                                          isDone ? "undone" : "done",
                                        )
                                      }
                                      className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                                    >
                                      {isDone ? "Reactive" : "Mark as done"}
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleTaskAction(task, "delete")
                                      }
                                      className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      : !isAddingTask && (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-8 text-center text-gray-500"
                            >
                              No tasks found.
                            </td>
                          </tr>
                        )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right side: Summary Stats */}
            <div className="w-64 flex flex-col gap-8 pt-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  TOTAL HOURS
                </p>
                <p className="text-2xl font-semibold text-white">
                  {Math.floor(stats.tracked)}:
                  {Math.round((stats.tracked % 1) * 60)
                    .toString()
                    .padStart(2, "0")}
                  :00
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  BILLABLE HOURS
                </p>
                <p className="text-2xl font-semibold text-white">
                  {Math.floor(stats.billableHours)}:
                  {Math.round((stats.billableHours % 1) * 60)
                    .toString()
                    .padStart(2, "0")}
                  :00
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  BILLABLE AMOUNT
                </p>
                <p className="text-2xl font-semibold text-white flex items-baseline gap-1">
                  <span className="text-sm text-gray-500">£</span>{" "}
                  {stats.billableAmount.toFixed(0)}
                </p>
              </div>

              <div className="mt-4 w-32 h-32 rounded-full border-[12px] border-white flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-[#1e1e1e]"></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "forecast" && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-medium text-white">Forecast</h2>
              <div className="flex items-center gap-4">
                <div className="flex bg-[#2a2a2a] rounded-lg p-1">
                  {(['Day', 'Week', 'Month'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setForecastDateRange(range)}
                      className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                        forecastDateRange === range
                          ? 'bg-gray-700 text-white'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-2 bg-[#2a2a2a] rounded-lg p-1">
                  <button onClick={prevForecastDate} className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700">
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex items-center gap-2 px-2 text-sm text-gray-300 min-w-[200px] justify-center">
                    <Calendar size={14} />
                    {getForecastDateLabel()}
                  </div>
                  <button onClick={nextForecastDate} className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700">
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="flex bg-[#2a2a2a] rounded-lg p-1 ml-4">
                  <button
                    onClick={() => setForecastViewType('table')}
                    className={`p-1.5 rounded-md transition-colors ${
                      forecastViewType === 'table'
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                    title="Table View"
                  >
                    <TableIcon size={16} />
                  </button>
                  <button
                    onClick={() => setForecastViewType('graph')}
                    className={`p-1.5 rounded-md transition-colors ${
                      forecastViewType === 'graph'
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                    title="Graph View"
                  >
                    <BarChart2 size={16} />
                  </button>
                </div>
              </div>
            </div>

            {forecastViewType === 'graph' ? (
              <div className="bg-[#1e1e1e] rounded-lg border border-gray-800 p-6 h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getForecastChartData()} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="name" stroke="#888" />
                    <YAxis stroke="#888" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#2a2a2a', borderColor: '#444', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend />
                    <Bar dataKey="Estimate" fill="#ec4899" name="Estimate" />
                    <Bar dataKey="Actual" fill="#3b82f6" name="Actual" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-[#1e1e1e] rounded-lg border border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 text-xs text-gray-400">
                        <th className="px-4 py-3 font-medium uppercase">TASKS</th>
                        <th className="px-4 py-3 font-medium">N<sup>o</sup> <span className="italic">of</span> Submission</th>
                        <th className="px-4 py-3 font-medium">Est. Time per Submission</th>
                        <th className="px-4 py-3 font-medium uppercase">ESTIMATED TIME</th>
                        <th className="px-4 py-3 font-medium uppercase">ACTUAL TIME</th>
                        <th className="px-4 py-3 font-medium">Overage</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {(module.tasks || []).map((task) => {
                        const details = module.taskDetails?.[task] || {};
                        const submissions = details.submissions || 0;
                        const estTimePerSubmission = details.estTimePerSubmission || 0;
                        const estimatedTime = submissions * estTimePerSubmission;
                        
                        const actualTime = moduleTimesheets
                          .filter(ts => ts.task === task)
                          .reduce((acc, ts) => {
                            if (ts.duration) {
                              const parts = ts.duration.split(':');
                              if (parts.length === 3) {
                                return acc + parseInt(parts[0]) + parseInt(parts[1]) / 60 + parseInt(parts[2]) / 3600;
                              }
                            }
                            return acc;
                          }, 0);
                          
                        const overage = actualTime - estimatedTime;

                        return (
                          <tr key={task} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td className="px-4 py-4 text-gray-300 uppercase">{task}</td>
                            <td className="px-4 py-4">
                              <input
                                type="number"
                                min="0"
                                value={submissions}
                                onChange={(e) => handleUpdateTaskForecast(task, 'submissions', parseFloat(e.target.value) || 0)}
                                className="w-20 bg-transparent border-b border-gray-600 focus:border-pink-500 outline-none text-white text-sm"
                              />
                            </td>
                            <td className="px-4 py-4">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={estTimePerSubmission}
                                onChange={(e) => handleUpdateTaskForecast(task, 'estTimePerSubmission', parseFloat(e.target.value) || 0)}
                                className="w-20 bg-transparent border-b border-gray-600 focus:border-pink-500 outline-none text-white text-sm"
                              />
                            </td>
                            <td className="px-4 py-4 text-gray-300 font-medium">
                              {estimatedTime > 0 ? `${Math.round(estimatedTime * 10) / 10} h` : '0 h'}
                            </td>
                            <td className="px-4 py-4 text-gray-300 font-medium">
                              {actualTime > 0 ? `${Math.round(actualTime * 10) / 10} h` : '0 h'}
                            </td>
                            <td className="px-4 py-4">
                              <span className={overage > 0 ? 'text-red-400' : 'text-gray-400'}>
                                {overage > 0 ? `${Math.round(overage * 10) / 10} h` : '0 h'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {(!module.tasks || module.tasks.length === 0) && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            No tasks found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "remark" && (
          <div className="max-w-6xl mx-auto h-full flex flex-col">
            <h2 className="text-lg font-medium text-white mb-4">Remarks</h2>
            <textarea
              value={remarkText}
              onChange={(e) => setRemarkText(e.target.value)}
              onBlur={handleRemarkBlur}
              placeholder="Add your remarks here... (Auto-saves when you click away)"
              className="flex-1 w-full bg-gray-900/50 rounded-lg border border-gray-800 p-6 text-gray-300 resize-none focus:outline-none focus:border-pink-500 transition-colors min-h-[300px]"
            />
          </div>
        )}

        {activeTab === "setting" && (
          <div className="max-w-6xl mx-auto space-y-6">
            <h2 className="text-lg font-medium text-white mb-4">Settings</h2>
            <div className="bg-[#1e1e1e] rounded-lg border border-gray-800 p-6">
              <h3 className="text-sm font-medium text-gray-300 mb-4">Categories</h3>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add new category..."
                    className="flex-1 bg-transparent border-b border-gray-600 focus:border-pink-500 outline-none text-white text-sm py-2"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        const newCategory = e.currentTarget.value.trim();
                        if (!module.categories?.includes(newCategory)) {
                          await handleUpdateModule({
                            categories: [...(module.categories || []), newCategory]
                          });
                        }
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(module.categories || []).map(category => (
                    <div key={category} className="flex items-center justify-between bg-[#2a2a2a] px-3 py-2 rounded-md group">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-pink-500"></div>
                        <span className="text-sm text-gray-300">{category}</span>
                      </div>
                      <button
                        onClick={async () => {
                          const updatedCategories = (module.categories || []).filter(c => c !== category);
                          await handleUpdateModule({ categories: updatedCategories });
                        }}
                        className="text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {(!module.categories || module.categories.length === 0) && (
                    <p className="text-sm text-gray-500 col-span-full">No categories defined yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
