import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import SignupPage from "@/pages/auth/SignupPage";
import Dashboard from "@/pages/Dashboard";
import PlaceholderPage from "@/pages/PlaceholderPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Protected */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/wallet" element={<PlaceholderPage />} />
          <Route path="/kyc" element={<PlaceholderPage />} />
          <Route path="/bets" element={<PlaceholderPage />} />
          <Route path="/withdraw" element={<PlaceholderPage />} />
          <Route path="/sessions" element={<PlaceholderPage />} />
          <Route path="/notifications" element={<PlaceholderPage />} />
          <Route path="/profile" element={<PlaceholderPage />} />
        </Route>

        {/* Redirect root */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
