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
        Перейти к основному содержимому
      </a>
      {navigation}
      <main id="main-content" tabIndex={-1} className="relative z-10 flex flex-1 flex-col">
        {children}
      </main>
    </>
  );
}
