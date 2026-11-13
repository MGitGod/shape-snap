export interface BannerProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Banner({ message, actionLabel, onAction }: BannerProps) {
  return (
    <div className="banner" role="alert">
      <span>{message}</span>
      {actionLabel && onAction && (
        <button type="button" className="btn" onClick={(e) => { onAction(); e.currentTarget.blur(); }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
