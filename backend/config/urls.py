from django.contrib import admin
from django.db import DatabaseError, connections
from django.http import JsonResponse
from django.urls import path, include


def healthz(request):
    """Readiness endpoint used by Render; it also verifies database access."""
    try:
        connections['default'].cursor().close()
    except DatabaseError:
        return JsonResponse({'status': 'unavailable'}, status=503)
    return JsonResponse({'status': 'ok'})

urlpatterns = [
    path('healthz/', healthz, name='healthz'),
    path('admin/', admin.site.urls),
    path('api/', include('tasks.urls')),
]
