import { Mail, MessageCircle, MessageSquare, Phone, Upload } from "lucide-react";

import type { InputSource } from "../../types";

const toneMap: Record<InputSource, { bg: string; text: string; icon: typeof Phone }> = {
  CALL: { bg: "bg-[var(--green-b)]", text: "text-[var(--green)]", icon: Phone },
  SMS: { bg: "bg-[var(--amber-b)]", text: "text-[var(--amber)]", icon: MessageSquare },
  UPLOAD: { bg: "bg-[var(--blue-b)]", text: "text-[var(--blue)]", icon: Upload },
  EMAIL: { bg: "bg-[var(--purple-b)]", text: "text-[var(--purple)]", icon: Mail },
  WHATSAPP: { bg: "bg-[var(--green-b)]", text: "text-[var(--green)]", icon: MessageCircle },
};

export interface InputSourceIconProps {
  source: InputSource;
  size?: number;
}

export function InputSourceIcon({ source, size = 22 }: InputSourceIconProps) {
  const tone = toneMap[source];
  const Icon = tone.icon;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-[6px] ${tone.bg} ${tone.text}`}
      style={{ width: size, height: size }}
    >
      <Icon className="h-[13px] w-[13px]" strokeWidth={2} />
    </span>
  );
}


