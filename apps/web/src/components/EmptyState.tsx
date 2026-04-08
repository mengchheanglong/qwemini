type EmptyStateProps = {
  icon?: string;
  title?: string;
  message: string;
};

export function EmptyState({
  icon,
  title = 'Waiting for activity',
  message,
}: EmptyStateProps) {
  return (
    <div className="empty">
      {icon ? (
        <span className="empty-icon" aria-hidden="true">{icon}</span>
      ) : null}
      <strong className="empty-title">{title}</strong>
      <span className="empty-message">{message}</span>
    </div>
  );
}
