import Link from "next/link";

export default function QuickStart() {
  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/10 to-transparent p-6">
      
      <p className="text-sm text-violet-300">
        QUICK START
      </p>

      <h2 className="mt-2 text-xl font-medium">
        What would you like to work on?
      </h2>

      <p className="mt-2 text-sm text-gray-500">
        Choose an agent above or start a new conversation.
      </p>

      <Link href="/agents/coding" className="mt-5 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-gray-200">
        Start a conversation
      </Link>

    </div>
  );
}
