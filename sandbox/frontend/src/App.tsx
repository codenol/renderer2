import { Routes, Route } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { RegisterPage } from './auth/RegisterPage'
import { ForgotPasswordPage } from './auth/ForgotPasswordPage'
import { ResetPasswordPage } from './auth/ResetPasswordPage'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { UploadView } from './sandbox/UploadView'
import { BranchView } from './sandbox/BranchView'
import { ShareView } from './sandbox/ShareView'
import { Agentation } from 'agentation'

export default function App() {
  return (
    <>
      <Routes>
        {/* Public auth pages */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        {/* Protected: requires login */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<UploadView />} />
          <Route path="/branch/:slug/*" element={<BranchView />} />
        </Route>

        {/* Public share links (no auth required) */}
        <Route path="/share/:token/*" element={<ShareView />} />
      </Routes>
      <Agentation />
    </>
  )
}
