export function AccessibilityShell({
  navigation,
  children,
}: {
  navigation?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {navigation}
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
        {children}
      </main>
    </>
  );
}
