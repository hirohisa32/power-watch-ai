import { GET } from "@/app/api/projects/[id]/audit/route";

export default async function VerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const result = await GET(new Request("https://power-watch-ai.vercel.app/verification"), {
    params,
  });
  const audit = await result.json();

  return (
    <main className="content">
      <p className="eyebrow">Production E2E Verification</p>
      <h1>DB記録確認</h1>
      <pre>{JSON.stringify(audit, null, 2)}</pre>
    </main>
  );
}
