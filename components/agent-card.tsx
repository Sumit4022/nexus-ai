import Link from "next/link";

type AgentCardProps = {
  href: string;
  name: string;
  description: string;
  icon: string;
};

export default function AgentCard({
  href,
  name,
  description,
  icon,
}: AgentCardProps) {
  return (
    <Link href={href} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:-translate-y-1 hover:border-violet-400/40 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">

      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-xl">
        {icon}
      </div>

      <h3 className="font-medium">
        {name}
      </h3>

      <p className="mt-2 text-sm leading-6 text-gray-500">
        {description}
      </p>

      <div className="mt-5 text-sm text-violet-400">
        Start →
      </div>

    </Link>
  );
}
