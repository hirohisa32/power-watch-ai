import type { Metadata } from "next";
import { NewProjectForm } from "./new-project-form";

export const metadata: Metadata = { title: "新しい動画を作る" };
export default function NewProjectPage() {
  return <main className="content wizard-page">
    <div className="page-head"><div><p className="eyebrow">新しい動画</p><h1>時計の物語を作る</h1><p className="lead">3つのステップに沿って入力してください。入力内容はこのブラウザへ自動保存されます。</p></div></div>
    <NewProjectForm />
  </main>;
}
