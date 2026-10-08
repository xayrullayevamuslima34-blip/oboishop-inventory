export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`} {...props} />;
}

export function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`border-b border-slate-200 px-5 py-4 ${className}`} {...props} />;
}

export function CardBody({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`px-5 py-4 ${className}`} {...props} />;
}
