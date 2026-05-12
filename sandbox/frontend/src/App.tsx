import { Routes, Route } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { RegisterPage } from './auth/RegisterPage'
import { ForgotPasswordPage } from './auth/ForgotPasswordPage'
import { ResetPasswordPage } from './auth/ResetPasswordPage'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './sandbox/AppLayout'
import { SidebarActionsProvider } from './sandbox/SidebarActions'
import { DashboardView } from './sandbox/DashboardView'
import { BranchView } from './sandbox/BranchView'
import { ShareView } from './sandbox/ShareView'
import { Agentation } from 'agentation'

export default function App() {
  return (
    <>
      <Routes>
        {/* Public auth pages (no sidebar) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        {/* Public share links (no sidebar) */}
        <Route path="/share/:token/*" element={<ShareView />} />
      </Routes>

      <Routes>
        {/* Wrapped in AppLayout with sidebar */}
        <Route element={<ProtectedRoute />}>
          <Route element={
            <SidebarActionsProvider>
              <AppLayout />
            </SidebarActionsProvider>
          }>
            <Route path="/" element={<DashboardView />} />
            <Route path="/branch/:slug/*" element={<BranchView />} />
          </Route>
        </Route>
      </Routes>

      {localStorage.getItem('skala_agentation_enabled') === 'true' && <Agentation />}
    </>
  )
}
