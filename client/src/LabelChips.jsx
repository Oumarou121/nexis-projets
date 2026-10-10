import { labelHue } from "./labels.js";

/** Pastilles d'étiquettes (teinte stable déduite du nom). `onRemove` (facultatif) ajoute un bouton de retrait. */
export default function LabelChips({ labels, onRemove }) {
  if (!labels?.length) return null;
  return (
    <span className="labels">
      {labels.map((l) => (
        <span key={l} className="chip label" style={{ "--h": labelHue(l) }}>
          {l}
          {onRemove && <button type="button" className="chip-x" aria-label={`Retirer l'étiquette ${l}`} onClick={() => onRemove(l)}>×</button>}
        </span>
      ))}
    </span>
  );
}
