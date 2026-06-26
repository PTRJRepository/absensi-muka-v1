import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/layout/Layout/Layout';
import { ErrorBoundary } from './components/common/ErrorBoundary/ErrorBoundary';
import { DashboardPage } from './components/features/dashboard/DashboardPage';
import { MachinesPage } from './components/features/machines/MachinesPage';
import { AttendancePage } from './components/features/attendance/AttendancePage';
import { AttendanceMatrixPage } from './components/features/matrix/AttendanceMatrixPage';
import { QualityPage } from './components/features/quality/QualityPage';
import { CurrentEmpCodeDashboard } from './components/features/quality/CurrentEmpCodeDashboard';
import { SettingsPage } from './components/features/settings/SettingsPage';
import { RealtimePage } from './components/features/realtime/RealtimePage';
import { MonitoringDashboard } from './components/features/monitoring/MonitoringDashboard';
import { AlertPage } from './components/features/alerts/AlertPage';
import { BatchHistoryPage } from './components/features/batches/BatchHistoryPage';
import { EmployeeComprehensivePage } from './components/features/employees-comprehensive/EmployeeComprehensivePage';
import { MachineClockHealthPage } from './components/features/clock-health/MachineClockHealthPage';

const router = createBrowserRouter([
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
      { path: 'absensi/live', element: <RealtimePage /> },
      { path: 'karyawan', element: <EmployeeComprehensivePage /> },
      { path: 'laporan', element: <QualityPage /> },
      { path: 'laporan/mapping-quality', element: <CurrentEmpCodeDashboard /> },
      { path: 'laporan/clock-health', element: <MachineClockHealthPage /> },
      { path: 'notifikasi', element: <AlertPage /> },
      { path: 'batch', element: <BatchHistoryPage /> },
      { path: 'pengaturan', element: <SettingsPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
