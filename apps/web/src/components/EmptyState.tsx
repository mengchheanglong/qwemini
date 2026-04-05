type EmptyStateProps = {
  title?: string;
  message: string;
};

export function EmptyState({
  title = 'Waiting for activity',
  message,
}: EmptyStateProps) {
  return (
    <div className="empty">
      <strong className="empty-title">{title}</strong>
      <span className="empty-message">{message}</span>
    </div>
  );
}
