export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: 'admin' | 'user';
}

export interface TimesheetEntry {
  id?: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration?: string;
  task: string;
  moduleCode: string;
  category: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ClaimEntry {
  id?: string;
  userId: string;
  date: string;
  amount: number;
  category: string;
  description: string;
  receiptUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ModuleEntry {
  id?: string;
  userId: string;
  moduleCode: string;
  moduleName: string;
  programme: string;
  status: 'Active' | 'Archived';
  visibility: 'Public' | 'Private';
  categories: string[];
  tasks: string[];
  taskDetails?: Record<string, { category?: string, deadline?: string, status?: 'active' | 'done', estimate?: number, submissions?: number, estTimePerSubmission?: number }>;
  estimatedHrs: number;
  rateGBP: number;
  description: string;
  note: string;
  remark: string;
}
