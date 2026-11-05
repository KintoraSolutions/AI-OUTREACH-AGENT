import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Landing } from "@/components/marketing/landing";

export default async function Home() {
  const session = await auth();
  // Signed-in users go straight to the console; everyone else sees the landing.
  if (session?.user) redirect("/dashboard");
  return <Landing />;
}
