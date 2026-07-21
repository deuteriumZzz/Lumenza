import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: ({ children }) => <h1 className="mt-5 text-xl font-semibold text-ink first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 text-lg font-semibold text-ink first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 text-base font-semibold text-ink first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mt-3 whitespace-pre-wrap first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-primary pl-4 text-muted first:mt-0">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-bg p-3 font-mono text-xs leading-relaxed first:mt-0">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[0.9em] text-ink">
      {children}
    </code>
  ),
  a: ({ href, children, title }) => {
    const external = Boolean(href && /^https?:\/\//i.test(href));
    return (
      <a
        href={href}
        title={title}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="font-medium text-accent underline decoration-accent/50 underline-offset-2 hover:decoration-accent"
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto first:mt-0">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-surface-raised px-3 py-2 font-medium text-ink">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
  hr: () => <hr className="my-5 border-border" />,
};

export function MarkdownResponse({ content }: { content: string }) {
  return (
    <div className="max-w-[85%] break-words text-[15px] leading-relaxed text-ink">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={components}
        skipHtml
        disallowedElements={["img"]}
      >
        {content}
      </Markdown>
    </div>
  );
}
