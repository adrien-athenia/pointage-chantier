import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminLayout } from './layouts/AdminLayout'
import { EmployeeLayout } from './layouts/EmployeeLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { PointagesPage } from './pages/PointagesPage'
import { ChantiersPage } from './pages/ChantiersPage'
import { EmployesPage } from './pages/EmployesPage'
import { SuiviChantierPage } from './pages/SuiviChantierPage'
import { EmployeePage } from './pages/EmployeePage'
import { NotFoundPage } from './pages/NotFoundPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Admin */}
        <Route
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/pointages" element={<PointagesPage />} />
          <Route path="/chantiers" element={<ChantiersPage />} />
          <Route path="/employes" element={<EmployesPage />} />
          <Route path="/suivi-chantier" element={<SuiviChantierPage />} />
        </Route>

        {/* Employe */}
        <Route
          element={
            <ProtectedRoute allowedRoles={['employe']}>
              <EmployeeLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/employe" element={<EmployeePage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
