import type { Metadata } from "next";
import { NewProjectForm } from "./new-project-form";

export const metadata: Metadata = { title: "新規プロジェクト" };
export default function NewProjectPage() {
  return (
    <main className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">New production</p>
          <h1>Create a story</h1>
          <p className="lead">
            台本と実物の時計画像を登録します。画像は複数アングルを用意すると、後の映像生成で再現性が高まります。
          </p>
        </div>
      </div>
      <NewProjectForm />
    </main>
  );
}
