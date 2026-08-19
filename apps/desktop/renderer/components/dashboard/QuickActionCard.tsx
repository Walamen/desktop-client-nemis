import Link from "next/link";
import { LucideIcon } from "lucide-react";

interface QuickActionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  variant?: "primary" | "secondary";
}

export default function QuickActionCard({
  title,
  description,
  icon: Icon,
  href,
  variant = "secondary",
}: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className={`block p-4  border-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${
        variant === "primary"
          ? "border-primary bg-primary/5 hover:border-primary/70"
          : "border-gray-200 bg-white hover:border-primary/50"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex-shrink-0 w-10 h-10  flex items-center justify-center ${
            variant === "primary"
              ? "bg-primary text-white"
              : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-neutral-dark mb-1">{title}s</h3>
          <p className="text-xs text-gray-600 line-clamp-2">{description}</p>
        </div>
      </div>
    </Link>
  );
}
