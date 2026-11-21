from django.contrib import admin
from django.db import DatabaseError, connections
from django.http import JsonResponse
from django.urls import path, include
from django.views.decorators.http import require_safe


@require_safe
def healthz(request):
    """Readiness endpoint used by Render and external uptime monitors."""
    try:
        connections['default'].cursor().close()
    except DatabaseError:
        return JsonResponse({'status': 'unavailable'}, status=503)
    return JsonResponse({'status': 'ok'})

urlpatterns = [
    # UptimeRobot is currently monitoring the service root with a HEAD request.
    # Serve the same readiness response there as well as at the explicit path.
    path('', healthz, name='root-health'),
    path('healthz/', healthz, name='healthz'),
    path('admin/', admin.site.urls),
    path('api/', include('tasks.urls')),
]
