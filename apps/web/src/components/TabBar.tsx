type TabItem<T extends string> = {
  id: T;
  label: string;
  badge?: number | string;
};

type TabBarProps<T extends string> = {
  activeId: T;
  items: TabItem<T>[];
  onSelect: (id: T) => void;
  className?: string;
};

export function TabBar<T extends string>({
  activeId,
  items,
  onSelect,
  className,
}: TabBarProps<T>) {
  return (
    <div className={`tab-bar${className ? ` ${className}` : ''}`} role="tablist">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`tab-chip${active ? ' active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="tab-label">{item.label}</span>
            {item.badge !== undefined ? (
              <span className="tab-badge">{item.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
