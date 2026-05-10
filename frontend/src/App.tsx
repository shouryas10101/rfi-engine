import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginPage from "./auth/LoginPage";
import OnboardPage from "./auth/OnboardPage";
import Layout from "./components/Layout";
import ProjectsPage from "./tml/ProjectsPage";
import ProjectDetailPage from "./tml/ProjectDetailPage";
import RFIDetailPage from "./tml/RFIDetailPage";
import ComparisonPage from "./tml/ComparisonPage";
import ReportPage from "./tml/ReportPage";
import SuppliersPage from "./tml/SuppliersPage";
import SupplierDetailPage from "./tml/SupplierDetailPage";
import SessionsPage from "./supplier/SessionsPage";
import ChatPage from "./supplier/ChatPage";
import CataloguePage from "./supplier/CataloguePage";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-ink-400">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "SUPPLIER_ENGINEER" ? "/sessions" : "/projects"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboard/:token" element={<OnboardPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/rfis/:id" element={<RFIDetailPage />} />
          <Route path="/rfis/:id/comparison" element={<ComparisonPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/:id" element={<ChatPage />} />
          <Route path="/sessions/:id/report" element={<ReportPage />} />
          <Route path="/catalogue" element={<CataloguePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
