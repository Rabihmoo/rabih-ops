import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { TasksPage } from './pages/Tasks';
import { TaskNewPage } from './pages/TaskNew';
import { TaskDetailPage } from './pages/TaskDetail';
import { FollowUpsPage } from './pages/FollowUps';
import { InspectionsPage } from './pages/Inspections';
import { SettingsPage } from './pages/Settings';
import { AuthCallbackPage } from './pages/AuthCallback';
import { Toaster } from './components/ui/toaster';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/new" element={<TaskNewPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/follow-ups" element={<FollowUpsPage />} />
          <Route path="/inspections" element={<InspectionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
