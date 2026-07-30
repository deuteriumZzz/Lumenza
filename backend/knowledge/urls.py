from django.urls import path

from knowledge.views import (
    SourceDetailView,
    SourceListView,
    WorkspaceDetailView,
    WorkspaceListCreateView,
    create_image_source,
    create_text_source,
    search_workspace_view,
)

urlpatterns = [
    path(
        "knowledge/workspaces/",
        WorkspaceListCreateView.as_view(),
        name="workspace-list",
    ),
    path(
        "knowledge/workspaces/<int:pk>/",
        WorkspaceDetailView.as_view(),
        name="workspace-detail",
    ),
    path(
        "knowledge/workspaces/<int:workspace_id>/sources/",
        SourceListView.as_view(),
        name="source-list",
    ),
    path(
        "knowledge/workspaces/<int:workspace_id>/sources/text/",
        create_text_source,
        name="create-text-source",
    ),
    path(
        "knowledge/workspaces/<int:workspace_id>/sources/image/",
        create_image_source,
        name="create-image-source",
    ),
    path(
        "knowledge/sources/<int:pk>/",
        SourceDetailView.as_view(),
        name="source-detail",
    ),
    path(
        "knowledge/workspaces/<int:workspace_id>/search/",
        search_workspace_view,
        name="knowledge-search",
    ),
]
