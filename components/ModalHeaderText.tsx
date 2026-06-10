type ModalHeaderTextProps = {
  id?: string;
  title: string;
  subtitle?: string;
};

export function ModalHeaderText({ id, title, subtitle }: ModalHeaderTextProps) {
  return (
    <div className="modal-header-text">
      <h2 id={id}>{title}</h2>
      {subtitle ? <p className="muted">{subtitle}</p> : null}
    </div>
  );
}
