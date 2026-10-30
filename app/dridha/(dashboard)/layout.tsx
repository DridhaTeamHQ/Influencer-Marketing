import { Suspense } from "react";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser } from "@/lib/session";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* The login is only known at request time, so the role's tabs stream in. */}
      <Suspense fallback={<SiteNav user={null} />}>
        <SignedInNav />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}

async function SignedInNav() {
  const user = await getCurrentUser();
  return <SiteNav user={user && { name: user.name, email: user.email, role: user.role }} />;
}
