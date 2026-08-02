import type { ReactNode } from "react";

export function WorkspacePage({
  ariaLabel,
  children,
  inspector,
  className = "",
}: {
  ariaLabel: string;
  children: ReactNode;
  inspector?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={`workspace-page ${inspector ? "has-inspector" : ""} ${className}`.trim()}
    >
      <div className="workspace-page-body">{children}</div>
      {inspector ? <div className="workspace-page-inspector">{inspector}</div> : null}
    </section>
  );
}

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-page-header">
      <div className="min-w-0">
        {eyebrow ? <p className="workspace-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="workspace-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="workspace-page-actions">{actions}</div> : null}
    </header>
  );
}

export function WorkspacePanel({
  ariaLabel,
  children,
  className = "",
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={ariaLabel} className={`workspace-panel ${className}`.trim()}>
      {children}
    </section>
  );
}
