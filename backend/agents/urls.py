from django.urls import path

from agents.views import (
    AgentDetailView,
    AgentListView,
    AgentRunCreateView,
    AgentRunDetailView,
)

urlpatterns = [
    path("agents/", AgentListView.as_view(), name="agent-list"),
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
