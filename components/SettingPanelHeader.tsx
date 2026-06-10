type SettingPanelHeaderProps = {
  title: string;
  subtitle: string;
};

export function SettingPanelHeader({ title, subtitle }: SettingPanelHeaderProps) {
  return (
    <div className="setting-panel-header">
      <h2>{title}</h2>
      <p className="muted">{subtitle}</p>
    </div>
  );
}
