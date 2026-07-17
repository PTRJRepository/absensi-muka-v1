import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/layout/Layout/Layout';
import { ErrorBoundary } from './components/common/ErrorBoundary/ErrorBoundary';
import { DashboardPage } from './components/features/dashboard/DashboardPage';
import { MachinesPage } from './components/features/machines/MachinesPage';
import { AttendancePage } from './components/features/attendance/AttendancePage';
import { AttendanceMatrixPage } from './components/features/matrix/AttendanceMatrixPage';
import { QualityPage } from './components/features/quality/QualityPage';
import { SettingsPage } from './components/features/settings/SettingsPage';
import { MonitoringDashboard } from './components/features/monitoring/MonitoringDashboard';
import { AlertPage } from './components/features/alerts/AlertPage';
import { EmployeeComprehensivePage } from './components/features/employees-comprehensive/EmployeeComprehensivePage';
import { MachineClockHealthPage } from './components/features/clock-health/MachineClockHealthPage';
import { ClaudeCliPage } from './components/features/claude-cli/ClaudeCliPage';
import { UI_ESTATE_GRID, UI_ESTATE_GRID_MATRIX, UI_ESTATE_GRID_MACHINES, UI_ESTATE_GRID_SEARCH } from './config/feature-flags';
import { PreviewPage } from './features/estate-attendance/pages/PreviewPage';
import { AttendanceWorkspacePage } from './features/estate-attendance/pages/AttendanceWorkspacePage';
import { MachineDataPage } from './features/estate-attendance/pages/MachineDataPage';
import { EmployeeSearchPage } from './features/estate-attendance/pages/EmployeeSearchPage';
import { ParsedDataPage } from './features/estate-attendance/pages/ParsedDataPage';

const router = createBrowserRouter([
  // ─── Estate Operations Grid UI — Preview (standalone, no Layout) ───
  ...(UI_ESTATE_GRID
    ? [
        {
          path: '/preview/estate',
          element: (
            <ErrorBoundary>
              <PreviewPage />
            </ErrorBoundary>
          ),
        },
      ]
    : []),
  // ─── Estate Operations Grid — Attendance Matrix ───
  ...(UI_ESTATE_GRID_MATRIX
    ? [
        {
          path: '/attendance',
          element: (
            <ErrorBoundary>
              <AttendanceWorkspacePage />
            </ErrorBoundary>
          ),
        },
      ]
    : []),
  // ─── Estate Operations Grid — Machine Data Explorer ───
  ...(UI_ESTATE_GRID_MACHINES
    ? [
        {
          path: '/machines',
          element: (
            <ErrorBoundary>
              <MachineDataPage />
            </ErrorBoundary>
          ),
        },
      ]
    : []),
  // ─── Estate Operations Grid — Employee Search ───
  ...(UI_ESTATE_GRID_SEARCH
    ? [
        {
          path: '/employees',
          element: (
            <ErrorBoundary>
              <EmployeeSearchPage />
            </ErrorBoundary>
          ),
        },
        {
          path: '/parsed',
          element: (
            <ErrorBoundary>
              <ParsedDataPage />
            </ErrorBoundary>
          ),
        },
      ]
    : []),
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'dasbor', element: <DashboardPage /> },
      { path: 'monitoring', element: <MonitoringDashboard /> },
      { path: 'mesin', element: <MachinesPage /> },
      { path: 'absensi', element: <AttendancePage /> },
      { path: 'absensi/matriks', element: <AttendanceMatrixPage /> },
      { path: 'karyawan', element: <EmployeeComprehensivePage /> },
      { path: 'laporan', element: <QualityPage /> },
      { path: 'laporan/clock-health', element: <MachineClockHealthPage /> },
      { path: 'notifikasi', element: <AlertPage /> },
      { path: 'pengaturan', element: <SettingsPage /> },
      { path: 'claude-cli', element: <ClaudeCliPage /> },
      { path: 'claude', element: <ClaudeCliPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
