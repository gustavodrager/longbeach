import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { AuthGuard } from './features/auth/AuthGuard'
import { AuthProvider } from './features/auth/AuthProvider'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { BarLayout, BarProductsPage, BarStockPage, BarCountsPage, BarCashPage, BarPosPage, BarSalesPage, BarLossesPage, BarPurchasesPage, BarDashboardPage, BarReconciliationPage } from './features/bar/BarPages'
import { AccountPage } from './pages/AccountPage'
import { DemoDataProvider } from './features/operations/DemoDataProvider'
import { StudentsPage, StudentDetailsPage, TeamPage, InventoryPage, ProjectsPage } from './pages/OperationsPages'
import { ImportPage } from './pages/ImportPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export function App() {
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider demoMode={demoMode}>
          <DemoDataProvider enabled demoMode={demoMode}>
          <Routes>
            {demoMode ? (
              <>
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route element={<AppShell demoMode />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="alunos" element={<StudentsPage />} />
                  <Route path="alunos/:studentId" element={<StudentDetailsPage />} />
                  <Route path="equipe" element={<TeamPage />} />
                  <Route path="estoque" element={<InventoryPage />} />
                  <Route path="projetos" element={<ProjectsPage />} />
                </Route>
              </>
            ) : (
              <>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<AuthGuard />}>
                  <Route element={<AppShell />}>
                    <Route index element={<DashboardPage />} />
                    <Route path="conta" element={<AccountPage />} />
                    <Route path="bar" element={<BarLayout />}>
                      <Route index element={<BarPosPage />} />
                      <Route path="produtos" element={<BarProductsPage />} />
                      <Route path="estoque" element={<BarStockPage />} />
                      <Route path="inventario" element={<BarCountsPage />} />
                      <Route path="caixa" element={<BarCashPage />} />
                      <Route path="vendas" element={<BarSalesPage />} />
                      <Route path="perdas" element={<BarLossesPage />} />
                      <Route path="compras" element={<BarPurchasesPage />} />
                      <Route path="indicadores" element={<BarDashboardPage />} />
                      <Route path="conciliacao" element={<BarReconciliationPage />} />
                    </Route>
                    <Route path="alunos" element={<StudentsPage />} />
                    <Route path="alunos/:studentId" element={<StudentDetailsPage />} />
                    <Route path="equipe" element={<TeamPage />} />
                    <Route path="estoque" element={<InventoryPage />} />
                    <Route path="projetos" element={<ProjectsPage />} />
                  </Route>
                </Route>
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <PwaUpdatePrompt />
          </DemoDataProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
