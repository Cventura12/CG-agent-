import { motion } from "framer-motion";
import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { slideRight } from "../../lib/animations";
import { useAppStore } from "../../store/appStore";
import type { QueueItem } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { QueueItem as QueueRow } from "./QueueItem";
import { QueueItemDetail } from "./QueueItemDetail";

type QueueFilter = "all" | "needs_review" | "manual_review" | "urgent" | "snoozed";

const filters: Array<{ label: string; value: QueueFilter }> = [
  { label: "All", value: "all" },
  { label: "Needs review", value: "needs_review" },
  { label: "Manual review", value: "manual_review" },
  { label: "Urgent", value: "urgent" },
  { label: "Snoozed", value: "snoozed" },
];

export interface QueueViewProps {
  items?: QueueItem[];
}

function matchesFilter(item: QueueItem, filter: QueueFilter): boolean {
  if (filter === "needs_review") return item.status === "pending" || item.status === "manual_review";
  if (filter === "manual_review") return item.status === "manual_review";
  if (filter === "urgent") return item.urgent;
  if (filter === "snoozed") return item.status === "snoozed";
  return true;
}

function QueueViewContent({ items, useStore = false }: { items: QueueItem[]; useStore?: boolean }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const approveQueueItem = useAppStore((state) => state.approveQueueItem);
  const dismissQueueItem = useAppStore((state) => state.dismissQueueItem);
  const toggleExtractedAction = useAppStore((state) => state.toggleExtractedAction);
  const setSelectedQueueItem = useAppStore((state) => state.setSelectedQueueItem);
  const [filter, setFilter] = useState<QueueFilter>("all");

  const filteredItems = useMemo(() => items.filter((item) => matchesFilter(item, filter)), [filter, items]);
  const selectedItem = filteredItems.find((item) => item.id === id) ?? items.find((item) => item.id === id) ?? null;

  useEffect(() => {
    if (useStore) {
      setSelectedQueueItem(selectedItem?.id ?? null);
    }
  }, [selectedItem?.id, setSelectedQueueItem, useStore]);

  return (
    <div className="relative flex h-full overflow-hidden bg-[var(--bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[var(--line)] px-3 py-2.5 sm:px-5">
          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            {filters.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setFilter(entry.value)}
                className={`rounded-[5px] border px-2.5 py-1 font-mono text-[11px] transition ${
                  filter === entry.value
                    ? "border-[var(--acl)] bg-[var(--acl-2)] text-[var(--accent-2)]"
                    : "border-[var(--line-2)] bg-transparent text-[var(--t3)] hover:border-[var(--line-3)] hover:text-[var(--t2)]"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="Queue is clear"
              description="The agent will surface new items as calls and messages come in."
            />
          ) : (
            filteredItems.map((item, index) => (
              <motion.div key={item.id} custom={index} initial="hidden" animate="visible" variants={slideRight}>
                <QueueRow
                  item={item}
                  selected={selectedItem?.id === item.id}
                  onClick={() => navigate(`/queue/${item.id}`)}
                />
              </motion.div>
            ))
          )}
        </div>
      </div>

      {selectedItem ? (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="absolute inset-0 z-20 lg:static lg:inset-auto"
        >
          <QueueItemDetail
            item={selectedItem}
            onClose={() => navigate("/queue")}
            onApproveAll={() => {
              approveQueueItem(selectedItem.id);
            }}
            onDismiss={() => {
              dismissQueueItem(selectedItem.id);
              navigate("/queue");
            }}
            onToggleAction={(actionId) => toggleExtractedAction(selectedItem.id, actionId)}
          />
        </motion.div>
      ) : null}
    </div>
  );
}

export default function QueueView() {
  const items = useAppStore((state) => state.queueItems);
  return <QueueViewContent items={items} useStore />;
}

export function QueueViewDemo() {
  const items = useAppStore.getState().queueItems;
  return <QueueViewContent items={items} />;
}



