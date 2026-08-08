import { AllToolsCatalog } from "@/components/all-tools-catalog";
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-page";
import { WorkspaceContextPills } from "@/components/chat-routing";

export default async function ToolsPage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string }>;
}) {
  const category = (await searchParams)?.category;
  return (
    <WorkspacePage ariaLabel="Все инструменты Lumenza">
      <WorkspaceHeader
        title="All tools"
        description="Единый каталог рабочих инструментов для изображений, видео, аудио, редактирования и улучшения. Preview-возможности отмечены честно."
        actions={<WorkspaceContextPills />}
      />
      <AllToolsCatalog initialCategory={category} />
    </WorkspacePage>
  );
}
