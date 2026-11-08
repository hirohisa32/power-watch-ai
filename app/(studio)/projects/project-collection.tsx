import Link from "next/link";
import { CalendarDays, Clock3 } from "lucide-react";
import type { Project } from "@/lib/db/schema";
import { LANGUAGE_LABELS } from "@/lib/ui/presentation";
import {
  type ProjectWorkflow,
  workflowIsProcessing,
  workflowStatusClass,
} from "@/lib/ui/project-workflow";
import { ProjectCardActions } from "./project-card-actions";
import { ProjectStatusRefresh } from "./project-status-refresh";

export type ProjectCardData = Project & {
  thumbnailAssetId: string | null;
  workflow: ProjectWorkflow;
};

export function ProjectCollection({ rows }: { rows: ProjectCardData[] }) {
  return (
    <>
      <ProjectStatusRefresh
        enabled={rows.some((project) => workflowIsProcessing(project.workflow))}
      />
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
              <span className={`status-badge status-${workflowStatusClass(project.workflow)}`}>
                {project.workflow.phase === "COMPLETED" ? "✓ " : ""}
                {project.workflow.label}
              </span>
            </Link>
            <div className="project-body">
              <Link href={`/projects/${project.id}`}>
                <h2 className="project-title">{project.title}</h2>
              </Link>
              <div className="video-meta">
                <span>
                  <CalendarDays size={14} />
                  {new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(
                    project.updatedAt,
                  )}
                </span>
                <span>
                  <Clock3 size={14} />
                  {project.targetDuration}秒
                </span>
                <span>{LANGUAGE_LABELS[project.language]}</span>
                {project.workflow.phase === "COMPLETED" && <span>100%</span>}
              </div>
              {workflowIsProcessing(project.workflow) && (
                <div
                  className="compact-progress"
                  aria-label={`制作進捗 ${project.workflow.progress}%`}
                >
                  <span style={{ width: `${project.workflow.progress}%` }} />
                </div>
              )}
              <ProjectCardActions
                id={project.id}
                completed={project.workflow.phase === "COMPLETED"}
              />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
