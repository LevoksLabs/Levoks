import ProjectWorkplace from "@/components/ProjectWorkplace";

export const metadata = { title: "Workplace · Levoks" };

export default async function WorkplacePage({
  params,
}: {
  params: Promise<{ project_id: string }>;
}) {
  const { project_id } = await params;
  return <ProjectWorkplace projectId={project_id} />;
}
