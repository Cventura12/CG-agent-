import { TodayView } from "./TodayView";

export function TodayViewDemo() {
  return (
    <TodayView
      user={{
        name: "Caleb Ventura",
        initials: "CV",
        role: "Owner / GC",
      }}
      agentStatus={{
        active: true,
        itemsProcessed: 14,
        lastActivity: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
        waitingFor: "next inbound call",
      }}
      queueItems={[
        {
          id: "q-1",
          description: "Roof leak call from Pine Hollow needs approval before a change order goes out.",
          source: "CALL",
          jobId: "job-1",
          jobName: "Pine Hollow reroof",
          urgent: true,
          status: "pending",
          createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        },
        {
          id: "q-2",
          description: "Customer text asked for material upgrade pricing on Ridgeview addition.",
          source: "SMS",
          jobId: "job-2",
          jobName: "Ridgeview addition",
          urgent: false,
          status: "pending",
          createdAt: new Date(Date.now() - 1000 * 60 * 31).toISOString(),
        },
      ]}
      openQuotes={3}
      followUpsDue={2}
      activeJobs={9}
      recentJobs={[
        {
          id: "job-1",
          name: "Pine Hollow reroof",
          status: "active",
          lastActivity: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
        },
        {
          id: "job-2",
          name: "Ridgeview addition",
          status: "quoted",
          lastActivity: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
        },
        {
          id: "job-3",
          name: "Crestline repair",
          status: "closed",
          lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
        },
      ]}
      setupStepsCompleted={2}
      currentTime={new Date()}
    />
  );
}
