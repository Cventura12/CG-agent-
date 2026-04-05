import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AnalyticsView from "./components/analytics/AnalyticsView";
import JobsView from "./components/jobs/JobsView";
import QuotesView from "./components/quotes/QuotesView";
import QueueView from "./components/queue/QueueView";
import { AppShell } from "./components/shell/AppShell";
import TodayView from "./components/today/TodayView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="today" element={<TodayView />} />
          <Route path="queue" element={<QueueView />} />
          <Route path="queue/:id" element={<QueueView />} />
          <Route path="quotes" element={<QuotesView />} />
          <Route path="quotes/:id" element={<QuotesView />} />
          <Route path="jobs" element={<JobsView />} />
          <Route path="jobs/:id" element={<JobsView />} />
          <Route path="analytics" element={<AnalyticsView />} />
        </Route>
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
