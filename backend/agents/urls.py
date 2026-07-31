from django.urls import path

from agents.views import (
    AgentDetailView,
    AgentListView,
    AgentRunCreateView,
    AgentRunDetailView,
    CustomAgentDetailView,
    CustomAgentListCreateView,
)

urlpatterns = [
    path("agents/", AgentListView.as_view(), name="agent-list"),
    # Must be registered before agents/<slug:slug>/ — otherwise the
    # resolver matches "custom" as a slug and routes here to AgentDetailView.
    path(
        "agents/custom/",
        CustomAgentListCreateView.as_view(),
        name="custom-agent-list-create",
    ),
    path(
        "agents/custom/<slug:slug>/",
        CustomAgentDetailView.as_view(),
        name="custom-agent-detail",
    ),
    path(
        "agents/<slug:slug>/", AgentDetailView.as_view(), name="agent-detail"
    ),
    path(
        "agents/<slug:slug>/runs/",
        AgentRunCreateView.as_view(),
        name="agent-run-create",
    ),
    path(
        "agents/runs/<int:pk>/",
        AgentRunDetailView.as_view(),
        name="agent-run-detail",
    ),
]
