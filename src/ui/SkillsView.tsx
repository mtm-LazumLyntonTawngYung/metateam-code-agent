import SkillsBrowser from "./modals/SkillsBrowser";

type SkillsViewProps = {
  onClose: () => void;
  activeSkillId?: string | null;
  onActivate?: (id: string | null) => void;
};

export default function SkillsView({ onClose, activeSkillId, onActivate }: SkillsViewProps) {
  return <SkillsBrowser onClose={onClose} activeSkillId={activeSkillId ?? null} onActivate={onActivate ?? (() => {})} />;
}
