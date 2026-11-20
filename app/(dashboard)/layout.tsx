import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="app-shell pb-16 text-white md:pb-0">
      <div className="flex min-h-screen">

        {/* Sidebar */}
        <Sidebar />

        {/* Main area */}
        <section className="min-w-0 flex-1">

          {/* Topbar */}
          <Topbar />

          {/* Page content */}
          {children}

        </section>

      </div>
    </main>
  );
}
