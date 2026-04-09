import {ClaimEntry, ModuleEntry, TimesheetEntry} from '../types';

// Temporary local-only mock data for the development auth bypass.
// Remove this file and its import from App.tsx when local bypass testing is no longer needed.

const DEV_BYPASS_USER_ID = 'local-dev-user';

export const devMockModules: ModuleEntry[] = [
  {
    id: 'dev-module-1',
    userId: DEV_BYPASS_USER_ID,
    moduleCode: 'EDU101',
    moduleName: 'Assessment Planning',
    programme: 'Education',
    status: 'Active',
    visibility: 'Private',
    categories: ['Preparation', 'Marking'],
    tasks: ['Lecture Prep', 'Essay Marking'],
    taskDetails: {
      'Lecture Prep': {category: 'Preparation', status: 'active', estimate: 6},
      'Essay Marking': {category: 'Marking', status: 'active', estimate: 10, submissions: 24, estTimePerSubmission: 0.5},
    },
    estimatedHrs: 16,
    rateGBP: 42,
    description: 'Local mock module for development-only UI testing.',
    note: 'Dev bypass sample',
    remark: 'Visible only during local development bypass.',
  },
  {
    id: 'dev-module-2',
    userId: DEV_BYPASS_USER_ID,
    moduleCode: 'BUS204',
    moduleName: 'Seminar Delivery',
    programme: 'Business',
    status: 'Archived',
    visibility: 'Public',
    categories: ['Teaching', 'Admin'],
    tasks: ['Seminar Session', 'Attendance Follow-up'],
    taskDetails: {
      'Seminar Session': {category: 'Teaching', status: 'done', estimate: 2},
      'Attendance Follow-up': {category: 'Admin', status: 'active', estimate: 1},
    },
    estimatedHrs: 3,
    rateGBP: 38,
    description: 'Archived mock module for filter and detail testing.',
    note: 'Dev bypass sample',
    remark: '',
  },
];

export const devMockTimesheets: TimesheetEntry[] = [
  {
    id: 'dev-timesheet-1',
    userId: DEV_BYPASS_USER_ID,
    date: '2026-04-08',
    startTime: '09:00',
    endTime: '11:30',
    duration: '02:30:00',
    task: 'Lecture Prep',
    moduleCode: 'EDU101',
    category: 'Preparation',
    description: 'Prepared slide deck and teaching notes.',
    status: 'approved',
  },
  {
    id: 'dev-timesheet-2',
    userId: DEV_BYPASS_USER_ID,
    date: '2026-04-07',
    startTime: '13:00',
    endTime: '15:00',
    duration: '02:00:00',
    task: 'Essay Marking',
    moduleCode: 'EDU101',
    category: 'Marking',
    description: 'Reviewed first batch of submissions.',
    status: 'pending',
  },
  {
    id: 'dev-timesheet-3',
    userId: DEV_BYPASS_USER_ID,
    date: '2026-04-05',
    startTime: '10:00',
    endTime: '11:00',
    duration: '01:00:00',
    task: 'Seminar Session',
    moduleCode: 'BUS204',
    category: 'Teaching',
    description: 'Delivered seminar and answered follow-up questions.',
    status: 'approved',
  },
];

export const devMockClaims: ClaimEntry[] = [
  {
    id: 'dev-claim-1',
    userId: DEV_BYPASS_USER_ID,
    date: '2026-04-06',
    amount: 18.5,
    category: 'Travel',
    description: 'Local train fare for campus visit.',
    status: 'pending',
  },
];
