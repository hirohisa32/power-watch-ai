import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect((await getCurrentUser()) ? "/projects" : "/login");
}
