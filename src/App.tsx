import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSettings, patchSettings } from "./lib/db";
import HomePage from "./pages/HomePage";
import DayPage from "./pages/DayPage";
import HealthPage from "./pages/HealthPage";
import SettingsPage from "./pages/SettingsPage";
import OnboardingPage from "./pages/OnboardingPage";
import BottomNav from "./components/BottomNav";

export default function App() {
  const location = useLocation();
  const settings = useLiveQuery(() => getSettings(), []);
  const userCount = useLiveQuery(() => db.users.count(), []);

  // 활성 사용자가 사라진 경우 자동 정리
  useEffect(() => {
    if (!settings?.activeUserId) return;
    db.users.get(settings.activeUserId).then((u) => {
      if (!u) patchSettings({ activeUserId: undefined });
    });
  }, [settings?.activeUserId]);

  // 데이터 로딩 중
  if (settings === undefined || userCount === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        로딩 중…
      </div>
    );
  }

  const needsOnboarding = !settings.onboarded || userCount === 0;
  const isOnboardingRoute = location.pathname.startsWith("/onboarding");

  if (needsOnboarding && !isOnboardingRoute) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div
      className="mx-auto flex h-full w-full max-w-screen-sm flex-col bg-slate-950"
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "var(--safe-bottom)",
      }}
    >
      <main className="flex-1 overflow-y-auto pb-24">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/day/:date" element={<DayPage />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isOnboardingRoute && <BottomNav />}
    </div>
  );
}
