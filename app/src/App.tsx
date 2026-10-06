import { lazy, Suspense, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { AuthGuard } from './features/auth/AuthGuard'
import { AuthProvider } from './features/auth/AuthProvider'
import { DashboardPage } from './pages/DashboardPage'
import { FinancialHistoryPage } from './features/finance/FinancialHistory'
import { LoginPage } from './pages/LoginPage'
import { FirstAccessPage } from './pages/FirstAccessPage'
const BarLayout = lazy(() => import('./features/bar/BarPages').then(module => ({ default: module.BarLayout })))
const BarProductsPage = lazy(() => import('./features/bar/BarPages').then(module => ({ default: module.BarProductsPage })))
const BarStockPage = lazy(() => import('./features/bar/BarPages').then(module => ({ default: module.BarStockPage })))
const BarCountsPage = lazy(() => import('./features/bar/BarPages').then(module => ({ default: module.BarCountsPage })))
const BarCashPage = lazy(() => import('./features/bar/BarPages').then(module => ({ default: module.BarCashPage })))
const BarSalesPage = lazy(() => import('./features/bar/BarPages').then(module => ({ default: module.BarSalesPage })))
const BarLossesPage = lazy(() => import('./features/bar/BarPages').then(module => ({ default: module.BarLossesPage })))
const BarPurchasesPage = lazy(() => import('./features/bar/BarPages').then(module => ({ default: module.BarPurchasesPage })))
const BarReconciliationPage = lazy(() => import('./features/bar/BarPages').then(module => ({ default: module.BarReconciliationPage })))
const BarRecipesPage = lazy(() => import('./features/bar/RecipePage').then(module => ({ default: module.BarRecipesPage })))
import { AccountPage } from './pages/AccountPage'
import { DemoDataProvider } from './features/operations/DemoDataProvider'
const StudentsPage = lazy(() => import('./pages/OperationsPages').then(module => ({ default: module.StudentsPage })))
const StudentDetailsPage = lazy(() => import('./pages/OperationsPages').then(module => ({ default: module.StudentDetailsPage })))
const TeamPage = lazy(() => import('./pages/OperationsPages').then(module => ({ default: module.TeamPage })))
const TeamDetailsPage = lazy(() => import('./pages/OperationsPages').then(module => ({ default: module.TeamDetailsPage })))
const InventoryPage = lazy(() => import('./pages/OperationsPages').then(module => ({ default: module.InventoryPage })))
const InventoryDetailsPage = lazy(() => import('./pages/OperationsPages').then(module => ({ default: module.InventoryDetailsPage })))
const ProjectsPage = lazy(() => import('./pages/OperationsPages').then(module => ({ default: module.ProjectsPage })))
const ProjectDetailsPage = lazy(() => import('./pages/OperationsPages').then(module => ({ default: module.ProjectDetailsPage })))
const ImportPage = lazy(() => import('./pages/ImportPage').then(module => ({ default: module.ImportPage })))
import { useAuth } from './features/auth/authContext'
import { operationalPermissions, type OperationalKind } from './features/operations/DemoDataProvider'
const RentalGroupsPage = lazy(() => import('./pages/RentalGroupsPage').then(module => ({ default: module.RentalGroupsPage })))
const RentalGroupPage = lazy(() => import('./pages/RentalGroupsPage').then(module => ({ default: module.RentalGroupPage })))
const CourtsPage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.CourtsPage })))
const AgendaPage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.AgendaPage })))
const RecurringReservationsPage = lazy(() => import('./pages/RecurringReservationsPage').then(module => ({ default: module.RecurringReservationsPage })))
const ReservationDetailsPage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.ReservationDetailsPage })))
const SchoolPage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.SchoolPage })))
const ClassDetailsPage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.ClassDetailsPage })))
const EnrollmentsPage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.EnrollmentsPage })))
const PresencesPage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.PresencesPage })))
const FinancePage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.FinancePage })))
const FinanceDetailsPage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.FinanceDetailsPage })))
const MaintenancePage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.MaintenancePage })))
const MaintenanceDetailsPage = lazy(() => import('./pages/ArenaPages').then(module => ({ default: module.MaintenanceDetailsPage })))
const SellPage = lazy(() => import('./features/attendance/AttendancePages').then(module => ({ default: module.SellPage })))
const TabsPage = lazy(() => import('./features/attendance/AttendancePages').then(module => ({ default: module.TabsPage })))
const TabDetailsPage = lazy(() => import('./features/attendance/AttendancePages').then(module => ({ default: module.TabDetailsPage })))
const OrdersPage = lazy(() => import('./features/attendance/AttendancePages').then(module => ({ default: module.OrdersPage })))
const ReceivePage = lazy(() => import('./features/attendance/PaymentPages').then(module => ({ default: module.ReceivePage })))
const ReceiptPage = lazy(() => import('./features/attendance/PaymentPages').then(module => ({ default: module.ReceiptPage })))
const MyCashPage = lazy(() => import('./features/attendance/CashPage').then(module => ({ default: module.MyCashPage })))
const BarOverviewPage = lazy(() => import('./features/attendance/ReportPages').then(module => ({ default: module.BarOverviewPage })))
const BarReportPage = lazy(() => import('./features/attendance/ReportPages').then(module => ({ default: module.BarReportPage })))
const BarSourcePage = lazy(() => import('./features/attendance/ReportPages').then(module => ({ default: module.BarSourcePage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

const PrototypeApp = lazy(() => import('./features/prototype/PrototypeApp').then(module => ({ default: module.PrototypeApp })))

const ClientPage = lazy(() => import('./features/attendance/ClientPage').then(module => ({ default: module.ClientPage })))

export function App() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><Routes>
    <Route path="/prototipo/*" element={<Suspense fallback={<main className="session-loading" role="status">Abrindo protótipo…</main>}><PrototypeApp /></Suspense>} />
    <Route path="/cliente" element={<Suspense fallback={<main className="session-loading" role="status">Abrindo sua comanda…</main>}><ClientPage /></Suspense>} />
    <Route path="*" element={<OperationalRoutes />} />
  </Routes></BrowserRouter></QueryClientProvider>
}

function Permission({ permission, demoMode = false, children }: { permission: string; demoMode?: boolean; children: ReactNode }) {
  const { user } = useAuth()
  return demoMode || user?.roles.includes('Owner') || user?.permissions.includes(permission) ? children : <section className="operation-page"><h1>Acesso restrito</h1><p role="alert">Peça à gestão para conferir sua permissão para esta área.</p></section>
}
function HomePage({ demoMode }: { demoMode: boolean }) {
  const { user } = useAuth()
  const management = user?.roles.includes('Owner') || Object.values(operationalPermissions).some(item => user?.permissions.includes(item.read)) || ['bar:finance:read', 'bar:catalog:write', 'bar:stock:manage', 'bar:purchases:manage', 'bar:supervise'].some(permission => user?.permissions.includes(permission))
  return !demoMode && !management && user?.permissions.includes('bar:sales:operate') ? <Navigate to="/atendimento/vender" replace /> : <DashboardPage />
}
function OperationalRoutes() {
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true'
  const arena = (kind: OperationalKind, page: ReactNode) => <Permission demoMode={demoMode} permission={operationalPermissions[kind].read}>{page}</Permission>
  const bar = (permission: string, page: ReactNode) => <Permission permission={permission}>{page}</Permission>
  const application = <Route element={<Suspense fallback={<main className="session-loading" role="status">Abrindo sua área…</main>}><AppShell demoMode={demoMode} /></Suspense>}>
    <Route index element={<HomePage demoMode={demoMode} />} />
    <Route path="conta" element={<AccountPage />} />
    <Route path="financeiro/historico" element={<FinancialHistoryPage />} />
    <Route path="alunos" element={arena('students', <StudentsPage />)} />
    <Route path="alunos/:studentId" element={arena('students', <StudentDetailsPage />)} />
    <Route path="equipe" element={arena('team', <TeamPage />)} />
    <Route path="equipe/:memberId" element={arena('team', <TeamDetailsPage />)} />
    <Route path="estoque" element={arena('inventory', <InventoryPage />)} />
    <Route path="estoque/:itemId" element={arena('inventory', <InventoryDetailsPage />)} />
    <Route path="projetos" element={arena('projects', <ProjectsPage />)} />
    <Route path="projetos/:projectId" element={arena('projects', <ProjectDetailsPage />)} />
    <Route path="mensalistas" element={arena('rentalGroups', <RentalGroupsPage />)} />
    <Route path="mensalistas/:groupId" element={arena('rentalGroups', <RentalGroupPage />)} />
    <Route path="quadras" element={arena('courts', <CourtsPage />)} />
    <Route path="agenda" element={arena('reservations', <AgendaPage />)} />
    <Route path="agenda/recorrentes/novo" element={arena('reservations', <RecurringReservationsPage />)} />
    <Route path="agenda/:reservationId" element={arena('reservations', <ReservationDetailsPage />)} />
    <Route path="escola" element={arena('classes', <SchoolPage />)} />
    <Route path="escola/turmas/:classId" element={arena('classes', <ClassDetailsPage />)} />
    <Route path="escola/:classId" element={arena('classes', <ClassDetailsPage />)} />
    <Route path="escola/matriculas" element={arena('enrollments', <EnrollmentsPage />)} />
    <Route path="escola/presencas" element={arena('presences', <PresencesPage />)} />
    <Route path="financeiro" element={arena('financeEntries', <FinancePage />)} />
    <Route path="financeiro/:entryId" element={arena('financeEntries', <FinanceDetailsPage />)} />
    <Route path="manutencao" element={arena('maintenance', <MaintenancePage />)} />
    <Route path="manutencao/:maintenanceId" element={arena('maintenance', <MaintenanceDetailsPage />)} />
    {!demoMode && <>
      <Route path="atendimento/vender" element={bar('bar:sales:operate', <SellPage />)} />
      <Route path="atendimento/comandas" element={bar('bar:sales:read', <TabsPage />)} />
      <Route path="atendimento/comandas/:tabId" element={bar('bar:sales:read', <TabDetailsPage />)} />
      <Route path="atendimento/pedidos" element={bar('bar:sales:operate', <OrdersPage />)} />
      <Route path="atendimento/receber/:tabId" element={bar('bar:sales:operate', <ReceivePage />)} />
      <Route path="atendimento/comprovante/:tabId/:paymentId" element={bar('bar:sales:read', <ReceiptPage />)} />
      <Route path="atendimento/caixa" element={bar('bar:cash:operate', <MyCashPage />)} />
      <Route path="bar" element={<BarLayout />}>
        <Route index element={<Navigate to="/atendimento/vender" replace />} />
        <Route path="produtos" element={bar('bar:catalog:write', <BarProductsPage />)} />
        <Route path="receitas" element={bar('bar:catalog:write', <BarRecipesPage />)} />
        <Route path="receitas/:productId" element={bar('bar:catalog:write', <BarRecipesPage />)} />
        <Route path="estoque" element={bar('bar:stock:read', <BarStockPage />)} />
        <Route path="inventario" element={bar('bar:stock:manage', <BarCountsPage />)} />
        <Route path="caixa" element={bar('bar:supervise', <BarCashPage />)} />
        <Route path="vendas" element={bar('bar:sales:read', <BarSalesPage />)} />
        <Route path="perdas" element={bar('bar:stock:output', <BarLossesPage />)} />
        <Route path="compras" element={bar('bar:purchases:manage', <BarPurchasesPage />)} />
        <Route path="indicadores" element={bar('bar:finance:read', <BarOverviewPage />)} />
        <Route path="indicadores/:metric" element={bar('bar:finance:read', <BarReportPage />)} />
        <Route path="registros/:kind/:resourceId" element={bar('bar:finance:read', <BarSourcePage />)} />
        <Route path="conciliacao" element={bar('bar:payments:reconcile', <BarReconciliationPage />)} />
      </Route>
      <Route path="importacoes" element={bar('users:manage', <ImportPage />)} />
    </>}
  </Route>
  return <AuthProvider demoMode={demoMode}><DemoDataProvider enabled demoMode={demoMode}><Routes>
    <Route path="login" element={demoMode ? <Navigate to="/" replace /> : <LoginPage />} />
    <Route path="primeiro-acesso" element={demoMode ? <Navigate to="/" replace /> : <FirstAccessPage />} />
    {demoMode ? application : <Route element={<AuthGuard />}>{application}</Route>}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes><PwaUpdatePrompt /></DemoDataProvider></AuthProvider>
}
