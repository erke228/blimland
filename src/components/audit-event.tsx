import {
  FilePlus2,
  FilePenLine,
  Trash2,
  RotateCcw,
  Send,
  ShieldCheck,
  Settings2,
  Activity,
} from 'lucide-react';
import { auditPresentation } from '@/lib/audit-presentation';
const icons = {
  create: FilePlus2,
  edit: FilePenLine,
  remove: Trash2,
  restore: RotateCcw,
  publish: Send,
  access: ShieldCheck,
  settings: Settings2,
  other: Activity,
};
export function AuditEvent({ action }: { action: string }) {
  const { kind, label, category, permanent } = auditPresentation(action),
    Icon = icons[kind];
  return (
    <div className={`audit-event ${kind} ${permanent ? 'permanent' : ''}`}>
      <span className="audit-event-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span>
        <strong>{label}</strong>
        <small>{permanent ? 'Қайтарымсыз жою' : category}</small>
      </span>
    </div>
  );
}
