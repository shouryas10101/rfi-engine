import { Link } from "react-router-dom";

export type BreadcrumbItem = {
  label: string;
  to?: string;
};

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-2 mb-5 flex-wrap">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-ink-300 text-base font-light select-none">/</span>
            )}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                className="text-base font-medium text-ink-500 hover:text-ink-900 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-base font-bold text-ink-900">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
