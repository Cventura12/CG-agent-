import { ArrowRight, Clock3, MessageSquareText, PhoneCall, Upload } from "lucide-react";

type SourceAction = {
  key: string;
  label: string;
  detail: string;
  onClick?: () => void;
  icon: typeof PhoneCall;
  toneClass: string;
};

export interface AgentFeedEmptyProps {
  onPhoneClick?: () => void;
  onUploadClick?: () => void;
  onSmsClick?: () => void;
}

export function AgentFeedEmpty({
  onPhoneClick,
  onUploadClick,
  onSmsClick,
}: AgentFeedEmptyProps) {
  const sources: SourceAction[] = [
    {
      key: "phone",
      label: "Phone",
      detail: "Route calls or forward voicemails",
      onClick: onPhoneClick,
      icon: PhoneCall,
      toneClass: "bg-[var(--green-b)] text-[var(--green)]",
    },
    {
      key: "upload",
      label: "Upload transcript",
      detail: "Drop in a call transcript or field note",
      onClick: onUploadClick,
      icon: Upload,
      toneClass: "bg-[var(--blue-b)] text-[var(--blue)]",
    },
    {
      key: "sms",
      label: "SMS",
      detail: "Forward field texts and customer threads",
      onClick: onSmsClick,
      icon: MessageSquareText,
      toneClass: "bg-[var(--amber-b)] text-[var(--amber)]",
    },
  ];

  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)]">
      <div className="flex gap-[14px] border-b border-[var(--line)] p-5">
        <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-lg border border-[var(--acl)] bg-[var(--acl)] text-[var(--accent)]">
          <div className="flex h-[20px] w-[20px] items-center justify-center rounded-full border border-dashed border-current">
            <Clock3 className="h-[10px] w-[10px]" strokeWidth={2} />
          </div>
        </div>
        <div>
          <div className="text-[13px] font-medium text-[var(--t1)]">Agent is standing by</div>
          <div className="mt-[4px] text-[12px] leading-[1.6] text-[var(--t2)]">
            Arbor Agent is live and waiting for the first real input. Connect one source and the
            feed becomes the place where calls, transcripts, and unresolved field work surface.
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-[10px] text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--t3)]">
          Connect an input source
        </div>
        <div className="flex flex-col gap-2">
          {sources.map((source) => {
            const Icon = source.icon;

            return (
              <button
                key={source.key}
                type="button"
                onClick={source.onClick}
                className="group flex items-center gap-[10px] rounded-[7px] border border-[var(--line-2)] bg-[var(--bg-3)] px-3 py-[10px] text-left transition hover:border-[var(--line-3)] hover:bg-[var(--bg-4)]"
              >
                <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-md ${source.toneClass}`}>
                  <Icon className="h-[12px] w-[12px]" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-[var(--t1)]">{source.label}</span>
                  <span className="mt-[1px] block font-mono text-[10px] text-[var(--t3)]">{source.detail}</span>
                </span>
                <ArrowRight className="h-[12px] w-[12px] text-[var(--t3)] transition group-hover:text-[var(--t2)]" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


