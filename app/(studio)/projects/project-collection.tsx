import Link from "next/link";
import { CalendarDays, Clock3 } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { LANGUAGE_LABELS, PROJECT_STATUS_LABELS, projectProgress } from "@/lib/ui/presentation";
import { ProjectCardActions } from "./project-card-actions";

export type ProjectCardData = Project & { thumbnailAssetId: string | null };

export function ProjectCollection({ rows }: { rows: ProjectCardData[] }) {
  return (
    <div className="video-grid">
      {rows.map((project) => (
        <article className="video-card" key={project.id}>
          <Link href={`/projects/${project.id}`} className="video-thumbnail">
            {project.thumbnailAssetId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${project.thumbnailAssetId}`} alt="" />
            ) : (
              <div className="project-thumb" aria-hidden="true" />
            )}
            <span className={`status-badge status-${project.status}`}>
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
          </Link>
          <div className="project-body">
            <Link href={`/projects/${project.id}`}>
              <h2 className="project-title">{project.title}</h2>
            </Link>
            <div className="video-meta">
              <span><CalendarDays size={14} />{new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(project.updatedAt)}</span>
              <span><Clock3 size={14} />{project.targetDuration}秒</span>
              <span>{LANGUAGE_LABELS[project.language]}</span>
            </div>
            {project.status !== "completed" && (
              <div className="compact-progress" aria-label={`制作進捗 ${projectProgress(project.status)}%`}>
                <span style={{ width: `${projectProgress(project.status)}%` }} />
              </div>
            )}
            <ProjectCardActions id={project.id} />
          </div>
        </article>
      ))}
    </div>
  );
}
