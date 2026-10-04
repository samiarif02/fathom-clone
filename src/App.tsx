import { Navigate, Route, Routes, useLocation } from "react-router";
import type { ReactNode } from "react";
import { useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Meetings from "./pages/Meetings";
import MeetingPage from "./pages/meeting/MeetingPage";
import Clip from "./pages/Clip";
import NewRecording from "./pages/NewRecording";
import Upcoming from "./pages/Upcoming";
import Landing from "./pages/landing/Landing";

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid h-full place-items-center text-sm text-zinc-500">Loading…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route index element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/c/:token" element={<Clip />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/meetings/:id" element={<MeetingPage />} />
        <Route path="/new" element={<NewRecording />} />
        <Route path="/calendar" element={<Upcoming />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
