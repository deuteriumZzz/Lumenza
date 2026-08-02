import { AllToolsCatalog } from "@/components/all-tools-catalog";
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-page";

export default async function ToolsPage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string }>;
}) {
  const category = (await searchParams)?.category;
  return (
    <WorkspacePage ariaLabel="Все инструменты Lumenza">
      <WorkspaceHeader
        eyebrow="Lumenza capability catalog"
        title="All Tools"
        description="Единый каталог рабочих инструментов для изображений, видео, аудио, редактирования и улучшения. Preview-возможности отмечены честно."
      />
      <AllToolsCatalog initialCategory={category} />
    </WorkspacePage>
  );
}
