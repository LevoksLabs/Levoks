import SharedWorkspace from "@/components/SharedWorkspace";
export default async function Page({
  params,
}: {
  params: Promise<{ owner_id: string; project_id: string }>;
}) {
  const { owner_id, project_id } = await params;
  return (
    <SharedWorkspace
      ownerId={decodeURIComponent(owner_id)}
      projectId={decodeURIComponent(project_id)}
    />
  );
}
