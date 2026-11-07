import Link from "next/link";

type ProjectSection = "overview" | "storyboard" | "settings" | "completed";

export function ProjectSubnav({
  projectId,
  active,
  hasCompletedVideo,
}: {
  projectId: string;
  active: ProjectSection;
  hasCompletedVideo: boolean;
}) {
  const links = [
    { key: "overview", label: "概要", href: `/projects/${projectId}` },
    { key: "storyboard", label: "動画構成", href: `/projects/${projectId}/storyboard` },
    {
      key: "settings",
      label: "設定",
      href: `/projects/${projectId}?section=settings#project-settings`,
    },
    ...(hasCompletedVideo
      ? [
          {
            key: "completed",
            label: "完成動画",
            href: `/projects/${projectId}/storyboard?section=completed#completed-video`,
          },
        ]
      : []),
  ];

  return (
    <nav className="project-subnav" aria-label="動画詳細メニュー">
      <div>
        {links.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className={link.key === active ? "active" : undefined}
            aria-current={link.key === active ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <Link className="project-subnav-back" href="/videos">
        動画一覧へ戻る
      </Link>
    </nav>
  );
}
