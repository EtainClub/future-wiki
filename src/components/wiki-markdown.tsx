import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function WikiMarkdown({ children }: { children: string }) {
  return (
    <div className="wiki-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
