from django.urls import path

from agents.views import (
    AgentDetailView,
    AgentListView,
    AgentRunCreateView,
    AgentRunDetailView,
    CustomAgentDetailView,
    CustomAgentListCreateView,
    SwarmRunCreateView,
    SwarmRunDetailView,
)

urlpatterns = [
    path("agents/", AgentListView.as_view(), name="agent-list"),
    # Must be registered before agents/<slug:slug>/ — otherwise the
    # resolver matches "custom"/"swarms" as a slug and routes here to
    # AgentDetailView.
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
        "agents/swarms/",
        SwarmRunCreateView.as_view(),
        name="swarm-run-create",
    ),
    path(
        "agents/swarms/<int:pk>/",
        SwarmRunDetailView.as_view(),
        name="swarm-run-detail",
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
