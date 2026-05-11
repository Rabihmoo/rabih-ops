import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { ActivityInboxPage } from './pages/ActivityInbox';
import { TasksPage } from './pages/Tasks';
import { TaskNewPage } from './pages/TaskNew';
import { TaskDetailPage } from './pages/TaskDetail';
import { FixedTasksPage } from './pages/FixedTasks';
import { FixedTaskNewPage } from './pages/FixedTaskNew';
import { FixedTaskDetailPage } from './pages/FixedTaskDetail';
import { DocumentsPage } from './pages/Documents';
import { DocumentNewPage } from './pages/DocumentNew';
import { DocumentDetailPage } from './pages/DocumentDetail';
import { FollowUpsPage } from './pages/FollowUps';
import { FollowUpNewPage } from './pages/FollowUpNew';
import { FollowUpDetailPage } from './pages/FollowUpDetail';
import { InspectionsPage } from './pages/Inspections';
import { InspectionNewPage } from './pages/InspectionNew';
import { InspectionDetailPage } from './pages/InspectionDetail';
import { PurchasesPage } from './pages/Purchases';
import { PurchaseNewPage } from './pages/PurchaseNew';
import { PurchaseDetailPage } from './pages/PurchaseDetail';
import { SettingsPage } from './pages/Settings';
import { DirectoryPage } from './pages/Directory';
import { CompaniesPage } from './pages/Companies';
import { CompanyNewPage } from './pages/CompanyNew';
import { CompanyDetailPage } from './pages/CompanyDetail';
import { ContactsPage } from './pages/Contacts';
import { ContactNewPage } from './pages/ContactNew';
import { ContactDetailPage } from './pages/ContactDetail';
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
          <Route path="/inbox" element={<ActivityInboxPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/new" element={<TaskNewPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/fixed-tasks" element={<FixedTasksPage />} />
          <Route path="/fixed-tasks/new" element={<FixedTaskNewPage />} />
          <Route path="/fixed-tasks/:id" element={<FixedTaskDetailPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/documents/new" element={<DocumentNewPage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
          <Route path="/follow-ups" element={<FollowUpsPage />} />
          <Route path="/follow-ups/new" element={<FollowUpNewPage />} />
          <Route path="/follow-ups/:id" element={<FollowUpDetailPage />} />
          <Route path="/inspections" element={<InspectionsPage />} />
          <Route path="/inspections/new" element={<InspectionNewPage />} />
          <Route path="/inspections/:id" element={<InspectionDetailPage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/purchases/new" element={<PurchaseNewPage />} />
          <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/new" element={<CompanyNewPage />} />
          <Route path="/companies/:id" element={<CompanyDetailPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/contacts/new" element={<ContactNewPage />} />
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
