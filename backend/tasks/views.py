from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Task
from .serializers import TaskSerializer


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description']
    ordering_fields = ['created_at', 'due_date', 'priority', 'completed']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        completed = params.get('completed')
        if completed in ('true', 'false'):
            queryset = queryset.filter(completed=completed == 'true')

        priority = params.get('priority')
        if priority in dict(Task.PRIORITY_CHOICES):
            queryset = queryset.filter(priority=priority)

        return queryset

    @action(detail=False, methods=['delete'], url_path='clear-completed')
    def clear_completed(self, request):
        deleted, _ = Task.objects.filter(completed=True).delete()
        return Response({'deleted': deleted})